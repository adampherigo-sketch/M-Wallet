"use strict";

/*
 * ZG6 — M-Cash denomination calculator.
 * Greedy largest-first breakdown bounded by the wallet inventory.
 * Integer cents only.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadCalculator() {
	const sandbox = { window: {} };
	vm.runInNewContext(
		fs.readFileSync(path.resolve(__dirname, "../../js/m-cash/cash-storage.js"), "utf8"),
		sandbox
	);
	vm.runInNewContext(
		fs.readFileSync(path.resolve(__dirname, "../../js/m-cash/cash-calculator.js"), "utf8"),
		sandbox
	);
	return sandbox.window;
}

const wallet = (denominations) => ({ denominations });


test("suggests an exact combination using only held denominations", () => {
	const { MCashCalculator } = loadCalculator();

	const result = MCashCalculator.suggestBreakdown(3742, wallet({
		"bill-20": 1,
		"bill-5": 2,
		"bill-1": 7,
		"coin-quarter": 1,
		"coin-dime": 1,
		"coin-nickel": 1,
		"coin-penny": 2
	}));

	assert.equal(result.ok, true);
	assert.equal(result.totalCents, 3742);
	assert.equal(result.breakdown["bill-20"], 1);
	assert.equal(result.breakdown["bill-5"], 2);
	assert.equal(result.breakdown["bill-1"], 7);
	assert.equal(result.breakdown["coin-quarter"], 1);
	assert.equal(result.breakdown["coin-dime"], 1);
	assert.equal(result.breakdown["coin-nickel"], 1);
	assert.equal(result.breakdown["coin-penny"], 2);
	assert.equal(MCashCalculator.breakdownTotalCents(result.breakdown), 3742);
});


test("never suggests a denomination the wallet does not hold", () => {
	const { MCashCalculator } = loadCalculator();

	// $100 available but zero $100 bills — must build from smaller notes
	const result = MCashCalculator.suggestBreakdown(10000, wallet({
		"bill-100": 0,
		"bill-50": 2,
		"bill-20": 5
	}));

	assert.equal(result.ok, true);
	assert.equal(result.breakdown["bill-100"], undefined);
	assert.equal(MCashCalculator.breakdownTotalCents(result.breakdown), 10000);
});


test("greedy breakdown is bounded by held quantity", () => {
	const { MCashCalculator } = loadCalculator();

	// need $60, only one $20 and the rest in $5s
	const result = MCashCalculator.suggestBreakdown(6000, wallet({
		"bill-20": 1,
		"bill-5": 20
	}));

	assert.equal(result.ok, true);
	assert.equal(result.breakdown["bill-20"], 1);
	assert.equal(result.breakdown["bill-5"], 8);
	assert.equal(MCashCalculator.breakdownTotalCents(result.breakdown), 6000);
});


test("reports unavailable when exact change cannot be made", () => {
	const { MCashCalculator } = loadCalculator();

	// $0.03 needed but only nickels held
	const result = MCashCalculator.suggestBreakdown(3, wallet({ "coin-nickel": 10 }));

	assert.equal(result.ok, false);
	assert.equal(result.reason, "unavailable");
	assert.ok(result.shortfallCents > 0);
});


test("rejects a zero or negative amount", () => {
	const { MCashCalculator } = loadCalculator();

	assert.equal(MCashCalculator.suggestBreakdown(0, wallet({ "bill-1": 5 })).reason, "amount");
	assert.equal(MCashCalculator.suggestBreakdown(-100, wallet({ "bill-1": 5 })).reason, "amount");
});


test("cannot overdraw the wallet — total never exceeds inventory", () => {
	const { MCashCalculator } = loadCalculator();

	const result = MCashCalculator.suggestBreakdown(50000, wallet({ "bill-20": 3 }));

	assert.equal(result.ok, false);
	assert.equal(result.reason, "unavailable");
});
