"use strict";

/* =========================================================
   BP9 — PASSKEY SIGN-IN + REGISTRATION (adapter)

   Real js/auth/passkeys.js against a stub Supabase client.
   No real navigator.credentials, no network.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPasskeyEnv } = require("./helpers/passkey-harness.js");

const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));


/* ================================================================
   SIGN IN
   ================================================================ */

test("release DISABLED -> signIn makes ZERO passkey API calls", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    const res = await env.P.signIn();
    assert.deepEqual(plain(res), { ok: false, code: "disabled" });
    assert.equal(env.supa.calls.length, 0);
});

test("unconfigured / recovery / auth-error -> ZERO passkey calls even when enabled", async () => {
    for (const patch of [
        { auth: { configured: false } },
        { auth: { recoveryMode: true } },
        { auth: { status: "error" } }
    ]) {
        const env = createPasskeyEnv(Object.assign({ webAuthnSupported: true }, patch));
        env.enable();
        await env.P.signIn();
        assert.equal(env.supa.calls.length, 0, JSON.stringify(patch));
    }
});

test("signed-out IS a valid passkey sign-in path (passwordless first factor)", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true, auth: { status: "signed_out" } });
    env.enable();
    env.supa.set("signInWithPasskey", { data: { session: { user: { id: "u" } } }, error: null });
    const res = await env.P.signIn();
    assert.equal(res.ok, true);
    assert.deepEqual(env.supa.calls, ["signInWithPasskey"]);
});

test("unsupported browser -> signIn returns 'unsupported', ZERO calls", async () => {
    const env = createPasskeyEnv({ webauthn: () => ({ webAuthnSupported: false, secureContext: true }) });
    env.enable();
    const res = await env.P.signIn();
    assert.equal(res.code, "unsupported");
    assert.equal(env.supa.calls.length, 0);
});

test("signIn reuses the existing Supabase client and calls signInWithPasskey exactly once", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    env.supa.set("signInWithPasskey", { data: { session: { user: { id: "u" } } }, error: null });
    const res = await env.P.signIn();
    assert.deepEqual(plain(res), { ok: true });
    assert.deepEqual(env.supa.calls, ["signInWithPasskey"]);
});

test("signIn does NOT ask for an email first (discoverable credential)", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    assert.ok(!/prompt\(|getElementById\(['"]?.*email/.test(src), "no email prompt in the adapter");
    assert.ok(/signInWithPasskey\(\)/.test(src), "calls signInWithPasskey with no email argument");
});

test("signIn success does NOT create a session itself — the auth pipeline handles it", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/setSession|persistSession|localStorage\.setItem/.test(strip), "no manual session write");
    assert.ok(!/mwallet\.passkey\.session/.test(src), "no passkey session key");
});

test("cancelled ceremony -> user_cancelled (not a scary error, no stack)", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    env.supa.set("signInWithPasskey", { data: null, error: { name: "NotAllowedError", message: "The operation either timed out or was not allowed." } });
    const res = await env.P.signIn();
    assert.equal(res.code, "user_cancelled");
    assert.deepEqual(Object.keys(plain(res)).sort(), ["code", "ok"]);
});

test("network failure -> network_error; project-not-enabled -> project_not_enabled", async () => {
    const cases = [
        [{ name: "TypeError", message: "Failed to fetch" }, "network_error"],
        [{ message: "the passkey API is experimental and disabled by default" }, "project_not_enabled"],
        [{ status: 404, message: "Not Found" }, "project_not_enabled"],
        [{ status: 401, message: "invalid JWT" }, "auth_failed"]
    ];
    for (const [rawErr, expected] of cases) {
        const env = createPasskeyEnv({ webAuthnSupported: true });
        env.enable();
        env.supa.set("signInWithPasskey", { data: null, error: rawErr });
        const res = await env.P.signIn();
        assert.equal(res.code, expected, JSON.stringify(rawErr));
        assert.ok(!JSON.stringify(res).includes(rawErr.message || "zzz"), "raw message not leaked");
    }
});

test("duplicate signIn while busy is suppressed", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    let resolveInner;
    env.supa.set("signInWithPasskey", () => new Promise((r) => { resolveInner = () => r({ data: {}, error: null }); }));
    const p1 = env.P.signIn();
    const p2 = env.P.signIn();
    const r2 = await p2;
    assert.equal(r2.code, "busy");
    resolveInner();
    await p1;
    assert.equal(env.supa.calls.filter((c) => c === "signInWithPasskey").length, 1);
});

