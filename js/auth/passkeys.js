"use strict";

/* =========================================================
   M-WALLET — PASSKEY AUTH ADAPTER   (BP9)

       window.MWalletPasskeys

   A narrow, safe wrapper over the (experimental) Supabase
   passkey / WebAuthn API in the vendored client (2.112.4):

       client.auth.signInWithPasskey()
       client.auth.registerPasskey()
       client.auth.passkey.list()
       client.auth.passkey.update({ passkeyId, friendlyName })
       client.auth.passkey.delete({ passkeyId })

   Design rules:
     - NO DOM. (passkey-ui.js owns presentation.)
     - Reuses the ONE existing Supabase client via
       MWalletAuth._getClient(). Never createClient(), never a
       token, never an Authorization header, never a direct
       fetch to GoTrue.
     - The high-level Supabase methods own the WebAuthn
       ceremony — this module NEVER calls
       navigator.credentials.create / .get itself.
     - Governed by MWalletPasskeyRelease: while the release
       gate is off (the committed BP9 default) EVERY method is
       a safe no-op that makes ZERO API / WebAuthn calls.
     - Passkeys answer "who is signing in?" only. This module
       has ZERO knowledge of mWalletData, wallet_documents,
       balances, transactions, M-Cash, or BP8 sync.
     - Never returns or logs: a raw session, access/refresh
       token, raw WebAuthn credential, challenge, credential
       binary, or a raw Supabase error. Credential IDs are
       used transiently (the API needs them) and never logged
       or surfaced to normal users.
   ========================================================= */

