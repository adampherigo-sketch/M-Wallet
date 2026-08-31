"use strict";

/* =========================================================
   BP11 — BETA INTEGRITY / SIDE-EFFECT GUARANTEES

   The whole feedback lifecycle (build -> preview -> copy ->
   download -> failed send -> successful mocked send) must:
     - make ZERO network calls until an explicit Send
     - write NOTHING to localStorage / the wallet
     - not touch auth, BP4 ownership, BP5/BP6, or BP8 sync
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { makeTransport } = require("./helpers/beta-harness.js");

const ROOT = path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const BETA_FILES = [
    "js/beta/beta-config.js",
    "js/beta/beta-known-issues.js",
    "js/beta/beta-ops.js",
    "js/beta/beta-feedback.js"
];

function spyStorage() {
    const store = new Map();
    const writes = [];
    return {
        getItem: (k) => (store.has(String(k)) ? store.get(String(k)) : null),
        setItem: (k, v) => { writes.push(["set", String(k)]); store.set(String(k), String(v)); },
        removeItem: (k) => { writes.push(["remove", String(k)]); store.delete(String(k)); },
        clear: () => { writes.push(["clear"]); store.clear(); },
        key: () => null,
        get length() { return store.size; },
        _writes: writes
    };
}

function makeEnv(opts) {
    opts = opts || {};
    const ls = spyStorage();
    const fetchCalls = [];
    const sandbox = {
        window: {}, console,
        navigator: { onLine: true, userAgent: "TestUA/1", language: "en", serviceWorker: { controller: {} } },
        localStorage: ls,
        setTimeout, clearTimeout, URL, TextEncoder, AbortController,
        Promise, JSON, Date, Math, Object, Array, String, Number, isFinite,
        crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
        /* a global fetch that records — must NEVER be called by beta code */
        fetch: (url, req) => { fetchCalls.push({ url, req }); return Promise.resolve({ status: 200, json: () => Promise.resolve({ ok: true }) }); }
    };
    sandbox.self = sandbox.window;
    sandbox.window.window = sandbox.window;
    sandbox.window.navigator = sandbox.navigator;
    sandbox.window.localStorage = ls;
    sandbox.window.URL = URL;
    sandbox.window.TextEncoder = TextEncoder;
    sandbox.window.crypto = sandbox.crypto;

    sandbox.window.MWalletVersion = { version: "0.9.0-beta.10", channel: "beta", get dataSchema() { return "5"; } };

    /* auth / migration / setup / walkthrough / sync spies — a mutating
       call would fail these tests */
    const touched = [];
    const trap = (name) => new Proxy({}, {
        get: (_t, prop) => {
            if (prop === "getState" || prop === "getStatus" || prop === "diagnostics") {
                return () => (name === "auth"
                    ? { status: opts.authStatus || "signed_out", recoveryMode: false, configured: false, user: null }
                    : (name === "migration" ? (opts.ownerStatus || "owner_mismatch") : {}));
            }
            if (prop === "isEnabled") { return () => false; }
            if (prop === "accountDeletionStatus") { return () => ({ available: false }); }
            if (prop === "getSummary") { return () => ({ account: { email: null } }); }
            if (prop === "getCurrentPage") { return () => "settings"; }
            return () => { touched.push(name + "." + String(prop)); };
        }
    });
    sandbox.window.MWalletAuth = trap("auth");
    sandbox.window.MWalletLocalMigration = trap("migration");
    sandbox.window.MWalletFirstRun = trap("firstRun");
    sandbox.window.MWalletWalkthrough = trap("walkthrough");
    sandbox.window.MWalletSync = trap("sync");
    sandbox.window.MWalletSyncRelease = trap("syncRelease");
    sandbox.window.MWalletPasskeyRelease = trap("passkeyRelease");
    sandbox.window.MWalletAccount = trap("account");
    sandbox.window.BudgetNavigation = trap("nav");

    vm.createContext(sandbox);
    BETA_FILES.forEach((f) => vm.runInContext(read(f), sandbox, { filename: f }));

    if (opts.endpoint) {
        sandbox.window.MWalletBetaConfig.configureForTest({ feedbackEndpoint: opts.endpoint });
    }

    return { sandbox, W: sandbox.window, ls, fetchCalls, touched };
}


