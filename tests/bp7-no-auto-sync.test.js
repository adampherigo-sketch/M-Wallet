"use strict";

/* =========================================================
   BP7 — NO AUTOMATIC SYNCHRONIZATION  +  FINANCIAL INTEGRITY

   BP7 builds the cloud CAPABILITY, never synchronization.
   The guarantees under test:

     1. Only ONE runtime module ever names the wallet_documents
        table, and only TWO modules ever reference the cloud
        store global (the store itself + the user-triggered
        Settings check).
     2. The store's on-load boot (initialize / DOMContentLoaded)
        performs ZERO network calls.
     3. Nothing subscribes to auth changes to auto-pull cloud
        data.
     4. The local storage engine (js/storage.js) has no knowledge
        of the cloud at all — opening M-Wallet, saving, or loading
        cannot start an upload.
     5. Running the codec over real mWalletData does not mutate
        the stored local data by a single byte, and the cloud
        documents round-trip back to the same syncable slice.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const { StorageHarness } = require("./helpers/storage-harness.js");

function readJsTree(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { out.push(...readJsTree(full)); }
        else if (entry.isFile() && entry.name.endsWith(".js")) {
            out.push({ path: path.relative(ROOT, full), src: fs.readFileSync(full, "utf8") });
        }
    }
    return out;
}
const JS_FILES = readJsTree(path.join(ROOT, "js"));

const STORE_REL = "js/cloud/cloud-financial-store.js";
const STORE_SRC = fs.readFileSync(path.join(ROOT, STORE_REL), "utf8");
const CODEC_SRC = fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-codec.js"), "utf8");

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");


test("only cloud-financial-store.js ever names the wallet_documents table (in real code)", () => {
    const offenders = JS_FILES
        .filter((f) => f.path !== STORE_REL && /wallet_documents/.test(stripComments(f.src)));
    assert.deepEqual(offenders.map((f) => f.path), [], "no other runtime module references wallet_documents");
});

test("the cloud store global is referenced only by the store, the BP8 sync engine, and Settings", () => {
    const refs = JS_FILES
        .filter((f) => /\bMWalletCloudFinancial\b/.test(f.src.replace(/MWalletCloudFinancialCodec/g, "")))
        .map((f) => f.path)
        .sort();
    assert.deepEqual(refs, [
        "js/cloud/cloud-financial-store.js",
        "js/settings-ui.js",
        "js/sync/sync-engine.js"
    ]);
});

test("the BP8 sync engine talks to the cloud ONLY through the store (no Supabase, no token)", () => {
    const engine = stripComments(fs.readFileSync(path.join(ROOT, "js/sync/sync-engine.js"), "utf8"));
    assert.ok(!/\.from\s*\(\s*["'`]wallet_documents/.test(engine), "no direct .from(\"wallet_documents\")");
    assert.ok(!/createClient|new\s+SupabaseClient|_getClient\s*\(/.test(engine), "constructs / fetches no client");
    assert.ok(!/access_token|refresh_token|Authorization|Bearer/.test(engine), "no token / auth header");
    assert.ok(!/sb_secret_|service_role/.test(engine), "no privileged key");
    assert.ok(/safeGlobal\(\s*["']MWalletCloudFinancial["']\s*\)/.test(engine), "uses the MWalletCloudFinancial store");
});

test("nothing subscribes to auth state changes to auto-pull cloud data", () => {
    /* the store must not wire an auth listener that would fetch on sign-in */
    assert.ok(!/onAuthStateChange/.test(STORE_SRC));
    assert.ok(!/addEventListener\(\s*["'`]mwallet[:.]auth/.test(STORE_SRC));
    assert.ok(!/subscribe\s*\(/.test(STORE_SRC));
    /* the only listener the store may register is a one-shot DOMContentLoaded boot marker */
    const listeners = STORE_SRC.match(/addEventListener\(\s*["'`]([^"'`]+)/g) || [];
    assert.deepEqual(listeners.map((l) => l.replace(/.*["'`]/, "")), ["DOMContentLoaded"]);
});

test("the local storage engine has zero knowledge of the cloud", () => {
    const storageSrc = fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8");
    assert.ok(!/MWalletCloudFinancial|wallet_documents|supabase|_getClient/i.test(storageSrc),
        "js/storage.js never mentions the cloud");
});

test("store boot (initialize + DOMContentLoaded) performs ZERO network calls", async () => {
    const calls = [];
    const clientStub = {
        from() {
            calls.push("from");
            const b = new Proxy(function () {}, {
                get: () => (...a) => b,
                apply: () => b
            });
            return b;
        }
    };
    let domHandler = null;
    const sandbox = {
        window: {}, console,
        setTimeout, Promise, JSON, Number, Math, Date, Object, Array, String,
        document: {
            readyState: "loading",
            addEventListener: (evt, fn) => { if (evt === "DOMContentLoaded") { domHandler = fn; } }
        }
    };
    sandbox.self = sandbox.window;
    sandbox.window.MWalletAuth = {
        getState: () => ({ configured: true, status: "signed_in", user: { id: "u" } }),
        isAuthenticated: () => true,
        _getClient: () => clientStub
    };
    vm.createContext(sandbox);
    vm.runInContext(CODEC_SRC, sandbox, { filename: "codec.js" });
    vm.runInContext(STORE_SRC, sandbox, { filename: "store.js" });

    assert.equal(typeof domHandler, "function", "the store registered a DOMContentLoaded boot handler");
    await domHandler();                                  /* simulate the app finishing load */
    await sandbox.window.MWalletCloudFinancial.initialize();

    assert.deepEqual(calls, [], "no client.from() call happened on boot");
    assert.equal(sandbox.window.MWalletCloudFinancial.getState().syncEnabled, false);
});

test("codec over REAL mWalletData does not mutate the stored local data", () => {
    const harness = new StorageHarness();
    let data = harness.reload();

    /* make it realistic: two months with paychecks, bills, transactions,
       savings goals, and an M-Cash wallet */
    data.settings.currency = "USD";
    data.settings.currencySymbol = "$";
    data.accounts.checking.balance = 4200.55;
    data.accounts.savings.balance = 1875.10;
    data.income.push({ id: "inc-1", name: "Salary", amount: 3000, frequency: "biweekly" });
    data.expenses.push({ id: "exp-1", name: "Rent", amount: 1450.75, dayOfMonth: 1 });
    data.savingsGoals.push({ id: "goal-1", name: "Emergency", target: 10000, saved: 1875.10 });
    data.months["2026-08"] = {
        monthKey: "2026-08", startingBalance: 1000.25, endingBalance: 1234.56,
        paychecks: [{ id: "pc-1", amount: 1500, date: "2026-08-01" }],
        bills: [{ id: "b-1", name: "Power", amount: 92.4, dueDate: "2026-08-12", paid: true }],
        suppressedRecurringBillSeries: [], expenses: [{ id: "me-1", name: "Groceries", amount: 63.29 }],
        transactions: [{ id: "t-1", type: "expense", amount: 12.99, note: "Coffee ☕" }],
        savingsDeposits: [], savingsTransfers: [], notes: "August",
        createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z"
    };
    data.months["2026-09"] = {
        monthKey: "2026-09", startingBalance: 1234.56, endingBalance: 1234.56,
        paychecks: [], bills: [], suppressedRecurringBillSeries: [], expenses: [],
        transactions: [], savingsDeposits: [], savingsTransfers: [], notes: "",
        createdAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z"
    };
    harness.save(data);

    const before = harness.localStorage.getItem("mWalletData");

    /* run the codec exactly as a future feature would */
    const sandbox = { window: {}, console };
    vm.createContext(sandbox);
    vm.runInContext(CODEC_SRC, sandbox, { filename: "codec.js" });
    const codec = sandbox.window.MWalletCloudFinancialCodec;

    const encoded = codec.encodeFinancialState(JSON.parse(before));
    assert.equal(encoded.ok, true, JSON.stringify(encoded));

    const after = harness.localStorage.getItem("mWalletData");
    assert.equal(after, before, "mWalletData string is byte-identical after encoding");

    /* the produced documents reconstruct the same syncable slice */
    const asCloudRows = encoded.documents.map((d) => ({
        documentType: d.documentType, documentKey: d.documentKey, payload: d.payload
    }));
    const decoded = codec.decodeFinancialDocuments(asCloudRows);
    assert.equal(decoded.ok, true);
    assert.deepEqual(
        JSON.parse(JSON.stringify(decoded.state)),
        JSON.parse(JSON.stringify(codec.syncableSlice(JSON.parse(before)))),
        "cloud documents round-trip to the local syncable slice"
    );

    /* the exact user money values survive */
    const monthDoc = encoded.documents.find((d) => d.documentType === "month" && d.documentKey === "2026-08");
    assert.equal(monthDoc.payload.startingBalance, 1000.25);
    assert.equal(monthDoc.payload.bills[0].amount, 92.4);
    assert.equal(monthDoc.payload.transactions[0].note, "Coffee ☕");
    const acctDoc = encoded.documents.find((d) => d.documentType === "accounts");
    assert.equal(acctDoc.payload.checking.balance, 4200.55);

    harness.cleanup();
});

test("a passive store initialize() never writes mWalletData (throwing localStorage is fine)", async () => {
    const throwingStorage = {
        getItem: () => { throw new Error("localStorage must not be touched by the cloud store"); },
        setItem: () => { throw new Error("the cloud store must never write local data"); },
        removeItem: () => { throw new Error("no"); }
    };
    const sandbox = {
        window: {}, console, setTimeout, Promise, JSON, Number, Math, Date, Object, Array, String,
        localStorage: throwingStorage
    };
    sandbox.self = sandbox.window;
    sandbox.window.MWalletAuth = {
        getState: () => ({ configured: false, status: "unconfigured" }),
        isAuthenticated: () => false,
        _getClient: () => null
    };
    vm.createContext(sandbox);
    vm.runInContext(CODEC_SRC, sandbox, { filename: "codec.js" });
    vm.runInContext(STORE_SRC, sandbox, { filename: "store.js" });

    const state = await sandbox.window.MWalletCloudFinancial.initialize();
    assert.equal(state.status, "unconfigured");
    assert.equal(state.syncEnabled, false);
});
