"use strict";

/*
 * ZG7 — Reports analytics helpers.
 *
 * ReportAnalytics only reshapes numbers that app.js already
 * derived with the existing report semantics. These tests pin
 * the reshaping: trend buckets, ranked lists, category/subcategory
 * rollups, and the "never invent data" / "no NaN%" guarantees.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadAnalytics() {
	const sandbox = { window: {} };
	vm.runInNewContext(
		fs.readFileSync(
			path.resolve(__dirname, "../js/reports-analytics.js"),
			"utf8"
		),
		sandbox
	);
	return sandbox.window.ReportAnalytics;
}


test("sumValues adds a breakdown map and ignores junk", () => {
	const A = loadAnalytics();

	assert.equal(A.sumValues({ a: 10, b: 5.5, c: 0 }), 15.5);
	assert.equal(A.sumValues({ a: "12", b: "x", c: null }), 12);
	assert.equal(A.sumValues(null), 0);
	assert.equal(A.sumValues(undefined), 0);
});


test("topEntries ranks descending, drops non-positive, and honours the limit", () => {
	const A = loadAnalytics();

	const ranked = A.topEntries(
		{ Housing: 1850, "Food & Dining": 612.5, Transport: 420, Empty: 0, Bad: -3 },
		2
	);

	assert.equal(ranked.length, 2);
	assert.equal(ranked[0].name, "Housing");
	assert.equal(ranked[1].name, "Food & Dining");
	assert.equal(ranked[0].amount, 1850);

	// no limit -> every positive entry
	assert.equal(
		A.topEntries({ a: 1, b: 2, c: 3 }).length,
		3
	);
	assert.equal(A.topEntries({}).length, 0);
});


test("buildTrendSeries (monthly) makes one point per calendar day", () => {
	const A = loadAnalytics();

	const series = A.buildTrendSeries(
		{
			spendingByDate: {
				"2026-02-03": 42.1,
				"2026-02-03-ignored": 999,
				"2026-02-14": 100,
				"2026-02-28": 7.5
			}
		},
		{ type: "monthly", monthKey: "2026-02" }
	);

	assert.equal(series.mode, "daily");
	assert.equal(series.points.length, 28, "Feb 2026 has 28 days");
	assert.equal(series.points[2].value, 42.1, "day 3");
	assert.equal(series.points[13].value, 100, "day 14");
	assert.equal(series.points[27].value, 7.5, "day 28");
	assert.equal(series.points[0].value, 0, "day 1 has no spending -> zero, not a gap");
	assert.equal(series.max, 100);
	assert.equal(series.total, 149.6);
	assert.equal(series.pointsWithValue, 3);
	assert.equal(series.hasData, true);
	assert.equal(series.points[0].showLabel, true);
	assert.equal(series.points[27].showLabel, true);
});


test("buildTrendSeries (monthly) handles a 31-day month and an empty month", () => {
	const A = loadAnalytics();

	const jan = A.buildTrendSeries(
		{ spendingByDate: {} },
		{ type: "monthly", monthKey: "2026-01" }
	);
	assert.equal(jan.points.length, 31);
	assert.equal(jan.hasData, false);
	assert.equal(jan.total, 0);
	assert.equal(jan.max, 0);

	// leap day
	const febLeap = A.buildTrendSeries(
		{ spendingByDate: { "2024-02-29": 10 } },
		{ type: "monthly", monthKey: "2024-02" }
	);
	assert.equal(febLeap.points.length, 29);
	assert.equal(febLeap.points[28].value, 10);
});


test("buildTrendSeries (yearly / range) makes one point per timeline month, Jan->Dec order preserved", () => {
	const A = loadAnalytics();

	const series = A.buildTrendSeries(
		{
			timeline: [
				{ monthKey: "2026-01", spending: 1200 },
				{ monthKey: "2026-02", spending: 0 },
				{ monthKey: "2026-03", spending: 800 }
			]
		},
		{ type: "yearly", year: "2026" }
	);

	assert.equal(series.mode, "monthly");
	assert.equal(series.points.map((point) => point.label).join(","), "Jan,Feb,Mar");
	assert.equal(series.points[0].value, 1200);
	assert.equal(series.points[1].value, 0, "empty month renders as zero point");
	assert.equal(series.max, 1200);
	assert.equal(series.total, 2000);
	assert.equal(series.pointsWithValue, 2);
	assert.equal(series.points[0].fullLabel, "Jan 2026");
});


test("buildTrendSeries never throws on missing data", () => {
	const A = loadAnalytics();

	const empty = A.buildTrendSeries(undefined, undefined);
	assert.equal(empty.hasData, false);
	assert.equal(empty.points.length, 0);
	assert.equal(empty.total, 0);
	assert.equal(empty.max, 0);
});


test("buildCategoryTree rolls up subcategories with clean percentages", () => {
	const A = loadAnalytics();

	const tree = A.buildCategoryTree(
		{
			"Food & Dining": 612.5,
			Housing: 1850,
			Zero: 0
		},
		{
			"Food & Dining": {
				Groceries: 320,
				Restaurants: 210,
				Coffee: 82.5,
				Nothing: 0
			}
		}
	);

	assert.equal(tree.length, 2);
	assert.equal(tree[0].name, "Housing", "sorted by total desc");
	assert.equal(tree[1].name, "Food & Dining");

	// category percent = share of 2462.5 categorized total
	assert.ok(Math.abs(tree[1].percent - (612.5 / 2462.5) * 100) < 1e-9);

	assert.equal(
		tree[1].subs.map((sub) => sub.name).join(","),
		"Groceries,Restaurants,Coffee"
	);
	// subcategory percent = share of its OWN category
	assert.ok(Math.abs(tree[1].subs[0].percent - (320 / 612.5) * 100) < 1e-9);
	assert.equal(tree[0].subs.length, 0, "Housing has no subcategory detail");
});


test("buildCategoryTree cannot produce NaN% from an empty dataset", () => {
	const A = loadAnalytics();

	assert.equal(A.buildCategoryTree({}, {}).length, 0);
	assert.equal(A.buildCategoryTree({ a: 0, b: 0 }, {}).length, 0);
	assert.equal(A.buildCategoryTree({ a: 5 }, {})[0].percent, 100);
});
