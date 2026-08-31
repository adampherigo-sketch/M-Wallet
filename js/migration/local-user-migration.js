"use strict";

/* =========================================================
   M-WALLET — LOCAL USER MIGRATION + OWNERSHIP   (BP4)

       window.MWalletLocalMigration

   M-Wallet was a local-first financial app before accounts
   existed. This module makes adding accounts NON-DESTRUCTIVE:

     - it NEVER deletes, overwrites, uploads, or migrates the
       financial store (localStorage["mWalletData"])
     - the first authenticated user who safely claims the data
       on this device becomes its LOCAL OWNER
     - a different account can never silently open or reassign
       an already-claimed local workspace

   Financial data stays exactly where it lives. BP4 does NOT
   move anything to Supabase (that is BP7 / BP8).

   ---------------------------------------------------------
   OWNERSHIP RECORD  — localStorage["mwallet.local.owner.v1"]
     {
       schemaVersion: 1,
       ownerUserId:  "<supabase user id>",   // identity = user id, never email
       claimedAt:    "<ISO timestamp>",
       source:       "legacy" | "fresh"
     }
   No passwords, tokens, keys, sessions, emails, or financial
   contents/totals are ever stored, returned, or logged here.

   ---------------------------------------------------------
   STATE MODEL
     unconfigured   - Supabase auth not configured -> BP3 local
                      developer mode, this layer does nothing
     checking       - waiting on auth / determining ownership
     needs_claim    - signed in, meaningful local data, no owner
     owned          - signed in, owner record matches this user
     fresh_claimed  - signed in, no meaningful data -> auto-claimed
     owner_mismatch - signed in, owner record is a different user
     error          - could not safely determine ownership
                      (fails CLOSED: app stays gated)
   ========================================================= */

