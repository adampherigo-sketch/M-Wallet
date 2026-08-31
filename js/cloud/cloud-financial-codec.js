"use strict";

/* =========================================================
   M-WALLET — CLOUD FINANCIAL CODEC   (BP7)

       window.MWalletCloudFinancialCodec

   A PURE local <-> cloud translation layer. It converts the
   existing local `mWalletData` structure into a set of
   independently versioned cloud DOCUMENTS (and back), so a
   change to one month, or to M-Cash, never has to replace
   everything else — the granularity BP8 sync needs.

   This module:
     - NEVER touches Supabase, localStorage, fetch, or the DOM
     - NEVER mutates its input (deep-clones first)
     - is DETERMINISTIC (same local state -> same documents)
     - preserves every user financial value EXACTLY (no rounding,
       no id/date/category/denomination rewriting, no category
       regeneration)

   Cloud document registry (type / key):
     accounts           / primary   { checking, savings }        account names + balances
     settings           / primary   { currency, currencySymbol, firstDayOfWeek }
     categories         / primary   { version, list }            the category library
     recurring-income   / primary   { items: [...] }             global recurring income
     recurring-expenses / primary   { items: [...] }             global recurring expenses
     savings            / primary   { goals, transfers }         savings goals + goal allocations
     cash               / primary   { initialized, wallet, savings, history, settings }
     month              / <YYYY-MM>  the month's full state       ONE document per month

   Deliberately NOT cloud documents (device-local / non-financial):
     mWalletData.version        - local schema version (kept per-doc as schemaVersion instead)
     mWalletData.migrations     - device-local migration markers
   ...and NONE of the BP2-BP6 local keys (auth config/session, local
   owner record, setup metadata/draft, walkthrough record/progress).
   ========================================================= */

