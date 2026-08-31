"use strict";

/* =========================================================
   M-WALLET — AUTHENTICATION CONFIGURATION   (BP2)

   M-Wallet is a static browser PWA (GitHub Pages). There is no
   build step and no runtime .env loader, so authentication
   configuration is resolved from browser-safe values only.

   ------------------------------------------------------------
   BROWSER KEYS — what belongs in front-end source

   PREFERRED (current):
     - Supabase project URL     (https://<ref>.supabase.co)
     - Supabase PUBLISHABLE key  ("sb_publishable_…")

   LEGACY (still browser-safe, older projects):
     - Supabase "anon" key       (a JWT whose role is "anon")

   FORBIDDEN — server-only, never in the browser or this repo:
     - Supabase SECRET key       ("sb_secret_…")
     - Supabase "service_role" key (a JWT whose role is
       "service_role")
     - JWT signing secret, database password, any admin secret
     - any other unrecognized / privileged key format

   A publishable / anon key is public by design. It does not
   protect data on its own — real protection is authenticated
   ownership + database Row Level Security on every table (BP7).
   auth-config actively refuses secret / service_role / unknown
   key formats and leaves auth safely unconfigured.
   ------------------------------------------------------------

   HOW CONFIGURATION IS PROVIDED  (first match wins)

     1. window.MWalletAuthConfig — an object set by an inline
        <script> or an optional gitignored
        js/auth/auth-config.local.js loaded before this file.

     2. localStorage["mwallet.auth.config"] — a JSON object.
        The cleanest local-dev path: no files to create, no
        tracked HTML to edit. From the app's DevTools console:

          MWalletAuthConfigResolved.saveLocalConfig(
            "https://<ref>.supabase.co",
            "sb_publishable_…"
          );
          // then reload

        Clear it with MWalletAuthConfigResolved.clearLocalConfig().
        This override lives only in this browser, is never sent
        anywhere, and is kept clear of financial data
        (localStorage["mWalletData"]).

     3. DEPLOY_CONFIG below — filled with the deployed Beta
        project's PUBLIC values for the GitHub Pages build.

   If none is present the app runs in AUTH UNCONFIGURED mode:
   the local-only M-Wallet keeps working exactly as before and
   nothing account-related is offered.

   See js/auth/auth-config.example.js for the shapes.
   ========================================================= */

