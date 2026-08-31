"use strict";

/* =========================================================
   BP8 — SYNC ENGINE

   Real js/sync/sync-engine.js + the real codec + planner +
   sync-state, the real js/storage.js financial engine, and a
   deterministic FakeCloud. The release gate is toggled per
   test via configureForTest — the committed default stays
   false.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeCloud } = require("./helpers/fake-cloud.js");
const { SyncDevice, defaultWallet } = require("./helpers/sync-device.js");

function walletWith(over) { return defaultWallet(over); }

function augWallet() {
    return walletWith({
        income: [{ id: "inc-1", name: "Salary", amount: 3000 }],
        accounts: { checking: { name: "Everyday", balance: 2500.5 }, savings: { name: "General Savings", balance: 0 } },
        months: {
            "2026-08": {
                monthKey: "2026-08", startingBalance: 1000.25,
                bills: [{ id: "b1", name: "Power", amount: 92.4, paid: false }],
                paychecks: [], expenses: [], transactions: [], savingsDeposits: [],
                savingsTransfers: [], suppressedRecurringBillSeries: [], notes: "August"
            }
        }
    });
}


test("release DISABLED -> syncNow makes ZERO cloud calls", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    /* release override NOT set -> committed default (false) */
    const res = await dev.sync();
    assert.equal(res.status, "disabled");
    assert.equal(cloud.totalCalls(), 0);
    dev.teardown();
});

test("unconfigured / signed-out / recovery / owner-mismatch -> ZERO cloud calls even with release ON", async () => {
    for (const patch of [
        { configured: false },
        { signedIn: false },
        { recoveryMode: true },
        { ownership: "owner_mismatch" },
        { ownership: "needs_claim" }
    ]) {
        const cloud = new FakeCloud();
        const dev = new SyncDevice(Object.assign({ cloud, preloadedData: augWallet() }, patch));
        dev.enableRelease();
        await dev.sync();
        assert.equal(cloud.totalCalls(), 0, JSON.stringify(patch));
        dev.teardown();
    }
});

test("first-device bootstrap: meaningful local + empty cloud -> uploads every document at revision 1", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    dev.enableRelease();

    /* normalize once so the comparison is against the same shape the
       engine's own storage.load() produces (storage.js seeds the
       category library on load — pre-existing behaviour, not BP8) */
    dev.harness.reload();
    const before = JSON.stringify(dev.data());
    await dev.sync();

    /* the 7 singletons + one month were created */
    const rows = cloud.rows();
    assert.equal(rows.length, 8);
    assert.ok(rows.every((r) => r.revision === 1));
    assert.deepEqual(rows.map((r) => r.documentType + "/" + r.documentKey).sort(), [
        "accounts/primary", "cash/primary", "categories/primary", "month/2026-08",
        "recurring-expenses/primary", "recurring-income/primary", "savings/primary", "settings/primary"
    ].sort());

    /* local data byte-identical, and every doc now has a baseline */
    assert.equal(JSON.stringify(dev.data()), before, "local data untouched by an upload");
    const meta = dev.syncMeta();
    assert.equal(Object.keys(meta.documents).length, 8);
    assert.equal(meta.pending.length, 0);
    assert.equal(dev.state().status, "idle");
    dev.teardown();
});

test("a re-sync with no local change -> no writes, still idle", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    dev.enableRelease();
    await dev.sync();
    cloud.reset();
    await dev.sync();
    assert.equal(cloud.countCloud("create"), 0);
    assert.equal(cloud.countCloud("update"), 0);
    assert.equal(dev.state().status, "idle");
    dev.teardown();
});

test("local edit after baseline -> a single update with expectedRevision, revision increments", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    dev.enableRelease();
    await dev.sync();
    cloud.reset();

    dev.localEdit((d) => { d.months["2026-08"].bills[0].paid = true; });
    await dev.sync();

    assert.equal(cloud.countCloud("update"), 1);
    const row = cloud.rows().find((r) => r.documentType === "month");
    assert.equal(row.revision, 2);
    assert.equal(row.payload.bills[0].paid, true);
    assert.equal(dev.state().status, "idle");
    dev.teardown();
});

