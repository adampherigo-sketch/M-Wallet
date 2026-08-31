"use strict";

/* =========================================================
   BP10 — ERASE WALLET FROM THIS DEVICE

   eraseLocalWallet({ phrase: "ERASE" }) removes the financial
   key + every owner-bound sidecar, verifies each is gone,
   signs the user out, and never claims success without the
   verify step. It must NOT use localStorage.clear(), must NOT
   remove the auth config, and must NOT touch unrelated keys.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccountEnv } = require("./helpers/account-harness.js");

const WALLET = {
    version: 5, income: [{ id: "i1", amount: 100 }], expenses: [], months: {},
    savingsGoals: [], savingsTransfers: [], settings: { currency: "USD", categories: { version: 1, list: [] } }
};

function seedEverything(env) {
    env.setItem(env.keys.OWNER_KEY, { schemaVersion: 1, ownerUserId: "owner-uuid-1", source: "legacy" });
    env.setItem(env.keys.SETUP_KEY, { status: "complete" });
    env.setItem(env.keys.DRAFT_KEY, { step: 2 });
    env.setItem(env.keys.WT_RECORD_KEY, { status: "completed" });
    env.setItem(env.keys.WT_PROGRESS_KEY, { step: 3 });
    env.setItem(env.keys.SYNC_KEY, { baseline: {} });
    env.ls.setItem("budgetTrackerData", "{}");
    env.ls.setItem("budgetTrackerMoneyEntries", "[]");
    env.ls.setItem("mWalletMoneyEntries", "[]");
    env.setItem("mwallet.auth.config", { url: "https://x.supabase.co", key: "sb_publishable_keep_me" });
    env.setItem("mwallet.auth.session", { note: "supabase-managed" });
    env.setItem("some.other.app", "leave me alone");
}


test("erase requires the exact confirmation phrase", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    assert.equal((await env.A.eraseLocalWallet({ phrase: "" })).code, "confirmation_required");
    assert.equal((await env.A.eraseLocalWallet({ phrase: "erase please" })).code, "confirmation_required");
    assert.equal((await env.A.eraseLocalWallet({})).code, "confirmation_required");
    assert.ok(env.raw() !== null, "nothing erased without the phrase");
});

test("erase accepts the phrase case-insensitively / trimmed", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const res = await env.A.eraseLocalWallet({ phrase: "  erase  " });
    assert.equal(res.ok, true);
});

test("erase removes the wallet + every owner-bound sidecar and verifies", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    seedEverything(env);

    const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });
    assert.equal(res.ok, true);

    assert.equal(env.raw(), null, "mWalletData gone");
    assert.equal(env.raw(env.keys.OWNER_KEY), null);
    assert.equal(env.raw(env.keys.SETUP_KEY), null);
    assert.equal(env.raw(env.keys.DRAFT_KEY), null);
    assert.equal(env.raw(env.keys.WT_RECORD_KEY), null);
    assert.equal(env.raw(env.keys.WT_PROGRESS_KEY), null);
    assert.equal(env.raw(env.keys.SYNC_KEY), null);
});

test("erase keeps the auth config + unrelated site data, and never calls localStorage.clear()", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    seedEverything(env);
    let cleared = false;
    env.ls.clear = () => { cleared = true; };

    await env.A.eraseLocalWallet({ phrase: "ERASE" });

    assert.equal(cleared, false, "localStorage.clear() never called");
    assert.ok(env.raw("mwallet.auth.config") !== null, "auth config kept");
    assert.equal(env.raw("some.other.app"), "leave me alone");
});

test("erase signs the user out (prevents auto-reclaim of a fresh wallet)", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });
    assert.equal(res.ok, true);
    assert.equal(res.signedOut, true);
    assert.equal(env.calls.signOut.length, 1);
});

test("erase reports an incomplete wipe instead of claiming success", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const realRemove = env.ls.removeItem.bind(env.ls);
    env.ls.removeItem = (k) => { if (k === "mWalletData") { return; } return realRemove(k); };

    const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });
    assert.equal(res.ok, false);
    assert.equal(res.code, "erase_incomplete");
    assert.ok(res.remaining >= 1);
});

test("erase never emits a financial-saved write (it deletes, it doesn't save defaults)", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    let saves = 0;
    const realSave = env.harness.storage.save.bind(env.harness.storage);
    env.harness.storage.save = (d) => { saves += 1; return realSave(d); };
    await env.A.eraseLocalWallet({ phrase: "ERASE" });
    assert.equal(saves, 0, "no save() during erase");
});

test("erase does NOT refresh the app / re-resolve BP4/BP5 (no wallet recreation in-flight)", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });
    assert.equal(res.ok, true);
    assert.equal(env.calls.appRefresh, 0, "app not refreshed by the erase flow");
    assert.equal(env.calls.firstRunResolve, 0);
    assert.equal(env.calls.ensureOwnership, 0);
    assert.equal(env.raw(), null, "and the wallet stays gone");
});


/* ---- BP10 final hardening: erase failure ordering ---- */

