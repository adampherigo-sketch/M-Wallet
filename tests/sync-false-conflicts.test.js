"use strict";

/* =========================================================
   BP12.4J — FALSE / REPETITIVE MONTH SYNC CONFLICTS

   Live symptom: after a normal one-sided financial change,
   the OTHER device kept asking "Use Local Data / Use Cloud
   Data" for individual months while just navigating between
   them.

   Root cause: reading / navigating a month rewrote it —
   `ensureRecurringBillsInData` stamped `updatedAt = now()` on
   EVERY `getMonth()` call, and the sync fingerprint covered
   derived / bookkeeping fields (`updatedAt`, `endingBalance`,
   per-record timestamps). So an untouched month drifted and
   the planner saw a local edit that never happened.

   Fix:
     - `getMonth()` is side-effect free for an existing,
       unchanged month (no write, no financial-saved event);
       `ensureRecurringBillsInData` only touches `updatedAt`
       when it actually added / removed / re-metadata'd a bill.
     - The month sync fingerprint is content-addressed on
       USER-AUTHORED data only (volatile / derived fields are
       excluded from change detection, NOT from the payload).

   These tests use an ADVANCING clock (a real device's
   `now()` moves) and drive navigation through the real
   `js/storage.js` read APIs — which is what the fixed-clock
   `sync-multidevice` tests never exercised.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeCloud } = require("./helpers/fake-cloud.js");
const { SyncDevice, defaultWallet } = require("./helpers/sync-device.js");

const USER = "user-bp12-4j";

/* make a device's storage clock advance one minute per call, like a
   real device, so a spurious `updatedAt` rewrite is actually visible */
function advanceClock(device, startIso) {
    let t = Date.parse(startIso || "2026-08-14T08:00:00.000Z");
    device.harness.storage.now = () => { t += 60000; return new Date(t).toISOString(); };
}

function seed() {
    return defaultWallet({
        income: [{ id: "inc-1", name: "Salary", amount: 3000 }],
        expenses: [{ id: "exp-1", name: "Rent", amount: 1500 }],
        accounts: { checking: { name: "Everyday", balance: 100 }, savings: { name: "General Savings", balance: 0 } },
        months: {
            "2026-08": {
                monthKey: "2026-08", startingBalance: 0, startingBalanceManual: false,
                bills: [], paychecks: [], expenses: [],
                transactions: [{ id: "t-seed", description: "seed", amount: 16.86, date: "2026-08-05" }],
                savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
            }
        }
    });
}

function pair(aData, bData) {
    const cloudA = new FakeCloud();
    const A = new SyncDevice({ name: "A", cloud: cloudA, userId: USER, preloadedData: aData || seed() });
    const cloudB = new FakeCloud({ table: cloudA.table });
    const B = new SyncDevice({ name: "B", cloud: cloudB, userId: USER, preloadedData: bData || defaultWallet() });
    A.enableRelease(); B.enableRelease();
    advanceClock(A, "2026-08-14T08:00:00.000Z");
    advanceClock(B, "2026-08-14T20:00:00.000Z");   /* B's wall clock is 12h ahead */
    return { A, B, cloudA, cloudB };
}

/* simulate a user moving through months on the app (dashboard + budget +
   transactions all read the snapshot / summary) */
function navigate(device, ...monthKeys) {
    monthKeys.forEach((k) => {
        device.harness.storage.getMonthSnapshot(k);
        device.harness.storage.getMonthlySummary(k);
        device.harness.storage.getBills(k);
    });
}

async function converge(...devices) {
    for (let i = 0; i < 3; i += 1) {
        for (const dvc of devices) { await dvc.sync(); }   // eslint-disable-line no-await-in-loop
    }
}


/* ---- 1. one-sided change downloads automatically ------ */

test("1. shared baseline -> A changes one month -> B (only navigating) auto-downloads, ZERO conflicts", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.harness.storage.addTransaction({ description: "Groceries", amount: -42.5, date: "2026-08-11" }, "2026-08");
    await A.sync();

    /* B just moves around the app before syncing */
    navigate(B, "2026-08", "2026-09", "2026-10", "2026-08");

    await B.sync();

    assert.equal(B.conflicts().length, 0, "no conflict for a month B never edited");
    assert.equal(B.data().months["2026-08"].transactions.length, 2);
    assert.ok(B.data().months["2026-08"].transactions.some((t) => t.description === "Groceries"));
    A.teardown(); B.teardown();
});


/* ---- 2. several one-sided changes, all automatic ------ */

