"use strict";

/* =========================================================
   M-WALLET — CLOUD FINANCIAL STORE   (BP7)

       window.MWalletCloudFinancial

   The ONLY runtime module allowed to query the Supabase
   `wallet_documents` table. Every cloud financial read/write
   goes through here — nothing else in the app calls
   `.from("wallet_documents")`.

   BP7 builds the CAPABILITY, not synchronization:
     - initialize() makes ZERO network calls
     - normal app boot / navigation / rendering / BP5 Finish /
       BP6 tour never call any method here
     - the only live cloud traffic in BP7 is a user-triggered
       checkAvailability(), deliberate manual verification, and
       the standalone scripts/bp7-live-rls-check.mjs utility

   Security:
     - reuses the EXISTING authenticated Supabase client via
       MWalletAuth._getClient() — no second client, no token
       copying, no new session key
     - callers NEVER supply a user_id / ownerUserId; the DB
       column defaults to auth.uid() and RLS enforces isolation
     - raw Supabase / PostgREST errors are mapped to safe codes;
       payloads, tokens, and owner UUIDs are never logged or
       returned in diagnostics
   ========================================================= */

(function (global) {

    var TABLE = "wallet_documents";

    /* columns the app needs — deliberately NOT user_id (RLS already
       guarantees every returned row belongs to the caller) */
    var SELECT_COLUMNS =
        "id, document_type, document_key, schema_version, payload, revision, client_updated_at, created_at, updated_at, deleted_at";

    var STATUS = {
        UNCONFIGURED: "unconfigured",   /* no Supabase project configured -> local-only */
        SIGNED_OUT: "signed_out",       /* configured but not signed in */
        READY: "ready",                 /* configured + signed in -> cloud calls are possible */
        UNAVAILABLE: "unavailable"      /* client missing unexpectedly */
    };

    /* safe error codes only — never a raw error, header, token, SQL,
       connection string, or financial payload */
    var ERROR_CODES = [
        "unconfigured", "signed_out", "client_unavailable", "schema_missing",
        "network_error", "forbidden", "invalid_document", "document_too_large",
        "not_found", "revision_conflict", "write_failed", "read_failed"
    ];

    var lastCheck = null;   /* { ok, code, at } — safe summary of the last checkAvailability() */
    var lastError = null;   /* { code } — safe summary of the last failed operation */
    var initialized = false;


    /* =====================================================
       AUTH / CLIENT  (reuse only — never create a 2nd client)
       ===================================================== */

    function auth() {
        try { return global.MWalletAuth || null; } catch (e) { return null; }
    }

    function authState() {
        var a = auth();
        try { return (a && typeof a.getState === "function") ? a.getState() : null; }
        catch (e) { return null; }
    }

    function isConfigured() {
        var s = authState();
        return !!s && s.configured === true;
    }

    function isSignedIn() {
        var a = auth();
        try { return !!a && typeof a.isAuthenticated === "function" && a.isAuthenticated() === true; }
        catch (e) { return false; }
    }

    /* the EXISTING authenticated Supabase client (or null in local-only
       mode). BP2 exposes MWalletAuth._getClient() exactly for this. */
    function getClient() {
        var a = auth();
        try {
            if (a && typeof a._getClient === "function") { return a._getClient() || null; }
        } catch (e) { /* ignore */ }
        return null;
    }

    /* precondition for any cloud call. Returns a safe code string on
       failure, or null when a call may proceed. */
    function guard() {
        if (!isConfigured()) { return "unconfigured"; }
        if (!isSignedIn()) { return "signed_out"; }
        if (!getClient()) { return "client_unavailable"; }
        return null;
    }


    /* =====================================================
       ERROR MAPPING  (raw Supabase/PostgREST -> safe code)
       ===================================================== */

    function mapError(err) {
        if (!err) { return "write_failed"; }
        var code = typeof err.code === "string" ? err.code : "";
        var status = Number(err.status || err.statusCode);
        var msg = (typeof err.message === "string" ? err.message : "").toLowerCase();

        if (status === 401 || code === "PGRST301" || msg.indexOf("jwt") !== -1) { return "signed_out"; }
        if (status === 403 || code === "42501" || msg.indexOf("row-level security") !== -1 || msg.indexOf("permission denied") !== -1) {
            return "forbidden";
        }
        if (code === "42P01" || msg.indexOf("does not exist") !== -1 || msg.indexOf("could not find the table") !== -1 || status === 404) {
            /* 404 from PostgREST for a missing table vs a missing row —
               a missing row is handled by maybeSingle() returning null,
               so a 404 here means the relation/route is missing */
            return "schema_missing";
        }
        if (code === "23514" || msg.indexOf("violates check constraint") !== -1) { return "invalid_document"; }
        if (code === "23505" || msg.indexOf("duplicate key") !== -1) { return "write_failed"; }
        if (msg.indexOf("failed to fetch") !== -1 || msg.indexOf("networkerror") !== -1 || err.name === "TypeError") {
            return "network_error";
        }
        return "write_failed";
    }

    function fail(code) {
        var safe = ERROR_CODES.indexOf(code) !== -1 ? code : "write_failed";
        lastError = { code: safe };
        return { ok: false, code: safe };
    }


    /* =====================================================
       SANITIZE  (DB row -> safe app document; drops user_id)
       ===================================================== */

    function sanitizeRow(row) {
        if (!row || typeof row !== "object") { return null; }
        return {
            id: row.id,
            documentType: row.document_type,
            documentKey: row.document_key,
            schemaVersion: row.schema_version,
            payload: row.payload,
            revision: typeof row.revision === "number" ? row.revision : Number(row.revision),
            clientUpdatedAt: row.client_updated_at || null,
            createdAt: row.created_at || null,
            updatedAt: row.updated_at || null,
            deletedAt: row.deleted_at || null
        };
    }

    function codec() {
        try { return global.MWalletCloudFinancialCodec || null; } catch (e) { return null; }
    }

    /* validate an outbound document (before any network write) */
    function validateOutbound(doc) {
        var c = codec();
        if (c && typeof c.validateDocument === "function") {
            return c.validateDocument({
                documentType: doc && doc.documentType,
                documentKey: doc && doc.documentKey,
                schemaVersion: doc && doc.schemaVersion,
                payload: doc && doc.payload
            });
        }
        /* minimal fallback if the codec isn't present */
        if (!doc || typeof doc !== "object") { return { ok: false, code: "invalid_document" }; }
        if (typeof doc.documentType !== "string" || typeof doc.documentKey !== "string") { return { ok: false, code: "invalid_document" }; }
        if (typeof doc.schemaVersion !== "number" || doc.schemaVersion <= 0) { return { ok: false, code: "invalid_document" }; }
        if (!doc.payload || typeof doc.payload !== "object" || Array.isArray(doc.payload)) { return { ok: false, code: "invalid_document" }; }
        return { ok: true };
    }


    /* =====================================================
       PUBLIC API
       ===================================================== */

    function initialize() {
        /* NO network. Just marks the module live. */
        initialized = true;
        return Promise.resolve(getState());
    }

    function getState() {
        var status;
        if (!isConfigured()) { status = STATUS.UNCONFIGURED; }
        else if (!isSignedIn()) { status = STATUS.SIGNED_OUT; }
        else if (!getClient()) { status = STATUS.UNAVAILABLE; }
        else { status = STATUS.READY; }
        return {
            status: status,
            table: TABLE,
            initialized: initialized,
            syncEnabled: false,                 /* BP7 never enables sync */
            lastError: lastError ? { code: lastError.code } : null
        };
    }

    /* Non-sensitive only. No owner id, no payload, no token, no raw error. */
    function diagnostics() {
        return {
            table: TABLE,
            initialized: initialized,
            status: getState().status,
            configured: isConfigured(),
            signedIn: isSignedIn(),
            hasClient: !!getClient(),
            syncEnabled: false,
            lastCheck: lastCheck ? { ok: lastCheck.ok, code: lastCheck.code, at: lastCheck.at } : null,
            lastError: lastError ? { code: lastError.code } : null,
            documentTypes: (codec() && codec().ALL_TYPES) || null
        };
    }

    /* User-triggered readiness probe. Minimal SELECT id LIMIT 1 through
       the authenticated client. Uploads nothing, alters nothing. */
    function checkAvailability() {
        var g = guard();
        if (g) {
            lastCheck = { ok: false, code: g, at: new Date().toISOString() };
            return Promise.resolve({ ok: false, code: g, schemaInstalled: null });
        }
        var client = getClient();
        return Promise.resolve()
            .then(function () {
                return client.from(TABLE).select("id").limit(1);
            })
            .then(function (res) {
                if (res && res.error) {
                    var code = mapError(res.error);
                    lastCheck = { ok: false, code: code, at: new Date().toISOString() };
                    return { ok: false, code: code, schemaInstalled: code !== "schema_missing" ? null : false };
                }
                lastCheck = { ok: true, code: null, at: new Date().toISOString() };
                return { ok: true, code: null, schemaInstalled: true };
            })
            .catch(function (e) {
                var code = mapError(e);
                lastCheck = { ok: false, code: code, at: new Date().toISOString() };
                return { ok: false, code: code, schemaInstalled: null };
            });
    }

    /* options: { documentType?, includeTombstoned?, updatedAfter? } */
    function listDocuments(options) {
        options = options || {};
        var g = guard();
        if (g) { return Promise.resolve(fail(g)); }
        var client = getClient();
        return Promise.resolve()
            .then(function () {
                var q = client.from(TABLE).select(SELECT_COLUMNS);
                if (typeof options.documentType === "string" && options.documentType) {
                    q = q.eq("document_type", options.documentType);
                }
                if (options.includeTombstoned !== true) {
                    q = q.is("deleted_at", null);
                }
                if (typeof options.updatedAfter === "string" && options.updatedAfter) {
                    q = q.gt("updated_at", options.updatedAfter);
                }
                /* NOTE: no .eq("user_id", ...) — RLS is the isolation boundary */
                return q.order("updated_at", { ascending: true });
            })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                var rows = Array.isArray(res && res.data) ? res.data : [];
                return { ok: true, documents: rows.map(sanitizeRow).filter(Boolean) };
            })
            .catch(function (e) { return fail(mapError(e)); });
    }

    function getDocument(documentType, documentKey) {
        var g = guard();
        if (g) { return Promise.resolve(fail(g)); }
        var client = getClient();
        return Promise.resolve()
            .then(function () {
                return client.from(TABLE)
                    .select(SELECT_COLUMNS)
                    .eq("document_type", documentType)
                    .eq("document_key", documentKey)
                    .maybeSingle();
            })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                if (!res || !res.data) { lastError = { code: "not_found" }; return { ok: false, code: "not_found" }; }
                return { ok: true, document: sanitizeRow(res.data) };
            })
            .catch(function (e) { return fail(mapError(e)); });
    }

    /* doc: { documentType, documentKey, schemaVersion, payload, clientUpdatedAt? }
       user_id / ownerUserId are NEVER accepted or forwarded. */
    function createDocument(doc) {
        var g = guard();
        if (g) { return Promise.resolve(fail(g)); }
        var v = validateOutbound(doc);
        if (!v.ok) { return Promise.resolve(fail(v.code || "invalid_document")); }

        var client = getClient();
        var row = {
            document_type: doc.documentType,
            document_key: doc.documentKey,
            schema_version: doc.schemaVersion,
            payload: doc.payload,
            client_updated_at: typeof doc.clientUpdatedAt === "string" ? doc.clientUpdatedAt : new Date().toISOString()
            /* user_id intentionally omitted -> DB DEFAULT auth.uid() */
        };
        return Promise.resolve()
            .then(function () {
                return client.from(TABLE).insert(row).select(SELECT_COLUMNS).single();
            })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                return { ok: true, document: sanitizeRow(res && res.data) };
            })
            .catch(function (e) { return fail(mapError(e)); });
    }

    /* Optimistic concurrency: the update only touches the row when its
       stored revision still equals expectedRevision. The DB trigger
       increments the revision. */
    function updateDocument(doc, expectedRevision) {
        var g = guard();
        if (g) { return Promise.resolve(fail(g)); }
        var v = validateOutbound(doc);
        if (!v.ok) { return Promise.resolve(fail(v.code || "invalid_document")); }
        var rev = Number(expectedRevision);
        if (!Number.isInteger(rev) || rev <= 0) { return Promise.resolve(fail("invalid_document")); }

        var client = getClient();
        var patch = {
            payload: doc.payload,
            schema_version: doc.schemaVersion,
            client_updated_at: typeof doc.clientUpdatedAt === "string" ? doc.clientUpdatedAt : new Date().toISOString()
        };
        return Promise.resolve()
            .then(function () {
                return client.from(TABLE)
                    .update(patch)
                    .eq("document_type", doc.documentType)
                    .eq("document_key", doc.documentKey)
                    .eq("revision", rev)
                    .select(SELECT_COLUMNS);
            })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                var rows = Array.isArray(res && res.data) ? res.data : [];
                if (rows.length === 1) { return { ok: true, document: sanitizeRow(rows[0]) }; }
                /* 0 rows -> either the revision moved on, or the row is gone */
                return resolveConflict(doc.documentType, doc.documentKey);
            })
            .catch(function (e) { return fail(mapError(e)); });
    }

    function resolveConflict(documentType, documentKey) {
        var client = getClient();
        return Promise.resolve()
            .then(function () {
                return client.from(TABLE)
                    .select("id, revision")
                    .eq("document_type", documentType)
                    .eq("document_key", documentKey)
                    .maybeSingle();
            })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                if (res && res.data) {
                    lastError = { code: "revision_conflict" };
                    return { ok: false, code: "revision_conflict", currentRevision: Number(res.data.revision) };
                }
                lastError = { code: "not_found" };
                return { ok: false, code: "not_found" };
            })
            .catch(function (e) { return fail(mapError(e)); });
    }

    /* Soft delete for future multi-device sync. Sets deleted_at; the
       trigger bumps the revision. */
    function tombstoneDocument(documentType, documentKey, expectedRevision) {
        var g = guard();
        if (g) { return Promise.resolve(fail(g)); }
        var rev = Number(expectedRevision);
        if (!Number.isInteger(rev) || rev <= 0) { return Promise.resolve(fail("invalid_document")); }

        var client = getClient();
        return Promise.resolve()
            .then(function () {
                return client.from(TABLE)
                    .update({ deleted_at: new Date().toISOString() })
                    .eq("document_type", documentType)
                    .eq("document_key", documentKey)
                    .eq("revision", rev)
                    .select(SELECT_COLUMNS);
            })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                var rows = Array.isArray(res && res.data) ? res.data : [];
                if (rows.length === 1) { return { ok: true, document: sanitizeRow(rows[0]) }; }
                return resolveConflict(documentType, documentKey);
            })
            .catch(function (e) { return fail(mapError(e)); });
    }

    /* Explicit un-delete (deleted_at = null). Same concurrency contract. */
    function restoreDocument(documentType, documentKey, expectedRevision) {
        var g = guard();
        if (g) { return Promise.resolve(fail(g)); }
        var rev = Number(expectedRevision);
        if (!Number.isInteger(rev) || rev <= 0) { return Promise.resolve(fail("invalid_document")); }

        var client = getClient();
        return Promise.resolve()
            .then(function () {
                return client.from(TABLE)
                    .update({ deleted_at: null })
                    .eq("document_type", documentType)
                    .eq("document_key", documentKey)
                    .eq("revision", rev)
                    .select(SELECT_COLUMNS);
            })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                var rows = Array.isArray(res && res.data) ? res.data : [];
                if (rows.length === 1) { return { ok: true, document: sanitizeRow(rows[0]) }; }
                return resolveConflict(documentType, documentKey);
            })
            .catch(function (e) { return fail(mapError(e)); });
    }


    var api = {
        STATUS: STATUS,
        ERROR_CODES: ERROR_CODES.slice(),
        TABLE: TABLE,

        initialize: initialize,
        getState: getState,
        diagnostics: diagnostics,
        checkAvailability: checkAvailability,

        listDocuments: listDocuments,
        getDocument: getDocument,
        createDocument: createDocument,
        updateDocument: updateDocument,
        tombstoneDocument: tombstoneDocument,
        restoreDocument: restoreDocument
        /* NOTE: no hardDelete, no setUserId, no overrideOwner, no
           serviceRole, no adminQuery — by design. */
    };

    global.MWalletCloudFinancial = api;

    /* Boot marker only. initialize() does NOT touch the network, and
       nothing here subscribes to auth to auto-fetch. */
    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { initialize(); });
        } else {
            initialize();
        }
    }

})(typeof window !== "undefined" ? window : this);
