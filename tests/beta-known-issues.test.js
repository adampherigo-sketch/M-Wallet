"use strict";

/* =========================================================
   BP11 — BETA KNOWN ISSUES  (window.MWalletBetaKnownIssues)

   Developer-curated static registry. Safe text only, unique
   ids, whitelisted statuses, honest empty state.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createBetaEnv } = require("./helpers/beta-harness.js");
const plain = (v) => JSON.parse(JSON.stringify(v));

const SRC = fs.readFileSync(path.resolve(__dirname, "..", "js/beta/beta-known-issues.js"), "utf8");


test("committed build ships an empty registry with an honest empty state", () => {
    const { KnownIssues } = createBetaEnv();
    assert.equal(KnownIssues.isEmpty(), true);
    assert.equal(KnownIssues.count(), 0);
    assert.deepEqual(plain(KnownIssues.list()), []);
    assert.match(KnownIssues.EMPTY_PRIMARY, /no published known issues/i);
    assert.match(KnownIssues.EMPTY_SECONDARY, /undiscovered issues/i);
    /* never a "no bugs" claim */
    assert.ok(!/no bugs|bug-free|zero bugs/i.test(KnownIssues.EMPTY_PRIMARY + KnownIssues.EMPTY_SECONDARY));
});

test("normalises a valid registry: unique ids, whitelisted status, version list", () => {
    const { KnownIssues } = createBetaEnv({
        knownIssues: [
            { id: "MW-BETA-001", title: "Thing A", status: "workaround", affectedVersions: ["0.9.0-beta.10", "0.9.0-beta.10"], workaround: "Do X" },
            { id: "MW-BETA-002", title: "Thing B", status: "made-up-status" },
            { id: "MW-BETA-001", title: "Duplicate id" },
            { id: "", title: "no id" },
            { title: "no id 2" },
            "not an object"
        ]
    });
    const items = KnownIssues.list();
    assert.equal(items.length, 2);
    assert.equal(items[0].id, "MW-BETA-001");
    assert.equal(items[0].status, "workaround");
    assert.deepEqual(plain(items[0].affectedVersions), ["0.9.0-beta.10"]);
    assert.equal(items[1].status, "open", "unknown status -> open");
    assert.equal(items[1].workaround, null);
});

test("only whitelisted statuses exist", () => {
    const { KnownIssues } = createBetaEnv();
    assert.deepEqual(plain(KnownIssues.STATUSES).sort(),
        ["fixed-next-build", "investigating", "open", "workaround"]);
});

test("registry entries are plain strings (no HTML-rendering dependency)", () => {
    const { KnownIssues } = createBetaEnv({
        knownIssues: [{ id: "X", title: "<img src=x onerror=alert(1)>", status: "open", workaround: "<b>hi</b>" }]
    });
    const it = KnownIssues.list()[0];
    /* the module stores the text verbatim as a string; the UI renders it
       with textContent — the module never emits HTML itself */
    assert.equal(typeof it.title, "string");
    assert.equal(typeof it.workaround, "string");
    assert.ok(!/innerHTML|insertAdjacentHTML|document\.write/.test(SRC));
});

test("source has no network / storage / secret", () => {
    const clean = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(clean));
    assert.ok(!/localStorage|sessionStorage|indexedDB/.test(clean));
    assert.ok(!/mWalletData|BudgetStorage|service_role|sb_secret_/.test(clean));
});
