"use strict";

/* =========================================================
   BP4 — LOCAL MIGRATION UI + GATE COORDINATION

   Loads the REAL auth.js + auth-ui.js + local-user-migration.js
   + migration-ui.js into one node:vm sandbox with a stubbed
   Supabase library, an instrumented localStorage, and the DOM
   stub (which now carries both #mw-auth-gate and
   #mw-migration-gate).

   Verifies the end-to-end gate: the financial app root stays
   inert until BOTH auth AND local ownership are satisfied, the
   right migration screen shows, the buttons call the service,
   and nothing rewrites mWalletData.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { buildAuthDom } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");
const FILES = [
    "js/auth/auth-config.js",
    "js/auth/auth-client.js",
    "js/auth/auth.js",
    "js/auth/auth-ui.js",
    "js/migration/local-user-migration.js",
    "js/migration/migration-ui.js"
];

const OWNER_KEY = "mwallet.local.owner.v1";
const FINANCIAL_KEY = "mWalletData";

const PUBLISHABLE_KEY = "sb_publishable_" + "MigExampleABCDEFGHIJKLMNOPQRSTUVWXYZ01234567";
const VALID_CONFIG = { supabaseUrl: "https://demoref.supabase.co", supabaseKey: PUBLISHABLE_KEY };

const USER_A = "user-aaaa";
const USER_B = "user-bbbb";

function sessionFor(id) {
    return {
        access_token: "MIG_SECRET_ACCESS_" + id, refresh_token: "MIG_SECRET_REFRESH_" + id,
        expires_at: 9999999999, user: { id: id, email: id + "@example.com" }
    };
}
function ownerRecord(id, source) {
    return JSON.stringify({ schemaVersion: 1, ownerUserId: id, claimedAt: "2026-08-20T00:00:00.000Z", source: source || "legacy" });
}
const MEANINGFUL_FINANCIAL = JSON.stringify({
    version: 5,
    income: [{ id: "i1", source: "Salary", amount: 4200 }],
    expenses: [{ id: "e1", merchant: "Market", amount: 88 }],
    months: {}, savingsGoals: [], savingsTransfers: [],
    accounts: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } },
    cash: { initialized: false, wallet: { denominations: {} }, savings: { denominations: {} }, history: [] },
    settings: { currency: "USD", categories: { version: 1, list: [] } }
});
const FRESH_FINANCIAL = JSON.stringify({
    version: 5, income: [], expenses: [], months: {}, savingsGoals: [], savingsTransfers: [],
    accounts: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } },
    cash: { initialized: false, wallet: { denominations: {} }, savings: { denominations: {} }, history: [] },
    settings: { currency: "USD", categories: { version: 1, list: [] } }
});

function flush() { return new Promise((r) => setTimeout(r, 10)); }

function makeEnv(options) {
    options = options || {};
    const dom = buildAuthDom();

    const store = Object.create(null);
    if (!options.unconfigured) { store["mwallet.auth.config"] = JSON.stringify(VALID_CONFIG); }
    if (options.financial != null) { store[FINANCIAL_KEY] = String(options.financial); }
    if (options.owner != null) { store[OWNER_KEY] = String(options.owner); }

    const writes = [];
    const removes = [];
    const localStorage = {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { writes.push(k); store[k] = String(v); },
        removeItem: (k) => { removes.push(k); delete store[k]; },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
    };

    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    const consoleLines = [];
    const rec = (l) => (...a) => consoleLines.push(l + ": " + a.map(String).join(" "));
    sandbox.console = { info: rec("i"), warn: rec("w"), error: rec("e"), log: rec("l"), debug: rec("d") };
    sandbox.atob = (s) => Buffer.from(s, "base64").toString("binary");
    sandbox.Buffer = Buffer;
    sandbox.setTimeout = setTimeout;
    sandbox.navigator = { onLine: true };
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};
    sandbox.localStorage = localStorage;
    sandbox.document = dom.document;
    dom.document.readyState = "complete";

    let currentSession = options.session || null;
    let authCb = null;
    sandbox.supabase = {
        createClient() {
            return {
                auth: {
                    getSession: () => Promise.resolve({ data: { session: currentSession }, error: null }),
                    onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
                    signOut: () => { currentSession = null; if (authCb) { authCb("SIGNED_OUT", null); } return Promise.resolve({ error: null }); }
                }
            };
        }
    };

    vm.createContext(sandbox);
    FILES.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f }));

    return {
        sandbox, dom, store, writes, removes,
        auth: sandbox.MWalletAuth,
        migration: sandbox.MWalletLocalMigration,
        migrationUI: sandbox.MWalletMigrationUI,
        consoleText: () => consoleLines.join("\n"),
        signIn: (id) => { currentSession = sessionFor(id); if (authCb) { authCb("SIGNED_IN", currentSession); } },
        fireInitialSession: () => { if (authCb) { authCb("INITIAL_SESSION", currentSession); } },
        fireAuthEvent: (evt, sess) => { if (authCb) { authCb(evt, sess === undefined ? currentSession : sess); } },
        rawFinancial: () => (Object.prototype.hasOwnProperty.call(store, FINANCIAL_KEY) ? store[FINANCIAL_KEY] : null),
        rawOwner: () => (Object.prototype.hasOwnProperty.call(store, OWNER_KEY) ? store[OWNER_KEY] : null)
    };
}

async function boot(env) {
    // migration-ui/auth-ui self-boot on load (readyState complete); auth needs initialize()
    await env.auth.initialize();
    await flush();
}


/* ---- decideScreen (pure) ---- */

