"use strict";

/* =========================================================
   M-WALLET — BETA FEEDBACK   (BP11)

       window.MWalletBetaFeedback

   No DOM. Validates a tester-composed report, builds the
   versioned payload, and — only on an explicit Send with a
   configured HTTPS endpoint — POSTs it.

   HARD RULES
     - USER-INITIATED ONLY. Nothing here runs on load,
       navigation, error, crash, save, logout, or install.
     - No automatic retry, no background queue, no
       localStorage. Form state lives in the UI layer's
       memory; a refresh loses the draft (by design).
     - The report carries NO financial object, NO wallet
       export, NO raw session, NO token. The signed-in email
       is included ONLY when the tester opts in and passes it.
     - `fetch` is used ONLY in `submit()` and ONLY against a
       developer/deploy-configured HTTPS endpoint. No secret
       key is ever required or sent.
   ========================================================= */

(function (global) {

    var FORMAT = "m-wallet-beta-feedback";
    var FORMAT_VERSION = 1;   /* independent of app version / wallet schema / export format */

    var CATEGORIES = ["bug", "data", "performance", "usability", "feature", "other"];
    var SEVERITIES = ["blocker", "major", "minor", "suggestion"];

    var LIMITS = {
        title: 120,
        description: 5000,
        stepsToReproduce: 3000,
        expectedBehavior: 3000,
        actualBehavior: 3000,
        contactEmail: 254
    };

    /* the whole serialized report is capped well under a typical form
       provider's body limit; documented in docs/BP11-BETA-OPERATIONS.md */
    var MAX_REPORT_BYTES = 48 * 1024;

    var DEFAULT_TIMEOUT_MS = 15000;

    var CODES = [
        "disabled", "not_configured", "invalid_report", "invalid_endpoint",
        "offline", "sending", "timeout", "network_error", "server_error",
        "cancelled", "copy_failed", "download_failed", "unknown_error"
    ];

    var overrides = null;   /* test-only */

    function deps() {
        if (overrides) { return overrides; }
        return {
            config: global.MWalletBetaConfig || null,
            ops: global.MWalletBetaOps || null,
            fetch: (typeof fetch === "function") ? fetch : null,
            AbortController: (typeof AbortController === "function") ? AbortController : null,
            online: function () {
                try { return (typeof navigator !== "undefined") ? navigator.onLine !== false : true; }
                catch (e) { return true; }
            },
            nowIso: function () { try { return new Date().toISOString(); } catch (e) { return "1970-01-01T00:00:00.000Z"; } }
        };
    }

    function configureForTest(next) {
        overrides = (next == null) ? null : Object.assign({}, deps(), next);
    }

    function code(c) { return CODES.indexOf(c) !== -1 ? c : "unknown_error"; }
    function fail(c, extra) { return Object.assign({ ok: false, code: code(c) }, extra || {}); }


    /* ---- text hygiene ---- */

    /* trim, strip null bytes + other C0 controls (keep \n and \t),
       normalise CRLF -> LF, and hard-cap the length */
    function cleanText(value, max) {
        var s = String(value == null ? "" : value);
        s = s.replace(/\r\n?/g, "\n");
        s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
        s = s.trim();
        if (typeof max === "number" && s.length > max) { s = s.slice(0, max); }
        return s;
    }

    function isEmail(value) {
        var v = String(value || "").trim();
        if (!v || v.length > LIMITS.contactEmail) { return false; }
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    /* recursively reject prototype-pollution keys + non-JSON-safe values */
    function scanUnsafe(value, seen) {
        seen = seen || [];
        if (value === null) { return null; }
        var t = typeof value;
        if (t === "string" || t === "boolean") { return null; }
        if (t === "number") { return isFinite(value) ? null : "non_finite"; }
        if (t === "undefined" || t === "function" || t === "symbol" || t === "bigint") { return "bad_type"; }
        if (t === "object") {
            if (seen.indexOf(value) !== -1) { return "cycle"; }
            seen.push(value);
            var keys = Object.keys(value);
            for (var i = 0; i < keys.length; i++) {
                var k = keys[i];
                if (k === "__proto__" || k === "prototype" || k === "constructor") { return "unsafe_key"; }
                var bad = scanUnsafe(value[k], seen);
                if (bad) { return bad; }
            }
            seen.pop();
            return null;
        }
        return "bad_type";
    }


    /* ---- validation ---- */

    /* -> { ok:true, value } | { ok:false, code:"invalid_report", errors:{field:reason} } */
    function validate(input) {
        input = input || {};
        var errors = {};

        var category = CATEGORIES.indexOf(input.category) !== -1 ? input.category : null;
        if (!category) { errors.category = "invalid"; }

        var severity = SEVERITIES.indexOf(input.severity) !== -1 ? input.severity : null;
        if (!severity) { errors.severity = "invalid"; }

        var title = cleanText(input.title, LIMITS.title);
        if (!title) { errors.title = "required"; }

        var description = cleanText(input.description, LIMITS.description);
        if (!description) { errors.description = "required"; }

        var steps = cleanText(input.stepsToReproduce, LIMITS.stepsToReproduce);
        var expected = cleanText(input.expectedBehavior, LIMITS.expectedBehavior);
        var actual = cleanText(input.actualBehavior, LIMITS.actualBehavior);

        var wantEmail = input.includeContactEmail === true;
        var contactEmail = null;
        if (wantEmail) {
            if (!isEmail(input.contactEmail)) { errors.contactEmail = "invalid"; }
            else { contactEmail = String(input.contactEmail).trim(); }
        }

        if (Object.keys(errors).length) {
            return { ok: false, code: "invalid_report", errors: errors };
        }

        return {
            ok: true,
            value: {
                category: category,
                severity: severity,
                title: title,
                description: description,
                stepsToReproduce: steps,
                expectedBehavior: expected,
                actualBehavior: actual,
                includeContactEmail: wantEmail,
                contactEmail: contactEmail,
                includeDiagnostics: input.includeDiagnostics === true
            }
        };
    }


    /* ---- report payload ---- */

    /* build the wrapper. `context` may inject { reportId, createdAt,
       diagnostics } for tests; otherwise diagnostics are collected from
       MWalletBetaOps only when the tester opted in. */
    function buildReport(input, context) {
        context = context || {};
        var v = validate(input);
        if (!v.ok) { return v; }
        var val = v.value;

        var ops = deps().ops;
        var reportId = context.reportId
            || (ops && typeof ops.generateReportId === "function" ? ops.generateReportId(context.idGen) : "MWB-unknown");
        var createdAt = context.createdAt || deps().nowIso();

        var diagnostics = null;
        if (val.includeDiagnostics) {
            if (context.diagnostics && typeof context.diagnostics === "object") {
                diagnostics = context.diagnostics;
            } else if (ops && typeof ops.safeDiagnostics === "function") {
                diagnostics = ops.safeDiagnostics({
                    includeContactEmail: val.includeContactEmail,
                    contactEmail: val.contactEmail
                });
            }
        }

        var report = {
            format: FORMAT,
            formatVersion: FORMAT_VERSION,
            reportId: reportId,
            createdAt: createdAt,
            appVersion: (ops && typeof ops.getBuildSummary === "function") ? ops.getBuildSummary().appVersion : "unknown",
            channel: "beta",
            category: val.category,
            severity: val.severity,
            title: val.title,
            description: val.description,
            stepsToReproduce: val.stepsToReproduce,
            expectedBehavior: val.expectedBehavior,
            actualBehavior: val.actualBehavior,
            contactEmail: val.includeContactEmail ? val.contactEmail : null,
            diagnostics: diagnostics
        };

        var unsafe = scanUnsafe(report);
        if (unsafe) { return fail("invalid_report", { errors: { report: unsafe } }); }

        var json;
        try { json = JSON.stringify(report); }
        catch (e) { return fail("invalid_report", { errors: { report: "unserializable" } }); }
        if (byteLength(json) > MAX_REPORT_BYTES) {
            return fail("invalid_report", { errors: { report: "too_large" } });
        }

        return { ok: true, report: report };
    }

    function byteLength(str) {
        try {
            if (typeof TextEncoder === "function") { return new TextEncoder().encode(str).length; }
        } catch (e) { /* fall through */ }
        return unescape(encodeURIComponent(String(str))).length;
    }

    function serialize(report, pretty) {
        try { return JSON.stringify(report, null, pretty ? 2 : 0); }
        catch (e) { return ""; }
    }

    /* human-readable plain text for "Copy report" */
    function toPlainText(report) {
        if (!report || typeof report !== "object") { return ""; }
        var L = [];
        L.push("M-Wallet beta report " + (report.reportId || ""));
        L.push("Created: " + (report.createdAt || ""));
        L.push("App version: " + (report.appVersion || "") + " (" + (report.channel || "beta") + ")");
        L.push("Category: " + (report.category || ""));
        L.push("Severity: " + (report.severity || ""));
        L.push("");
        L.push("Title: " + (report.title || ""));
        L.push("");
        L.push("Description:");
        L.push(report.description || "");
        if (report.stepsToReproduce) { L.push(""); L.push("Steps to reproduce:"); L.push(report.stepsToReproduce); }
        if (report.expectedBehavior) { L.push(""); L.push("Expected:"); L.push(report.expectedBehavior); }
        if (report.actualBehavior) { L.push(""); L.push("Actually happened:"); L.push(report.actualBehavior); }
        L.push("");
        L.push("Contact email: " + (report.contactEmail || "(not included)"));
        L.push("Technical diagnostics: " + (report.diagnostics ? "included" : "not included"));
        if (report.diagnostics) {
            L.push("");
            Object.keys(report.diagnostics).forEach(function (k) {
                L.push("  " + k + ": " + String(report.diagnostics[k]));
            });
        }
        return L.join("\n");
    }

    function downloadFilename(report) {
        var id = (report && report.reportId) ? String(report.reportId) : "MWB-report";
        var safe = id.replace(/[^A-Za-z0-9._-]/g, "");
        return "m-wallet-feedback-" + safe + ".json";
    }


    /* ---- transport (the ONLY network boundary in BP11) ---- */

    function resolvedEndpoint() {
        var c = deps().config;
        try {
            var got = c && typeof c.get === "function" ? c.get() : null;
            return got && got.feedbackEndpoint ? got.feedbackEndpoint : null;
        } catch (e) { return null; }
    }

    /* submit a report the caller already built with buildReport().
       opts: { transport, timeoutMs }  (transport injected for tests) */
    function submit(report, opts) {
        opts = opts || {};

        if (!report || report.format !== FORMAT) {
            return Promise.resolve(fail("invalid_report"));
        }

        var endpoint = opts.endpoint || resolvedEndpoint();
        if (!endpoint) { return Promise.resolve(fail("not_configured")); }

        var cfg = deps().config;
        if (cfg && typeof cfg.isValidEndpoint === "function" && !cfg.isValidEndpoint(endpoint)) {
            return Promise.resolve(fail("invalid_endpoint"));
        }

        if (!deps().online()) { return Promise.resolve(fail("offline")); }

        var body;
        try { body = JSON.stringify(report); }
        catch (e) { return Promise.resolve(fail("invalid_report")); }
        if (byteLength(body) > MAX_REPORT_BYTES) { return Promise.resolve(fail("invalid_report")); }

        var transport = opts.transport || deps().fetch;
        if (typeof transport !== "function") { return Promise.resolve(fail("network_error")); }

        var timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
        var AC = deps().AbortController;
        var controller = AC ? new AC() : null;
        var timedOut = false;
        var timer = null;
        if (controller && typeof setTimeout === "function") {
            timer = setTimeout(function () { timedOut = true; try { controller.abort(); } catch (e) {} }, timeoutMs);
        }

        var req = {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: body,
            mode: "cors",
            credentials: "omit",
            cache: "no-store"
        };
        if (controller) { req.signal = controller.signal; }

        return Promise.resolve()
            .then(function () { return transport(endpoint, req); })
            .then(function (res) {
                if (timer) { clearTimeout(timer); }
                return normalizeResponse(res, report.reportId);
            })
            .catch(function () {
                if (timer) { clearTimeout(timer); }
                return timedOut ? fail("timeout") : fail("network_error");
            });
    }

    /* never render an arbitrary endpoint body — accept only a small
       plain-string reference, else fall back to the local report id */
    function normalizeResponse(res, localReportId) {
        var status = res && typeof res.status === "number" ? res.status : 0;

        if (status >= 500) { return fail("server_error", { status: status }); }
        if (status >= 400) { return fail("server_error", { status: status }); }
        if (status < 200 || status >= 300) { return fail("server_error", { status: status || 0 }); }

        var reference = null;
        return Promise.resolve()
            .then(function () {
                if (res && typeof res.json === "function") { return res.json(); }
                return null;
            })
            .catch(function () { return null; })
            .then(function (data) {
                if (data && typeof data === "object") {
                    var raw = data.reference || data.id || data.ticket || null;
                    if (typeof raw === "string" && raw.length > 0 && raw.length <= 120 && /^[\w.\- ]+$/.test(raw)) {
                        reference = raw;
                    }
                }
                return {
                    ok: true,
                    reportId: localReportId || null,
                    reference: reference   /* may be null — UI shows the local reportId */
                };
            });
    }

    global.MWalletBetaFeedback = {
        FORMAT: FORMAT,
        FORMAT_VERSION: FORMAT_VERSION,
        CATEGORIES: CATEGORIES.slice(),
        SEVERITIES: SEVERITIES.slice(),
        LIMITS: Object.assign({}, LIMITS),
        MAX_REPORT_BYTES: MAX_REPORT_BYTES,
        ERROR_CODES: CODES.slice(),

        validate: validate,
        buildReport: buildReport,
        serialize: serialize,
        toPlainText: toPlainText,
        downloadFilename: downloadFilename,
        submit: submit,

        configureForTest: configureForTest
    };

})(typeof window !== "undefined" ? window : this);
