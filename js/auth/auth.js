"use strict";

/* =========================================================
   M-WALLET — AUTHENTICATION CORE   (BP2)

   The single public entry point for everything auth-related:

       window.MWalletAuth

   BP2 scope = infrastructure only. This module:
     - resolves configuration (via auth-config.js)
     - lazily builds the Supabase client (via auth-client.js)
     - restores an existing session if one is stored
     - keeps ONE controlled auth-event listener
     - exposes an explicit, observable auth state
     - fails safe: an unconfigured / offline / broken auth
       layer never blocks or alters the local financial app

   BP2 does NOT: render any account UI, create cloud tables,
   move financial data anywhere, or add passkeys. Sign-up /
   sign-in flows arrive in BP3 through the extension points
   at the bottom of this file.

   ---------------------------------------------------------
   STATE MODEL
     unconfigured  - no usable Supabase config; local-only mode.
                     Also the safe landing state when a secret /
                     service_role / unrecognized key is supplied
                     in browser config (it is refused, not used).
                     `configIssue` then carries a short, safe
                     reason string.
     initializing  - config present, restoring session
     signed_out    - configured, no active session
     signed_in     - configured, active session restored
     error         - auth layer could not initialize (runtime:
                     library/network failure) — never used for a
                     configuration problem
   Only 'signed_in' ever means "authenticated".
   ---------------------------------------------------------

   STARTUP / BOOT ORDER  (see index.html script block)
     1. app-version.js
     2. auth/auth-config.js      -> window.MWalletAuthConfigResolved
     3. auth/auth-client.js      -> window.MWalletAuthClient
     4. auth/auth.js  (this)     -> window.MWalletAuth, schedules initialize()
     5. storage.js ... app.js ... (financial app — fully synchronous)

   initialize() is scheduled for DOMContentLoaded and runs
   detached. The financial UI renders synchronously and never
   awaits it, so there is no blank screen and no race: auth
   state simply transitions from 'initializing' to a terminal
   state whenever it is ready, and subscribers are notified.

   DIAGNOSTICS
     Console output is silent unless MWalletAuth.debug === true,
     and even then only non-sensitive strings are logged —
     never tokens, passwords, session objects, email contents,
     or any financial data.
   ========================================================= */

