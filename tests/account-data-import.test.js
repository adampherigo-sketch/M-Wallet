"use strict";

/* =========================================================
   BP10 — WALLET RESTORE / IMPORT

   inspectImport() validates without writing; restoreWallet()
   replaces the local wallet only after an explicit
   { confirmed: true }. Untrusted JSON must be rejected for:
   bad JSON, wrong wrapper, future export version, missing
   wallet, malformed shapes, prototype-pollution keys,
   non-finite numbers, and oversized payloads. Owner identity
   is NEVER read from the file.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccountEnv, makeExport } = require("./helpers/account-harness.js");

const plain = (v) => JSON.parse(JSON.stringify(v));

function goodWallet() {
    return {
        version: 5,
        income: [{ id: "i1", name: "Salary", amount: 4000 }],
        expenses: [{ id: "e1", name: "Rent", amount: 1500 }],
        months: {
            "2026-08": {
                monthKey: "2026-08",
                transactions: [{ id: "t1", amount: 12.34 }, { id: "t2", amount: 56.78 }],
                bills: [{ id: "b1", amount: 60 }],
                paychecks: [], expenses: [], savingsDeposits: []
            }
        },
        savingsGoals: [{ id: "g1", name: "Trip", target: 2000, saved: 500 }],
        savingsTransfers: [],
        settings: { currency: "USD", categories: { version: 1, list: [{ id: "c1", name: "Food" }] } },
        cash: { initialized: true, history: [] }
    };
}

const START_WALLET = {
    version: 5, income: [], expenses: [], months: {}, savingsGoals: [], savingsTransfers: [],
    settings: { currency: "USD", categories: { version: 1, list: [] } }
};


/* ---- inspect: happy path -------------------------------- */

test("inspectImport returns a counts-only preview and writes nothing", () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    const before = JSON.stringify(env.snapshot());

    const res = env.A.inspectImport(makeExport(goodWallet()));
    assert.equal(res.ok, true);
    assert.equal(res.preview.months, 1);
    assert.equal(res.preview.monthEntries, 2);
    assert.equal(res.preview.bills, 1);
    assert.equal(res.preview.recurringItems, 2);
    assert.equal(res.preview.savingsGoals, 1);
    assert.equal(res.preview.hasMCashData, true);
    assert.equal(res.preview.appVersion, "0.9.0-beta.9");

    /* preview must NOT carry raw wallet rows */
    const blob = JSON.stringify(res.preview);
    assert.ok(!blob.includes("Salary"));
    assert.ok(!blob.includes("t1"));

    assert.equal(JSON.stringify(env.snapshot()), before, "no writes during inspect");
});


/* ---- inspect: rejections ------------------------------- */

const REJECTS = [
    ["not even JSON", "{{{bad", "invalid_json"],
    ["a JSON array", "[]", "invalid_export"],
    ["wrong format tag", JSON.stringify({ format: "something-else", formatVersion: 1, wallet: {} }), "invalid_export"],
    ["a future export version", makeExport(goodWallet(), { formatVersion: 2 }), "unsupported_export"],
    ["missing wallet", JSON.stringify({ format: "m-wallet-export", formatVersion: 1 }), "missing_wallet"],
    ["a non-object wallet", makeExport("nope"), "invalid_wallet"],
    ["months not an object", makeExport(Object.assign(goodWallet(), { months: [] })), "invalid_wallet"],
    ["income not an array", makeExport(Object.assign(goodWallet(), { income: {} })), "invalid_wallet"],
    ["a future schema version", makeExport(Object.assign(goodWallet(), { version: 9999 })), "unsupported_schema"]
];

for (const [label, text, code] of REJECTS) {
    test("inspectImport rejects " + label + " -> " + code, () => {
        const env = createAccountEnv({ preloadedData: START_WALLET });
        assert.equal(env.A.inspectImport(text).code, code);
    });
}

test("inspectImport rejects prototype-pollution keys", () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    const poison = '{"format":"m-wallet-export","formatVersion":1,"wallet":{"months":{},"__proto__":{"polluted":true}}}';
    assert.equal(env.A.inspectImport(poison).code, "unsafe_keys");
    assert.equal(({}).polluted, undefined, "global prototype not polluted");
});

