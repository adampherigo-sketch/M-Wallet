"use strict";

/* =========================================================
   BP8 — LOCAL SYNC STATE  (mwallet.sync.state.v1)

   Owner-bound metadata only. This suite proves it never
   stores a financial payload, is bound to the Supabase user
   id, resets safely on malformed JSON, and de-dupes pending /
   conflict identities.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/sync/sync-state.js"), "utf8");

function makeMemoryStorage(seed) {
    const map = new Map(Object.entries(seed || {}));
    return {
        getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
        setItem: (k, v) => { map.set(String(k), String(v)); },
        removeItem: (k) => { map.delete(String(k)); },
        _map: map,
        _failWrites: false
    };
}

function load(seed, opts) {
    opts = opts || {};
    const storage = makeMemoryStorage(seed);
    if (opts.failWrites) {
        storage.setItem = () => { throw new Error("quota"); };
    }
    const sandbox = { window: {}, console };
    sandbox.self = sandbox.window;
    sandbox.window.localStorage = storage;
    sandbox.localStorage = storage;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: "sync-state.js" });
    return { S: sandbox.window.MWalletSyncState, storage };
}

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }


test("createEmpty produces a valid, owner-bound, payload-free shape", () => {
    const { S } = load();
    const st = S.createEmpty("user-a");
    assert.equal(S.validateShape(st).ok, true);
    assert.equal(st.ownerUserId, "user-a");
    assert.deepEqual(plain(st.documents), {});
    assert.deepEqual(plain(st.pending), []);
    assert.deepEqual(plain(st.conflicts), []);
    assert.equal(st.bootstrapStatus, "unknown");
});

test("load: fresh key -> empty state (reason 'fresh')", () => {
    const { S } = load();
    const r = S.load("user-a");
    assert.equal(r.reason, "fresh");
    assert.equal(r.state.ownerUserId, "user-a");
});

test("load: a state owned by user A is ignored when user B is signed in", () => {
    const foreign = JSON.stringify({
        schemaVersion: 1, ownerUserId: "user-a",
        documents: { "month/2026-08": { revision: 3, baseHash: "abc", deleted: false, lastSyncedAt: "2026-08-01T00:00:00.000Z" } },
        pending: [], conflicts: [], lastAttemptAt: null, lastSuccessAt: null, bootstrapStatus: "complete"
    });
    const { S } = load({ "mwallet.sync.state.v1": foreign });
    const r = S.load("user-b");
    assert.equal(r.reason, "foreign_owner");
    assert.deepEqual(plain(r.state.documents), {}, "no document identities from user A leak through");
    assert.equal(r.state.ownerUserId, "user-b");
});

test("load: malformed JSON -> safe empty reset, does not throw", () => {
    const { S } = load({ "mwallet.sync.state.v1": "{ not json" });
    const r = S.load("user-a");
    assert.equal(r.reason, "malformed");
    assert.equal(S.validateShape(r.state).ok, true);
});

test("load: a state with an unexpected key -> treated as malformed (whitelist)", () => {
    const bad = JSON.stringify({
        schemaVersion: 1, ownerUserId: "user-a", documents: {}, pending: [], conflicts: [],
        lastAttemptAt: null, lastSuccessAt: null, bootstrapStatus: "unknown",
        payload: { checking: { balance: 9999 } }          /* <- financial data must be rejected */
    });
    const { S } = load({ "mwallet.sync.state.v1": bad });
    assert.equal(S.load("user-a").reason, "malformed");
});

test("validateShape rejects a non-primitive leaf (a leaked payload object)", () => {
    const { S } = load();
    const st = S.createEmpty("user-a");
    st.documents["month/2026-08"] = { revision: 1, baseHash: "h", deleted: false, lastSyncedAt: "x", note: { secret: "balance" } };
    const v = S.validateShape(st);
    assert.equal(v.ok, false);
    assert.ok(v.issues.some((i) => /non-primitive/.test(i)));
});

test("persist refuses to write an invalid state", () => {
    const { S, storage } = load();
    const bad = S.createEmpty("user-a");
    bad.pending.push({ documentType: "month", documentKey: "2026-08", operation: "upsert", queuedAt: "x", attempts: 0, lastError: null, payload: { x: 1 } });
    const res = S.persist(bad);
    assert.equal(res.ok, false);
    assert.equal(res.code, "invalid_state");
    assert.equal(storage.getItem("mwallet.sync.state.v1"), null, "nothing was written");
});

