"use strict";

/*
 * ZG6 — M-Cash Cash Savings.
 * Cash Savings is a denomination allocation of cash already held.
 * Moving cash in/out never changes total M-Cash.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSavings() {
	const sandbox = { window: {} };
	vm.runInNewContext(
		fs.readFileSync(path.resolve(__dirname, "../../js/m-cash/cash-storage.js"), "utf8"),
		sandbox
	);
	vm.runInNewContext(
		fs.readFileSync(path.resolve(__dirname, "../../js/m-cash/cash-savings.js"), "utf8"),
		sandbox
	);
	return sandbox.window;
}

function state(walletQ, savingsQ) {
	return {
		wallet: { denominations: walletQ || {} },
		savings: { denominations: savingsQ || {} }
	};
}


test("moving cash to savings conserves total M-Cash", () => {
	const { MCashSavings, MCashStorage } = loadSavings();

	const before = state({ "bill-20": 5, "bill-5": 4, "coin-quarter": 8 }, {});
	const beforeTotal =
		MCashStorage.calculateTotalCashCents(before.wallet) +
		MCashStorage.calculateTotalCashCents(before.savings);

	const result = MCashSavings.moveDenominations(before, { "bill-20": 2 }, "to-savings");

	assert.equal(result.ok, true);
	assert.equal(result.wallet["bill-20"], 3, "wallet loses 2 x $20");
	assert.equal(result.savings["bill-20"], 2, "savings gains 2 x $20");

	const afterTotal =
		MCashStorage.calculateTotalCashCents({ denominations: result.wallet }) +
		MCashStorage.calculateTotalCashCents({ denominations: result.savings });

	assert.equal(afterTotal, beforeTotal, "total M-Cash unchanged");
	// wallet after = 3 x $20 + 4 x $5 + 8 x 25c = 6000 + 2000 + 200 = 8200
	assert.equal(
		MCashStorage.calculateTotalCashCents({ denominations: result.wallet }),
		8200
	);
});


test("returning cash from savings conserves total M-Cash", () => {
	const { MCashSavings, MCashStorage } = loadSavings();

	const before = state({ "bill-20": 3 }, { "bill-20": 2, "coin-quarter": 4 });
	const beforeTotal =
		MCashStorage.calculateTotalCashCents(before.wallet) +
		MCashStorage.calculateTotalCashCents(before.savings);

	const result = MCashSavings.moveDenominations(before, { "bill-20": 1, "coin-quarter": 4 }, "to-wallet");

	assert.equal(result.ok, true);
	assert.equal(result.wallet["bill-20"], 4);
	assert.equal(result.wallet["coin-quarter"], 4);
	assert.equal(result.savings["bill-20"], 1);
	assert.equal(result.savings["coin-quarter"], 0);

	const afterTotal =
		MCashStorage.calculateTotalCashCents({ denominations: result.wallet }) +
		MCashStorage.calculateTotalCashCents({ denominations: result.savings });

	assert.equal(afterTotal, beforeTotal);
});


test("cannot move more of a denomination than the source holds", () => {
	const { MCashSavings } = loadSavings();

	const result = MCashSavings.moveDenominations(
		state({ "bill-20": 1 }, {}),
		{ "bill-20": 5 },
		"to-savings"
	);

	assert.equal(result.ok, false);
	assert.equal(result.reason, "insufficient");
});


test("an empty move is rejected", () => {
	const { MCashSavings } = loadSavings();

	const result = MCashSavings.moveDenominations(
		state({ "bill-20": 3 }, {}),
		{ "bill-20": 0, "bill-5": 0 },
		"to-savings"
	);

	assert.equal(result.ok, false);
	assert.equal(result.reason, "amount");
});


test("malformed move quantities normalise to zero (no fractional / negative bills)", () => {
	const { MCashSavings } = loadSavings();

	const result = MCashSavings.moveDenominations(
		state({ "bill-20": 5 }, {}),
		{ "bill-20": "2", "bill-5": -3, "bill-1": 1.5 },
		"to-savings"
	);

	// "2" -> 2 ; -3 and 1.5 -> 0
	assert.equal(result.ok, true);
	assert.equal(result.wallet["bill-20"], 3);
	assert.equal(result.savings["bill-20"], 2);
	assert.equal(result.savings["bill-5"], 0);
	assert.equal(result.savings["bill-1"], 0);
});
