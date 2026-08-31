"use strict";

/* =========================================================
   M-WALLET — BETA OPERATIONS   (BP11)

       window.MWalletBetaOps

   No DOM. Provides:
     - a build / version / channel summary
     - a PURE, SANITISED technical-diagnostics collector
     - the current beta limitations, derived truthfully from
       the live release gates
     - a report-id generator (report-scoped, NOT a user or
       device identifier)
     - curated release notes for the current build

   HARD RULES
     - Diagnostics NEVER contain financial data, aggregate
       financial counts, mWalletData, a user id / owner id, an
       account email (unless the caller passes an
       already-opted-in email), a token, a session, a passkey
       id, a sync document id, cookies, or a localStorage dump.
     - Diagnostics are only ever built on demand for a report
       the tester is composing — never emitted automatically.
   ========================================================= */

(function (global) {

    var overrides = null;   /* test-only dependency injection */

    function deps() {
        if (overrides) { return overrides; }
        return {
            version: global.MWalletVersion || null,
            auth: global.MWalletAuth || null,
            nav: global.BudgetNavigation || global.MWalletNavigation || null,
            syncRelease: global.MWalletSyncRelease || null,
            passkeyRelease: global.MWalletPasskeyRelease || null,
            account: global.MWalletAccount || null,
            betaConfig: global.MWalletBetaConfig || null,
            knownIssues: global.MWalletBetaKnownIssues || null,
            nowIso: function () { try { return new Date().toISOString(); } catch (e) { return "1970-01-01T00:00:00.000Z"; } },
            win: (typeof window !== "undefined") ? window : null,
            nav_: (typeof navigator !== "undefined") ? navigator : null,
            doc: (typeof document !== "undefined") ? document : null
        };
    }

    function configureForTest(next) {
        overrides = (next == null) ? null : Object.assign({}, deps(), next);
    }

    /* ---- version / channel ---- */

    function appVersion() {
        var v = deps().version;
        try { return (v && typeof v.version === "string") ? v.version : "unknown"; }
        catch (e) { return "unknown"; }
    }

    function dataSchema() {
        var v = deps().version;
        try { return v && v.dataSchema != null ? String(v.dataSchema) : null; }
        catch (e) { return null; }
    }

    function programName() {
        var c = deps().betaConfig;
        try { return (c && typeof c.get === "function") ? c.get().programName : "M-Wallet Beta"; }
        catch (e) { return "M-Wallet Beta"; }
    }

    function getBuildSummary() {
        return {
            programName: programName(),
            appVersion: appVersion(),
            channel: "beta",
            dataSchema: dataSchema()
        };
    }

    /* ---- release-gate reads (never flips anything) ---- */

    function syncReleaseEnabled() {
        var r = deps().syncRelease;
        try { return !!(r && typeof r.isEnabled === "function" && r.isEnabled()); }
        catch (e) { return false; }
    }

    function passkeyReleaseEnabled() {
        var r = deps().passkeyRelease;
        try { return !!(r && typeof r.isEnabled === "function" && r.isEnabled()); }
        catch (e) { return false; }
    }

    function accountDeletionAvailable() {
        var a = deps().account;
        try {
            var st = a && typeof a.accountDeletionStatus === "function" ? a.accountDeletionStatus() : null;
            return !!(st && st.available === true);
        } catch (e) { return false; }
    }

    function feedbackConfigured() {
        var c = deps().betaConfig;
        try { return !!(c && typeof c.get === "function" && c.get().feedbackConfigured); }
        catch (e) { return false; }
    }

    function supportConfigured() {
        var c = deps().betaConfig;
        try { return !!(c && typeof c.get === "function" && c.get().supportConfigured); }
        catch (e) { return false; }
    }

    function knownIssueCount() {
        var k = deps().knownIssues;
        try { return (k && typeof k.count === "function") ? k.count() : 0; }
        catch (e) { return 0; }
    }

    /* ---- auth state -> a safe label only ---- */

    var AUTH_LABELS = ["signed_in", "signed_out", "unconfigured", "initializing", "error", "recovery"];

    function authStateLabel() {
        var a = deps().auth;
        try {
            var s = a && typeof a.getState === "function" ? a.getState() : null;
            if (!s) { return "unknown"; }
            if (s.recoveryMode === true) { return "recovery"; }
            return AUTH_LABELS.indexOf(s.status) !== -1 ? s.status : "unknown";
        } catch (e) { return "unknown"; }
    }

    /* ---- environment reads ---- */

    function currentPage() {
        var n = deps().nav;
        try {
            var p = n && typeof n.getCurrentPage === "function" ? n.getCurrentPage() : null;
            var allowed = ["home", "budget", "transactions", "savings", "reports", "settings", "m-cash", "money"];
            return allowed.indexOf(p) !== -1 ? p : "unknown";
        } catch (e) { return "unknown"; }
    }

    function isOnline() {
        var nv = deps().nav_;
        try { return nv ? nv.onLine !== false : true; } catch (e) { return true; }
    }

    function isStandalone() {
        var w = deps().win;
        var nv = deps().nav_;
        try {
            if (w && typeof w.matchMedia === "function" && w.matchMedia("(display-mode: standalone)").matches) { return true; }
            if (nv && nv.standalone === true) { return true; }
        } catch (e) { /* ignore */ }
        return false;
    }

    function serviceWorkerControlled() {
        var nv = deps().nav_;
        try { return !!(nv && nv.serviceWorker && nv.serviceWorker.controller); }
        catch (e) { return false; }
    }

    function viewport() {
        var w = deps().win;
        try {
            return {
                width: (w && Number.isFinite(w.innerWidth)) ? w.innerWidth : null,
                height: (w && Number.isFinite(w.innerHeight)) ? w.innerHeight : null
            };
        } catch (e) { return { width: null, height: null }; }
    }

    function userAgent() {
        var nv = deps().nav_;
        try {
            var ua = nv && typeof nv.userAgent === "string" ? nv.userAgent : null;
            /* a plain UA string is fine for beta debugging; cap the length so a
               pathological value can't bloat a report */
            return ua ? ua.slice(0, 512) : null;
        } catch (e) { return null; }
    }

    function language() {
        var nv = deps().nav_;
        try { return nv && typeof nv.language === "string" ? nv.language : null; }
        catch (e) { return null; }
    }

    /* ---- SAFE DIAGNOSTICS ---- */

    /* Only ever called for a report the tester is composing. Every field
       below is technical; NONE reveal financial behaviour or identity.
       `opts.includeContactEmail` is honoured only when the caller has
       already collected an opted-in address (passed as opts.contactEmail);
       this function never reads the account email itself. */
    function safeDiagnostics(opts) {
        opts = opts || {};
        var vp = viewport();
        var diag = {
            appVersion: appVersion(),
            betaChannel: "beta",
            reportCreatedAt: deps().nowIso(),
            currentPage: currentPage(),
            online: isOnline(),
            standalone: isStandalone(),
            serviceWorkerControlled: serviceWorkerControlled(),
            viewportWidth: vp.width,
            viewportHeight: vp.height,
            userAgent: userAgent(),
            language: language(),
            authState: authStateLabel(),
            syncReleaseEnabled: syncReleaseEnabled(),
            passkeyReleaseEnabled: passkeyReleaseEnabled(),
            feedbackEndpointConfigured: feedbackConfigured()
        };
        if (opts.includeContactEmail === true && typeof opts.contactEmail === "string" && opts.contactEmail) {
            diag.contactEmail = opts.contactEmail;
        }
        return diag;
    }

    /* human-readable label + value pairs for the "View diagnostics"
       preview — the same data, never raw JSON in ordinary UI */
    function diagnosticsPreview(diag) {
        diag = diag || safeDiagnostics();
        var rows = [
            ["App version", diag.appVersion],
            ["Channel", diag.betaChannel],
            ["Created", diag.reportCreatedAt],
            ["Current screen", diag.currentPage],
            ["Online", yesNo(diag.online)],
            ["Installed app", yesNo(diag.standalone)],
            ["Offline-ready", yesNo(diag.serviceWorkerControlled)],
            ["Viewport", (diag.viewportWidth || "?") + " x " + (diag.viewportHeight || "?")],
            ["Language", diag.language || "unknown"],
            ["Browser", diag.userAgent || "unknown"],
            ["Sign-in state", diag.authState],
            ["Cloud sync build", diag.syncReleaseEnabled ? "enabled" : "disabled"],
            ["Passkeys build", diag.passkeyReleaseEnabled ? "enabled" : "disabled"],
            ["Feedback delivery", diag.feedbackEndpointConfigured ? "configured" : "manual only"]
        ];
        if (typeof diag.contactEmail === "string") { rows.push(["Contact email", diag.contactEmail]); }
        return rows;
    }

    function yesNo(v) { return v ? "yes" : "no"; }

    /* ---- current beta limitations (derived from live gates) ---- */

    function currentLimitations() {
        var out = [];
        if (!syncReleaseEnabled()) {
            out.push({ id: "sync", text: "Cloud synchronization is not active in this build — your wallet stays on this device only." });
        }
        if (!passkeyReleaseEnabled()) {
            out.push({ id: "passkeys", text: "Passkeys are not active in this build. Sign in with your email and password." });
        }
        if (!accountDeletionAvailable()) {
            out.push({ id: "account-deletion", text: "Self-service account deletion is not yet available. You can erase this device's wallet in Settings > My Data." });
        }
        if (!feedbackConfigured()) {
            out.push({ id: "feedback-delivery", text: "In-app feedback delivery is not configured yet — you can still copy or download a report to send manually." });
        }
        out.push({ id: "verification", text: "Live cloud, sync, passkey and account-recovery verification is still pending (planned for the pre-beta security pass)." });
        return out;
    }

    /* ---- report id (report-scoped, not a user/device id) ---- */

    function generateReportId(gen) {
        var uuid;
        try {
            if (typeof gen === "function") {
                uuid = gen();
            } else if (typeof global.crypto !== "undefined" && typeof global.crypto.randomUUID === "function") {
                uuid = global.crypto.randomUUID();
            }
        } catch (e) { uuid = null; }
        if (!uuid || typeof uuid !== "string") {
            /* non-crypto fallback — still just a report tag */
            uuid = "x" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
        }
        return "MWB-" + uuid;
    }

    /* ---- curated release notes (no runtime GitHub fetch) ---- */

    var RELEASE_NOTES = {
        version: "0.9.0-beta.10",
        title: "What's new in this beta",
        highlights: [
            "New Beta Hub in Settings — version, limitations, known issues, and what's new in one place.",
            "Report a beta problem: a structured bug / feedback form with optional privacy-safe technical diagnostics.",
            "Copy or download any report as a file — nothing is sent unless you choose Send (and only when a feedback destination is configured).",
            "The same report action is available from the sign-in screen if you're locked out.",
            "No analytics, no tracking, no automatic crash reporting — feedback is only ever sent when you press Send."
        ],
        note: "CHANGELOG.md remains the full developer history."
    };

    function releaseNotes() {
        return {
            version: RELEASE_NOTES.version,
            title: RELEASE_NOTES.title,
            highlights: RELEASE_NOTES.highlights.slice(),
            note: RELEASE_NOTES.note,
            matchesBuild: RELEASE_NOTES.version === appVersion()
        };
    }

    /* ---- safe developer diagnostics (no PII) ---- */

    function diagnostics() {
        return {
            appVersion: appVersion(),
            betaChannel: "beta",
            feedbackConfigured: feedbackConfigured(),
            supportConfigured: supportConfigured(),
            knownIssueCount: knownIssueCount(),
            syncReleaseEnabled: syncReleaseEnabled(),
            passkeyReleaseEnabled: passkeyReleaseEnabled(),
            accountDeletionAvailable: accountDeletionAvailable()
        };
    }

    global.MWalletBetaOps = {
        getBuildSummary: getBuildSummary,
        safeDiagnostics: safeDiagnostics,
        diagnosticsPreview: diagnosticsPreview,
        currentLimitations: currentLimitations,
        generateReportId: generateReportId,
        releaseNotes: releaseNotes,
        diagnostics: diagnostics,
        authStateLabel: authStateLabel,
        currentPage: currentPage,
        configureForTest: configureForTest
    };

})(typeof window !== "undefined" ? window : this);
