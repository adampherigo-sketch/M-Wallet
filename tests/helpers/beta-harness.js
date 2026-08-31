"use strict";

/* =========================================================
   BP11 test helper — loads the real js/beta/* modules into a
   node:vm sandbox with deterministic stand-ins for the version
   API, auth, navigation, and the BP8/BP9 release gates.

   No real network. No real DOM. `fetch` is never provided by
   default — a test must inject a transport.
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const FILES = [
    "js/beta/beta-config.js",
    "js/beta/beta-known-issues.js",
    "js/beta/beta-ops.js",
    "js/beta/beta-feedback.js"
];

function createBetaEnv(options) {
    options = options || {};

    const authFacts = Object.assign({
        status: "signed_in",
        recoveryMode: false,
        email: "tester@example.com"
    }, options.auth || {});

    const nav = Object.assign({
        onLine: options.online !== false,
        userAgent: options.userAgent || "Mozilla/5.0 (TestOS) TestBrowser/1.0",
        language: options.language || "en-GB",
        standalone: options.standalone === true
    }, options.navigator || {});
    if (options.serviceWorkerControlled) {
        nav.serviceWorker = { controller: {} };
    }

    const sandbox = {
        window: {},
        console,
        navigator: nav,
        setTimeout, clearTimeout,
        URL,
        TextEncoder,
        AbortController,
        Promise, JSON, Date, Math, Object, Array, String, Number, isFinite,
        crypto: options.crypto || { randomUUID: () => "00000000-0000-4000-8000-000000000000" }
    };
    sandbox.self = sandbox.window;
    sandbox.window.window = sandbox.window;
    sandbox.window.navigator = nav;
    sandbox.window.URL = URL;
    sandbox.window.TextEncoder = TextEncoder;
    sandbox.window.setTimeout = setTimeout;
    sandbox.window.clearTimeout = clearTimeout;
    sandbox.window.crypto = sandbox.crypto;
    if (options.matchMedia) { sandbox.window.matchMedia = options.matchMedia; }

    /* version API */
    sandbox.window.MWalletVersion = {
        version: options.appVersion || "0.9.0-beta.10",
        channel: "beta",
        get dataSchema() { return options.dataSchema != null ? String(options.dataSchema) : null; }
    };

    /* auth stub */
    sandbox.window.MWalletAuth = {
        getState: () => ({
            status: authFacts.status,
            recoveryMode: authFacts.recoveryMode,
            configured: authFacts.status !== "unconfigured",
            user: authFacts.email ? { id: "SECRET-UUID", email: authFacts.email } : null
        })
    };

    /* nav stub */
    sandbox.window.BudgetNavigation = {
        getCurrentPage: () => options.currentPage || "settings"
    };

    /* release gates (default OFF, like production) */
    sandbox.window.MWalletSyncRelease = { isEnabled: () => options.syncReleaseEnabled === true };
    sandbox.window.MWalletPasskeyRelease = { isEnabled: () => options.passkeyReleaseEnabled === true };

    /* account status stub (for account-deletion + email fallback) */
    sandbox.window.MWalletAccount = {
        accountDeletionStatus: () => ({ available: options.accountDeletionAvailable === true }),
        getSummary: () => ({ account: { email: authFacts.email || null } })
    };

    vm.createContext(sandbox);
    FILES.forEach((f) => vm.runInContext(read(f), sandbox, { filename: f }));

    const W = sandbox.window;

    /* optional deploy config for the run */
    if (options.betaConfig) { W.MWalletBetaConfig.configureForTest(options.betaConfig); }
    if (options.knownIssues) { W.MWalletBetaKnownIssues.configureForTest(options.knownIssues); }

    return {
        sandbox, W, authFacts, nav,
        Config: W.MWalletBetaConfig,
        Ops: W.MWalletBetaOps,
        Feedback: W.MWalletBetaFeedback,
        KnownIssues: W.MWalletBetaKnownIssues,
        setAuth(patch) { Object.assign(authFacts, patch); },
        setOnline(v) { nav.onLine = v; }
    };
}

/* a recording fake transport: returns whatever `respond` says */
function makeTransport(respond) {
    const calls = [];
    const fn = (url, req) => {
        calls.push({ url, req });
        const r = (typeof respond === "function") ? respond(url, req, calls.length) : respond;
        if (r && r.throw) { return Promise.reject(new Error(r.throw)); }
        if (r && r.hang) {
            /* resolve only when the AbortController fires — mirrors real fetch */
            return new Promise((_resolve, reject) => {
                const sig = req && req.signal;
                if (sig && typeof sig.addEventListener === "function") {
                    sig.addEventListener("abort", () => reject(new Error("aborted")));
                }
            });
        }
        const status = (r && typeof r.status === "number") ? r.status : 200;
        const body = r && ("json" in r) ? r.json : { ok: true };
        return Promise.resolve({
            status,
            json: () => Promise.resolve(body)
        });
    };
    fn.calls = calls;
    return fn;
}

module.exports = { createBetaEnv, makeTransport, FILES };
