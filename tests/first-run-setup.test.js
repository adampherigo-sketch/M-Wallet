"use strict";

/* =========================================================
   BP5 — FIRST-RUN SETUP  (service: js/setup/first-run-setup.js)

   The real module runs in a node:vm sandbox with:
     - a stubbed MWalletAuth  (drivable snapshot + subscribers)
     - a stubbed MWalletLocalMigration (BP4) — getStatus() and
       detectMeaningfulLocalData() are the two things BP5 leans on
     - the REAL js/storage.js (via StorageHarness) as MWalletStorage
       so Finish exercises the actual canonical load()/save()
     - an instrumented localStorage (writes / removes tracked,
       optional per-key write failure)
     - a mock MWalletAuthUI that just captures the setup guard

   Coverage: fresh-user detection, existing-user auto-skip (never
   re-ask for balances, never overwrite established data), the
   owner-bound draft, step navigation, the Finish transaction
   (ONLY the 5 allowed fields move; everything else deep-equal),
   idempotency, sign-out mid-wizard, BP4 coordination, malformed /
   storage-failure safety, recovery precedence, and that the
   wizard makes ZERO mWalletData writes before Finish.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { StorageHarness, MemoryStorage } = require("./helpers/storage-harness.js");

const ROOT = path.resolve(__dirname, "..");
const SETUP_SRC = fs.readFileSync(path.join(ROOT, "js/setup/first-run-setup.js"), "utf8");

const SETUP_KEY = "mwallet.setup.v1";
const DRAFT_KEY = "mwallet.setup.draft.v1";
const FINANCIAL_KEY = "mWalletData";

const USER_A = "11111111-aaaa-4aaa-8aaa-111111111111";
const USER_B = "22222222-bbbb-4bbb-8bbb-222222222222";

const FRESH = { readable: true, present: true, meaningful: false, signals: [], reason: "fresh" };
const ABSENT = { readable: true, present: false, meaningful: false, signals: [], reason: "absent" };
const UNREADABLE = { readable: false, present: true, meaningful: null, signals: [], reason: "unparseable" };
function meaningful(signals) {
    return { readable: true, present: true, meaningful: true, signals: signals.slice(), reason: "signals" };
}

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function signedIn(id) {
    return { configured: true, status: "signed_in", recoveryMode: false, user: { id: id }, session: { userId: id } };
}
function recovery(id) { return Object.assign(signedIn(id), { recoveryMode: true }); }
function signedOut() { return { configured: true, status: "signed_out", recoveryMode: false, user: null, session: null }; }
function unconfigured() { return { configured: false, status: "unconfigured", recoveryMode: false, user: null, session: null }; }


function makeEnv(options) {
    options = options || {};

    /* ---- 1. financial baseline via the real storage engine ---- */
    const harness = new StorageHarness(
        options.financialRaw != null
            ? { preloadedStorage: { [FINANCIAL_KEY]: String(options.financialRaw) } }
            : {}
    );
    if (options.financialRaw == null) {
        harness.storage.load();               /* create + persist defaults */
        const data = harness.storage.load();  /* re-load => fully normalized baseline */
        if (typeof options.financialMutate === "function") {
            options.financialMutate(data);
            harness.storage.save(data);
            harness.storage.load();            /* re-normalize the mutated baseline */
        }
        if (typeof options.financialSetup === "function") {
            options.financialSetup(harness.storage);   /* run real storage.js methods */
            harness.storage.load();
        }
    }

    const ls = harness.localStorage;

    /* seed setup metadata directly (before trackers => not counted) */
    if (options.setupRecord != null) {
        ls.setItem(SETUP_KEY, typeof options.setupRecord === "string"
            ? options.setupRecord : JSON.stringify(options.setupRecord));
    }
    if (options.draft != null) {
        ls.setItem(DRAFT_KEY, typeof options.draft === "string"
            ? options.draft : JSON.stringify(options.draft));
    }

    /* ---- 2. instrument the shared MemoryStorage ---- */
    const writes = [];
    const removes = [];
    let failWriteKey = options.failWriteKey || null;
    const rawSet = MemoryStorage.prototype.setItem.bind(ls);
    const rawRemove = MemoryStorage.prototype.removeItem.bind(ls);
    ls.setItem = function (k, v) {
        writes.push(String(k));
        if (failWriteKey && String(k) === failWriteKey) { throw new Error("write blocked: " + k); }
        return rawSet(k, v);
    };
    ls.removeItem = function (k) { removes.push(String(k)); return rawRemove(k); };

    /* ---- 3. sandbox ---- */
    const consoleLines = [];
    const rec = (label) => (...a) => consoleLines.push(label + ": " + a.map(String).join(" "));

    let authSnap = options.auth || signedIn(USER_A);
    const authSubs = [];

    let migStatus = options.migStatus || "fresh_claimed";
    let detectValue = options.detect ? clone(options.detect) : null;
    const deriveDetect = () => {
        const raw = ls.getItem(FINANCIAL_KEY);
        if (raw == null) { return clone(ABSENT); }
        let d;
        try { d = JSON.parse(raw); } catch (e) { return clone(UNREADABLE); }
        if (!d || typeof d !== "object" || Array.isArray(d)) { return clone(UNREADABLE); }
        const sig = [];
        const arr = (x) => (Array.isArray(x) ? x : []);
        if (arr(d.income).length) { sig.push("income"); }
        if (arr(d.expenses).length) { sig.push("expenses"); }
        if (arr(d.savingsGoals).length) { sig.push("savings-goals"); }
        if (arr(d.savingsTransfers).length) { sig.push("savings-transfers"); }
        const a = d.accounts || {};
        if (a.checking && Number(a.checking.balance) !== 0) { sig.push("checking-balance"); }
        if (a.savings && Number(a.savings.balance) !== 0) { sig.push("savings-balance"); }
        Object.keys(d.months || {}).forEach((mk) => {
            const m = d.months[mk] || {};
            ["bills", "paychecks", "expenses", "transactions", "savingsDeposits"].forEach((key) => {
                if (arr(m[key]).length) { sig.push("month:" + key); }
            });
            if (typeof m.notes === "string" && m.notes.trim()) { sig.push("month:notes"); }
        });
        if (d.settings && typeof d.settings.currency === "string" && d.settings.currency && d.settings.currency !== "USD") {
            sig.push("currency-changed");
        }
        const uniq = Array.from(new Set(sig));
        return { readable: true, present: true, meaningful: uniq.length > 0, signals: uniq, reason: uniq.length ? "signals" : "fresh" };
    };

    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.console = { info: rec("i"), warn: rec("w"), error: rec("e"), log: rec("l"), debug: rec("d") };
    sandbox.localStorage = ls;
    sandbox.setTimeout = setTimeout;
    sandbox.JSON = JSON;
    sandbox.Number = Number;
    sandbox.Math = Math;
    sandbox.Date = Date;
    sandbox.String = String;
    sandbox.Object = Object;
    sandbox.Array = Array;
    sandbox.Promise = Promise;

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
        signOut: () => {
            authSnap = signedOut();
            authSubs.slice().forEach((f) => { try { f(authSnap); } catch (e) {} });
            return Promise.resolve({ ok: true });
        }
    };

    const migSubs = [];
    sandbox.MWalletLocalMigration = {
        getStatus: () => migStatus,
        detectMeaningfulLocalData: () => (detectValue ? clone(detectValue) : deriveDetect()),
        subscribe: (fn) => { migSubs.push(fn); try { fn(); } catch (e) {} return () => {}; }
    };

    sandbox.MWalletStorage = harness.storage;

    let gateRenders = 0;
    sandbox.MWalletAuthUI = {
        setSetupGuard: (fn) => { sandbox.__guard = fn; },
        setSetupScreenActive: () => {},
        renderState: () => { gateRenders += 1; }
    };

    let appRefreshes = 0;
    sandbox.BudgetApp = { refresh: () => { appRefreshes += 1; } };

    vm.createContext(sandbox);
    vm.runInContext(SETUP_SRC, sandbox, { filename: "first-run-setup.js" });

    return {
        sandbox,
        harness,
        firstRun: sandbox.MWalletFirstRun,
        writes,
        removes,
        consoleText: () => consoleLines.join("\n"),
        gateRenders: () => gateRenders,
        appRefreshes: () => appRefreshes,
        guard: (snap) => (sandbox.__guard ? sandbox.__guard(snap || authSnap) : null),
        setAuth: (s) => { authSnap = s; authSubs.slice().forEach((f) => { try { f(s); } catch (e) {} }); },
        setMigStatus: (s) => { migStatus = s; },
        /* mimic BP4 broadcasting a status change (e.g. after "Keep & Protect") */
        settleMig: (s) => { migStatus = s; migSubs.slice().forEach((f) => { try { f(); } catch (e) {} }); },
        setDetect: (d) => { detectValue = d ? clone(d) : null; },
        setFailWriteKey: (k) => { failWriteKey = k || null; },
        rawFinancial: () => ls.getItem(FINANCIAL_KEY),
        rawSetup: () => ls.getItem(SETUP_KEY),
        rawDraft: () => ls.getItem(DRAFT_KEY),
        financialData: () => {
            const r = ls.getItem(FINANCIAL_KEY);
            return r == null ? null : JSON.parse(r);
        },
        cleanup: () => harness.cleanup()
    };
}