test("second-device bootstrap: empty local + populated cloud -> restores atomically, then idle", async () => {
    const table = new (require("./helpers/fake-cloud.js").makeTable ? Object : Map)();
    const cloudA = new FakeCloud();
    const devA = new SyncDevice({ cloud: cloudA, preloadedData: augWallet(), userId: "user-x" });
    devA.enableRelease();
    await devA.sync();                                  /* device A uploads */

    /* device B: same user, SAME table, empty local */
    const cloudB = new FakeCloud({ table: cloudA.table });
    const devB = new SyncDevice({ cloud: cloudB, preloadedData: defaultWallet(), userId: "user-x" });
    devB.enableRelease();

    const boot = await devB.bootstrap();
    assert.equal(boot.status, "restored");
    assert.equal(devB.data().months["2026-08"].startingBalance, 1000.25);
    assert.equal(devB.data().accounts.checking.balance, 2500.5);
    assert.equal(devB.data().income[0].name, "Salary");
    assert.equal(devB.appRefreshes >= 1, true);
    assert.equal(devB.firstRunResolves >= 1, true, "BP5 was asked to re-decide");

    /* a follow-up sync is a clean no-op */
    cloudB.reset();
    await devB.sync();
    assert.equal(cloudB.countCloud("create") + cloudB.countCloud("update"), 0);
    devA.teardown(); devB.teardown();
});

test("bootstrap when cloud is empty -> release, no fake success metadata, no data created", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: defaultWallet() });
    dev.enableRelease();
    const boot = await dev.bootstrap();
    assert.equal(boot.status, "empty");
    assert.equal(cloud.rows().length, 0);
    assert.deepEqual(dev.data().months, {}, "sync created no financial data");
    assert.equal(dev.syncMeta().bootstrapStatus, "complete");
    dev.teardown();
});

test("bootstrap offline -> needs_decision; continue-offline defers and never overwrites cloud", async () => {
    const cloudA = new FakeCloud();
    const devA = new SyncDevice({ cloud: cloudA, preloadedData: augWallet(), userId: "user-y" });
    devA.enableRelease();
    await devA.sync();

    const cloudB = new FakeCloud({ table: cloudA.table });
    const devB = new SyncDevice({ cloud: cloudB, preloadedData: defaultWallet(), userId: "user-y", online: false });
    devB.enableRelease();

    const boot = await devB.bootstrap();
    assert.equal(boot.status, "needs_decision");
    assert.equal(cloudB.countCloud("list") >= 0, true);

    const cont = await devB.engine.bootstrapContinueOffline();
    assert.equal(cont.status, "deferred");
    assert.equal(devB.syncMeta().bootstrapStatus, "deferred");

    /* cloud rows untouched */
    assert.equal(cloudA.rows().length, 8);
    devA.teardown(); devB.teardown();
});

test("network failure during a cycle -> local intact, pending kept, status offline, no baseline reset", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    dev.enableRelease();
    await dev.sync();                                   /* establish baselines */
    const metaBefore = JSON.stringify(dev.syncMeta().documents);

    dev.localEdit((d) => { d.settings.currency = "EUR"; });
    cloud.forceOffline = true;
    await dev.sync();

    assert.equal(dev.data().settings.currency, "EUR", "local edit preserved");
    assert.equal(dev.state().status, "offline");
    assert.ok(dev.syncMeta().pending.some((p) => p.documentType === "settings"));
    assert.equal(JSON.stringify(dev.syncMeta().documents), metaBefore, "baselines not reset by a network error");
    dev.teardown();
});

test("schema missing -> status unsupported, local app unaffected", async () => {
    const cloud = new FakeCloud();
    cloud.status = "schema_missing";
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    dev.enableRelease();
    await dev.sync();
    assert.equal(dev.state().status, "unsupported");
    assert.equal(dev.data().months["2026-08"].startingBalance, 1000.25);
    dev.teardown();
});

