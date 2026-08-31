"use strict";

/* =========================================================
   M-WALLET — LOCAL SYNC STATE   (BP8)

       window.MWalletSyncState

   Owner-bound synchronization METADATA, stored separately
   from mWalletData under:

       mwallet.sync.state.v1

   ABSOLUTE RULE — this state never stores financial payloads:
   no balances, transactions, bills, expenses, notes, category
   contents, M-Cash contents, or cloud JSON copies. It stores
   only document IDENTITIES, content HASHES, cloud REVISIONS,
   timestamps, safe error codes, and pending/conflict identities.

   Every write is whitelist-validated before it is persisted —
   an unexpected key or a non-primitive value is rejected, so a
   bug elsewhere cannot leak financial data into this key.

   The state is bound to the authenticated Supabase user id.
   State written by user A is ignored (never applied, never
   uploaded) when user B is signed in.
   ========================================================= */

(function (global) {

    var KEY = "mwallet.sync.state.v1";
    var SCHEMA_VERSION = 1;

    var BOOTSTRAP_STATES = ["unknown", "complete", "deferred"];
    var OPERATIONS = ["upsert", "delete"];
    var CONFLICT_REASONS = [
        "both_changed", "both_changed_no_base", "revision_conflict",
        "unsupported_remote_delete", "invalid_remote_document",
        "unsupported_schema", "local_storage_error",
        "local_changed_during_sync"
    ];

    /* ---- storage ---- */

    function store() {
        try { return global.localStorage || null; } catch (e) { return null; }
    }

    function nowIso() {
        try { return new Date().toISOString(); } catch (e) { return "1970-01-01T00:00:00.000Z"; }
    }

    function docId(type, key) { return String(type) + "/" + String(key); }

    /* ---- shape ---- */

    function createEmpty(ownerUserId) {
        return {
            schemaVersion: SCHEMA_VERSION,
            ownerUserId: (typeof ownerUserId === "string" && ownerUserId) ? ownerUserId : null,
            documents: {},
            pending: [],
            conflicts: [],
            lastAttemptAt: null,
            lastSuccessAt: null,
            bootstrapStatus: "unknown"
        };
    }

    function isPrimitive(v) {
        return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
    }

    /* Whitelist validation. Returns { ok, issues:[] }. Anything
       not in the known shape — or any non-primitive leaf — fails,
       which is exactly how a financial payload would be caught. */
    function validateShape(state) {
        var issues = [];
        function bad(msg) { issues.push(msg); }

        if (!state || typeof state !== "object" || Array.isArray(state)) {
            return { ok: false, issues: ["not an object"] };
        }
        var topKeys = ["schemaVersion", "ownerUserId", "documents", "pending", "conflicts",
            "lastAttemptAt", "lastSuccessAt", "bootstrapStatus"];
        Object.keys(state).forEach(function (k) {
            if (topKeys.indexOf(k) === -1) { bad("unexpected top-level key: " + k); }
        });

        if (state.schemaVersion !== SCHEMA_VERSION) { bad("schemaVersion"); }
        if (state.ownerUserId !== null && typeof state.ownerUserId !== "string") { bad("ownerUserId"); }
        if (state.lastAttemptAt !== null && typeof state.lastAttemptAt !== "string") { bad("lastAttemptAt"); }
        if (state.lastSuccessAt !== null && typeof state.lastSuccessAt !== "string") { bad("lastSuccessAt"); }
        if (BOOTSTRAP_STATES.indexOf(state.bootstrapStatus) === -1) { bad("bootstrapStatus"); }

        var docs = state.documents;
        if (!docs || typeof docs !== "object" || Array.isArray(docs)) { bad("documents"); }
        else {
            Object.keys(docs).forEach(function (id) {
                var d = docs[id];
                if (!d || typeof d !== "object" || Array.isArray(d)) { bad("document entry " + id); return; }
                var allowed = ["revision", "baseHash", "deleted", "lastSyncedAt"];
                Object.keys(d).forEach(function (k) {
                    if (allowed.indexOf(k) === -1) { bad("document " + id + " unexpected key: " + k); }
                    if (!isPrimitive(d[k])) { bad("document " + id + " non-primitive: " + k); }
                });
                if (typeof d.revision !== "number") { bad("document " + id + " revision"); }
                if (d.baseHash !== null && typeof d.baseHash !== "string") { bad("document " + id + " baseHash"); }
                if (typeof d.deleted !== "boolean") { bad("document " + id + " deleted"); }
            });
        }

        ["pending", "conflicts"].forEach(function (listName) {
            var list = state[listName];
            if (!Array.isArray(list)) { bad(listName + " not an array"); return; }
            list.forEach(function (entry, i) {
                if (!entry || typeof entry !== "object" || Array.isArray(entry)) { bad(listName + "[" + i + "]"); return; }
                var allowed = listName === "pending"
                    ? ["documentType", "documentKey", "operation", "queuedAt", "attempts", "lastError"]
                    : ["documentType", "documentKey", "baseRevision", "remoteRevision", "reason", "detectedAt"];
                Object.keys(entry).forEach(function (k) {
                    if (allowed.indexOf(k) === -1) { bad(listName + "[" + i + "] unexpected key: " + k); }
                    if (!isPrimitive(entry[k])) { bad(listName + "[" + i + "] non-primitive: " + k); }
                });
                if (typeof entry.documentType !== "string" || typeof entry.documentKey !== "string") {
                    bad(listName + "[" + i + "] identity");
                }
            });
        });

        return { ok: issues.length === 0, issues: issues };
    }

    function assertNoFinancialData(state) {
        return validateShape(state);
    }

    /* ---- load / persist ---- */

    function readRaw() {
        var s = store();
        if (!s) { return { available: false, raw: null }; }
        try { return { available: true, raw: s.getItem(KEY) }; }
        catch (e) { return { available: true, raw: null, error: true }; }
    }

    /* Returns { state, reason }. reason ∈
       "fresh" | "loaded" | "foreign_owner" | "malformed" | "no_storage" | "schema_mismatch" */
    function load(ownerUserId) {
        var owner = (typeof ownerUserId === "string" && ownerUserId) ? ownerUserId : null;
        var r = readRaw();
        if (!r.available) { return { state: createEmpty(owner), reason: "no_storage" }; }
        if (r.error) { return { state: createEmpty(owner), reason: "malformed" }; }
        if (r.raw == null) { return { state: createEmpty(owner), reason: "fresh" }; }

        var parsed;
        try { parsed = JSON.parse(r.raw); }
        catch (e) { return { state: createEmpty(owner), reason: "malformed" }; }

        var shape = validateShape(parsed);
        if (!shape.ok) { return { state: createEmpty(owner), reason: "malformed" }; }
        if (parsed.schemaVersion !== SCHEMA_VERSION) {
            return { state: createEmpty(owner), reason: "schema_mismatch" };
        }
        if (owner && parsed.ownerUserId && parsed.ownerUserId !== owner) {
            /* belongs to a different account — never expose or apply it */
            return { state: createEmpty(owner), reason: "foreign_owner" };
        }
        if (owner && !parsed.ownerUserId) { parsed.ownerUserId = owner; }
        return { state: parsed, reason: "loaded" };
    }

    /* Persist. Refuses to write anything that fails whitelist
       validation. Returns { ok, code? }. */
    function persist(state) {
        var s = store();
        if (!s) { return { ok: false, code: "no_storage" }; }
        var shape = validateShape(state);
        if (!shape.ok) { return { ok: false, code: "invalid_state" }; }
        try {
            s.setItem(KEY, JSON.stringify(state));
            return { ok: true };
        } catch (e) {
            return { ok: false, code: "write_failed" };
        }
    }

    function clear() {
        var s = store();
        if (!s) { return { ok: false, code: "no_storage" }; }
        try { s.removeItem(KEY); return { ok: true }; }
        catch (e) { return { ok: false, code: "write_failed" }; }
    }

    /* ---- baseline (per document) ---- */

    function getBaseline(state, type, key) {
        var id = docId(type, key);
        return (state && state.documents && state.documents[id]) || null;
    }

    function setBaseline(state, type, key, info) {
        var id = docId(type, key);
        info = info || {};
        state.documents[id] = {
            revision: typeof info.revision === "number" ? info.revision : 0,
            baseHash: typeof info.baseHash === "string" ? info.baseHash : null,
            deleted: info.deleted === true,
            lastSyncedAt: typeof info.lastSyncedAt === "string" ? info.lastSyncedAt : nowIso()
        };
        return state;
    }

    function dropBaseline(state, type, key) {
        delete state.documents[docId(type, key)];
        return state;
    }

    /* ---- pending queue (identity + durability signal, not truth) ---- */

    function queuePending(state, type, key, operation) {
        var op = OPERATIONS.indexOf(operation) !== -1 ? operation : "upsert";
        var existing = null;
        for (var i = 0; i < state.pending.length; i++) {
            if (state.pending[i].documentType === type && state.pending[i].documentKey === key) {
                existing = state.pending[i];
                break;
            }
        }
        if (existing) {
            existing.operation = op;            /* latest intent wins; keep attempts */
            return state;
        }
        state.pending.push({
            documentType: String(type),
            documentKey: String(key),
            operation: op,
            queuedAt: nowIso(),
            attempts: 0,
            lastError: null
        });
        return state;
    }

    function dropPending(state, type, key) {
        state.pending = state.pending.filter(function (p) {
            return !(p.documentType === type && p.documentKey === key);
        });
        return state;
    }

    function bumpPendingAttempt(state, type, key, safeErrorCode) {
        for (var i = 0; i < state.pending.length; i++) {
            var p = state.pending[i];
            if (p.documentType === type && p.documentKey === key) {
                p.attempts = (typeof p.attempts === "number" ? p.attempts : 0) + 1;
                p.lastError = typeof safeErrorCode === "string" ? safeErrorCode : null;
            }
        }
        return state;
    }

    function hasPending(state, type, key) {
        return state.pending.some(function (p) {
            return p.documentType === type && p.documentKey === key;
        });
    }

    /* ---- conflicts (identity + revisions only, no payload) ---- */

    function addConflict(state, conflict) {
        conflict = conflict || {};
        var type = String(conflict.documentType);
        var key = String(conflict.documentKey);
        var reason = CONFLICT_REASONS.indexOf(conflict.reason) !== -1 ? conflict.reason : "both_changed";
        var entry = {
            documentType: type,
            documentKey: key,
            baseRevision: typeof conflict.baseRevision === "number" ? conflict.baseRevision : 0,
            remoteRevision: typeof conflict.remoteRevision === "number" ? conflict.remoteRevision : 0,
            reason: reason,
            detectedAt: nowIso()
        };
        for (var i = 0; i < state.conflicts.length; i++) {
            if (state.conflicts[i].documentType === type && state.conflicts[i].documentKey === key) {
                entry.detectedAt = state.conflicts[i].detectedAt || entry.detectedAt;
                state.conflicts[i] = entry;
                return state;
            }
        }
        state.conflicts.push(entry);
        return state;
    }

    function dropConflict(state, type, key) {
        state.conflicts = state.conflicts.filter(function (c) {
            return !(c.documentType === type && c.documentKey === key);
        });
        return state;
    }

    function hasConflict(state, type, key) {
        return state.conflicts.some(function (c) {
            return c.documentType === type && c.documentKey === key;
        });
    }

    function getConflicts(state) {
        return (state && Array.isArray(state.conflicts)) ? state.conflicts.slice() : [];
    }

    /* ---- misc ---- */

    function setBootstrapStatus(state, status) {
        state.bootstrapStatus = BOOTSTRAP_STATES.indexOf(status) !== -1 ? status : "unknown";
        return state;
    }

    function touchAttempt(state) { state.lastAttemptAt = nowIso(); return state; }
    function touchSuccess(state) {
        var at = nowIso();
        state.lastAttemptAt = at;
        state.lastSuccessAt = at;
        return state;
    }

    /* Safe, non-sensitive summary — never the owner id, never a hash's
       document, never a payload. */
    function summary(state) {
        if (!state || typeof state !== "object") {
            return { documentCount: 0, pendingCount: 0, conflictCount: 0, lastAttemptAt: null, lastSuccessAt: null, bootstrapStatus: "unknown" };
        }
        return {
            documentCount: state.documents ? Object.keys(state.documents).length : 0,
            pendingCount: Array.isArray(state.pending) ? state.pending.length : 0,
            conflictCount: Array.isArray(state.conflicts) ? state.conflicts.length : 0,
            lastAttemptAt: state.lastAttemptAt || null,
            lastSuccessAt: state.lastSuccessAt || null,
            bootstrapStatus: state.bootstrapStatus || "unknown"
        };
    }

    global.MWalletSyncState = {
        KEY: KEY,
        SCHEMA_VERSION: SCHEMA_VERSION,
        BOOTSTRAP_STATES: BOOTSTRAP_STATES.slice(),
        CONFLICT_REASONS: CONFLICT_REASONS.slice(),

        docId: docId,
        createEmpty: createEmpty,
        validateShape: validateShape,
        assertNoFinancialData: assertNoFinancialData,

        load: load,
        persist: persist,
        clear: clear,

        getBaseline: getBaseline,
        setBaseline: setBaseline,
        dropBaseline: dropBaseline,

        queuePending: queuePending,
        dropPending: dropPending,
        bumpPendingAttempt: bumpPendingAttempt,
        hasPending: hasPending,

        addConflict: addConflict,
        dropConflict: dropConflict,
        hasConflict: hasConflict,
        getConflicts: getConflicts,

        setBootstrapStatus: setBootstrapStatus,
        touchAttempt: touchAttempt,
        touchSuccess: touchSuccess,
        summary: summary
    };

})(typeof window !== "undefined" ? window : this);
