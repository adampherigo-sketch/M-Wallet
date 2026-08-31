"use strict";

/* =========================================================
   BP11 — BETA HUB + FEEDBACK UI  (window.MWalletBetaUI)

   DOM only. Beta Hub, feedback dialog (form -> review ->
   sent), known-issues + what's-new dialogs. No network here,
   no localStorage, no raw HTML, no financial content.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { Doc } = require("./helpers/dom-stub.js");
const { MWalletBetaUI: UI } = require("../js/beta/beta-ui.js");

const plain = (v) => JSON.parse(JSON.stringify(v));


/* ---- a DOM with just the BP11 ids -------------------- */

function buildDom() {
    const doc = new Doc();
    const page = doc.createElement("div");
    page.id = "settings-page";
    doc.body.appendChild(page);

    const gate = doc.createElement("div");
    gate.id = "mw-auth-gate";
    doc.body.appendChild(gate);
    const authReport = mk(doc, gate, "button", null, "open-feedback");

    const add = (parent, tag, id, action) => mk(doc, parent, tag, id, action);

    /* Beta Hub */
    ["mw-beta-hub-program", "mw-beta-hub-version", "mw-beta-hub-delivery",
     "mw-beta-hub-support", "mw-beta-hub-known-issues-count"].forEach((id) => add(page, "span", id));
    const limHost = add(page, "ul", "mw-beta-hub-limitations");
    add(page, "button", "mw-beta-report-btn", "open-feedback");
    add(page, "button", "mw-beta-known-issues-btn", "open-known-issues");
    add(page, "button", "mw-beta-whats-new-btn", "open-whats-new");

    /* Feedback dialog */
    const fd = add(doc.body, "div", "mw-beta-feedback-dialog");
    fd.hidden = true;
    add(fd, "h2", "mw-beta-feedback-title");
    add(fd, "p", "mw-beta-feedback-msg");
    const stepForm = add(fd, "div", "mw-beta-feedback-step-form");
    const stepReview = add(fd, "div", "mw-beta-feedback-step-review"); stepReview.hidden = true;
    const stepSent = add(fd, "div", "mw-beta-feedback-step-sent"); stepSent.hidden = true;

    add(stepForm, "select", "mw-beta-field-category");
    add(stepForm, "select", "mw-beta-field-severity");
    add(stepForm, "input", "mw-beta-field-title");
    add(stepForm, "textarea", "mw-beta-field-description");
    add(stepForm, "textarea", "mw-beta-field-steps");
    add(stepForm, "textarea", "mw-beta-field-expected");
    add(stepForm, "textarea", "mw-beta-field-actual");
    add(stepForm, "input", "mw-beta-diag-check");
    add(stepForm, "div", "mw-beta-diag-preview").hidden = true;
    add(stepForm, "input", "mw-beta-email-check");
    add(stepForm, "label", "mw-beta-email-row").hidden = true;
    add(stepForm, "input", "mw-beta-field-email");
    add(stepForm, "button", null, "feedback-cancel");
    add(stepForm, "button", null, "feedback-review");
    add(stepForm, "button", null, "feedback-view-diagnostics");

    add(stepReview, "h3", "mw-beta-review-title");
    add(stepReview, "div", "mw-beta-review-list");
    add(stepReview, "button", null, "feedback-back");
    add(stepReview, "button", null, "feedback-copy");
    add(stepReview, "button", null, "feedback-download");
    add(stepReview, "button", "mw-beta-send-btn", "feedback-send");

    add(stepSent, "h3", "mw-beta-sent-title");
    add(stepSent, "strong", "mw-beta-sent-ref");
    add(stepSent, "button", null, "feedback-new");
    add(stepSent, "button", null, "feedback-done");

    /* known issues */
    const ki = add(doc.body, "div", "mw-beta-known-issues-dialog"); ki.hidden = true;
    add(ki, "h2", "mw-beta-known-issues-title");
    add(ki, "div", "mw-beta-known-issues-empty");
    add(ki, "ul", "mw-beta-known-issues-list");
    add(ki, "button", null, "known-issues-close");

    /* what's new */
    const wn = add(doc.body, "div", "mw-beta-whats-new-dialog"); wn.hidden = true;
    add(wn, "h2", "mw-beta-whats-new-title");
    add(wn, "span", "mw-beta-whats-new-version");
    add(wn, "ul", "mw-beta-whats-new-list");
    add(wn, "p", "mw-beta-whats-new-note");
    add(wn, "button", null, "whats-new-close");

    return { doc, page, gate, authReport, el: (id) => doc.getElementById(id) };
}

