"use strict";

/* =========================================================
   BP4 — LOCAL USER MIGRATION + OWNERSHIP  (service)

   Loads the real js/migration/local-user-migration.js into a
   node:vm sandbox with a stubbed MWalletAuth / MWalletAuthUI
   and an instrumented localStorage. Realistic mWalletData
   blobs are produced by the REAL js/storage.js via
   tests/helpers/storage-harness.js.

   Verifies:
     - meaningful-data detection (accurate + read-only)
     - legacy claim / fresh auto-claim / returning owner
     - wrong-account block (fails closed, no reassignment)
     - corrupt data + storage-failure -> safe error
     - idempotency
     - migration code makes ZERO writes to mWalletData
     - no owner id / financial content in the public API
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { StorageHarness } = require("./helpers/storage-harness.js");

const ROOT = path.resolve(__dirname, "..");
const MIGRATION_SRC = fs.readFileSync(
    path.join(ROOT, "js/migration/local-user-migration.js"), "utf8"
);

const OWNER_KEY = "mwallet.local.owner.v1";
const FINANCIAL_KEY = "mWalletData";

const USER_A = "user-aaaa-1111";
const USER_B = "user-bbbb-2222";


/* ---- realistic mWalletData strings (via real storage.js) ---- */

function freshFinancialString() {
    const h = new StorageHarness();          // createDefaultData() + save()
    const raw = h.localStorage.getItem(FINANCIAL_KEY);
    h.cleanup();
    return raw;
}

function financialStringWith(mutate) {
    const h = new StorageHarness();
    mutate(h.storage);                        // e.g. s => s.addIncome({...})
    const raw = h.localStorage.getItem(FINANCIAL_KEY);
    h.cleanup();
    return raw;
}

/* fresh data + empty generated month shell, still no entries */
function financialWithEmptyMonthShell() {
    const data = JSON.parse(freshFinancialString());
    data.months["2026-09"] = {
        monthKey: "2026-09",
        startingBalance: 0,
        endingBalance: 0,
        paychecks: [], bills: [], suppressedRecurringBillSeries: [],
        expenses: [], transactions: [], savingsDeposits: [], savingsTransfers: [],
        notes: "", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z"
    };
    return JSON.stringify(data);
}


/* ---- migration sandbox ---- */

function ownerRecord(userId, source) {
    return JSON.stringify({
        schemaVersion: 1,
        ownerUserId: userId,
        claimedAt: "2026-08-20T12:00:00.000Z",
        source: source || "legacy"
    });
}

