"use strict";

/* =========================================================
   BP7 — CLOUD FINANCIAL CODEC  (pure)

   Loads the real js/cloud/cloud-financial-codec.js in a
   node:vm sandbox and verifies:
     - the document registry matches the storage audit
     - a realistic mWalletData fixture encodes deterministically
       into independent documents (one per month, M-Cash isolated,
       accounts/settings/categories/savings separate)
     - every user financial value is preserved EXACTLY (cents,
       negatives, ids, dates, categories, denominations, notes)
     - encode/decode round-trips to the syncable slice
     - version + migrations are excluded (and documented)
     - no BP2-BP6 local keys leak in
     - malformed payloads (NaN / Infinity / function / cycle) are
       rejected; the input object is never mutated
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-codec.js"), "utf8");

function loadCodec() {
    const sandbox = { window: {}, console };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: "cloud-financial-codec.js" });
    return sandbox.window.MWalletCloudFinancialCodec;
}

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function deepFreeze(o) {
    if (o && typeof o === "object") {
        Object.keys(o).forEach((k) => deepFreeze(o[k]));
        Object.freeze(o);
    }
    return o;
}

/* a realistic mWalletData v5 fixture */
function fixture() {
    return {
        version: 5,
        migrations: { savingsAccountV5: true, categoriesV1: true, categoriesResolutionV1: true },
        settings: {
            currency: "USD",
            currencySymbol: "$",
            firstDayOfWeek: "monday",
            categories: {
                version: 1,
                list: [
                    { id: "cat-housing", name: "Housing", system: true, enabled: true, subcategories: [{ id: "sub-rent", name: "Rent", system: true, enabled: true }] },
                    { id: "cat-custom-1", name: "Side Hustle", system: false, enabled: true, subcategories: [] }
                ]
            }
        },
        income: [
            { id: "inc-1", name: "Salary", source: "Salary", amount: 4200.55, date: "2026-08-01", recurring: true, frequency: "monthly", category: "" }
        ],
        expenses: [
            { id: "exp-1", merchant: "Netflix", name: "Netflix", amount: 15.49, date: "2026-08-04", recurring: true, frequency: "monthly", category: "cat-custom-1" }
        ],
        months: {
            "2026-08": {
                monthKey: "2026-08", startingBalance: -12.34, endingBalance: 3187.72,
                paychecks: [{ id: "pc-1", amount: 4200.55, date: "2026-08-01", paid: true }],
                bills: [{ id: "bill-1", name: "Rent", amount: 1200, dueDate: "2026-08-01", paid: false, category: "cat-housing", recurringSeriesId: "series-rent" }],
                suppressedRecurringBillSeries: ["series-old"],
                expenses: [{ id: "me-1", merchant: "Corner Store", amount: 8.75, date: "2026-08-09", category: "cat-custom-1" }],
                transactions: [{ id: "tx-1", type: "out", amount: 25.5, date: "2026-08-10", note: "cash withdrawal" }],
                savingsDeposits: [{ id: "sd-1", amount: 100, date: "2026-08-15" }],
                savingsTransfers: [{ id: "sd-1", amount: 100, date: "2026-08-15" }],
                notes: "First month using M-Wallet — watch groceries.",
                createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-16T12:00:00.000Z"
            },
            "2026-09": {
                monthKey: "2026-09", startingBalance: 3187.72, endingBalance: 0,
                paychecks: [], bills: [], suppressedRecurringBillSeries: [],
                expenses: [], transactions: [], savingsDeposits: [], savingsTransfers: [],
                notes: "", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z"
            }
        },
        savingsGoals: [
            { id: "goal-1", name: "Emergency Fund", target: 5000, allocated: 750, createdAt: "2026-08-02T00:00:00.000Z" }
        ],
        savingsTransfers: [
            { id: "st-1", goalId: "goal-1", amount: 750, direction: "allocate", date: "2026-08-02" }
        ],
        cash: {
            initialized: true,
            wallet: { denominations: { "bill-1": 3, "bill-20": 2, "coin-quarter": 7, "coin-penny": 4 } },
            savings: { denominations: { "bill-100": 1, "bill-50": 1 } },
            history: [{ id: "mc-1", date: "2026-08-01", type: "recount", totalCents: 12345 }],
            settings: { lastRecountAt: "2026-08-01" }
        },
        accounts: {
            checking: { name: "Everyday Checking", balance: -12.34 },
            savings: { name: "Rainy Day", balance: 5000 }
        }
    };
}


test("registry: exactly the audited document types, stable + lowercase, keys not derived from user text", () => {
    const C = loadCodec();
    assert.deepEqual(plain(C.SINGLETON_TYPES),
        ["accounts", "settings", "categories", "recurring-income", "recurring-expenses", "savings", "cash"]);
    assert.equal(C.MONTH_TYPE, "month");
    const defs = C.getDocumentDefinitions();
    assert.equal(defs.length, 8);
    defs.forEach((d) => {
        assert.ok(/^[a-z][a-z0-9-]{0,63}$/.test(d.type), "type is a machine id: " + d.type);
    });
    assert.deepEqual(plain(C.EXCLUDED_LOCAL_FIELDS), ["version", "migrations"]);
});