function mk(doc, parent, tag, id, action) {
    const el = doc.createElement(tag);
    if (id) { el.id = id; }
    if (action) { el.setAttribute("data-beta-action", action); }
    parent.appendChild(el);
    return el;
}


/* ---- fakes ----------------------------------------- */

function fakes(over) {
    const calls = { submit: [], copy: [], download: [], confirm: [] };
    const f = {
        ops: {
            getBuildSummary: () => ({ programName: "M-Wallet Beta", appVersion: "0.9.0-beta.10", channel: "beta", dataSchema: "5" }),
            currentLimitations: () => [{ id: "sync", text: "Cloud sync is off." }, { id: "verification", text: "Verification pending." }],
            releaseNotes: () => ({ version: "0.9.0-beta.10", title: "What's new", highlights: ["Beta Hub added", "Feedback added"], note: "CHANGELOG.md is canonical." }),
            safeDiagnostics: () => ({ appVersion: "0.9.0-beta.10", currentPage: "settings", online: true }),
            diagnosticsPreview: (d) => [["App version", "0.9.0-beta.10"], ["Current screen", "settings"]]
        },
        config: { get: () => Object.assign({ programName: "M-Wallet Beta", channel: "beta", feedbackEndpoint: null, feedbackConfigured: false, supportEmail: null, supportConfigured: false }, (over && over.cfg) || {}) },
        knownIssues: {
            EMPTY_PRIMARY: "No published known issues for this build.",
            EMPTY_SECONDARY: "Beta software may still contain undiscovered issues.",
            list: () => (over && over.issues) || [],
            count: () => ((over && over.issues) || []).length
        },
        feedback: {
            buildReport: (input) => {
                if (!input.title || !input.description) { return { ok: false, code: "invalid_report", errors: { title: !input.title ? "required" : undefined } }; }
                return { ok: true, report: { format: "m-wallet-beta-feedback", reportId: "MWB-test", title: input.title, description: input.description, diagnostics: input.includeDiagnostics ? { ok: true } : null, contactEmail: input.includeContactEmail ? input.contactEmail : null } };
            },
            serialize: (r) => JSON.stringify(r, null, 2),
            toPlainText: (r) => "M-Wallet beta report " + r.reportId + "\nTitle: " + r.title,
            downloadFilename: (r) => "m-wallet-feedback-" + r.reportId + ".json",
            submit: (report, opts) => { calls.submit.push({ report, opts }); return Promise.resolve((over && over.submitResult) || { ok: true, reportId: report.reportId }); }
        },
        clipboard: (text) => { calls.copy.push(text); return (over && over.copyFails) ? Promise.reject(new Error("x")) : Promise.resolve(); },
        download: (name, text) => { calls.download.push({ name, text }); return (over && over.downloadFails) ? false : true; },
        confirm: (msg) => { calls.confirm.push(msg); return (over && over.confirmResult !== undefined) ? over.confirmResult : true; }
    };
    return { f, calls };
}

function setup(over) {
    const dom = buildDom();
    const { f, calls } = fakes(over);
    UI.configureForTest(Object.assign({ doc: dom.doc }, f));
    UI.init(dom.doc);
    return {
        dom, calls, f,
        click: (id) => dom.el(id).dispatch("click", { target: dom.el(id) }),
        clickAction: (action, host) => {
            const root = host || dom.doc.body;
            const btn = root.querySelector('[data-beta-action="' + action + '"]');
            btn.dispatch("click", { target: btn });
        }
    };
}