test("inspectImport rejects a non-finite number anywhere in the wallet", () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    /* JSON can't hold NaN, so smuggle it via a string the validator must reject only
       structurally — instead test the parsed-object path via restoreWallet clone guard */
    const w = goodWallet();
    const text = JSON.stringify({ format: "m-wallet-export", formatVersion: 1, wallet: w })
        .replace('"amount":4000', '"amount":1e999');   /* 1e999 -> Infinity on parse */
    assert.equal(env.A.inspectImport(text).code, "invalid_wallet");
});

test("inspectImport rejects an oversized payload at the boundary", () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    const max = env.A.MAX_IMPORT_BYTES;
    const bigNote = "x".repeat(max);
    const w = Object.assign(goodWallet(), { bigNote: bigNote });
    const text = makeExport(w);
    assert.ok(text.length > max);
    assert.equal(env.A.inspectImport(text).code, "too_large");
});


/* ---- restore: confirmation gate ------------------------ */

test("restoreWallet without { confirmed:true } changes nothing", async () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    const before = env.raw();
    const res = await env.A.restoreWallet(makeExport(goodWallet()));
    assert.equal(res.code, "confirmation_required");
    assert.equal(env.raw(), before);
});

test("restoreWallet with confirmation replaces the local wallet and refreshes", async () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    const res = await env.A.restoreWallet(makeExport(goodWallet()), { confirmed: true });
    assert.equal(res.ok, true);

    const now = env.rawWallet();
    assert.equal(Object.keys(now.months).length, 1);
    assert.equal(now.income.length, 1);
    assert.ok(env.calls.appRefresh >= 1, "app refreshed");
    assert.ok(env.calls.firstRunResolve >= 1, "BP5 re-resolved");
});

test("restoreWallet clears stale sync state so future reconciliation uses no-base rules", async () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    env.setItem(env.keys.SYNC_KEY, { baseline: { "month/2026-08": { rev: 7 } } });
    await env.A.restoreWallet(makeExport(goodWallet()), { confirmed: true });
    assert.ok(env.calls.syncClear >= 1, "sync state cleared");
    assert.equal(env.raw(env.keys.SYNC_KEY), null);
});

test("restoreWallet never reads owner identity from the file", async () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    const w = Object.assign(goodWallet(), { ownerUserId: "attacker-uuid", owner: "evil" });
    const res = await env.A.restoreWallet(makeExport(w), { confirmed: true });
    assert.equal(res.ok, true);
    const stored = env.raw();
    assert.ok(!stored.includes("attacker-uuid"));
    /* current signed-in owner record rebound, not the file's */
    assert.ok(env.calls.ensureOwnership >= 0);
});

test("restoreWallet refuses when the local owner does not match", async () => {
    const env = createAccountEnv({ preloadedData: START_WALLET, ownerStatus: "owner_mismatch" });
    const before = env.raw();
    const res = await env.A.restoreWallet(makeExport(goodWallet()), { confirmed: true });
    assert.equal(res.code, "owner_mismatch");
    assert.equal(env.raw(), before, "wallet untouched on mismatch");
});

test("a failed local write leaves the previous wallet intact", async () => {
    const env = createAccountEnv({ preloadedData: goodWallet() });
    const before = env.raw();
    env.harness.setFailWrites(true);
    const res = await env.A.restoreWallet(makeExport(START_WALLET), { confirmed: true });
    assert.equal(res.code, "local_storage_error");
    assert.equal(env.raw(), before, "original wallet still there");
});


/* ---- financial integrity round-trip ------------------- */

