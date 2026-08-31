"use strict";

/* =========================================================
   BP10 — WALLET EXPORT

   exportWallet() wraps the RAW stored wallet in a versioned
   envelope. It must:
     - never mutate mWalletData (byte-identical before/after)
     - exclude every auth / owner / setup / sync / passkey key
     - be explicit (returns a string + filename; downloads
       nothing itself)
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccountEnv } = require("./helpers/account-harness.js");

const WALLET = {
    version: 5,
    migrations: { savingsAccountV5: true },
    income: [{ id: "i1", name: "Salary", amount: 4000 }],
    expenses: [{ id: "e1", name: "Rent", amount: 1500.5 }],
    months: {
        "2026-07": { monthKey: "2026-07", transactions: [{ id: "t1", amount: 9.99 }], bills: [], paychecks: [], expenses: [], savingsDeposits: [] },
        "2026-08": { monthKey: "2026-08", transactions: [{ id: "t2", amount: 100.01 }, { id: "t3", amount: 3.33 }], bills: [{ id: "b1", amount: 60 }], paychecks: [], expenses: [], savingsDeposits: [] }
    },
    savingsGoals: [{ id: "g1", name: "Trip", target: 2000, saved: 500 }],
    savingsTransfers: [],
    settings: { currency: "USD", currencySymbol: "$", categories: { version: 1, list: [] } },
    accounts: { checking: { name: "Checking", balance: 1234.56 } },
    cash: { initialized: true, history: [] }
};


test("export produces a versioned wrapper with the full wallet", () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const res = env.A.exportWallet();

    assert.equal(res.ok, true);
    assert.match(res.filename, /^m-wallet-export-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(res.mimeType, "application/json");

    const parsed = JSON.parse(res.json);
    assert.equal(parsed.format, "m-wallet-export");
    assert.equal(parsed.formatVersion, 1);
    assert.equal(parsed.appVersion, "0.9.0-beta.9");
    assert.ok(parsed.createdAt);
    /* the wrapper formatVersion is SEPARATE from the wallet schema version */
    assert.equal(parsed.wallet.version, 5);
    assert.equal(parsed.wallet.accounts.checking.balance, 1234.56);
    assert.equal(Object.keys(parsed.wallet.months).length, 2);
});

test("export does NOT mutate mWalletData — byte-identical before and after", () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const before = env.raw();
    env.A.exportWallet();
    env.A.exportWallet();
    assert.equal(env.raw(), before);
});

test("export excludes every auth / owner / setup / walkthrough / sync / passkey artifact", () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    env.setItem("mwallet.auth.session", { access_token: "SECRET_TOKEN", refresh_token: "SECRET_REFRESH" });
    env.setItem("mwallet.auth.config", { url: "https://x.supabase.co", key: "sb_publishable_zzz" });
    env.setItem(env.keys.OWNER_KEY, { schemaVersion: 1, ownerUserId: "owner-uuid-1" });
    env.setItem(env.keys.SETUP_KEY, { status: "complete" });
    env.setItem(env.keys.SYNC_KEY, { baseline: {} });

    const res = env.A.exportWallet();
    const blob = res.json;

    assert.ok(!blob.includes("SECRET_TOKEN"));
    assert.ok(!blob.includes("SECRET_REFRESH"));
    assert.ok(!blob.includes("sb_publishable_zzz"));
    assert.ok(!blob.includes("owner-uuid-1"));
    assert.ok(!/access_token|refresh_token|supabase/i.test(blob));

    const parsed = JSON.parse(blob);
    assert.deepEqual(Object.keys(parsed).sort(), ["appVersion", "createdAt", "format", "formatVersion", "wallet"]);
    assert.ok(!("ownerUserId" in parsed.wallet));
});

test("export with no stored wallet yet still yields a valid importable default", () => {
    const env = createAccountEnv();               /* nothing preloaded */
    env.ls.removeItem("mWalletData");
    const res = env.A.exportWallet();
    assert.equal(res.ok, true);
    const parsed = JSON.parse(res.json);
    assert.equal(parsed.format, "m-wallet-export");
    assert.equal(parsed.wallet.version, 5);
});

test("export writes nothing to localStorage", () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const snapBefore = JSON.stringify(env.snapshot());
    env.A.exportWallet();
    assert.equal(JSON.stringify(env.snapshot()), snapBefore);
});

test("the exported JSON round-trips through JSON.parse with no precision loss", () => {
    const env = createAccountEnv({ preloadedData: WALLET });
    const parsed = JSON.parse(env.A.exportWallet().json);
    assert.equal(parsed.wallet.expenses[0].amount, 1500.5);
    assert.equal(parsed.wallet.months["2026-08"].transactions[0].amount, 100.01);
});