test("2. A changes SEVERAL different months -> B (only navigating) gets each automatically, no prompts", async () => {
    const { A, B } = pair(defaultWallet({
        months: {
            "2026-08": mo("2026-08"), "2026-09": mo("2026-09"), "2026-10": mo("2026-10")
        }
    }));
    await A.sync();
    await B.bootstrap();

    A.harness.storage.addTransaction({ description: "Aug", amount: -10, date: "2026-08-10" }, "2026-08");
    A.harness.storage.addTransaction({ description: "Sep", amount: -20, date: "2026-09-10" }, "2026-09");
    A.harness.storage.addTransaction({ description: "Oct", amount: -30, date: "2026-10-10" }, "2026-10");
    await A.sync();

    navigate(B, "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2026-09", "2026-08");

    await B.sync();

    assert.equal(B.conflicts().length, 0, "zero Local/Cloud prompts");
    assert.equal(B.data().months["2026-08"].transactions.length, 1);
    assert.equal(B.data().months["2026-09"].transactions.length, 1);
    assert.equal(B.data().months["2026-10"].transactions.length, 1);
    A.teardown(); B.teardown();
});

function mo(key) {
    return {
        monthKey: key, startingBalance: 0, startingBalanceManual: false,
        bills: [], paychecks: [], expenses: [], transactions: [],
        savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
    };
}


/* ---- 3. reverse direction ----------------------------- */

test("3. reverse: B changes a month -> A (only navigating) auto-downloads, ZERO conflicts", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    B.harness.storage.addTransaction({ description: "Fuel", amount: -60, date: "2026-08-12" }, "2026-08");
    await B.sync();

    navigate(A, "2026-08", "2026-09", "2026-07", "2026-08");

    await A.sync();

    assert.equal(A.conflicts().length, 0);
    assert.ok(A.data().months["2026-08"].transactions.some((t) => t.description === "Fuel"));
    A.teardown(); B.teardown();
});


/* ---- 4. a GENUINE conflict is still produced ---------- */

test("4. both devices independently edit the SAME month -> a real conflict IS raised", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.harness.storage.addTransaction({ description: "A edit", amount: -5, date: "2026-08-09" }, "2026-08");
    B.harness.storage.addTransaction({ description: "B edit", amount: -7, date: "2026-08-09" }, "2026-08");

    /* both navigate too — that must not hide the real conflict */
    navigate(A, "2026-08", "2026-09");
    navigate(B, "2026-08", "2026-09");

    await A.sync();   /* A reaches the cloud first */
    await B.sync();   /* B sees genuine divergence */

    assert.equal(B.conflicts().length, 1);
    assert.equal(B.conflicts()[0].documentKey, "2026-08");
    assert.ok(["both_changed", "both_changed_no_base"].indexOf(B.conflicts()[0].reason) !== -1);
    assert.ok(B.data().months["2026-08"].transactions.some((t) => t.description === "B edit"), "B's edit is not lost");
    A.teardown(); B.teardown();
});


/* ---- 5. resolve genuine conflict with LOCAL, converge - */

test("5. resolve a genuine conflict with 'Keep this device' -> converges and does NOT prompt again", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.harness.storage.addTransaction({ description: "A", amount: -5, date: "2026-08-09" }, "2026-08");
    B.harness.storage.addTransaction({ description: "B", amount: -7, date: "2026-08-09" }, "2026-08");
    await A.sync();
    await B.sync();
    assert.equal(B.conflicts().length, 1);

    const res = await B.resolve("month", "2026-08", "keep-local");
    assert.equal(res.ok, true);
    assert.equal(B.conflicts().length, 0);

    /* B keeps using the app; A syncs too */
    navigate(B, "2026-08", "2026-09", "2026-10");
    navigate(A, "2026-08", "2026-09");
    await converge(A, B);

    assert.equal(B.conflicts().length, 0, "no re-prompt on B");
    assert.equal(A.conflicts().length, 0, "no re-prompt on A");
    assert.ok(A.data().months["2026-08"].transactions.some((t) => t.description === "B"), "A converged to B's kept version");
    A.teardown(); B.teardown();
});


/* ---- 6. resolve genuine conflict with CLOUD, converge - */