test("signIn returns a safe result — never a raw credential / session / token", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    env.supa.set("signInWithPasskey", { data: { session: { access_token: "SECRET", user: { id: "u" } }, credential: { rawId: "AAAA" } }, error: null });
    const res = await env.P.signIn();
    assert.deepEqual(plain(res), { ok: true });
    assert.ok(!JSON.stringify(res).includes("SECRET"));
    assert.ok(!JSON.stringify(res).includes("rawId"));
});

test("the adapter writes NO localStorage / sessionStorage of any kind", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/localStorage|sessionStorage|\.setItem\s*\(|\.getItem\s*\(/.test(strip));
});


/* ================================================================
   REGISTRATION
   ================================================================ */

test("signed-out / unconfirmed / anonymous / recovery / disabled / unsupported cannot register", async () => {
    const blocked = [
        [{ auth: { status: "signed_out" } }, true, "signed_out"],
        [{ auth: { user: { id: "u", email: "a@b.com", confirmed: false, isAnonymous: false } } }, true, "not_confirmed"],
        [{ auth: { user: { id: "u", email: "a@b.com", confirmed: true, isAnonymous: true } } }, true, "anonymous"],
        [{ auth: { recoveryMode: true } }, true, "recovery_mode"],
        [{}, false, "disabled"],   /* release not enabled */
        [{ webauthn: () => ({ webAuthnSupported: false, secureContext: true }) }, true, "unsupported"]
    ];
    for (const [patch, enable, code] of blocked) {
        const env = createPasskeyEnv(Object.assign({ webAuthnSupported: true }, patch));
        if (enable) { env.enable(); }
        const res = await env.P.register();
        assert.equal(res.code, code, JSON.stringify(patch));
        assert.equal(env.supa.calls.length, 0, "no registerPasskey call: " + code);
    }
});

test("register calls registerPasskey exactly once and refreshes the list on success", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    env.supa.set("registerPasskey", { data: { id: "pk1" }, error: null });
    env.supa.set("passkey.list", { data: { passkeys: [{ id: "pk1", friendly_name: "New", created_at: "2026-08-01T00:00:00Z" }] }, error: null });
    const res = await env.P.register("Adam's MacBook");
    assert.equal(res.ok, true);
    assert.ok(env.supa.calls.some((c) => c.startsWith("registerPasskey")));
    assert.ok(env.supa.calls.includes("passkey.list"), "list refreshed");
    assert.equal(env.supa.calls.filter((c) => c.startsWith("registerPasskey")).length, 1);
    assert.equal(env.P.getState().registeredCount, 1);
});

test("register cancel is safe; register failure leaves session/account untouched", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    env.supa.set("registerPasskey", { data: null, error: { name: "NotAllowedError", message: "cancelled" } });
    const res = await env.P.register();
    assert.equal(res.code, "user_cancelled");
    /* no list refresh on failure, no session write anywhere */
    assert.ok(!env.supa.calls.includes("passkey.list"));
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    assert.ok(!/signOut|clearSession/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")));
});

test("an invalid friendly name is rejected before any API call", async () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    const res = await env.P.register("   ");
    assert.equal(res.code, "invalid_name");
    assert.equal(env.supa.calls.length, 0);
});

test("no automatic registration exists (source-level)", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    /* register() is only reachable via the exported method — never auto-invoked
       on load, on SIGNED_IN, or after signup */
    assert.ok(!/on(AuthStateChange|SignedIn|Signup)[\s\S]{0,120}register/.test(strip));
    assert.ok(!/register\(\)[\s\S]{0,40}(DOMContentLoaded|addEventListener)/.test(strip));
});

test("the adapter never CALLS navigator.credentials — the Supabase high-level API owns the ceremony", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/navigator\.credentials\.(create|get)\s*\(/.test(strip), "no navigator.credentials.create()/get() call");
    /* a typeof feature-detection read is fine; a manual ceremony is not */
    assert.ok(!/PublicKeyCredential[\s\S]{0,60}\.create\s*\(/.test(strip), "no manual PublicKeyCredential ceremony");
    assert.ok(/signInWithPasskey|registerPasskey/.test(strip), "uses the high-level Supabase methods");
});