test.afterEach(() => UI.configureForTest(null));


/* ---- pure helpers ---------------------------------- */

test("isDirty is true only when a text field has content", () => {
    assert.equal(UI.isDirty(UI.blankForm()), false);
    assert.equal(UI.isDirty(Object.assign(UI.blankForm(), { title: "  " })), false);
    assert.equal(UI.isDirty(Object.assign(UI.blankForm(), { description: "x" })), true);
});

test("labels map to friendly text; feedbackDeliveryLabel is honest", () => {
    assert.equal(UI.categoryLabel("data"), "Data issue");
    assert.equal(UI.severityLabel("blocker"), "Blocks me");
    assert.equal(UI.feedbackDeliveryLabel(true), "Configured");
    assert.match(UI.feedbackDeliveryLabel(false), /copy|download/i);
});

test("reviewRows are label/value pairs and hide un-set optionals", () => {
    const rows = UI.reviewRows({ category: "bug", severity: "major", title: "T", description: "D", steps: "", expected: "", actual: "", includeDiagnostics: false, includeEmail: false }, { reportId: "MWB-x" });
    const flat = plain(rows);
    assert.ok(flat.some((r) => r[0] === "Title" && r[1] === "T"));
    assert.ok(!flat.some((r) => r[0] === "Steps to reproduce"));
    assert.ok(flat.some((r) => r[0] === "Technical diagnostics" && r[1] === "not included"));
});


/* ---- Beta Hub render ------------------------------- */

test("Beta Hub shows version, delivery status, limitations and known-issue count", () => {
    const { dom } = setup();
    assert.equal(dom.el("mw-beta-hub-version").textContent, "0.9.0-beta.10");
    assert.match(dom.el("mw-beta-hub-delivery").textContent, /copy|download/i);
    assert.match(dom.el("mw-beta-hub-support").textContent, /not been configured/i);
    assert.equal(dom.el("mw-beta-hub-known-issues-count").textContent, "None published");
    const lims = dom.el("mw-beta-hub-limitations").childNodes.map((n) => n.textContent);
    assert.ok(lims.some((t) => /cloud sync/i.test(t)));
});

test("Beta Hub shows a configured support email when set", () => {
    const { dom } = setup({ cfg: { supportEmail: "beta@example.com", supportConfigured: true } });
    assert.equal(dom.el("mw-beta-hub-support").textContent, "beta@example.com");
});


/* ---- feedback dialog ------------------------------- */

test("opens from Settings and from the auth gateway", () => {
    const s = setup();
    s.click("mw-beta-report-btn");
    assert.equal(s.dom.el("mw-beta-feedback-dialog").hidden, false);
    UI.configureForTest(null);

    const s2 = setup();
    s2.dom.authReport.dispatch("click", { target: s2.dom.authReport });
    assert.equal(s2.dom.el("mw-beta-feedback-dialog").hidden, false);
});

test("Review requires title + description; errors surface, no step change", () => {
    const s = setup();
    s.click("mw-beta-report-btn");
    s.clickAction("feedback-review");
    assert.equal(s.dom.el("mw-beta-feedback-step-review").hidden, true);
    assert.match(s.dom.el("mw-beta-feedback-msg").textContent, /required fields/i);

    s.dom.el("mw-beta-field-title").value = "It broke";
    s.dom.el("mw-beta-field-description").value = "Here is how";
    s.dom.el("mw-beta-field-title").dispatch("change", { target: s.dom.el("mw-beta-field-title") });
    s.clickAction("feedback-review");
    assert.equal(s.dom.el("mw-beta-feedback-step-review").hidden, false);
    assert.equal(s.dom.el("mw-beta-feedback-step-form").hidden, true);
});

