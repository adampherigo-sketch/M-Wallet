"use strict";

/* =========================================================
   BP8 — BOOTSTRAP + GATE COORDINATION

   The bootstrap decision layer (fresh device / cloud restore)
   and its fail-open auth-ui guard.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");

const { FakeCloud } = require("./helpers/fake-cloud.js");
const { SyncDevice, defaultWallet } = require("./helpers/sync-device.js");
const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

function meaningful() {
    return defaultWallet({
        income: [{ id: "i1", name: "Pay", amount: 2000 }],
        accounts: { checking: { name: "C", balance: 500 }, savings: { name: "S", balance: 0 } }
    });
}


test("bootstrap guard: release DISABLED -> always { release: true }", () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: defaultWallet() });
    /* committed default: disabled */
    assert.deepEqual(plain(dev.engine.bootstrapGuard({ configured: true, status: "signed_in" })), { release: true });
    dev.teardown();
});

test("bootstrap guard: enabled + CHECKING -> holds; enabled + a released status -> releases", async () => {
    const cloudA = new FakeCloud();
    const A = new SyncDevice({ cloud: cloudA, preloadedData: meaningful(), userId: "u1" });
    A.enableRelease();
    await A.sync();

    const cloudB = new FakeCloud({ table: cloudA.table });
    const B = new SyncDevice({ cloud: cloudB, preloadedData: defaultWallet(), userId: "u1" });
    B.enableRelease();
    /* make the cloud hang mid-check by failing the list so it lands NEEDS_DECISION */
    cloudB.setFailNext("list", "network_error", 1);
    const boot = await B.bootstrap();
    assert.equal(boot.status, "needs_decision");
    assert.deepEqual(plain(B.engine.bootstrapGuard({ configured: true, status: "signed_in" })), { release: false });

    await B.engine.bootstrapContinueOffline();
    assert.deepEqual(plain(B.engine.bootstrapGuard({ configured: true, status: "signed_in" })), { release: true });
    A.teardown(); B.teardown();
});

test("BP8.84 first-device: meaningful local + empty cloud -> READY, uploads async, local untouched", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: meaningful() });
    dev.enableRelease();
    dev.harness.reload();
    const before = JSON.stringify(dev.data());

    const boot = await dev.bootstrap();
    assert.equal(boot.status, "ready");
    assert.equal(JSON.stringify(dev.data()), before, "bootstrap changed no local data");
    assert.equal(dev.syncMeta().bootstrapStatus, "complete");
    dev.teardown();
});

test("BP8.85 second-device: empty local + cloud data -> RESTORED, BP5 re-decides, no wizard", async () => {
    const cloudA = new FakeCloud();
    const A = new SyncDevice({ cloud: cloudA, preloadedData: meaningful(), userId: "u2" });
    A.enableRelease();
    await A.sync();

    const cloudB = new FakeCloud({ table: cloudA.table });
    const B = new SyncDevice({ cloud: cloudB, preloadedData: defaultWallet(), userId: "u2" });
    B.enableRelease();

    const boot = await B.bootstrap();
    assert.equal(boot.status, "restored");
    assert.equal(B.data().accounts.checking.balance, 500);
    assert.equal(B.firstRunResolves >= 1, true, "BP5 asked to re-decide -> it will see meaningful data -> 'existing'");
    assert.equal(B._detect().meaningful, true, "restored wallet now reads as established");
    A.teardown(); B.teardown();
});

test("BP8.86 empty local + empty cloud -> EMPTY, no fake success metadata, no financial data created", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: defaultWallet() });
    dev.enableRelease();
    dev.harness.reload();
    const before = JSON.stringify(dev.data());

    const boot = await dev.bootstrap();
    assert.equal(boot.status, "empty");
    assert.equal(cloud.rows().length, 0);
    assert.equal(JSON.stringify(dev.data()), before, "sync created no financial data");
    assert.equal(dev.syncMeta().bootstrapStatus, "complete");
    assert.equal(dev.syncMeta().lastSuccessAt, null, "no false 'synced' success recorded");
    dev.teardown();
});

test("BP8.87 empty local + offline -> NEEDS_DECISION (never assumes cloud empty); continue-offline defers", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: defaultWallet(), online: false });
    dev.enableRelease();

    const boot = await dev.bootstrap();
    assert.equal(boot.status, "needs_decision");
    assert.equal(cloud.totalCalls(), 0, "offline -> no cloud request at all");

    const cont = await dev.engine.bootstrapContinueOffline();
    assert.equal(cont.status, "deferred");
    assert.equal(dev.syncMeta().bootstrapStatus, "deferred");

    /* a later first reconciliation uses the no-base rules and never blind-overwrites */
    dev.online = true;
    dev.localEdit((d) => { d.accounts.checking.balance = 111; });
    await dev.sync();
    assert.equal(cloud.rows().find((r) => r.documentType === "accounts").payload.checking.balance, 111);
    dev.teardown();
});

test("bootstrap deferred/complete is not re-run on a later auth change", async () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: defaultWallet(), online: false });
    dev.enableRelease();
    await dev.bootstrap();
    await dev.engine.bootstrapContinueOffline();
    cloud.reset();

    dev.online = true;
    const boot2 = await dev.bootstrap();
    assert.equal(boot2.status, "already");
    dev.teardown();
});

test("a sync-engine fault never traps a verified owner (guard fails open on throw)", () => {
    const cloud = new FakeCloud();
    const dev = new SyncDevice({ cloud, preloadedData: defaultWallet() });
    dev.enableRelease();
    /* corrupt the release dependency so bootstrapGuard's internals throw */
    dev.engine.configureForTest({ release: { isEnabled: () => { throw new Error("boom"); } } });
    assert.deepEqual(plain(dev.engine.bootstrapGuard({ configured: true, status: "signed_in" })), { release: true });
    dev.teardown();
});
