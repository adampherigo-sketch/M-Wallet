"use strict";

/* =========================================================
   BP4 SECURITY HARDENING — FAIL-CLOSED OWNERSHIP GATE

   The financial application must NEVER become interactive for
   a configured + signed-in user unless local ownership is
   POSITIVELY verified. A missing / throwing / undefined /
   malformed ownership guard, or a missing migration module,
   must all leave the app blocked (inert + aria-hidden) behind
   a safe fallback — never blank, never the financial UI.

   Loads the real js/auth/auth-ui.js (+ auth.js for the
   snapshot shape) into a node:vm sandbox with the DOM stub.
   The auth snapshot is driven directly so every gate path can
   be exercised in isolation.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { buildAuthDom } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");
const AUTH_UI_SRC = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");
const MIGRATION_SRC = fs.readFileSync(path.join(ROOT, "js/migration/local-user-migration.js"), "utf8");

function flush() { return new Promise((r) => setTimeout(r, 5)); }

function signedInSnap() {
    return { configured: true, status: "signed_in", recoveryMode: false, user: { id: "u1", email: "u1@example.com" }, session: { userId: "u1" } };
}
function unconfiguredSnap() {
    return { configured: false, status: "unconfigured", recoveryMode: false, user: null, session: null };
}
function recoverySnap() {
    return { configured: true, status: "signed_in", recoveryMode: true, user: { id: "u1", email: "u1@example.com" }, session: { userId: "u1" } };
}
function signedOutSnap() {
    return { configured: true, status: "signed_out", recoveryMode: false, user: null, session: null };
}

/* an auth-ui environment with a directly-driven auth snapshot */
function makeEnv(options) {
    options = options || {};
    const dom = buildAuthDom();

    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    const consoleLines = [];
    const rec = (l) => (...a) => consoleLines.push(l + ": " + a.map(String).join(" "));
    sandbox.console = { info: rec("i"), warn: rec("w"), error: rec("e"), log: rec("l"), debug: rec("d") };
    sandbox.setTimeout = setTimeout;
    sandbox.document = dom.document;
    dom.document.readyState = "complete";

    let snap = options.auth || unconfiguredSnap();
    const subs = [];
    let signOutCalls = 0;
    sandbox.MWalletAuth = {
        getState: () => snap,
        subscribe: (fn) => { subs.push(fn); try { fn(snap); } catch (e) {} return () => {}; },
        signOut: () => { signOutCalls += 1; snap = signedOutSnap(); subs.slice().forEach((f) => f(snap)); return Promise.resolve({ ok: true }); }
    };

    let reloadCalls = 0;
    sandbox.location = { reload: () => { reloadCalls += 1; } };

    /* optionally load the real migration service (for the
       "module present" cases) */
    if (options.withMigrationService) {
        sandbox.localStorage = options.localStorage || {
            getItem: () => null, setItem: () => {}, removeItem: () => {},
            key: () => null, get length() { return 0; }
        };
    }

    vm.createContext(sandbox);
    vm.runInContext(AUTH_UI_SRC, sandbox, { filename: "auth-ui.js" });
    if (options.withMigrationService) {
        vm.runInContext(MIGRATION_SRC, sandbox, { filename: "local-user-migration.js" });
    }

    const ui = sandbox.MWalletAuthUI;

    return {
        sandbox, dom, ui,
        consoleText: () => consoleLines.join("\n"),
        signOutCalls: () => signOutCalls,
        reloadCalls: () => reloadCalls,
        setAuth: (s) => { snap = s; subs.slice().forEach((f) => f(s)); },
        render: () => ui.renderState(),
        appInert: () => dom.app.inert === true,
        appAriaHidden: () => dom.app.getAttribute("aria-hidden") === "true",
        fallbackVisible: () => dom.view("ownership-hold") && dom.view("ownership-hold").hidden === false,
        financialTextExposed: () => {
            /* .app is inert+aria-hidden; assert no descendant text leaks */
            return dom.app.inert !== true || dom.app.getAttribute("aria-hidden") !== "true";
        }
    };
}

function assertBlocked(env, msg) {
    assert.equal(env.appInert(), true, (msg || "") + " — app must be inert");
    assert.equal(env.appAriaHidden(), true, (msg || "") + " — app must be aria-hidden");
}


/* =====================================================
   NO GUARD  /  NO MIGRATION MODULE
   ===================================================== */