(function (global) {

    var STATE = {
        UNCONFIGURED: "unconfigured",
        INITIALIZING: "initializing",
        SIGNED_OUT: "signed_out",
        SIGNED_IN: "signed_in",
        ERROR: "error"
    };

    var current = {
        status: STATE.INITIALIZING,
        configured: false,
        provider: "supabase",
        user: null,        /* { id, email } only */
        session: null,     /* safe summary — never tokens */
        error: null,       /* { code, message } — never secrets */
        configIssue: null, /* short safe reason if browser config was refused */
        online: readOnline()
    };

    var subscribers = [];
    var client = null;
    var authEventSub = null;        /* the ONE Supabase listener handle */
    var initPromise = null;
    var deferredForOffline = false;
    var connectivityBound = false;
    var warnedConfigIssue = false;


    /* ---- helpers -------------------------------------------------- */

    function readOnline() {
        try {
            return (typeof navigator !== "undefined" &&
                typeof navigator.onLine === "boolean")
                ? navigator.onLine
                : true;
        } catch (error) {
            return true;
        }
    }

    function debugEnabled() {
        return Boolean(api && api.debug === true) && typeof console !== "undefined";
    }

    /* Contract: `message` is a hand-written non-sensitive string.
       Callers never pass tokens, sessions, emails, or amounts. */
    function debugLog(message) {
        if (debugEnabled()) {
            console.info("[auth] " + message);
        }
    }

    /* A refused browser configuration is an actionable mistake,
       not normal operation, so it warns once regardless of the
       debug flag. The reason is a fixed safe token — never a key,
       URL, or any part of the supplied value. */
    function warnConfigIssueOnce(reason) {
        if (warnedConfigIssue || typeof console === "undefined") {
            return;
        }
        warnedConfigIssue = true;
        var explain = {
            "secret-key":
                "a Supabase secret key (sb_secret_…) — that key is server-only",
            "service-role-key":
                "a Supabase service_role key — that key is server-only",
            "unrecognized-key-format":
                "an unrecognized key format"
        }[reason] || "a non-publishable key";
        console.warn(
            "[auth] browser authentication configuration was ignored: it contains " +
            explain + ". Use a publishable key (sb_publishable_…) or a legacy anon key. " +
            "Running in local-only mode."
        );
    }

    function safeUser(user) {
        if (!user) {
            return null;
        }
        return { id: user.id || null, email: user.email || null };
    }

    /* A deliberately reduced view of a session: enough to know
       who is signed in and when it expires, and nothing that
       could be replayed. Access / refresh tokens never leave
       the Supabase client. */
    function safeSession(session) {
        if (!session) {
            return null;
        }
        return {
            active: true,
            userId: (session.user && session.user.id) || null,
            email: (session.user && session.user.email) || null,
            expiresAt: session.expires_at ? Number(session.expires_at) : null
        };
    }

    function shortMessage(error, fallback) {
        var message = error && error.message
            ? String(error.message)
            : (fallback || "Authentication error");
        return message.length > 160 ? message.slice(0, 157) + "…" : message;
    }

    function snapshot() {
        return {
            status: current.status,
            configured: current.configured,
            provider: current.provider,
            isAuthenticated: current.status === STATE.SIGNED_IN,
            user: current.user
                ? { id: current.user.id, email: current.user.email }
                : null,
            session: current.session
                ? {
                    active: current.session.active,
                    userId: current.session.userId,
                    email: current.session.email,
                    expiresAt: current.session.expiresAt
                }
                : null,
            error: current.error
                ? { code: current.error.code, message: current.error.message }
                : null,
            configIssue: current.configIssue,
            online: current.online
        };
    }

    function notify() {
        var snap = snapshot();
        for (var i = 0; i < subscribers.length; i++) {
            try {
                subscribers[i](snap);
            } catch (error) {
                /* a broken subscriber must never break auth */
            }
        }
    }

    function patch(next) {
        var changed = false;
        for (var key in next) {
            if (!Object.prototype.hasOwnProperty.call(next, key)) {
                continue;
            }
            var before = current[key];
            var after = next[key];
            var equal =
                before === after ||
                ((key === "user" || key === "session" || key === "error") &&
                    JSON.stringify(before) === JSON.stringify(after));
            if (!equal) {
                current[key] = after;
                changed = true;
            }
        }
        if (changed) {
            notify();
        }
    }


    /* ---- config ------------------------------------------------- */

    function resolvedConfig() {
        return global.MWalletAuthConfigResolved || {
            provider: "supabase",
            isConfigured: false,
            keyType: null,
            keyRejected: false,
            rejectedServiceRoleKey: false,
            keyProblem: null,
            getPublicConfig: function () { return null; }
        };
    }


    /* ---- client ------------------------------------------------- */

    function ensureClient() {
        if (client) {
            return Promise.resolve(client);
        }
        if (!global.MWalletAuthClient) {
            return Promise.reject(new Error("auth: client factory unavailable"));
        }
        var publicConfig = resolvedConfig().getPublicConfig();
        if (!publicConfig) {
            return Promise.reject(new Error("auth: not configured"));
        }
        return global.MWalletAuthClient.createClient(publicConfig).then(function (built) {
            client = built;
            return client;
        });
    }


    /* ---- the single auth-event listener ------------------------ */

    function wireAuthEvents() {
        if (!client || authEventSub) {
            return;   /* exactly one listener for the app's lifetime */
        }
        try {
            var result = client.auth.onAuthStateChange(function (event, session) {
                handleAuthEvent(event, session);
            });
            authEventSub =
                (result && result.data && result.data.subscription)
                    ? result.data.subscription
                    : result;
            debugLog("auth-event listener attached");
        } catch (error) {
            debugLog("could not attach auth-event listener");
        }
    }

    function handleAuthEvent(event, session) {
        switch (event) {
            case "SIGNED_OUT":
                patch({
                    status: STATE.SIGNED_OUT,
                    user: null,
                    session: null,
                    error: null
                });
                break;

            case "SIGNED_IN":
            case "TOKEN_REFRESHED":
            case "USER_UPDATED":
            case "INITIAL_SESSION":
                if (session && session.user) {
                    patch({
                        status: STATE.SIGNED_IN,
                        user: safeUser(session.user),
                        session: safeSession(session),
                        error: null
                    });
                } else if (event === "INITIAL_SESSION") {
                    patch({
                        status: STATE.SIGNED_OUT,
                        user: null,
                        session: null
                    });
                }
                break;

            default:
                break;
        }
        debugLog("event: " + String(event));
    }


    /* ---- connectivity ---------------------------------------- */

    function bindConnectivity() {
        if (connectivityBound || typeof global.addEventListener !== "function") {
            return;
        }
        connectivityBound = true;

        global.addEventListener("online", function () {
            patch({ online: true });
            if (current.configured && deferredForOffline) {
                deferredForOffline = false;
                /* exactly one reconciliation attempt — never a loop */
                reconcileSession("reconnect");
            }
        });

        global.addEventListener("offline", function () {
            patch({ online: false });
        });
    }

    /* Re-read the session once (e.g. after regaining connectivity).
       Never deletes a stored session or financial data on failure. */
    function reconcileSession(reason) {
        if (!current.configured) {
            return Promise.resolve();
        }
        return ensureClient()
            .then(function () {
                wireAuthEvents();
                return client.auth.getSession();
            })
            .then(function (result) {
                var session = result && result.data ? result.data.session : null;
                if (session && session.user) {
                    patch({
                        status: STATE.SIGNED_IN,
                        user: safeUser(session.user),
                        session: safeSession(session),
                        error: null
                    });
                } else {
                    patch({
                        status: STATE.SIGNED_OUT,
                        user: null,
                        session: null,
                        error: null
                    });
                }
                debugLog("session reconciled (" + reason + ")");
            })
            .catch(function (error) {
                patch({
                    status: STATE.ERROR,
                    error: {
                        code: "session_unavailable",
                        message: shortMessage(error, "Could not reach the sign-in service")
                    }
                });
                debugLog("session reconcile failed (" + reason + ")");
            });
    }


    /* ---- initialize (idempotent, non-blocking) --------------- */

    function initialize() {
        if (initPromise) {
            return initPromise;
        }

        bindConnectivity();

        var config = resolvedConfig();

        /* Fail-safe: a secret / service_role / unrecognized key was
           supplied in browser config. Refuse it and land in the
           safe unconfigured state — the local app is never blocked
           and no key value is logged. */
        if (config.keyRejected || config.rejectedServiceRoleKey) {
            var reason = config.keyProblem || "unrecognized-key-format";
            patch({
                status: STATE.UNCONFIGURED,
                configured: false,
                configIssue: reason,
                error: null
            });
            warnConfigIssueOnce(reason);
            debugLog("browser config refused (" + reason + ") — running local-only");
            initPromise = Promise.resolve(snapshot());
            return initPromise;
        }

        /* AUTH UNCONFIGURED — the current default. The local
           financial app is completely unaffected. */
        if (!config.isConfigured) {
            patch({ status: STATE.UNCONFIGURED, configured: false, configIssue: null, error: null });
            debugLog("no Supabase configuration — running local-only");
            initPromise = Promise.resolve(snapshot());
            return initPromise;
        }

        patch({ status: STATE.INITIALIZING, configured: true, configIssue: null, error: null });

        /* Offline at startup: restore from the persisted session
           only. Never force a network call, never delete anything;
           reconcile once when connectivity returns. */
        if (!current.online) {
            deferredForOffline = true;
            initPromise = ensureClient()
                .then(function () {
                    wireAuthEvents();
                    return client.auth.getSession();
                })
                .then(function (result) {
                    var session = result && result.data ? result.data.session : null;
                    if (session && session.user) {
                        patch({
                            status: STATE.SIGNED_IN,
                            user: safeUser(session.user),
                            session: safeSession(session),
                            error: null
                        });
                    } else {
                        patch({ status: STATE.SIGNED_OUT, user: null, session: null });
                    }
                    debugLog("offline startup — restored from stored session");
                    return snapshot();
                })
                .catch(function (error) {
                    patch({
                        status: STATE.ERROR,
                        error: {
                            code: "offline_init",
                            message: shortMessage(error, "Offline — sign-in unavailable")
                        }
                    });
                    debugLog("offline startup — client unavailable, will retry on reconnect");
                    return snapshot();
                });
            return initPromise;
        }

        initPromise = ensureClient()
            .then(function () {
                wireAuthEvents();
                return client.auth.getSession();
            })
            .then(function (result) {
                var session = result && result.data ? result.data.session : null;
                if (session && session.user) {
                    patch({
                        status: STATE.SIGNED_IN,
                        user: safeUser(session.user),
                        session: safeSession(session),
                        error: null
                    });
                    debugLog("session restored");
                } else {
                    patch({
                        status: STATE.SIGNED_OUT,
                        user: null,
                        session: null,
                        error: null
                    });
                    debugLog("no active session");
                }
                return snapshot();
            })
            .catch(function (error) {
                patch({
                    status: STATE.ERROR,
                    error: {
                        code: "init_failed",
                        message: shortMessage(error, "Sign-in service unavailable")
                    }
                });
                debugLog("initialization failed");
                return snapshot();
            });

        return initPromise;
    }


    /* ---- public read API ------------------------------------ */

    function getState() { return snapshot(); }
    function getStatus() { return current.status; }
    function isConfigured() { return current.configured; }
    function isAuthenticated() { return current.status === STATE.SIGNED_IN; }
    function getUser() { return snapshot().user; }
    function getSession() { return snapshot().session; }
    function whenReady() { return initPromise || initialize(); }

    function subscribe(listener) {
        if (typeof listener !== "function") {
            return function () {};
        }
        subscribers.push(listener);
        try {
            listener(snapshot());
        } catch (error) {
            /* ignore a throwing first call */
        }
        return function unsubscribe() {
            var index = subscribers.indexOf(listener);
            if (index !== -1) {
                subscribers.splice(index, 1);
            }
        };
    }


    /* ---- actions ------------------------------------------- */

    function signOut() {
        if (!current.configured || !client) {
            /* nothing to sign out of; never touch financial data */
            if (current.configured) {
                patch({ status: STATE.SIGNED_OUT, user: null, session: null });
            }
            return Promise.resolve({ ok: true });
        }
        return client.auth.signOut()
            .then(function () {
                patch({
                    status: STATE.SIGNED_OUT,
                    user: null,
                    session: null,
                    error: null
                });
                return { ok: true };
            })
            .catch(function (error) {
                /* clear our view regardless; the Supabase client
                   clears its own persisted session */
                patch({ status: STATE.SIGNED_OUT, user: null, session: null });
                return { ok: false, message: shortMessage(error, "Sign-out problem") };
            });
    }


    /* ---- BP3 extension points ------------------------------ */
    /* Deliberately unimplemented in BP2. BP3 builds sign-up /
       sign-in / recovery flows here (or in a sibling module that
       calls MWalletAuth._getClient()). Calling them now fails
       loudly instead of silently doing nothing. */

    function notAvailableYet(name) {
        return Promise.reject(new Error(
            "MWalletAuth." + name + "() arrives with the account UI (BP3)."
        ));
    }

    function signUp() { return notAvailableYet("signUp"); }
    function signIn() { return notAvailableYet("signIn"); }
    function resetPassword() { return notAvailableYet("resetPassword"); }

    /* Controlled access to the underlying Supabase client for
       later phases. null in local-only mode. */
    function _getClient() { return client; }


    /* ---- diagnostics (safe) ------------------------------- */

    function diagnostics() {
        return {
            provider: current.provider,
            configured: current.configured,
            status: current.status,
            /* key FAMILY only ("publishable" | "legacy_anon" |
               null) — never the key value */
            keyType: resolvedConfig().keyType || null,
            /* short safe reason if browser config was refused */
            configIssue: current.configIssue,
            online: current.online,
            libraryLoaded: Boolean(
                global.MWalletAuthClient &&
                global.MWalletAuthClient.isLibraryLoaded()
            ),
            vendorVersion:
                (global.MWalletAuthClient && global.MWalletAuthClient.vendorVersion) || null,
            hasEventListener: Boolean(authEventSub),
            subscriberCount: subscribers.length,
            deferredForOffline: deferredForOffline
        };
    }


    /* ---- public surface ---------------------------------- */

    var api = {
        STATES: STATE,

        /* toggle safe, verbose logging (never logs secrets) */
        debug: false,

        initialize: initialize,
        whenReady: whenReady,

        getState: getState,
        getStatus: getStatus,
        isConfigured: isConfigured,
        isAuthenticated: isAuthenticated,
        getUser: getUser,
        getSession: getSession,
        subscribe: subscribe,

        signOut: signOut,
        diagnostics: diagnostics,

        /* BP3 extension points */
        signUp: signUp,
        signIn: signIn,
        resetPassword: resetPassword,
        _getClient: _getClient
    };

    global.MWalletAuth = api;


    /* ---- boot: scheduled, detached, non-blocking --------- */

    function boot() {
        /* errors are captured inside initialize(); nothing here
           can throw into the financial boot path */
        initialize();
    }

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", boot);
        } else {
            boot();
        }
    }

})(typeof window !== "undefined" ? window : this);