test("encode: a realistic fixture -> one doc per month, M-Cash isolated, singletons separate", () => {
    const C = loadCodec();
    const local = deepFreeze(fixture());
    const res = C.encodeFinancialState(local);
    assert.equal(res.ok, true);

    const ids = plain(res.documents).map((d) => d.documentType + "/" + d.documentKey);
    assert.deepEqual(ids, [
        "accounts/primary", "settings/primary", "categories/primary",
        "recurring-income/primary", "recurring-expenses/primary",
        "savings/primary", "cash/primary",
        "month/2026-08", "month/2026-09"
    ]);

    /* a September change does not touch the August document */
    const aug = res.documents.find((d) => d.documentKey === "2026-08");
    const sep = res.documents.find((d) => d.documentKey === "2026-09");
    assert.notEqual(JSON.stringify(aug.payload), JSON.stringify(sep.payload));
    assert.equal(aug.payload.monthKey, "2026-08");

    /* M-Cash is its own document, not mixed with budget state */
    const cash = res.documents.find((d) => d.documentType === "cash");
    assert.deepEqual(plain(cash.payload.wallet.denominations), local.cash.wallet.denominations);
    assert.deepEqual(plain(cash.payload.history), local.cash.history);

    /* settings preferences and the category library are separate documents */
    const settings = res.documents.find((d) => d.documentType === "settings");
    assert.deepEqual(plain(settings.payload), { currency: "USD", currencySymbol: "$", firstDayOfWeek: "monday" });
    assert.ok(!("categories" in settings.payload), "categories not in the settings document");
    const cats = res.documents.find((d) => d.documentType === "categories");
    assert.deepEqual(plain(cats.payload), local.settings.categories);
});

test("encode: is deterministic — same input, same output", () => {
    const C = loadCodec();
    const a = JSON.stringify(C.encodeFinancialState(fixture()).documents);
    const b = JSON.stringify(C.encodeFinancialState(fixture()).documents);
    assert.equal(a, b);
});

test("encode: preserves cents, negatives, ids, dates, categories, notes, denominations exactly", () => {
    const C = loadCodec();
    const local = fixture();
    const res = C.encodeFinancialState(local);

    const income = res.documents.find((d) => d.documentType === "recurring-income").payload;
    assert.equal(income.items[0].amount, 4200.55, "cent precision on income");
    assert.equal(income.items[0].id, "inc-1", "income id unchanged");

    const acc = res.documents.find((d) => d.documentType === "accounts").payload;
    assert.equal(acc.checking.balance, -12.34, "negative checking balance preserved");
    assert.equal(acc.savings.balance, 5000);
    assert.equal(acc.checking.name, "Everyday Checking");

    const aug = res.documents.find((d) => d.documentKey === "2026-08").payload;
    assert.equal(aug.startingBalance, -12.34);
    assert.equal(aug.bills[0].recurringSeriesId, "series-rent", "bill recurrence preserved");
    assert.equal(aug.bills[0].id, "bill-1");
    assert.deepEqual(plain(aug.suppressedRecurringBillSeries), ["series-old"]);
    assert.equal(aug.transactions[0].note, "cash withdrawal", "transaction note preserved");
    assert.equal(aug.notes, "First month using M-Wallet — watch groceries.");
    assert.equal(aug.paychecks[0].amount, 4200.55);

    const savings = res.documents.find((d) => d.documentType === "savings").payload;
    assert.equal(savings.goals[0].id, "goal-1");
    assert.equal(savings.goals[0].target, 5000);
    assert.equal(savings.transfers[0].amount, 750);
});

test("round-trip: encode -> decode equals the syncable slice (version + migrations excluded)", () => {
    const C = loadCodec();
    const local = fixture();
    const enc = C.encodeFinancialState(local);
    const dec = C.decodeFinancialDocuments(enc.documents);
    assert.equal(dec.ok, true);

    const slice = C.syncableSlice(local);
    assert.deepEqual(plain(dec.state), plain(slice), "decoded syncable state matches");

    /* what was intentionally dropped */
    assert.ok(!("version" in dec.state), "version not reconstructed");
    assert.ok(!("migrations" in dec.state), "migrations not reconstructed");
});

test("round-trip: empty / default state", () => {
    const C = loadCodec();
    const empty = {
        version: 5, migrations: {},
        settings: { currency: "USD", currencySymbol: "$", firstDayOfWeek: "sunday", categories: { version: 1, list: [] } },
        income: [], expenses: [], months: {}, savingsGoals: [], savingsTransfers: [],
        cash: { initialized: false, wallet: { denominations: {} }, savings: { denominations: {} }, history: [], settings: {} },
        accounts: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } }
    };
    const enc = C.encodeFinancialState(empty);
    assert.equal(enc.ok, true);
    assert.equal(enc.documents.filter((d) => d.documentType === "month").length, 0, "no month docs for empty months");
    const dec = C.decodeFinancialDocuments(enc.documents);
    assert.deepEqual(plain(dec.state), plain(C.syncableSlice(empty)));
});

