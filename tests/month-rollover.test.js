"use strict";

/* =========================================================
   BP12 — AUTOMATIC MONTH-TO-MONTH CHECKING BALANCE CONTINUITY

   A month without an explicit manual opening balance opens at
   the previous month's resulting ending balance. This is
   DERIVED FRESH on every read (resolveMonthStartingBalance) —
   never a one-time copied value — so a later correction to an
   earlier month flows forward. Manual overrides
   (setStartingBalance / first-run setup) are used verbatim and
   break the chain for that month only.

   Exercises the real js/storage.js via the harness, plus the
   real js/cloud/cloud-financial-codec.js for the sync path.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { StorageHarness, storageKey } = require("./helpers/storage-harness.js");

const ROOT = path.resolve(__dirname, "..");

function freshH() {
    return new StorageHarness();
}

function fresh() {
    return new StorageHarness().storage;
}

/* the raw stored blob (NOT storage.load(), which re-normalizes) */
function rawBlob(harness) {
    return JSON.parse(harness.localStorage.getItem(storageKey));
}

/* a positive manual transaction = income, a negative one = expense */
function addActivity(storage, monthKey, amount, date) {
    return storage.addTransaction(
        { description: "activity", amount: amount, date: date || (monthKey + "-10") },
        monthKey
    );
}

function start(storage, monthKey) {
    return storage.getMonthlySummary(monthKey).startingBalance;
}

function ending(storage, monthKey) {
    return storage.getMonthlySummary(monthKey).endingBalance;
}


/* ---- A. automatic rollover ---------------------------- */

test("A. August ends at $16.86 -> September automatically starts at $16.86", () => {
    const s = fresh();
    addActivity(s, "2026-08", 16.86);

    assert.equal(ending(s, "2026-08"), 16.86);
    assert.equal(start(s, "2026-09"), 16.86, "September opening = August closing");
    assert.equal(s.getMonthSnapshot("2026-09").startingBalance, 16.86, "the Budget-page snapshot agrees");
    assert.equal(s.getStartingBalance("2026-09"), 16.86, "the public getter agrees");
});

test("A2. the derived opening balance is NOT persisted onto the auto month", () => {
    const h = freshH();
    addActivity(h.storage, "2026-08", 16.86);
    h.storage.getMonthSnapshot("2026-09");
    h.storage.getMonthlySummary("2026-09");

    const raw = rawBlob(h);
    assert.equal(raw.months["2026-09"].startingBalance, 0, "stored startingBalance stays the 0 sentinel");
    assert.equal(raw.months["2026-09"].startingBalanceManual, false, "and it is flagged automatic");
});


/* ---- B. calendar-year rollover ----------------------- */

test("B. December 2026 -> January 2027 carries forward", () => {
    const s = fresh();
    addActivity(s, "2026-12", 425.50, "2026-12-15");

    assert.equal(ending(s, "2026-12"), 425.5);
    assert.equal(start(s, "2027-01"), 425.5, "January 2027 opens at December 2026's close");
});

test("B2. a multi-month gap: October derives from August when September has no data", () => {
    const s = fresh();
    addActivity(s, "2026-08", 200, "2026-08-05");
    /* no September activity at all */
    assert.equal(start(s, "2026-10"), 200, "October opens at the most recent earlier month with data");
});


/* ---- C. negative balances carry forward -------------- */

test("C. a negative ending balance rolls forward unchanged (never clamped to 0)", () => {
    const s = fresh();
    addActivity(s, "2026-08", -42.18);

    assert.equal(ending(s, "2026-08"), -42.18);
    assert.equal(start(s, "2026-09"), -42.18, "overdraft carries forward");
});

test("C2. a swing from positive to negative and back carries correctly", () => {
    const s = fresh();
    addActivity(s, "2026-08", 100, "2026-08-05");
    addActivity(s, "2026-09", -250, "2026-09-05");     /* Sep: 100 - 250 = -150 */
    addActivity(s, "2026-10", 400, "2026-10-05");      /* Oct: -150 + 400 = 250 */

    assert.equal(start(s, "2026-09"), 100);
    assert.equal(ending(s, "2026-09"), -150);
    assert.equal(start(s, "2026-10"), -150);
    assert.equal(ending(s, "2026-10"), 250);
});


/* ---- D. previous-month corrections flow forward ------ */

