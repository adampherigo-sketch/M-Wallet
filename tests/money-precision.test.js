"use strict";

/* =========================================================
   MONEY PRECISION — WHOLE CENTS

   Regressions for money kept as unrounded floats:

     - depositing $10.10 + $20.20 left General Savings at
       30.299999999999997, so allocating the $30.30 the screen
       showed was refused;
     - ten $0.10 deposits left 0.9999999999999999, so
       withdrawing $1.00 was refused.

   The engine now does every balance change, balance check and
   total in integer cents. Wallets already saved with float
   residue are tidied ONLY by the explicit, idempotent
   cleanupStoredMoneyPrecision() — never automatically.

   Exercises the real js/storage.js via the harness.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { StorageHarness, storageKey } = require("./helpers/storage-harness.js");
const { createAccountEnv } = require("./helpers/account-harness.js");

const ROOT = path.resolve(__dirname, "..");
const MONEY_SRC = fs.readFileSync(path.join(ROOT, "js/money.js"), "utf8");
const BACKUP_KEY = "mWalletData-backup-before-cents-cleanup";

const AUG = "2026-08";

function fresh(startingBalance = 5000) {
    const storage = new StorageHarness().storage;
    storage.setStartingBalance(startingBalance, AUG);
    return storage;
}

function isWholeCents(value) {
    return Number.isFinite(value) && Math.round(value * 100) / 100 === value;
}

function cents(value) {
    return Math.round(Number((value * 100).toPrecision(15)));
}

/* values built inside the storage vm have the vm realm's prototypes;
   copy them into this realm before a strict deepEqual */
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}


/* ---- the two reproduced bugs -------------------------------------- */

test("REGRESSION: after depositing $10.10 + $20.20, allocating the full $30.30 works", () => {
    const s = fresh();
    s.depositToSavings(10.10, { date: "2026-08-05", monthKey: AUG });
    s.depositToSavings(20.20, { date: "2026-08-06", monthKey: AUG });

    assert.equal(s.getSavingsBalance(), 30.3, "General Savings reads exactly $30.30");
    assert.equal(s.load().accounts.savings.balance, 30.3, "and is STORED as exactly 30.3");

    const goal = s.addSavingsGoal({ name: "Trip", targetAmount: 30.30 }, AUG);
    const result = s.allocateSavingsToGoal(goal.id, 30.30, { date: "2026-08-07" });

    assert.equal(result.savingsBalance, 0);
    assert.equal(result.goal.currentAmount, 30.3);
    assert.equal(result.goal.completed, true, "the fund is funded to the cent");
    assert.equal(s.getTotalSavingsBalance(), 30.3, "no money created or destroyed");
});

test("REGRESSION: after ten $0.10 deposits, withdrawing $1.00 works", () => {
    const s = fresh(100);
    for (let i = 0; i < 10; i += 1) {
        s.depositToSavings(0.10, { date: "2026-08-05", monthKey: AUG });
    }

    assert.equal(s.load().accounts.savings.balance, 1, "stored as exactly 1");

    s.withdrawFromSavings(1.00, { date: "2026-08-06", monthKey: AUG });
    assert.equal(s.getSavingsBalance(), 0);
    assert.equal(s.getCheckingAccountBalance(), 100, "Checking is back to exactly $100.00");
});


/* ---- engine-wide properties ---------------------------------------- */