test("decideScreen: unconfigured / signed_out / recovery -> no migration gate", () => {
    const env = makeEnv({});
    const D = env.migrationUI.decideScreen.bind(env.migrationUI);
    assert.equal(D({ configured: false }, {}).gate, false);
    assert.equal(D({ configured: true, status: "signed_out" }, {}).gate, false);
    assert.equal(D({ configured: true, status: "signed_in", recoveryMode: true }, { status: "owned" }).gate, false);
});

test("decideScreen: signed_in maps migration status -> screen", () => {
    const env = makeEnv({});
    const D = env.migrationUI.decideScreen.bind(env.migrationUI);
    const a = { configured: true, status: "signed_in", recoveryMode: false };
    assert.deepEqual([D(a, { status: "owned" }).gate, D(a, { status: "fresh_claimed" }).gate], [false, false]);
    assert.equal(D(a, { status: "needs_claim" }).screen, "needs_claim");
    assert.equal(D(a, { status: "owner_mismatch" }).screen, "owner_mismatch");
    assert.equal(D(a, { status: "error" }).screen, "error");
    assert.equal(D(a, { status: "checking" }).screen, "checking");
});


/* ---- end-to-end gate ---- */

test("unconfigured: no migration gate; developer keeps the local app", async () => {
    const env = makeEnv({ unconfigured: true });
    await boot(env);
    assert.equal(env.auth.getStatus(), "unconfigured");
    assert.equal(env.migration.getStatus(), "unconfigured");
    assert.equal(env.dom.gate.hidden, true, "auth gate hidden");
    assert.equal(env.dom.migrationGate.hidden, true, "migration gate hidden");
    assert.equal(env.dom.app.inert, false, "financial app stays interactive");
});

test("legacy: signed-in user with meaningful data sees EXISTING DATA FOUND; app stays inert", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL });
    await boot(env);
    env.signIn(USER_A);
    await flush();

    assert.equal(env.migration.getStatus(), "needs_claim");
    assert.equal(env.dom.migrationGate.hidden, false, "migration gate visible");
    assert.equal(env.dom.migrationScreen("needs_claim").hidden, false);
    assert.equal(env.dom.gate.hidden, true, "auth gate hidden (auth is satisfied)");
    assert.equal(env.dom.app.inert, true, "financial app stays inert until ownership resolves");
});

test("legacy: Keep & Protect My Data claims and opens the app; mWalletData byte-identical", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL });
    await boot(env);
    env.signIn(USER_A);
    await flush();
    const financialBefore = env.rawFinancial();

    env.dom.migrationAction("claim").dispatch("click");
    await flush();

    assert.equal(env.migration.getStatus(), "owned");
    assert.equal(JSON.parse(env.rawOwner()).source, "legacy");
    assert.equal(env.rawFinancial(), financialBefore, "mWalletData unchanged by the claim");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));

    assert.equal(env.dom.migrationGate.hidden, true, "migration gate closes");
    assert.equal(env.dom.app.inert, false, "financial app is now interactive");
});

test("fresh: signed-in user with default data goes straight to the app (no migration screen)", async () => {
    const env = makeEnv({ financial: FRESH_FINANCIAL });
    await boot(env);
    env.signIn(USER_A);
    await flush();

    assert.equal(env.migration.getStatus(), "fresh_claimed");
    assert.equal(env.dom.migrationGate.hidden, true);
    assert.equal(env.dom.app.inert, false);
    assert.equal(JSON.parse(env.rawOwner()).source, "fresh");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
});

