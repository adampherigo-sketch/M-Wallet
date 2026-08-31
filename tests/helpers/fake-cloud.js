"use strict";

/* =========================================================
   BP8 test helper — a deterministic in-memory stand-in for
   MWalletCloudFinancial backed by a shared "wallet_documents"
   table with:
     - UNIQUE(document_type, document_key) per owner
     - database-controlled revision (starts at 1, +1 per write)
     - deleted_at tombstones
     - expectedRevision optimistic concurrency

   One FakeCloud instance = one authenticated owner's view.
   Two devices for the SAME user share ONE table (pass the same
   `table` Map), so create races / revision conflicts / remote
   changes all behave like the real thing.
   ========================================================= */

function makeTable() { return new Map(); }

let clock = 0;
function nextIso() {
    clock += 1000;
    return new Date(1756000000000 + clock).toISOString();
}

function id(type, key) { return type + "/" + key; }

function sanitize(row) {
    if (!row) { return null; }
    return {
        id: row.id,
        documentType: row.documentType,
        documentKey: row.documentKey,
        schemaVersion: row.schemaVersion,
        payload: JSON.parse(JSON.stringify(row.payload)),
        revision: row.revision,
        clientUpdatedAt: row.clientUpdatedAt || null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        deletedAt: row.deletedAt || null
    };
}

class FakeCloud {
    constructor(options) {
        options = options || {};
        this.table = options.table || makeTable();
        this.status = options.status || "ready";
        this.calls = [];
        this.failNext = null;          /* { op, code, times } */
        this.forceOffline = false;
        this._seq = 0;
    }

    _record(op) { this.calls.push(op); }

    _maybeFail(op) {
        if (this.forceOffline) { return { ok: false, code: "network_error" }; }
        if (this.failNext && (this.failNext.op === op || this.failNext.op === "*")) {
            const code = this.failNext.code;
            this.failNext.times = (this.failNext.times || 1) - 1;
            if (this.failNext.times <= 0) { this.failNext = null; }
            return { ok: false, code: code };
        }
        return null;
    }

    setFailNext(op, code, times) { this.failNext = { op, code, times: times || 1 }; }

    getState() { return { status: this.status, table: "wallet_documents", syncEnabled: false }; }
    diagnostics() { return { status: this.status }; }
    checkAvailability() { return Promise.resolve({ ok: this.status === "ready", code: this.status === "ready" ? null : "schema_missing" }); }

    listDocuments(opts) {
        opts = opts || {};
        this._record({ op: "list", includeTombstoned: !!opts.includeTombstoned });
        const f = this._maybeFail("list"); if (f) { return Promise.resolve(f); }
        if (this.status === "schema_missing") { return Promise.resolve({ ok: false, code: "schema_missing" }); }
        const out = [];
        this.table.forEach((row) => {
            if (opts.documentType && row.documentType !== opts.documentType) { return; }
            if (!opts.includeTombstoned && row.deletedAt) { return; }
            out.push(sanitize(row));
        });
        out.sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
        return Promise.resolve({ ok: true, documents: out });
    }

    getDocument(type, key) {
        this._record({ op: "get", type, key });
        const f = this._maybeFail("get"); if (f) { return Promise.resolve(f); }
        const row = this.table.get(id(type, key));
        if (!row) { return Promise.resolve({ ok: false, code: "not_found" }); }
        return Promise.resolve({ ok: true, document: sanitize(row) });
    }

    createDocument(doc) {
        this._record({ op: "create", type: doc.documentType, key: doc.documentKey });
        const f = this._maybeFail("create"); if (f) { return Promise.resolve(f); }
        const k = id(doc.documentType, doc.documentKey);
        if (this.table.has(k)) { return Promise.resolve({ ok: false, code: "duplicate_document" }); }
        const now = nextIso();
        this._seq += 1;
        const row = {
            id: "row-" + this._seq,
            documentType: doc.documentType,
            documentKey: doc.documentKey,
            schemaVersion: doc.schemaVersion || 5,
            payload: JSON.parse(JSON.stringify(doc.payload)),
            revision: 1,
            clientUpdatedAt: doc.clientUpdatedAt || now,
            createdAt: now,
            updatedAt: now,
            deletedAt: null
        };
        this.table.set(k, row);
        return Promise.resolve({ ok: true, document: sanitize(row) });
    }

    updateDocument(doc, expectedRevision) {
        this._record({ op: "update", type: doc.documentType, key: doc.documentKey, expectedRevision });
        const f = this._maybeFail("update"); if (f) { return Promise.resolve(f); }
        const row = this.table.get(id(doc.documentType, doc.documentKey));
        if (!row) { return Promise.resolve({ ok: false, code: "not_found" }); }
        if (row.revision !== expectedRevision) {
            return Promise.resolve({ ok: false, code: "revision_conflict", currentRevision: row.revision });
        }
        row.payload = JSON.parse(JSON.stringify(doc.payload));
        row.schemaVersion = doc.schemaVersion || row.schemaVersion;
        row.revision += 1;
        row.updatedAt = nextIso();
        row.clientUpdatedAt = doc.clientUpdatedAt || row.updatedAt;
        row.deletedAt = null;
        return Promise.resolve({ ok: true, document: sanitize(row) });
    }

    tombstoneDocument(type, key, expectedRevision) {
        this._record({ op: "tombstone", type, key, expectedRevision });
        const f = this._maybeFail("tombstone"); if (f) { return Promise.resolve(f); }
        const row = this.table.get(id(type, key));
        if (!row) { return Promise.resolve({ ok: false, code: "not_found" }); }
        if (row.revision !== expectedRevision) {
            return Promise.resolve({ ok: false, code: "revision_conflict", currentRevision: row.revision });
        }
        row.revision += 1;
        row.updatedAt = nextIso();
        row.deletedAt = row.updatedAt;
        return Promise.resolve({ ok: true, document: sanitize(row) });
    }

    restoreDocument(type, key, expectedRevision) {
        this._record({ op: "restore", type, key, expectedRevision });
        const row = this.table.get(id(type, key));
        if (!row) { return Promise.resolve({ ok: false, code: "not_found" }); }
        if (row.revision !== expectedRevision) {
            return Promise.resolve({ ok: false, code: "revision_conflict", currentRevision: row.revision });
        }
        row.revision += 1;
        row.updatedAt = nextIso();
        row.deletedAt = null;
        return Promise.resolve({ ok: true, document: sanitize(row) });
    }

    /* test introspection */
    rows() { return Array.from(this.table.values()).map(sanitize); }
    countCloud(op) { return this.calls.filter((c) => c.op === op).length; }
    totalCalls() { return this.calls.length; }
    reset() { this.calls = []; }
}

module.exports = { FakeCloud, makeTable };