(function (global) {

    var LOCAL_STORAGE_KEY = "mwallet.auth.config";

    /* -------------------------------------------------------
       DEPLOY CONFIG — PUBLIC values for the deployed build.
       Use the project's PUBLISHABLE key ("sb_publishable_…")
       or, for an older project, the legacy anon JWT.
       Leave both empty to ship in AUTH UNCONFIGURED mode.
       NEVER put an "sb_secret_…" or service_role key here.
       ------------------------------------------------------- */
    var DEPLOY_CONFIG = {
        supabaseUrl: "",
        supabaseKey: ""
    };
    /* ----------------------------------------------------- */


    function trimString(value) {
        return String(value == null ? "" : value).trim();
    }

    /* Accept a few common field names so pasted snippets "just
       work". Only URL + key are ever read. */
    function normalizeShape(raw) {
        if (!raw || typeof raw !== "object") {
            return { url: "", key: "" };
        }
        return {
            url: trimString(raw.supabaseUrl || raw.url || raw.SUPABASE_URL),
            key: trimString(
                raw.supabaseKey ||
                raw.key ||
                raw.supabasePublishableKey ||
                raw.publishableKey ||
                raw.supabaseAnonKey ||
                raw.anonKey ||
                raw.SUPABASE_KEY
            )
        };
    }

    function readLocalStorageConfig() {
        try {
            if (!global.localStorage) {
                return null;
            }
            var text = global.localStorage.getItem(LOCAL_STORAGE_KEY);
            if (!text) {
                return null;
            }
            var parsed = JSON.parse(text);
            return (parsed && typeof parsed === "object") ? parsed : null;
        } catch (error) {
            return null;
        }
    }

    function resolveSource() {
        var fromWindow = global.MWalletAuthConfig;
        if (fromWindow && typeof fromWindow === "object") {
            return { source: "window", raw: fromWindow };
        }
        var fromLocal = readLocalStorageConfig();
        if (fromLocal) {
            return { source: "localStorage", raw: fromLocal };
        }
        if (trimString(DEPLOY_CONFIG.supabaseUrl) || trimString(DEPLOY_CONFIG.supabaseKey)) {
            return { source: "deploy", raw: DEPLOY_CONFIG };
        }
        return { source: null, raw: null };
    }


    /* ---- base64url / JWT helpers — never return the key ----- */

    function base64UrlDecode(segment) {
        var b64 = String(segment).replace(/-/g, "+").replace(/_/g, "/");
        while (b64.length % 4) {
            b64 += "=";
        }
        if (typeof atob === "function") {
            return atob(b64);
        }
        if (typeof Buffer !== "undefined") {
            return Buffer.from(b64, "base64").toString("binary");
        }
        return "";
    }

    function decodeJwt(token) {
        var parts = String(token).split(".");
        if (parts.length !== 3) {
            return { isJwt: false, role: null };
        }
        try {
            var header = JSON.parse(base64UrlDecode(parts[0]));
            var payload = JSON.parse(base64UrlDecode(parts[1]));
            if (!header || typeof header.alg === "undefined") {
                return { isJwt: false, role: null };
            }
            return {
                isJwt: true,
                role: (payload && typeof payload.role === "string") ? payload.role : null
            };
        } catch (error) {
            return { isJwt: false, role: null };
        }
    }


    /* ---- key classification --------------------------------
       Returns exactly one of:
         "missing"               no key supplied
         "publishable"           sb_publishable_…      ALLOWED (current)
         "legacy_anon"           JWT, role "anon"       ALLOWED (legacy)
         "secret"                sb_secret_…            FORBIDDEN
         "legacy_service_role"   JWT, role "service_role" FORBIDDEN
         "unknown"               anything else          FORBIDDEN
       The key value is never logged or returned.
       -------------------------------------------------------- */
    function classifyKey(rawKey) {
        var key = trimString(rawKey);
        if (!key) {
            return "missing";
        }
        if (/^sb_secret_/i.test(key)) {
            return "secret";
        }
        if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(key)) {
            return "publishable";
        }
        var jwt = decodeJwt(key);
        if (jwt.isJwt) {
            if (jwt.role === "anon") {
                return "legacy_anon";
            }
            if (jwt.role === "service_role") {
                return "legacy_service_role";
            }
            return "unknown";
        }
        return "unknown";
    }

    var ACCEPTED_KEY_TYPES = { publishable: true, legacy_anon: true };

    var REJECTION_REASON = {
        secret: "secret-key",
        legacy_service_role: "service-role-key",
        unknown: "unrecognized-key-format"
    };

    var URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.(co|in|net)\/?$/i;

    function evaluate(raw) {
        var shape = normalizeShape(raw);
        var hasAnything = Boolean(shape.url || shape.key);
        var urlValid = URL_RE.test(shape.url);
        var keyType = classifyKey(shape.key);

        var accepted = ACCEPTED_KEY_TYPES[keyType] === true;
        var rejected = Object.prototype.hasOwnProperty.call(REJECTION_REASON, keyType);

        var problem = null;
        if (rejected) {
            problem = REJECTION_REASON[keyType];
        } else if (hasAnything && accepted && !urlValid) {
            problem = "invalid-url";
        } else if (hasAnything && keyType === "missing" && shape.url) {
            problem = "missing-key";
        } else if (hasAnything && !accepted && !urlValid) {
            problem = "incomplete";
        }

        return {
            urlValid: urlValid,
            keyType: keyType,
            accepted: accepted,
            rejected: rejected,
            problem: problem,
            /* held only in this closure; only handed out by
               getPublicConfig() to build the client */
            _url: shape.url.replace(/\/$/, ""),
            _key: shape.key
        };
    }


    function buildResolved(sourceName, evalResult) {
        var configured = evalResult.accepted && evalResult.urlValid;

        return {
            provider: "supabase",

            isConfigured: configured,

            /* accepted key family ("publishable" | "legacy_anon"),
               or null — never the key value */
            keyType: configured ? evalResult.keyType : null,

            /* a secret / service_role / unrecognized key was
               supplied where a publishable (or legacy anon) key
               belongs */
            keyRejected: evalResult.rejected,

            /* kept for older callers; true only for secret /
               service_role */
            rejectedServiceRoleKey:
                evalResult.keyType === "secret" ||
                evalResult.keyType === "legacy_service_role",

            /* short, safe reason string — NEVER the key:
               "secret-key" | "service-role-key" |
               "unrecognized-key-format" | "invalid-url" |
               "missing-key" | "incomplete" | null */
            keyProblem: evalResult.problem,

            configSource: configured ? sourceName : null,

            getPublicConfig: function () {
                if (!configured) {
                    return null;
                }
                return {
                    url: evalResult._url,
                    key: evalResult._key,
                    /* alias for older callers */
                    anonKey: evalResult._key
                };
            }
        };
    }

    var picked = resolveSource();
    var resolved = buildResolved(picked.source, evaluate(picked.raw));


    /* ---- developer helpers: browser-local override only ----
       Persist / clear a PUBLIC (publishable or legacy anon)
       config in this browser's localStorage. They refuse a
       secret / service_role / unknown key, never touch
       financial data, never transmit anything, and never log
       or return a key value. Reload after calling. */

    resolved.saveLocalConfig = function (url, key) {
        var res = evaluate({ supabaseUrl: url, supabaseKey: key });
        if (res.rejected) {
            return { ok: false, problem: res.problem };
        }
        if (!res.accepted) {
            return { ok: false, problem: res.problem || "missing-key" };
        }
        if (!res.urlValid) {
            return { ok: false, problem: "invalid-url" };
        }
        try {
            global.localStorage.setItem(
                LOCAL_STORAGE_KEY,
                JSON.stringify({ supabaseUrl: res._url, supabaseKey: res._key })
            );
            return { ok: true, keyType: res.keyType, reloadRequired: true };
        } catch (error) {
            return { ok: false, problem: "storage-unavailable" };
        }
    };

    resolved.clearLocalConfig = function () {
        try {
            global.localStorage.removeItem(LOCAL_STORAGE_KEY);
            return { ok: true, reloadRequired: true };
        } catch (error) {
            return { ok: false, problem: "storage-unavailable" };
        }
    };


    global.MWalletAuthConfigResolved = resolved;

})(typeof window !== "undefined" ? window : this);