(function (global) {

    var CODEC_VERSION = 1;
    var DEFAULT_SCHEMA_VERSION = 5;          /* mWalletData schema v5 */
    var MAX_PAYLOAD_BYTES = 512 * 1024;      /* mirrors the DB payload-size check */
    var MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
    var TYPE_RE = /^[a-z][a-z0-9-]{0,63}$/;
    var REGISTRY_KEY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

    /* stable, lowercase, machine identifiers — never derived from
       account names, merchant names, emails, or financial values */
    var SINGLETON_TYPES = [
        "accounts",
        "settings",
        "categories",
        "recurring-income",
        "recurring-expenses",
        "savings",
        "cash"
    ];
    var MONTH_TYPE = "month";
    var ALL_TYPES = SINGLETON_TYPES.concat([MONTH_TYPE]);

    /* the syncable slice of local financial state (everything EXCEPT
       version + migrations) */
    var SYNCABLE_FIELDS = [
        "settings", "income", "expenses", "months",
        "savingsGoals", "savingsTransfers", "cash", "accounts"
    ];
    var EXCLUDED_LOCAL_FIELDS = ["version", "migrations"];


    /* =====================================================
       SAFE CLONE / JSON HELPERS  (no input mutation)
       ===================================================== */

    function deepClone(value) {
        if (value === null || typeof value !== "object") { return value; }
        try {
            if (typeof structuredClone === "function") { return structuredClone(value); }
        } catch (e) { /* fall through to JSON */ }
        return JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(v) {
        return !!v && typeof v === "object" && !Array.isArray(v);
    }

    /* recursively assert JSON-safety: only finite numbers, strings,
       booleans, null, plain arrays/objects. Rejects NaN/Infinity,
       functions, DOM nodes, cycles, bigint, symbol. */
    function jsonSafetyReport(value) {
        var seen = [];
        function walk(v, path) {
            if (v === null) { return null; }
            var t = typeof v;
            if (t === "string" || t === "boolean") { return null; }
            if (t === "number") {
                return Number.isFinite(v) ? null : { path: path, reason: "non-finite number" };
            }
            if (t === "undefined") { return { path: path, reason: "undefined value" }; }
            if (t === "function") { return { path: path, reason: "function" }; }
            if (t === "bigint") { return { path: path, reason: "bigint" }; }
            if (t === "symbol") { return { path: path, reason: "symbol" }; }
            if (t === "object") {
                if (seen.indexOf(v) !== -1) { return { path: path, reason: "cycle" }; }
                if (typeof Node !== "undefined" && v instanceof Node) { return { path: path, reason: "DOM node" }; }
                seen.push(v);
                var bad = null;
                if (Array.isArray(v)) {
                    for (var i = 0; i < v.length && !bad; i++) { bad = walk(v[i], path + "[" + i + "]"); }
                } else {
                    var keys = Object.keys(v);
                    for (var k = 0; k < keys.length && !bad; k++) {
                        bad = walk(v[keys[k]], path + "." + keys[k]);
                    }
                }
                seen.pop();
                return bad;
            }
            return { path: path, reason: "unsupported type " + t };
        }
        return walk(value, "$");
    }

    function byteLength(str) {
        try {
            if (typeof TextEncoder === "function") { return new TextEncoder().encode(str).length; }
        } catch (e) { /* fall through */ }
        return unescape(encodeURIComponent(str)).length;
    }


    /* =====================================================
       VALIDATION
       ===================================================== */

    function validateDocumentKey(type, key) {
        if (typeof type !== "string" || !TYPE_RE.test(type)) {
            return { ok: false, code: "invalid_type", message: "Document type must be a lowercase machine identifier." };
        }
        if (typeof key !== "string" || key.length === 0) {
            return { ok: false, code: "invalid_key", message: "Document key is required." };
        }
        if (type === MONTH_TYPE) {
            return MONTH_KEY_RE.test(key)
                ? { ok: true }
                : { ok: false, code: "invalid_key", message: "A month document key must be YYYY-MM." };
        }
        if (SINGLETON_TYPES.indexOf(type) !== -1) {
            return key === "primary"
                ? { ok: true }
                : { ok: false, code: "invalid_key", message: "This document type uses the key \"primary\"." };
        }
        /* an unknown type with a registry-shaped key is still structurally valid */
        return REGISTRY_KEY_RE.test(key)
            ? { ok: true }
            : { ok: false, code: "invalid_key", message: "Document key format is not allowed." };
    }

    function validateDocument(doc) {
        if (!isPlainObject(doc)) {
            return { ok: false, code: "invalid_document", message: "A document must be an object." };
        }
        var keyCheck = validateDocumentKey(doc.documentType, doc.documentKey);
        if (!keyCheck.ok) { return keyCheck; }

        var sv = doc.schemaVersion;
        if (typeof sv !== "number" || !Number.isInteger(sv) || sv <= 0) {
            return { ok: false, code: "invalid_document", message: "schemaVersion must be a positive integer." };
        }
        if (!isPlainObject(doc.payload)) {
            return { ok: false, code: "invalid_document", message: "A document payload must be a JSON object." };
        }
        var bad = jsonSafetyReport(doc.payload);
        if (bad) {
            return { ok: false, code: "invalid_document", message: "Payload contains a value that cannot be stored (" + bad.reason + ")." };
        }
        var size;
        try { size = byteLength(JSON.stringify(doc.payload)); }
        catch (e) { return { ok: false, code: "invalid_document", message: "Payload is not JSON-serializable." }; }
        if (size > MAX_PAYLOAD_BYTES) {
            return { ok: false, code: "document_too_large", message: "This document is too large to store as a single cloud document." };
        }
        return { ok: true };
    }


    /* =====================================================
       ENCODE  (local mWalletData -> cloud documents)
       ===================================================== */

    function getDocumentDefinitions() {
        var defs = SINGLETON_TYPES.map(function (type) {
            return { type: type, keyStrategy: "singleton", key: "primary" };
        });
        defs.push({ type: MONTH_TYPE, keyStrategy: "month", key: "<YYYY-MM>" });
        return deepClone(defs);
    }

    function pickSyncable(localState) {
        var out = {};
        SYNCABLE_FIELDS.forEach(function (f) {
            if (Object.prototype.hasOwnProperty.call(localState, f)) {
                out[f] = deepClone(localState[f]);
            }
        });
        return out;
    }

    function encodeFinancialState(localState) {
        if (!isPlainObject(localState)) {
            return { ok: false, code: "invalid_local_state", message: "Local financial state must be an object.", documents: [] };
        }
        var src = deepClone(localState);                    /* never mutate the caller */
        var schemaVersion = Number.isInteger(src.version) && src.version > 0 ? src.version : DEFAULT_SCHEMA_VERSION;

        var settings = isPlainObject(src.settings) ? src.settings : {};
        var accounts = isPlainObject(src.accounts) ? src.accounts : {};
        var cash = isPlainObject(src.cash) ? src.cash : {};
        var months = isPlainObject(src.months) ? src.months : {};

        var documents = [];
        var add = function (type, key, payload) {
            documents.push({ documentType: type, documentKey: key, schemaVersion: schemaVersion, payload: payload });
        };

        add("accounts", "primary", {
            checking: deepClone(accounts.checking) || null,
            savings: deepClone(accounts.savings) || null
        });

        add("settings", "primary", {
            currency: Object.prototype.hasOwnProperty.call(settings, "currency") ? settings.currency : null,
            currencySymbol: Object.prototype.hasOwnProperty.call(settings, "currencySymbol") ? settings.currencySymbol : null,
            firstDayOfWeek: Object.prototype.hasOwnProperty.call(settings, "firstDayOfWeek") ? settings.firstDayOfWeek : null
        });

        add("categories", "primary", isPlainObject(settings.categories)
            ? deepClone(settings.categories)
            : { version: 1, list: [] });

        add("recurring-income", "primary", { items: Array.isArray(src.income) ? deepClone(src.income) : [] });
        add("recurring-expenses", "primary", { items: Array.isArray(src.expenses) ? deepClone(src.expenses) : [] });

        add("savings", "primary", {
            goals: Array.isArray(src.savingsGoals) ? deepClone(src.savingsGoals) : [],
            transfers: Array.isArray(src.savingsTransfers) ? deepClone(src.savingsTransfers) : []
        });

        add("cash", "primary", {
            initialized: cash.initialized === true,
            wallet: deepClone(cash.wallet) || { denominations: {} },
            savings: deepClone(cash.savings) || { denominations: {} },
            history: Array.isArray(cash.history) ? deepClone(cash.history) : [],
            settings: isPlainObject(cash.settings) ? deepClone(cash.settings) : {}
        });

        /* one document per month, deterministically ordered */
        Object.keys(months).sort().forEach(function (monthKey) {
            if (!MONTH_KEY_RE.test(monthKey)) { return; }   /* skip a malformed key rather than fail the whole encode */
            add(MONTH_TYPE, monthKey, deepClone(months[monthKey]));
        });

        /* validate every produced document */
        for (var i = 0; i < documents.length; i++) {
            var v = validateDocument(documents[i]);
            if (!v.ok) {
                return {
                    ok: false, code: v.code,
                    message: "Document " + documents[i].documentType + "/" + documents[i].documentKey + ": " + v.message,
                    documents: []
                };
            }
        }

        return {
            ok: true,
            codecVersion: CODEC_VERSION,
            schemaVersion: schemaVersion,
            excludedLocalFields: EXCLUDED_LOCAL_FIELDS.slice(),
            documents: documents
        };
    }


    /* =====================================================
       DECODE  (cloud documents -> syncable financial state)
       ===================================================== */

    /* `documents` = an array of { documentType, documentKey, payload,
       deletedAt? }. Tombstoned documents (deletedAt set) are treated as
       absent. Returns ONLY the syncable slice — version + migrations are
       intentionally not reconstructed here. */
    function decodeFinancialDocuments(documents) {
        if (!Array.isArray(documents)) {
            return { ok: false, code: "invalid_documents", message: "Expected an array of documents." };
        }

        var byType = {};
        var months = {};
        for (var i = 0; i < documents.length; i++) {
            var d = documents[i];
            if (!isPlainObject(d) || typeof d.documentType !== "string") { continue; }
            if (d.deletedAt) { continue; }                 /* tombstone => absent */
            var payload = isPlainObject(d.payload) ? deepClone(d.payload) : {};
            if (d.documentType === MONTH_TYPE) {
                if (typeof d.documentKey === "string" && MONTH_KEY_RE.test(d.documentKey)) {
                    months[d.documentKey] = payload;
                }
            } else {
                byType[d.documentType] = payload;
            }
        }

        var accountsDoc = byType.accounts || {};
        var settingsDoc = byType.settings || {};
        var categoriesDoc = byType.categories || { version: 1, list: [] };
        var incomeDoc = byType["recurring-income"] || { items: [] };
        var expensesDoc = byType["recurring-expenses"] || { items: [] };
        var savingsDoc = byType.savings || { goals: [], transfers: [] };
        var cashDoc = byType.cash || {};

        var state = {
            settings: {
                currency: Object.prototype.hasOwnProperty.call(settingsDoc, "currency") ? settingsDoc.currency : null,
                currencySymbol: Object.prototype.hasOwnProperty.call(settingsDoc, "currencySymbol") ? settingsDoc.currencySymbol : null,
                firstDayOfWeek: Object.prototype.hasOwnProperty.call(settingsDoc, "firstDayOfWeek") ? settingsDoc.firstDayOfWeek : null,
                categories: deepClone(categoriesDoc)
            },
            income: Array.isArray(incomeDoc.items) ? deepClone(incomeDoc.items) : [],
            expenses: Array.isArray(expensesDoc.items) ? deepClone(expensesDoc.items) : [],
            months: months,
            savingsGoals: Array.isArray(savingsDoc.goals) ? deepClone(savingsDoc.goals) : [],
            savingsTransfers: Array.isArray(savingsDoc.transfers) ? deepClone(savingsDoc.transfers) : [],
            cash: {
                initialized: cashDoc.initialized === true,
                wallet: isPlainObject(cashDoc.wallet) ? deepClone(cashDoc.wallet) : { denominations: {} },
                savings: isPlainObject(cashDoc.savings) ? deepClone(cashDoc.savings) : { denominations: {} },
                history: Array.isArray(cashDoc.history) ? deepClone(cashDoc.history) : [],
                settings: isPlainObject(cashDoc.settings) ? deepClone(cashDoc.settings) : {}
            },
            accounts: {
                checking: isPlainObject(accountsDoc.checking) ? deepClone(accountsDoc.checking) : null,
                savings: isPlainObject(accountsDoc.savings) ? deepClone(accountsDoc.savings) : null
            }
        };

        return { ok: true, state: state };
    }

    /* The syncable slice of a local state, for round-trip comparison
       (drops version + migrations, mirrors what decode reconstructs). */
    function syncableSlice(localState) {
        var src = deepClone(localState || {});
        var settings = isPlainObject(src.settings) ? src.settings : {};
        var accounts = isPlainObject(src.accounts) ? src.accounts : {};
        var cash = isPlainObject(src.cash) ? src.cash : {};
        return {
            settings: {
                currency: Object.prototype.hasOwnProperty.call(settings, "currency") ? settings.currency : null,
                currencySymbol: Object.prototype.hasOwnProperty.call(settings, "currencySymbol") ? settings.currencySymbol : null,
                firstDayOfWeek: Object.prototype.hasOwnProperty.call(settings, "firstDayOfWeek") ? settings.firstDayOfWeek : null,
                categories: isPlainObject(settings.categories) ? deepClone(settings.categories) : { version: 1, list: [] }
            },
            income: Array.isArray(src.income) ? deepClone(src.income) : [],
            expenses: Array.isArray(src.expenses) ? deepClone(src.expenses) : [],
            months: isPlainObject(src.months) ? deepClone(src.months) : {},
            savingsGoals: Array.isArray(src.savingsGoals) ? deepClone(src.savingsGoals) : [],
            savingsTransfers: Array.isArray(src.savingsTransfers) ? deepClone(src.savingsTransfers) : [],
            cash: {
                initialized: cash.initialized === true,
                wallet: isPlainObject(cash.wallet) ? deepClone(cash.wallet) : { denominations: {} },
                savings: isPlainObject(cash.savings) ? deepClone(cash.savings) : { denominations: {} },
                history: Array.isArray(cash.history) ? deepClone(cash.history) : [],
                settings: isPlainObject(cash.settings) ? deepClone(cash.settings) : {}
            },
            accounts: {
                checking: isPlainObject(accounts.checking) ? deepClone(accounts.checking) : null,
                savings: isPlainObject(accounts.savings) ? deepClone(accounts.savings) : null
            }
        };
    }


    global.MWalletCloudFinancialCodec = {
        CODEC_VERSION: CODEC_VERSION,
        SINGLETON_TYPES: SINGLETON_TYPES.slice(),
        MONTH_TYPE: MONTH_TYPE,
        ALL_TYPES: ALL_TYPES.slice(),
        SYNCABLE_FIELDS: SYNCABLE_FIELDS.slice(),
        EXCLUDED_LOCAL_FIELDS: EXCLUDED_LOCAL_FIELDS.slice(),
        MAX_PAYLOAD_BYTES: MAX_PAYLOAD_BYTES,

        getDocumentDefinitions: getDocumentDefinitions,
        validateDocument: validateDocument,
        validateDocumentKey: validateDocumentKey,
        encodeFinancialState: encodeFinancialState,
        decodeFinancialDocuments: decodeFinancialDocuments,
        syncableSlice: syncableSlice,
        pickSyncable: pickSyncable
    };

})(typeof window !== "undefined" ? window : this);