test("6. resolve a genuine conflict with 'Use cloud version' -> converges and does NOT prompt again", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.harness.storage.addTransaction({ description: "A", amount: -5, date: "2026-08-09" }, "2026-08");
    B.harness.storage.addTransaction({ description: "B", amount: -7, date: "2026-08-09" }, "2026-08");
    await A.sync();
    await B.sync();
    assert.equal(B.conflicts().length, 1);

    const res = await B.resolve("month", "2026-08", "use-cloud");
    assert.equal(res.ok, true);
    assert.equal(B.conflicts().length, 0);
    assert.ok(B.data().months["2026-08"].transactions.some((t) => t.description === "A"), "B now shows the cloud copy");

    navigate(B, "2026-08", "2026-09", "2026-10");
    navigate(A, "2026-08", "2026-09");
    await converge(A, B);

    assert.equal(B.conflicts().length, 0, "no re-prompt on B");
    assert.equal(A.conflicts().length, 0, "no re-prompt on A");
    A.teardown(); B.teardown();
});


/* ---- 7. navigation is side-effect free ---------------- */

test("7. navigating / viewing EXISTING months does not alter their sync hashes or queue a pending change", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();
    assert.equal((A.syncMeta().pending || []).length, 0);

    const augBaseline = A.syncMeta().documents["month/2026-08"];
    const augStoredBefore = JSON.stringify(A.data().months["2026-08"]);

    /* move back and forth over the month that already has data */
    navigate(A, "2026-08", "2026-09", "2026-08", "2026-07", "2026-08");
    await A.sync();

    assert.equal((A.syncMeta().pending || []).length, 0, "navigation queues no pending change");
    assert.equal(A.conflicts().length, 0);
    assert.deepEqual(A.syncMeta().documents["month/2026-08"], augBaseline,
        "the existing month's sync baseline (revision + hash) is unchanged by navigation");
    assert.equal(JSON.stringify(A.data().months["2026-08"]), augStoredBefore,
        "the existing month's stored payload is byte-identical after navigation");

    /* and B, navigating the same months, never sees a conflict for them */
    navigate(B, "2026-07", "2026-08", "2026-09");
    await B.sync();
    assert.equal(B.conflicts().length, 0);
    A.teardown(); B.teardown();
});

test("7b. an empty month first opened on two devices converges — it is never a conflict", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    /* both devices independently visit a future month that has no data */
    navigate(A, "2026-11");
    navigate(B, "2026-11");

    await converge(A, B);

    assert.equal(A.conflicts().length, 0, "no Local/Cloud prompt for an untouched empty month");
    assert.equal(B.conflicts().length, 0);
    A.teardown(); B.teardown();
});


/* ---- 8. automatic rollover reads don't dirty months --- */

test("8. reading auto-rollover months (derived starting balances) does not make untouched months look edited", async () => {
    const { A, B } = pair(defaultWallet({
        months: { "2026-08": Object.assign(mo("2026-08"), {
            transactions: [{ id: "t1", description: "pay", amount: 500, date: "2026-08-03" }]
        }) }
    }));
    await A.sync();
    await B.bootstrap();

    /* B walks forward through months that only exist as auto-rollover
       derivations of August's ending balance */
    navigate(B, "2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01");
    /* the derived opening balances still resolve correctly */
    assert.equal(B.harness.storage.getMonthlySummary("2026-09").startingBalance, 500, "Sept opens at Aug's close");
    assert.equal(B.harness.storage.getMonthlySummary("2027-01").startingBalance, 500, "Dec -> Jan rollover intact");

    await B.sync();
    assert.equal(B.conflicts().length, 0, "no month is flagged as user-edited by rollover reads");
    assert.equal((B.syncMeta().pending || []).length, 0);

    /* A independently navigates the same derived months -> still converges */
    navigate(A, "2026-09", "2026-10", "2026-11");
    await converge(A, B);
    assert.equal(A.conflicts().length, 0);
    assert.equal(B.conflicts().length, 0);
    A.teardown(); B.teardown();
});


/* ---- 9. negative + calendar-year rollover still carry - */

test("9. negative ending and Dec->Jan rollover survive a sync round-trip", async () => {
    const { A, B } = pair(defaultWallet({
        months: {
            "2026-12": Object.assign(mo("2026-12"), {
                transactions: [{ id: "t-od", description: "overdraft", amount: -42.18, date: "2026-12-20" }]
            })
        }
    }));
    await A.sync();
    await B.bootstrap();

    navigate(B, "2026-12", "2027-01");
    assert.equal(B.harness.storage.getMonthlySummary("2026-12").endingBalance, -42.18);
    assert.equal(B.harness.storage.getMonthlySummary("2027-01").startingBalance, -42.18, "negative carries into the new year");

    await B.sync();
    assert.equal(B.conflicts().length, 0);
    A.teardown(); B.teardown();
});
