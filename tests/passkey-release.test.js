"use strict";

/* =========================================================
   BP9 — PASSKEY RELEASE GATE

   Mirrors the hardened BP8 sync-release pattern: ships
   disabled, no production enable path, test-only override.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/auth/passkey-release.js"), "utf8");

function load(preEnv) {
    const sandbox = { window: {}, console };
    sandbox.self = sandbox.window;
    if (preEnv) { sandbox.__MWALLET_TEST_ENV__ = true; sandbox.window.__MWALLET_TEST_ENV__ = true; }
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: "passkey-release.js" });
    return { R: sandbox.window.MWalletPasskeyRelease, sandbox };
}


test("committed production default is DISABLED, phase BP12", () => {
    const { R } = load(false);
    assert.equal(R.isEnabled(), false);
    assert.deepEqual(JSON.parse(JSON.stringify(R.COMMITTED_DEFAULT)),
        { enabled: false, verificationPhase: "BP12" });
    const st = JSON.parse(JSON.stringify(R.getState()));
    assert.equal(st.enabled, false);
    assert.equal(st.verificationPhase, "BP12");
    assert.equal(st.reason, "production_rp_verification_pending");
});

test("a NORMAL browser build exposes NO enable override", () => {
    const { R, sandbox } = load(false);
    assert.equal(typeof R.setOverride, "undefined");
    assert.ok(!("__testEnv" in R));
    /* setting the flag AFTER load is too late */
    sandbox.window.__MWALLET_TEST_ENV__ = true;
    assert.equal(typeof R.setOverride, "undefined");
    assert.equal(R.isEnabled(), false);
});

test("the source has no query-string / localStorage / hostname / Settings enable switch", () => {
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/location\.search|URLSearchParams|location\.hostname|localhost|127\.0\.0\.1/.test(code));
    assert.ok(!/localStorage|sessionStorage/.test(code));
    assert.ok(!/data-set-action|querySelector|getElementById/.test(code), "no Settings switch");
    assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.|sb_secret_|service_role/.test(SRC), "no credential");
    assert.ok(!/rp[_ ]?id|relying.?party/i.test(code), "no RP ID in JS");
});

test("under the pre-load test opt-in, the engine can be exercised — but still starts off", () => {
    const { R } = load(true);
    assert.equal(typeof R.setOverride, "function");
    assert.equal(R.__testEnv, true);
    assert.equal(R.isEnabled(), false, "still off until explicitly overridden");
    R.setOverride({ enabled: true });
    assert.equal(R.isEnabled(), true);
    R.setOverride({ enabled: "yes" });   /* only a real boolean true enables */
    assert.equal(R.isEnabled(), false);
    R.setOverride(null);
    assert.equal(R.isEnabled(), false);
});

test("the BP8 sync release gate is a SEPARATE switch and stays false regardless", () => {
    const syncSrc = fs.readFileSync(path.join(ROOT, "js/sync/sync-release.js"), "utf8");
    const sandbox = { window: {}, console };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(syncSrc, sandbox, { filename: "sync-release.js" });
    vm.runInContext(SRC, sandbox, { filename: "passkey-release.js" });
    /* even if a test env enables passkeys, sync stays off (independent) */
    assert.equal(sandbox.window.MWalletSyncRelease.isEnabled(), false);
    assert.equal(sandbox.window.MWalletPasskeyRelease.isEnabled(), false);
});

test("no js/ file turns passkeys on itself", () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { return walk(full); }
        return e.isFile() && e.name.endsWith(".js") ? [full] : [];
    });
    for (const file of walk(path.join(ROOT, "js"))) {
        const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        assert.ok(!/MWalletPasskeyRelease\.setOverride\s*\(\s*\{\s*enabled:\s*true/.test(src),
            path.relative(ROOT, file) + " never enables passkeys");
    }
});