function makeEnv(options) {
    options = options || {};

    const store = Object.create(null);
    if (options.financial != null) { store[FINANCIAL_KEY] = String(options.financial); }
    if (options.owner != null) {
        store[OWNER_KEY] = typeof options.owner === "string" ? options.owner : JSON.stringify(options.owner);
    }
    Object.keys(options.extraKeys || {}).forEach((k) => { store[k] = String(options.extraKeys[k]); });

    const writes = [];
    const removes = [];
    const localStorage = {
        getItem(key) {
            if (options.throwOnGet && key === options.throwOnGet) { throw new Error("read blocked"); }
            return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        },
        setItem(key, value) {
            writes.push(key);
            if (options.failWrites) { throw new Error("write blocked"); }
            store[key] = String(value);
        },
        removeItem(key) { removes.push(key); delete store[key]; },
        key(i) { return Object.keys(store)[i] ?? null; },
        get length() { return Object.keys(store).length; }
    };

    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    const consoleLines = [];
    const rec = (lvl) => (...a) => consoleLines.push(lvl + ": " + a.map(String).join(" "));
    sandbox.console = { info: rec("i"), warn: rec("w"), error: rec("e"), log: rec("l"), debug: rec("d") };
    sandbox.localStorage = localStorage;
    sandbox.setTimeout = setTimeout;
    sandbox.JSON = JSON;

    let authSnap = options.auth || { configured: false, status: "unconfigured", user: null, session: null, recoveryMode: false };
    const authSubs = [];
    sandbox.MWalletAuth = {
        getState: () => authSnap,
        subscribe: (fn) => {
            authSubs.push(fn);
            try { fn(authSnap); } catch (e) { /* ignore */ }
            return () => {
                const i = authSubs.indexOf(fn);
                if (i !== -1) { authSubs.splice(i, 1); }
            };
        },
        signOut: () => { authSnap = signedOut(); authSubs.slice().forEach((fn) => fn(authSnap)); return Promise.resolve({ ok: true }); }
    };

    let guardFn = null;
    let renderStateCalls = 0;
    sandbox.MWalletAuthUI = {
        setPostAuthGuard: (fn) => { guardFn = fn; },
        renderState: () => { renderStateCalls += 1; }
    };

    vm.createContext(sandbox);
    vm.runInContext(MIGRATION_SRC, sandbox, { filename: "local-user-migration.js" });

    return {
        sandbox,
        migration: sandbox.MWalletLocalMigration,
        store,
        writes,
        removes,
        consoleText: () => consoleLines.join("\n"),
        authSubCount: () => authSubs.length,
        renderStateCalls: () => renderStateCalls,
        guard: () => (guardFn ? guardFn(authSnap) : null),
        rawFinancial: () => (Object.prototype.hasOwnProperty.call(store, FINANCIAL_KEY) ? store[FINANCIAL_KEY] : null),
        rawOwner: () => (Object.prototype.hasOwnProperty.call(store, OWNER_KEY) ? store[OWNER_KEY] : null),
        setAuth: (snap) => { authSnap = snap; authSubs.slice().forEach((fn) => fn(snap)); }
    };
}

function signedIn(userId) {
    return {
        configured: true, status: "signed_in", recoveryMode: false,
        user: { id: userId, email: userId + "@example.com" },
        session: { active: true, userId: userId, email: userId + "@example.com", expiresAt: 9999999999 }
    };
}
function signedOut() {
    return { configured: true, status: "signed_out", recoveryMode: false, user: null, session: null };
}
function initializing() {
    return { configured: true, status: "initializing", recoveryMode: false, user: null, session: null };
}
function recovery(userId) {
    return Object.assign(signedIn(userId), { recoveryMode: true });
}


/* =====================================================
   MEANINGFUL DATA DETECTION
   ===================================================== */

test("detect: no mWalletData at all -> not meaningful", () => {
    const env = makeEnv({});
    const d = env.migration.detectMeaningfulLocalData();
    assert.equal(d.present, false);
    assert.equal(d.meaningful, false);
    assert.equal(d.readable, true);
});

test("detect: fresh/default M-Wallet state -> not meaningful", () => {
    const env = makeEnv({ financial: freshFinancialString() });
    const d = env.migration.detectMeaningfulLocalData();
    assert.equal(d.meaningful, false, "signals: " + JSON.stringify(d.signals));
    assert.equal(d.readable, true);
});

test("detect: empty generated month shell alone -> not meaningful", () => {
    const env = makeEnv({ financial: financialWithEmptyMonthShell() });
    assert.equal(env.migration.detectMeaningfulLocalData().meaningful, false);
});

