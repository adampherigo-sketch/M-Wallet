"use strict";

/* =========================================================
   BP8 — SYNC RECONCILIATION PLANNER

   The pure planner is where conflict behaviour is proven.
   Loads js/sync/sync-planner.js in a node:vm sandbox (with
   the real codec, for the type/deletable lists) and drives
   every BASE x LOCAL x REMOTE combination through plan().
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function loadPlanner() {
    const sandbox = { window: {}, console };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-codec.js"), "utf8"), sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/sync/sync-planner.js"), "utf8"), sandbox);
    return sandbox.window.MWalletSyncPlanner;
}

const P = loadPlanner();

const L = (type, key, hash) => ({ documentType: type, documentKey: key, hash: hash });
const R = (type, key, revision, hash, extra) => Object.assign(
    { documentType: type, documentKey: key, revision: revision, hash: hash, deleted: false }, extra || {});
const B = (revision, baseHash, deleted) => ({ revision: revision, baseHash: baseHash || null, deleted: deleted === true });

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function plan(input) { return plain(P.plan(input)); }
function ids(list) { return plain(list).map((x) => x.documentType + "/" + x.documentKey); }


/* ---- 1-4  NO PRIOR BASE ------------------------------------------- */

test("1. local only, no base -> create", () => {
    const out = plan({ local: [L("accounts", "primary", "hA")], remote: [], base: {} });
    assert.deepEqual(ids(out.creates), ["accounts/primary"]);
    assert.equal(out.downloads.length + out.updates.length + out.conflicts.length, 0);
});

test("2. remote only, no base -> download", () => {
    const out = plan({ local: [], remote: [R("month", "2026-08", 3, "hR")], base: {} });
    assert.deepEqual(ids(out.downloads), ["month/2026-08"]);
    assert.equal(out.downloads[0].deleted, false);
});

test("3. both present, identical, no base -> baseline (no write)", () => {
    const out = plan({
        local: [L("settings", "primary", "same")],
        remote: [R("settings", "primary", 7, "same")], base: {}
    });
    assert.deepEqual(ids(out.baselineUpdates), ["settings/primary"]);
    assert.equal(out.baselineUpdates[0].revision, 7);
    assert.equal(out.creates.length + out.downloads.length + out.conflicts.length, 0);
});

test("4. both present, different, no base -> conflict (no timestamp guessing)", () => {
    const out = plan({
        local: [L("month", "2026-08", "hLocal")],
        remote: [R("month", "2026-08", 2, "hRemote")], base: {}
    });
    assert.deepEqual(ids(out.conflicts), ["month/2026-08"]);
    assert.equal(out.conflicts[0].reason, "both_changed_no_base");
    assert.equal(out.downloads.length + out.updates.length, 0);
});


/* ---- 5-9  STEADY STATE ------------------------------------------- */

test("5. neither changed -> no-op", () => {
    const out = plan({
        local: [L("cash", "primary", "h1")],
        remote: [R("cash", "primary", 4, "h1")],
        base: { "cash/primary": B(4, "h1") }
    });
    assert.deepEqual(out, { downloads: [], creates: [], updates: [], tombstones: [], baselineUpdates: [], conflicts: [], ignored: [] });
});

test("6. local only changed -> update with expectedRevision = base", () => {
    const out = plan({
        local: [L("accounts", "primary", "h2")],
        remote: [R("accounts", "primary", 4, "h1")],
        base: { "accounts/primary": B(4, "h1") }
    });
    assert.deepEqual(ids(out.updates), ["accounts/primary"]);
    assert.equal(out.updates[0].expectedRevision, 4);
});

test("7. remote only changed -> download", () => {
    const out = plan({
        local: [L("categories", "primary", "h1")],
        remote: [R("categories", "primary", 9, "h2")],
        base: { "categories/primary": B(4, "h1") }
    });
    assert.deepEqual(ids(out.downloads), ["categories/primary"]);
    assert.equal(out.downloads[0].deleted, false);
});

