"use strict";

/* =========================================================
   M-WALLET — BETA HUB + FEEDBACK UI   (BP11)

       window.MWalletBetaUI

   DOM only. Renders the Settings "Beta Hub" and drives:
     - the feedback / bug-report dialog  (#mw-beta-feedback-dialog)
     - the known-issues dialog           (#mw-beta-known-issues-dialog)
     - the what's-new dialog             (#mw-beta-whats-new-dialog)

   HARD RULES
     - Fails open: if this module (or any beta module) is
       missing or throws, the financial app and the auth
       gateway keep working. Authentication never depends on
       feedback code.
     - No network here. `submit` is delegated to
       MWalletBetaFeedback and only ever on an explicit Send.
     - No localStorage. Form state lives in memory; a refresh
       loses the draft (by design, for privacy).
     - All tester / issue text is rendered with textContent.
       Never innerHTML.
   ========================================================= */

(function (global) {

    var FEEDBACK_DIALOG = "mw-beta-feedback-dialog";
    var ISSUES_DIALOG = "mw-beta-known-issues-dialog";
    var WHATS_NEW_DIALOG = "mw-beta-whats-new-dialog";

    var CATEGORY_LABELS = {
        bug: "Bug", data: "Data issue", performance: "Performance issue",
        usability: "Usability / UX", feature: "Feature request", other: "Other"
    };
    var SEVERITY_LABELS = {
        blocker: "Blocks me", major: "Major problem", minor: "Minor problem", suggestion: "Suggestion"
    };

    var ERROR_TEXT = {
        disabled: "Feedback isn't available right now.",
        not_configured: "In-app sending isn't set up for this build — please Copy or Download your report.",
        invalid_report: "Please fill in the required fields (title and description).",
        invalid_endpoint: "The feedback destination is misconfigured — please Copy or Download instead.",
        offline: "You're offline. Your report has not been sent.",
        sending: "Still sending — please wait.",
        timeout: "That took too long. Your report was not sent — try again, or Copy / Download it.",
        network_error: "Couldn't reach the feedback service. Your report was not sent — try again, or Copy / Download it.",
        server_error: "The feedback service rejected the report. Try again later, or Copy / Download it.",
        cancelled: "Cancelled.",
        copy_failed: "Couldn't copy to the clipboard — try Download instead.",
        download_failed: "Couldn't create the download.",
        unknown_error: "Something went wrong. Your report was not sent."
    };


    /* =====================================================
       PURE HELPERS (unit-tested)
       ===================================================== */

    function friendlyError(code) { return ERROR_TEXT[code] || ERROR_TEXT.unknown_error; }

    function categoryLabel(v) { return CATEGORY_LABELS[v] || "Other"; }
    function severityLabel(v) { return SEVERITY_LABELS[v] || "Minor problem"; }

    function feedbackDeliveryLabel(configured) {
        return configured ? "Configured" : "Manual copy / download only";
    }

    function isDirty(form) {
        if (!form) { return false; }
        return ["title", "description", "steps", "expected", "actual"].some(function (k) {
            return String(form[k] || "").trim().length > 0;
        });
    }

    function reviewRows(form, report) {
        var rows = [
            ["Type", categoryLabel(form.category)],
            ["Severity", severityLabel(form.severity)],
            ["Title", form.title],
            ["Description", form.description]
        ];
        if (form.steps) { rows.push(["Steps to reproduce", form.steps]); }
        if (form.expected) { rows.push(["Expected", form.expected]); }
        if (form.actual) { rows.push(["What actually happened", form.actual]); }
        rows.push(["Contact email", form.includeEmail && form.contactEmail ? form.contactEmail : "not included"]);
        rows.push(["Technical diagnostics", form.includeDiagnostics ? "included" : "not included"]);
        if (report && report.reportId) { rows.push(["Report ID", report.reportId]); }
        return rows;
    }

    function blankForm() {
        return {
            category: "bug", severity: "major",
            title: "", description: "", steps: "", expected: "", actual: "",
            includeDiagnostics: false, includeEmail: false, contactEmail: ""
        };
    }


    /* =====================================================
       DEPENDENCIES (overridable for tests)
       ===================================================== */

    var doc = null;
    var deps = {
        feedback: null, ops: null, config: null, knownIssues: null, account: null,
        clipboard: null, download: null, confirm: null
    };

    function feedback() { return deps.feedback || global.MWalletBetaFeedback || null; }
    function ops() { return deps.ops || global.MWalletBetaOps || null; }
    function config() { return deps.config || global.MWalletBetaConfig || null; }
    function knownIssues() { return deps.knownIssues || global.MWalletBetaKnownIssues || null; }

    function askConfirm(message) {
        if (typeof deps.confirm === "function") { return deps.confirm(message); }
        try { return global.confirm ? global.confirm(message) : true; }
        catch (e) { return true; }
    }

    function copyToClipboard(text) {
        if (typeof deps.clipboard === "function") { return Promise.resolve(deps.clipboard(text)); }
        try {
            if (global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === "function") {
                return global.navigator.clipboard.writeText(String(text));
            }
        } catch (e) { /* fall through */ }
        return Promise.reject(new Error("no_clipboard"));
    }

    function triggerDownload(filename, text, mimeType) {
        if (typeof deps.download === "function") { return deps.download(filename, text, mimeType); }
        try {
            var blob = new global.Blob([text], { type: mimeType || "application/json" });
            var url = global.URL.createObjectURL(blob);
            var a = doc.createElement("a");
            a.href = url;
            a.download = filename;
            a.rel = "noopener";
            (doc.body || doc.documentElement).appendChild(a);
            a.click();
            if (a.parentNode) { a.parentNode.removeChild(a); }
            global.setTimeout(function () { try { global.URL.revokeObjectURL(url); } catch (e) {} }, 4000);
            return true;
        } catch (e) { return false; }
    }

    function configureForTest(overrides) {
        if (overrides == null) {
            deps = { feedback: null, ops: null, config: null, knownIssues: null, account: null, clipboard: null, download: null, confirm: null };
            doc = (typeof document !== "undefined") ? document : null;
            wired = false;
            resetState();
            return;
        }
        if (overrides.doc) { doc = overrides.doc; }
        ["feedback", "ops", "config", "knownIssues", "account", "clipboard", "download", "confirm"].forEach(function (k) {
            if (k in overrides) { deps[k] = overrides[k]; }
        });
    }


    /* =====================================================
       DOM UTILITIES
       ===================================================== */

    function $(id) { return (doc && typeof doc.getElementById === "function") ? doc.getElementById(id) : null; }
    function setText(id, v) { var el = $(id); if (el) { el.textContent = (v == null ? "" : String(v)); } }
    function show(el) { if (el) { el.hidden = false; } }
    function hide(el) { if (el) { el.hidden = true; } }

    function setMsg(id, message, type) {
        var el = $(id);
        if (!el) { return; }
        el.textContent = message || "";
        if (el.classList) {
            el.classList.remove("is-success", "is-error", "is-info");
            if (type) { el.classList.add("is-" + type); }
        }
        el.hidden = !message;
    }

    function clearChildren(el) {
        if (!el) { return; }
        if (typeof el.replaceChildren === "function") { el.replaceChildren(); return; }
        while (el.firstChild) { el.removeChild(el.firstChild); }
        el.textContent = "";
    }

    function rowList(host, rows) {
        clearChildren(host);
        rows.forEach(function (pair) {
            var line = doc.createElement("div");
            line.className = "mw-beta-kv";
            var k = doc.createElement("span");
            k.className = "mw-beta-kv-k";
            k.textContent = pair[0];
            var v = doc.createElement("span");
            v.className = "mw-beta-kv-v";
            v.textContent = String(pair[1] == null ? "" : pair[1]);
            line.appendChild(k);
            line.appendChild(v);
            host.appendChild(line);
        });
    }


    /* =====================================================
       STATE
       ===================================================== */

    var form = blankForm();
    var step = "form";          /* form | review | sent */
    var lastReport = null;
    var lastResult = null;      /* the outcome of the most recent action */
    var sending = false;
    var openDialogId = null;
    var dialogOpener = null;

    function resetState() {
        form = blankForm();
        step = "form";
        lastReport = null;
        lastResult = null;
        sending = false;
    }


    /* =====================================================
       BETA HUB (Settings)
       ===================================================== */

    function render() {
        if (!doc || typeof doc.getElementById !== "function") { return; }
        try { renderHub(); } catch (e) { /* fail open — Settings still works */ }
    }

    function renderHub() {
        var o = ops();
        var summary = (o && typeof o.getBuildSummary === "function") ? o.getBuildSummary() : null;
        var cfg = config() && typeof config().get === "function" ? config().get() : null;

        if (summary) {
            setText("mw-beta-hub-program", summary.programName);
            setText("mw-beta-hub-version", summary.appVersion);
        }

        setText("mw-beta-hub-delivery", feedbackDeliveryLabel(!!(cfg && cfg.feedbackConfigured)));

        /* support status */
        var supportEl = $("mw-beta-hub-support");
        if (supportEl) {
            if (cfg && cfg.supportConfigured && cfg.supportEmail) {
                supportEl.textContent = cfg.supportEmail;
            } else {
                supportEl.textContent = "Direct support contact has not been configured for this build.";
            }
        }

        /* limitations */
        var limHost = $("mw-beta-hub-limitations");
        if (limHost && o && typeof o.currentLimitations === "function") {
            clearChildren(limHost);
            var lims = o.currentLimitations();
            if (!lims.length) {
                var none = doc.createElement("li");
                none.textContent = "No current beta limitations.";
                limHost.appendChild(none);
            } else {
                lims.forEach(function (lim) {
                    var li = doc.createElement("li");
                    li.textContent = lim.text;
                    limHost.appendChild(li);
                });
            }
        }

        /* known-issues count */
        var ki = knownIssues();
        var kiCount = (ki && typeof ki.count === "function") ? ki.count() : 0;
        setText("mw-beta-hub-known-issues-count", kiCount === 0
            ? "None published"
            : (kiCount === 1 ? "1 published" : kiCount + " published"));
    }


    /* =====================================================
       FEEDBACK DIALOG
       ===================================================== */

    function openFeedback(opener) {
        resetState();
        dialogOpener = opener || (doc && doc.activeElement) || null;
        syncFormToDom();
        showStep("form");
        setMsg("mw-beta-feedback-msg", "", null);
        var dlg = $(FEEDBACK_DIALOG);
        if (dlg) {
            dlg.hidden = false;
            if (dlg.setAttribute) { dlg.setAttribute("aria-hidden", "false"); }
        }
        openDialogId = FEEDBACK_DIALOG;
        var title = $("mw-beta-feedback-title");
        if (title && typeof title.focus === "function") { title.focus(); }
    }

    function closeFeedback(force) {
        if (!force && step === "form" && isDirty(form)) {
            if (!askConfirm("Discard this unsent report?")) { return; }
        }
        var dlg = $(FEEDBACK_DIALOG);
        if (dlg) {
            dlg.hidden = true;
            if (dlg.setAttribute) { dlg.setAttribute("aria-hidden", "true"); }
        }
        openDialogId = null;
        restoreFocus();
        resetState();
    }

    function restoreFocus() {
        try { if (dialogOpener && typeof dialogOpener.focus === "function") { dialogOpener.focus(); } }
        catch (e) { /* ignore */ }
        dialogOpener = null;
    }

    function showStep(next) {
        step = next;
        toggleHidden("mw-beta-feedback-step-form", next !== "form");
        toggleHidden("mw-beta-feedback-step-review", next !== "review");
        toggleHidden("mw-beta-feedback-step-sent", next !== "sent");
    }

    function toggleHidden(id, hidden) { var el = $(id); if (el) { el.hidden = !!hidden; } }

    /* push the in-memory form into the input elements (open / reset) */
    function syncFormToDom() {
        setValue("mw-beta-field-category", form.category);
        setValue("mw-beta-field-severity", form.severity);
        setValue("mw-beta-field-title", form.title);
        setValue("mw-beta-field-description", form.description);
        setValue("mw-beta-field-steps", form.steps);
        setValue("mw-beta-field-expected", form.expected);
        setValue("mw-beta-field-actual", form.actual);
        setChecked("mw-beta-diag-check", form.includeDiagnostics);
        setChecked("mw-beta-email-check", form.includeEmail);
        setValue("mw-beta-field-email", form.contactEmail);
        toggleHidden("mw-beta-email-row", !form.includeEmail);
        toggleHidden("mw-beta-diag-preview", true);
    }

    function setValue(id, v) { var el = $(id); if (el) { el.value = (v == null ? "" : String(v)); } }
    function setChecked(id, v) { var el = $(id); if (el) { el.checked = !!v; } }

    /* pull the input elements into the in-memory form (on change / before validate) */
    function syncDomToForm() {
        form.category = getValue("mw-beta-field-category") || "bug";
        form.severity = getValue("mw-beta-field-severity") || "major";
        form.title = getValue("mw-beta-field-title");
        form.description = getValue("mw-beta-field-description");
        form.steps = getValue("mw-beta-field-steps");
        form.expected = getValue("mw-beta-field-expected");
        form.actual = getValue("mw-beta-field-actual");
        form.includeDiagnostics = getChecked("mw-beta-diag-check");
        form.includeEmail = getChecked("mw-beta-email-check");
        form.contactEmail = getValue("mw-beta-field-email");
    }

    function getValue(id) { var el = $(id); return el ? String(el.value || "") : ""; }
    function getChecked(id) { var el = $(id); return !!(el && el.checked); }

    function contactEmailForReport() {
        if (!form.includeEmail) { return null; }
        if (form.contactEmail && form.contactEmail.trim()) { return form.contactEmail.trim(); }
        /* fall back to the signed-in account email ONLY because the tester
           explicitly opted in */
        try {
            var a = deps.account || global.MWalletAccount;
            var s = a && typeof a.getSummary === "function" ? a.getSummary() : null;
            return (s && s.account && s.account.email) ? s.account.email : null;
        } catch (e) { return null; }
    }

    function buildCurrentReport() {
        var fb = feedback();
        if (!fb || typeof fb.buildReport !== "function") { return { ok: false, code: "disabled" }; }
        var email = contactEmailForReport();
        return fb.buildReport({
            category: form.category,
            severity: form.severity,
            title: form.title,
            description: form.description,
            stepsToReproduce: form.steps,
            expectedBehavior: form.expected,
            actualBehavior: form.actual,
            includeDiagnostics: form.includeDiagnostics,
            includeContactEmail: !!(form.includeEmail && email),
            contactEmail: email
        });
    }

    function onReview() {
        syncDomToForm();
        var built = buildCurrentReport();
        if (!built.ok) {
            markFieldErrors(built.errors);
            setMsg("mw-beta-feedback-msg", friendlyError(built.code || "invalid_report"), "error");
            return;
        }
        lastReport = built.report;
        var host = $("mw-beta-review-list");
        if (host) { rowList(host, reviewRows(form, lastReport)); }
        setMsg("mw-beta-feedback-msg", "", null);
        showStep("review");
        var t = $("mw-beta-review-title");
        if (t && typeof t.focus === "function") { t.focus(); }
    }

    function markFieldErrors(errors) {
        ["title", "description", "category", "severity", "contactEmail"].forEach(function (f) {
            var el = $("mw-beta-field-" + (f === "contactEmail" ? "email" : f));
            if (el && el.classList) { el.classList.toggle("is-invalid", !!(errors && errors[f])); }
        });
    }

    function onBackToForm() {
        showStep("form");
        setMsg("mw-beta-feedback-msg", "", null);
    }

    function onSend(trigger) {
        if (sending) { return; }
        var fb = feedback();
        var cfg = config() && typeof config().get === "function" ? config().get() : null;
        if (!fb || typeof fb.submit !== "function") {
            setMsg("mw-beta-feedback-msg", friendlyError("disabled"), "error");
            return;
        }
        if (!cfg || !cfg.feedbackConfigured) {
            setMsg("mw-beta-feedback-msg", friendlyError("not_configured"), "error");
            return;
        }
        if (!lastReport) {
            onReview();
            if (!lastReport) { return; }
        }
        sending = true;
        setSendDisabled(true);
        setMsg("mw-beta-feedback-msg", "Sending…", "info");
        Promise.resolve(fb.submit(lastReport, {})).then(function (res) {
            sending = false;
            setSendDisabled(false);
            lastResult = res;
            if (res && res.ok) {
                setText("mw-beta-sent-ref", res.reference || res.reportId || lastReport.reportId || "");
                setMsg("mw-beta-feedback-msg", "", null);
                showStep("sent");
                var s = $("mw-beta-sent-title");
                if (s && typeof s.focus === "function") { s.focus(); }
            } else {
                /* keep the form contents; offer Retry / Copy / Download */
                setMsg("mw-beta-feedback-msg", friendlyError(res && res.code), "error");
            }
        }).catch(function () {
            sending = false;
            setSendDisabled(false);
            setMsg("mw-beta-feedback-msg", friendlyError("network_error"), "error");
        });
    }

    function setSendDisabled(on) {
        var b = $("mw-beta-send-btn");
        if (b) { b.disabled = !!on; }
    }

    function ensureReport() {
        if (!lastReport) { onReview(); }
        return lastReport;
    }

    function onCopy() {
        var fb = feedback();
        var report = ensureReport();
        if (!report || !fb) { return; }
        var text = (typeof fb.toPlainText === "function") ? fb.toPlainText(report) : fb.serialize(report, true);
        Promise.resolve(copyToClipboard(text)).then(function () {
            setMsg("mw-beta-feedback-msg", "Copied. Paste it wherever you're sending feedback.", "success");
        }).catch(function () {
            setMsg("mw-beta-feedback-msg", friendlyError("copy_failed"), "error");
        });
    }

    function onDownload() {
        var fb = feedback();
        var report = ensureReport();
        if (!report || !fb) { return; }
        var name = (typeof fb.downloadFilename === "function") ? fb.downloadFilename(report) : "m-wallet-feedback.json";
        var json = fb.serialize(report, true);
        var okDl = triggerDownload(name, json, "application/json");
        if (okDl === false) {
            setMsg("mw-beta-feedback-msg", friendlyError("download_failed"), "error");
            return;
        }
        setMsg("mw-beta-feedback-msg", "Downloaded. The file contains exactly what you typed — check it before sharing.", "success");
    }

    function onToggleDiagPreview() {
        var panel = $("mw-beta-diag-preview");
        if (!panel) { return; }
        if (!panel.hidden) { panel.hidden = true; return; }
        var o = ops();
        if (o && typeof o.diagnosticsPreview === "function") {
            var diag = (typeof o.safeDiagnostics === "function")
                ? o.safeDiagnostics({ includeContactEmail: form.includeEmail, contactEmail: contactEmailForReport() })
                : null;
            rowList(panel, o.diagnosticsPreview(diag));
        }
        panel.hidden = false;
    }

    function onNewReport() {
        resetState();
        syncFormToDom();
        showStep("form");
        setMsg("mw-beta-feedback-msg", "", null);
        var t = $("mw-beta-feedback-title");
        if (t && typeof t.focus === "function") { t.focus(); }
    }


    /* =====================================================
       KNOWN ISSUES / WHAT'S NEW
       ===================================================== */

    function openKnownIssues(opener) {
        dialogOpener = opener || (doc && doc.activeElement) || null;
        var host = $("mw-beta-known-issues-list");
        var emptyEl = $("mw-beta-known-issues-empty");
        var ki = knownIssues();
        var items = (ki && typeof ki.list === "function") ? ki.list() : [];
        if (host) {
            clearChildren(host);
            items.forEach(function (issue) {
                var li = doc.createElement("li");
                li.className = "mw-beta-issue";
                var h = doc.createElement("strong");
                h.textContent = issue.title;
                var meta = doc.createElement("span");
                meta.className = "mw-beta-issue-meta";
                meta.textContent = issue.id + " · " + issue.status
                    + (issue.affectedVersions.length ? " · affects " + issue.affectedVersions.join(", ") : "");
                li.appendChild(h);
                li.appendChild(meta);
                if (issue.workaround) {
                    var wa = doc.createElement("p");
                    wa.className = "mw-beta-issue-workaround";
                    wa.textContent = "Workaround: " + issue.workaround;
                    li.appendChild(wa);
                }
                host.appendChild(li);
            });
        }
        if (emptyEl) {
            if (items.length === 0 && ki) {
                emptyEl.textContent = "";
                var p1 = doc.createElement("p");
                p1.textContent = ki.EMPTY_PRIMARY;
                var p2 = doc.createElement("p");
                p2.textContent = ki.EMPTY_SECONDARY;
                emptyEl.appendChild(p1);
                emptyEl.appendChild(p2);
                emptyEl.hidden = false;
            } else {
                emptyEl.hidden = items.length !== 0;
            }
        }
        openSimpleDialog(ISSUES_DIALOG, "mw-beta-known-issues-title");
    }

    function openWhatsNew(opener) {
        dialogOpener = opener || (doc && doc.activeElement) || null;
        var o = ops();
        var notes = (o && typeof o.releaseNotes === "function") ? o.releaseNotes() : null;
        if (notes) {
            setText("mw-beta-whats-new-version", notes.version);
            var host = $("mw-beta-whats-new-list");
            if (host) {
                clearChildren(host);
                notes.highlights.forEach(function (h) {
                    var li = doc.createElement("li");
                    li.textContent = h;
                    host.appendChild(li);
                });
            }
            setText("mw-beta-whats-new-note", notes.note || "");
        }
        openSimpleDialog(WHATS_NEW_DIALOG, "mw-beta-whats-new-title");
    }

    function openSimpleDialog(id, focusId) {
        var dlg = $(id);
        if (!dlg) { return; }
        dlg.hidden = false;
        if (dlg.setAttribute) { dlg.setAttribute("aria-hidden", "false"); }
        openDialogId = id;
        var f = focusId && $(focusId);
        if (f && typeof f.focus === "function") { f.focus(); }
    }

    function closeSimpleDialog(id) {
        var dlg = $(id || openDialogId);
        if (dlg) {
            dlg.hidden = true;
            if (dlg.setAttribute) { dlg.setAttribute("aria-hidden", "true"); }
        }
        openDialogId = null;
        restoreFocus();
    }


    /* =====================================================
       EVENTS
       ===================================================== */

    function onActionClick(event) {
        var t = event && event.target && event.target.closest
            ? event.target.closest("[data-beta-action]") : null;
        if (!t) { return; }
        var action = t.getAttribute("data-beta-action");

        switch (action) {
            case "open-feedback": return openFeedback(t);
            case "feedback-cancel": return closeFeedback(false);
            case "feedback-close": return closeFeedback(false);
            case "feedback-review": return onReview();
            case "feedback-back": return onBackToForm();
            case "feedback-send": return onSend(t);
            case "feedback-copy": return onCopy();
            case "feedback-download": return onDownload();
            case "feedback-view-diagnostics": return onToggleDiagPreview();
            case "feedback-new": return onNewReport();
            case "feedback-done": return closeFeedback(true);
            case "open-known-issues": return openKnownIssues(t);
            case "known-issues-close": return closeSimpleDialog(ISSUES_DIALOG);
            case "open-whats-new": return openWhatsNew(t);
            case "whats-new-close": return closeSimpleDialog(WHATS_NEW_DIALOG);
        }
    }

    function onChange(event) {
        var el = event && event.target;
        if (!el || !el.id) { return; }
        if (el.id === "mw-beta-email-check") {
            form.includeEmail = !!el.checked;
            toggleHidden("mw-beta-email-row", !form.includeEmail);
            return;
        }
        if (el.id === "mw-beta-diag-check") {
            form.includeDiagnostics = !!el.checked;
            return;
        }
        if (el.id && el.id.indexOf("mw-beta-field-") === 0) {
            syncDomToForm();
        }
    }

    function onKeydown(event) {
        if (!openDialogId) { return; }
        var key = event && (event.key || event.code);
        if (key !== "Escape" && key !== "Esc") { return; }
        if (event.preventDefault) { event.preventDefault(); }
        if (openDialogId === FEEDBACK_DIALOG) { closeFeedback(false); }
        else { closeSimpleDialog(openDialogId); }
    }


    /* =====================================================
       WIRING
       ===================================================== */

    var wired = false;

    function init(injectedDoc) {
        doc = injectedDoc || doc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        var settingsPage = $("settings-page");
        var authGate = $("mw-auth-gate");
        var anyDialog = $(FEEDBACK_DIALOG);
        if (!settingsPage && !authGate && !anyDialog) { return false; }

        if (!wired) {
            wired = true;
            /* one delegated listener per host — the auth gateway included,
               so "Report a beta problem" works while signed out / in error */
            [settingsPage, authGate, $(FEEDBACK_DIALOG), $(ISSUES_DIALOG), $(WHATS_NEW_DIALOG)].forEach(function (host) {
                if (host) {
                    host.addEventListener("click", onActionClick);
                    host.addEventListener("change", onChange);
                }
            });
            if (typeof doc.addEventListener === "function") {
                doc.addEventListener("keydown", onKeydown);
                doc.addEventListener("mwallet:page-changed", function (ev) {
                    if (ev && ev.detail && ev.detail.page === "settings") { render(); }
                });
            }
        }

        render();
        return true;
    }


    global.MWalletBetaUI = {
        init: init,
        render: render,
        openFeedback: openFeedback,
        configureForTest: configureForTest,

        /* pure helpers (unit-tested) */
        friendlyError: friendlyError,
        categoryLabel: categoryLabel,
        severityLabel: severityLabel,
        feedbackDeliveryLabel: feedbackDeliveryLabel,
        isDirty: isDirty,
        reviewRows: reviewRows,
        blankForm: blankForm,

        FEEDBACK_DIALOG: FEEDBACK_DIALOG,
        ISSUES_DIALOG: ISSUES_DIALOG,
        WHATS_NEW_DIALOG: WHATS_NEW_DIALOG
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