test("detect: entered income -> meaningful", () => {
    const env = makeEnv({ financial: financialStringWith((s) => s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" })) });
    const d = env.migration.detectMeaningfulLocalData();
    assert.equal(d.meaningful, true);
    assert.ok(d.signals.includes("income"));
});

test("detect: expense -> meaningful", () => {
    const env = makeEnv({ financial: financialStringWith((s) => s.addExpense({ merchant: "Market", amount: 55, category: "groceries", date: "2026-08-05" })) });
    assert.equal(env.migration.detectMeaningfulLocalData().meaningful, true);
});

test("detect: a bill -> meaningful", () => {
    const env = makeEnv({ financial: financialStringWith((s) => s.addBill({ name: "Rent", amount: 1200, dueDate: "2026-08-01", category: "housing" })) });
    assert.equal(env.migration.detectMeaningfulLocalData().meaningful, true);
});

test("detect: a transaction -> meaningful", () => {
    const env = makeEnv({
        financial: financialStringWith((s) => {
            s.addTransaction ? s.addTransaction({ description: "Coffee", amount: 4, type: "expense", date: "2026-08-03" })
                : s.addExpense({ merchant: "X", amount: 4, category: "dining", date: "2026-08-03" });
        })
    });
    assert.equal(env.migration.detectMeaningfulLocalData().meaningful, true);
});

test("detect: a savings goal -> meaningful", () => {
    const env = makeEnv({ financial: financialStringWith((s) => s.addSavingsGoal({ name: "Trip", targetAmount: 1000 })) });
    assert.equal(env.migration.detectMeaningfulLocalData().meaningful, true);
});

test("detect: a non-zero savings balance -> meaningful", () => {
    const env = makeEnv({
        financial: financialStringWith((s) => {
            if (typeof s.setSavingsBalance === "function") { s.setSavingsBalance(500); }
            else { s.depositToSavings ? s.depositToSavings(500) : s.addSavingsDeposit({ amount: 500, date: "2026-08-01" }); }
        })
    });
    assert.equal(env.migration.detectMeaningfulLocalData().meaningful, true);
});

test("detect: physical cash on hand -> meaningful", () => {
    const data = JSON.parse(freshFinancialString());
    data.cash.wallet.denominations["bill-20"] = 3;
    const env = makeEnv({ financial: JSON.stringify(data) });
    const d = env.migration.detectMeaningfulLocalData();
    assert.equal(d.meaningful, true);
    assert.ok(d.signals.includes("cash-wallet"));
});

test("detect: an initialized cash drawer -> meaningful", () => {
    const data = JSON.parse(freshFinancialString());
    data.cash.initialized = true;
    const env = makeEnv({ financial: JSON.stringify(data) });
    assert.equal(env.migration.detectMeaningfulLocalData().meaningful, true);
});

test("detect: a user-created custom category -> meaningful", () => {
    const env = makeEnv({ financial: financialStringWith((s) => s.addCustomCategory("Side Hustle")) });
    const d = env.migration.detectMeaningfulLocalData();
    assert.equal(d.meaningful, true);
    assert.ok(d.signals.includes("custom-category"));
});

test("detect: does NOT mutate mWalletData (raw string byte-identical)", () => {
    const raw = financialStringWith((s) => s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" }));
    const env = makeEnv({ financial: raw });
    const before = env.rawFinancial();
    env.migration.detectMeaningfulLocalData();
    env.migration.detectMeaningfulLocalData();
    env.migration.diagnostics();
    assert.equal(env.rawFinancial(), before);
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    assert.ok(!env.removes.includes(FINANCIAL_KEY));
});

test("detect: corrupt mWalletData -> not 'empty', not 'meaningful', flagged unreadable", () => {
    const env = makeEnv({ financial: "{ this is not json" });
    const d = env.migration.detectMeaningfulLocalData();
    assert.equal(d.readable, false);
    assert.equal(d.meaningful, null);
    assert.equal(d.present, true);
});


/* =====================================================
   LEGACY CLAIM
   ===================================================== */

test("legacy: signed-in USER_A + meaningful data + no owner -> needs_claim", () => {
    const env = makeEnv({
        auth: signedIn(USER_A),
        financial: financialStringWith((s) => s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" }))
    });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "needs_claim");
    assert.ok(!env.writes.includes(OWNER_KEY), "must NOT auto-write ownership for a legacy user");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
});

test("legacy: claimExistingData writes owner=USER_A source=legacy, mWalletData byte-identical, app unlocks", async () => {
    const raw = financialStringWith((s) => {
        s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" });
        s.addBill({ name: "Rent", amount: 1200, dueDate: "2026-08-01", category: "housing" });
    });
    const env = makeEnv({ auth: signedIn(USER_A), financial: raw });
    env.migration.initialize();
    const before = env.rawFinancial();

    const result = await env.migration.claimExistingData();
    assert.equal(result.ok, true);
    assert.equal(result.source, "legacy");

    assert.equal(env.migration.getStatus(), "owned");
    const owner = JSON.parse(env.rawOwner());
    assert.equal(owner.ownerUserId, USER_A);
    assert.equal(owner.source, "legacy");
    assert.equal(owner.schemaVersion, 1);

    assert.equal(env.rawFinancial(), before, "mWalletData must remain byte-identical across the claim");
    assert.ok(!env.writes.includes(FINANCIAL_KEY), "claim made ZERO writes to mWalletData");

    // guard now lets the app through
    assert.equal(env.guard().release, true);
});


/* =====================================================
   FRESH USER
   ===================================================== */

test("fresh: signed-in USER_A + default state + no owner -> auto fresh_claimed, no prompt, no financial write", () => {
    const env = makeEnv({ auth: signedIn(USER_A), financial: freshFinancialString() });
    const before = env.rawFinancial();
    env.migration.initialize();

    assert.equal(env.migration.getStatus(), "fresh_claimed");
    const owner = JSON.parse(env.rawOwner());
    assert.equal(owner.ownerUserId, USER_A);
    assert.equal(owner.source, "fresh");

    assert.equal(env.rawFinancial(), before, "no artificial financial entries / no rewrite");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    assert.equal(env.guard().release, true);
});

test("fresh: with no mWalletData at all -> still auto fresh_claimed, financial key never created", () => {
    const env = makeEnv({ auth: signedIn(USER_A) });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "fresh_claimed");
    assert.equal(env.rawFinancial(), null, "migration must not create an mWalletData object");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
});


/* =====================================================
   RETURNING OWNER
   ===================================================== */

test("returning: owner=USER_A + session=USER_A -> owned, no prompt, no owner rewrite, no financial write", () => {
    const env = makeEnv({
        auth: signedIn(USER_A),
        owner: ownerRecord(USER_A, "legacy"),
        financial: financialStringWith((s) => s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" }))
    });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "owned");
    assert.equal(env.writes.length, 0, "returning owner triggers zero writes");
    assert.equal(env.guard().release, true);
});

test("returning: repeated resolve / reload stays owned and never rewrites the owner record", () => {
    const env = makeEnv({ auth: signedIn(USER_A), owner: ownerRecord(USER_A, "fresh"), financial: freshFinancialString() });
    env.migration.initialize();
    const ownerBefore = env.rawOwner();
    env.setAuth(signedIn(USER_A));            // e.g. token refresh
    env.migration._resolve();
    env.migration._resolve();
    assert.equal(env.migration.getStatus(), "owned");
    assert.equal(env.rawOwner(), ownerBefore, "owner record unchanged");
    assert.ok(!env.writes.includes(OWNER_KEY));
});


/* =====================================================
   WRONG ACCOUNT
   ===================================================== */

test("wrong account: owner=USER_A + session=USER_B -> owner_mismatch, app blocked, nothing changed", () => {
    const raw = financialStringWith((s) => s.addExpense({ merchant: "Market", amount: 88, category: "groceries", date: "2026-08-05" }));
    const env = makeEnv({ auth: signedIn(USER_B), owner: ownerRecord(USER_A, "legacy"), financial: raw });
    const ownerBefore = env.rawOwner();
    const finBefore = env.rawFinancial();

    env.migration.initialize();

    assert.equal(env.migration.getStatus(), "owner_mismatch");
    assert.equal(env.guard().release, false, "app must stay gated for the wrong account");
    assert.equal(env.rawOwner(), ownerBefore, "ownership preserved");
    assert.equal(env.rawFinancial(), finBefore, "financial data preserved");
    assert.equal(env.writes.length, 0);
    assert.equal(env.removes.length, 0);
});

test("wrong account: public API leaks no USER_A identifiers and no financial content", () => {
    const env = makeEnv({
        auth: signedIn(USER_B),
        owner: ownerRecord(USER_A, "legacy"),
        financial: financialStringWith((s) => s.addIncome({ source: "Secret Salary", amount: 123456, type: "salary", date: "2026-08-01" }))
    });
    env.migration.initialize();

    const blob = JSON.stringify(env.migration.getState()) +
        JSON.stringify(env.migration.diagnostics()) +
        JSON.stringify(env.migration.getOwnership());

    assert.ok(!blob.includes(USER_A), "owner user id must not appear");
    assert.ok(!blob.includes("Secret Salary"), "merchant/source must not appear");
    assert.ok(!blob.includes("123456"), "amounts must not appear");
    assert.ok(!blob.includes("@example.com"), "emails must not appear");
    // console must be clean of the same
    assert.ok(!env.consoleText().includes(USER_A));
    assert.ok(!env.consoleText().includes("123456"));
});

test("wrong account: USER_B calling claimExistingData is refused, owner stays USER_A", async () => {
    const env = makeEnv({ auth: signedIn(USER_B), owner: ownerRecord(USER_A, "legacy"), financial: freshFinancialString() });
    env.migration.initialize();
    const ownerBefore = env.rawOwner();

    const res = await env.migration.claimExistingData();
    assert.equal(res.ok, false);
    assert.equal(res.code, "owner_mismatch");
    assert.equal(env.rawOwner(), ownerBefore, "no reassignment");
    assert.equal(env.migration.getStatus(), "owner_mismatch");
});


/* =====================================================
   SIGN OUT
   ===================================================== */

test("sign out: owner marker + mWalletData persist; same account returns to owned; other account blocked", () => {
    const finRaw = financialStringWith((s) => s.addBill({ name: "Rent", amount: 1200, dueDate: "2026-08-01", category: "housing" }));
    const env = makeEnv({ auth: signedIn(USER_A), owner: ownerRecord(USER_A, "legacy"), financial: finRaw });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "owned");

    const ownerBefore = env.rawOwner();
    const finBefore = env.rawFinancial();

    env.setAuth(signedOut());
    assert.equal(env.rawOwner(), ownerBefore, "owner marker survives sign out");
    assert.equal(env.rawFinancial(), finBefore, "financial data survives sign out");
    assert.equal(env.removes.length, 0, "sign out removed nothing");

    env.setAuth(signedIn(USER_A));
    assert.equal(env.migration.getStatus(), "owned");

    env.setAuth(signedOut());
    env.setAuth(signedIn(USER_B));
    assert.equal(env.migration.getStatus(), "owner_mismatch");
});


/* =====================================================
   CORRUPT DATA  /  STORAGE FAILURE
   ===================================================== */

test("corrupt: signed-in + unparseable mWalletData + no owner -> error (never fresh, never overwritten)", () => {
    const env = makeEnv({ auth: signedIn(USER_A), financial: "<<<corrupt>>>" });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "error");
    assert.equal(env.rawFinancial(), "<<<corrupt>>>", "corrupt data left untouched");
    assert.ok(!env.writes.includes(OWNER_KEY), "no ownership claimed over corrupt data");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    assert.equal(env.guard().release, false);
});

test("corrupt: malformed ownership record -> error, fails closed, marker not overwritten", () => {
    const env = makeEnv({ auth: signedIn(USER_A), owner: '{"schemaVersion":9,"broken":true}', financial: freshFinancialString() });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "error");
    assert.equal(env.rawOwner(), '{"schemaVersion":9,"broken":true}', "malformed marker left as-is");
    assert.ok(!env.writes.includes(OWNER_KEY));
    assert.equal(env.guard().release, false);
});