test("returning owner: reload opens straight to the app, no prompt", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL, owner: ownerRecord(USER_A, "legacy"), session: sessionFor(USER_A) });
    await boot(env);
    env.fireInitialSession();
    await flush();

    assert.equal(env.migration.getStatus(), "owned");
    assert.equal(env.dom.migrationGate.hidden, true);
    assert.equal(env.dom.app.inert, false);
    assert.equal(env.writes.length, 0, "returning owner writes nothing");
});

test("wrong account: owner mismatch screen; no financial values or owner id in the DOM", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL, owner: ownerRecord(USER_A, "legacy") });
    await boot(env);
    env.signIn(USER_B);
    await flush();

    assert.equal(env.migration.getStatus(), "owner_mismatch");
    assert.equal(env.dom.migrationScreen("owner_mismatch").hidden, false);
    assert.equal(env.dom.app.inert, true, "app stays gated for the wrong account");

    const domText = collectText(env.dom.document.body).join(" | ");
    assert.ok(!domText.includes(USER_A), "owner user id not rendered");
    assert.ok(!domText.includes("4200") && !domText.includes("Salary"), "no financial content rendered");
    assert.ok(!domText.includes("MIG_SECRET_ACCESS"), "no token rendered");

    // ownership + financial data untouched
    assert.equal(env.writes.length, 0);
    assert.equal(env.removes.length, 0);
});

test("wrong account: Sign Out returns the auth gateway; USER_A can then return to the app", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL, owner: ownerRecord(USER_A, "legacy") });
    await boot(env);
    env.signIn(USER_B);
    await flush();
    assert.equal(env.dom.migrationScreen("owner_mismatch").hidden, false);

    env.dom.migrationGate.querySelector('[data-migration-action="sign-out"]').dispatch("click");
    await flush();

    assert.equal(env.dom.migrationGate.hidden, true);
    assert.equal(env.dom.gate.hidden, false, "auth gateway is back");
    assert.equal(env.dom.app.inert, true);

    env.signIn(USER_A);
    await flush();
    assert.equal(env.migration.getStatus(), "owned");
    assert.equal(env.dom.app.inert, false);
});

test("password recovery precedence: recovery view shows, migration gate + app stay gated by auth-ui", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL, owner: ownerRecord(USER_A, "legacy") });
    await boot(env);
    env.signIn(USER_A);
    await flush();
    assert.equal(env.dom.app.inert, false, "owned -> app open");

    /* the reset link comes back -> Supabase fires PASSWORD_RECOVERY */
    env.fireAuthEvent("PASSWORD_RECOVERY", sessionFor(USER_A));
    await flush();

    assert.equal(env.auth.getState().recoveryMode, true);
    assert.equal(env.dom.view("recovery").hidden, false, "auth 'set new password' view is shown");
    assert.equal(env.dom.gate.hidden, false, "auth gate is up");
    assert.equal(env.dom.migrationGate.hidden, true, "migration gate defers to recovery");
    assert.equal(env.dom.app.inert, true, "financial app gated during recovery");
    assert.equal(env.migration.getStatus(), "checking", "migration defers while recovery is active");
});

test("data safety: across claim + sign-out + return, migration writes only the owner key", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL });
    await boot(env);
    env.signIn(USER_A);
    await flush();
    const financialBefore = env.rawFinancial();

    env.dom.migrationAction("claim").dispatch("click");
    await flush();
    env.dom.migrationGate.querySelector('[data-migration-action="sign-out"]');   // (already owned; gate hidden)
    env.auth.signOut();
    await flush();
    env.signIn(USER_A);
    await flush();

    assert.equal(env.rawFinancial(), financialBefore);
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    assert.ok(!env.removes.includes(FINANCIAL_KEY));
    assert.deepEqual(env.writes.filter((k) => k !== OWNER_KEY), []);
});

test("no token value reaches the migration DOM", async () => {
    const env = makeEnv({ financial: MEANINGFUL_FINANCIAL, owner: ownerRecord(USER_A, "legacy") });
    await boot(env);
    env.signIn(USER_B);
    await flush();
    const dump = collectText(env.dom.document.body).join(" ");
    assert.ok(!dump.includes("MIG_SECRET_ACCESS"));
    assert.ok(!dump.includes("MIG_SECRET_REFRESH"));
    assert.ok(!env.consoleText().includes("MIG_SECRET_ACCESS"));
});


function collectText(node, acc) {
    acc = acc || [];
    if (node.textContent && (!node.children || node.children.length === 0)) { acc.push(node.textContent); }
    (node.children || []).forEach((c) => collectText(c, acc));
    return acc;
}