test("persist -> load round-trips a valid state", () => {
    const { S } = load();
    const st = S.createEmpty("user-a");
    S.setBaseline(st, "month", "2026-08", { revision: 4, baseHash: "hhh", deleted: false });
    S.queuePending(st, "settings", "primary", "upsert");
    assert.equal(S.persist(st).ok, true);
    const back = S.load("user-a");
    assert.equal(back.reason, "loaded");
    assert.equal(S.getBaseline(back.state, "month", "2026-08").revision, 4);
    assert.equal(S.hasPending(back.state, "settings", "primary"), true);
});

test("pending queue de-dupes by identity and keeps attempts", () => {
    const { S } = load();
    const st = S.createEmpty("user-a");
    S.queuePending(st, "month", "2026-08", "upsert");
    S.bumpPendingAttempt(st, "month", "2026-08", "network_error");
    S.queuePending(st, "month", "2026-08", "upsert");        /* again */
    assert.equal(st.pending.length, 1);
    assert.equal(st.pending[0].attempts, 1, "attempts preserved across re-queue");
    assert.equal(st.pending[0].lastError, "network_error");
});

test("conflicts de-dupe by identity; add / has / drop", () => {
    const { S } = load();
    const st = S.createEmpty("user-a");
    S.addConflict(st, { documentType: "month", documentKey: "2026-08", baseRevision: 2, remoteRevision: 3, reason: "both_changed" });
    S.addConflict(st, { documentType: "month", documentKey: "2026-08", baseRevision: 2, remoteRevision: 4, reason: "both_changed" });
    assert.equal(st.conflicts.length, 1);
    assert.equal(st.conflicts[0].remoteRevision, 4);
    assert.equal(S.hasConflict(st, "month", "2026-08"), true);
    S.dropConflict(st, "month", "2026-08");
    assert.equal(S.hasConflict(st, "month", "2026-08"), false);
});

test("touchSuccess sets both lastAttemptAt and lastSuccessAt; touchAttempt only the attempt", () => {
    const { S } = load();
    const st = S.createEmpty("user-a");
    S.touchAttempt(st);
    assert.ok(st.lastAttemptAt);
    assert.equal(st.lastSuccessAt, null);
    S.touchSuccess(st);
    assert.ok(st.lastSuccessAt);
    assert.equal(st.lastAttemptAt, st.lastSuccessAt);
});

test("summary is safe — counts + timestamps + bootstrap, never the owner id", () => {
    const { S } = load();
    const st = S.createEmpty("user-a-secret-id");
    S.setBaseline(st, "month", "2026-08", { revision: 1, baseHash: "h" });
    S.queuePending(st, "cash", "primary", "upsert");
    S.addConflict(st, { documentType: "settings", documentKey: "primary", reason: "both_changed" });
    const sum = S.summary(st);
    assert.deepEqual(Object.keys(sum).sort(),
        ["bootstrapStatus", "conflictCount", "documentCount", "lastAttemptAt", "lastSuccessAt", "pendingCount"]);
    assert.equal(sum.documentCount, 1);
    assert.equal(sum.pendingCount, 1);
    assert.equal(sum.conflictCount, 1);
    assert.ok(!JSON.stringify(sum).includes("user-a-secret-id"));
});

test("a storage write failure is reported, never thrown", () => {
    const { S } = load(null, { failWrites: true });
    const st = S.createEmpty("user-a");
    const res = S.persist(st);
    assert.equal(res.ok, false);
    assert.equal(res.code, "write_failed");
});

test("signout keeps the state file (owner-bound metadata is preserved)", () => {
    const { S, storage } = load();
    const st = S.createEmpty("user-a");
    S.setBaseline(st, "month", "2026-08", { revision: 2, baseHash: "h" });
    S.persist(st);
    /* nothing in this module deletes the key on sign-out; only an explicit clear() does */
    assert.ok(storage.getItem("mwallet.sync.state.v1"));
    S.clear();
    assert.equal(storage.getItem("mwallet.sync.state.v1"), null);
});

test("the module source contains no financial-field allowances", () => {
    const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    /* the whitelist arrays must not include payload-shaped keys */
    assert.ok(!/["'](payload|balance|transactions|bills|denominations|notes)["']/.test(stripped),
        "no financial key in the whitelist");
});