/* =====================================================
   FRESH USER DETECTION
   ===================================================== */

test("fresh: verified owner + default workspace + no record -> 'required', no financial write", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    const before = env.rawFinancial();

    env.firstRun.initialize();

    assert.equal(env.firstRun.getStatus(), "required");
    assert.equal(env.firstRun.getState().totalSteps, 4);
    assert.equal(env.rawFinancial(), before, "mWalletData untouched");
    assert.ok(!env.writes.includes(FINANCIAL_KEY), "no financial write during detection");
    assert.equal(env.guard(signedIn(USER_A)).release, false, "app held for the wizard");
    env.cleanup();
});

test("fresh: the setup guard releases the app the instant status becomes complete", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    env.firstRun.initialize();
    assert.equal(env.guard(signedIn(USER_A)).release, false);

    env.firstRun.updateDraft({ checkingBalanceCents: 25000 });
    env.firstRun.goToStep(4);
    const res = await env.firstRun.finish();

    assert.equal(res.ok, true);
    assert.equal(env.firstRun.getStatus(), "complete");
    assert.equal(env.guard(signedIn(USER_A)).release, true);
    env.cleanup();
});

test("unconfigured auth -> 'inactive', guard releases (developer never locked out)", () => {
    const env = makeEnv({ auth: unconfigured(), migStatus: "unconfigured", detect: ABSENT });
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "inactive");
    assert.equal(env.guard(unconfigured()).release, true);
    env.cleanup();
});