test("D. correcting an earlier month updates the next auto-start month (not a stale copy)", () => {
    const s = fresh();
    addActivity(s, "2026-08", 100, "2026-08-05");
    assert.equal(start(s, "2026-09"), 100);

    /* correct August: add another $25 */
    addActivity(s, "2026-08", 25, "2026-08-20");

    assert.equal(ending(s, "2026-08"), 125);
    assert.equal(start(s, "2026-09"), 125, "September auto-start tracks the correction");
});

test("D2. a correction three months back propagates through every auto month", () => {
    const s = fresh();
    addActivity(s, "2026-08", 100, "2026-08-05");
    addActivity(s, "2026-09", 10, "2026-09-05");
    addActivity(s, "2026-10", 5, "2026-10-05");
    assert.equal(start(s, "2026-11"), 115);       /* 100 + 10 + 5 */

    addActivity(s, "2026-08", 1000, "2026-08-28");   /* big August correction */

    assert.equal(start(s, "2026-09"), 1100);
    assert.equal(start(s, "2026-10"), 1110);
    assert.equal(start(s, "2026-11"), 1115, "the correction reaches November");
});


/* ---- E/F/G. manual overrides ------------------------- */

test("E. a manual next-month starting balance overrides the rollover", () => {
    const s = fresh();
    addActivity(s, "2026-08", 100, "2026-08-05");
    s.setStartingBalance(500, "2026-09");

    assert.equal(start(s, "2026-09"), 500, "the manual value wins over the $100 carry-forward");
});

test("F. a manual override stays stable when the previous month changes", () => {
    const s = fresh();
    addActivity(s, "2026-08", 100, "2026-08-05");
    s.setStartingBalance(500, "2026-09");

    addActivity(s, "2026-08", 999, "2026-08-06");   /* August now ends at 1099 */

    assert.equal(start(s, "2026-09"), 500, "September's manual opening balance is unchanged");
});

test("G. the month after a manual month derives from THAT month's ending balance", () => {
    const s = fresh();
    addActivity(s, "2026-08", 100, "2026-08-05");
    s.setStartingBalance(500, "2026-09");
    addActivity(s, "2026-09", 30, "2026-09-10");     /* September: 500 + 30 = 530 */

    assert.equal(ending(s, "2026-09"), 530);
    assert.equal(start(s, "2026-10"), 530, "October (auto) resumes from September's ending");
});

test("G2. clearing a manual override restores automatic carry-forward", () => {
    const s = fresh();
    addActivity(s, "2026-08", 100, "2026-08-05");
    s.setStartingBalance(500, "2026-09");
    assert.equal(start(s, "2026-09"), 500);

    s.clearStartingBalanceOverride("2026-09");
    assert.equal(start(s, "2026-09"), 100, "September resumes deriving from August");
});


/* ---- H. first-run setup opening balance -------------- */

test("H. the first-run setup opening balance stays an explicit manual value", () => {
    const h = freshH();
    const s = h.storage;
    /* mirrors first-run-setup.js: setStartingBalance on the current month */
    s.setStartingBalance(1284.60, "2026-08");
    addActivity(s, "2026-08", -84.60, "2026-08-15");   /* August activity, ends at 1200 */

    const raw = rawBlob(h);
    assert.equal(raw.months["2026-08"].startingBalance, 1284.60, "not replaced by a previous-month value");
    assert.equal(raw.months["2026-08"].startingBalanceManual, true);
    assert.equal(start(s, "2026-08"), 1284.60);
    assert.equal(ending(s, "2026-08"), 1200);
    assert.equal(start(s, "2026-09"), 1200, "the next month still rolls over from it");
});

test("H2. a fresh month with no prior data and no override opens at 0", () => {
    const s = fresh();
    assert.equal(start(s, "2026-08"), 0);
    assert.equal(s.getMonthSnapshot("2026-08").startingBalance, 0);
});


/* ---- I. legacy / existing-data compatibility --------- */

