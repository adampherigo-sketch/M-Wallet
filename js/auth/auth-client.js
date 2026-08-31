"use strict";

/* =========================================================
   M-WALLET — AUTHENTICATION CLIENT FACTORY   (BP2)

   Owns exactly one responsibility: turn the resolved public
   config (project URL + publishable key, or a legacy anon key)
   into a Supabase client instance, lazily loading the vendored
   Supabase library only when authentication is actually
   configured. Secret / service_role keys are refused upstream
   in auth-config.js and never reach this module.

   The library (js/vendor/supabase-js.min.js) is NOT loaded in
   <head>. It is injected on demand from here so an AUTH
   UNCONFIGURED build never pays for ~200 KB it will not use.

   This module performs NO network calls itself. It does not
   restore sessions, listen for events, or hold auth state —
   that is js/auth/auth.js.
   ========================================================= */

(function (global) {

    var VENDOR_SRC = "./js/vendor/supabase-js.min.js";
    var VENDOR_VERSION = "2.112.4";

    /* Financial data lives in localStorage["mWalletData"]. The
       Supabase client keeps its session under its own key so the
       two never collide and a future "sign out" cannot touch
       financial data. */
    var SESSION_STORAGE_KEY = "mwallet.auth.session";

    var libraryPromise = null;

    function libraryIsLoaded() {
        return Boolean(
            global.supabase &&
            typeof global.supabase.createClient === "function"
        );
    }

    function loadLibrary() {
        if (libraryIsLoaded()) {
            return Promise.resolve(global.supabase);
        }
        if (libraryPromise) {
            return libraryPromise;
        }

        libraryPromise = new Promise(function (resolve, reject) {
            if (typeof document === "undefined" || !document.head) {
                reject(new Error("auth-client: no document to load the library into"));
                return;
            }

            var script = document.createElement("script");
            script.src = VENDOR_SRC;
            script.async = true;
            script.defer = true;

            script.onload = function () {
                if (libraryIsLoaded()) {
                    resolve(global.supabase);
                } else {
                    reject(new Error("auth-client: library loaded but createClient is missing"));
                }
            };

            script.onerror = function () {
                /* allow a later retry (e.g. after reconnect) */
                libraryPromise = null;
                reject(new Error("auth-client: could not load " + VENDOR_SRC));
            };

            document.head.appendChild(script);
        });

        return libraryPromise;
    }

    /* Resolves to a configured Supabase client, or rejects. The
       caller (auth.js) decides what a rejection means for state. */
    function createClient(publicConfig) {
        var browserKey = publicConfig && (publicConfig.key || publicConfig.anonKey);
        if (!publicConfig || !publicConfig.url || !browserKey) {
            return Promise.reject(new Error("auth-client: missing public config"));
        }

        return loadLibrary().then(function (lib) {
            return lib.createClient(publicConfig.url, browserKey, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    /* pick up magic-link / OAuth redirects when BP3
                       introduces them; harmless before then */
                    detectSessionInUrl: true,
                    storageKey: SESSION_STORAGE_KEY,
                    flowType: "pkce",
                    /* BP9 — unlock the client's (experimental) passkey /
                       WebAuthn methods. This ONLY makes the API callable;
                       it does NOT authorize or trigger any passkey use.
                       MWalletPasskeyRelease (default OFF) is what decides
                       whether M-Wallet ever invokes them, and no passkey
                       or WebAuthn call happens from client init alone. */
                    experimental: { passkey: true }
                }
            });
        });
    }

    global.MWalletAuthClient = {
        vendorVersion: VENDOR_VERSION,
        vendorSrc: VENDOR_SRC,
        sessionStorageKey: SESSION_STORAGE_KEY,
        isLibraryLoaded: libraryIsLoaded,
        loadLibrary: loadLibrary,
        createClient: createClient
    };

})(typeof window !== "undefined" ? window : this);
