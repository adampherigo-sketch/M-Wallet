"use strict";

/* =========================================================
   BP8 — TWO-DEVICE SIMULATION

   Two SyncDevice sandboxes for the same test owner sharing one
   FakeCloud table (unique constraint, revisions, tombstones,
   expectedRevision). This does NOT replace the BP12 live
   multi-device verification — it proves the engine's logic
   deterministically.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeCloud } = require("./helpers/fake-cloud.js");
const { SyncDevice, defaultWallet } = require("./helpers/sync-device.js");

const USER = "user-multi";

function seedWallet() {
    return defaultWallet({
        income: [{ id: "inc-1", name: "Salary", amount: 3200.5 }],
        expenses: [{ id: "exp-1", name: "Rent", amount: 1450.75 }],
        accounts: { checking: { name: "Everyday", balance: 4200.55 }, savings: { name: "General Savings", balance: 1875.1 } },
        savingsGoals: [{ id: "g1", name: "Emergency", target: 10000, saved: 1875.1 }],
        months: {
            "2026-08": {
                monthKey: "2026-08", startingBalance: 1000.25,
                bills: [{ id: "b1", name: "Power", amount: 92.4, paid: false }],
                paychecks: [{ id: "pc1", amount: 1600, date: "2026-08-01" }],
                expenses: [], transactions: [{ id: "t1", type: "expense", amount: 12.99, note: "Coffee" }],
                savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: "August"
            }
        },
        cash: {
            initialized: true, wallet: { denominations: { "bill-20": 3, "coin-quarter": 4 } },
            savings: { denominations: {} }, history: [{ id: "h1", type: "deposit" }], settings: {}
        }
    });
}

function pair(options) {
    options = options || {};
    const cloudA = new FakeCloud();
    const A = new SyncDevice({ name: "A", cloud: cloudA, userId: USER, preloadedData: options.aData || seedWallet() });
    const cloudB = new FakeCloud({ table: cloudA.table });
    const B = new SyncDevice({ name: "B", cloud: cloudB, userId: USER, preloadedData: options.bData || defaultWallet() });
    A.enableRelease(); B.enableRelease();
    return { A, B, cloudA, cloudB };
}


test("A. device A first upload -> device B restores it exactly", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    assert.equal(B.data().accounts.checking.balance, 4200.55);
    assert.equal(B.data().income[0].amount, 3200.5);
    assert.equal(B.data().months["2026-08"].transactions[0].note, "Coffee");
    assert.equal(B.data().cash.wallet.denominations["bill-20"], 3);
    assert.equal(B.data().version, 5, "device-local schema version preserved");
    A.teardown(); B.teardown();
});

test("B. A adds an August transaction -> B pulls it, no conflict", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.localEdit((d) => { d.months["2026-08"].transactions.push({ id: "t2", type: "expense", amount: 30, note: "Gas" }); });
    await A.sync();
    await B.sync();

    assert.equal(B.data().months["2026-08"].transactions.length, 2);
    assert.equal(B.data().months["2026-08"].transactions[1].note, "Gas");
    assert.equal(B.conflicts().length, 0);
    A.teardown(); B.teardown();
});

test("C. B changes September while A changes August -> both survive, no conflict", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.localEdit((d) => { d.months["2026-08"].notes = "August revised"; });
    B.localEdit((d) => {
        d.months["2026-09"] = { monthKey: "2026-09", startingBalance: 1500, bills: [], paychecks: [], expenses: [], transactions: [], savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: "Sept" };
    });
    await A.sync();
    await B.sync();
    await A.sync();

    assert.equal(A.data().months["2026-08"].notes, "August revised");
    assert.equal(A.data().months["2026-09"].notes, "Sept");
    assert.equal(B.data().months["2026-08"].notes, "August revised");
    assert.equal(A.conflicts().length, 0);
    assert.equal(B.conflicts().length, 0);
    A.teardown(); B.teardown();
});

test("D. A and B both edit August from the same revision -> conflict, neither overwrites", async () => {
    const { A, B, cloudA } = pair();
    await A.sync();
    await B.bootstrap();

    A.localEdit((d) => { d.months["2026-08"].notes = "A version"; });
    B.localEdit((d) => { d.months["2026-08"].notes = "B version"; });

    await A.sync();                                     /* A wins the race to the cloud */
    await B.sync();                                     /* B detects the conflict */

    assert.equal(B.conflicts().length, 1);
    assert.equal(B.conflicts()[0].documentType, "month");
    assert.equal(B.conflicts()[0].documentKey, "2026-08");
    assert.equal(B.data().months["2026-08"].notes, "B version", "B's local edit is preserved during the conflict");
    assert.equal(cloudA.rows().find((r) => r.documentType === "month").payload.notes, "A version", "cloud keeps A's");
    A.teardown(); B.teardown();
});

