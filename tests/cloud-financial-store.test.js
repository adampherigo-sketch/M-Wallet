"use strict";

/* =========================================================
   BP7 — CLOUD FINANCIAL STORE

   Loads the real js/cloud/cloud-financial-store.js (+ the real
   codec) in a node:vm sandbox with a stub Supabase query
   builder and a stub MWalletAuth. Verifies:
     - status derives from auth WITHOUT any network call
     - initialize() makes zero client calls
     - the EXISTING authenticated client is reused (no 2nd client)
     - createDocument OMITS user_id and never forwards a
       caller-supplied owner id
     - reads filter by type/key, NEVER by user_id (RLS is the
       boundary)
     - updates carry the expected-revision filter; a stale
       revision -> revision_conflict, a missing row -> not_found
     - tombstone uses UPDATE (deleted_at); no hard delete on the
       public API
     - raw Supabase errors are mapped to safe codes and never
       leaked; diagnostics expose no owner id / payload / token
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const STORE_SRC = fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-store.js"), "utf8");
const CODEC_SRC = fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-codec.js"), "utf8");

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function dbRow(over) {
    return Object.assign({
        id: "11111111-1111-4111-8111-111111111111",
        document_type: "accounts",
        document_key: "primary",
        schema_version: 5,
        payload: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } },
        revision: 1,
        client_updated_at: "2026-08-31T00:00:00.000Z",
        created_at: "2026-08-31T00:00:00.000Z",
        updated_at: "2026-08-31T00:00:00.000Z",
        deleted_at: null
    }, over || {});
}

/* a stub of the supabase-js query builder (thenable, chainable) */
function makeSupabaseStub() {
    const calls = [];
    const queue = [];
    function next() { return queue.length ? queue.shift() : { data: null, error: null }; }
    function builder(table) {
        const st = { table, op: "select", filters: [], payload: null, select: null, single: false, maybeSingle: false };
        const rec = () => { calls.push(JSON.parse(JSON.stringify(st))); };
        const b = {
            select(cols) { st.select = cols; return b; },
            insert(p) { st.op = "insert"; st.payload = p; return b; },
            update(p) { st.op = "update"; st.payload = p; return b; },
            delete() { st.op = "delete"; return b; },
            upsert(p) { st.op = "upsert"; st.payload = p; return b; },
            eq(c, v) { st.filters.push(["eq", c, v]); return b; },
            is(c, v) { st.filters.push(["is", c, v]); return b; },
            gt(c, v) { st.filters.push(["gt", c, v]); return b; },
            order(c, o) { st.filters.push(["order", c, o]); return b; },
            limit(n) { st.filters.push(["limit", n]); return b; },
            maybeSingle() { st.maybeSingle = true; return b; },
            single() { st.single = true; return b; },
            then(resolve, reject) { rec(); return Promise.resolve(next()).then(resolve, reject); }
        };
        return b;
    }
    return {
        client: { from: (t) => builder(t) },
        calls,
        queue: (...rs) => { queue.push(...rs); }
    };
}

function makeEnv(opts) {
    opts = opts || {};
    const stub = makeSupabaseStub();
    let authSnap = opts.auth || { configured: true, status: "signed_in", user: { id: "user-a" }, session: {} };
    let signedIn = opts.signedIn !== undefined ? opts.signedIn : (authSnap.status === "signed_in");
    const client = opts.noClient ? null : stub.client;

    const logs = [];
    const sandbox = {
        window: {}, console: {
            log: (...a) => logs.push("l " + a.join(" ")),
            warn: (...a) => logs.push("w " + a.join(" ")),
            error: (...a) => logs.push("e " + a.join(" ")),
            info: (...a) => logs.push("i " + a.join(" ")),
            debug: () => {}
        },
        setTimeout, Promise, JSON, Number, Math, Date, String, Object, Array,
        TextEncoder: typeof TextEncoder !== "undefined" ? TextEncoder : undefined
    };
    sandbox.self = sandbox.window;
    sandbox.window.MWalletAuth = {
        getState: () => authSnap,
        isAuthenticated: () => signedIn === true,
        _getClient: () => client
    };
    vm.createContext(sandbox);
    vm.runInContext(CODEC_SRC, sandbox, { filename: "cloud-financial-codec.js" });
    vm.runInContext(STORE_SRC, sandbox, { filename: "cloud-financial-store.js" });

    return {
        store: sandbox.window.MWalletCloudFinancial,
        calls: stub.calls,
        queue: stub.queue,
        logs,
        setAuth: (s, si) => { authSnap = s; if (si !== undefined) { signedIn = si; } },
        sandbox
    };
}

