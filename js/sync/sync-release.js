"use strict";

/* =========================================================
   M-WALLET — SYNC RELEASE GATE   (BP8)

       window.MWalletSyncRelease

   The single source of truth for whether automatic cloud
   financial synchronization is ACTIVATED in this build.

   BP8 shipped the complete sync engine OFF. BP12 completed
   live verification and turned it ON for the closed beta:

       enabled: true

   This is NOT a security boundary — Row Level Security (BP7)
   is the cloud security boundary. The switch held sync off
   until BP12 had:

     1. applied the BP7 wallet_documents migration to the
        real Supabase project                          (PASS)
     2. live-verified RLS isolation (two-user attack test,
        npm run bp7:verify-rls — 22/22)                (PASS)
     3. live-verified BP8 sync across real devices
        (Mac + iPhone, BP12.4J false-conflict fix)     (PASS)

   Sync only ever runs for a signed-in, ownership-verified
   user on a build with a configured Supabase project. In
   auth-unconfigured (local-only) mode it makes ZERO cloud
   requests regardless of this switch.

   To turn sync off again (e.g. an emergency rollback), set
   `BASE.enabled` to false and ship a new build. While
   disabled, the engine makes ZERO cloud requests: no
   bootstrap check, no upload, no download, no timers, no
   online-event sync, no financial-saved-event sync.

   ---------------------------------------------------------
   NO RUNTIME SWITCH.

   A normal browser runtime CANNOT change this setting. There
   is no query-string switch, no localStorage switch, no
   Settings switch, and no console-accessible override —
   `setOverride` is not even present on the object unless a
   test harness set

       window.__MWALLET_TEST_ENV__ = true

   BEFORE this module loaded. Only a committed change to
   `BASE.enabled` changes it.

   This file contains NO credentials.
   ========================================================= */

(function (global) {

    /* ---- committed shipping state (enabled after BP12 live verification) ---- */
    var BASE = {
        enabled: true,
        verificationPhase: "BP12",
        reason: "disabled_by_release_gate"
    };

    /* The test harness must opt in BEFORE this script runs. Checked
       exactly once, at module evaluation — setting the flag later has
       no effect, so a signed-in user cannot reach the enable path. */
    var TEST_ENV = false;
    try { TEST_ENV = global.__MWALLET_TEST_ENV__ === true; } catch (e) { TEST_ENV = false; }

    var override = null;   /* only ever set in a test env */

    function resolved() {
        /* a test-env override forces the gate either way; otherwise
           the committed default applies */
        var enabled = (TEST_ENV && override != null)
            ? override.enabled === true
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
       undefined, so no runtime path can change the gate. */
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
