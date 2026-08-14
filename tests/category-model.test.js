"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { StorageHarness } = require("./helpers/storage-harness.js");

function freshHarness(options = {}) {
    return new StorageHarness(options);
}

test("new data receives a valid, empty category configuration", () => {
    const harness = freshHarness();
    const data = harness.reload();

    assert.equal(data.settings.categories.version, 1);
    assert.deepEqual(data.settings.categories.list, []);
    assert.equal(data.migrations.categoriesV1, true);

    harness.cleanup();
});

test("existing settings survive normalization unchanged", () => {
    const harness = freshHarness({
        preloadedData: {
            version: 5,
            settings: {
                currency: "EUR",
                currencySymbol: "€",
                firstDayOfWeek: "monday"
            },
            income: [],
            expenses: [],
            months: {},
            savingsGoals: [],
            savingsTransfers: [],
            accounts: {
                checking: { name: "Checking", balance: 0 },
                savings: { name: "General Savings", balance: 0 }
            }
        }
    });

    const data = harness.reload();

    assert.equal(data.settings.currency, "EUR");
    assert.equal(data.settings.currencySymbol, "€");
    assert.equal(data.settings.firstDayOfWeek, "monday");
    assert.deepEqual(data.settings.categories.list, []);

    harness.cleanup();
});

test("a valid existing category configuration is preserved, not overwritten", () => {
    const harness = freshHarness({
        preloadedData: {
            version: 5,
            settings: {
                categories: {
                    version: 1,
                    list: [
                        {
                            id: "housing",
                            name: "Housing",
                            system: true,
                            enabled: true,
                            subcategories: [
                                { id: "rent", name: "Rent", system: true, enabled: true }
                            ]
                        }
                    ]
                }
            },
            income: [],
            expenses: [],
            months: {},
            savingsGoals: [],
            savingsTransfers: [],
            accounts: {
                checking: { name: "Checking", balance: 0 },
                savings: { name: "General Savings", balance: 0 }
            }
        }
    });

    const data = harness.reload();

    assert.equal(data.settings.categories.list.length, 1);
    assert.equal(data.settings.categories.list[0].id, "housing");
    assert.equal(data.settings.categories.list[0].subcategories[0].id, "rent");

    harness.cleanup();
});

test("malformed category entries are dropped, not replaced", () => {
    const harness = freshHarness({
        preloadedData: {
            version: 5,
            settings: {
                categories: {
                    version: 1,
                    list: [
                        { id: "", name: "No Id" },
                        { id: "no-name", name: "" },
                        null,
                        "not-an-object",
                        {
                            id: "groceries",
                            name: "Groceries",
                            subcategories: [
                                { id: "", name: "Bad" },
                                { id: "food", name: "Food" }
                            ]
                        }
                    ]
                }
            }
        }
    });

    const data = harness.reload();

    assert.equal(data.settings.categories.list.length, 1);
    assert.equal(data.settings.categories.list[0].id, "groceries");
    assert.equal(data.settings.categories.list[0].subcategories.length, 1);
    assert.equal(data.settings.categories.list[0].subcategories[0].id, "food");

    harness.cleanup();
});

test("duplicate ids and case-insensitive duplicate names are conservatively deduped", () => {
    const harness = freshHarness({
        preloadedData: {
            version: 5,
            settings: {
                categories: {
                    version: 1,
                    list: [
                        { id: "groceries", name: "Groceries", system: true, enabled: true, subcategories: [] },
                        { id: "groceries", name: "Groceries Duplicate Id", system: false, enabled: true, subcategories: [] },
                        { id: "groceries-2", name: "groceries", system: false, enabled: true, subcategories: [] }
                    ]
                }
            }
        }
    });

    const data = harness.reload();

    assert.equal(data.settings.categories.list.length, 1);
    assert.equal(data.settings.categories.list[0].name, "Groceries");

    harness.cleanup();
});

test("legacy expense, bill, and transaction category strings remain untouched", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const expense = storage.addExpense({ name: "Groceries", amount: 42, category: "Groceries", subcategory: "Food", merchant: "Walmart" });
    const bill = storage.addBill({ name: "Phone Bill", amount: 60, category: "Phone" });
    const transaction = storage.addTransaction({ description: "Cash withdrawal", amount: -20, category: "Other" });

    assert.equal(expense.category, "Groceries");
    assert.equal(expense.subcategory, "Food");
    assert.equal(expense.merchant, "Walmart");
    assert.equal(expense.categoryId, undefined);

    assert.equal(bill.category, "Phone");
    assert.equal(bill.categoryId, undefined);

    assert.equal(transaction.category, "Other");
    assert.equal(transaction.categoryId, undefined);

    harness.cleanup();
});

test("addCustomCategory creates a stable-id, enabled, non-system category", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");

    assert.ok(category);
    assert.equal(category.name, "Hobbies");
    assert.equal(category.system, false);
    assert.equal(category.enabled, true);
    assert.deepEqual(category.subcategories, []);
    assert.match(category.id, /^category-/);

    harness.cleanup();
});

