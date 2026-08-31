"use strict";

/* =========================================================
   M-WALLET — ACCOUNT / PRIVACY / RECOVERY CONTROLS   (BP10)

       window.MWalletAccount

   A narrow, safe API that turns Settings into an account
   management centre:

     - a safe account / security / privacy summary
     - change email (through the ONE existing Supabase client)
     - sign out (this session / all sessions)
     - export the local wallet as a portable JSON file
     - inspect + restore a previously exported wallet
     - erase the local wallet (+ owner-bound sidecars) from
       THIS device

   HARD RULES
     - Account management NEVER silently destroys financial
       data. Every destructive action is explicit, scoped,
       confirmed, truthful, and recoverable where reasonable.
     - `changeEmail`, `changePassword`, `signOut`, passkey
       actions NEVER modify mWalletData.
     - No second Supabase client. No `service_role`. No
       `auth.admin`. No browser-side account deletion. No
       `localStorage.clear()`.
     - Import is parse + structural validation only — untrusted
       JSON is never `setItem`-ed unvalidated, never becomes
       HTML, and never overwrites without confirmation.
     - The export file contains financial data and is NOT
       encrypted; it carries no token, no auth config, no
       owner id, no setup / walkthrough / sync / passkey data.
   ========================================================= */

(function (global) {

    var EXPORT_FORMAT = "m-wallet-export";
    var EXPORT_FORMAT_VERSION = 1;          /* wrapper version — NOT mWalletData.version */
    var SUPPORTED_FORMAT_VERSION = 1;
    var MAX_IMPORT_BYTES = 5 * 1024 * 1024; /* ~5 MiB — ample for long-term use, small enough to be safe */
    var ERASE_PHRASE = "ERASE";

    var STORAGE_KEY = "mWalletData";
    var AUTH_CONFIG_KEY = "mwallet.auth.config";   /* local-dev config — NOT owner-bound, kept on erase */
    var AUTH_SESSION_KEY = "mwallet.auth.session"; /* Supabase-managed — cleared via signOut, not removeItem */

    var CODES = [
        "auth_required", "recovery_mode", "not_supported", "not_configured",
        "invalid_email", "same_email", "email_update_failed", "verification_required",
        "password_update_failed", "signed_out",
        "export_failed", "no_wallet",
        "invalid_json", "invalid_export", "unsupported_export", "missing_wallet",
        "invalid_wallet", "unsafe_keys", "unsupported_schema", "too_large",
        "confirmation_required", "owner_mismatch", "import_failed", "local_storage_error",
        "sync_reset_failed",
        "erase_failed", "erase_incomplete", "erased_signout_failed",
        "cancelled", "busy", "unknown_error"
    ];

    /* ---- dependency resolution (overridable for tests) ---- */

    var deps = null;

    function d() {
        if (deps) { return deps; }
        return {
            auth: g("MWalletAuth"),
            storage: g("MWalletStorage") || g("BudgetStorage"),
            migration: g("MWalletLocalMigration"),
            firstRun: g("MWalletFirstRun"),
            walkthrough: g("MWalletWalkthrough"),
            syncState: g("MWalletSyncState"),
            syncRelease: g("MWalletSyncRelease"),
            passkeyRelease: g("MWalletPasskeyRelease"),
            passkeys: g("MWalletPasskeys"),
            version: g("MWalletVersion"),
            app: g("BudgetApp") || g("MWalletApp"),
            storageArea: safeLocalStorage(),
            now: function () { try { return new Date().toISOString(); } catch (e) { return "1970-01-01T00:00:00.000Z"; } }
        };
    }

    function g(name) { try { return global[name] || null; } catch (e) { return null; } }
    function safeLocalStorage() { try { return global.localStorage || null; } catch (e) { return null; } }

    function configureForTest(overrides) {
        if (overrides == null) { deps = null; return; }
        deps = Object.assign({}, d(), overrides);
    }

    function fail(code, extra) {
        var safe = CODES.indexOf(code) !== -1 ? code : "unknown_error";
        return Object.assign({ ok: false, code: safe }, extra || {});
    }


    /* ---- shared helpers ---- */

    function authState() {
        var a = d().auth;
        try { return (a && typeof a.getState === "function") ? a.getState() : null; }
        catch (e) { return null; }
    }

    function isConfigured() { var s = authState(); return !!(s && s.configured === true); }
    function isSignedIn() { var s = authState(); return !!(s && s.status === "signed_in"); }
    function inRecovery() { var s = authState(); return !!(s && s.recoveryMode === true); }

    function ownershipStatus() {
        var m = d().migration;
        try { return (m && typeof m.getStatus === "function") ? m.getStatus() : null; }
        catch (e) { return null; }
    }

    /* Only a positively-verified local owner (or an unconfigured dev
       build) may touch the local wallet. An owner mismatch gets nothing
       but sign-out. */
    function localWalletAccessGuard() {
        if (!isConfigured()) { return null; }                 /* dev mode */
        var st = ownershipStatus();
        if (st === "owned" || st === "fresh_claimed") { return null; }
        if (st === "owner_mismatch") { return "owner_mismatch"; }
        /* checking / needs_claim / error / unknown -> not yet safe */
        return "owner_mismatch";
    }

    function rawWalletString() {
        var ls = d().storageArea;
        try { return ls ? ls.getItem(STORAGE_KEY) : null; } catch (e) { return null; }
    }


    /* =====================================================
       SUMMARY / DIAGNOSTICS
       ===================================================== */

    function passkeySummary() {
        var pr = d().passkeyRelease;
        var pk = d().passkeys;
        var releaseEnabled = false;
        try { releaseEnabled = !!(pr && pr.isEnabled && pr.isEnabled()); } catch (e) {}
        var registeredCount = null;
        try {
            var st = pk && typeof pk.getState === "function" ? pk.getState() : null;
            registeredCount = st ? st.registeredCount : null;
        } catch (e) {}
        return { releaseEnabled: releaseEnabled, registeredCount: registeredCount };
    }

    function syncReleaseEnabled() {
        var sr = d().syncRelease;
        try { return !!(sr && sr.isEnabled && sr.isEnabled()); } catch (e) { return false; }
    }

    function getSummary() {
        var s = authState();
        var signedIn = isSignedIn();
        var configured = isConfigured();
        var emailVerified = !!(s && s.user && s.user.confirmed === true);
        var owner = ownershipStatus();

        return {
            account: {
                configured: configured,
                signedIn: signedIn,
                /* the email is user-facing and safe to show; never the id */
                email: (signedIn && s.user && s.user.email) ? s.user.email : null,
                emailVerified: signedIn ? emailVerified : null,
                recoveryMode: inRecovery()
            },
            security: {
                passwordAvailable: configured,
                passkeys: passkeySummary()
            },
            data: {
                storedLocally: true,
                exportAvailable: exportAvailable(),
                importAvailable: importAvailable(),
                ownershipVerified: owner === "owned" || owner === "fresh_claimed" || !configured
            },
            privacy: {
                cloudSyncActive: false,
                cloudSyncReleaseEnabled: syncReleaseEnabled(),
                passkeyReleaseEnabled: passkeySummary().releaseEnabled,
                analytics: "none",
                encryption: "transport_only_plus_rls"
            },
            accountDeletion: accountDeletionStatus()
        };
    }

    /* NO email, user id, wallet contents, token, or owner id. */
    function diagnostics() {
        var s = authState();
        return {
            configured: isConfigured(),
            signedIn: isSignedIn(),
            emailVerified: !!(s && s.user && s.user.confirmed === true),
            recoveryMode: inRecovery(),
            exportAvailable: exportAvailable(),
            importAvailable: importAvailable(),
            syncReleaseEnabled: syncReleaseEnabled(),
            passkeyReleaseEnabled: passkeySummary().releaseEnabled,
            accountDeletionAvailable: accountDeletionStatus().available,
            eraseTargetCount: eraseTargets().length
        };
    }

    function accountDeletionStatus() {
        /* Supabase Auth user deletion requires auth.admin / service_role,
           which must never live in the browser. This static PWA has no
           trusted server-side delete endpoint. */
        return {
            available: false,
            reason: "requires_trusted_server",
            note: "Secure account deletion needs a trusted server-side operation and is intentionally not built into the browser app."
        };
    }


    /* =====================================================
       ACCOUNT — email / password / sign out
       ===================================================== */

    var busy = false;

    function changeEmail(newEmail) {
        var a = d().auth;
        if (!isConfigured()) { return Promise.resolve(fail("not_configured")); }
        if (inRecovery()) { return Promise.resolve(fail("recovery_mode")); }
        if (!isSignedIn()) { return Promise.resolve(fail("auth_required")); }
        if (!a || typeof a.updateEmail !== "function") { return Promise.resolve(fail("not_supported")); }
        if (busy) { return Promise.resolve(fail("busy")); }
        busy = true;
        return Promise.resolve(a.updateEmail(newEmail)).then(function (res) {
            busy = false;
            if (res && res.ok) {
                return { ok: true, verificationRequired: res.verificationRequired === true, message: res.message };
            }
            return fail(mapAuthCode(res && res.code), { message: res && res.message });
        }).catch(function () {
            busy = false;
            return fail("email_update_failed");
        });
    }

    function mapAuthCode(code) {
        if (code === "invalid_email") { return "invalid_email"; }
        if (code === "same_email") { return "same_email"; }
        if (code === "recovery_mode") { return "recovery_mode"; }
        if (code === "auth_required") { return "auth_required"; }
        if (code === "unsupported") { return "not_supported"; }
        return "email_update_failed";
    }

    /* password is handled by BP3's existing resetPassword flow — this is
       just a thin, guarded pass-through so the Recovery section can offer
       it without a second implementation */
    function sendPasswordReset() {
        var a = d().auth;
        var s = authState();
        if (!isConfigured() || !a || typeof a.resetPassword !== "function") { return Promise.resolve(fail("not_supported")); }
        var email = (s && s.user && s.user.email) ? s.user.email : null;
        if (!email) { return Promise.resolve(fail("auth_required")); }
        return Promise.resolve(a.resetPassword(email)).then(function (res) {
            if (res && res.ok) { return { ok: true, message: "Check your email for a password-reset link." }; }
            return fail("password_update_failed", { message: res && res.message });
        }).catch(function () { return fail("password_update_failed"); });
    }

    function signOut(opts) {
        var a = d().auth;
        if (!a || typeof a.signOut !== "function") { return Promise.resolve({ ok: true }); }
        var scope = (opts && opts.scope === "global") ? "global" : "local";
        return Promise.resolve(a.signOut({ scope: scope })).then(function (res) {
            return { ok: !res || res.ok !== false, scope: scope };
        }).catch(function () { return { ok: false, code: "unknown_error" }; });
    }

    function signOutEverywhere() { return signOut({ scope: "global" }); }


    /* =====================================================
       EXPORT
       ===================================================== */

    function exportAvailable() {
        var raw = rawWalletString();
        return typeof raw === "string" && raw.length > 0;
    }

    function todayKey(nowIso) {
        try {
            var dt = new Date(nowIso || d().now());
            if (isNaN(dt.getTime())) { throw new Error("bad date"); }
            var y = dt.getFullYear();
            var m = String(dt.getMonth() + 1).padStart(2, "0");
            var da = String(dt.getDate()).padStart(2, "0");
            return y + "-" + m + "-" + da;
        } catch (e) { return "export"; }
    }

    function appVersionString() {
        var v = d().version;
        try {
            if (v && typeof v.version === "string") { return v.version; }
        } catch (e) {}
        return null;
    }

    /* Reads the RAW stored wallet string and wraps it — it does NOT call
       storage.load() (which normalizes + re-saves), so mWalletData is
       left byte-identical. */
    function exportWallet() {
        var raw = rawWalletString();
        var walletObj;
        if (typeof raw === "string" && raw.length > 0) {
            try { walletObj = JSON.parse(raw); }
            catch (e) { return fail("export_failed"); }
        } else {
            /* nothing stored yet -> export a clean default so the file is
               still valid and importable */
            var storage = d().storage;
            try { walletObj = storage && typeof storage.createDefaultData === "function" ? storage.createDefaultData() : null; }
            catch (e) { walletObj = null; }
            if (!walletObj) { return fail("no_wallet"); }
        }

        if (!isPlainObject(walletObj)) { return fail("export_failed"); }

        var createdAt = d().now();
        var envelope = {
            format: EXPORT_FORMAT,
            formatVersion: EXPORT_FORMAT_VERSION,
            createdAt: createdAt,
            appVersion: appVersionString(),
            wallet: deepClone(walletObj)
        };

        var json;
        try { json = JSON.stringify(envelope, null, 2); }
        catch (e) { return fail("export_failed"); }

        return {
            ok: true,
            filename: "m-wallet-export-" + todayKey(createdAt) + ".json",
            json: json,
            mimeType: "application/json"
        };
    }


    /* =====================================================
       IMPORT — inspect + restore
       ===================================================== */

    function importAvailable() {
        /* importing requires a place to put the wallet — the local storage
           engine — and (when configured) a positively verified owner */
        return !!d().storage && localWalletAccessGuard() == null;
    }

    function byteLength(str) {
        try {
            if (typeof TextEncoder === "function") { return new TextEncoder().encode(str).length; }
        } catch (e) {}
        return unescape(encodeURIComponent(String(str))).length;
    }

    function isPlainObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    function deepClone(v) {
        try {
            if (typeof structuredClone === "function") { return structuredClone(v); }
        } catch (e) {}
        return JSON.parse(JSON.stringify(v));
    }

    /* recursively reject prototype-pollution keys + non-finite / function
       / symbol / bigint values */
    function scanUnsafe(value) {
        var seen = [];
        function walk(v) {
            if (v === null) { return null; }
            var t = typeof v;
            if (t === "string" || t === "boolean") { return null; }
            if (t === "number") { return Number.isFinite(v) ? null : "non_finite"; }
            if (t === "function" || t === "bigint" || t === "symbol" || t === "undefined") { return "bad_type"; }
            if (t === "object") {
                if (seen.indexOf(v) !== -1) { return "cycle"; }
                seen.push(v);
                var keys = Object.keys(v);
                for (var i = 0; i < keys.length; i++) {
                    var k = keys[i];
                    if (k === "__proto__" || k === "prototype" || k === "constructor") { return "unsafe_key"; }
                    var bad = walk(v[k]);
                    if (bad) { return bad; }
                }
                seen.pop();
                return null;
            }
            return "bad_type";
        }
        return walk(value);
    }

    /* -> { ok, wrapper, wallet } | { ok:false, code } */
    function parseAndValidate(text) {
        if (typeof text !== "string") { return fail("invalid_json"); }
        if (byteLength(text) > MAX_IMPORT_BYTES) { return fail("too_large"); }

        var parsed;
        try { parsed = JSON.parse(text); }
        catch (e) { return fail("invalid_json"); }

        if (!isPlainObject(parsed)) { return fail("invalid_export"); }
        if (parsed.format !== EXPORT_FORMAT) { return fail("invalid_export"); }

        var fv = parsed.formatVersion;
        if (typeof fv !== "number" || !Number.isInteger(fv) || fv < 1) { return fail("invalid_export"); }
        if (fv > SUPPORTED_FORMAT_VERSION) { return fail("unsupported_export"); }

        var wallet = parsed.wallet;
        if (wallet === undefined || wallet === null) { return fail("missing_wallet"); }
        if (!isPlainObject(wallet)) { return fail("invalid_wallet"); }

        var unsafe = scanUnsafe(wallet);
        if (unsafe === "unsafe_key") { return fail("unsafe_keys"); }
        if (unsafe) { return fail("invalid_wallet"); }

        /* structural sanity — a real mWalletData shape */
        if (wallet.months !== undefined && !isPlainObject(wallet.months)) { return fail("invalid_wallet"); }
        var arrayFields = ["income", "expenses", "savingsGoals", "savingsTransfers"];
        for (var i = 0; i < arrayFields.length; i++) {
            var f = arrayFields[i];
            if (wallet[f] !== undefined && !Array.isArray(wallet[f])) { return fail("invalid_wallet"); }
        }
        if (wallet.settings !== undefined && !isPlainObject(wallet.settings)) { return fail("invalid_wallet"); }
        if (wallet.accounts !== undefined && !isPlainObject(wallet.accounts)) { return fail("invalid_wallet"); }
        if (wallet.cash !== undefined && !isPlainObject(wallet.cash)) { return fail("invalid_wallet"); }

        /* the local storage engine cannot safely migrate a FUTURE schema */
        var storage = d().storage;
        var localSchema = (storage && typeof storage.version === "number") ? storage.version : 5;
        if (typeof wallet.version === "number" && wallet.version > localSchema) {
            return fail("unsupported_schema");
        }

        return { ok: true, wrapper: { format: parsed.format, formatVersion: fv, createdAt: parsed.createdAt || null, appVersion: parsed.appVersion || null }, wallet: wallet };
    }

    function safeArr(v) { return Array.isArray(v) ? v : []; }

    /* a small, safe summary — counts only, never raw JSON, never notes */
    function buildPreview(wallet) {
        var months = isPlainObject(wallet.months) ? Object.keys(wallet.months) : [];
        var entries = 0;
        var billCount = 0;
        months.forEach(function (mk) {
            var m = wallet.months[mk];
            if (isPlainObject(m)) {
                entries += safeArr(m.transactions).length
                    + safeArr(m.paychecks).length
                    + safeArr(m.expenses).length
                    + safeArr(m.savingsDeposits).length;
                billCount += safeArr(m.bills).length;
            }
        });
        var cash = isPlainObject(wallet.cash) ? wallet.cash : {};
        return {
            months: months.length,
            monthEntries: entries,
            bills: billCount,
            recurringItems: safeArr(wallet.income).length + safeArr(wallet.expenses).length,
            savingsGoals: safeArr(wallet.savingsGoals).length,
            savingsTransfers: safeArr(wallet.savingsTransfers).length,
            categories: (isPlainObject(wallet.settings) && isPlainObject(wallet.settings.categories))
                ? safeArr(wallet.settings.categories.list).length : 0,
            hasMCashData: cash.initialized === true || safeArr(cash.history).length > 0,
            schemaVersion: (typeof wallet.version === "number") ? wallet.version : null,
            createdAt: null,
            appVersion: null
        };
    }

    /* inspect only — ZERO local writes */
    function inspectImport(text) {
        var res = parseAndValidate(text);
        if (!res.ok) { return res; }
        var preview = buildPreview(res.wallet);
        preview.createdAt = res.wrapper.createdAt;
        preview.appVersion = res.wrapper.appVersion;
        return { ok: true, preview: preview };
    }

    /* restore — REPLACES this device's local wallet. Requires
       { confirmed: true }.

       Safe ordering (BP10 final hardening):
         1. validate the file
         2. security: BP4 verified owner (or dev mode); mismatch blocked
         3. prepare the normalized restored wallet IN MEMORY (no write)
         4. reset stale BP8 sync metadata
         5. VERIFY the sync metadata is gone  -> abort if not
         6. only then canonical storage.save(restored wallet)
         7. verify reload
         8. non-security, fail-open UI / setup re-resolution
         9. refresh UI

       A restored wallet must never inherit an old cloud baseline, and a
       sync-metadata cleanup failure must NOT be discovered only after
       mWalletData has already been replaced. */
    function restoreWallet(text, options) {
        options = options || {};
        if (options.confirmed !== true) { return Promise.resolve(fail("confirmation_required")); }

        /* 2 — security first */
        var guard = localWalletAccessGuard();
        if (guard) { return Promise.resolve(fail("owner_mismatch")); }
        if (inRecovery()) { return Promise.resolve(fail("recovery_mode")); }
        if (busy) { return Promise.resolve(fail("busy")); }

        /* 1 — validate the file */
        var res = parseAndValidate(text);
        if (!res.ok) { return Promise.resolve(res); }

        var storage = d().storage;
        if (!storage || typeof storage.save !== "function") { return Promise.resolve(fail("import_failed")); }

        busy = true;
        return Promise.resolve().then(function () {
            /* 3 — normalized restored wallet in memory. Owner identity is
               NEVER read from the file; stray identity / auth keys a
               hand-edited file might smuggle in are stripped first. */
            var normalized;
            try {
                var toImport = stripNonFinancialKeys(deepClone(res.wallet));
                normalized = (typeof storage.normalizeData === "function")
                    ? storage.normalizeData(toImport)
                    : toImport;
            } catch (e) { normalized = null; }
            if (!normalized || typeof normalized !== "object") {
                busy = false;
                return fail("import_failed");
            }

            /* 4 + 5 — reset the BP8 sync baseline / pending / conflict
               metadata and VERIFY it is gone BEFORE touching financial
               data. If it cannot be confirmed absent, ABORT: the
               existing wallet stays authoritative and no old cloud
               revision metadata is left attached to new contents. */
            if (!resetSyncMetadata()) {
                busy = false;
                return fail("sync_reset_failed");
            }

            /* 6 — canonical save */
            var saved;
            try { saved = storage.save(normalized); }
            catch (e) { saved = false; }
            if (saved === false) {
                /* previous wallet untouched + authoritative. The stale
                   sync baseline is already gone, so a later repair uses
                   no-base rules — never a blind overwrite. */
                busy = false;
                return fail("local_storage_error");
            }

            /* 7 — verify the reload */
            var back;
            try { back = storage.load(); } catch (e) { back = null; }
            if (!back || typeof back !== "object") {
                busy = false;
                return fail("import_failed");
            }

            /* 8 — non-security, FAIL-OPEN re-resolution only. A failure
               here does NOT mean the financial restore failed. */
            reresolveOwnershipAfterRestore();
            resolveFirstRun();

            /* 9 — refresh UI */
            appRefresh();

            busy = false;
            return { ok: true, preview: buildPreview(res.wallet) };
        }).catch(function () {
            busy = false;
            return fail("import_failed");
        });
    }

    /* the wallet slice of an M-Wallet export never legitimately carries
       an owner id, an auth session, sync metadata, or setup state. If a
       hand-edited file includes one, drop it before saving — ownership
       is decided by BP4 from the signed-in user, never by the file. */
    var NON_FINANCIAL_KEYS = [
        "ownerUserId", "owner", "ownerId", "userId", "uid",
        "session", "authSession", "auth", "accessToken", "refreshToken", "token",
        "supabaseUrl", "supabaseKey", "apiKey",
        "sync", "syncState", "syncMeta",
        "setup", "setupDraft", "walkthrough", "passkeys", "passkeyMeta"
    ];
    function stripNonFinancialKeys(wallet) {
        if (wallet && typeof wallet === "object") {
            NON_FINANCIAL_KEYS.forEach(function (k) {
                try { delete wallet[k]; } catch (e) { /* ignore */ }
            });
        }
        return wallet;
    }

    function syncStateKey() {
        var ss = d().syncState;
        try { if (ss && typeof ss.KEY === "string" && ss.KEY) { return ss.KEY; } } catch (e) {}
        return "mwallet.sync.state.v1";
    }

    /* Clear the BP8 sync baseline / pending / conflict metadata, then
       VERIFY the key is actually gone. Returns false if it cannot be
       confirmed absent — callers MUST NOT then replace financial data. */
    function resetSyncMetadata() {
        var ls = d().storageArea;
        var key = syncStateKey();
        var ss = d().syncState;
        try { if (ss && typeof ss.clear === "function") { ss.clear(); } } catch (e) { /* fall through */ }
        try { if (ls && typeof ls.removeItem === "function") { ls.removeItem(key); } } catch (e) { /* verified below */ }
        try {
            if (!ls || typeof ls.getItem !== "function") { return false; }
            return ls.getItem(key) == null;
        } catch (e) { return false; }
    }

    /* The access guard already proved a positively verified BP4 owner
       (or dev mode). REUSE that record — do not rewrite it. Only
       re-establish ownership if it is somehow absent / not matching,
       and never let a failure here fail an already-saved restore. */
    function reresolveOwnershipAfterRestore() {
        var m = d().migration;
        if (!m || !isConfigured() || !isSignedIn()) { return; }
        try {
            var own = (typeof m.getOwnership === "function") ? m.getOwnership() : null;
            if (own && own.present && own.valid && own.matchesCurrentUser === true) {
                return; /* verified record still matches -> keep it as-is */
            }
            if (typeof m.ensureOwnership === "function") { m.ensureOwnership(); }
        } catch (e) { /* BP4 stays authoritative */ }
    }

    function resolveFirstRun() {
        var fr = d().firstRun;
        try {
            if (fr && typeof fr._resolve === "function") {
                var a = d().auth;
                fr._resolve(a && typeof a.getState === "function" ? a.getState() : null);
            }
        } catch (e) { /* ignore */ }
    }

    function appRefresh() {
        var app = d().app;
        try { if (app && typeof app.refresh === "function") { app.refresh(); } }
        catch (e) { /* ignore */ }
    }


    /* =====================================================
       ERASE LOCAL WALLET
       ===================================================== */

    function keyOf(mod, prop, fallback) {
        try { if (mod && typeof mod[prop] === "string" && mod[prop]) { return mod[prop]; } } catch (e) {}
        return fallback;
    }

    function dedupe(arr) {
        var out = [];
        arr.forEach(function (k) { if (k && out.indexOf(k) === -1) { out.push(k); } });
        return out;
    }

    /* Erase order preserves the REAL financial wallet as long as possible:
         A. owner-bound experience sidecars (setup / walkthrough / sync)
         B. legacy financial keys
         C. ownership metadata
         D. the primary financial key (mWalletData) — LAST
       NEVER the auth config, NEVER the Supabase session key, NEVER
       unrelated site data, NEVER localStorage.clear(). */
    function orderedEraseTargets() {
        var before = dedupe([
            /* A */
            keyOf(d().firstRun, "SETUP_KEY", "mwallet.setup.v1"),
            keyOf(d().firstRun, "DRAFT_KEY", "mwallet.setup.draft.v1"),
            keyOf(d().walkthrough, "RECORD_KEY", "mwallet.walkthrough.v1"),
            keyOf(d().walkthrough, "PROGRESS_KEY", "mwallet.walkthrough.progress.v1"),
            keyOf(d().syncState, "KEY", "mwallet.sync.state.v1"),
            /* B */
            "budgetTrackerData", "budgetTrackerMoneyEntries", "mWalletMoneyEntries",
            /* C */
            keyOf(d().migration, "OWNER_KEY", "mwallet.local.owner.v1")
        ]);
        return { before: before, primary: STORAGE_KEY, all: dedupe(before.concat([STORAGE_KEY])) };
    }

    /* the full target set — for diagnostics + the UI/tests */
    function eraseTargets() { return orderedEraseTargets().all; }

    /* remove one key and return true iff it is verifiably gone afterwards */
    function removeAndVerify(ls, key) {
        try { ls.removeItem(key); } catch (e) { /* the verify below is the source of truth */ }
        var present;
        try { present = ls.getItem(key); } catch (e) { present = "?"; }
        return present == null;
    }

    function eraseLocalWallet(options) {
        options = options || {};
        if (String(options.phrase || "").trim().toUpperCase() !== ERASE_PHRASE) {
            return Promise.resolve(fail("confirmation_required"));
        }
        var ls = d().storageArea;
        if (!ls || typeof ls.removeItem !== "function") { return Promise.resolve(fail("local_storage_error")); }
        if (busy) { return Promise.resolve(fail("busy")); }
        busy = true;

        var plan = orderedEraseTargets();

        return Promise.resolve().then(function () {
            /* A/B/C — every NON-primary key first, verifying each. If ANY
               of these fails, STOP: mWalletData is left untouched. An
               erase failure must preferentially keep the financial
               wallet, not delete it and discover cleanup failed later. */
            var stuck = [];
            for (var i = 0; i < plan.before.length; i++) {
                if (!removeAndVerify(ls, plan.before[i])) { stuck.push(plan.before[i]); }
            }
            if (stuck.length) {
                busy = false;
                return fail("erase_incomplete", { remaining: stuck.length, walletPreserved: true });
            }

            /* D — the primary financial key, LAST */
            var primaryGone = removeAndVerify(ls, plan.primary);

            /* verify EVERYTHING again before any success claim */
            var left = [];
            plan.all.forEach(function (key) {
                var present;
                try { present = ls.getItem(key); } catch (e) { present = "?"; }
                if (present != null) { left.push(key); }
            });
            if (!primaryGone || left.length) {
                busy = false;
                return fail("erase_incomplete", { remaining: left.length || 1 });
            }

            /* financial erase VERIFIED complete. Do NOT refresh the app
               or re-resolve BP4/BP5 here — that would recreate a wallet.
               Just sign out so the flow ends at the auth / welcome
               state. */
            var a = d().auth;
            if (!a || typeof a.signOut !== "function") {
                busy = false;
                return { ok: true, erased: true, erasedKeys: plan.all.length, signedOut: false };
            }
            return Promise.resolve(a.signOut({ scope: "local" })).then(function (res) {
                busy = false;
                if (res && res.ok === false) {
                    /* the wallet IS gone; only sign-out did not finish.
                       Tell the truth — never imply the wallet still
                       exists, and never recreate it to "roll back". */
                    return { ok: false, code: "erased_signout_failed", erased: true };
                }
                return { ok: true, erased: true, erasedKeys: plan.all.length, signedOut: true };
            }).catch(function () {
                busy = false;
                return { ok: false, code: "erased_signout_failed", erased: true };
            });
        }).catch(function () {
            busy = false;
            return fail("erase_failed");
        });
    }


    global.MWalletAccount = {
        EXPORT_FORMAT: EXPORT_FORMAT,
        EXPORT_FORMAT_VERSION: EXPORT_FORMAT_VERSION,
        MAX_IMPORT_BYTES: MAX_IMPORT_BYTES,
        ERASE_PHRASE: ERASE_PHRASE,
        ERROR_CODES: CODES.slice(),

        getSummary: getSummary,
        diagnostics: diagnostics,
        accountDeletionStatus: accountDeletionStatus,

        changeEmail: changeEmail,
        sendPasswordReset: sendPasswordReset,
        signOut: signOut,
        signOutEverywhere: signOutEverywhere,

        exportAvailable: exportAvailable,
        exportWallet: exportWallet,

        importAvailable: importAvailable,
        inspectImport: inspectImport,
        restoreWallet: restoreWallet,

        eraseTargets: eraseTargets,
        eraseLocalWallet: eraseLocalWallet,

        /* test-only */
        configureForTest: configureForTest
    };

})(typeof window !== "undefined" ? window : this);
