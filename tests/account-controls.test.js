"use strict";

/* =========================================================
   BP10 — ACCOUNT CONTROLS  (window.MWalletAccount)

   The narrow, DOM-free account API: summary, change email,
   sign out (this device / all), diagnostics, and the honest
   account-deletion status. None of these may mutate the
   financial wallet.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAccountEnv } = require("./helpers/account-harness.js");

const plain = (v) => JSON.parse(JSON.stringify(v));

const MEANINGFUL_WALLET = {
    version: 5,
    income: [{ id: "i1", name: "Salary", amount: 4000 }],
    expenses: [{ id: "e1", name: "Rent", amount: 1500 }],
    months: {
        "2026-08": {
            monthKey: "2026-08",
            transactions: [{ id: "t1", amount: 12.34, category: "Food" }],
            bills: [], paychecks: [], expenses: [], savingsDeposits: []
        }
    },
    savingsGoals: [{ id: "g1", name: "Trip", target: 2000, saved: 500 }],
    settings: { currency: "USD", categories: { version: 1, list: [{ id: "c1", name: "Food" }] } }
};


test("getSummary exposes account/security/privacy state — never a user id or token", () => {
    const env = createAccountEnv({ preloadedData: MEANINGFUL_WALLET });
    const s = env.A.getSummary();

    assert.equal(s.account.signedIn, true);
    assert.equal(s.account.email, "owner@example.com");
    assert.equal(s.account.emailVerified, true);
    assert.equal(s.data.storedLocally, true);
    assert.equal(s.data.exportAvailable, true);
    assert.equal(s.privacy.cloudSyncActive, false);
    assert.equal(s.privacy.analytics, "none");
    assert.equal(s.accountDeletion.available, false);

    const blob = JSON.stringify(s);
    assert.ok(!blob.includes("owner-uuid-1"), "no user id");
    assert.ok(!/token|bearer|authorization|service_role/i.test(blob), "no auth secrets");
});

test("diagnostics leaks nothing identifying", () => {
    const env = createAccountEnv({ preloadedData: MEANINGFUL_WALLET });
    const d = env.A.diagnostics();
    assert.deepEqual(Object.keys(d).sort(), [
        "accountDeletionAvailable", "configured", "emailVerified", "eraseTargetCount",
        "exportAvailable", "importAvailable", "passkeyReleaseEnabled", "recoveryMode",
        "signedIn", "syncReleaseEnabled"
    ]);
    const blob = JSON.stringify(d);
    assert.ok(!blob.includes("owner@example.com"));
    assert.ok(!blob.includes("owner-uuid-1"));
});

test("accountDeletionStatus is honest: not available, needs a trusted server", () => {
    const env = createAccountEnv();
    const st = env.A.accountDeletionStatus();
    assert.equal(st.available, false);
    assert.equal(st.reason, "requires_trusted_server");
    assert.match(st.note, /server-side/i);
});

test("changeEmail delegates to MWalletAuth.updateEmail and never writes the wallet", async () => {
    const env = createAccountEnv({ preloadedData: MEANINGFUL_WALLET });
    const before = env.raw();

    const res = await env.A.changeEmail("new@example.com");
    assert.equal(res.ok, true);
    assert.equal(res.verificationRequired, true);
    assert.deepEqual(env.calls.updateEmail, ["new@example.com"]);
    assert.equal(env.raw(), before, "mWalletData byte-identical");
});

test("changeEmail is a guarded no-op when signed out / in recovery / unconfigured", async () => {
    let env = createAccountEnv({ auth: { status: "signed_out" } });
    assert.equal((await env.A.changeEmail("x@y.com")).code, "auth_required");

    env = createAccountEnv({ auth: { recoveryMode: true } });
    assert.equal((await env.A.changeEmail("x@y.com")).code, "recovery_mode");

    env = createAccountEnv({ auth: { configured: false, status: "unconfigured" } });
    assert.equal((await env.A.changeEmail("x@y.com")).code, "not_configured");
});

test("signOut passes scope local by default; signOutEverywhere uses global", async () => {
    const env = createAccountEnv();
    await env.A.signOut();
    await env.A.signOutEverywhere();
    assert.deepEqual(plain(env.calls.signOut[0]), { scope: "local" });
    assert.deepEqual(plain(env.calls.signOut[1]), { scope: "global" });
});

test("signOut never touches the wallet", async () => {
    const env = createAccountEnv({ preloadedData: MEANINGFUL_WALLET });
    const before = env.raw();
    await env.A.signOut();
    assert.equal(env.raw(), before);
});

test("sendPasswordReset reuses the BP3 reset-email flow for the signed-in address", async () => {
    const env = createAccountEnv();
    const res = await env.A.sendPasswordReset();
    assert.equal(res.ok, true);
    assert.deepEqual(env.calls.resetPassword, ["owner@example.com"]);
});

test("ERROR_CODES is a frozen-ish whitelist and fail() never returns an unknown code", () => {
    const env = createAccountEnv();
    assert.ok(env.A.ERROR_CODES.includes("erase_incomplete"));
    assert.ok(env.A.ERROR_CODES.includes("owner_mismatch"));
});

test("eraseTargets is computed from the real module key exports", () => {
    const env = createAccountEnv();
    const targets = env.A.eraseTargets();
    for (const k of Object.values(env.keys)) {
        assert.ok(targets.includes(k), "targets include " + k);
    }
    assert.ok(targets.includes("mWalletData"));
    /* auth config + session are NOT erase targets */
    assert.ok(!targets.includes("mwallet.auth.config"));
    assert.ok(!targets.includes("mwallet.auth.session"));
});

test("no console noise from a summary / diagnostics call", () => {
    const env = createAccountEnv({ preloadedData: MEANINGFUL_WALLET });
    const logs = [];
    const orig = console.log;
    console.log = (...a) => logs.push(a.join(" "));
    try {
        env.A.getSummary();
        env.A.diagnostics();
    } finally {
        console.log = orig;
    }
    assert.equal(logs.length, 0);
});