test("addCustomCategory rejects trimmed, case-insensitive duplicate names", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    storage.addCustomCategory("Hobbies");
    const duplicate = storage.addCustomCategory("  hobbies  ");

    assert.equal(duplicate, null);
    assert.equal(storage.getCategories().length, 1);

    harness.cleanup();
});

test("renameCategory renames while rejecting duplicate names", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");
    storage.addCustomCategory("Crafts");

    const renamed = storage.renameCategory(category.id, "Games");
    assert.equal(renamed.name, "Games");

    const rejected = storage.renameCategory(category.id, "crafts");
    assert.equal(rejected, null);
    assert.equal(storage.getCategory(category.id).name, "Games");

    harness.cleanup();
});

test("setCategoryEnabled toggles enabled state without deleting", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");

    assert.equal(storage.setCategoryEnabled(category.id, false), true);
    assert.equal(storage.getCategory(category.id).enabled, false);
    assert.equal(storage.getCategories({ enabledOnly: true }).length, 0);

    harness.cleanup();
});

test("deleteCustomCategory removes a custom category", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");

    assert.equal(storage.deleteCustomCategory(category.id), true);
    assert.equal(storage.getCategory(category.id), null);

    harness.cleanup();
});

test("system categories cannot be deleted", () => {
    const harness = freshHarness({
        preloadedData: {
            version: 5,
            settings: {
                categories: {
                    version: 1,
                    list: [
                        { id: "housing", name: "Housing", system: true, enabled: true, subcategories: [] }
                    ]
                }
            }
        }
    });
    const storage = harness.storage;

    assert.equal(storage.deleteCustomCategory("housing"), false);
    assert.ok(storage.getCategory("housing"));

    harness.cleanup();
});

test("subcategory add/rename/enable/delete operations work as expected", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");

    const subcategory = storage.addCustomSubcategory(category.id, "Painting");
    assert.equal(subcategory.name, "Painting");
    assert.equal(subcategory.system, false);

    const duplicateSubcategory = storage.addCustomSubcategory(category.id, "painting");
    assert.equal(duplicateSubcategory, null);

    const renamed = storage.renameSubcategory(category.id, subcategory.id, "Drawing");
    assert.equal(renamed.name, "Drawing");

    assert.equal(storage.setSubcategoryEnabled(category.id, subcategory.id, false), true);
    assert.equal(storage.getSubcategory(category.id, subcategory.id).enabled, false);

    assert.equal(storage.deleteCustomSubcategory(category.id, subcategory.id), true);
    assert.equal(storage.getSubcategory(category.id, subcategory.id), null);

    harness.cleanup();
});

test("system subcategories cannot be deleted", () => {
    const harness = freshHarness({
        preloadedData: {
            version: 5,
            settings: {
                categories: {
                    version: 1,
                    list: [
                        {
                            id: "housing",
                            name: "Housing",
                            system: true,
                            enabled: true,
                            subcategories: [
                                { id: "rent", name: "Rent", system: true, enabled: true }
                            ]
                        }
                    ]
                }
            }
        }
    });
    const storage = harness.storage;

    assert.equal(storage.deleteCustomSubcategory("housing", "rent"), false);
    assert.ok(storage.getSubcategory("housing", "rent"));

    harness.cleanup();
});

test("category mutations return null/false when persistence fails", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");
    const subcategory = storage.addCustomSubcategory(category.id, "Painting");

    harness.setFailWrites(true);

    assert.equal(storage.addCustomCategory("Crafts"), null);
    assert.equal(storage.renameCategory(category.id, "Games"), null);
    assert.equal(storage.setCategoryEnabled(category.id, false), false);
    assert.equal(storage.deleteCustomCategory(category.id), false);
    assert.equal(storage.addCustomSubcategory(category.id, "Sculpting"), null);
    assert.equal(storage.renameSubcategory(category.id, subcategory.id, "Sketching"), null);
    assert.equal(storage.setSubcategoryEnabled(category.id, subcategory.id, false), false);
    assert.equal(storage.deleteCustomSubcategory(category.id, subcategory.id), false);

    harness.setFailWrites(false);

    assert.equal(storage.getCategory(category.id).name, "Hobbies");
    assert.equal(storage.getSubcategory(category.id, subcategory.id).name, "Painting");

    harness.cleanup();
});

test("getCategories/getSubcategories return clones that cannot mutate internal state", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");
    storage.addCustomSubcategory(category.id, "Painting");

    const categories = storage.getCategories();
    categories[0].name = "Mutated";
    categories[0].subcategories.push({ id: "fake", name: "Fake", system: false, enabled: true });

    assert.equal(storage.getCategory(category.id).name, "Hobbies");
    assert.equal(storage.getSubcategories(category.id).length, 1);

    harness.cleanup();
});
