"use strict";

/* =========================================================
   BP3 — LOCAL FINANCIAL DATA SAFETY

   Auth (BP2 architecture + BP3 account actions) must never
   read, write, clear, or migrate the financial store
   (localStorage["mWalletData"]). These tests:

     1. statically assert the auth source never names the
        financial store / storage globals, and
     2. functionally run every account action against a
        localStorage stub seeded with mWalletData and assert
        the key is byte-identical afterwards and was never a
        setItem / removeItem target.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

const AUTH_SOURCE = [
    "js/auth/auth-config.js",
    "js/auth/auth-client.js",
    "js/auth/auth.js",
    "js/auth/auth-ui.js"
];

const FINANCIAL_BLOB = JSON.stringify({
    version: 5,
    checking: { name: "Checking", balance: 123456 },
    income: [{ id: "i1", source: "Salary", amount: 4200 }],
    expenses: [{ id: "e1", merchant: "Market", amount: 8755 }],
    _marker: "do-not-touch"
});

const PUBLISHABLE_KEY = "sb_publishable_" + "SafetyExampleABCDEFGHIJKLMNOPQRSTUVWXYZ012345";


test("auth source never references the financial store or its storage globals", () => {
    for (const file of AUTH_SOURCE) {
        const src = fs.readFileSync(path.join(ROOT, file), "utf8");
        // strip block + line comments so the doc note about mWalletData
        // ("kept clear of financial data (localStorage['mWalletData'])")
        // does not trip the check
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/(^|[^:])\/\/.*$/gm, "$1");

        assert.ok(!/mWalletData/.test(code), file + " must not name the financial store");
        assert.ok(!/MWalletStorage|BudgetStorage|BudgetApp|MWalletApp/.test(code),
            file + " must not touch a financial global");
        assert.ok(!/budgetTrackerData|mWalletMoneyEntries/.test(code),
            file + " must not name legacy financial keys");
    }
});


function makeEnv(options) {
    options = options || {};
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.console = { info() {}, warn() {}, error() {}, log() {}, debug() {} };
    sandbox.atob = (s) => Buffer.from(s, "base64").toString("binary");
    sandbox.Buffer = Buffer;
    sandbox.setTimeout = setTimeout;
    sandbox.navigator = { onLine: true };
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};

    const writes = [];
    const removes = [];
    const store = {
        mWalletData: FINANCIAL_BLOB,
        "mwallet.auth.config": JSON.stringify({ supabaseUrl: "https://demoref.supabase.co", supabaseKey: PUBLISHABLE_KEY })
    };
    sandbox.localStorage = {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { writes.push(k); store[k] = String(v); },
        removeItem: (k) => { removes.push(k); delete store[k]; },
        _store: store
    };

    let lastCb = null;
    const ok = () => Promise.resolve({ data: { user: { email: "person@example.com" }, session: null }, error: null });
    sandbox.supabase = {
        createClient() {
            return {
                auth: {
                    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
                    onAuthStateChange: (cb) => { lastCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
                    signOut: () => Promise.resolve({ error: null }),
                    signUp: ok,
                    signInWithPassword: () => Promise.resolve({ data: { user: { email: "person@example.com" }, session: { user: { id: "u1", email: "person@example.com" } } }, error: null }),
                    resetPasswordForEmail: () => Promise.resolve({ data: {}, error: null }),
                    updateUser: () => Promise.resolve({ data: { user: { email: "person@example.com" } }, error: null }),
                    resend: () => Promise.resolve({ data: {}, error: null })
                }
            };
        }
    };

    vm.createContext(sandbox);
    ["js/auth/auth-config.js", "js/auth/auth-client.js", "js/auth/auth.js", "js/auth/auth-ui.js"].forEach((f) => {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
    });

    return {
        auth: sandbox.MWalletAuth,
        store,
        writes,
        removes,
        fireEvent: (e, s) => { if (lastCb) { lastCb(e, s); } }
    };
}


test("configuration resolves from localStorage but the financial key is untouched", async () => {
    const env = makeEnv();
    await env.auth.initialize();
    assert.equal(env.auth.isConfigured(), true);
    assert.equal(env.store.mWalletData, FINANCIAL_BLOB);
    assert.ok(!env.writes.includes("mWalletData"));
    assert.ok(!env.removes.includes("mWalletData"));
});

test("signUp does not mutate mWalletData", async () => {
    const env = makeEnv();
    await env.auth.initialize();
    await env.auth.signUp("person@example.com", "a-good-password");
    assert.equal(env.store.mWalletData, FINANCIAL_BLOB);
    assert.ok(!env.writes.includes("mWalletData") && !env.removes.includes("mWalletData"));
});

test("signIn does not mutate mWalletData", async () => {
    const env = makeEnv();
    await env.auth.initialize();
    await env.auth.signIn("person@example.com", "a-good-password");
    env.fireEvent("SIGNED_IN", { user: { id: "u1", email: "person@example.com" } });
    assert.equal(env.store.mWalletData, FINANCIAL_BLOB);
    assert.ok(!env.writes.includes("mWalletData") && !env.removes.includes("mWalletData"));
});

test("signOut does not clear or mutate mWalletData", async () => {
    const env = makeEnv();
    await env.auth.initialize();
    env.fireEvent("SIGNED_IN", { user: { id: "u1", email: "person@example.com" } });
    await env.auth.signOut();
    env.fireEvent("SIGNED_OUT", null);
    assert.equal(env.store.mWalletData, FINANCIAL_BLOB);
    assert.ok(!env.removes.includes("mWalletData"), "signOut must never removeItem mWalletData");
    assert.ok(!env.writes.includes("mWalletData"));
});

test("resetPassword + updatePassword do not touch mWalletData", async () => {
    const env = makeEnv();
    await env.auth.initialize();
    await env.auth.resetPassword("person@example.com");
    env.fireEvent("PASSWORD_RECOVERY", { user: { id: "u1", email: "person@example.com" } });
    await env.auth.updatePassword("another-good-password");
    assert.equal(env.store.mWalletData, FINANCIAL_BLOB);
    assert.ok(!env.writes.includes("mWalletData") && !env.removes.includes("mWalletData"));
});

test("across a full sign-up / sign-in / sign-out cycle, mWalletData is byte-identical", async () => {
    const env = makeEnv();
    await env.auth.initialize();
    await env.auth.signUp("person@example.com", "a-good-password");
    await env.auth.signIn("person@example.com", "a-good-password");
    env.fireEvent("SIGNED_IN", { user: { id: "u1", email: "person@example.com" } });
    await env.auth.signOut();
    env.fireEvent("SIGNED_OUT", null);

    assert.equal(env.store.mWalletData, FINANCIAL_BLOB);
    const touchedFinancial = env.writes.concat(env.removes).filter((k) => /wallet.?data|budgettracker/i.test(k));
    assert.deepEqual(touchedFinancial, []);
});