test("BP11.83/84: a full feedback lifecycle makes zero network calls and zero storage writes (no endpoint)", async () => {
    const { W, ls, fetchCalls } = makeEnv();
    const F = W.MWalletBetaFeedback;

    const built = F.buildReport(
        { category: "bug", severity: "major", title: "t", description: "d", includeDiagnostics: true },
        {}
    );
    assert.equal(built.ok, true);
    F.serialize(built.report, true);
    F.toPlainText(built.report);
    F.downloadFilename(built.report);
    const res = await F.submit(built.report, { transport: makeTransport({ status: 200 }) });
    assert.equal(res.code, "not_configured");

    assert.equal(fetchCalls.length, 0, "global fetch never called");
    assert.deepEqual(ls._writes, [], "no localStorage writes");
});

test("BP11.84: even with an endpoint configured, nothing is sent until submit() is called", async () => {
    const { W, fetchCalls } = makeEnv({ endpoint: "https://example.com/x" });
    const F = W.MWalletBetaFeedback;
    const O = W.MWalletBetaOps;

    /* everything short of submit */
    O.getBuildSummary();
    O.safeDiagnostics();
    O.currentLimitations();
    O.releaseNotes();
    O.generateReportId();
    const built = F.buildReport({ category: "bug", severity: "minor", title: "t", description: "d" }, {});
    F.serialize(built.report);
    F.validate({ category: "bug", severity: "minor", title: "t", description: "d" });

    assert.equal(fetchCalls.length, 0, "no fetch from summary / diagnostics / build / serialize");

    /* now an explicit submit with a real (recording) transport */
    await F.submit(built.report, {});
    assert.equal(fetchCalls.length, 1, "exactly one fetch, from submit()");
    assert.equal(fetchCalls[0].req.method, "POST");
});

test("BP11.81/82: building a report while signed out / owner-mismatch never touches auth, ownership, setup, sync", async () => {
    const { W, touched } = makeEnv({ authStatus: "signed_out", ownerStatus: "owner_mismatch" });
    const F = W.MWalletBetaFeedback;
    const O = W.MWalletBetaOps;

    const diag = O.safeDiagnostics();
    assert.equal(diag.authState, "signed_out");

    const built = F.buildReport(
        { category: "bug", severity: "blocker", title: "cannot sign in", description: "stuck", includeDiagnostics: true },
        {}
    );
    assert.equal(built.ok, true);

    /* no state-mutating call was made on any subsystem */
    assert.deepEqual(touched, [], "no mutating subsystem calls: " + touched.join(","));

    /* the report + diagnostics carry no owner / wallet / user identity */
    const blob = JSON.stringify(built.report);
    assert.ok(!/owner|SECRET-UUID|mWalletData|wallet_documents/i.test(blob));
});

test("BP11.85/112: repo-wide analytics / tracking audit stays clean (beta code included)", () => {
    const scan = [
        "index.html", "service-worker.js", "manifest.json",
        "js/app.js", "js/nav.js", "js/settings-ui.js", "js/pwa.js",
        "js/beta/beta-config.js", "js/beta/beta-known-issues.js",
        "js/beta/beta-ops.js", "js/beta/beta-feedback.js", "js/beta/beta-ui.js"
    ];
    const bad = /google-analytics\.com|googletagmanager|gtag\(|mixpanel|amplitude\.com|segment\.com|posthog|hotjar|fullstory|\bfbq\(|plausible\.io|clarity\.ms|Sentry\.init|datadog|newrelic|navigator\.sendBeacon/i;
    for (const f of scan) {
        const src = fs.readFileSync(path.join(ROOT, f), "utf8");
        assert.ok(!bad.test(src), f + " contains an analytics / tracking reference");
    }
});

test("BP11: beta modules never define a global error / rejection handler", () => {
    for (const f of ["js/beta/beta-config.js", "js/beta/beta-known-issues.js", "js/beta/beta-ops.js", "js/beta/beta-feedback.js", "js/beta/beta-ui.js"]) {
        const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        assert.ok(!/addEventListener\(\s*["'](error|unhandledrejection)["']|window\.onerror|self\.onerror/.test(src),
            f + " installs no global crash handler");
    }
});
