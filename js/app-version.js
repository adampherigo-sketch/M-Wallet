"use strict";

/* =========================================================
   M-WALLET — APPLICATION VERSION

   Single runtime source of truth for the app version shown in
   the UI (Settings -> System & Beta). Loads before every other
   script so window.MWalletVersion is always available.

   To release: bump APP_VERSION here AND the "version" field in
   package.json (keep them identical). Nothing else in the app
   should hard-code a version string.

   Scheme (semver + pre-release):
     0.9.0-beta.1  ->  0.9.0-beta.2  ->  0.9.1-beta.1  ->  0.10.0-beta.1
   ========================================================= */

(function (global) {

    var APP_VERSION = "0.9.0-beta.1";

    /* "beta" while in Beta Preparation; becomes "stable" at 1.0.0 */
    var APP_CHANNEL = "beta";

    global.MWalletVersion = {
        version: APP_VERSION,
        channel: APP_CHANNEL,
        isBeta: APP_CHANNEL === "beta",

        /* "M-Wallet 0.9.0-beta.1" */
        label: "M-Wallet " + APP_VERSION,

        /* data-schema version is owned by storage.js (storage.version);
           surfaced here only for display convenience, read lazily. */
        get dataSchema() {
            try {
                var s = global.MWalletStorage || global.BudgetStorage;
                return s && typeof s.version !== "undefined" ? String(s.version) : null;
            } catch (error) {
                return null;
            }
        }
    };

})(typeof window !== "undefined" ? window : this);