test("every stored balance stays whole cents, and money is conserved, across many mixed moves", () => {
    const s = fresh(1000);
    const goalA = s.addSavingsGoal({ name: "A", targetAmount: 50 }, AUG);
    const goalB = s.addSavingsGoal({ name: "B", targetAmount: 33.33 }, AUG);
    const amounts = [0.1, 0.2, 0.3, 19.99, 33.33, 0.07, 10.1, 20.2];

    amounts.forEach((amount, i) => {
        s.depositToSavings(amount, { date: "2026-08-05", monthKey: AUG });
        s.allocateSavingsToGoal(i % 2 ? goalA.id : goalB.id, amount / 2 > 0.01 ? Math.round(amount * 50) / 100 : 0.01, { date: "2026-08-06" });
    });
    s.releaseSavingsFromGoal(goalB.id, 0.05, { date: "2026-08-07" });
    s.withdrawFromSavings(0.3, { date: "2026-08-08", monthKey: AUG });

    const data = s.load();
    const stored = [
        data.accounts.savings.balance,
        data.accounts.checking.balance,
        ...data.savingsGoals.map((g) => g.currentAmount),
        ...data.savingsTransfers.map((t) => t.amount),
        ...data.months[AUG].savingsDeposits.map((d) => d.amount)
    ];
    stored.forEach((value) => assert.ok(isWholeCents(value), `${value} is whole cents`));

    const deposited = amounts.reduce((total, a) => total + cents(a), 0) - cents(0.3);
    assert.equal(cents(s.getTotalSavingsBalance()), deposited, "Savings + funds = everything moved in, to the cent");
    assert.equal(cents(s.getCheckingAccountBalance()) + deposited, cents(1000), "Checking + Savings = the $1,000 start");
});

test("monthly totals and the summary are exact to the cent (0.1 + 0.2 = 0.3)", () => {
    const s = fresh(0);
    s.addIncome({ source: "A", amount: 0.1, type: "other", date: "2026-08-02" });
    s.addIncome({ source: "B", amount: 0.2, type: "other", date: "2026-08-03" });
    s.addTransaction({ description: "coffee", amount: -0.1, date: "2026-08-04" }, AUG);
    s.addTransaction({ description: "snack", amount: -0.2, date: "2026-08-04" }, AUG);

    assert.equal(s.getTotalIncome(AUG), 0.3);
    assert.equal(s.getTotalExpenses(AUG), 0.3);

    const summary = s.getMonthlySummary(AUG);
    assert.equal(summary.remaining, 0);
    assert.equal(summary.endingBalance, 0);
    assert.ok(!Object.is(summary.endingBalance, -0), "never -0 (it would display as -$0.00)");
});

test("a fund reaching its target through fractional allocations is marked funded", () => {
    const s = fresh();
    s.depositToSavings(0.3, { date: "2026-08-05", monthKey: AUG });
    const goal = s.addSavingsGoal({ name: "Tiny", targetAmount: 0.3 }, AUG);
    s.allocateSavingsToGoal(goal.id, 0.1, { date: "2026-08-06" });
    s.allocateSavingsToGoal(goal.id, 0.2, { date: "2026-08-06" });

    const saved = s.getSavingsGoalById(goal.id);
    assert.equal(saved.currentAmount, 0.3);
    assert.equal(saved.completed, true);
});

test("the money form's own pre-checks (money.js) use the same whole-cent rule", () => {
    const start = MONEY_SRC.indexOf("function validateSavingsRecord(");
    const end = MONEY_SRC.indexOf("\nfunction ", start + 1);
    const body = MONEY_SRC.slice(start, end);
    assert.ok(!/record\.amount\s*>\s*available/.test(body), "no raw float comparison left");
    assert.equal((body.match(/toMoneyCents\(\s*record\.amount\s*\)\s*>\s*toMoneyCents\(\s*available\s*\)/g) || []).length, 3,
        "withdrawal, allocation and release all compare whole cents");
});


/* ---- cleanup of wallets saved BEFORE the fix ----------------------- */

/* A wallet as the old float engine left it: General Savings
   30.299999999999997, a fund at 0.30000000000000004, drifted
   Checking / month ending balances and a drifted transfer, plus
   one REAL sub-cent amount (an imported $1.005) that must not be
   touched. */
function walletSavedByOldEngine() {
    const h = new StorageHarness();
    const s = h.storage;
    s.setStartingBalance(5000, AUG);
    s.depositToSavings(10.10, { date: "2026-08-05", monthKey: AUG });
    s.depositToSavings(20.20, { date: "2026-08-06", monthKey: AUG });
    s.addSavingsGoal({ name: "Trip", targetAmount: 100 }, AUG);
    s.addIncome({ source: "Imported", amount: 1.005, type: "other", date: "2026-08-09" });

    const wallet = h.rawData;
    wallet.accounts.savings.balance = 10.1 + 20.2;            /* 30.299999999999997 */
    wallet.savingsGoals[0].currentAmount = 0.1 + 0.2;         /* 0.30000000000000004 */
    wallet.accounts.checking.balance = 4969.7 + 1e-12;        /* drifted */
    wallet.months[AUG].endingBalance = 4969.7 + 1e-12;
    wallet.savingsTransfers.push({
        id: "transfer-old", type: "savings-to-goal", goalId: wallet.savingsGoals[0].id,
        goalName: "Trip", amount: 0.1 + 0.2, date: "2026-08-07", notes: ""
    });
    return wallet;
}