test("password recovery -> 'inactive' (BP3 recovery outranks first-run setup)", () => {
    const env = makeEnv({ auth: recovery(USER_A), migStatus: "owned", detect: FRESH });
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "inactive");
    env.cleanup();
});

test("BP4 ownership not verified -> BP5 stays 'inactive' and never overrides BP4", () => {
    ["needs_claim", "owner_mismatch", "checking", "error", "unconfigured"].forEach((s) => {
        const env = makeEnv({ auth: signedIn(USER_B), migStatus: s, detect: FRESH });
        env.firstRun.initialize();
        assert.equal(env.firstRun.getStatus(), "inactive", "migration status " + s);
        assert.equal(env.guard(signedIn(USER_B)).release, true, "BP5 releases; BP4 alone gates");
        env.cleanup();
    });
});

test("signed in but no resolvable user id -> 'inactive' (BP4 fail-closed stays authoritative)", () => {
    const env = makeEnv({
        auth: { configured: true, status: "signed_in", recoveryMode: false, user: null, session: null },
        migStatus: "owned", detect: FRESH
    });
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "inactive");
    env.cleanup();
});


/* =====================================================
   EXISTING USER AUTO-SKIP  (never re-ask, never overwrite)
   ===================================================== */

test("existing: meaningful legacy data + no record -> auto-skip, no balance wizard, data untouched", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned",
        financialMutate: (d) => {
            d.income.push({ id: "inc-1", source: "Salary", amount: 4200, frequency: "monthly" });
            d.accounts.checking.balance = 3150.42;
        },
        detect: meaningful(["income", "checking-balance"])
    });
    const before = env.rawFinancial();

    env.firstRun.initialize();

    assert.equal(env.firstRun.getStatus(), "existing");
    assert.equal(env.rawFinancial(), before, "established financial values never touched");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    const rec = JSON.parse(env.rawSetup());
    assert.equal(rec.source, "existing");
    assert.equal(rec.ownerUserId, USER_A);
    assert.equal(rec.status, "complete");
    assert.equal(env.guard(signedIn(USER_A)).release, true, "existing user goes straight to the app");
    env.cleanup();
});

test("existing: a real $3,150.42 checking balance is NEVER reset to $0 by an absent setup record", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned",
        financialMutate: (d) => { d.accounts.checking.balance = 3150.42; d.accounts.savings.balance = 900; },
        detect: meaningful(["checking-balance", "savings-balance"])
    });
    const dataBefore = env.financialData();

    env.firstRun.initialize();

    const dataAfter = env.financialData();
    assert.deepEqual(plain(dataAfter.accounts), plain(dataBefore.accounts), "account balances unchanged");
    assert.equal(env.firstRun.getStatus(), "existing");
    env.cleanup();
});

test("existing: a valid completion record for THIS user -> 'complete', zero writes", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned", detect: FRESH,
        setupRecord: { schemaVersion: 1, ownerUserId: USER_A, status: "complete", completedAt: "2026-08-20T00:00:00.000Z", source: "wizard" }
    });
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "complete");
    assert.equal(env.writes.length, 0, "completed user triggers no writes");
    env.cleanup();
});

test("existing: a completion record with source 'existing' -> status 'existing', stable across re-resolve", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned", detect: FRESH,
        setupRecord: { schemaVersion: 1, ownerUserId: USER_A, status: "complete", completedAt: "2026-08-20T00:00:00.000Z", source: "existing" }
    });
    env.firstRun.initialize();
    env.firstRun._resolve();
    env.firstRun._resolve();
    assert.equal(env.firstRun.getStatus(), "existing");
    assert.equal(env.writes.length, 0);
    env.cleanup();
});

test("existing: another account's completion record does NOT satisfy this user -> wizard runs, no id leak", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH,
        setupRecord: { schemaVersion: 1, ownerUserId: USER_B, status: "complete", completedAt: "2026-08-20T00:00:00.000Z", source: "wizard" }
    });
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "required");
    const blob = JSON.stringify(env.firstRun.getState()) + JSON.stringify(env.firstRun.diagnostics());
    assert.ok(!blob.includes(USER_B), "the other account's id is never exposed");
    env.cleanup();
});


/* ---- BALANCE-ONLY established workspaces (no income/bills/activity) ---- */

test("existing: a non-zero CHECKING balance alone -> auto-skip, no wizard, checking unchanged", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned",
        financialSetup: (s) => { s.setStartingBalance(2850, s.getCurrentMonthKey()); }
    });
    const before = env.rawFinancial();

    env.firstRun.initialize();

    assert.equal(env.firstRun.getStatus(), "existing", "balance-only workspace is established");
    assert.equal(env.rawFinancial(), before, "financial data byte-identical");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    assert.equal(env.rawDraft(), null, "no replacement-balance draft is created");
    assert.equal(env.financialData().accounts.checking.balance, 2850);
    assert.equal(env.financialData().months["2026-08"].startingBalance, 2850);
    assert.equal(env.guard(signedIn(USER_A)).release, true);
    env.cleanup();
});

test("existing: a non-zero SAVINGS balance alone -> auto-skip, no wizard, savings unchanged", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned",
        financialMutate: (d) => { d.accounts.savings.balance = 5000; }
    });
    const before = env.rawFinancial();

    env.firstRun.initialize();

    assert.equal(env.firstRun.getStatus(), "existing");
    assert.equal(env.rawFinancial(), before);
    assert.equal(env.rawDraft(), null);
    assert.equal(env.financialData().accounts.savings.balance, 5000);
    env.cleanup();
});

