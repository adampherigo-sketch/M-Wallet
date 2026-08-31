"use strict";

/* =========================================================
   BP11 — BETA OPS  (window.MWalletBetaOps)

   Build summary, PURE sanitised diagnostics, truthfully
   derived beta limitations, report-scoped ids, curated
   release notes. No PII, no financial data, ever.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createBetaEnv } = require("./helpers/beta-harness.js");

const plain = (v) => JSON.parse(JSON.stringify(v));

const FINANCIAL_WORDS = /transaction|balance|\bbill\b|expense|income|saving|merchant|category|mcash|m-cash|cashBalance|monthCount|payload|wallet_documents|mWalletData/i;


test("build summary uses the central version API and channel beta", () => {
    const { Ops } = createBetaEnv({ appVersion: "0.9.0-beta.10", dataSchema: 5 });
    const s = Ops.getBuildSummary();
    assert.equal(s.appVersion, "0.9.0-beta.10");
    assert.equal(s.channel, "beta");
    assert.equal(s.dataSchema, "5");
    assert.equal(s.programName, "M-Wallet Beta");
});

test("safeDiagnostics contains only technical fields — no financial data, no identity", () => {
    const { Ops } = createBetaEnv({
        online: true, standalone: true, serviceWorkerControlled: true,
        currentPage: "budget", language: "en-GB",
        userAgent: "Mozilla/5.0 (X) Y/1",
        matchMedia: () => ({ matches: true })
    });
    const d = Ops.safeDiagnostics();
    const blob = JSON.stringify(d);

    assert.equal(d.appVersion, "0.9.0-beta.10");
    assert.equal(d.betaChannel, "beta");
    assert.equal(d.currentPage, "budget");
    assert.equal(d.online, true);
    assert.equal(d.standalone, true);
    assert.equal(d.serviceWorkerControlled, true);
    assert.equal(d.language, "en-GB");
    assert.equal(d.authState, "signed_in");
    assert.equal(d.syncReleaseEnabled, false);
    assert.equal(d.passkeyReleaseEnabled, false);
    assert.equal(d.feedbackEndpointConfigured, false);
    assert.equal("contactEmail" in d, false, "no email without an explicit opt-in");

    assert.ok(!blob.includes("SECRET-UUID"), "no user id");
    assert.ok(!blob.includes("tester@example.com"), "no account email");
    assert.ok(!/token|bearer|authorization|session|owner|service_role/i.test(blob));
    assert.ok(!FINANCIAL_WORDS.test(blob), "no financial words: " + blob);
});

test("safeDiagnostics maps the auth state to a label only", () => {
    for (const [status, extra, expected] of [
        ["signed_in", {}, "signed_in"],
        ["signed_out", {}, "signed_out"],
        ["unconfigured", {}, "unconfigured"],
        ["error", {}, "error"],
        ["signed_in", { recoveryMode: true }, "recovery"]
    ]) {
        const { Ops } = createBetaEnv({ auth: Object.assign({ status: status }, extra) });
        assert.equal(Ops.safeDiagnostics().authState, expected);
    }
});

test("safeDiagnostics includes a contact email ONLY when the caller opts in and supplies it", () => {
    const { Ops } = createBetaEnv();
    assert.equal("contactEmail" in Ops.safeDiagnostics({ includeContactEmail: true }), false, "opt-in alone is not enough");
    const d = Ops.safeDiagnostics({ includeContactEmail: true, contactEmail: "me@example.com" });
    assert.equal(d.contactEmail, "me@example.com");
});

test("currentPage is normalised to a known identifier", () => {
    assert.equal(createBetaEnv({ currentPage: "reports" }).Ops.currentPage(), "reports");
    assert.equal(createBetaEnv({ currentPage: "totally-made-up" }).Ops.currentPage(), "unknown");
});

test("currentLimitations is derived truthfully from the live release gates", () => {
    let env = createBetaEnv({ syncReleaseEnabled: false, passkeyReleaseEnabled: false });
    let ids = env.Ops.currentLimitations().map((l) => l.id);
    assert.ok(ids.includes("sync"));
    assert.ok(ids.includes("passkeys"));
    assert.ok(ids.includes("account-deletion"));
    assert.ok(ids.includes("feedback-delivery"));

    env = createBetaEnv({
        syncReleaseEnabled: true, passkeyReleaseEnabled: true,
        accountDeletionAvailable: true,
        betaConfig: { feedbackEndpoint: "https://example.com/x" }
    });
    ids = env.Ops.currentLimitations().map((l) => l.id);
    assert.ok(!ids.includes("sync"));
    assert.ok(!ids.includes("passkeys"));
    assert.ok(!ids.includes("account-deletion"));
    assert.ok(!ids.includes("feedback-delivery"));
    assert.ok(ids.includes("verification"), "the BP12 verification note is always present");
});

test("generateReportId is report-scoped (MWB- prefix), injectable, never a user id", () => {
    const { Ops } = createBetaEnv();
    assert.match(Ops.generateReportId(), /^MWB-[0-9a-f-]{36}$/);
    assert.equal(Ops.generateReportId(() => "fixed-uuid"), "MWB-fixed-uuid");
    /* it does not read auth / account state */
    const id = Ops.generateReportId();
    assert.ok(!id.includes("SECRET-UUID"));
    assert.ok(!id.includes("tester@example.com"));
});

test("releaseNotes are curated, match the build, and never fetch GitHub", () => {
    const { Ops } = createBetaEnv({ appVersion: "0.9.0-beta.10" });
    const n = Ops.releaseNotes();
    assert.equal(n.version, "0.9.0-beta.10");
    assert.equal(n.matchesBuild, true);
    assert.ok(Array.isArray(n.highlights) && n.highlights.length > 0);
    assert.match(n.note, /CHANGELOG/);
});

test("developer diagnostics expose safe operational counts only", () => {
    const { Ops } = createBetaEnv({ knownIssues: [{ id: "MW-BETA-1", title: "x" }] });
    const d = plain(Ops.diagnostics());
    assert.deepEqual(Object.keys(d).sort(), [
        "accountDeletionAvailable", "appVersion", "betaChannel",
        "feedbackConfigured", "knownIssueCount", "passkeyReleaseEnabled",
        "supportConfigured", "syncReleaseEnabled"
    ]);
    assert.equal(d.knownIssueCount, 1);
    const blob = JSON.stringify(d);
    assert.ok(!blob.includes("SECRET-UUID") && !blob.includes("tester@example.com"));
});

test("diagnosticsPreview is label/value rows (safe for ordinary UI)", () => {
    const { Ops } = createBetaEnv();
    const rows = Ops.diagnosticsPreview();
    assert.ok(rows.every((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === "string"));
    const blob = JSON.stringify(rows);
    assert.ok(!FINANCIAL_WORDS.test(blob));
    assert.ok(!blob.includes("SECRET-UUID"));
});

test("beta-ops source reads no financial data and has no network primitive", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.join(__dirname, "..", "js/beta/beta-ops.js"), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/.test(src));
    assert.ok(!/mWalletData|BudgetStorage|MWalletStorage|wallet_documents|getCashState/.test(src));
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(src));
});
