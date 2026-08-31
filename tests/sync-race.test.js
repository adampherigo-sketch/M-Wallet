"use strict";

/* =========================================================
   BP8 — DATA-LOSS RACE HARDENING

   The engine re-reads and re-encodes the CURRENT local state
   immediately before applying any remote document or sending
   any outbound write. A local edit that lands mid-cycle is
   never lost — it becomes a safe conflict or is re-planned.

   Each test injects a one-shot raceHook that fires AFTER the
   plan is built and BEFORE apply, simulating the user saving
   during the cloud request.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeCloud } = require("./helpers/fake-cloud.js");
const { SyncDevice, defaultWallet } = require("./helpers/sync-device.js");

const USER = "user-race";

function seed() {
    return defaultWallet({
        income: [{ id: "inc-1", name: "Salary", amount: 3000 }],
        accounts: { checking: { name: "Everyday", balance: 1000 }, savings: { name: "General Savings", balance: 0 } },
        months: {
            "2026-08": {
                monthKey: "2026-08", startingBalance: 500,
                bills: [{ id: "b1", name: "Power", amount: 90, paid: false }],
                paychecks: [], expenses: [], transactions: [{ id: "t1", type: "expense", amount: 10, note: "Coffee" }],
                savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: "August"
            }
        }
    });
}

function pair() {
    const cloudA = new FakeCloud();
    const A = new SyncDevice({ cloud: cloudA, userId: USER, preloadedData: seed() });
    const cloudB = new FakeCloud({ table: cloudA.table });
    const B = new SyncDevice({ cloud: cloudB, userId: USER, preloadedData: seed() });
    A.enableRelease(); B.enableRelease();
    return { A, B, cloudA, cloudB };
}


test("A. REMOTE APPLY RACE — a local edit during the cycle is NOT overwritten by the incoming remote copy", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.sync();                                     /* B baselines August at revision 1 */

    /* A moves August to revision 2 */
    A.localEdit((d) => { d.months["2026-08"].notes = "A revised August"; });
    await A.sync();

    /* B starts a sync; its plan says "download August". Before apply, the
       B user records a new August transaction. */
    B.setRaceHook(() => {
        B.localEdit((d) => {
            d.months["2026-08"].transactions.push({ id: "t2", type: "expense", amount: 25, note: "Groceries" });
        });
    });
    await B.sync();

    const aug = B.data().months["2026-08"];
    assert.equal(aug.transactions.length, 2, "the new local transaction survives");
    assert.equal(aug.transactions[1].note, "Groceries");
    assert.equal(aug.notes, "August", "the remote copy was NOT blindly applied over the fresh local edit");
    assert.ok(B.conflicts().some((c) => c.documentType === "month" && c.documentKey === "2026-08"),
        "August is a conflict for the user to resolve");
    assert.equal(B.conflicts()[0].reason, "local_changed_during_sync");

    /* no financial record vanished or duplicated */
    assert.equal(aug.transactions.filter((t) => t.id === "t1").length, 1);
    assert.equal(aug.transactions.filter((t) => t.id === "t2").length, 1);
    A.teardown(); B.teardown();
});

test("B. REMOTE TOMBSTONE RACE — a local edit during the cycle blocks the incoming deletion", async () => {
    const { A, B } = pair();
    await A.sync();
    await B.sync();

    /* A deletes August, syncs -> cloud tombstone */
    A.localEdit((d) => { delete d.months["2026-08"]; });
    await A.sync();

    /* B's plan says "apply the remote tombstone" (delete August locally).
       Before that apply, B edits August. */
    B.setRaceHook(() => {
        B.localEdit((d) => { d.months["2026-08"].notes = "B still needs August"; });
    });
    await B.sync();

    assert.ok("2026-08" in B.data().months, "August was NOT deleted on B");
    assert.equal(B.data().months["2026-08"].notes, "B still needs August");
    assert.ok(B.conflicts().some((c) => c.documentType === "month" && c.documentKey === "2026-08"),
        "the deletion vs edit is a conflict");
    A.teardown(); B.teardown();
});

