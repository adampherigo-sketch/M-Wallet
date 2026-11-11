"use strict";

/* =========================================================
   CONTENT SECURITY POLICY (index.html <meta>)

   The Supabase session token and the wallet live in this
   origin's localStorage, so the page ships a CSP that only
   runs M-Wallet's own script files. These checks keep the
   policy strict, AND keep the page compatible with it: no
   inline script, no inline event handlers, every host the app
   talks to allowed.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const APP_JS = [
    "js/app.js", "js/money.js", "js/nav.js", "js/settings-ui.js", "js/m-cash/cash-ui.js",
    "js/auth/auth-ui.js", "js/auth/passkey-ui.js", "js/account/account-ui.js", "js/beta/beta-ui.js",
    "js/migration/migration-ui.js", "js/setup/setup-ui.js", "js/walkthrough/walkthrough-ui.js",
    "js/sync/sync-ui.js"
];

function cspTags() {
    return HTML.match(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>/g) || [];
}

function policy() {
    const content = cspTags()[0].match(/content="([^"]*)"/)[1];
    const directives = {};
    content.split(";").map((s) => s.trim()).filter(Boolean).forEach((part) => {
        const [name, ...values] = part.split(/\s+/);
        directives[name] = values;
    });
    return directives;
}


test("index.html ships exactly one CSP <meta>, ahead of every stylesheet, script and the manifest", () => {
    const tags = cspTags();
    assert.equal(tags.length, 1);
    const at = HTML.indexOf(tags[0]);
    assert.ok(at < HTML.search(/<link\b[^>]*rel="manifest"/), "before the manifest link");
    assert.ok(at < HTML.search(/<link\b[^>]*rel="stylesheet"/), "before the first stylesheet");
    assert.ok(at < HTML.search(/<script\b/), "before the first script");
});

test("scripts: M-Wallet's own files only — no inline script, no eval, no wildcard", () => {
    const p = policy();
    assert.deepEqual(p["default-src"], ["'self'"]);
    assert.deepEqual(p["script-src"], ["'self'"], "no 'unsafe-inline', no 'unsafe-eval', no hosts");
    assert.deepEqual(p["object-src"], ["'none'"]);
    assert.deepEqual(p["base-uri"], ["'self'"]);
    assert.deepEqual(p["form-action"], ["'self'"]);
    assert.ok(!("frame-ancestors" in p), "frame-ancestors is ignored in a <meta> CSP (it only logs a warning)");
    assert.ok(!("upgrade-insecure-requests" in p), "would break http://127.0.0.1 local development");
});

test("styles: inline style attributes only (progress bars); images and everything else same-origin", () => {
    const p = policy();
    assert.deepEqual(p["style-src"], ["'self'", "'unsafe-inline'"]);
    assert.deepEqual(p["img-src"], ["'self'"]);
    assert.equal((HTML.match(/(src|href|action)="https?:/g) || []).length, 0, "the page loads nothing from another origin");
});

test("connect-src: this origin + every Supabase host js/auth/auth-config.js accepts, nothing broader", () => {
    const connect = policy()["connect-src"];
    assert.ok(connect.includes("'self'"));

    const authConfig = fs.readFileSync(path.join(ROOT, "js/auth/auth-config.js"), "utf8");
    const accepted = authConfig.match(/supabase\\\.\(([a-z|]+)\)/)[1].split("|");
    accepted.forEach((tld) => {
        assert.ok(connect.includes(`https://*.supabase.${tld}`), `https://*.supabase.${tld} is allowed`);
    });
    assert.ok(!connect.includes("*") && !connect.includes("https:") && !connect.includes("http:"),
        "no blanket wildcard or scheme-only source");
});

test("a configured beta feedback endpoint must also be allowed by connect-src", () => {
    const sandbox = { window: {} };
    sandbox.window.URL = URL;
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/beta/beta-config.js"), "utf8"), sandbox);
    const endpoint = sandbox.window.MWalletBetaConfig.get().feedbackEndpoint;
    if (endpoint) {
        assert.ok(policy()["connect-src"].includes(new URL(endpoint).origin),
            "add the feedback endpoint's origin to connect-src in index.html");
    } else {
        assert.equal(endpoint, null, "no endpoint configured yet");
    }
});

test("the app needs no inline script: no inline <script>, no on*= handlers, no javascript: URLs", () => {
    (HTML.match(/<script\b[^>]*>/g) || []).forEach((tag) => {
        assert.match(tag, /\ssrc="\.\/[^"]+"/, `every <script> loads a same-origin file: ${tag}`);
    });
    assert.ok(!/<script\b[^>]*>\s*[^<\s]/.test(HTML), "no inline script body");
    assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=/i.test(HTML), "no inline event-handler attribute in index.html");
    assert.ok(!/javascript:/i.test(HTML), "no javascript: URL in index.html");

    APP_JS.forEach((rel) => {
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        assert.ok(!/<[a-z][^>]*\son[a-z]+\s*=\s*\\?["'`$]/i.test(src), `${rel} builds no inline event-handler markup`);
        assert.ok(!/javascript:/i.test(src), `${rel} builds no javascript: URL`);
        assert.ok(!/\beval\s*\(|new Function\s*\(/.test(src), `${rel} uses no eval`);
    });
});