test("storage failure: getItem throws -> error, app stays blocked, nothing written", () => {
    const env = makeEnv({ auth: signedIn(USER_A), throwOnGet: OWNER_KEY });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "error");
    assert.equal(env.guard().release, false);
    assert.equal(env.writes.length, 0);
});

test("storage failure: setItem throws during fresh auto-claim -> error, mWalletData untouched", () => {
    const env = makeEnv({ auth: signedIn(USER_A), financial: freshFinancialString(), failWrites: true });
    const before = env.rawFinancial();
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "error");
    assert.equal(env.rawFinancial(), before);
    assert.equal(env.guard().release, false);
});

test("authenticated state missing user id -> error (fails safely)", () => {
    const env = makeEnv({ auth: { configured: true, status: "signed_in", recoveryMode: false, user: null, session: null }, financial: freshFinancialString() });
    env.migration.initialize();
    assert.equal(env.migration.getStatus(), "error");
    assert.equal(env.guard().release, false);
});


/* =====================================================
   IDEMPOTENCY
   ===================================================== */

test("idempotent: repeated initialize() returns the same promise and one auth subscription", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), owner: ownerRecord(USER_A, "fresh"), financial: freshFinancialString() });
    const p1 = env.migration.initialize();
    const p2 = env.migration.initialize();
    assert.equal(p1, p2);
    await Promise.all([p1, p2]);
    assert.equal(env.authSubCount(), 1);
});