test("I. a legacy month (no flag) with a non-zero starting balance is preserved as manual", () => {
    const h = new StorageHarness();
    const s = h.storage;

    const data = s.load();
    data.months["2026-05"] = {
        monthKey: "2026-05", startingBalance: 300, endingBalance: 0,
        paychecks: [], bills: [], expenses: [], transactions: [],
        savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
        /* NOTE: no startingBalanceManual field — legacy shape */
    };
    s.save(data);

    const reloaded = s.load();
    assert.equal(reloaded.months["2026-05"].startingBalance, 300, "the historical value is not rewritten");
    assert.equal(reloaded.months["2026-05"].startingBalanceManual, true, "inferred manual (non-zero, no flag)");
    assert.equal(start(s, "2026-06"), 300, "the next month derives from the legacy opening balance");
});

test("I2. a legacy month with startingBalance 0 and no flag becomes automatic", () => {
    const h = new StorageHarness();
    const s = h.storage;

    const data = s.load();
    data.months["2026-06"] = {
        monthKey: "2026-06", startingBalance: 0, endingBalance: 0,
        paychecks: [], bills: [], expenses: [], transactions: [],
        savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
    };
    data.months["2026-05"] = {
        monthKey: "2026-05", startingBalance: 0, endingBalance: 0,
        paychecks: [], bills: [], expenses: [],
        transactions: [{ id: "t1", description: "x", amount: 77, date: "2026-05-10" }],
        savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
    };
    s.save(data);

    const reloaded = s.load();
    assert.equal(reloaded.months["2026-06"].startingBalanceManual, false, "zero + no flag -> automatic");
    assert.equal(start(s, "2026-06"), 77, "June now carries May's $77 forward");
});

test("I3. an explicit startingBalanceManual:false is honoured even with a non-zero value", () => {
    const h = new StorageHarness();
    const s = h.storage;

    /* a month written by the NEW code: auto flag present, value is a
       previously-derived amount that must stay derived */
    const data = s.load();
    data.months["2026-07"] = {
        monthKey: "2026-07", startingBalance: 999, startingBalanceManual: false, endingBalance: 0,
        paychecks: [], bills: [], expenses: [], transactions: [],
        savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
    };
    data.months["2026-06"] = {
        monthKey: "2026-06", startingBalance: 0, startingBalanceManual: false, endingBalance: 0,
        paychecks: [], bills: [], expenses: [],
        transactions: [{ id: "t1", description: "x", amount: 40, date: "2026-06-10" }],
        savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
    };
    s.save(data);

    assert.equal(s.load().months["2026-07"].startingBalanceManual, false);
    assert.equal(start(s, "2026-07"), 40, "an explicit auto flag overrides the legacy non-zero inference");
});


/* ---- J. cloud / multi-device codec round-trip -------- */

function loadCodec() {
    const sandbox = { window: {}, console };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(
        fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-codec.js"), "utf8"),
        sandbox, { filename: "cloud-financial-codec.js" }
    );
    return sandbox.window.MWalletCloudFinancialCodec;
}

test("J. the manual/auto flag survives cloud encode -> decode -> Device B", () => {
    const codec = loadCodec();

    const deviceA = fresh();
    addActivity(deviceA, "2026-08", 100, "2026-08-05");   /* auto */
    deviceA.setStartingBalance(500, "2026-09");           /* manual */
    addActivity(deviceA, "2026-09", 30, "2026-09-10");

    const encoded = codec.encodeFinancialState(deviceA.load());
    assert.equal(encoded.ok, true);

    const augDoc = encoded.documents.find((d) => d.documentType === "month" && d.documentKey === "2026-08");
    const sepDoc = encoded.documents.find((d) => d.documentType === "month" && d.documentKey === "2026-09");
    assert.equal(augDoc.payload.startingBalanceManual, false, "auto month encodes its flag");
    assert.equal(sepDoc.payload.startingBalanceManual, true, "manual month encodes its flag");
    assert.equal(sepDoc.payload.startingBalance, 500);

    const rows = encoded.documents.map((d) => ({
        documentType: d.documentType, documentKey: d.documentKey, payload: d.payload
    }));
    const decoded = codec.decodeFinancialDocuments(rows);
    assert.equal(decoded.ok, true);
    assert.equal(decoded.state.months["2026-09"].startingBalanceManual, true);

    /* Device B loads the decoded slice and resolves the same way */
    const deviceB = fresh();
    const bData = Object.assign(deviceB.load(), decoded.state);
    bData.version = 5;
    deviceB.save(bData);

    assert.equal(deviceB.getMonthlySummary("2026-09").startingBalance, 500, "B: manual month unchanged");
    assert.equal(deviceB.getMonthlySummary("2026-10").startingBalance, 530, "B: October auto-derives from Sep's ending");
});

