"use strict";

/* =========================================================
   M-WALLET — AUTHENTICATION CORE   (BP2 + BP3)

   The single public entry point for everything auth-related:

       window.MWalletAuth

   This module:
     - resolves configuration (via auth-config.js)
     - lazily builds the Supabase client (via auth-client.js)
     - restores an existing session if one is stored
     - keeps ONE controlled auth-event listener
     - exposes an explicit, observable auth state
     - fails safe: an unconfigured / offline / broken auth
       layer never blocks or alters the local financial app
     - BP3: real signUp / signIn / signOut / resetPassword /
       updatePassword / resendVerification, with input
       validation, email normalization, safe result objects,
       and provider-error -> user message mapping. Raw Supabase
       sessions and tokens are NEVER returned to callers.

   This module does NOT: create cloud tables, move financial
   data anywhere, migrate local users, sync, or add passkeys.
   The account UI lives in js/auth/auth-ui.js.

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
        user: null,          /* { id, email } only */
        session: null,       /* safe summary — never tokens */
        error: null,         /* { code, message } — never secrets */
        configIssue: null,   /* short safe reason if browser config was refused */
        recoveryMode: false, /* true after a PASSWORD_RECOVERY callback until the password is reset */
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
        return {
            id: user.id || null,
            email: user.email || null,
            /* BP9 — non-sensitive booleans the passkey layer needs:
               registration requires a confirmed, non-anonymous user.
               Supabase always includes email_confirmed_at (null until
               confirmed) on a session user, so this is a reliable signal. */
            confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
            isAnonymous: user.is_anonymous === true
        };
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


    /* ---- BP3: input validation + email + error mapping ------ */

    var PASSWORD_MIN = 8;
    var PASSWORD_MAX = 72; /* bcrypt truncation boundary */
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function normalizeEmail(value) {
        return String(value == null ? "" : value).trim().toLowerCase();
    }

    function validateEmail(value) {
        var email = normalizeEmail(value);
        if (!email) {
            return { ok: false, field: "email", message: "Enter your email address." };
        }
        if (email.length > 254 || !EMAIL_RE.test(email)) {
            return { ok: false, field: "email", message: "Enter a valid email address." };
        }
        return { ok: true, value: email };
    }

    function validatePassword(value) {
        var pw = String(value == null ? "" : value);
        if (!pw) {
            return { ok: false, field: "password", message: "Enter a password." };
        }
        if (pw.length < PASSWORD_MIN) {
            return { ok: false, field: "password", message: "Use at least " + PASSWORD_MIN + " characters." };
        }
        if (pw.length > PASSWORD_MAX) {
            return { ok: false, field: "password", message: "That password is too long (" + PASSWORD_MAX + " characters max)." };
        }
        return { ok: true };
    }

    /* Turn a raw provider error into a short, user-displayable
       string. Never returns HTML, tokens, or internals. */
    function mapError(error) {
        var raw = (error && (error.message || error.error_description || error.msg || error.error)) || "";
        var text = String(raw).toLowerCase();

        if (/invalid login credentials|invalid email or password/.test(text)) {
            return "That email or password doesn't match our records.";
        }
        if (/email not confirmed|not confirmed/.test(text)) {
            return "Confirm your email address first — open the verification link we sent you.";
        }
        if (/user already registered|already( been)? registered|already exists/.test(text)) {
            return "An account with that email already exists. Try signing in instead.";
        }
        if (/password should be at least|password is too short|weak.?password/.test(text)) {
            return "That password is too short.";
        }
        if (/same.?password|new password should be different/.test(text)) {
            return "Choose a password you haven't used here before.";
        }
        if (/rate limit|too many requests|for security purposes|after \d+ seconds/.test(text)) {
            return "Too many attempts. Please wait a minute and try again.";
        }
        if (/(redirect|redirect_to|redirecturl)/.test(text) && /(not allowed|invalid|denied|mismatch)/.test(text)) {
            return "This site isn't on the sign-in service's allowed list yet.";
        }
        if (/network|failed to fetch|load failed|timeout|offline|connection/.test(text)) {
            return "Can't reach the sign-in service. Check your connection and try again.";
        }
        if (/session|token/.test(text) && /expired|invalid|missing/.test(text)) {
            return "That link has expired. Request a new one and try again.";
        }
        if (raw) {
            return String(raw).replace(/\s+/g, " ").trim().slice(0, 160);
        }
        return "Something went wrong. Please try again.";
    }

    /* Sub-path-safe redirect target for Supabase email links:
       the DIRECTORY of the current page, so it works at a domain
       root (http://127.0.0.1:4178/) and under a repo sub-path
       (https://user.github.io/M-Wallet/). */
    function redirectUrl() {
        try {
            var loc = global.location;
            if (!loc || !loc.origin) {
                return undefined;
            }
            var dir = String(loc.pathname || "/").replace(/[^/]*$/, "");
            return loc.origin + (dir || "/");
        } catch (error) {
            return undefined;
        }
    }

    /* Remove auth callback parameters from the visible URL once
       the provider has consumed them. Never logs them. Called
       only after an auth event / init settle, by which point
       detectSessionInUrl has already read the code. */
    function scrubAuthParamsFromUrl() {
        try {
            var loc = global.location;
            var hist = global.history;
            if (!loc || !hist || typeof hist.replaceState !== "function" || typeof URL !== "function") {
                return;
            }
            var url = new URL(loc.href);
            var dirty = false;
            ["code", "error", "error_description", "error_code", "provider_token",
                "access_token", "refresh_token", "expires_in", "token_type", "type", "token_hash"
            ].forEach(function (param) {
                if (url.searchParams.has(param)) {
                    url.searchParams.delete(param);
                    dirty = true;
                }
            });
            if (/(?:^#|[#&])(access_token|refresh_token|error|type|token_hash)=/.test(url.hash || "")) {
                url.hash = "";
                dirty = true;
            }
            if (dirty) {
                hist.replaceState(hist.state, "", url.pathname + url.search + url.hash);
            }
        } catch (error) {
            /* never throw into the app for a cosmetic URL tidy */
        }
    }

    function snapshot() {
        return {
            status: current.status,
            configured: current.configured,
            provider: current.provider,
            isAuthenticated: current.status === STATE.SIGNED_IN,
            user: current.user
                ? {
                    id: current.user.id,
                    email: current.user.email,
                    /* BP9 — non-sensitive; used only to decide whether the
                       passkey-enrollment control may be offered */
                    confirmed: current.user.confirmed === true,
                    isAnonymous: current.user.isAnonymous === true
                }
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
            recoveryMode: current.recoveryMode === true,
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
                    recoveryMode: false,
                    error: null
                });
                break;

            case "PASSWORD_RECOVERY":
                /* the user followed a reset link — Supabase gives a
                   short-lived session; keep the account UI in front
                   showing "set a new password" until updatePassword */
                patch({ recoveryMode: true, error: null });
                if (session && session.user) {
                    patch({
                        status: STATE.SIGNED_IN,
                        user: safeUser(session.user),
                        session: safeSession(session)
                    });
                }
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
        scrubAuthParamsFromUrl();
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
                scrubAuthParamsFromUrl();
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


    /* ---- BP3: account actions ----------------------------- */
    /*
       Every action:
         - validates + normalizes input before touching the network
         - returns a predictable, safe result object
           ({ ok, code?, message?, ... }) — NEVER a raw Supabase
           session, user object, or token
         - maps provider errors to a user-displayable string
         - never logs passwords or tokens
       Financial storage (localStorage["mWalletData"]) is never
       read or written by any of these.
    */

    var NOT_CONFIGURED = {
        ok: false,
        code: "not_configured",
        message: "Accounts aren't set up on this build."
    };

    function withClient(run) {
        if (!current.configured) {
            return Promise.resolve(NOT_CONFIGURED);
        }
        return ensureClient()
            .then(function (c) {
                wireAuthEvents();
                return run(c);
            })
            .catch(function (error) {
                return {
                    ok: false,
                    code: "unavailable",
                    message: mapError(error)
                };
            });
    }

    function signUp(email, password) {
        var e = validateEmail(email);
        if (!e.ok) { return Promise.resolve({ ok: false, code: "invalid_email", field: e.field, message: e.message }); }
        var p = validatePassword(password);
        if (!p.ok) { return Promise.resolve({ ok: false, code: "weak_password", field: p.field, message: p.message }); }

        return withClient(function (c) {
            return c.auth.signUp({
                email: e.value,
                password: String(password),
                options: { emailRedirectTo: redirectUrl() }
            }).then(function (res) {
                if (res && res.error) {
                    return { ok: false, code: "signup_failed", message: mapError(res.error), email: e.value };
                }
                var data = (res && res.data) || {};
                /* no session => email confirmation is required */
                var needsVerification = !data.session;
                debugLog("signUp: request accepted");
                return { ok: true, needsVerification: needsVerification, email: e.value };
            });
        });
    }

    function signIn(email, password) {
        var e = validateEmail(email);
        if (!e.ok) { return Promise.resolve({ ok: false, code: "invalid_email", field: e.field, message: e.message }); }
        if (!String(password || "")) {
            return Promise.resolve({ ok: false, code: "missing_password", field: "password", message: "Enter your password." });
        }

        return withClient(function (c) {
            return c.auth.signInWithPassword({
                email: e.value,
                password: String(password)
            }).then(function (res) {
                if (res && res.error) {
                    var text = String((res.error.message || "")).toLowerCase();
                    var code = /not confirmed/.test(text) ? "email_not_confirmed" : "signin_failed";
                    return { ok: false, code: code, message: mapError(res.error), email: e.value };
                }
                /* the SIGNED_IN auth event drives state; never return the session */
                debugLog("signIn: accepted");
                return { ok: true, email: e.value };
            });
        });
    }

    function resetPassword(email) {
        var e = validateEmail(email);
        if (!e.ok) { return Promise.resolve({ ok: false, code: "invalid_email", field: e.field, message: e.message }); }

        return withClient(function (c) {
            return c.auth.resetPasswordForEmail(e.value, {
                redirectTo: redirectUrl()
            }).then(function (res) {
                if (res && res.error) {
                    /* rate-limit / network still surface; the provider
                       does not reveal whether the address exists */
                    return { ok: false, code: "reset_failed", message: mapError(res.error) };
                }
                debugLog("resetPassword: request accepted");
                return {
                    ok: true,
                    message: "If that email has an account, a password-reset link is on its way."
                };
            });
        });
    }

    function updatePassword(newPassword) {
        var p = validatePassword(newPassword);
        if (!p.ok) { return Promise.resolve({ ok: false, code: "weak_password", field: p.field, message: p.message }); }

        return withClient(function (c) {
            return c.auth.updateUser({ password: String(newPassword) }).then(function (res) {
                if (res && res.error) {
                    return { ok: false, code: "update_failed", message: mapError(res.error) };
                }
                patch({ recoveryMode: false });
                debugLog("updatePassword: accepted");
                return { ok: true, message: "Your password has been updated." };
            });
        });
    }

    function resendVerification(email) {
        var e = validateEmail(email);
        if (!e.ok) { return Promise.resolve({ ok: false, code: "invalid_email", field: e.field, message: e.message }); }

        return withClient(function (c) {
            if (!c.auth || typeof c.auth.resend !== "function") {
                return { ok: false, code: "unsupported", message: "Resending isn't available — request a new link from the sign-in screen." };
            }
            return c.auth.resend({
                type: "signup",
                email: e.value,
                options: { emailRedirectTo: redirectUrl() }
            }).then(function (res) {
                if (res && res.error) {
                    return { ok: false, code: "resend_failed", message: mapError(res.error) };
                }
                debugLog("resendVerification: request accepted");
                return { ok: true, message: "Verification email sent. Check your inbox." };
            });
        });
    }

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

        /* BP3 account actions — safe result objects only */
        signUp: signUp,
        signIn: signIn,
        resetPassword: resetPassword,
        updatePassword: updatePassword,
        resendVerification: resendVerification,

        /* pure helpers, exposed for the UI layer + tests */
        _internals: {
            PASSWORD_MIN: PASSWORD_MIN,
            PASSWORD_MAX: PASSWORD_MAX,
            normalizeEmail: normalizeEmail,
            validateEmail: validateEmail,
            validatePassword: validatePassword,
            mapError: mapError,
            redirectUrl: redirectUrl
        },

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
