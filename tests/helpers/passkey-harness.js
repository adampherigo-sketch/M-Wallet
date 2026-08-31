"use strict";

/* =========================================================
   BP9 test helper — a deterministic stand-in for the Supabase
   passkey API + MWalletAuth, loaded into a node:vm sandbox
   with the real js/auth/passkey-release.js + passkeys.js
   (+ optionally passkey-ui.js).

   No real navigator.credentials, no real network.
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const RELEASE_SRC = read("js/auth/passkey-release.js");
const ADAPTER_SRC = read("js/auth/passkeys.js");
const UI_SRC = read("js/auth/passkey-ui.js");

function makeSupabaseAuthStub() {
    const calls = [];
    const queue = [];        /* { data, error } responses, FIFO */
    const state = { passkeys: [] };

    function next(opName) {
        calls.push(opName);
        if (queue.length) { return Promise.resolve(queue.shift()); }
        return Promise.resolve({ data: null, error: null });
    }

    const auth = {
        signInWithPasskey: (opts) => { calls.push("signInWithPasskey"); return respondFor("signInWithPasskey"); },
        registerPasskey: (opts) => { calls.push("registerPasskey:" + JSON.stringify(opts || null)); return respondFor("registerPasskey"); },
        passkey: {
            list: () => { calls.push("passkey.list"); return listResponse(); },
            update: (arg) => { calls.push("passkey.update:" + JSON.stringify(arg || null)); return respondFor("passkey.update"); },
            delete: (arg) => { calls.push("passkey.delete:" + JSON.stringify(arg || null)); return respondFor("passkey.delete"); }
        }
    };

    const responses = {};   /* opName -> { data, error } | fn */

    function respondFor(op) {
        const r = responses[op];
        if (typeof r === "function") { return Promise.resolve(r()); }
        if (r) { return Promise.resolve(r); }
        return Promise.resolve({ data: { ok: true }, error: null });
    }
    function listResponse() {
        const r = responses["passkey.list"];
        if (typeof r === "function") { return Promise.resolve(r()); }
        if (r) { return Promise.resolve(r); }
        return Promise.resolve({ data: { passkeys: state.passkeys.slice() }, error: null });
    }

    return {
        auth,
        calls,
        state,
        set(op, response) { responses[op] = response; },
        reset() { calls.length = 0; }
    };
}

function createPasskeyEnv(options) {
    options = options || {};
    const testEnv = options.testEnv !== false;   /* default: expose setOverride */
    const supa = makeSupabaseAuthStub();

    /* mutable auth facts the stub reports */
    const authFacts = Object.assign({
        configured: true,
        status: "signed_in",
        recoveryMode: false,
        user: { id: "user-1", email: "a@example.com", confirmed: true, isAnonymous: false }
    }, options.auth || {});

    const authApi = {
        getState: () => ({
            configured: authFacts.configured,
            status: authFacts.status,
            recoveryMode: authFacts.recoveryMode,
            user: authFacts.user ? Object.assign({}, authFacts.user) : null
        }),
        isAuthenticated: () => authFacts.status === "signed_in",
        subscribe: (fn) => { authApi._sub = fn; return () => {}; },
        _getClient: () => (options.noClient ? null : { auth: supa.auth })
    };

    const sandbox = {
        window: {}, console,
        navigator: options.navigator || { credentials: { create: function () {}, get: function () {} } },
        PublicKeyCredential: options.publicKeyCredential !== undefined
            ? options.publicKeyCredential : function () {},
        isSecureContext: options.isSecureContext !== undefined ? options.isSecureContext : true,
        setTimeout, clearTimeout, Promise, JSON, Date, Math, Object, Array, String, Number
    };
    sandbox.self = sandbox.window;
    if (testEnv) {
        sandbox.__MWALLET_TEST_ENV__ = true;
        sandbox.window.__MWALLET_TEST_ENV__ = true;
    }
    sandbox.window.MWalletAuth = authApi;
    if (options.webAuthnProbe) { /* set after load via configureForTest */ }

    vm.createContext(sandbox);
    vm.runInContext(RELEASE_SRC, sandbox, { filename: "passkey-release.js" });
    vm.runInContext(ADAPTER_SRC, sandbox, { filename: "passkeys.js" });
    if (options.withUi) { vm.runInContext(UI_SRC, sandbox, { filename: "passkey-ui.js" }); }

    const P = sandbox.window.MWalletPasskeys;
    const R = sandbox.window.MWalletPasskeyRelease;

    /* deterministic capability probe unless the test overrides */
    P.configureForTest({
        webauthn: options.webauthn || (() => ({
            webAuthnSupported: options.webAuthnSupported !== false,
            secureContext: options.secureContext !== false,
            platformAuthenticatorHint: null
        }))
    });

    return {
        sandbox, P, R, supa, authFacts, authApi,
        enable() { if (R.setOverride) { R.setOverride({ enabled: true }); } },
        disable() { if (R.setOverride) { R.setOverride(null); } }
    };
}

module.exports = { createPasskeyEnv, makeSupabaseAuthStub, RELEASE_SRC, ADAPTER_SRC, UI_SRC };