test("J2. an auto month with no persisted starting balance still resolves on Device B", () => {
    const codec = loadCodec();

    const deviceA = fresh();
    addActivity(deviceA, "2026-08", 250.75, "2026-08-05");
    deviceA.getMonthSnapshot("2026-09");   /* materialize September as an auto month */

    const encoded = codec.encodeFinancialState(deviceA.load());
    const sepDoc = encoded.documents.find((d) => d.documentType === "month" && d.documentKey === "2026-09");
    assert.equal(sepDoc.payload.startingBalance, 0, "auto month ships the 0 sentinel, not a baked value");
    assert.equal(sepDoc.payload.startingBalanceManual, false);

    const rows = encoded.documents.map((d) => ({
        documentType: d.documentType, documentKey: d.documentKey, payload: d.payload
    }));
    const decoded = codec.decodeFinancialDocuments(rows);

    const deviceB = fresh();
    const bData = Object.assign(deviceB.load(), decoded.state);
    bData.version = 5;
    deviceB.save(bData);

    assert.equal(deviceB.getMonthlySummary("2026-09").startingBalance, 250.75, "B derives September from August");
});


/* ---- K. no sync noise from reading a rollover month -- */

test("K. reading an auto-rollover month does not change the stored data", () => {
    const h = new StorageHarness();
    const s = h.storage;
    addActivity(s, "2026-08", 16.86, "2026-08-10");

    s.getMonthSnapshot("2026-09");                       /* prime once */
    const before = h.localStorage.getItem(storageKey);

    for (let i = 0; i < 6; i += 1) {
        assert.equal(s.getMonthSnapshot("2026-09").startingBalance, 16.86);
        assert.equal(s.getMonthlySummary("2026-09").startingBalance, 16.86);
        assert.equal(s.resolveMonthStartingBalance("2026-09"), 16.86);
    }

    const after = h.localStorage.getItem(storageKey);
    assert.equal(after, before, "the stored mWalletData blob is byte-identical across repeated reads");
});

test("K2. resolveMonthStartingBalance suppresses the financial-saved counter symmetrically", () => {
    const s = fresh();
    addActivity(s, "2026-08", 10, "2026-08-05");
    const beforeCounter = s._suppressFinancialSaved;

    s.resolveMonthStartingBalance("2026-09");
    assert.equal(s._suppressFinancialSaved, beforeCounter, "auto path leaves the suppression counter balanced");

    s.setStartingBalance(999, "2026-09");
    s.resolveMonthStartingBalance("2026-09");
    assert.equal(s._suppressFinancialSaved, beforeCounter, "manual (early-return) path is balanced too");
});


/* ---- preservation of existing formulas --------------- */

test("the ending-balance formula stays: start + income - bills - expenses - savings", () => {
    const s = fresh();
    s.setStartingBalance(1000, "2026-08");
    s.addTransaction({ description: "pay", amount: 500, date: "2026-08-03" }, "2026-08");
    s.addBill({ name: "Power", amount: 120, dueDate: "2026-08-12", category: "Utilities" }, "2026-08");
    s.addExpense({ name: "Food", amount: 80, date: "2026-08-09", category: "Groceries" }, "2026-08");
    s.depositToSavings(150, { date: "2026-08-15", monthKey: "2026-08" });

    const sum = s.getMonthlySummary("2026-08");
    assert.equal(sum.startingBalance, 1000);
    assert.equal(
        sum.endingBalance,
        sum.startingBalance + sum.income - sum.bills - sum.expenses - sum.savings
    );
    assert.equal(sum.endingBalance, 1000 + 500 - 120 - 80 - 150);
});

test("a manual month's own ending balance and downstream rollover both use the same formula", () => {
    const s = fresh();
    s.setStartingBalance(2000, "2026-08");
    s.addBill({ name: "Rent", amount: 1500, dueDate: "2026-08-01", category: "Housing" }, "2026-08");

    assert.equal(ending(s, "2026-08"), 500);
    assert.equal(start(s, "2026-09"), 500);
    assert.equal(s.calculateEndingBalance("2026-08"), 500, "calculateEndingBalance agrees");
});