test("review list is built with textContent (no raw HTML)", () => {
    const s = setup();
    s.click("mw-beta-report-btn");
    s.dom.el("mw-beta-field-title").value = "<img src=x onerror=alert(1)>";
    s.dom.el("mw-beta-field-description").value = "<script>alert(1)</script>";
    s.dom.el("mw-beta-field-title").dispatch("change", { target: s.dom.el("mw-beta-field-title") });
    s.clickAction("feedback-review");
    const host = s.dom.el("mw-beta-review-list");
    assert.ok(host.childNodes.length > 0);
    host.childNodes.forEach((row) => {
        row.childNodes.forEach((cell) => assert.equal(typeof cell.textContent, "string"));
    });
    /* the value cell holds the literal string, never parsed markup */
    const flat = host.childNodes.flatMap((r) => r.childNodes.map((c) => c.textContent)).join(" | ");
    assert.ok(flat.includes("<img src=x onerror=alert(1)>"));
});

test("Send is unavailable when no endpoint is configured; Copy / Download still work", async () => {
    const s = setup();   /* cfg feedbackConfigured: false */
    s.click("mw-beta-report-btn");
    s.dom.el("mw-beta-field-title").value = "t";
    s.dom.el("mw-beta-field-description").value = "d";
    s.dom.el("mw-beta-field-title").dispatch("change", { target: s.dom.el("mw-beta-field-title") });
    s.clickAction("feedback-review");

    s.clickAction("feedback-send");
    await tick();
    assert.equal(s.calls.submit.length, 0, "no send without an endpoint");
    assert.match(s.dom.el("mw-beta-feedback-msg").textContent, /copy|download/i);

    s.clickAction("feedback-copy");
    await tick();
    assert.equal(s.calls.copy.length, 1);
    assert.match(s.dom.el("mw-beta-feedback-msg").textContent, /copied/i);

    s.clickAction("feedback-download");
    assert.equal(s.calls.download.length, 1);
    assert.match(s.calls.download[0].name, /^m-wallet-feedback-MWB-test\.json$/);
});

test("with an endpoint: one Send = one submit; double-click suppressed; success shows a reference", async () => {
    const s = setup({ cfg: { feedbackConfigured: true, feedbackEndpoint: "https://example.com/x" }, submitResult: { ok: true, reference: "SUP-9", reportId: "MWB-test" } });
    s.click("mw-beta-report-btn");
    s.dom.el("mw-beta-field-title").value = "t";
    s.dom.el("mw-beta-field-description").value = "d";
    s.dom.el("mw-beta-field-title").dispatch("change", { target: s.dom.el("mw-beta-field-title") });
    s.clickAction("feedback-review");

    const sendBtn = s.dom.el("mw-beta-send-btn");
    sendBtn.dispatch("click", { target: sendBtn });
    sendBtn.dispatch("click", { target: sendBtn });   /* immediate second click */
    await tick();
    assert.equal(s.calls.submit.length, 1, "double-click produced one submit");
    assert.equal(s.dom.el("mw-beta-feedback-step-sent").hidden, false);
    assert.equal(s.dom.el("mw-beta-sent-ref").textContent, "SUP-9");
});

test("a failed send keeps the review step and the form contents; offers retry / copy / download", async () => {
    const s = setup({ cfg: { feedbackConfigured: true, feedbackEndpoint: "https://example.com/x" }, submitResult: { ok: false, code: "network_error" } });
    s.click("mw-beta-report-btn");
    s.dom.el("mw-beta-field-title").value = "keep me";
    s.dom.el("mw-beta-field-description").value = "d";
    s.dom.el("mw-beta-field-title").dispatch("change", { target: s.dom.el("mw-beta-field-title") });
    s.clickAction("feedback-review");
    s.clickAction("feedback-send");
    await tick();
    assert.equal(s.dom.el("mw-beta-feedback-step-review").hidden, false, "still on review");
    assert.match(s.dom.el("mw-beta-feedback-msg").textContent, /not sent/i);
    /* the report is still there to copy */
    s.clickAction("feedback-copy");
    await tick();
    assert.equal(s.calls.copy.length, 1);
});