test("configured + signed_in + NO ownership guard -> blocked + fallback", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.init(env.sandbox.document);
    await flush();
    assertBlocked(env, "no guard");
    assert.equal(env.fallbackVisible(), true, "built-in fallback view is shown");
    assert.equal(env.dom.gate.hidden, false);
});

test("configured + signed_in + migration module entirely absent -> blocked + fallback (never blank, never financial app)", async () => {
    const env = makeEnv({ auth: signedInSnap() });        // no withMigrationService
    env.ui.init(env.sandbox.document);
    await flush();
    assert.equal(env.sandbox.MWalletLocalMigration, undefined, "no migration module");
    assertBlocked(env, "migration absent");
    assert.equal(env.fallbackVisible(), true);
    /* fallback has working Retry + Sign Out */
    assert.ok(env.dom.gate.querySelector('[data-auth-action="ownership-retry"]'));
    assert.ok(env.dom.gate.querySelector('[data-auth-action="ownership-signout"]'));
});

test("fallback Sign Out works without the migration module", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.init(env.sandbox.document);
    await flush();
    env.dom.gate.querySelector('[data-auth-action="ownership-signout"]').dispatch("click");
    await flush();
    assert.equal(env.signOutCalls(), 1);
});

test("fallback Retry reloads when the migration module is absent", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.init(env.sandbox.document);
    await flush();
    env.dom.gate.querySelector('[data-auth-action="ownership-retry"]').dispatch("click");
    await flush();
    assert.equal(env.reloadCalls(), 1);
});


/* =====================================================
   GUARD FAILURE MODES  (all must stay blocked)
   ===================================================== */

const BAD_GUARDS = {
    "throws": function () { throw new Error("guard blew up"); },
    "returns undefined": function () { return undefined; },
    "returns null": function () { return null; },
    "returns a string": function () { return "release"; },
    "returns a number": function () { return 1; },
    "returns true (not an object)": function () { return true; },
    "returns {} (no release key)": function () { return {}; },
    "returns { hold: false } (old contract)": function () { return { hold: false }; },
    "returns { release: 'true' } (string)": function () { return { release: "true" }; },
    "returns { release: 1 } (number)": function () { return { release: 1 }; },
    "returns { release: false }": function () { return { release: false }; }
};

Object.keys(BAD_GUARDS).forEach((label) => {
    test("guard " + label + " -> app stays blocked", async () => {
        const env = makeEnv({ auth: signedInSnap() });
        env.ui.setPostAuthGuard(BAD_GUARDS[label]);
        env.ui.init(env.sandbox.document);
        await flush();
        assertBlocked(env, label);
        assert.equal(env.fallbackVisible(), true);
    });
});

test("ONLY an exact { release: true } opens the app", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.setPostAuthGuard(function () { return { release: true }; });
    env.ui.init(env.sandbox.document);
    await flush();
    assert.equal(env.appInert(), false, "app is interactive");
    assert.equal(env.appAriaHidden(), false);
    assert.equal(env.dom.gate.hidden, true);
});


/* =====================================================
   TRANSITIONS  /  NO FLASH
   ===================================================== */

test("late guard registration cannot produce a financial-data flash", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.init(env.sandbox.document);
    await flush();
    assertBlocked(env, "before guard");                 // held from the start

    /* guard registers late and would release */
    env.ui.setPostAuthGuard(function () { return { release: true }; });
    /* nothing re-renders yet -> still blocked (no transient allow) */
    assertBlocked(env, "guard registered, no re-render");

    env.render();                                       // explicit re-check
    assert.equal(env.appInert(), false, "now released");
});

test("guard flips release:true -> release:false again re-blocks the app", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    let release = true;
    env.ui.setPostAuthGuard(function () { return { release: release }; });
    env.ui.init(env.sandbox.document);
    await flush();
    assert.equal(env.appInert(), false);

    release = false;                                    // e.g. account switched
    env.render();
    assertBlocked(env, "re-blocked");
});

test("owner mismatch (guard never releases) stays blocked even across re-renders", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.setPostAuthGuard(function () { return { release: false }; }); // mismatch/needs_claim/error all look like this to auth-ui
    env.ui.init(env.sandbox.document);
    await flush();
    env.render(); env.render(); env.render();
    assertBlocked(env, "mismatch");
});