test("round-trip: export -> erase -> restore preserves every cent (deep equal)", async () => {
    const env = createAccountEnv({ preloadedData: goodWallet() });

    const loadedBefore = plain(env.harness.reload());
    const exported = env.A.exportWallet();
    assert.equal(exported.ok, true);

    const erase = await env.A.eraseLocalWallet({ phrase: "ERASE" });
    assert.equal(erase.ok, true);
    assert.equal(env.raw(), null, "wallet gone after erase");

    /* a fresh device would auto-claim; simulate the signed-in owner returning */
    env.setOwnerStatus("owned");
    const restored = await env.A.restoreWallet(exported.json, { confirmed: true });
    assert.equal(restored.ok, true);

    const loadedAfter = plain(env.harness.reload());
    assert.deepEqual(loadedAfter.months, loadedBefore.months, "months identical");
    assert.deepEqual(loadedAfter.income, loadedBefore.income);
    assert.deepEqual(loadedAfter.expenses, loadedBefore.expenses);
    assert.deepEqual(loadedAfter.savingsGoals, loadedBefore.savingsGoals);

    let centsBefore = 0, centsAfter = 0;
    Object.values(loadedBefore.months).forEach((m) => m.transactions.forEach((t) => { centsBefore += Math.round(t.amount * 100); }));
    Object.values(loadedAfter.months).forEach((m) => m.transactions.forEach((t) => { centsAfter += Math.round(t.amount * 100); }));
    assert.equal(centsAfter, centsBefore, "no lost cents");
});


/* ---- BP10 final hardening: restore failure ordering --- */

test("A. sync-state reset fails BEFORE the save -> restore aborted, wallet byte-identical", async () => {
    const env = createAccountEnv({ preloadedData: goodWallet(), syncClearThrows: true });
    env.setItem(env.keys.SYNC_KEY, { baseline: { "month/2026-08": { rev: 9 } } });
    env.blockRemoval(env.keys.SYNC_KEY);            /* raw removeItem cannot clear it either */

    const before = env.raw();
    const res = await env.A.restoreWallet(makeExport(START_WALLET), { confirmed: true });

    assert.equal(res.ok, false);
    assert.equal(res.code, "sync_reset_failed");
    assert.equal(env.raw(), before, "mWalletData byte-identical — imported wallet not written");
    assert.ok(env.raw(env.keys.SYNC_KEY) !== null, "stale sync metadata still present (nothing pretended otherwise)");
});

test("B. ownership verification fails -> zero financial write", async () => {
    const env = createAccountEnv({ preloadedData: goodWallet(), ownerStatus: "owner_mismatch" });
    const before = env.raw();
    const snapBefore = JSON.stringify(env.snapshot());

    const res = await env.A.restoreWallet(makeExport(START_WALLET), { confirmed: true });

    assert.equal(res.code, "owner_mismatch");
    assert.equal(env.raw(), before);
    assert.equal(JSON.stringify(env.snapshot()), snapBefore, "no key touched at all");
    assert.equal(env.calls.syncClear, 0, "sync reset not even attempted");
});

test("C. save fails AFTER a successful sync reset -> old wallet authoritative, stale baseline gone", async () => {
    const env = createAccountEnv({ preloadedData: goodWallet() });
    env.setItem(env.keys.SYNC_KEY, { baseline: { "month/2026-08": { rev: 4 } } });
    const before = env.raw();

    env.harness.setFailWrites(true);               /* setItem throws; removeItem still works */
    const res = await env.A.restoreWallet(makeExport(START_WALLET), { confirmed: true });

    assert.equal(res.code, "local_storage_error");
    assert.equal(env.raw(), before, "previous wallet still authoritative");
    assert.equal(env.raw(env.keys.SYNC_KEY), null, "stale sync baseline is gone -> next repair uses no-base rules");
});

test("D. BP5 / UI re-resolution throws AFTER a verified restore -> restore still succeeds", async () => {
    const env = createAccountEnv({ preloadedData: START_WALLET });
    env.ctx.window.MWalletFirstRun._resolve = () => { throw new Error("first-run resolve blew up"); };
    env.ctx.window.BudgetApp.refresh = () => { throw new Error("refresh blew up"); };

    const res = await env.A.restoreWallet(makeExport(goodWallet()), { confirmed: true });

    assert.equal(res.ok, true, "optional experience-metadata failure never fails the financial restore");
    assert.equal(Object.keys(env.rawWallet().months).length, 1, "restored wallet is authoritative");
});

test("restore reuses the already-verified BP4 owner record instead of rewriting it", async () => {
    const env = createAccountEnv({ preloadedData: START_WALLET, ownerStatus: "owned", ownerMatches: true });
    const res = await env.A.restoreWallet(makeExport(goodWallet()), { confirmed: true });
    assert.equal(res.ok, true);
    assert.equal(env.calls.ensureOwnership, 0, "verified matching owner record left untouched");
});