test("existing: a non-zero month startingBalance alone (cache desynced to 0) -> auto-skip", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned",
        financialMutate: (d) => {
            d.months["2026-08"] = {
                monthKey: "2026-08", startingBalance: 1234, endingBalance: 0,
                paychecks: [], bills: [], suppressedRecurringBillSeries: [],
                expenses: [], transactions: [], savingsDeposits: [], savingsTransfers: [],
                notes: "", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z"
            };
            d.accounts.checking.balance = 0;
        },
        detect: FRESH   /* BP4's detector only sees the (zero) cache */
    });
    const before = env.rawFinancial();

    env.firstRun.initialize();

    assert.equal(env.firstRun.getStatus(), "existing", "a non-zero startingBalance is established state");
    assert.equal(env.financialData().months["2026-08"].startingBalance, 1234, "not overwritten");
    assert.equal(env.rawFinancial(), before);
    assert.equal(env.rawDraft(), null);
    env.cleanup();
});

test("fresh: zero / default balances only -> wizard required (no false 'existing')", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "required");
    /* a materialized-but-empty current month with startingBalance 0 must NOT count */
    const env2 = makeEnv({
        auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH,
        financialSetup: (s) => { s.getMonth(s.getCurrentMonthKey()); }   /* materialize empty shell */
    });
    env2.firstRun.initialize();
    assert.equal(env2.firstRun.getStatus(), "required", "empty month shell (startingBalance 0) is still fresh");
    env.cleanup();
    env2.cleanup();
});

test("existing: BP4 settling needs_claim -> owned mid-session flips BP5 to 'existing' (no reload needed)", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "needs_claim",
        financialMutate: (d) => { d.accounts.checking.balance = 2850; }
    });
    env.firstRun.initialize();
    /* BP4 not verified yet -> BP5 dormant */
    assert.equal(env.firstRun.getStatus(), "inactive");

    /* user clicks "Keep & Protect My Data" -> BP4 broadcasts owned */
    env.settleMig("owned");

    assert.equal(env.firstRun.getStatus(), "existing", "balance-only workspace recognised immediately");
    assert.equal(JSON.parse(env.rawSetup()).source, "existing");
    assert.equal(env.rawDraft(), null);
    assert.equal(env.financialData().accounts.checking.balance, 2850, "untouched");
    env.cleanup();
});

test("existing (balance-only) + setup metadata write fails -> app still available, no wizard, BP4 still required", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned",
        financialMutate: (d) => { d.accounts.checking.balance = 2850; },
        failWriteKey: SETUP_KEY
    });
    const before = env.rawFinancial();

    env.firstRun.initialize();

    assert.equal(env.firstRun.getStatus(), "existing", "not the wizard");
    assert.equal(env.guard(signedIn(USER_A)).release, true, "BP5 fails open — owner reaches their wallet");
    assert.equal(env.rawFinancial(), before, "financial data unchanged despite the metadata failure");
    assert.equal(env.rawSetup(), null, "the metadata write genuinely failed");
    assert.equal(env.rawDraft(), null, "no replacement draft");

    /* BP4 stays authoritative: if ownership regresses, BP5 does not hold the app open */
    env.setMigStatus("owner_mismatch");
    env.firstRun._resolve(signedIn(USER_A));
    assert.equal(env.firstRun.getStatus(), "inactive");
    assert.equal(env.guard(signedIn(USER_A)).release, true, "BP5 releases; BP4's own guard now gates");
    env.cleanup();
});


/* =====================================================
   DRAFT  (owner-bound; local; never logged)
   ===================================================== */

test("draft: names + balances persist to the draft only; mWalletData untouched", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    const finBefore = env.rawFinancial();

    env.firstRun.updateDraft({ checkingName: "Everyday", checkingBalanceCents: 125000 });
    env.firstRun.updateDraft({ savingsName: "Rainy Day", savingsBalanceCents: 50000 });
    env.firstRun.updateDraft({ firstDayOfWeek: "monday" });

    const draft = JSON.parse(env.rawDraft());
    assert.equal(draft.schemaVersion, 1);
    assert.equal(draft.ownerUserId, USER_A);
    assert.equal(draft.values.checkingName, "Everyday");
    assert.equal(draft.values.checkingBalanceCents, 125000);
    assert.equal(draft.values.savingsName, "Rainy Day");
    assert.equal(draft.values.savingsBalanceCents, 50000);
    assert.equal(draft.values.firstDayOfWeek, "monday");

    assert.equal(env.rawFinancial(), finBefore, "mWalletData untouched by draft edits");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    env.cleanup();
});

test("draft: a saved draft is resumed (values + step) in a later session", () => {
    const s1 = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    s1.firstRun.initialize();
    s1.firstRun.updateDraft({ checkingBalanceCents: 90000, savingsName: "Nest Egg" });
    s1.firstRun.goToStep(3);
    const draftRaw = s1.rawDraft();
    s1.cleanup();

    const s2 = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH, draft: draftRaw });
    s2.firstRun.initialize();
    const v = s2.firstRun.getDraftValues();
    assert.equal(v.checkingBalanceCents, 90000);
    assert.equal(v.savingsName, "Nest Egg");
    assert.equal(s2.firstRun.getState().step, 3, "resumes at the saved step");
    s2.cleanup();
});

