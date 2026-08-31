"use strict";

/* =========================================================
   M-WALLET — PASSKEY RELEASE GATE   (BP9)

       window.MWalletPasskeyRelease

   The single source of truth for whether M-Wallet is allowed
   to invoke the (experimental) Supabase passkey / WebAuthn
   APIs in this build.

   BP9 ships the complete passkey architecture but leaves it
   OFF:

       enabled: false

   Why it stays off until BP12:
     - Supabase passkey support is EXPERIMENTAL.
     - The Supabase project's Passkeys configuration has not
       been enabled or verified.
     - The final, permanent production WebAuthn relying-party
       ID (RP ID) has not been chosen. Changing the RP ID
       later invalidates every passkey enrolled before the
       change, so no real passkey may be enrolled until the
       domain is final.
     - Real browsers / devices (Safari, Chrome, iOS, Android,
       Windows Hello, security keys) have not been tested.

   While disabled, M-Wallet makes:
     - no passkey registration API call
     - no passkey sign-in API call
     - no passkey list / rename / delete API call
     - no navigator.credentials call of its own
     - no automatic passkey prompt, no conditional-UI request
   Email + password sign-in and password recovery work
   normally — passkeys are an additive alternative, never a
   replacement.

   ---------------------------------------------------------
   NO PRODUCTION ENABLE PATH.

   A normal browser runtime CANNOT enable passkeys. There is
   no query-string switch, no localStorage switch, no Settings
   switch, no hostname / localhost check, and no
   console-accessible override — `setOverride` is not even
   present on the object unless a test harness set

       window.__MWALLET_TEST_ENV__ = true

   BEFORE this module loaded. BP12 will flip `BASE.enabled`
   itself after live verification; nothing else can.

   This file contains NO credentials and NO RP ID.
   ========================================================= */

(function (global) {

    /* ---- committed shipping state (BP12 flips this, nothing else) ---- */
    var BASE = {
        enabled: false,
        verificationPhase: "BP12",
        reason: "production_rp_verification_pending"
    };

    /* The test harness must opt in BEFORE this script runs. Checked
       exactly once, at module evaluation. */
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

    function isEnabled() { return resolved().enabled === true; }
    function getState() { return resolved(); }

    var api = {
        isEnabled: isEnabled,
        getState: getState,
        COMMITTED_DEFAULT: { enabled: BASE.enabled, verificationPhase: BASE.verificationPhase }
    };

    if (TEST_ENV) {
        api.setOverride = function setOverride(next) {
            if (next == null) { override = null; return resolved(); }
            override = { enabled: next.enabled === true };
            return resolved();
        };
        api.__testEnv = true;
    }

    global.MWalletPasskeyRelease = api;

})(typeof window !== "undefined" ? window : this);
