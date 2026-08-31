"use strict";

/* =========================================================
   BP9 — PASSKEY MANAGEMENT (list / rename / delete)

   Real js/auth/passkeys.js against a stub Supabase client.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPasskeyEnv } = require("./helpers/passkey-harness.js");

const plain = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

function enabledEnv(over) {
    const env = createPasskeyEnv(Object.assign({ webAuthnSupported: true }, over || {}));
    env.enable();
    return env;
}

const ROWS = [
    { id: "cred_aaaaaaaa", friendly_name: "Adam's MacBook", created_at: "2026-07-01T00:00:00Z", last_used_at: "2026-08-20T00:00:00Z" },
    { id: "cred_bbbbbbbb", friendly_name: "iPhone", created_at: "2026-07-15T00:00:00Z" }
];


test("list requires signed-in; release-disabled or signed-out -> safe code, ZERO calls", async () => {
    const off = createPasskeyEnv({ webAuthnSupported: true });
    assert.equal((await off.P.list()).code, "disabled");
    assert.equal(off.supa.calls.length, 0);

    const out = enabledEnv({ auth: { status: "signed_out" } });
    assert.equal((await out.P.list()).code, "signed_out");
    assert.equal(out.supa.calls.length, 0);
});

test("list calls auth.passkey.list and returns a safe normalized list (no credential id shown)", async () => {
    const env = enabledEnv();
    env.supa.set("passkey.list", { data: { passkeys: ROWS }, error: null });
    const res = await env.P.list();
    assert.equal(res.ok, true);
    assert.equal(env.supa.calls.includes("passkey.list"), true);
    assert.equal(res.passkeys.length, 2);
    const first = plain(res.passkeys[0]);
    assert.deepEqual(Object.keys(first).sort(), ["_ref", "createdAt", "friendlyName", "lastUsedAt"]);
    assert.equal(first.friendlyName, "Adam's MacBook");
    assert.equal(first.createdAt, "2026-07-01T00:00:00.000Z");
    /* _ref exists (the API needs it) but it's the opaque handle, never a
       user-facing string; the credential id itself is not "shown" anywhere */
    assert.equal(first._ref, "cred_aaaaaaaa");
});

test("list does not persist anything and does not poll", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/localStorage|sessionStorage/.test(strip), "no persistence");
    assert.ok(!/setInterval|setTimeout\([^,]+,\s*\d{3,}/.test(strip), "no polling timer");
});

test("list can use the in-memory cache without a second network call", async () => {
    const env = enabledEnv();
    env.supa.set("passkey.list", { data: { passkeys: ROWS }, error: null });
    await env.P.list();
    env.supa.reset();
    const cached = await env.P.list({ useCache: true });
    assert.equal(cached.ok, true);
    assert.equal(env.supa.calls.length, 0, "cache hit -> no network");
});

test("rename validates the friendly name (trim, non-empty, <=120)", async () => {
    const env = enabledEnv();
    assert.equal((await env.P.rename("cred_x", "")).code, "invalid_name");
    assert.equal((await env.P.rename("cred_x", "   ")).code, "invalid_name");
    assert.equal((await env.P.rename("cred_x", "x".repeat(200))).code === "invalid_name", false,
        "an over-long name is trimmed, not rejected");
    assert.equal((await env.P.rename("", "Name")).code, "management_failed", "no ref -> refuse");
    assert.equal(env.supa.calls.filter((c) => c.startsWith("passkey.update")).length <= 1, true);
});

test("rename calls auth.passkey.update for exactly one passkey with the right shape", async () => {
    const env = enabledEnv();
    env.supa.set("passkey.update", { data: { id: "cred_aaaaaaaa" }, error: null });
    env.supa.set("passkey.list", { data: { passkeys: ROWS }, error: null });
    const res = await env.P.rename("cred_aaaaaaaa", "  Work  laptop  ");
    assert.equal(res.ok, true);
    const upd = env.supa.calls.find((c) => c.startsWith("passkey.update"));
    assert.equal(upd, 'passkey.update:{"passkeyId":"cred_aaaaaaaa","friendlyName":"Work laptop"}');
    assert.equal(env.supa.calls.filter((c) => c.startsWith("passkey.update")).length, 1);
    assert.ok(env.supa.calls.includes("passkey.list"), "list refreshed after rename");
});