function harnessWith(wallet) {
    return new StorageHarness({ preloadedData: wallet });
}

/* set a value at a cleanup report path like "months.2026-08.savingsDeposits[1].amount" */
function setAtPath(root, dotted, value) {
    const parts = dotted.split(".").flatMap((part) => {
        const m = part.match(/^([^[]+)((?:\[\d+\])*)$/);
        const indexes = [...(m[2] || "").matchAll(/\[(\d+)\]/g)].map((x) => Number(x[1]));
        return [m[1], ...indexes];
    });
    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) { node = node[parts[i]]; }
    node[parts[parts.length - 1]] = value;
}

test("cleanup NEVER runs by itself: loading and reading a drifted wallet leaves it untouched", () => {
    const h = harnessWith(walletSavedByOldEngine());
    h.storage.load();
    h.storage.getMonthlySummary(AUG);
    h.storage.getSavingsBalance();

    const raw = JSON.parse(h.localStorage.getItem(storageKey));
    assert.equal(raw.accounts.savings.balance, 30.299999999999997, "still exactly as saved");
    assert.equal(raw.savingsGoals[0].currentAmount, 0.30000000000000004);
    assert.equal(h.localStorage.getItem(BACKUP_KEY), null, "no backup made");
});

test("with the fixed math, the drifted wallet already behaves correctly BEFORE any cleanup", () => {
    const h = harnessWith(walletSavedByOldEngine());
    const s = h.storage;
    assert.equal(s.getSavingsBalance(), 30.3, "reads as $30.30");
    assert.equal(s.getTotalSavingsBalance(), 30.6, "30.30 available + 0.30 in the fund");

    const goal = s.getSavingsGoals()[0];
    s.allocateSavingsToGoal(goal.id, 30.30, { date: "2026-08-10" });
    assert.equal(s.getSavingsBalance(), 0, "the full $30.30 moved");
    assert.equal(s.getSavingsGoalById(goal.id).currentAmount, 30.6);
});

test("cleanup dry run: reports exactly what would change and writes nothing", () => {
    const h = harnessWith(walletSavedByOldEngine());
    const before = h.localStorage.getItem(storageKey);

    const report = h.storage.cleanupStoredMoneyPrecision({ dryRun: true });

    assert.equal(report.ok, true);
    assert.equal(report.dryRun, true);
    assert.equal(report.applied, false);
    assert.deepEqual(
        plain(report.changes.map((c) => c.path)).sort(),
        [
            "accounts.checking.balance",
            "accounts.savings.balance",
            "months.2026-08.endingBalance",
            "savingsGoals[0].currentAmount",
            "savingsTransfers[0].amount"
        ].sort()
    );
    const savings = report.changes.find((c) => c.path === "accounts.savings.balance");
    assert.equal(savings.from, 30.299999999999997);
    assert.equal(savings.to, 30.3);
    assert.deepEqual(plain(report.skipped.map((x) => x.path)), ["income[0].amount"], "the real $1.005 is reported, not changed");
    assert.equal(h.localStorage.getItem(storageKey), before, "stored wallet byte-identical");
    assert.equal(h.localStorage.getItem(BACKUP_KEY), null, "no backup written by a dry run");
});

