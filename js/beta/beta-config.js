"use strict";

/* =========================================================
   M-WALLET — BETA OPERATIONS CONFIG   (BP11)

       window.MWalletBetaConfig

   PUBLIC, non-secret operational config for the closed beta:
     - the feedback delivery endpoint (a public browser
       destination, or null)
     - a support email (public, or null)
     - the program name

   HARD RULES
     - No secret ever lives here: no Resend / Formspree /
       Supabase service_role key, no SMTP password, no GitHub
       token. A feedback endpoint is a PUBLIC POST target.
     - The committed build ships `feedbackEndpoint: null` and
       `supportEmail: null` until a production destination is
       chosen and verified in BP12. The app stays fully useful
       with neither — feedback can still be copied / downloaded.
     - No localStorage. This is static deploy-time config only.
   ========================================================= */

(function (global) {

    var PROGRAM_NAME = "M-Wallet Beta";
    var CHANNEL = "beta";

    /* -------------------------------------------------------
       DEPLOY CONFIG — edit these at deploy time only.
       See docs/BP11-BETA-OPERATIONS.md for the endpoint
       security requirements before setting `feedbackEndpoint`.
       ------------------------------------------------------- */
    var DEPLOY = {
        feedbackEndpoint: null,   /* e.g. "https://example.com/m-wallet-beta-feedback" */
        supportEmail: null,       /* e.g. "beta@example.com" */
        programName: PROGRAM_NAME
    };

    var overrides = null;   /* test-only */

    /* a browser POST destination must be HTTPS and must not use a
       script / data / file / ftp scheme */
    function isValidEndpoint(value) {
        if (typeof value !== "string" || !value) { return false; }
        var url;
        try { url = new global.URL(value); }
        catch (e) { return false; }
        if (url.protocol !== "https:") { return false; }
        /* URL() already normalises the scheme; this is belt-and-braces */
        if (/^(javascript|data|file|ftp|blob|ws|wss):/i.test(value.trim())) { return false; }
        return true;
    }

    function isValidSupportEmail(value) {
        if (typeof value !== "string") { return false; }
        var v = value.trim();
        if (!v || v.length > 254) { return false; }
        /* deliberately simple — a support address is public, low-risk */
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    function source() {
        return overrides || DEPLOY;
    }

    /* the resolved, validated view the rest of BP11 consumes */
    function get() {
        var s = source();
        var endpoint = isValidEndpoint(s.feedbackEndpoint) ? String(s.feedbackEndpoint) : null;
        var email = isValidSupportEmail(s.supportEmail) ? String(s.supportEmail).trim() : null;
        var name = (typeof s.programName === "string" && s.programName.trim())
            ? s.programName.trim() : PROGRAM_NAME;
        return {
            programName: name,
            channel: CHANNEL,
            feedbackEndpoint: endpoint,
            feedbackConfigured: endpoint != null,
            supportEmail: email,
            supportConfigured: email != null
        };
    }

    function configureForTest(next) {
        overrides = (next == null) ? null : {
            feedbackEndpoint: next.feedbackEndpoint == null ? null : next.feedbackEndpoint,
            supportEmail: next.supportEmail == null ? null : next.supportEmail,
            programName: next.programName == null ? PROGRAM_NAME : next.programName
        };
    }

    global.MWalletBetaConfig = {
        PROGRAM_NAME: PROGRAM_NAME,
        CHANNEL: CHANNEL,
        get: get,
        isValidEndpoint: isValidEndpoint,
        isValidSupportEmail: isValidSupportEmail,
        configureForTest: configureForTest
    };

})(typeof window !== "undefined" ? window : this);
