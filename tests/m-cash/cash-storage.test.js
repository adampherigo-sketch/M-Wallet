"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const productionPath = path.resolve(__dirname, "../../js/m-cash/cash-storage.js");

function loadStorage() {
	const sandbox = { window: {} };
	vm.runInNewContext(
		fs.readFileSync(productionPath, "utf8"),
		sandbox,
		{ filename: productionPath }
	);
	return sandbox.window.MCashStorage;
}

test("supported denominations contain all 13 definitions", () => {
	const storage = loadStorage();
	const denominations = storage.getDenominationDefinitions();

	assert.equal(denominations.length, 13);
	assert.equal(new Set(denominations.map(item => item.id)).size, 13);
	assert.deepEqual(
		[...denominations].map(item => item.valueCents),
		[100, 200, 500, 1000, 2000, 5000, 10000, 1, 5, 10, 25, 50, 100]
	);
});

test("denomination definitions are safe copies", () => {
	const storage = loadStorage();
	const first = storage.getDenominationDefinitions();

	first[0].label = "changed";

	assert.equal(storage.getDenominationDefinitions()[0].label, "$1");
});

test("empty wallets contain zero quantities and total zero", () => {
	const storage = loadStorage();
	const wallet = storage.createEmptyWallet();

	assert.equal(Object.keys(wallet.denominations).length, 13);
	assert.ok(Object.values(wallet.denominations).every(quantity => quantity === 0));
	assert.equal(storage.calculateTotalCashCents(wallet), 0);
});

test("mixed denominations calculate the total in cents", () => {
	const storage = loadStorage();
	const wallet = {
		denominations: {
			"bill-20": 2,
			"bill-2": 3,
			"coin-quarter": 2,
			"coin-penny": 4
		}
	};

	assert.equal(storage.calculateTotalCashCents(wallet), 4654);
});

test("two-dollar bills, half dollars, and dollar coins are supported", () => {
	const storage = loadStorage();

	assert.equal(
		storage.calculateTotalCashCents({
			denominations: {
				"bill-2": 4,
				"coin-half-dollar": 3,
				"coin-dollar": 2
			}
		}),
		1150
	);
});

test("missing denominations normalize to zero", () => {
	const storage = loadStorage();
	const quantities = storage.normalizeDenominationQuantities({ "bill-5": 2 });

	assert.equal(quantities["bill-5"], 2);
	assert.equal(quantities["bill-100"], 0);
	assert.equal(Object.keys(quantities).length, 13);
});

test("invalid quantities normalize to zero", () => {
	const storage = loadStorage();
	const quantities = storage.normalizeDenominationQuantities({
		"bill-1": -1,
		"bill-2": 1.5,
		"bill-5": NaN,
		"bill-10": Infinity,
		"bill-20": "not-a-number",
		"bill-50": "2.5",
		"bill-100": " 3 "
	});

	assert.deepEqual({ ...quantities }, {
		"bill-1": 0,
		"bill-2": 0,
		"bill-5": 0,
		"bill-10": 0,
		"bill-20": 0,
		"bill-50": 0,
		"bill-100": 3,
		"coin-penny": 0,
		"coin-nickel": 0,
		"coin-dime": 0,
		"coin-quarter": 0,
		"coin-half-dollar": 0,
		"coin-dollar": 0
	});
});

test("unknown denomination keys do not affect totals", () => {
	const storage = loadStorage();
	const wallet = {
		denominations: {
			"bill-1": 2,
			"unknown-denomination": 100000
		}
	};

	assert.equal(storage.calculateTotalCashCents(wallet), 200);
});

test("fresh wallets are independent objects", () => {
	const storage = loadStorage();
	const first = storage.createEmptyWallet();
	const second = storage.createEmptyWallet();

	first.denominations["bill-100"] = 1;

	assert.equal(second.denominations["bill-100"], 0);
	assert.notEqual(first, second);
	assert.notEqual(first.denominations, second.denominations);
});

test("normalized wallets return a safe complete state", () => {
	const storage = loadStorage();
	const source = {
		denominations: {
			"bill-10": "2",
			unknown: 8
		}
	};
	const normalized = storage.normalizeWallet(source);

	source.denominations["bill-10"] = 9;

	assert.equal(normalized.denominations["bill-10"], 2);
	assert.equal(normalized.denominations["coin-quarter"], 0);
	assert.equal(storage.calculateTotalCashCents(normalized), 2000);
});

test("total calculations are finite non-negative integer cents", () => {
	const storage = loadStorage();
	const total = storage.calculateTotalCashCents({
		denominations: {
			"bill-100": Number.MAX_SAFE_INTEGER,
			"coin-dollar": Number.MAX_SAFE_INTEGER
		}
	});

	assert.equal(Number.isFinite(total), true);
	assert.equal(Number.isInteger(total), true);
	assert.equal(total >= 0, true);
});