test("7b. remote changed to match local -> baseline only, no local write", () => {
    const out = plan({
        local: [L("categories", "primary", "converged")],
        remote: [R("categories", "primary", 9, "converged")],
        base: { "categories/primary": B(4, "old") }
    });
    assert.deepEqual(ids(out.baselineUpdates), ["categories/primary"]);
    assert.equal(out.downloads.length, 0);
});

test("8. both changed, same final payload -> baseline (re-baseline safely)", () => {
    const out = plan({
        local: [L("month", "2026-08", "final")],
        remote: [R("month", "2026-08", 6, "final")],
        base: { "month/2026-08": B(3, "old") }
    });
    assert.deepEqual(ids(out.baselineUpdates), ["month/2026-08"]);
    assert.equal(out.conflicts.length, 0);
});

test("9. both changed, different -> conflict", () => {
    const out = plan({
        local: [L("month", "2026-08", "localEdit")],
        remote: [R("month", "2026-08", 6, "remoteEdit")],
        base: { "month/2026-08": B(3, "old") }
    });
    assert.deepEqual(ids(out.conflicts), ["month/2026-08"]);
    assert.equal(out.conflicts[0].reason, "both_changed");
    assert.equal(out.conflicts[0].baseRevision, 3);
    assert.equal(out.conflicts[0].remoteRevision, 6);
});


/* ---- 10-13  DELETIONS ------------------------------------------- */

test("10. local deletion of a deletable doc -> tombstone with expectedRevision", () => {
    const out = plan({
        local: [],   /* the month is gone locally */
        remote: [R("month", "2026-08", 5, "h1")],
        base: { "month/2026-08": B(5, "h1") }
    });
    assert.deepEqual(ids(out.tombstones), ["month/2026-08"]);
    assert.equal(out.tombstones[0].expectedRevision, 5);
});

test("11. remote tombstone of a deletable doc, local unchanged -> download deleted:true", () => {
    const out = plan({
        local: [L("month", "2026-08", "h1")],
        remote: [R("month", "2026-08", 6, null, { deleted: true })],
        base: { "month/2026-08": B(5, "h1") }
    });
    assert.deepEqual(ids(out.downloads), ["month/2026-08"]);
    assert.equal(out.downloads[0].deleted, true);
});

test("12. local deletion + remote change of the same month -> conflict", () => {
    const out = plan({
        local: [],
        remote: [R("month", "2026-08", 7, "remoteEdit")],
        base: { "month/2026-08": B(5, "h1") }
    });
    assert.deepEqual(ids(out.conflicts), ["month/2026-08"]);
    assert.equal(out.conflicts[0].reason, "both_changed");
});

test("13. remote tombstone of a NON-deletable singleton -> conflict (attention), never erased", () => {
    const out = plan({
        local: [L("cash", "primary", "h1")],
        remote: [R("cash", "primary", 6, null, { deleted: true })],
        base: { "cash/primary": B(5, "h1") }
    });
    assert.deepEqual(ids(out.conflicts), ["cash/primary"]);
    assert.equal(out.conflicts[0].reason, "unsupported_remote_delete");
    assert.equal(out.downloads.length, 0);
});

test("13b. both sides deleted the month -> baseline deleted, no conflict", () => {
    const out = plan({
        local: [],
        remote: [R("month", "2026-08", 6, null, { deleted: true })],
        base: { "month/2026-08": B(5, "h1") }
    });
    assert.deepEqual(ids(out.baselineUpdates), ["month/2026-08"]);
    assert.equal(out.baselineUpdates[0].deleted, true);
    assert.equal(out.conflicts.length, 0);
});


/* ---- 14-15  UNKNOWN / UNSUPPORTED ------------------------------- */

test("14. unknown remote document type -> ignored (never applied, never deleted)", () => {
    const out = plan({
        local: [],
        remote: [R("future-widget", "primary", 1, "h")],
        base: {}
    });
    assert.deepEqual(ids(out.ignored), ["future-widget/primary"]);
    assert.equal(out.ignored[0].reason, "unknown_type");
    assert.equal(out.downloads.length + out.conflicts.length, 0);
});