test("draft: a draft bound to a DIFFERENT owner is ignored (never applied / rendered)", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned", detect: FRESH,
        draft: {
            schemaVersion: 1, ownerUserId: USER_B, step: 3,
            values: { checkingName: "B-Secret", checkingBalanceCents: 999999, savingsName: "B", savingsBalanceCents: 12345, firstDayOfWeek: "monday" },
            updatedAt: "2026-08-20T00:00:00.000Z"
        }
    });
    env.firstRun.initialize();
    const v = env.firstRun.getDraftValues();
    assert.notEqual(v.checkingName, "B-Secret");
    assert.equal(v.checkingBalanceCents, 0, "the other owner's amount is not exposed");
    assert.equal(v.savingsBalanceCents, 0);
    assert.equal(env.firstRun.getState().step, 1, "starts fresh at step 1");
    env.cleanup();
});

test("draft: malformed JSON is never applied; wizard starts fresh, financial data preserved", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH, draft: "{ not json" });
    const before = env.rawFinancial();
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "required");
    assert.equal(env.firstRun.getState().step, 1);
    assert.equal(env.rawFinancial(), before);
    env.cleanup();
});

test("draft: money parsing rejects NaN / Infinity / scientific / malformed / oversize", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    const P = env.firstRun.parseMoneyToCents;
    assert.equal(P("abc").ok, false);
    assert.equal(P("1e10").ok, false);
    assert.equal(P("Infinity").ok, false);
    assert.equal(P("NaN").ok, false);
    assert.equal(P("12.345").ok, false, "more than 2 decimal places is rejected");
    assert.equal(P("1,250.00").cents, 125000);
    assert.equal(P("$4,126.80").cents, 412680);
    assert.equal(P("-42.50").cents, -4250);
    assert.equal(P("", { allowEmpty: true }).cents, 0);
    assert.equal(P("").ok, false, "empty is rejected unless allowEmpty");
    assert.equal(P("999999999999").ok, false, "over the max");
    env.cleanup();
});

test("draft: control characters are stripped from account names; long names are capped", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    const S = env.firstRun.sanitizeName;
    assert.equal(S("   ", "Checking"), "Checking", "blank falls back to the default");
    assert.ok(S("x".repeat(80), "Checking").length <= 40);
    assert.ok(!/[\u0000-\u001f\u007f]/.test(S("Main\u0007Checking", "Checking")), "control chars removed");
    env.cleanup();
});


/* =====================================================
   STEP NAVIGATION
   ===================================================== */

test("nav: Continue advances the step; Back preserves the draft", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    env.firstRun.initialize();

    env.firstRun.goToStep(2);
    env.firstRun.updateDraft({ checkingName: "Main", checkingBalanceCents: 30000, savingsName: "Savings" });
    const ok = env.firstRun.nextStep();
    assert.equal(ok.ok, true);
    assert.equal(env.firstRun.getState().step, 3);

    env.firstRun.previousStep();
    assert.equal(env.firstRun.getState().step, 2);
    assert.equal(env.firstRun.getDraftValues().checkingBalanceCents, 30000, "Back kept the draft");
    env.cleanup();
});

test("nav: an unsupported first day of week is rejected, draft unchanged", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    env.firstRun.initialize();
    const res = env.firstRun.updateDraft({ firstDayOfWeek: "wednesday" });
    assert.equal(res.ok, false);
    assert.equal(res.code, "bad_first_day");
    assert.equal(env.firstRun.getDraftValues().firstDayOfWeek, "sunday");
    env.cleanup();
});

test("nav: a negative savings balance is clamped to zero; checking may be negative (overdraft)", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ savingsBalanceCents: -5000 });
    assert.equal(env.firstRun.getDraftValues().savingsBalanceCents, 0);
    env.firstRun.updateDraft({ checkingBalanceCents: -5000 });
    assert.equal(env.firstRun.getDraftValues().checkingBalanceCents, -5000);
    env.cleanup();
});

test("nav: draft edits are refused once the wizard is no longer in an editable state", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    env.firstRun.initialize();
    env.setAuth(signedOut());          /* -> inactive */
    const res = env.firstRun.updateDraft({ checkingBalanceCents: 111 });
    assert.equal(res.ok, false);
    assert.equal(res.code, "not_editing");
    env.cleanup();
});


/* =====================================================
   FINISH TRANSACTION  (the ONLY intentional financial write)
   ===================================================== */