/* A removal that fails BEFORE mWalletData must leave the real wallet intact. */
for (const [label, keyName] of [
    ["setup sidecar", "SETUP_KEY"],
    ["walkthrough record", "WT_RECORD_KEY"],
    ["sync-state metadata", "SYNC_KEY"],
    ["legacy financial key", null],
    ["ownership record", "OWNER_KEY"]
]) {
    test(`erase aborts with mWalletData intact when the ${label} cannot be removed`, async () => {
        const env = createAccountEnv({ preloadedData: WALLET });
        seedEverything(env);
        const blockKey = keyName ? env.keys[keyName] : "budgetTrackerMoneyEntries";
        env.blockRemoval(blockKey);

        const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });

        assert.equal(res.ok, false);
        assert.equal(res.code, "erase_incomplete");
        assert.equal(res.walletPreserved, true);
        assert.ok(env.raw() !== null, "mWalletData preserved");
        assert.equal(env.calls.signOut.length, 0, "not signed out on an aborted erase");
    });
}

test("E. primary mWalletData removal fails -> erase_incomplete, no success claim", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    seedEverything(env);
    env.blockRemoval("mWalletData");

    const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });

    assert.equal(res.ok, false);
    assert.equal(res.code, "erase_incomplete");
    assert.ok(res.remaining >= 1);
    assert.equal(env.calls.signOut.length, 0, "no sign-out when the wallet is still present");
    assert.ok(env.raw() !== null);
});

test("F. all removals succeed -> keys absent, unrelated data preserved, sign-out once", async () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    seedEverything(env);

    const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });

    assert.equal(res.ok, true);
    assert.equal(res.erased, true);
    assert.equal(res.signedOut, true);
    for (const k of Object.values(env.keys)) { assert.equal(env.raw(k), null, k + " gone"); }
    assert.equal(env.raw(), null);
    assert.equal(env.raw("mwallet.auth.config"), JSON.stringify({ url: "https://x.supabase.co", key: "sb_publishable_keep_me" }));
    assert.equal(env.raw("some.other.app"), "leave me alone");
    assert.equal(env.calls.signOut.length, 1, "sign-out attempted exactly once");
});

test("G. sign-out fails after a verified erase -> erased_signout_failed, wallet stays gone, no recreation", async () => {
    const env = createAccountEnv({ preloadedData: WALLET, authResponses: { signOut: { ok: false } } });
    seedEverything(env);
    let saves = 0;
    const realSave = env.harness.storage.save.bind(env.harness.storage);
    env.harness.storage.save = (d) => { saves += 1; return realSave(d); };

    const res = await env.A.eraseLocalWallet({ phrase: "ERASE" });

    assert.equal(res.ok, false);
    assert.equal(res.code, "erased_signout_failed");
    assert.equal(res.erased, true, "truthful: the wallet IS gone");
    assert.equal(env.raw(), null, "wallet still erased — not recreated to roll back");
    assert.equal(saves, 0, "no save() -> no recreated mWalletData");
    assert.equal(env.calls.signOut.length, 1);
});