(function (global) {

    var NAME_MAX = 120;

    /* safe, fixed error codes — never a raw browser / Supabase error */
    var CODES = [
        "disabled", "not_configured", "unsupported", "insecure_context",
        "recovery_mode", "signed_out", "not_confirmed", "anonymous",
        "user_cancelled", "no_passkey_available", "project_not_enabled",
        "network_error", "auth_failed", "management_failed", "invalid_name",
        "busy", "unknown_error"
    ];

    /* ---- dependency resolution (overridable for tests) ---- */

    var deps = null;

    function d() {
        if (deps) { return deps; }
        return {
            release: safeGlobal("MWalletPasskeyRelease"),
            auth: safeGlobal("MWalletAuth"),
            /* the live WebAuthn feature probe — injectable so tests are
               deterministic; production reads the real browser */
            webauthn: defaultWebAuthnProbe
        };
    }

    function safeGlobal(name) {
        try { return global[name] || null; } catch (e) { return null; }
    }

    function configureForTest(overrides) {
        if (overrides == null) { deps = null; return; }
        deps = Object.assign({}, d(), overrides);
    }


    /* ---- capability detection (BP9.5 / BP9.6) ---- */

    function defaultWebAuthnProbe() {
        var out = {
            webAuthnSupported: false,
            secureContext: false,
            platformAuthenticatorHint: null   /* diagnostic only — never gates passkeys */
        };
        try {
            out.secureContext = (typeof global.isSecureContext === "boolean")
                ? global.isSecureContext === true
                : true; /* non-browser test context: don't fail closed on this alone */
            out.webAuthnSupported = !!(
                typeof global.PublicKeyCredential !== "undefined" &&
                global.PublicKeyCredential &&
                typeof navigator !== "undefined" &&
                navigator.credentials &&
                typeof navigator.credentials.create === "function" &&
                typeof navigator.credentials.get === "function"
            );
        } catch (e) { /* leave defaults */ }
        return out;
    }

    function client() {
        var a = d().auth;
        try {
            if (a && typeof a._getClient === "function") { return a._getClient() || null; }
        } catch (e) { /* ignore */ }
        return null;
    }

    function authState() {
        var a = d().auth;
        try { return (a && typeof a.getState === "function") ? a.getState() : null; }
        catch (e) { return null; }
    }

    function releaseEnabled() {
        var r = d().release;
        try { return !!(r && typeof r.isEnabled === "function" && r.isEnabled()); }
        catch (e) { return false; }
    }

    function getCapabilities() {
        var probe;
        try { probe = d().webauthn(); } catch (e) { probe = defaultWebAuthnProbe(); }
        var c = client();
        var passkeyApiSupported = !!(
            c && c.auth &&
            typeof c.auth.signInWithPasskey === "function" &&
            typeof c.auth.registerPasskey === "function"
        );
        var managementApiSupported = !!(
            c && c.auth && c.auth.passkey &&
            typeof c.auth.passkey.list === "function" &&
            typeof c.auth.passkey.update === "function" &&
            typeof c.auth.passkey.delete === "function"
        );
        var s = authState();
        var configured = !!(s && s.configured === true);

        return {
            releaseEnabled: releaseEnabled(),
            webAuthnSupported: probe.webAuthnSupported === true,
            secureContext: probe.secureContext === true,
            configured: configured,
            passkeyApiSupported: passkeyApiSupported,
            managementApiSupported: managementApiSupported,
            platformAuthenticatorHint:
                (probe.platformAuthenticatorHint === undefined ? null : probe.platformAuthenticatorHint),
            /* the single "can M-Wallet offer passkeys right now?" answer */
            available: releaseEnabled() && configured && passkeyApiSupported &&
                probe.webAuthnSupported === true && probe.secureContext === true
        };
    }


    /* ---- guards ---- */

    /* returns a safe CODE string when passkeys must NOT run, else null */
    function guardSignIn() {
        if (!releaseEnabled()) { return "disabled"; }
        var s = authState();
        if (!s || s.configured !== true) { return "not_configured"; }
        if (s.recoveryMode === true) { return "recovery_mode"; }
        if (s.status === "error") { return "auth_failed"; }
        var caps = getCapabilities();
        if (!caps.webAuthnSupported) { return "unsupported"; }
        if (!caps.secureContext) { return "insecure_context"; }
        if (!caps.passkeyApiSupported) { return "unsupported"; }
        if (!client()) { return "not_configured"; }
        return null;
    }

    function guardRegister() {
        if (!releaseEnabled()) { return "disabled"; }
        var s = authState();
        if (!s || s.configured !== true) { return "not_configured"; }
        if (s.recoveryMode === true) { return "recovery_mode"; }
        if (s.status !== "signed_in") { return "signed_out"; }
        if (!s.user || !s.user.id) { return "signed_out"; }
        if (s.user.isAnonymous === true) { return "anonymous"; }
        if (s.user.confirmed === false) { return "not_confirmed"; }
        var caps = getCapabilities();
        if (!caps.webAuthnSupported) { return "unsupported"; }
        if (!caps.secureContext) { return "insecure_context"; }
        if (!caps.passkeyApiSupported) { return "unsupported"; }
        if (!client()) { return "not_configured"; }
        return null;
    }

    function guardManage() {
        if (!releaseEnabled()) { return "disabled"; }
        var s = authState();
        if (!s || s.configured !== true) { return "not_configured"; }
        if (s.recoveryMode === true) { return "recovery_mode"; }
        if (s.status !== "signed_in") { return "signed_out"; }
        var caps = getCapabilities();
        if (!caps.managementApiSupported) { return "unsupported"; }
        if (!client()) { return "not_configured"; }
        return null;
    }


    /* ---- error mapping (raw -> safe code) ---- */

    function mapError(err) {
        if (!err) { return "unknown_error"; }
        var name = String(err.name || "");
        var code = String(err.code || "");
        var msg = String(err.message || err.error_description || err.msg || "").toLowerCase();
        var status = Number(err.status || err.statusCode);

        if (name === "AbortError" || name === "NotAllowedError" ||
            msg.indexOf("cancel") !== -1 || msg.indexOf("aborted") !== -1 ||
            msg.indexOf("timed out") !== -1 || msg.indexOf("not allowed") !== -1) {
            /* NotAllowedError is the common cancel/timeout/no-credential signal;
               treat it as a user cancellation rather than a scary failure */
            return "user_cancelled";
        }
        if (name === "InvalidStateError" || msg.indexOf("no passkey") !== -1 ||
            msg.indexOf("no credential") !== -1 || msg.indexOf("no available authenticator") !== -1) {
            return "no_passkey_available";
        }
        if (name === "NotSupportedError" || name === "SecurityError" ||
            msg.indexOf("does not support webauthn") !== -1 || msg.indexOf("not support") !== -1) {
            return "unsupported";
        }
        if (msg.indexOf("experimental") !== -1 || msg.indexOf("disabled by default") !== -1 ||
            msg.indexOf("passkey") !== -1 && msg.indexOf("not enabled") !== -1 ||
            msg.indexOf("feature") !== -1 && msg.indexOf("disabled") !== -1 || status === 404) {
            return "project_not_enabled";
        }
        if (status === 401 || status === 403 || code === "PGRST301" ||
            msg.indexOf("jwt") !== -1 || msg.indexOf("unauthorized") !== -1) {
            return "auth_failed";
        }
        if (msg.indexOf("failed to fetch") !== -1 || msg.indexOf("networkerror") !== -1 ||
            msg.indexOf("network") !== -1 || name === "TypeError" || msg.indexOf("load failed") !== -1) {
            return "network_error";
        }
        return "unknown_error";
    }

    function fail(code) {
        var safe = CODES.indexOf(code) !== -1 ? code : "unknown_error";
        lastError = { code: safe };
        return { ok: false, code: safe };
    }


    /* ---- state ---- */

    var initialized = false;
    var busy = false;
    var lastError = null;
    var lastList = null;   /* in-memory only — never persisted */

    function initialize() {
        /* NO network, NO WebAuthn, NO API call. Marker only. */
        initialized = true;
        return Promise.resolve(getState());
    }

    function getState() {
        var caps = getCapabilities();
        var s = authState();
        return {
            releaseEnabled: caps.releaseEnabled,
            available: caps.available,
            supported: caps.webAuthnSupported && caps.passkeyApiSupported,
            secureContext: caps.secureContext,
            configured: caps.configured,
            signedIn: !!(s && s.status === "signed_in"),
            recoveryMode: !!(s && s.recoveryMode === true),
            busy: busy,
            initialized: initialized,
            registeredCount: (lastList && Array.isArray(lastList)) ? lastList.length : null,
            lastError: lastError ? { code: lastError.code } : null
        };
    }

    /* NO email, user id, passkey id, credential id, token, or raw error. */
    function diagnostics() {
        var caps = getCapabilities();
        var s = authState();
        return {
            releaseEnabled: caps.releaseEnabled,
            releasePhase: (function () { try { return d().release.getState().verificationPhase; } catch (e) { return null; } })(),
            webAuthnSupported: caps.webAuthnSupported,
            secureContext: caps.secureContext,
            passkeyApiSupported: caps.passkeyApiSupported,
            managementApiSupported: caps.managementApiSupported,
            configured: caps.configured,
            signedIn: !!(s && s.status === "signed_in"),
            available: caps.available,
            busy: busy,
            initialized: initialized,
            registeredCount: getState().registeredCount,
            lastError: lastError ? { code: lastError.code } : null
        };
    }


    /* ---- sign in (passwordless, discoverable credential) ---- */

    function signIn() {
        var g = guardSignIn();
        if (g) { return Promise.resolve(fail(g)); }
        if (busy) { return Promise.resolve(fail("busy")); }
        busy = true;

        var c = client();
        return Promise.resolve()
            .then(function () { return c.auth.signInWithPasskey(); })
            .then(function (res) {
                busy = false;
                if (res && res.error) { return fail(mapError(res.error)); }
                /* SUCCESS: do NOT touch the session ourselves. Supabase has set
                   it and will fire onAuthStateChange -> the BP2/BP3 auth
                   pipeline moves the app to signed_in and the normal gate
                   chain (BP4 -> BP8 -> BP5 -> BP6) runs. */
                lastError = null;
                return { ok: true };
            })
            .catch(function (e) {
                busy = false;
                return fail(mapError(e));
            });
    }


    /* ---- register (enroll a passkey for the signed-in user) ---- */

    function register(friendlyName) {
        var g = guardRegister();
        if (g) { return Promise.resolve(fail(g)); }
        if (busy) { return Promise.resolve(fail("busy")); }

        var name = normalizeName(friendlyName);
        if (friendlyName != null && name == null) { return Promise.resolve(fail("invalid_name")); }

        busy = true;
        var c = client();
        var opts = name ? { friendlyName: name } : undefined;
        return Promise.resolve()
            .then(function () { return c.auth.registerPasskey(opts); })
            .then(function (res) {
                busy = false;
                if (res && res.error) { return fail(mapError(res.error)); }
                lastError = null;
                /* refresh the in-memory list so the UI can show the new passkey */
                return refreshList().then(function () { return { ok: true }; });
            })
            .catch(function (e) {
                busy = false;
                return fail(mapError(e));
            });
    }


    /* ---- management: list / rename / remove ---- */

    function safePasskeyView(row) {
        if (!row || typeof row !== "object") { return null; }
        var id = row.id || row.passkey_id || row.credential_id || row.credentialId || null;
        return {
            /* an opaque handle the UI uses for rename/remove — never shown as
               text, never logged */
            _ref: id != null ? String(id) : null,
            friendlyName: safeName(row.friendly_name || row.friendlyName || row.name || ""),
            createdAt: safeDate(row.created_at || row.createdAt || null),
            lastUsedAt: safeDate(row.last_used_at || row.lastUsedAt || row.last_used || null)
        };
    }

    function normalizeRows(data) {
        var rows = null;
        if (Array.isArray(data)) { rows = data; }
        else if (data && Array.isArray(data.passkeys)) { rows = data.passkeys; }
        else if (data && Array.isArray(data.credentials)) { rows = data.credentials; }
        else if (data && Array.isArray(data.data)) { rows = data.data; }
        return (rows || []).map(safePasskeyView).filter(Boolean);
    }

    function refreshList() {
        var c = client();
        if (!c || !c.auth || !c.auth.passkey || typeof c.auth.passkey.list !== "function") {
            return Promise.resolve({ ok: false, code: "unsupported" });
        }
        return Promise.resolve()
            .then(function () { return c.auth.passkey.list(); })
            .then(function (res) {
                if (res && res.error) { return fail(mapError(res.error)); }
                lastList = normalizeRows(res && res.data);
                return { ok: true, passkeys: lastList.slice() };
            })
            .catch(function (e) { return fail(mapError(e)); });
    }

    function list(options) {
        var g = guardManage();
        if (g) { return Promise.resolve(fail(g)); }
        options = options || {};
        if (options.useCache === true && lastList) {
            return Promise.resolve({ ok: true, passkeys: lastList.slice() });
        }
        return refreshList();
    }

    function rename(passkeyRef, friendlyName) {
        var g = guardManage();
        if (g) { return Promise.resolve(fail(g)); }
        if (busy) { return Promise.resolve(fail("busy")); }
        if (typeof passkeyRef !== "string" || !passkeyRef) { return Promise.resolve(fail("management_failed")); }
        var name = normalizeName(friendlyName);
        if (name == null) { return Promise.resolve(fail("invalid_name")); }

        busy = true;
        var c = client();
        return Promise.resolve()
            .then(function () { return c.auth.passkey.update({ passkeyId: passkeyRef, friendlyName: name }); })
            .then(function (res) {
                busy = false;
                if (res && res.error) { return fail(mapError(res.error) === "unknown_error" ? "management_failed" : mapError(res.error)); }
                lastError = null;
                return refreshList().then(function () { return { ok: true }; });
            })
            .catch(function (e) {
                busy = false;
                var code = mapError(e);
                return fail(code === "unknown_error" ? "management_failed" : code);
            });
    }

    function remove(passkeyRef) {
        var g = guardManage();
        if (g) { return Promise.resolve(fail(g)); }
        if (busy) { return Promise.resolve(fail("busy")); }
        if (typeof passkeyRef !== "string" || !passkeyRef) { return Promise.resolve(fail("management_failed")); }

        busy = true;
        var c = client();
        return Promise.resolve()
            .then(function () { return c.auth.passkey.delete({ passkeyId: passkeyRef }); })
            .then(function (res) {
                busy = false;
                if (res && res.error) {
                    var code = mapError(res.error);
                    return fail(code === "unknown_error" ? "management_failed" : code);
                }
                lastError = null;
                /* server delete succeeded -> refresh, then the UI re-renders
                   from the refreshed list (no optimistic removal) */
                return refreshList().then(function () { return { ok: true }; });
            })
            .catch(function (e) {
                busy = false;
                var code = mapError(e);
                return fail(code === "unknown_error" ? "management_failed" : code);
            });
    }


    /* ---- helpers ---- */

    function normalizeName(name) {
        if (name == null) { return null; }
        var text = String(name).replace(/\s+/g, " ").trim();
        if (!text) { return null; }
        if (text.length > NAME_MAX) { text = text.slice(0, NAME_MAX).trim(); }
        /* must contain at least one visible character */
        if (!/\S/.test(text)) { return null; }
        return text;
    }

    function safeName(name) {
        var text = String(name == null ? "" : name).replace(/\s+/g, " ").trim();
        if (!text) { return "Passkey"; }
        return text.length > NAME_MAX ? text.slice(0, NAME_MAX) : text;
    }

    function safeDate(value) {
        if (!value) { return null; }
        try {
            var dt = new Date(value);
            if (isNaN(dt.getTime())) { return null; }
            return dt.toISOString();
        } catch (e) { return null; }
    }


    global.MWalletPasskeys = {
        NAME_MAX: NAME_MAX,
        ERROR_CODES: CODES.slice(),

        initialize: initialize,
        getState: getState,
        getCapabilities: getCapabilities,
        diagnostics: diagnostics,

        signIn: signIn,
        register: register,
        list: list,
        rename: rename,
        remove: remove,

        /* test-only */
        configureForTest: configureForTest
    };

    /* boot marker only — NO network, NO WebAuthn, NO API call */
    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { initialize(); });
        } else {
            initialize();
        }
    }

})(typeof window !== "undefined" ? window : this);