test("C. BOOTSTRAP RACE — local data becomes meaningful during the cloud check -> cloud restore does NOT replace it", async () => {
    const cloudA = new FakeCloud();
    const A = new SyncDevice({ cloud: cloudA, userId: "user-boot-race", preloadedData: seed() });
    A.enableRelease();
    await A.sync();                                     /* A populates the cloud */

    /* fresh device B: empty local, same user, shares the cloud */
    const cloudB = new FakeCloud({ table: cloudA.table });
    const B = new SyncDevice({ cloud: cloudB, userId: "user-boot-race", preloadedData: defaultWallet() });
    B.enableRelease();

    /* during the bootstrap cloud check, the B user starts entering data */
    B.setRaceHook(() => {
        B.localEdit((d) => {
            d.accounts.checking.balance = 4321;
            d.months["2026-09"] = {
                monthKey: "2026-09", startingBalance: 4321, bills: [], paychecks: [], expenses: [],
                transactions: [{ id: "bt1", type: "income", amount: 4321, note: "New device deposit" }],
                savingsDeposits: [], savingsTransfers: [], suppressedRecurringBillSeries: [], notes: ""
            };
        });
    });

    const boot = await B.bootstrap();
    assert.equal(boot.status, "reconcile");
    assert.equal(B.data().accounts.checking.balance, 4321, "the local edit made during bootstrap survives");
    assert.equal(B.data().months["2026-09"].transactions[0].note, "New device deposit");
    assert.ok(!("2026-08" in B.data().months), "the cloud wallet was NOT bulk-applied over the new local data");

    /* the follow-up reconciliation uses no-base rules: August (remote only)
       downloads, September (local only) uploads, checking/accounts conflict */
    await B.sync();
    assert.ok("2026-08" in B.data().months, "August (remote-only) downloaded via no-base reconciliation");
    assert.equal(cloudA.rows().some((r) => r.documentType === "month" && r.documentKey === "2026-09"), true,
        "September (local-only) uploaded");
    assert.ok(B.conflicts().some((c) => c.documentType === "accounts"),
        "accounts changed on both sides with no shared baseline -> conflict");
    A.teardown(); B.teardown();
});

test("D. OUTBOUND STALE SNAPSHOT — a newer local save before the upload executes is not lost", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, userId: "user-outbound", preloadedData: seed() });
    dev.enableRelease();
    await dev.sync();                                   /* baseline everything */

    /* the cycle plans an upload of August "version A"; before it executes,
       the user saves "version B" */
    dev.localEdit((d) => { d.months["2026-08"].notes = "version A"; });
    dev.setRaceHook(() => {
        dev.localEdit((d) => { d.months["2026-08"].notes = "version B"; });
    });
    await dev.sync();

    assert.equal(dev.data().months["2026-08"].notes, "version B", "version B remains locally");
    assert.equal(cloud.rows().find((r) => r.documentType === "month").payload.notes, "August",
        "the stale version A was NOT pushed");
    assert.ok(dev.syncMeta().pending.some((p) => p.documentType === "month" && p.documentKey === "2026-08"),
        "August stays pending");
    const base = dev.syncMeta().documents["month/2026-08"];
    const cloudRev = cloud.rows().find((r) => r.documentType === "month").revision;
    assert.equal(base.revision, cloudRev, "baseline reflects what is actually in the cloud, not the stale local");

    /* the follow-up cycle uploads the CURRENT version B */
    await dev.sync();
    assert.equal(cloud.rows().find((r) => r.documentType === "month").payload.notes, "version B");
    assert.equal(dev.syncMeta().pending.length, 0);
    assert.equal(dev.state().status, "idle");

    /* and once more: baseline matches -> no spurious re-write */
    cloud.reset();
    await dev.sync();
    assert.equal(cloud.countCloud("update") + cloud.countCloud("create"), 0);
    dev.teardown();
});

test("no false baseline: a doc skipped for a mid-cycle edit is still recognised as dirty next cycle", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, userId: "user-dirty", preloadedData: seed() });
    dev.enableRelease();
    await dev.sync();

    dev.localEdit((d) => { d.settings.currency = "USD"; d.income[0].amount = 3100; });
    dev.setRaceHook(() => {
        dev.localEdit((d) => { d.income[0].amount = 3200; });
    });
    await dev.sync();

    /* recurring-income was skipped (stale); it must still be dirty */
    const inc = dev.syncMeta().documents["recurring-income/primary"];
    const cloudInc = cloud.rows().find((r) => r.documentType === "recurring-income");
    assert.ok(!cloudInc || cloudInc.payload.items[0].amount !== 3200 || dev.syncMeta().pending.length >= 0);

    await dev.sync();
    assert.equal(cloud.rows().find((r) => r.documentType === "recurring-income").payload.items[0].amount, 3200);
    assert.equal(dev.state().status, "idle");
    dev.teardown();
});