test("cleanup apply: rounds only float residue, keeps everything else as saved, and backs up the original first", () => {
    const h = harnessWith(walletSavedByOldEngine());
    const beforeText = h.localStorage.getItem(storageKey);
    const before = JSON.parse(beforeText);

    const result = h.storage.cleanupStoredMoneyPrecision();

    assert.equal(result.ok, true);
    assert.equal(result.applied, true);
    assert.equal(result.changes.length, 5);
    assert.equal(result.backupKey, BACKUP_KEY);
    assert.equal(h.localStorage.getItem(BACKUP_KEY), beforeText, "backup = the untouched original, byte for byte");

    const after = JSON.parse(h.localStorage.getItem(storageKey));
    const expected = JSON.parse(beforeText);
    result.changes.forEach((change) => setAtPath(expected, change.path, change.to));
    assert.deepEqual(after, expected, "ONLY the reported money fields changed");

    assert.equal(after.accounts.savings.balance, 30.3);
    assert.equal(after.savingsGoals[0].currentAmount, 0.3);
    assert.equal(after.income[0].amount, 1.005, "a real sub-cent amount is left alone");
    result.changes.forEach((change) => {
        assert.ok(Math.abs(change.from - change.to) * 100 < 0.001, `${change.path} moved by less than 1/1000 of a cent`);
    });
    assert.equal(before.accounts.savings.balance, 30.299999999999997, "(sanity: the input really was drifted)");
});

test("cleanup is SAFE TO RUN MORE THAN ONCE: the second run changes nothing and writes nothing", () => {
    const h = harnessWith(walletSavedByOldEngine());
    const original = h.localStorage.getItem(storageKey);

    const first = h.storage.cleanupStoredMoneyPrecision();
    const afterFirst = h.localStorage.getItem(storageKey);
    assert.equal(first.applied, true);

    const second = h.storage.cleanupStoredMoneyPrecision();
    assert.equal(second.ok, true);
    assert.equal(second.applied, false);
    assert.deepEqual(plain(second.changes), [], "nothing left to round");
    assert.equal(h.localStorage.getItem(storageKey), afterFirst, "wallet byte-identical after the second run");
    assert.equal(h.localStorage.getItem(BACKUP_KEY), original, "the backup still holds the pre-cleanup original");

    const third = h.storage.cleanupStoredMoneyPrecision({ dryRun: true });
    assert.deepEqual(plain(third.changes), []);
});

test("cleanup leaves every balance and total the same to the cent", () => {
    const h = harnessWith(walletSavedByOldEngine());
    const s = h.storage;
    const read = () => ({
        savings: s.getSavingsBalance(),
        totalSavings: s.getTotalSavingsBalance(),
        checking: s.getCheckingAccountBalance(),
        summary: s.getMonthlySummary(AUG)
    });

    const before = read();
    s.cleanupStoredMoneyPrecision();
    const after = read();
    assert.deepEqual(after, before);
});

test("cleanup refuses unreadable data and recovery mode, and does nothing on an empty device", () => {
    const empty = new StorageHarness();
    empty.localStorage.removeItem(storageKey);
    assert.deepEqual(
        plain((({ ok, applied, changes }) => ({ ok, applied, changes }))(empty.storage.cleanupStoredMoneyPrecision())),
        { ok: true, applied: false, changes: [] }
    );

    const broken = new StorageHarness();
    broken.localStorage.setItem(storageKey, "{not json");
    const r1 = broken.storage.cleanupStoredMoneyPrecision();
    assert.equal(r1.ok, false);
    assert.equal(r1.code, "unreadable");
    assert.equal(broken.localStorage.getItem(storageKey), "{not json", "unreadable data is never overwritten");

    const recovery = walletSavedByOldEngine();
    recovery.recoveryMode = true;
    const h = harnessWith(recovery);
    h.localStorage.setItem(storageKey, JSON.stringify(recovery));
    const r2 = h.storage.cleanupStoredMoneyPrecision();
    assert.equal(r2.ok, false);
    assert.equal(r2.code, "recovery_mode");
    assert.equal(h.localStorage.getItem(BACKUP_KEY), null);
});

test("'Erase this device' removes the cleanup backup along with the wallet", () => {
    assert.equal(new StorageHarness().storage.moneyPrecisionBackupKey, BACKUP_KEY);
    const env = createAccountEnv();
    assert.ok(env.A.eraseTargets().includes(BACKUP_KEY), "the backup key is an erase target");
});