test("finish: applies ONLY the allowed fields; every other part of mWalletData is deep-equal", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    const before = env.financialData();

    env.firstRun.updateDraft({
        checkingName: "Everyday Checking", checkingBalanceCents: 128075,
        savingsName: "Emergency Fund", savingsBalanceCents: 500000,
        firstDayOfWeek: "monday"
    });
    env.firstRun.goToStep(4);
    const res = await env.firstRun.finish();
    assert.equal(res.ok, true);

    const after = env.financialData();
    assert.equal(after.accounts.checking.name, "Everyday Checking");
    assert.equal(after.accounts.savings.name, "Emergency Fund");
    assert.equal(after.accounts.savings.balance, 5000);
    assert.equal(after.settings.firstDayOfWeek, "monday");

    /* the checking opening balance is the current month's STARTING
       balance (what the app displays); accounts.checking.balance is
       the derived cache, kept in sync */
    assert.equal(after.months["2026-08"].startingBalance, 1280.75, "checking opening balance = month starting balance");
    assert.equal(after.accounts.checking.balance, 1280.75, "cache re-synced");

    /* the month carries ONLY the opening balance — no activity created */
    const m = after.months["2026-08"];
    ["bills", "paychecks", "expenses", "transactions", "savingsDeposits", "savingsTransfers"].forEach((k) => {
        assert.deepEqual(m[k], [], "month." + k + " stays empty");
    });
    assert.equal(m.notes, "");

    /* everything the wizard must NOT touch */
    const skip = new Set(["accounts", "settings", "months"]);
    Object.keys(before).forEach((k) => {
        if (skip.has(k)) { return; }
        assert.deepEqual(plain(after[k]), plain(before[k]), k + " must be unchanged");
    });
    Object.keys(after).forEach((k) => {
        assert.ok(Object.prototype.hasOwnProperty.call(before, k), "no new top-level key: " + k);
    });
    assert.deepEqual(plain(after.settings.categories), plain(before.settings.categories), "categories unchanged");
    assert.equal(after.settings.currency, before.settings.currency, "currency unchanged");
    assert.equal(after.settings.currencySymbol, before.settings.currencySymbol);
    env.cleanup();
});

test("finish: negative (overdraft) checking is applied as a negative opening balance", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: -12500 });
    env.firstRun.goToStep(4);
    const res = await env.firstRun.finish();
    assert.equal(res.ok, true);
    assert.equal(env.financialData().months["2026-08"].startingBalance, -125);
    env.cleanup();
});

test("finish: NEVER creates income / bills / transactions / savings goals / M-Cash entries", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 100000, savingsBalanceCents: 250000 });
    env.firstRun.goToStep(4);
    await env.firstRun.finish();

    const d = env.financialData();
    assert.deepEqual(d.income, []);
    assert.deepEqual(d.expenses, []);
    assert.deepEqual(d.savingsGoals, []);
    assert.deepEqual(d.savingsTransfers, []);
    assert.deepEqual(d.cash.history, []);
    assert.equal(d.cash.initialized, false);
    /* the only month is the current one, carrying just the opening balance */
    assert.deepEqual(Object.keys(d.months), ["2026-08"]);
    const m = d.months["2026-08"];
    assert.deepEqual(m.bills, []);
    assert.deepEqual(m.paychecks, []);
    assert.deepEqual(m.expenses, []);
    assert.deepEqual(m.transactions, []);
    env.cleanup();
});

test("finish: writes + verifies the completion record, clears the draft, refreshes the dashboard", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 42000 });
    assert.ok(env.rawDraft(), "draft exists before finish");

    env.firstRun.goToStep(4);
    const res = await env.firstRun.finish();
    assert.equal(res.ok, true);

    const rec = JSON.parse(env.rawSetup());
    assert.deepEqual(Object.keys(rec).sort(), ["completedAt", "ownerUserId", "schemaVersion", "source", "status"]);
    assert.equal(rec.source, "wizard");
    assert.equal(rec.status, "complete");
    assert.equal(rec.ownerUserId, USER_A);
    assert.equal(env.rawDraft(), null, "draft removed after completion");
    assert.equal(env.firstRun.getStatus(), "complete");
    assert.ok(env.appRefreshes() > 0, "dashboard refresh requested");
    env.cleanup();
});

test("finish: idempotent — a second finish is a no-op success with no duplicate work", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 33300 });
    env.firstRun.goToStep(4);

    const first = await env.firstRun.finish();
    assert.equal(first.ok, true);
    const financialAfterFirst = env.rawFinancial();
    const setupWrites = env.writes.filter((k) => k === SETUP_KEY).length;

    const second = await env.firstRun.finish();
    assert.equal(second.ok, true);
    assert.equal(second.alreadyComplete, true);
    assert.equal(env.rawFinancial(), financialAfterFirst, "no second financial write");
    assert.equal(env.writes.filter((k) => k === SETUP_KEY).length, setupWrites, "no extra completion write");
    env.cleanup();
});

test("finish: a workspace that became established mid-wizard is NOT overwritten — marked 'existing'", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingName: "Wizard", checkingBalanceCents: 9999999 });
    env.firstRun.goToStep(4);

    /* another tab established real activity between wizard start and Finish */
    env.setDetect(meaningful(["income"]));

    const res = await env.firstRun.finish();
    assert.equal(res.ok, true);
    assert.equal(res.reason, "existing_data");
    const d = env.financialData();
    assert.equal(d.accounts.checking.balance, 0, "the wizard balance was NOT applied over established data");
    assert.notEqual(d.accounts.checking.name, "Wizard");
    assert.equal(JSON.parse(env.rawSetup()).source, "existing");
    assert.equal(env.firstRun.getStatus(), "existing");
    env.cleanup();
});

test("finish: refuses if auth dropped to signed_out before the transaction", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 5000 });
    env.firstRun.goToStep(4);

    env.setAuth(signedOut());
    const res = await env.firstRun.finish();
    assert.equal(res.ok, false);
    assert.equal(res.code, "not_signed_in");
    assert.equal(env.rawSetup(), null, "no completion record written");
    env.cleanup();
});

test("finish: refuses if BP4 ownership can no longer be verified", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 5000 });
    env.firstRun.goToStep(4);

    env.setMigStatus("owner_mismatch");
    const res = await env.firstRun.finish();
    assert.equal(res.ok, false);
    assert.equal(res.code, "ownership");
    assert.equal(env.rawSetup(), null);
    env.cleanup();
});


