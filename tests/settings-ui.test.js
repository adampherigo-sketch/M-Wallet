"use strict";

/*
 * ZG8 — Settings UI.
 *
 * window.SettingsUI is a thin presenter over storage.js. It adds no
 * accounting or category logic of its own, so these tests pin:
 *   1. its pure display helpers, and
 *   2. that the exact storage call sequence the category manager
 *      performs behaves correctly (add / rename / enable / delete,
 *      system protection, persistence) — using production storage.js.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { StorageHarness } = require("./helpers/storage-harness.js");

function loadSettingsUI() {
	const sandbox = { window: {} };
	// no `document` in the sandbox -> the module skips its DOM auto-init
	vm.runInNewContext(
		fs.readFileSync(path.resolve(__dirname, "../js/settings-ui.js"), "utf8"),
		sandbox
	);
	return sandbox.window.SettingsUI;
}


test("estimateStorageBytes is a 2-bytes-per-char upper bound and never NaN", () => {
	const S = loadSettingsUI();

	assert.equal(S.estimateStorageBytes(""), 0);
	assert.equal(S.estimateStorageBytes("abcd"), 8);
	assert.equal(S.estimateStorageBytes(null), 0);
	assert.equal(S.estimateStorageBytes(undefined), 0);
	assert.equal(S.estimateStorageBytes(12345), 0);
});


test("formatBytes renders B / KB / MB without NaN or Infinity", () => {
	const S = loadSettingsUI();

	assert.equal(S.formatBytes(0), "0 B");
	assert.equal(S.formatBytes(512), "512 B");
	assert.equal(S.formatBytes(2048), "2.0 KB");
	assert.equal(S.formatBytes(5 * 1024 * 1024), "5.00 MB");
	assert.equal(S.formatBytes("junk"), "0 B");
	assert.equal(S.formatBytes(Infinity), "0 B");
});


test("categoryRowModel summarises a category row for display", () => {
	const S = loadSettingsUI();

	const system = S.categoryRowModel({
		id: "groceries",
		name: "Groceries",
		system: true,
		enabled: true,
		subcategories: [
			{ id: "a", name: "A", enabled: true },
			{ id: "b", name: "B", enabled: false }
		]
	});

	assert.equal(system.id, "groceries");
	assert.equal(system.name, "Groceries");
	assert.equal(system.system, true);
	assert.equal(system.enabled, true);
	assert.equal(system.subCount, 2);
	assert.equal(system.subEnabledCount, 1);

	// defensive against malformed input
	const junk = S.categoryRowModel(null);
	assert.equal(junk.id, "");
	assert.equal(junk.system, false);
	assert.equal(junk.enabled, true);
	assert.equal(junk.subCount, 0);

	// enabled defaults to true unless explicitly false
	assert.equal(S.categoryRowModel({ id: "x", name: "X" }).enabled, true);
	assert.equal(S.categoryRowModel({ id: "x", name: "X", enabled: false }).enabled, false);
});


test("the category-manager storage sequence: add, add sub, rename, disable, delete", () => {
	const harness = new StorageHarness();
	const storage = harness.storage;

	// add custom category (what "Create" does)
	const category = storage.addCustomCategory("Hobbies");
	assert.ok(category);
	assert.equal(category.system, false);

	// add custom subcategory
	const sub = storage.addCustomSubcategory(category.id, "Painting");
	assert.ok(sub);
	assert.equal(sub.system, false);

	// rename category
	assert.equal(storage.renameCategory(category.id, "Leisure").name, "Leisure");

	// rename subcategory
	assert.equal(
		storage.renameSubcategory(category.id, sub.id, "Sketching").name,
		"Sketching"
	);

	// disable / re-enable (the switch)
	assert.equal(storage.setCategoryEnabled(category.id, false), true);
	assert.equal(storage.getCategory(category.id).enabled, false);
	assert.equal(storage.setCategoryEnabled(category.id, true), true);

	// a disabled category disappears from the money-form option list
	storage.setSubcategoryEnabled(category.id, sub.id, false);
	assert.equal(
		storage.getSubcategories(category.id, { enabledOnly: true }).length,
		0
	);

	// delete subcategory then category
	assert.equal(storage.deleteCustomSubcategory(category.id, sub.id), true);
	assert.equal(storage.deleteCustomCategory(category.id), true);
	assert.equal(storage.getCategory(category.id), null);

	harness.cleanup();
});


test("the category manager cannot delete a system category or system subcategory", () => {
	const harness = new StorageHarness();
	const storage = harness.storage;

	const housing = storage.getCategories().find((c) => c.id === "housing");
	assert.ok(housing);
	assert.equal(housing.system, true);

	assert.equal(storage.deleteCustomCategory("housing"), false);
	assert.ok(storage.getCategory("housing"), "system category still present");

	const firstSub = housing.subcategories[0];
	assert.equal(storage.deleteCustomSubcategory("housing", firstSub.id), false);
	assert.ok(storage.getSubcategory("housing", firstSub.id));

	// but a system category CAN be renamed and disabled (existing contract)
	assert.ok(storage.renameCategory("housing", "Home"));
	assert.equal(storage.setCategoryEnabled("housing", false), true);

	harness.cleanup();
});


test("a custom category added via the manager survives a reload (persistence contract)", () => {
	const harness = new StorageHarness();
	const storage = harness.storage;

	const category = storage.addCustomCategory("Hobbies");
	storage.addCustomSubcategory(category.id, "Painting");

	harness.reload();
	harness.reload();

	const persisted = storage.getCategory(category.id);
	assert.ok(persisted);
	assert.equal(persisted.name, "Hobbies");
	assert.equal(persisted.subcategories.length, 1);
	assert.equal(persisted.subcategories[0].name, "Painting");

	harness.cleanup();
});