test("no auth / setup / walkthrough keys ever appear in an encoded document", () => {
    const C = loadCodec();
    const enc = C.encodeFinancialState(fixture());
    const blob = JSON.stringify(enc);
    for (const forbidden of [
        "mwallet.auth.config", "mwallet.auth.session", "mwallet.local.owner.v1",
        "mwallet.setup.v1", "mwallet.setup.draft.v1",
        "mwallet.walkthrough.v1", "mwallet.walkthrough.progress.v1",
        "access_token", "refresh_token", "ownerUserId"
    ]) {
        assert.ok(!blob.includes(forbidden), "no " + forbidden);
    }
});

test("decode: tombstoned documents are treated as absent", () => {
    const C = loadCodec();
    const enc = C.encodeFinancialState(fixture());
    const docs = enc.documents.map((d) => Object.assign({}, d));
    /* tombstone September */
    docs.find((d) => d.documentKey === "2026-09").deletedAt = "2026-09-05T00:00:00.000Z";
    const dec = C.decodeFinancialDocuments(docs);
    assert.ok(!("2026-09" in dec.state.months), "tombstoned month is gone");
    assert.ok("2026-08" in dec.state.months, "live month remains");
});

test("validation: NaN / Infinity / function / cycle payloads are rejected", () => {
    const C = loadCodec();
    assert.equal(C.validateDocument({ documentType: "accounts", documentKey: "primary", schemaVersion: 5, payload: { x: NaN } }).ok, false);
    assert.equal(C.validateDocument({ documentType: "accounts", documentKey: "primary", schemaVersion: 5, payload: { x: Infinity } }).ok, false);
    assert.equal(C.validateDocument({ documentType: "accounts", documentKey: "primary", schemaVersion: 5, payload: { x: -Infinity } }).ok, false);
    assert.equal(C.validateDocument({ documentType: "accounts", documentKey: "primary", schemaVersion: 5, payload: { fn: () => 1 } }).ok, false);
    const cyclic = { a: 1 }; cyclic.self = cyclic;
    assert.equal(C.validateDocument({ documentType: "accounts", documentKey: "primary", schemaVersion: 5, payload: cyclic }).ok, false);
    /* a good document passes */
    assert.equal(C.validateDocument({ documentType: "month", documentKey: "2026-08", schemaVersion: 5, payload: { monthKey: "2026-08", startingBalance: -1.5 } }).ok, true);
});

test("validation: document keys — month YYYY-MM, singletons 'primary'", () => {
    const C = loadCodec();
    assert.equal(C.validateDocumentKey("month", "2026-08").ok, true);
    assert.equal(C.validateDocumentKey("month", "2026-13").ok, false);
    assert.equal(C.validateDocumentKey("month", "2026-8").ok, false);
    assert.equal(C.validateDocumentKey("cash", "primary").ok, true);
    assert.equal(C.validateDocumentKey("cash", "2026-08").ok, false);
    assert.equal(C.validateDocumentKey("Accounts", "primary").ok, false, "uppercase type rejected");
    assert.equal(C.validateDocumentKey("accounts", "user@example.com").ok, false, "email-shaped key rejected");
});

test("validation: an oversized payload is rejected, not silently truncated", () => {
    const C = loadCodec();
    const big = { blob: "x".repeat(C.MAX_PAYLOAD_BYTES + 100) };
    const res = C.validateDocument({ documentType: "cash", documentKey: "primary", schemaVersion: 5, payload: big });
    assert.equal(res.ok, false);
    assert.equal(res.code, "document_too_large");
});

test("no mutation: encoding a deeply-frozen fixture does not throw and does not change it", () => {
    const C = loadCodec();
    const local = deepFreeze(fixture());
    const before = JSON.stringify(local);
    const res = C.encodeFinancialState(local);
    assert.equal(res.ok, true);
    /* mutate a returned payload — the source must be untouched */
    res.documents[0].payload.checking.balance = 999999;
    assert.equal(JSON.stringify(local), before, "source fixture unchanged");
});

test("encode: rejects a non-object local state safely", () => {
    const C = loadCodec();
    assert.equal(C.encodeFinancialState(null).ok, false);
    assert.equal(C.encodeFinancialState("nope").ok, false);
    assert.equal(C.encodeFinancialState([]).ok, false);
});

test("codec makes no network / storage / DOM access (source-level)", () => {
    /* strip block/line comments so a "NEVER touches localStorage" note doesn't trip the check */
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(code), "no network");
    assert.ok(!/createClient|supabase\.|\.from\s*\(\s*["'`]wallet_documents/.test(code), "no Supabase");
    assert.ok(!/localStorage\.|sessionStorage\.|indexedDB\.|\.getItem\s*\(|\.setItem\s*\(/.test(code), "no storage access");
    assert.ok(!/document\.getElementById|document\.querySelector|\.addEventListener/.test(code), "no DOM");
});