(function (global) {

    var OWNER_KEY = "mwallet.local.owner.v1";
    var FINANCIAL_KEY = "mWalletData";
    var OWNER_SCHEMA_VERSION = 1;

    var STATE = {
        UNCONFIGURED: "unconfigured",
        CHECKING: "checking",
        NEEDS_CLAIM: "needs_claim",
        OWNED: "owned",
        FRESH_CLAIMED: "fresh_claimed",
        OWNER_MISMATCH: "owner_mismatch",
        ERROR: "error"
    };

    /* Public snapshot fields only — never an id, email, token,
       balance, or any financial content. */
    var current = {
        status: STATE.CHECKING,
        configured: false,
        source: null,             /* "legacy" | "fresh" | null */
        hasOwnershipRecord: false,
        meaningfulData: null,     /* true | false | null (unknown) */
        storageReadable: true,
        error: null               /* { code, message } — safe strings only */
    };

    var subscribers = [];
    var initPromise = null;
    var authUnsub = null;


    /* =====================================================
       STORAGE ACCESS  (read-only, except the owner key)
       ===================================================== */

    function storage() {
        try { return global.localStorage || null; } catch (e) { return null; }
    }

    /* Read the raw financial string and parse it defensively.
       Makes ZERO writes and calls NO storage.js method — a plain
       inspection must never rewrite mWalletData or materialize
       recurring months. */
    function readFinancialRaw() {
        var store = storage();
        if (!store) {
            return { available: false, present: false, readable: false, raw: null, data: null };
        }
        var raw;
        try { raw = store.getItem(FINANCIAL_KEY); }
        catch (e) { return { available: true, present: true, readable: false, raw: null, data: null }; }

        if (raw == null) {
            return { available: true, present: false, readable: true, raw: null, data: null };
        }
        var data;
        try { data = JSON.parse(raw); }
        catch (e) { return { available: true, present: true, readable: false, raw: raw, data: null }; }

        if (!data || typeof data !== "object" || Array.isArray(data)) {
            return { available: true, present: true, readable: false, raw: raw, data: null };
        }
        return { available: true, present: true, readable: true, raw: raw, data: data };
    }


    /* =====================================================
       MEANINGFUL DATA DETECTION  (pure, read-only)
       ===================================================== */

    function toNumber(value) {
        var n = Number(value);
        return Number.isFinite(n) ? n : 0;
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function anyPositiveQuantity(denominations) {
        if (!denominations || typeof denominations !== "object") { return false; }
        return Object.keys(denominations).some(function (key) {
            return toNumber(denominations[key]) > 0;
        });
    }

    /* Returns { meaningful: boolean, signals: string[] }.
       Generated/default structures (empty month shells, the
       default category library at default names, zero balances,
       the empty cash state, schema/migration metadata) do NOT
       count. */
    function inspectMeaningful(data) {
        if (!data || typeof data !== "object") {
            return { meaningful: false, signals: [] };
        }

        var signals = [];
        var mark = function (name) {
            if (signals.indexOf(name) === -1) { signals.push(name); }
        };

        if (asArray(data.income).length > 0) { mark("income"); }
        if (asArray(data.expenses).length > 0) { mark("expenses"); }
        if (asArray(data.savingsGoals).length > 0) { mark("savings-goals"); }
        if (asArray(data.savingsTransfers).length > 0) { mark("savings-transfers"); }

        var accounts = (data.accounts && typeof data.accounts === "object") ? data.accounts : {};
        if (accounts.checking && toNumber(accounts.checking.balance) !== 0) { mark("checking-balance"); }
        if (accounts.savings && toNumber(accounts.savings.balance) !== 0) { mark("savings-balance"); }

        var months = (data.months && typeof data.months === "object") ? data.months : {};
        Object.keys(months).forEach(function (monthKey) {
            var month = months[monthKey];
            if (!month || typeof month !== "object") { return; }
            ["bills", "paychecks", "expenses", "transactions", "savingsDeposits"].forEach(function (key) {
                if (asArray(month[key]).length > 0) { mark("month:" + key); }
            });
            if (typeof month.notes === "string" && month.notes.trim() !== "") { mark("month:notes"); }
        });

        var cash = (data.cash && typeof data.cash === "object") ? data.cash : {};
        if (cash.initialized === true) { mark("cash-initialized"); }
        if (cash.wallet && anyPositiveQuantity(cash.wallet.denominations)) { mark("cash-wallet"); }
        if (cash.savings && anyPositiveQuantity(cash.savings.denominations)) { mark("cash-savings"); }
        if (asArray(cash.history).length > 0) { mark("cash-history"); }

        var categoryList =
            (data.settings && data.settings.categories && Array.isArray(data.settings.categories.list))
                ? data.settings.categories.list : [];
        categoryList.forEach(function (category) {
            if (!category || typeof category !== "object") { return; }
            if (category.system !== true) { mark("custom-category"); }
            if (category.system === true && category.enabled === false) { mark("disabled-system-category"); }
            asArray(category.subcategories).forEach(function (sub) {
                if (!sub || typeof sub !== "object") { return; }
                if (sub.system !== true) { mark("custom-subcategory"); }
                if (sub.system === true && sub.enabled === false) { mark("disabled-system-subcategory"); }
            });
        });

        var settings = (data.settings && typeof data.settings === "object") ? data.settings : {};
        if (typeof settings.currency === "string" && settings.currency && settings.currency !== "USD") {
            mark("currency-changed");
        }

        return { meaningful: signals.length > 0, signals: signals };
    }

    function detectMeaningfulLocalData() {
        var financial = readFinancialRaw();

        if (!financial.available) {
            return { readable: false, present: false, meaningful: null, signals: [], reason: "no-storage" };
        }
        if (!financial.present) {
            return { readable: true, present: false, meaningful: false, signals: [], reason: "absent" };
        }
        if (!financial.readable) {
            /* corrupt / unparseable — NOT "empty", NOT "meaningful" */
            return { readable: false, present: true, meaningful: null, signals: [], reason: "unparseable" };
        }

        var result = inspectMeaningful(financial.data);
        return {
            readable: true,
            present: true,
            meaningful: result.meaningful,
            signals: result.signals,
            reason: result.meaningful ? "signals" : "fresh"
        };
    }


    /* =====================================================
       OWNERSHIP RECORD
       ===================================================== */

    function readOwnership() {
        var store = storage();
        if (!store) { return { available: false, present: false, valid: false, record: null }; }

        var raw;
        try { raw = store.getItem(OWNER_KEY); }
        catch (e) { return { available: true, present: true, valid: false, record: null }; }

        if (raw == null) { return { available: true, present: false, valid: false, record: null }; }

        var record;
        try { record = JSON.parse(raw); }
        catch (e) { return { available: true, present: true, valid: false, record: null }; }

        var valid =
            record && typeof record === "object" &&
            record.schemaVersion === OWNER_SCHEMA_VERSION &&
            typeof record.ownerUserId === "string" && record.ownerUserId.length > 0 &&
            typeof record.claimedAt === "string" && record.claimedAt.length > 0 &&
            (record.source === "legacy" || record.source === "fresh");

        return { available: true, present: true, valid: Boolean(valid), record: valid ? record : null };
    }

    function nowIso() {
        try { return new Date().toISOString(); }
        catch (e) { return "1970-01-01T00:00:00.000Z"; }
    }

    /* Writes ONLY the owner key and verifies the round-trip.
       Never touches mWalletData. */
    function writeOwnership(userId, source) {
        var store = storage();
        if (!store) { return { ok: false, code: "no_storage" }; }

        var record = {
            schemaVersion: OWNER_SCHEMA_VERSION,
            ownerUserId: String(userId),
            claimedAt: nowIso(),
            source: source
        };

        try {
            store.setItem(OWNER_KEY, JSON.stringify(record));
        } catch (e) {
            return { ok: false, code: "write_failed" };
        }

        var verify = readOwnership();
        if (!verify.valid || verify.record.ownerUserId !== String(userId)) {
            return { ok: false, code: "verify_failed" };
        }
        return { ok: true, record: verify.record };
    }


    /* =====================================================
       AUTH
       ===================================================== */

    function authSnapshot() {
        try {
            var auth = global.MWalletAuth;
            return (auth && typeof auth.getState === "function") ? auth.getState() : null;
        } catch (e) {
            return null;
        }
    }

    /* Identity = Supabase user id. Never email (it can change). */
    function currentUserId(snapshot) {
        snapshot = snapshot || authSnapshot();
        if (!snapshot) { return null; }
        if (snapshot.user && typeof snapshot.user.id === "string" && snapshot.user.id.length > 0) {
            return snapshot.user.id;
        }
        if (snapshot.session && typeof snapshot.session.userId === "string" && snapshot.session.userId.length > 0) {
            return snapshot.session.userId;
        }
        return null;
    }


    /* =====================================================
       STATE
       ===================================================== */

    function snapshot() {
        return {
            status: current.status,
            configured: current.configured,
            source: current.source,
            hasOwnershipRecord: current.hasOwnershipRecord,
            meaningfulData: current.meaningfulData,
            storageReadable: current.storageReadable,
            error: current.error
                ? { code: current.error.code, message: current.error.message }
                : null
        };
    }

    function notify() {
        var snap = snapshot();
        subscribers.slice().forEach(function (listener) {
            try { listener(snap); } catch (e) { /* a bad subscriber cannot break migration */ }
        });
    }

    function setState(next) {
        var changed = false;
        Object.keys(next).forEach(function (key) {
            var before = current[key];
            var after = next[key];
            var equal = before === after ||
                (key === "error" && JSON.stringify(before) === JSON.stringify(after));
            if (!equal) { current[key] = after; changed = true; }
        });
        if (changed) { notify(); }
    }

    function failClosed(code, message) {
        setState({ status: STATE.ERROR, error: { code: code, message: message } });
    }

    /* Ask auth-ui (the single app-root gate owner) to re-evaluate
       its guard now that migration state may have changed. */
    function refreshGate() {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.renderState === "function") {
                global.MWalletAuthUI.renderState();
            }
        } catch (e) { /* never throw into the app for a gate refresh */ }
    }


    /* =====================================================
       CORE RESOLUTION  (idempotent, never writes mWalletData)
       ===================================================== */

    function resolve(snap) {
        snap = snap || authSnapshot();

        /* 1. auth configured? */
        if (!snap || !snap.configured) {
            setState({ status: STATE.UNCONFIGURED, configured: false, source: null, error: null });
            refreshGate();
            return snapshot();
        }
        setState({ configured: true });

        /* 2. auth initialized / 4. recovery — defer, auth-ui drives */
        if (snap.status === "initializing" || snap.recoveryMode === true) {
            setState({ status: STATE.CHECKING, error: null });
            refreshGate();
            return snapshot();
        }

        /* 3. user signed in? (signed_out / error handled by auth-ui) */
        if (snap.status !== "signed_in") {
            setState({ status: STATE.CHECKING, source: null, error: null });
            refreshGate();
            return snapshot();
        }

        /* signed in — verify local ownership */
        var userId = currentUserId(snap);
        if (!userId) {
            failClosed("no_user_id", "We couldn't verify your account on this device.");
            refreshGate();
            return snapshot();
        }

        var ownership = readOwnership();
        if (!ownership.available) {
            failClosed("no_storage", "We couldn't verify the local data owner on this device.");
            refreshGate();
            return snapshot();
        }
        if (ownership.present && !ownership.valid) {
            /* malformed marker — fail closed, NEVER overwrite it */
            setState({ hasOwnershipRecord: true });
            failClosed("owner_metadata_malformed", "We couldn't verify the local data owner on this device.");
            refreshGate();
            return snapshot();
        }

        var detection = detectMeaningfulLocalData();
        if (detection.present === true && detection.readable === false) {
            /* mWalletData exists but is corrupt — do not claim, do
               not overwrite, do not call it fresh (BP4.11) */
            setState({ storageReadable: false, meaningfulData: null });
            failClosed("financial_data_unreadable", "We couldn't read the M-Wallet data stored on this device.");
            refreshGate();
            return snapshot();
        }
        setState({ storageReadable: true, meaningfulData: detection.meaningful === true });

        /* existing valid owner record */
        if (ownership.valid) {
            setState({ hasOwnershipRecord: true, source: ownership.record.source });
            if (ownership.record.ownerUserId === userId) {
                if (current.status !== STATE.FRESH_CLAIMED) {
                    setState({ status: STATE.OWNED, error: null });
                } else {
                    setState({ error: null });
                }
            } else {
                setState({ status: STATE.OWNER_MISMATCH, error: null });
            }
            refreshGate();
            return snapshot();
        }

        /* no owner record yet */
        setState({ hasOwnershipRecord: false });

        if (detection.meaningful === true) {
            /* existing user must explicitly claim — no auto-write */
            setState({ status: STATE.NEEDS_CLAIM, error: null });
            refreshGate();
            return snapshot();
        }

        /* fresh workspace — auto-claim for this user (owner key only) */
        var written = writeOwnership(userId, "fresh");
        if (!written.ok) {
            failClosed("claim_write_failed", "We couldn't set up this device for your account.");
            refreshGate();
            return snapshot();
        }
        setState({ status: STATE.FRESH_CLAIMED, hasOwnershipRecord: true, source: "fresh", error: null });
        refreshGate();
        return snapshot();
    }


    /* =====================================================
       PUBLIC ACTIONS
       ===================================================== */

    /* The existing-user claim (BP4.4). Writes ONLY the owner
       record; mWalletData is left byte-identical. Idempotent. */
    function claimExistingData() {
        var snap = authSnapshot();
        if (!snap || !snap.configured) {
            return Promise.resolve({ ok: false, code: "not_configured" });
        }
        if (snap.status !== "signed_in") {
            return Promise.resolve({ ok: false, code: "not_signed_in" });
        }
        var userId = currentUserId(snap);
        if (!userId) {
            return Promise.resolve({ ok: false, code: "no_user_id" });
        }

        var ownership = readOwnership();
        if (ownership.present && !ownership.valid) {
            return Promise.resolve({ ok: false, code: "owner_metadata_malformed" });
        }
        if (ownership.valid) {
            if (ownership.record.ownerUserId === userId) {
                resolve(snap); /* already ours — just settle state */
                return Promise.resolve({ ok: true, alreadyOwned: true, source: ownership.record.source });
            }
            /* someone else owns it — never reassign */
            return Promise.resolve({ ok: false, code: "owner_mismatch" });
        }

        var detection = detectMeaningfulLocalData();
        if (detection.present === true && detection.readable === false) {
            return Promise.resolve({ ok: false, code: "financial_data_unreadable" });
        }

        var written = writeOwnership(userId, "legacy");
        if (!written.ok) {
            return Promise.resolve({ ok: false, code: written.code });
        }

        setState({
            status: STATE.OWNED,
            hasOwnershipRecord: true,
            source: "legacy",
            meaningfulData: detection.meaningful === true,
            storageReadable: true,
            error: null
        });
        refreshGate();
        return Promise.resolve({ ok: true, source: "legacy" });
    }

    /* Auto-establish ownership when appropriate (fresh users) and
       otherwise just re-resolve. Idempotent. */
    function ensureOwnership() {
        return Promise.resolve(resolve(authSnapshot()));
    }

    /* Safe ownership view — NEVER returns ownerUserId. */
    function getOwnership() {
        var ownership = readOwnership();
        if (!ownership.present) { return { present: false }; }
        if (!ownership.valid) { return { present: true, valid: false }; }
        var userId = currentUserId();
        return {
            present: true,
            valid: true,
            source: ownership.record.source,
            claimedAt: ownership.record.claimedAt,
            matchesCurrentUser: userId != null && ownership.record.ownerUserId === userId
        };
    }

    function getState() { return snapshot(); }
    function getStatus() { return current.status; }

    function subscribe(listener) {
        if (typeof listener !== "function") { return function () {}; }
        subscribers.push(listener);
        try { listener(snapshot()); } catch (e) { /* ignore a throwing first call */ }
        return function unsubscribe() {
            var index = subscribers.indexOf(listener);
            if (index !== -1) { subscribers.splice(index, 1); }
        };
    }

    /* Non-sensitive diagnostics only. No ids, emails, tokens,
       balances, or financial contents. */
    function diagnostics() {
        var ownership = readOwnership();
        var detection = detectMeaningfulLocalData();
        return {
            status: current.status,
            configured: current.configured,
            ownerKey: OWNER_KEY,
            hasOwnershipRecord: ownership.present,
            ownershipValid: ownership.present ? ownership.valid : null,
            ownershipSource: (ownership.valid && ownership.record) ? ownership.record.source : null,
            meaningfulLocalData: detection.meaningful,
            financialStoragePresent: detection.present,
            financialStorageReadable: detection.readable,
            subscriberCount: subscribers.length
        };
    }


    /* =====================================================
       BOOT
       ===================================================== */

    function initialize() {
        if (initPromise) { return initPromise; }

        var auth = global.MWalletAuth;
        if (auth && typeof auth.subscribe === "function") {
            authUnsub = auth.subscribe(function (snap) { resolve(snap); });
        } else {
            resolve(authSnapshot());
        }

        initPromise = Promise.resolve(snapshot());
        return initPromise;
    }

    var api = {
        STATES: STATE,
        OWNER_KEY: OWNER_KEY,

        initialize: initialize,
        getState: getState,
        getStatus: getStatus,
        subscribe: subscribe,

        detectMeaningfulLocalData: detectMeaningfulLocalData,
        getOwnership: getOwnership,
        claimExistingData: claimExistingData,
        ensureOwnership: ensureOwnership,
        diagnostics: diagnostics,

        /* internal, used by migration-ui.js + tests */
        _resolve: resolve,
        _ownershipGuard: ownershipGuard
    };

    global.MWalletLocalMigration = api;

    /* FAIL-CLOSED ownership guard, registered with auth-ui
       synchronously at load (before any 'signed_in' event).

       Contract: return { release: true } ONLY when a signed-in
       user's local ownership is positively verified (owned or
       fresh_claimed). Every other state — checking, needs_claim,
       owner_mismatch, error, or anything unexpected — returns
       { release: false } so the financial app stays blocked.
       auth-ui treats a missing/throwing/malformed guard as
       blocked too, so this is defence in depth. */
    function ownershipGuard(authSnap) {
        if (!authSnap || authSnap.configured !== true || authSnap.status !== "signed_in") {
            return { release: false };
        }
        var status = current.status;
        return { release: status === STATE.OWNED || status === STATE.FRESH_CLAIMED };
    }

    (function registerGuard() {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.setPostAuthGuard === "function") {
                global.MWalletAuthUI.setPostAuthGuard(ownershipGuard);
            }
        } catch (e) { /* auth-ui absent -> auth-ui already fails closed on a missing guard */ }
    })();

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initialize);
        } else {
            initialize();
        }
    }

})(typeof window !== "undefined" ? window : this);
