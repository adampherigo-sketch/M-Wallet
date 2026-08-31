"use strict";

/* =========================================================
   BP8 — CODEC APPLY HELPERS

   applyDocument / removeDocument / applyDocuments are the pure,
   non-mutating inverse of encodeFinancialState's per-type
   encoding. They must preserve version + migrations and every
   unrelated slice, and never touch storage or the network.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-codec.js"), "utf8");

function loadCodec() {
    const sandbox = { window: {}, console, TextEncoder };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: "cloud-financial-codec.js" });
    return sandbox.window.MWalletCloudFinancialCodec;
}
const C = loadCodec();
function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function fixture() {
    return {
        version: 5,
        migrations: { savingsAccountV5: true, categoriesV1: true, categoriesResolutionV1: true },
        settings: {
            currency: "USD", currencySymbol: "$", firstDayOfWeek: "monday",
            categories: { version: 1, list: [{ id: "c1", name: "Food", system: false }] }
        },
        income: [{ id: "inc-1", name: "Salary", amount: 3200.5 }],
        expenses: [{ id: "exp-1", name: "Rent", amount: 1450.75 }],
        months: {
            "2026-08": { monthKey: "2026-08", startingBalance: 1000.25, bills: [{ id: "b1", amount: 42.1 }], transactions: [], notes: "Aug" },
            "2026-09": { monthKey: "2026-09", startingBalance: 1234.56, bills: [], transactions: [], notes: "" }
        },
        savingsGoals: [{ id: "g1", name: "Emergency", target: 10000, saved: 1875.1 }],
        savingsTransfers: [{ id: "t1", goalId: "g1", amount: 100 }],
        cash: {
            initialized: true,
            wallet: { denominations: { "bill-20": 3, "coin-quarter": 4 } },
            savings: { denominations: {} }, history: [{ id: "h1", type: "deposit" }], settings: {}
        },
        accounts: { checking: { name: "Everyday", balance: 4200.55 }, savings: { name: "General Savings", balance: 1875.1 } }
    };
}


test("applyDocument (month) replaces only that month; other months + version + migrations untouched", () => {
    const local = fixture();
    const frozen = JSON.parse(JSON.stringify(local));
    const res = C.applyDocument(local, {
        documentType: "month", documentKey: "2026-08", schemaVersion: 5,
        payload: { monthKey: "2026-08", startingBalance: 5555.55, bills: [], transactions: [], notes: "changed" }
    });
    assert.equal(res.ok, true);
    assert.equal(res.state.months["2026-08"].startingBalance, 5555.55);
    assert.deepEqual(plain(res.state.months["2026-09"]), frozen.months["2026-09"], "September untouched");
    assert.equal(res.state.version, 5);
    assert.deepEqual(plain(res.state.migrations), frozen.migrations);
    assert.deepEqual(plain(res.state.cash), frozen.cash, "cash untouched by a month apply");
    assert.deepEqual(local, frozen, "input not mutated");
});

test("applyDocument (settings) keeps the local category library", () => {
    const local = fixture();
    const res = C.applyDocument(local, {
        documentType: "settings", documentKey: "primary", schemaVersion: 5,
        payload: { currency: "EUR", currencySymbol: "€", firstDayOfWeek: "sunday" }
    });
    assert.equal(res.state.settings.currency, "EUR");
    assert.equal(res.state.settings.firstDayOfWeek, "sunday");
    assert.deepEqual(plain(res.state.settings.categories), plain(local.settings.categories), "categories are a separate document");
});

test("applyDocument (categories) replaces the library only", () => {
    const local = fixture();
    const res = C.applyDocument(local, {
        documentType: "categories", documentKey: "primary", schemaVersion: 5,
        payload: { version: 2, list: [{ id: "c9", name: "Travel", system: false }] }
    });
    assert.equal(res.state.settings.categories.version, 2);
    assert.equal(res.state.settings.categories.list[0].name, "Travel");
    assert.equal(res.state.settings.currency, "USD", "preferences untouched");
});

test("applyDocument (accounts / recurring / savings / cash) round-trips exact values", () => {
    const local = fixture();
    const enc = C.encodeFinancialState(local);
    const pick = (t) => enc.documents.find((x) => x.documentType === t && x.documentKey === "primary");

    let s = fixture();
    ["accounts", "recurring-income", "recurring-expenses", "savings", "cash"].forEach((t) => {
        const r = C.applyDocument(s, pick(t));
        assert.equal(r.ok, true, t);
        s = r.state;
    });
    assert.equal(s.accounts.checking.balance, 4200.55);
    assert.equal(s.income[0].amount, 3200.5);
    assert.equal(s.expenses[0].amount, 1450.75);
    assert.equal(s.savingsGoals[0].saved, 1875.1);
    assert.equal(s.cash.wallet.denominations["bill-20"], 3);
});

test("removeDocument removes a month; refuses a non-deletable singleton", () => {
    const local = fixture();
    const rm = C.removeDocument(local, "month", "2026-08");
    assert.equal(rm.ok, true);
    assert.ok(!("2026-08" in rm.state.months));
    assert.ok("2026-09" in rm.state.months);
    assert.deepEqual(local, fixture(), "not mutated");

    const bad = C.removeDocument(local, "cash", "primary");
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "not_deletable");
});

test("applyDocuments applies a mixed batch in one deterministic pass", () => {
    const local = fixture();
    const res = C.applyDocuments(local, [
        { documentType: "month", documentKey: "2026-09", deleted: true },
        { documentType: "accounts", documentKey: "primary", schemaVersion: 5, payload: { checking: { name: "Everyday", balance: 1 }, savings: { name: "S", balance: 2 } } },
        { documentType: "month", documentKey: "2026-08", schemaVersion: 5, payload: { monthKey: "2026-08", startingBalance: 9, bills: [], transactions: [], notes: "" } }
    ]);
    assert.equal(res.ok, true);
    assert.deepEqual(plain(res.applied).sort(), ["accounts/primary", "month/2026-08", "month/2026-09"]);
    assert.ok(!("2026-09" in res.state.months));
    assert.equal(res.state.months["2026-08"].startingBalance, 9);
    assert.equal(res.state.accounts.checking.balance, 1);
    assert.deepEqual(local, fixture(), "input not mutated");
});

test("applyDocuments skips (never applies) an invalid item and reports it", () => {
    const local = fixture();
    const res = C.applyDocuments(local, [
        { documentType: "month", documentKey: "2026-08", schemaVersion: 5, payload: { x: NaN } },
        { documentType: "settings", documentKey: "primary", schemaVersion: 5, payload: { currency: "GBP" } }
    ]);
    assert.equal(res.ok, true);
    assert.ok(plain(res.skipped).some((s) => s.id === "month/2026-08"));
    assert.deepEqual(plain(res.applied), ["settings/primary"]);
    assert.equal(res.state.settings.currency, "GBP");
    assert.equal(res.state.months["2026-08"].startingBalance, 1000.25, "the invalid month was NOT applied");
});

test("applyDocument rejects a newer schema version (unsupported_schema)", () => {
    const res = C.applyDocument(fixture(), {
        documentType: "month", documentKey: "2026-08", schemaVersion: 99, payload: { monthKey: "2026-08" }
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, "unsupported_schema");
});

test("applyDocument rejects an unknown type", () => {
    const res = C.applyDocument(fixture(), {
        documentType: "future-thing", documentKey: "primary", schemaVersion: 5, payload: {}
    });
    assert.equal(res.ok, false);
    assert.equal(res.code, "unsupported_type");
});

test("encode -> applyDocuments onto an EMPTY default state reconstructs the syncable slice", () => {
    const source = fixture();
    const enc = C.encodeFinancialState(source);
    const empty = {
        version: 5, migrations: {}, settings: { currency: "USD", currencySymbol: "$", firstDayOfWeek: "sunday", categories: { version: 1, list: [] } },
        income: [], expenses: [], months: {}, savingsGoals: [], savingsTransfers: [],
        cash: { initialized: false, wallet: { denominations: {} }, savings: { denominations: {} }, history: [], settings: {} },
        accounts: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } }
    };
    const res = C.applyDocuments(empty, enc.documents.map((doc) => ({
        documentType: doc.documentType, documentKey: doc.documentKey, schemaVersion: doc.schemaVersion, payload: doc.payload
    })));
    assert.equal(res.ok, true);
    assert.deepEqual(
        plain(C.syncableSlice(res.state)),
        plain(C.syncableSlice(source)),
        "a fresh device that applies every cloud document ends up with the same wallet"
    );
    assert.equal(res.state.version, 5, "device-local version preserved");
});

test("canonicalStringify is order-independent -> same fingerprint for reordered keys", () => {
    const a = { documentType: "month", documentKey: "2026-08", schemaVersion: 5, payload: { b: 1, a: [{ y: 2, x: 1 }] } };
    const b = { payload: { a: [{ x: 1, y: 2 }], b: 1 }, schemaVersion: 5, documentKey: "2026-08", documentType: "month" };
    assert.equal(C.documentFingerprintInput(a), C.documentFingerprintInput(b));
});

test("the apply helpers make no network / storage / DOM access (source-level)", () => {
    const stripped = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/localStorage\.|\.getItem\s*\(|\.setItem\s*\(/.test(stripped));
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|\.from\s*\(\s*["'`]wallet_documents/.test(stripped));
    assert.ok(!/document\.getElementById|addEventListener/.test(stripped));
});