const GOOD_DOC = {
    documentType: "accounts", documentKey: "primary", schemaVersion: 5,
    payload: { checking: { name: "Checking", balance: 10 }, savings: { name: "S", balance: 0 } }
};


test("status: unconfigured / signed-out / ready are derived WITHOUT a network call", async () => {
    const un = makeEnv({ auth: { configured: false, status: "unconfigured" }, signedIn: false });
    assert.equal(un.store.getState().status, "unconfigured");

    const out = makeEnv({ auth: { configured: true, status: "signed_out" }, signedIn: false });
    assert.equal(out.store.getState().status, "signed_out");

    const ready = makeEnv({});
    assert.equal(ready.store.getState().status, "ready");
    assert.equal(ready.store.getState().syncEnabled, false);

    [un, out, ready].forEach((e) => assert.equal(e.calls.length, 0, "no network from getState()"));
});

test("initialize() makes ZERO client calls", async () => {
    const env = makeEnv({});
    await env.store.initialize();
    assert.equal(env.calls.length, 0);
});

test("the store reuses MWalletAuth._getClient() — it never builds a second client", () => {
    assert.ok(!/createClient|MWalletAuthClient|auth-client|new\s+SupabaseClient/.test(STORE_SRC), "no client construction");
    assert.ok(/_getClient\s*\(/.test(STORE_SRC), "uses MWalletAuth._getClient()");
    assert.ok(!/mwallet\.auth\.session|localStorage\.setItem|access_token\s*=/.test(STORE_SRC), "no token/session copying");
});

test("createDocument: INSERT omits user_id and ignores any caller-supplied owner id", async () => {
    const env = makeEnv({});
    env.queue({ data: dbRow(), error: null });
    const res = await env.store.createDocument(Object.assign({ userId: "user-b", ownerUserId: "user-b" }, GOOD_DOC));
    assert.equal(res.ok, true);

    const insert = env.calls.find((c) => c.op === "insert");
    assert.ok(insert, "an insert happened");
    assert.ok(!("user_id" in insert.payload), "no user_id in the insert row");
    assert.ok(!("owner_user_id" in insert.payload), "no owner id in the insert row");
    assert.deepEqual(Object.keys(insert.payload).sort(), ["client_updated_at", "document_key", "document_type", "payload", "schema_version"]);
    assert.ok(!("userId" in (res.document || {})), "returned document has no user id");
});

test("getDocument / listDocuments: filter by type/key only — never by user_id", async () => {
    const env = makeEnv({});
    env.queue({ data: dbRow(), error: null });
    await env.store.getDocument("month", "2026-08");
    env.queue({ data: [dbRow({ document_type: "month", document_key: "2026-08" })], error: null });
    await env.store.listDocuments({ documentType: "month" });

    for (const call of env.calls) {
        assert.ok(!call.filters.some((f) => f[1] === "user_id"), "no user_id filter in " + call.op);
    }
    const get = env.calls[0];
    assert.ok(get.filters.some((f) => f[0] === "eq" && f[1] === "document_type" && f[2] === "month"));
    assert.ok(get.filters.some((f) => f[0] === "eq" && f[1] === "document_key" && f[2] === "2026-08"));
    const list = env.calls[1];
    assert.ok(list.filters.some((f) => f[0] === "is" && f[1] === "deleted_at"), "excludes tombstones by default");
});

test("updateDocument: carries the expected-revision filter; a stale revision -> revision_conflict", async () => {
    const env = makeEnv({});
    /* first update returns 0 rows -> conflict resolver then finds the row at revision 4 */
    env.queue({ data: [], error: null });
    env.queue({ data: { id: "x", revision: 4 }, error: null });
    const res = await env.store.updateDocument(GOOD_DOC, 1);
    assert.equal(res.ok, false);
    assert.equal(res.code, "revision_conflict");
    assert.equal(res.currentRevision, 4);

    const upd = env.calls.find((c) => c.op === "update");
    assert.ok(upd.filters.some((f) => f[0] === "eq" && f[1] === "revision" && f[2] === 1), "revision=1 filter present");
    assert.ok(!("user_id" in upd.payload) && !("revision" in upd.payload), "client does not set user_id or revision");
});

test("updateDocument: 0 rows + no such row -> not_found", async () => {
    const env = makeEnv({});
    env.queue({ data: [], error: null });
    env.queue({ data: null, error: null });
    const res = await env.store.updateDocument(GOOD_DOC, 2);
    assert.equal(res.ok, false);
    assert.equal(res.code, "not_found");
});

test("updateDocument: a happy update returns the new (sanitized) document", async () => {
    const env = makeEnv({});
    env.queue({ data: [dbRow({ revision: 2 })], error: null });
    const res = await env.store.updateDocument(GOOD_DOC, 1);
    assert.equal(res.ok, true);
    assert.equal(res.document.revision, 2);
    assert.ok(!("user_id" in res.document));
});

test("tombstoneDocument uses UPDATE (deleted_at) + revision filter; there is no hard-delete method", async () => {
    const env = makeEnv({});
    env.queue({ data: [dbRow({ deleted_at: "2026-09-01T00:00:00.000Z", revision: 2 })], error: null });
    const res = await env.store.tombstoneDocument("cash", "primary", 1);
    assert.equal(res.ok, true);
    assert.ok(res.document.deletedAt);

    const call = env.calls.find((c) => c.op === "update");
    assert.ok("deleted_at" in call.payload, "sets deleted_at");
    assert.ok(call.filters.some((f) => f[1] === "revision" && f[2] === 1));
    assert.ok(!env.calls.some((c) => c.op === "delete"), "no hard DELETE issued");

    /* the public API exposes no destructive method */
    for (const forbidden of ["hardDelete", "deleteDocument", "purge", "setUserId", "overrideOwner", "serviceRole", "adminQuery"]) {
        assert.equal(typeof env.store[forbidden], "undefined", "no " + forbidden + "()");
    }
});

test("restoreDocument sets deleted_at = null through a revision-checked UPDATE", async () => {
    const env = makeEnv({});
    env.queue({ data: [dbRow({ deleted_at: null, revision: 3 })], error: null });
    const res = await env.store.restoreDocument("cash", "primary", 2);
    assert.equal(res.ok, true);
    const call = env.calls.find((c) => c.op === "update");
    assert.equal(call.payload.deleted_at, null);
});

test("errors are mapped to safe codes; raw Supabase errors are never leaked", async () => {
    const cases = [
        [{ code: "42501", message: "new row violates row-level security policy" }, "forbidden"],
        [{ code: "42P01", message: 'relation "wallet_documents" does not exist' }, "schema_missing"],
        [{ status: 401, message: "JWT expired" }, "signed_out"],
        [{ code: "23514", message: "violates check constraint" }, "invalid_document"],
        [{ name: "TypeError", message: "Failed to fetch" }, "network_error"]
    ];
    for (const [raw, expected] of cases) {
        const env = makeEnv({});
        env.queue({ data: null, error: raw });
        const res = await env.store.createDocument(GOOD_DOC);
        assert.equal(res.ok, false);
        assert.equal(res.code, expected, JSON.stringify(raw));
        assert.deepEqual(Object.keys(res).sort(), ["code", "ok"], "only { ok, code } is returned");
        assert.ok(!JSON.stringify(env.store.diagnostics()).includes(raw.message || "zzz"), "raw message not in diagnostics");
    }
});

test("guarded methods short-circuit without a network call when signed out / unconfigured", async () => {
    const out = makeEnv({ auth: { configured: true, status: "signed_out" }, signedIn: false });
    assert.deepEqual(plain(await out.store.createDocument(GOOD_DOC)), { ok: false, code: "signed_out" });
    assert.deepEqual(plain(await out.store.getDocument("accounts", "primary")), { ok: false, code: "signed_out" });
    assert.deepEqual(plain(await out.store.checkAvailability()), { ok: false, code: "signed_out", schemaInstalled: null });
    assert.equal(out.calls.length, 0);

    const un = makeEnv({ auth: { configured: false, status: "unconfigured" }, signedIn: false });
    assert.deepEqual(plain(await un.store.listDocuments()), { ok: false, code: "unconfigured" });
    assert.equal(un.calls.length, 0);
});

test("checkAvailability: user-triggered minimal SELECT id LIMIT 1; never writes", async () => {
    const env = makeEnv({});
    env.queue({ data: [{ id: "x" }], error: null });
    const res = await env.store.checkAvailability();
    assert.equal(res.ok, true);
    assert.equal(res.schemaInstalled, true);
    const call = env.calls[0];
    assert.equal(call.op, "select");
    assert.equal(call.select, "id");
    assert.ok(call.filters.some((f) => f[0] === "limit"));
    assert.ok(!env.calls.some((c) => ["insert", "update", "delete", "upsert"].indexOf(c.op) !== -1), "no write");
});

test("checkAvailability: a missing table -> schema_missing (schemaInstalled false)", async () => {
    const env = makeEnv({});
    env.queue({ data: null, error: { code: "42P01", message: "does not exist" } });
    const res = await env.store.checkAvailability();
    assert.equal(res.ok, false);
    assert.equal(res.code, "schema_missing");
    assert.equal(res.schemaInstalled, false);
});

test("diagnostics + returns expose no owner id, payload, or token; nothing is logged", async () => {
    const env = makeEnv({});
    env.queue({ data: dbRow({ payload: { checking: { name: "Everyday", balance: 987654.32 } } }), error: null });
    await env.store.createDocument(GOOD_DOC);
    env.queue({ data: dbRow(), error: { code: "42501", message: "denied" } });
    await env.store.updateDocument(GOOD_DOC, 1);

    const blob = JSON.stringify(env.store.diagnostics()) + JSON.stringify(env.store.getState());
    assert.ok(!blob.includes("user-a") && !blob.includes("user-b"), "no owner id");
    assert.ok(!blob.includes("987654"), "no financial payload value");
    assert.ok(!/token|password|bearer|authorization/i.test(blob));
    assert.ok(env.logs.length === 0, "the store logs nothing");
});

test("createDocument rejects an invalid document (NaN payload) before any network call", async () => {
    const env = makeEnv({});
    const res = await env.store.createDocument({ documentType: "accounts", documentKey: "primary", schemaVersion: 5, payload: { x: NaN } });
    assert.equal(res.ok, false);
    assert.equal(res.code, "invalid_document");
    assert.equal(env.calls.length, 0, "validation happens client-side, before the network");
});

test("the store never wires itself into storage.save / load / app refresh (source-level)", () => {
    assert.ok(!/BudgetStorage|MWalletStorage|storage\.save|storage\.load|BudgetApp|mWalletData/.test(STORE_SRC),
        "no coupling to the local financial engine");
    assert.ok(!/MWalletFirstRun|MWalletWalkthrough/.test(STORE_SRC), "no coupling to BP5 / BP6");
    /* the ONLY auto behaviour on load is initialize(), which does no network */
    assert.ok(/DOMContentLoaded[\s\S]{0,80}initialize\(\)/.test(STORE_SRC) || /initialize\(\)/.test(STORE_SRC));
});