test("migration UI presenting its own screen -> auth-ui hides its fallback but keeps the app blocked", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.setPostAuthGuard(function () { return { release: false }; });
    env.ui.init(env.sandbox.document);
    await flush();
    assert.equal(env.fallbackVisible(), true);

    env.ui.setOwnershipScreenActive(true);              // migration-ui says "I've got the screen"
    env.render();
    assert.equal(env.fallbackVisible(), false, "auth-ui yields its fallback");
    assert.equal(env.dom.gate.hidden, true, "auth gate hidden");
    assertBlocked(env, "migration presenting");         // app STILL blocked
});


/* =====================================================
   PRESERVED BEHAVIOUR
   ===================================================== */

test("auth UNCONFIGURED still allows local developer mode (guard bypassed)", async () => {
    const env = makeEnv({ auth: unconfiguredSnap() });
    env.ui.setPostAuthGuard(function () { return { release: false }; }); // even a denying guard
    env.ui.init(env.sandbox.document);
    await flush();
    assert.equal(env.appInert(), false, "developer is not locked out");
    assert.equal(env.dom.gate.hidden, true);
});

test("password recovery still takes precedence over the ownership gate", async () => {
    const env = makeEnv({ auth: recoverySnap() });
    env.ui.setPostAuthGuard(function () { return { release: false }; });
    env.ui.init(env.sandbox.document);
    await flush();
    assert.equal(env.dom.view("recovery").hidden, false, "recovery view shown");
    assert.equal(env.dom.view("ownership-hold").hidden, true, "not the ownership fallback");
    assertBlocked(env, "recovery");
});

test("signed_out shows the auth gateway, not the ownership fallback", async () => {
    const env = makeEnv({ auth: signedOutSnap() });
    env.ui.setPostAuthGuard(function () { return { release: false }; });
    env.ui.init(env.sandbox.document);
    await flush();
    assert.equal(env.dom.view("welcome").hidden, false);
    assert.equal(env.dom.view("ownership-hold").hidden, true);
});


/* =====================================================
   WITH THE REAL MIGRATION SERVICE
   ===================================================== */

test("real migration service: no owner + no meaningful data (fresh) -> guard releases, app opens", async () => {
    const store = { "mwallet.auth.config": "" };
    const localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
    };
    const env = makeEnv({ auth: signedInSnap(), withMigrationService: true, localStorage });
    env.sandbox.MWalletLocalMigration.initialize();
    env.ui.init(env.sandbox.document);
    env.render();
    await flush();
    assert.equal(env.sandbox.MWalletLocalMigration.getStatus(), "fresh_claimed");
    assert.equal(env.appInert(), false, "fresh user's app opens");
    /* migration wrote ONLY the owner key */
    assert.ok("mwallet.local.owner.v1" in store);
    assert.ok(!("mWalletData" in store), "mWalletData never created by migration");
});

test("real migration service: corrupt mWalletData -> error, guard never releases, app blocked", async () => {
    const store = { "mWalletData": "<<<corrupt>>>" };
    const localStorage = {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
    };
    const env = makeEnv({ auth: signedInSnap(), withMigrationService: true, localStorage });
    env.sandbox.MWalletLocalMigration.initialize();
    env.ui.init(env.sandbox.document);
    env.render();
    await flush();
    assert.equal(env.sandbox.MWalletLocalMigration.getStatus(), "error");
    assertBlocked(env, "corrupt data");
    assert.equal(store["mWalletData"], "<<<corrupt>>>", "corrupt data left untouched");
    assert.ok(!("mwallet.local.owner.v1" in store), "no ownership claimed over corrupt data");
});


/* =====================================================
   NO FINANCIAL CONTENT / SECRETS LEAK IN ANY HOLD STATE
   ===================================================== */

test("held-for-ownership state exposes no owner id / email / token / financial text to AT", async () => {
    const env = makeEnv({ auth: signedInSnap() });
    env.ui.setPostAuthGuard(function () { return { release: false }; });
    env.ui.init(env.sandbox.document);
    await flush();

    /* the financial app root is inert + aria-hidden in every hold path */
    assertBlocked(env, "hold");
    const gateText = collectText(env.dom.gate).join(" ");
    assert.ok(!/u1@example\.com|access_token|refresh_token|\bu1\b/.test(gateText),
        "no email / token / user id in the gate");
    assert.ok(!/\$|balance|transaction|merchant/i.test(gateText), "no financial words in the fallback");
    assert.ok(!/u1@example\.com|access_token/.test(env.consoleText()), "nothing sensitive logged");
});

function collectText(node, acc) {
    acc = acc || [];
    if (node.textContent && (!node.children || node.children.length === 0)) { acc.push(node.textContent); }
    (node.children || []).forEach((c) => collectText(c, acc));
    return acc;
}