test("15. newer remote schema_version -> ignored (never downgraded)", () => {
    const out = plan({
        local: [L("month", "2026-08", "h1")],
        remote: [R("month", "2026-08", 4, "h2", { schemaVersion: 99 })],
        base: { "month/2026-08": B(3, "h1") }
    });
    assert.deepEqual(ids(out.ignored), ["month/2026-08"]);
    assert.equal(out.ignored[0].reason, "unsupported_schema");
    assert.equal(out.downloads.length, 0);
});

test("15b. an invalid remote document -> ignored", () => {
    const out = plan({
        local: [],
        remote: [R("month", "2026-08", 2, "h", { invalid: true })],
        base: {}
    });
    assert.equal(out.ignored[0].reason, "invalid_remote_document");
});


/* ---- 16-19  STRUCTURE ------------------------------------------- */

test("16. the planner never mutates its inputs", () => {
    const local = [L("accounts", "primary", "h2")];
    const remote = [R("accounts", "primary", 4, "h1")];
    const base = { "accounts/primary": B(4, "h1") };
    const localCopy = JSON.parse(JSON.stringify(local));
    const remoteCopy = JSON.parse(JSON.stringify(remote));
    const baseCopy = JSON.parse(JSON.stringify(base));
    plan({ local, remote, base });
    assert.deepEqual(local, localCopy);
    assert.deepEqual(remote, remoteCopy);
    assert.deepEqual(base, baseCopy);
});

test("17. different months do NOT conflict with each other", () => {
    const out = plan({
        local: [L("month", "2026-08", "augLocal"), L("month", "2026-09", "sepBase")],
        remote: [R("month", "2026-08", 2, "augBase"), R("month", "2026-09", 5, "sepRemote")],
        base: {
            "month/2026-08": B(2, "augBase"),
            "month/2026-09": B(3, "sepBase")
        }
    });
    /* August: local changed -> update. September: remote changed -> download. No conflicts. */
    assert.deepEqual(ids(out.updates), ["month/2026-08"]);
    assert.deepEqual(ids(out.downloads), ["month/2026-09"]);
    assert.equal(out.conflicts.length, 0);
});

test("18. a settings change and a month change reconcile independently", () => {
    const out = plan({
        local: [L("settings", "primary", "sNew"), L("month", "2026-08", "mSame")],
        remote: [R("settings", "primary", 4, "sOld"), R("month", "2026-08", 9, "mSame")],
        base: { "settings/primary": B(4, "sOld"), "month/2026-08": B(4, "mSame") }
    });
    assert.deepEqual(ids(out.updates), ["settings/primary"]);
    /* month: local unchanged, remote revision moved but hash identical -> baseline */
    assert.deepEqual(ids(out.baselineUpdates), ["month/2026-08"]);
});

test("19. a cash change is independent from a month change", () => {
    const out = plan({
        local: [L("cash", "primary", "cNew"), L("month", "2026-08", "mBase")],
        remote: [R("cash", "primary", 2, "cOld"), R("month", "2026-08", 8, "mRemote")],
        base: { "cash/primary": B(2, "cOld"), "month/2026-08": B(4, "mBase") }
    });
    assert.deepEqual(ids(out.updates), ["cash/primary"]);
    assert.deepEqual(ids(out.downloads), ["month/2026-08"]);
    assert.equal(out.conflicts.length, 0);
});

test("a base row hard-removed from the cloud behaves like a remote tombstone", () => {
    const out = plan({
        local: [L("month", "2026-08", "h1")],
        remote: [],   /* row gone entirely */
        base: { "month/2026-08": B(5, "h1") }
    });
    assert.deepEqual(ids(out.downloads), ["month/2026-08"]);
    assert.equal(out.downloads[0].deleted, true);
});

test("output is deterministic for a given input (stable ordering)", () => {
    const input = {
        local: [L("month", "2026-09", "a"), L("month", "2026-08", "b"), L("accounts", "primary", "c")],
        remote: [],
        base: {}
    };
    const a = JSON.stringify(P.plan(input));
    const b = JSON.stringify(P.plan(input));
    assert.equal(a, b);
    assert.deepEqual(ids(P.plan(input).creates), ["accounts/primary", "month/2026-08", "month/2026-09"]);
});