test("E. resolve 'Keep this device' -> B's CURRENT local safely updates the cloud", async () => {
    const { A, B, cloudA } = pair();
    await A.sync();
    await B.bootstrap();
    A.localEdit((d) => { d.months["2026-08"].notes = "A version"; });
    B.localEdit((d) => { d.months["2026-08"].notes = "B version"; });
    await A.sync();
    await B.sync();
    assert.equal(B.conflicts().length, 1);

    /* B keeps editing while the conflict stands */
    B.localEdit((d) => { d.months["2026-08"].notes = "B version, refined"; });

    const res = await B.resolve("month", "2026-08", "keep-local");
    assert.equal(res.ok, true);
    assert.equal(B.conflicts().length, 0);
    assert.equal(cloudA.rows().find((r) => r.documentType === "month").payload.notes, "B version, refined",
        "the CURRENT local version was pushed, not the stale one");
    assert.equal(B.data().months["2026-08"].notes, "B version, refined", "local data not altered by the resolution");
    A.teardown(); B.teardown();
});

test("F. resolve 'Use cloud version' -> the current cloud copy safely applies locally", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();
    A.localEdit((d) => { d.months["2026-08"].notes = "A version"; });
    B.localEdit((d) => { d.months["2026-08"].notes = "B version"; });
    await A.sync();
    await B.sync();

    const res = await B.resolve("month", "2026-08", "use-cloud");
    assert.equal(res.ok, true);
    assert.equal(B.conflicts().length, 0);
    assert.equal(B.data().months["2026-08"].notes, "A version", "B now shows the cloud copy");
    assert.equal(B.appRefreshes >= 1, true);
    A.teardown(); B.teardown();
});

test("G. A offline edits -> local succeeds; a later online sync uploads", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.online = false;
    A.localEdit((d) => { d.accounts.checking.balance = 5000; });
    await A.sync();
    assert.equal(A.state().status, "offline");
    assert.equal(A.data().accounts.checking.balance, 5000, "offline local edit succeeded");

    A.online = true;
    await A.sync();
    await B.sync();
    assert.equal(B.data().accounts.checking.balance, 5000);
    A.teardown(); B.teardown();
});

test("H. B offline edits a DIFFERENT document -> later merges without conflict", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.localEdit((d) => { d.months["2026-08"].notes = "A edited August"; });
    await A.sync();

    B.online = false;
    B.localEdit((d) => { d.settings.currency = "EUR"; });
    await B.sync();
    B.online = true;
    await B.sync();

    assert.equal(B.conflicts().length, 0);
    assert.equal(B.data().settings.currency, "EUR");
    assert.equal(B.data().months["2026-08"].notes, "A edited August");
    A.teardown(); B.teardown();
});

test("I. a stale expectedRevision is rejected -> conflict, no overwrite", async () => {
    const { A, B, cloudA } = pair();
    await A.sync();
    await B.bootstrap();

    /* A updates twice so B's baseline revision is well behind */
    A.localEdit((d) => { d.income[0].amount = 3300; });
    await A.sync();
    A.localEdit((d) => { d.income[0].amount = 3400; });
    await A.sync();

    B.localEdit((d) => { d.income[0].amount = 9999; });
    await B.sync();

    assert.equal(B.conflicts().some((c) => c.documentType === "recurring-income"), true);
    assert.equal(cloudA.rows().find((r) => r.documentType === "recurring-income").payload.items[0].amount, 3400,
        "the cloud value was not clobbered by B's stale write");
    A.teardown(); B.teardown();
});

test("J. remote tombstone of a month propagates as a local deletion", async () => {
    const { A, B } = pair({
        aData: defaultWallet({
            months: {
                "2026-08": { monthKey: "2026-08", startingBalance: 100, bills: [], paychecks: [], expenses: [], transactions: [], savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: "" },
                "2026-09": { monthKey: "2026-09", startingBalance: 200, bills: [], paychecks: [], expenses: [], transactions: [], savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: "" }
            }
        })
    });
    await A.sync();
    await B.bootstrap();
    assert.ok("2026-08" in B.data().months);

    /* A deletes August locally, then syncs -> cloud tombstone */
    A.localEdit((d) => { delete d.months["2026-08"]; });
    await A.sync();

    await B.sync();
    assert.ok(!("2026-08" in B.data().months), "August removed on B");
    assert.ok("2026-09" in B.data().months, "September untouched");
    assert.equal(B.conflicts().length, 0);
    A.teardown(); B.teardown();
});

test("K. account switch mid-flight -> no wrong-owner apply", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    A.localEdit((d) => { d.months["2026-08"].notes = "A only"; });
    await A.sync();

    /* B signs out to a different user right before its cycle would apply */
    B.userId = "someone-else";
    B.ownership = "owner_mismatch";
    await B.sync();

    assert.notEqual(B.data().months["2026-08"].notes, "A only", "B did not apply user-A data as someone else");
    assert.equal(B.cloudB && B.cloudB.totalCalls, undefined);
    A.teardown(); B.teardown();
});

test("financial realism: a full seeded wallet round-trips A -> B with no lost value", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.bootstrap();

    const a = A.codec.syncableSlice(A.data());
    const b = B.codec.syncableSlice(B.data());
    assert.deepEqual(JSON.parse(JSON.stringify(b)), JSON.parse(JSON.stringify(a)),
        "every synced slice is identical on both devices — no lost cents, ids, categories, or M-Cash quantities");
    A.teardown(); B.teardown();
});