/* =====================================================
   STORAGE FAILURE / SAFETY
   ===================================================== */

test("finish: financial save fails -> 'error', NOT complete, draft kept, balances not zeroed", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 77000 });
    env.firstRun.goToStep(4);

    env.harness.setFailWrites(true);
    const res = await env.firstRun.finish();
    env.harness.setFailWrites(false);

    assert.equal(res.ok, false);
    assert.equal(env.firstRun.getStatus(), "error");
    assert.equal(env.rawSetup(), null, "setup NOT marked complete");
    assert.ok(env.rawDraft(), "draft kept for retry");
    assert.equal(env.financialData().accounts.checking.balance, 0, "no partial / zeroed write");
    env.cleanup();
});

test("finish: completion-metadata write fails after a good financial save -> error; retry is idempotent, no double-apply, no false claim", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH, failWriteKey: SETUP_KEY });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 61000 });
    env.firstRun.goToStep(4);

    const res = await env.firstRun.finish();
    assert.equal(res.ok, false);
    assert.equal(res.code, "meta_write_failed");
    assert.equal(env.firstRun.getStatus(), "error");
    /* the message must NOT claim the financial data is unchanged — it isn't */
    assert.ok(!/not been changed|nothing was saved|no changes were made/i.test(res.message || ""), "no false 'unchanged' claim");
    assert.ok(!/not been changed|nothing was saved/i.test(env.firstRun.getState().error.message || ""));
    assert.equal(env.financialData().accounts.checking.balance, 610, "financial values ARE saved");
    assert.equal(env.financialData().months["2026-08"].startingBalance, 610);
    const accountsBeforeRetry = plain(env.financialData().accounts);

    env.setFailWriteKey(null);
    const retry = await env.firstRun.retry();
    assert.equal(retry.ok, true);
    assert.equal(env.firstRun.getStatus(), "complete");
    assert.deepEqual(plain(env.financialData().accounts), accountsBeforeRetry, "retry did not re-write financial data");
    assert.equal(env.financialData().months["2026-08"].startingBalance, 610, "opening balance not applied twice");
    assert.equal(JSON.parse(env.rawSetup()).source, "wizard");
    env.cleanup();
});

test("finish: setStartingBalance fails after account details save -> 'starting_balance_failed', retry completes", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingName: "Chk", checkingBalanceCents: 45000, savingsName: "Sav", savingsBalanceCents: 20000 });
    env.firstRun.goToStep(4);

    const realSetStarting = env.harness.storage.setStartingBalance.bind(env.harness.storage);
    env.harness.storage.setStartingBalance = () => null;   /* simulate the opening-balance write failing */
    const res = await env.firstRun.finish();
    env.harness.storage.setStartingBalance = realSetStarting;

    assert.equal(res.ok, false);
    assert.equal(res.code, "starting_balance_failed");
    assert.equal(env.firstRun.getStatus(), "error");
    assert.ok(!/not been changed|nothing was saved/i.test(res.message || ""), "message is truthful — details WERE saved");
    assert.equal(env.rawSetup(), null, "not marked complete");
    assert.ok(env.rawDraft(), "draft kept");
    /* account details did save; the opening balance is still pending */
    assert.equal(env.financialData().accounts.savings.balance, 200);
    assert.equal(env.financialData().accounts.checking.name, "Chk");
    assert.notEqual(env.financialData().months["2026-08"] && env.financialData().months["2026-08"].startingBalance, 450);

    /* retry is NOT reclassified as 'existing' even though savings is now non-zero */
    const retry = await env.firstRun.retry();
    assert.equal(retry.ok, true);
    assert.equal(env.firstRun.getStatus(), "complete");
    assert.equal(env.financialData().months["2026-08"].startingBalance, 450, "opening balance now applied");
    assert.equal(JSON.parse(env.rawSetup()).source, "wizard");
    env.cleanup();
});

test("interrupted Finish survives a reload: resolve() -> 'error' resume (not 'existing'), then retry completes", async () => {
    /* session 1: partial apply (details saved, opening balance fails) */
    const s1 = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    s1.firstRun.initialize();
    s1.firstRun.updateDraft({ checkingName: "Chk", checkingBalanceCents: 45000, savingsName: "Sav", savingsBalanceCents: 20000 });
    s1.firstRun.goToStep(4);
    s1.harness.storage.setStartingBalance = () => null;
    await s1.firstRun.finish();
    const draftRaw = s1.rawDraft();
    const financialRaw = s1.rawFinancial();
    s1.cleanup();
    assert.ok(/"applyStarted":true/.test(draftRaw), "the kept draft records the interrupted apply");

    /* session 2: fresh module, same storage (savings is now non-zero) */
    const s2 = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH, financialRaw: financialRaw, draft: draftRaw });
    s2.firstRun.initialize();
    assert.equal(s2.firstRun.getStatus(), "error", "resumes the interrupted Finish, not auto-skipped as existing");
    assert.equal(s2.firstRun.getState().error.code, "resume_finish");

    const retry = await s2.firstRun.retry();
    assert.equal(retry.ok, true);
    assert.equal(s2.firstRun.getStatus(), "complete");
    assert.equal(s2.financialData().months["2026-08"].startingBalance, 450);
    assert.equal(s2.financialData().accounts.savings.balance, 200);
    assert.equal(JSON.parse(s2.rawSetup()).source, "wizard");
    assert.equal(s2.rawDraft(), null, "draft cleared once complete");
    s2.cleanup();
});