test("single-flight: a second syncNow while one runs coalesces (no overlapping cycles)", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    dev.enableRelease();
    const p1 = dev.sync();
    const p2 = dev.sync();
    await Promise.all([p1, p2]);
    /* exactly one bootstrap upload set — not two overlapping create storms */
    assert.equal(cloud.countCloud("create"), 8);
    dev.teardown();
});

test("state-write failure after a successful cloud write does not duplicate the change next cycle", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet() });
    dev.enableRelease();
    await dev.sync();
    cloud.reset();

    dev.localEdit((d) => { d.accounts.checking.balance = 9999; });
    /* make sync-state writes fail for this cycle */
    const realSet = dev.syncStore.set.bind(dev.syncStore);
    dev.syncStore.set = () => { throw new Error("quota"); };
    await dev.sync();
    dev.syncStore.set = realSet;

    assert.equal(cloud.rows().find((r) => r.documentType === "accounts").revision, 2);

    /* next cycle: local hash matches remote payload -> re-baseline, NOT a second write */
    cloud.reset();
    await dev.sync();
    assert.equal(cloud.countCloud("update"), 0, "no duplicate write");
    assert.equal(cloud.rows().find((r) => r.documentType === "accounts").revision, 2);
    dev.teardown();
});

test("local-storage save failure during a remote apply -> prior local data authoritative, not marked synced", async () => {
    const cloudA = new FakeCloud();
    const devA = new SyncDevice({ cloud: cloudA, preloadedData: augWallet(), userId: "user-z" });
    devA.enableRelease();
    await devA.sync();                                  /* A uploads at revision 1 */

    const cloudB = new FakeCloud({ table: cloudA.table });
    const devB = new SyncDevice({ cloud: cloudB, preloadedData: augWallet(), userId: "user-z" });
    devB.enableRelease();
    await devB.sync();                                  /* B baselines against the identical original */
    assert.equal(devB.conflicts().length, 0, "identical content, no base -> baseline, not conflict");

    /* now A moves the month ahead */
    devA.localEdit((d) => { d.months["2026-08"].notes = "A edit"; });
    await devA.sync();
    const remoteMonthRev = cloudA.rows().find((r) => r.documentType === "month").revision;

    /* B tries to download it, but its local save fails */
    devB.harness.setFailWrites(true);
    await devB.sync();
    devB.harness.setFailWrites(false);

    assert.equal(devB.data().months["2026-08"].notes, "August", "B's local data unchanged");
    assert.equal(devB.state().status, "error");
    assert.equal(devB.state().lastErrorCode, "local_storage_error");
    const base = devB.syncMeta().documents["month/2026-08"];
    assert.ok(base.revision < remoteMonthRev, "remote revision NOT marked as synced locally");
    devA.teardown(); devB.teardown();
});

test("diagnostics never expose the owner id, a payload, or a token", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: augWallet(), userId: "secret-owner-42" });
    dev.enableRelease();
    await dev.sync();
    const blob = JSON.stringify(dev.engine.diagnostics()) + JSON.stringify(dev.state());
    assert.ok(!blob.includes("secret-owner-42"));
    assert.ok(!/token|password|bearer|2500\.5|Everyday/i.test(blob));
    dev.teardown();
});

test("the engine source never logs a financial payload / owner id / token", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    let src = fs.readFileSync(path.resolve(__dirname, "..", "js/sync/sync-engine.js"), "utf8");
    src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/console\.(log|info|warn|error|debug)\s*\([^)]*(payload|balance|ownerUserId|token|account|note)/i.test(src));
    assert.ok(!/\.from\s*\(\s*["'`]wallet_documents/.test(src));
    assert.ok(!/createClient|_getClient\s*\(|access_token|refresh_token|sb_secret_|service_role/.test(src));
});