test("idempotent: repeated ensureOwnership() is stable and never changes the owner", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), financial: freshFinancialString() });
    await env.migration.ensureOwnership();
    const owner1 = env.rawOwner();
    await env.migration.ensureOwnership();
    await env.migration.ensureOwnership();
    assert.equal(env.rawOwner(), owner1);
    assert.equal(JSON.parse(owner1).ownerUserId, USER_A);
});

test("idempotent: claimExistingData twice -> second is a no-op success, owner unchanged", async () => {
    const env = makeEnv({
        auth: signedIn(USER_A),
        financial: financialStringWith((s) => s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" }))
    });
    env.migration.initialize();
    const first = await env.migration.claimExistingData();
    assert.equal(first.ok, true);
    const ownerAfterFirst = env.rawOwner();

    const second = await env.migration.claimExistingData();
    assert.equal(second.ok, true);
    assert.equal(second.alreadyOwned, true);
    assert.equal(env.rawOwner(), ownerAfterFirst, "claim is idempotent, owner never changes");
});


/* =====================================================
   DATA SAFETY (aggregate)
   ===================================================== */

test("data safety: across a full lifecycle, migration makes ZERO writes to mWalletData", async () => {
    const finRaw = financialStringWith((s) => {
        s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" });
        s.addExpense({ merchant: "Market", amount: 88, category: "groceries", date: "2026-08-05" });
    });
    const env = makeEnv({ auth: signedIn(USER_A), financial: finRaw });
    const before = env.rawFinancial();

    env.migration.initialize();                 // needs_claim
    await env.migration.claimExistingData();     // -> owned
    env.migration.detectMeaningfulLocalData();
    env.migration.diagnostics();
    env.setAuth(signedOut());
    env.setAuth(signedIn(USER_A));               // returning owner
    await env.migration.ensureOwnership();

    assert.equal(env.rawFinancial(), before, "mWalletData byte-identical across the whole lifecycle");
    assert.ok(!env.writes.includes(FINANCIAL_KEY), "not one setItem targeted mWalletData");
    assert.ok(!env.removes.includes(FINANCIAL_KEY), "not one removeItem targeted mWalletData");
    // only the owner key was ever written
    assert.deepEqual(env.writes.filter((k) => k !== OWNER_KEY), []);
});

test("data safety: ownership record contains only the allowed fields (no financial data, no email, no token)", async () => {
    const env = makeEnv({
        auth: signedIn(USER_A),
        financial: financialStringWith((s) => s.addIncome({ source: "Salary", amount: 999999, type: "salary", date: "2026-08-01" }))
    });
    env.migration.initialize();
    await env.migration.claimExistingData();

    const record = JSON.parse(env.rawOwner());
    assert.deepEqual(Object.keys(record).sort(), ["claimedAt", "ownerUserId", "schemaVersion", "source"]);
    const blob = JSON.stringify(record);
    assert.ok(!blob.includes("999999"));
    assert.ok(!blob.includes("@example.com"));
    assert.ok(!/token|password|session|balance/i.test(blob));
});


/* =====================================================
   FAIL-CLOSED OWNERSHIP GUARD CONTRACT
   (the guard is DENY-by-default; it releases ONLY on a
    positively verified signed-in owner. auth-ui bypasses the
    guard entirely for unconfigured / recovery — verified in
    tests/migration-ui.test.js against the real auth-ui.)
   ===================================================== */

test("guard: releases only for a signed-in verified owner (owned / fresh_claimed)", () => {
    const owned = makeEnv({ auth: signedIn(USER_A), owner: ownerRecord(USER_A, "legacy"), financial: freshFinancialString() });
    owned.migration.initialize();
    assert.equal(owned.migration.getStatus(), "owned");
    assert.equal(owned.guard().release, true);

    const fresh = makeEnv({ auth: signedIn(USER_A), financial: freshFinancialString() });
    fresh.migration.initialize();
    assert.equal(fresh.migration.getStatus(), "fresh_claimed");
    assert.equal(fresh.guard().release, true);
});

test("guard: does NOT release for needs_claim / owner_mismatch / error / checking", () => {
    const needs = makeEnv({ auth: signedIn(USER_A), financial: financialStringWith((s) => s.addIncome({ source: "Salary", amount: 4200, type: "salary", date: "2026-08-01" })) });
    needs.migration.initialize();
    assert.equal(needs.guard().release, false, "needs_claim");

    const mismatch = makeEnv({ auth: signedIn(USER_B), owner: ownerRecord(USER_A, "legacy"), financial: freshFinancialString() });
    mismatch.migration.initialize();
    assert.equal(mismatch.guard().release, false, "owner_mismatch");

    const err = makeEnv({ auth: signedIn(USER_A), financial: "<<corrupt>>" });
    err.migration.initialize();
    assert.equal(err.guard().release, false, "error");

    const checking = makeEnv({ auth: initializing(), financial: freshFinancialString() });
    checking.migration.initialize();
    assert.equal(checking.guard().release, false, "checking / not signed in");
});

test("guard: does NOT release for unconfigured or recovery (auth-ui bypasses it for those)", () => {
    const unconf = makeEnv({ auth: { configured: false, status: "unconfigured", recoveryMode: false, user: null, session: null } });
    unconf.migration.initialize();
    assert.equal(unconf.migration.getStatus(), "unconfigured");
    assert.equal(unconf.guard().release, false, "guard itself never releases for unconfigured");

    const rec = makeEnv({ auth: recovery(USER_A), owner: ownerRecord(USER_A, "legacy"), financial: freshFinancialString() });
    rec.migration.initialize();
    assert.equal(rec.migration.getStatus(), "checking");
    assert.equal(rec.guard().release, false);
});

test("guard: never releases on a garbage auth snapshot", () => {
    const env = makeEnv({ auth: signedIn(USER_A), owner: ownerRecord(USER_A, "legacy"), financial: freshFinancialString() });
    env.migration.initialize();
    assert.equal(env.migration._ownershipGuard(null).release, false);
    assert.equal(env.migration._ownershipGuard(undefined).release, false);
    assert.equal(env.migration._ownershipGuard({}).release, false);
    assert.equal(env.migration._ownershipGuard({ configured: true, status: "signed_out" }).release, false);
});

test("guard: fresh auto-claim releases and nudges auth-ui (renderState) so the app can open", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), financial: freshFinancialString() });
    const before = env.renderStateCalls();
    env.migration.initialize();                  // fresh auto-claim -> refreshGate()
    assert.equal(env.migration.getStatus(), "fresh_claimed");
    assert.equal(env.guard().release, true);
    assert.ok(env.renderStateCalls() > before, "auth-ui.renderState was called so the app can open");
});