test("finish: the entered checking balance lands on the CURRENT month, not a selected historical month", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    /* the Budget page happens to have a different month selected */
    env.harness.storage.getSelectedMonthKey = () => "2020-05";
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 100000 });
    env.firstRun.goToStep(4);
    const res = await env.firstRun.finish();
    assert.equal(res.ok, true);

    const d = env.financialData();
    assert.equal(d.months["2026-08"].startingBalance, 1000, "current month got the opening balance");
    const selected = d.months["2020-05"];
    assert.ok(!selected || Number(selected.startingBalance) === 0, "the selected historical month is untouched");
    env.cleanup();
});

test("finish: no MWalletStorage available -> 'error', no completion record", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 5000 });
    env.firstRun.goToStep(4);

    env.sandbox.MWalletStorage = null;
    env.sandbox.BudgetStorage = null;
    const res = await env.firstRun.finish();
    assert.equal(res.ok, false);
    assert.equal(res.code, "no_storage");
    assert.equal(env.firstRun.getStatus(), "error");
    assert.equal(env.rawSetup(), null);
    env.cleanup();
});

test("malformed completion record + meaningful data -> treated as existing, data preserved", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "owned",
        financialMutate: (d) => { d.income.push({ id: "i1", source: "Salary", amount: 4200 }); },
        detect: meaningful(["income"]),
        setupRecord: '{"schemaVersion":99,"garbage":true}'
    });
    const before = env.rawFinancial();
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "existing");
    assert.equal(env.rawFinancial(), before);
    env.cleanup();
});

test("corrupt mWalletData -> BP5 stays 'inactive' (BP4 owns that screen)", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: UNREADABLE });
    env.firstRun.initialize();
    assert.equal(env.firstRun.getStatus(), "inactive");
    env.cleanup();
});


/* =====================================================
   SIGN OUT MID-WIZARD
   ===================================================== */

test("sign out mid-wizard: draft preserved, financial data untouched, status -> inactive; sign-in resumes", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingBalanceCents: 88800, savingsName: "Buffer" });
    const draftBefore = env.rawDraft();
    const finBefore = env.rawFinancial();

    env.setAuth(signedOut());
    assert.equal(env.firstRun.getStatus(), "inactive");
    assert.equal(env.rawDraft(), draftBefore, "draft preserved");
    assert.equal(env.rawFinancial(), finBefore, "financial data untouched");
    assert.ok(!env.removes.includes(FINANCIAL_KEY));

    env.setMigStatus("owned");
    env.setAuth(signedIn(USER_A));
    assert.equal(env.firstRun.getStatus(), "required");
    assert.equal(env.firstRun.getDraftValues().checkingBalanceCents, 88800, "resumed from the draft");
    env.cleanup();
});


/* =====================================================
   GUARD CONTRACT (fail-open)
   ===================================================== */

test("guard: registered synchronously at load; holds only for required/saving/checking/error", async () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    assert.equal(typeof env.sandbox.__guard, "function", "guard registered at module load");

    /* before initialize(): status is 'checking' -> hold */
    assert.equal(env.guard(signedIn(USER_A)).release, false);

    env.firstRun.initialize();               /* -> required */
    assert.equal(env.guard(signedIn(USER_A)).release, false);

    env.firstRun.updateDraft({ checkingBalanceCents: 1000 });
    env.firstRun.goToStep(4);
    await env.firstRun.finish();              /* -> complete */
    assert.equal(env.guard(signedIn(USER_A)).release, true);

    /* not-signed-in snapshot -> release (auth/BP4 own that path) */
    assert.equal(env.guard(signedOut()).release, true);
    env.cleanup();
});


/* =====================================================
   DIAGNOSTICS  (no sensitive data)
   ===================================================== */

test("diagnostics + state expose no owner id, no draft values, no financial contents; nothing sensitive logged", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", detect: FRESH });
    env.firstRun.initialize();
    env.firstRun.updateDraft({ checkingName: "Diag-Secret-Name", checkingBalanceCents: 424242 });

    const blob = JSON.stringify(env.firstRun.diagnostics()) + JSON.stringify(env.firstRun.getState());
    assert.ok(!blob.includes(USER_A), "no owner id");
    assert.ok(!blob.includes("Diag-Secret-Name"), "no draft name");
    assert.ok(!blob.includes("424242"), "no draft balance");
    assert.ok(!/token|password|session/i.test(blob));

    const log = env.consoleText();
    assert.ok(!log.includes("Diag-Secret-Name"), "draft never logged");
    assert.ok(!log.includes(USER_A), "owner id never logged");
    env.cleanup();
});

test("setup code makes no network calls and defines only local metadata keys", () => {
    assert.ok(!/\bfetch\s*\(/.test(SETUP_SRC), "no fetch()");
    assert.ok(!/XMLHttpRequest/.test(SETUP_SRC), "no XMLHttpRequest");
    assert.ok(!/createClient|supabase\./i.test(SETUP_SRC), "no Supabase usage");
    assert.ok(!/sb_secret_|service_role/.test(SETUP_SRC), "no secret key references");
    assert.ok(SETUP_SRC.includes('"mwallet.setup.v1"'));
    assert.ok(SETUP_SRC.includes('"mwallet.setup.draft.v1"'));
});