test("diagnostics + contact email default OFF; preview toggles", () => {
    const s = setup();
    s.click("mw-beta-report-btn");
    assert.equal(s.dom.el("mw-beta-diag-check").checked, false);
    assert.equal(s.dom.el("mw-beta-email-check").checked, false);
    assert.equal(s.dom.el("mw-beta-email-row").hidden, true);

    s.dom.el("mw-beta-email-check").checked = true;
    s.dom.el("mw-beta-email-check").dispatch("change", { target: s.dom.el("mw-beta-email-check") });
    assert.equal(s.dom.el("mw-beta-email-row").hidden, false);

    s.clickAction("feedback-view-diagnostics");
    assert.equal(s.dom.el("mw-beta-diag-preview").hidden, false);
    const rows = s.dom.el("mw-beta-diag-preview").childNodes.flatMap((r) => r.childNodes.map((c) => c.textContent));
    assert.ok(rows.some((t) => /0\.9\.0-beta\.10/.test(t)));
});

test("closing with typed content asks to discard; untouched closes immediately", () => {
    const s = setup({ confirmResult: false });
    s.click("mw-beta-report-btn");
    s.dom.el("mw-beta-field-description").value = "half a report";
    s.dom.el("mw-beta-field-description").dispatch("change", { target: s.dom.el("mw-beta-field-description") });
    s.clickAction("feedback-cancel");
    assert.equal(s.calls.confirm.length, 1);
    assert.equal(s.dom.el("mw-beta-feedback-dialog").hidden, false, "kept open — discard declined");

    UI.configureForTest(null);
    const s2 = setup();
    s2.click("mw-beta-report-btn");
    s2.clickAction("feedback-cancel");
    assert.equal(s2.calls.confirm.length, 0, "untouched -> no prompt");
    assert.equal(s2.dom.el("mw-beta-feedback-dialog").hidden, true);
});

test("Escape closes the feedback dialog (via the discard guard)", () => {
    const s = setup();
    s.click("mw-beta-report-btn");
    s.dom.doc.dispatch("keydown", { key: "Escape" });
    assert.equal(s.dom.el("mw-beta-feedback-dialog").hidden, true);
});


/* ---- known issues / what's new --------------------- */

test("known-issues dialog shows the honest empty state", () => {
    const s = setup();
    s.click("mw-beta-known-issues-btn");
    assert.equal(s.dom.el("mw-beta-known-issues-dialog").hidden, false);
    const emptyText = s.dom.el("mw-beta-known-issues-empty").childNodes.map((n) => n.textContent).join(" ");
    assert.match(emptyText, /No published known issues/i);
    assert.ok(!/no bugs/i.test(emptyText));
});

test("known-issues renders items with textContent", () => {
    const s = setup({ issues: [{ id: "MW-BETA-1", title: "<b>x</b>", status: "open", affectedVersions: ["0.9.0-beta.10"], workaround: "avoid <i>y</i>" }] });
    s.click("mw-beta-known-issues-btn");
    const li = s.dom.el("mw-beta-known-issues-list").childNodes[0];
    const text = li.childNodes.map((n) => n.textContent).join(" ");
    assert.ok(text.includes("<b>x</b>"));
    assert.ok(text.includes("avoid <i>y</i>"));
});

test("what's-new dialog shows the curated notes for this build", () => {
    const s = setup();
    s.click("mw-beta-whats-new-btn");
    assert.equal(s.dom.el("mw-beta-whats-new-dialog").hidden, false);
    assert.equal(s.dom.el("mw-beta-whats-new-version").textContent, "0.9.0-beta.10");
    const items = s.dom.el("mw-beta-whats-new-list").childNodes.map((n) => n.textContent);
    assert.ok(items.some((t) => /Beta Hub/.test(t)));
});


/* ---- source guards -------------------------------- */

test("beta-ui source: no network, no localStorage, no innerHTML, no financial reads", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.join(__dirname, "..", "js/beta/beta-ui.js"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(src));
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src));
    assert.ok(!/\.innerHTML\s*=|insertAdjacentHTML|document\.write|eval\(|new Function/.test(src));
    assert.ok(!/mWalletData|BudgetStorage|MWalletStorage|wallet_documents|storage\.save/.test(src));
});

function tick() { return new Promise((r) => setImmediate(r)); }
