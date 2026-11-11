"use strict";

/* Deployment: the beta is served from its own origin (GitHub Pages custom
   domain), not the shared <user>.github.io origin. */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

test("CNAME pins the GitHub Pages custom domain to mwallet.zevarynsystems.com", () => {
    const cname = fs.readFileSync(path.join(ROOT, "CNAME"), "utf8");
    assert.equal(cname.trim(), "mwallet.zevarynsystems.com");
    assert.equal(cname.trim().split(/\s+/).length, 1, "exactly one domain, no scheme or path");
});

test("the app shell uses relative paths so it works at a domain root", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
    assert.equal(manifest.start_url, "./");
    assert.equal(manifest.scope, "./");
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.ok(!/(src|href)="\/M-Wallet\//.test(html), "no hard-coded /M-Wallet/ sub-path");
    assert.ok(!/github\.io/.test(html), "no hard-coded github.io URL");
});