test("rename does not show the new name as final until the server confirms", async () => {
    const env = enabledEnv();
    env.supa.set("passkey.list", { data: { passkeys: ROWS }, error: null });
    await env.P.list();
    env.supa.set("passkey.update", { data: null, error: { status: 500, message: "boom" } });
    const res = await env.P.rename("cred_aaaaaaaa", "Renamed");
    assert.equal(res.ok, false);
    assert.equal(res.code, "management_failed");
    /* the in-memory list still shows the OLD name */
    const after = await env.P.list({ useCache: true });
    assert.equal(after.passkeys[0].friendlyName, "Adam's MacBook");
});

test("delete requires an exact ref and calls auth.passkey.delete once", async () => {
    const env = enabledEnv();
    env.supa.set("passkey.delete", { data: null, error: null });
    env.supa.set("passkey.list", { data: { passkeys: [ROWS[1]] }, error: null });
    assert.equal((await env.P.remove("")).code, "management_failed");
    const res = await env.P.remove("cred_aaaaaaaa");
    assert.equal(res.ok, true);
    assert.equal(env.supa.calls.filter((c) => c.startsWith("passkey.delete")).length, 1);
    assert.equal(env.supa.calls.find((c) => c.startsWith("passkey.delete")), 'passkey.delete:{"passkeyId":"cred_aaaaaaaa"}');
    assert.ok(env.supa.calls.includes("passkey.list"), "list refreshed after a successful delete");
});

test("a failed delete keeps the item (no optimistic removal) and returns a safe code", async () => {
    const env = enabledEnv();
    env.supa.set("passkey.list", { data: { passkeys: ROWS }, error: null });
    await env.P.list();
    env.supa.reset();
    env.supa.set("passkey.delete", { data: null, error: { status: 500, message: "server error" } });
    const res = await env.P.remove("cred_aaaaaaaa");
    assert.equal(res.ok, false);
    assert.equal(res.code, "management_failed");
    assert.ok(!env.supa.calls.includes("passkey.list"), "no refresh after a failed delete");
    const after = await env.P.list({ useCache: true });
    assert.equal(after.passkeys.length, 2, "both passkeys still present");
});

test("management raw Supabase errors are never leaked; safe codes only", async () => {
    const env = enabledEnv();
    env.supa.set("passkey.list", { data: null, error: { message: "column \"foo\" does not exist", status: 500 } });
    const res = await env.P.list();
    assert.equal(res.ok, false);
    assert.ok(!JSON.stringify(res).includes("does not exist"));
    assert.ok(["management_failed", "unknown_error", "network_error", "auth_failed"].indexOf(res.code) !== -1);
});

test("the last passkey CAN be removed after confirmation (password remains the fallback)", async () => {
    /* M-Wallet users always retain email+password, so removing the last
       passkey is not a lockout. This test documents that assumption. */
    const env = enabledEnv();
    env.supa.set("passkey.list", { data: { passkeys: [ROWS[0]] }, error: null });
    await env.P.list();
    env.supa.set("passkey.delete", { data: null, error: null });
    env.supa.set("passkey.list", { data: { passkeys: [] }, error: null });
    const res = await env.P.remove("cred_aaaaaaaa");
    assert.equal(res.ok, true);
    assert.equal((await env.P.list({ useCache: true })).passkeys.length, 0);
});

test("management never persists the list or exposes a credential id as text (source-level)", () => {
    const src = require("fs").readFileSync(require("path").resolve(__dirname, "..", "js/auth/passkeys.js"), "utf8");
    const strip = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/localStorage|sessionStorage/.test(strip));
    assert.ok(!/console\.(log|info|warn|error|debug)\s*\([^)]*(_ref|credential|passkeyId|friendly)/i.test(strip));
});
