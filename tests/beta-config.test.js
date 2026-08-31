"use strict";

/* =========================================================
   BP11 — BETA CONFIG  (window.MWalletBetaConfig)

   PUBLIC operational config only. No secret ever lives here;
   the committed build ships every delivery field null.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBetaEnv } = require("./helpers/beta-harness.js");

const ROOT = path.resolve(__dirname, "..");
const stripJs = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const SRC = stripJs(fs.readFileSync(path.join(ROOT, "js/beta/beta-config.js"), "utf8"));


test("committed default: feedback + support unconfigured, program name set", () => {
    const { Config } = createBetaEnv();
    const c = Config.get();
    assert.equal(c.feedbackEndpoint, null);
    assert.equal(c.feedbackConfigured, false);
    assert.equal(c.supportEmail, null);
    assert.equal(c.supportConfigured, false);
    assert.equal(c.programName, "M-Wallet Beta");
    assert.equal(c.channel, "beta");
});

test("an HTTPS endpoint is accepted", () => {
    const { Config } = createBetaEnv({ betaConfig: { feedbackEndpoint: "https://example.com/mw-beta" } });
    const c = Config.get();
    assert.equal(c.feedbackEndpoint, "https://example.com/mw-beta");
    assert.equal(c.feedbackConfigured, true);
});

test("insecure / prohibited endpoint schemes are rejected -> null", () => {
    for (const bad of [
        "http://example.com/x",
        "javascript:alert(1)",
        "data:text/plain,hi",
        "file:///etc/passwd",
        "ftp://example.com/x",
        "ws://example.com/x",
        "not a url",
        ""
    ]) {
        const { Config } = createBetaEnv({ betaConfig: { feedbackEndpoint: bad } });
        assert.equal(Config.get().feedbackEndpoint, null, bad + " must be rejected");
        assert.equal(Config.isValidEndpoint(bad), false);
    }
});

test("support email validation", () => {
    const { Config } = createBetaEnv();
    assert.equal(Config.isValidSupportEmail("beta@example.com"), true);
    assert.equal(Config.isValidSupportEmail("nope"), false);
    assert.equal(Config.isValidSupportEmail(""), false);
    assert.equal(Config.isValidSupportEmail("a@b"), false);
    assert.equal(Config.isValidSupportEmail("x".repeat(255) + "@e.com"), false);

    const env = createBetaEnv({ betaConfig: { supportEmail: "  Beta@Example.com  " } });
    assert.equal(env.Config.get().supportEmail, "Beta@Example.com");
    assert.equal(env.Config.get().supportConfigured, true);
});

test("an invalid support email resolves to null (never exposed)", () => {
    const { Config } = createBetaEnv({ betaConfig: { supportEmail: "definitely not an email" } });
    assert.equal(Config.get().supportEmail, null);
    assert.equal(Config.get().supportConfigured, false);
});

test("the source file contains no token / key / secret", () => {
    assert.ok(!/sb_secret_|service_role|api[_-]?key\s*[:=]\s*["'][A-Za-z0-9]/i.test(SRC));
    assert.ok(!/Authorization|Bearer\s+[A-Za-z0-9]/.test(SRC));
    assert.ok(!/(resend|formspree|sendgrid|mailgun|smtp)[_-]?(key|secret|password|token)\s*[:=]/i.test(SRC));
    /* the committed deploy defaults are null */
    assert.ok(/feedbackEndpoint:\s*null/.test(SRC));
    assert.ok(/supportEmail:\s*null/.test(SRC));
});

test("beta config never touches localStorage", () => {
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(SRC));
});
