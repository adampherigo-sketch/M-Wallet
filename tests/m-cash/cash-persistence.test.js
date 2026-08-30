"use strict";

/*
 * ZG10 regression — M-Cash wallet must survive a page reload.
 *
 * In the browser, js/storage.js self-initializes (BudgetStorage.load()
 * at end of file) BEFORE js/m-cash/cash-storage.js runs, so
 * window.MCashStorage is undefined on that first load(). load()
 * normalizes then save()s the data back, so if normalizeCashState()
 * can't normalise it must not replace a saved wallet with an empty one.
 *
 * This test loads storage.js in isolation (no MCashStorage), exactly
 * like that first browser pass, and asserts a persisted wallet is kept.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const STORAGE = path.resolve(__dirname, "../../js/storage.js");
const CASH_STORAGE = path.resolve(__dirname, "../../js/m-cash/cash-storage.js");
const KEY = "mWalletData";

function makeLocalStorage(seed) {
	const map = new Map();
	if (seed) {
		Object.entries(seed).forEach(([k, v]) => map.set(String(k), String(v)));
	}
	return {
		get length() { return map.size; },
		clear: () => map.clear(),
		getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
		key: (i) => Array.from(map.keys())[i] ?? null,
		removeItem: (k) => map.delete(String(k)),
		setItem: (k, v) => map.set(String(k), String(v)),
		_dump: () => Object.fromEntries(map)
	};
}

function bootStorageOnly(localStorage) {
	// storage.js only — mirrors the browser's first script-execution pass
	const sandbox = {
		console: { log() {}, warn() {}, error() {} },
		document: { getElementById: () => null },
		localStorage,
		window: { crypto: { randomUUID: () => "uuid-" + Math.random().toString(16).slice(2) } },
		setTimeout, clearTimeout
	};
	sandbox.window.window = sandbox.window;
	const ctx = vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(STORAGE, "utf8"), ctx, { filename: STORAGE });
	return { ctx, storage: ctx.window.BudgetStorage, sandbox };
}


test("a persisted M-Cash wallet is NOT wiped by the storage.js self-load (MCashStorage absent)", () => {
	const wallet = {
		"bill-100": 2, "bill-20": 3, "bill-5": 2, "bill-1": 4,
		"coin-quarter": 8, "coin-dime": 3, "coin-nickel": 4, "coin-penny": 12
	};
	const preloaded = {
		version: 5,
		settings: {},
		income: [], expenses: [], months: {},
		savingsGoals: [], savingsTransfers: [],
		accounts: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } },
		cash: {
			initialized: true,
			wallet: { denominations: { ...wallet } },
			savings: { denominations: {} },
			history: [{ id: "mc-1", date: "2026-08-14", type: "recount", label: "Recounted cash", amountCents: 27662 }],
			settings: {}
		}
	};

	const localStorage = makeLocalStorage({ [KEY]: JSON.stringify(preloaded) });

	// this executes storage.js including its end-of-file BudgetStorage.load()
	const { storage } = bootStorageOnly(localStorage);
	assert.ok(storage, "storage.js exposed BudgetStorage");
	assert.equal(storage.getCashStorage(), null, "MCashStorage is absent on this pass, as in the browser");

	// what got written back to localStorage by that first load()
	const afterBoot = JSON.parse(localStorage.getItem(KEY));
	assert.ok(afterBoot.cash && afterBoot.cash.wallet, "cash.wallet still present after self-load");
	assert.deepEqual(
		JSON.parse(JSON.stringify(afterBoot.cash.wallet.denominations)),
		wallet,
		"wallet denominations survived the MCashStorage-less load()"
	);
	assert.equal(afterBoot.cash.initialized, true);
	assert.equal(afterBoot.cash.history.length, 1);
});


test("after MCashStorage loads, a second load() normalises the preserved wallet and keeps every quantity", () => {
	const wallet = { "bill-50": 1, "bill-10": 7, "coin-quarter": 5 };
	const preloaded = {
		version: 5, settings: {}, income: [], expenses: [], months: {},
		savingsGoals: [], savingsTransfers: [],
		accounts: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } },
		cash: { initialized: true, wallet: { denominations: { ...wallet } }, savings: { denominations: {} }, history: [], settings: {} }
	};
	const localStorage = makeLocalStorage({ [KEY]: JSON.stringify(preloaded) });

	// pass 1: storage.js only (self-load runs here)
	bootStorageOnly(localStorage);

	// pass 2: full context — cash-storage.js THEN storage.js, like a later getCashState()
	const sandbox = {
		console: { log() {}, warn() {}, error() {} },
		document: { getElementById: () => null },
		localStorage,
		window: { crypto: { randomUUID: () => "uuid-" + Math.random().toString(16).slice(2) } },
		setTimeout, clearTimeout
	};
	sandbox.window.window = sandbox.window;
	const ctx = vm.createContext(sandbox);
	vm.runInContext(fs.readFileSync(CASH_STORAGE, "utf8"), ctx, { filename: CASH_STORAGE });
	vm.runInContext(fs.readFileSync(STORAGE, "utf8"), ctx, { filename: STORAGE });
	const storage = ctx.window.BudgetStorage;

	const state = storage.getCashState();
	assert.equal(state.wallet.denominations["bill-50"], 1);
	assert.equal(state.wallet.denominations["bill-10"], 7);
	assert.equal(state.wallet.denominations["coin-quarter"], 5);
	assert.equal(
		ctx.window.MCashStorage.calculateTotalCashCents({ denominations: state.wallet.denominations }),
		1 * 5000 + 7 * 1000 + 5 * 25
	);
});
