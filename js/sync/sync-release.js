"use strict";

/* =========================================================
   M-WALLET — SYNC RELEASE GATE   (BP8)

       window.MWalletSyncRelease

   The single source of truth for whether automatic cloud
   financial synchronization is ACTIVATED in this build.

   BP8 ships the complete sync engine but leaves it OFF:

       enabled: false

   This is NOT a security boundary — Row Level Security (BP7)
   is the cloud security boundary. This switch exists so
   M-Wallet does not begin transferring real financial data
   before BP12:

     1. applies the BP7 wallet_documents migration to a real
        Supabase project
     2. live-verifies RLS isolation (two-user attack test)
     3. live-verifies BP8 sync across multiple real devices
     4. attack-tests conflicts / account boundaries / offline
     5. only then flips this switch on for BP13 closed beta

   While disabled, the engine makes ZERO cloud requests:
   no bootstrap check, no upload, no download, no timers, no
   online-event sync, no financial-saved-event sync.

   ---------------------------------------------------------
   NO PRODUCTION ENABLE PATH.

   A normal browser runtime CANNOT enable sync. There is no
   query-string switch, no localStorage switch, no Settings
   switch, and no console-accessible override — `setOverride`
   is not even present on the object unless a test harness set

       window.__MWALLET_TEST_ENV__ = true

   BEFORE this module loaded. BP12 will flip `BASE.enabled`
   itself after live verification; nothing else can.

   This file contains NO credentials.
   ========================================================= */

(function (global) {

    /* ---- committed shipping state (BP12 flips this, nothing else) ---- */
    var BASE = {
        enabled: false,
        verificationPhase: "BP12",
        reason: "live_security_verification_pending"
    };

    /* The test harness must opt in BEFORE this script runs. Checked
       exactly once, at module evaluation — setting the flag later has
       no effect, so a signed-in user cannot reach the enable path. */
    var TEST_ENV = false;
    try { TEST_ENV = global.__MWALLET_TEST_ENV__ === true; } catch (e) { TEST_ENV = false; }

    var override = null;   /* only ever set in a test env */

    function resolved() {
        var enabled = (TEST_ENV && override && override.enabled === true)
            ? true
            : BASE.enabled;
        return {
            enabled: enabled === true,
            verificationPhase: BASE.verificationPhase,
            reason: enabled === true ? null : BASE.reason,
            testEnv: TEST_ENV === true,
            overridden: TEST_ENV && override != null
        };
    }

    function isEnabled() {
        return resolved().enabled === true;
    }

    function getState() { return resolved(); }

    var api = {
        isEnabled: isEnabled,
        getState: getState,
        /* the immutable committed default, for diagnostics / tests */
        COMMITTED_DEFAULT: { enabled: BASE.enabled, verificationPhase: BASE.verificationPhase }
    };

    /* setOverride EXISTS ONLY under an explicit pre-load test opt-in.
       In every normal browser build MWalletSyncRelease.setOverride is
       undefined, so no runtime path can turn sync on. */
    if (TEST_ENV) {
        api.setOverride = function setOverride(next) {
            if (next == null) { override = null; return resolved(); }
            override = { enabled: next.enabled === true };
            return resolved();
        };
        api.__testEnv = true;
    }

    global.MWalletSyncRelease = api;

})(typeof window !== "undefined" ? window : this);
