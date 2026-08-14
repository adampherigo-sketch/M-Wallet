"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { StorageHarness } = require("./helpers/storage-harness.js");

function freshHarness(options = {}) {
    return new StorageHarness(options);
}

/*
    The storage harness runs production storage.js in a node:vm context, so
    arrays derived from its data are constructed against that context's
    Array, not this test file's Array. assert.deepEqual treats those as
    non-reference-equal even when structurally identical, so plain array/id
    comparisons here go through JSON.stringify instead of deepEqual.
*/
function toPlainArray(value) {
    return JSON.parse(JSON.stringify(value));
}

const DEFAULT_CATEGORY_IDS = [
    "housing", "utilities", "groceries", "dining", "transportation",
    "health", "pets", "shopping", "entertainment", "personal-care",
    "travel", "education", "subscriptions", "gifts", "tickets-events",
    "debt", "insurance", "taxes", "fees", "household", "other"
];

const DEFAULT_SUBCATEGORY_TOTAL = 127;

const DEFAULT_HOUSING_SUBCATEGORY_IDS = [
    "rent", "mortgage", "home-repairs", "furniture",
    "home-improvement", "property-fees", "other-housing"
];

test("new data receives the default system category library seeded", () => {
    const harness = freshHarness();
    const data = harness.reload();

    assert.equal(data.settings.categories.version, 1);
    assert.equal(data.settings.categories.list.length, DEFAULT_CATEGORY_IDS.length);
    assert.equal(data.migrations.categoriesV1, true);

    assert.deepEqual(
        toPlainArray(data.settings.categories.list.map(category => category.id).sort()),
        [...DEFAULT_CATEGORY_IDS].sort()
    );

    harness.cleanup();
});

test("default category count, subcategory count, ids, system flags, and enabled flags are stable", () => {
    const harness = freshHarness();
    const data = harness.reload();
    const list = data.settings.categories.list;

    assert.equal(list.length, 21);

    let subcategoryTotal = 0;

    list.forEach(category => {
        assert.equal(category.system, true);
        assert.equal(category.enabled, true);

        category.subcategories.forEach(subcategory => {
            subcategoryTotal += 1;
            assert.equal(subcategory.system, true);
            assert.equal(subcategory.enabled, true);
        });
    });

    assert.equal(subcategoryTotal, DEFAULT_SUBCATEGORY_TOTAL);

    const housing = list.find(category => category.id === "housing");
    assert.deepEqual(
        toPlainArray(housing.subcategories.map(subcategory => subcategory.id).sort()),
        [...DEFAULT_HOUSING_SUBCATEGORY_IDS].sort()
    );

    harness.cleanup();
});

test("no duplicate category ids, category names, or subcategory ids within a category", () => {
    const harness = freshHarness();
    const data = harness.reload();
    const list = data.settings.categories.list;

    const categoryIds = list.map(category => category.id);
    const categoryNames = list.map(category => category.name.toLowerCase());

    assert.equal(new Set(categoryIds).size, categoryIds.length);
    assert.equal(new Set(categoryNames).size, categoryNames.length);

    list.forEach(category => {
        const subcategoryIds = category.subcategories.map(subcategory => subcategory.id);
        assert.equal(new Set(subcategoryIds).size, subcategoryIds.length);
    });

    harness.cleanup();
});

test("default seeding is idempotent across repeated normalization", () => {
    const harness = freshHarness();

    const first = harness.reload();
    const second = harness.reload();
    const third = harness.reload();

    assert.equal(first.settings.categories.list.length, 21);
    assert.equal(second.settings.categories.list.length, 21);
    assert.equal(third.settings.categories.list.length, 21);

    assert.deepEqual(
        toPlainArray(second.settings.categories.list.map(category => category.id).sort()),
        toPlainArray(first.settings.categories.list.map(category => category.id).sort())
    );

    harness.cleanup();
});

test("existing settings survive normalization unchanged and still receive seeded defaults", () => {
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
    assert.equal(data.settings.categories.list.length, 21);

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
    const housing = data.settings.categories.list.find(category => category.id === "housing");

    assert.equal(data.settings.categories.list.length, 21);
    assert.ok(housing);
    assert.ok(housing.subcategories.some(subcategory => subcategory.id === "rent"));

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
    const groceries = data.settings.categories.list.find(category => category.id === "groceries");

    assert.equal(data.settings.categories.list.length, 21);
    assert.ok(groceries);
    assert.ok(groceries.subcategories.some(subcategory => subcategory.id === "food"));
    assert.ok(!groceries.subcategories.some(subcategory => subcategory.name === "Bad"));

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
    const groceries = data.settings.categories.list.find(category => category.id === "groceries");

    assert.equal(data.settings.categories.list.length, 21);
    assert.equal(groceries.name, "Groceries");

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
    assert.equal(expense.categoryId, null);

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
    assert.equal(category.subcategories.length, 0);
    assert.match(category.id, /^category-/);

    harness.cleanup();
});

test("addCustomCategory rejects trimmed, case-insensitive duplicate names", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    storage.addCustomCategory("Hobbies");
    const duplicate = storage.addCustomCategory("  hobbies  ");

    assert.equal(duplicate, null);
    assert.equal(storage.getCategories().length, 22);

    harness.cleanup();
});

test("custom category and custom subcategory survive repeated reseeding", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    const category = storage.addCustomCategory("Hobbies");
    const subcategory = storage.addCustomSubcategory(category.id, "Painting");

    // Force normalization/seeding to run again on top of already-seeded data.
    harness.reload();
    harness.reload();

    const persistedCategory = storage.getCategory(category.id);
    const persistedSubcategory = storage.getSubcategory(category.id, subcategory.id);

    assert.ok(persistedCategory);
    assert.equal(persistedCategory.name, "Hobbies");
    assert.equal(persistedCategory.system, false);
    assert.ok(persistedSubcategory);
    assert.equal(persistedSubcategory.name, "Painting");
    assert.equal(persistedSubcategory.system, false);
    assert.equal(storage.getCategories().length, 22);

    harness.cleanup();
});

test("a disabled system category and a disabled system subcategory stay disabled across reseeding", () => {
    const harness = freshHarness();
    const storage = harness.storage;

    assert.equal(storage.setCategoryEnabled("housing", false), true);
    assert.equal(storage.setSubcategoryEnabled("utilities", "phone", false), true);

    // Force normalization/seeding to run again; defaults must not reset preferences.
    harness.reload();
    harness.reload();

    assert.equal(storage.getCategory("housing").enabled, false);
    assert.equal(storage.getSubcategory("utilities", "phone").enabled, false);
    assert.equal(storage.getCategories().length, 21);

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
    assert.equal(storage.getCategories({ enabledOnly: true }).length, 21);

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

/* =========================================================
   P2.6.2 - LEGACY CATEGORY RESOLUTION
   ========================================================= */

test("resolveCategoryId matches exact, case-insensitive, trimmed category names", () => {
    const harness = freshHarness();
    const storage = harness.storage;
    const list = storage.getCategories();

    assert.equal(storage.resolveCategoryId(list, "Groceries"), "groceries");
    assert.equal(storage.resolveCategoryId(list, "groceries"), "groceries");
    assert.equal(storage.resolveCategoryId(list, "  GROCERIES  "), "groceries");

    harness.cleanup();
});

test("resolveCategoryId leaves unknown strings and typos unresolved (no fuzzy matching)", () => {
    const harness = freshHarness();
    const storage = harness.storage;
    const list = storage.getCategories();

    assert.equal(storage.resolveCategoryId(list, "Grocerries"), null);
    assert.equal(storage.resolveCategoryId(list, "Not A Real Category"), null);
    assert.equal(storage.resolveCategoryId(list, ""), null);

    harness.cleanup();
});

test("resolveSubcategoryId resolves an exact subcategory name within its parent category", () => {
    const harness = freshHarness();
    const storage = harness.storage;
    const list = storage.getCategories();

    assert.equal(storage.resolveSubcategoryId(list, "utilities", "Phone"), "phone");
    assert.equal(storage.resolveSubcategoryId(list, "groceries", " food "), "food");
    assert.equal(storage.resolveSubcategoryId(list, "utilities", "Phone Line"), null);
    assert.equal(storage.resolveSubcategoryId(list, "utilities", "Rent"), null);

    harness.cleanup();
});

test("resolveCategoryIds resolves the safe legacy aliases (Phone, Internet)", () => {
    const harness = freshHarness();
    const storage = harness.storage;
    const list = storage.getCategories();

    const phone = storage.resolveCategoryIds(list, "Phone");
    assert.equal(phone.categoryId, "utilities");
    assert.equal(phone.subcategoryId, "phone");

    const internet = storage.resolveCategoryIds(list, "internet");
    assert.equal(internet.categoryId, "utilities");
    assert.equal(internet.subcategoryId, "internet");

    harness.cleanup();
});

test("ambiguous Manual Transaction classification labels remain unresolved", () => {
    const harness = freshHarness();
    const storage = harness.storage;
    const list = storage.getCategories();

    ["Income", "Bills", "Personal", "Savings", "Transfer"].forEach(label => {
        assert.equal(storage.resolveCategoryId(list, label), null);
    });

    harness.cleanup();
});

function categoriesResolutionFixture() {
    return {
        version: 5,
        income: [],
        expenses: [
            { id: "expense-1", name: "Grocery Run", category: "Groceries", subcategory: "Food", amount: 42, date: "2026-08-04" },
            { id: "expense-2", name: "Typo Expense", category: "Grocerries", amount: 10, date: "2026-08-05" }
        ],
        savingsGoals: [],
        savingsTransfers: [],
        accounts: {
            checking: { name: "Checking", balance: 0 },
            savings: { name: "General Savings", balance: 0 }
        },
        months: {
            "2026-08": {
                monthKey: "2026-08",
                startingBalance: 0,
                endingBalance: 0,
                paychecks: [],
                expenses: [],
                bills: [
                    { id: "bill-1", name: "Phone Bill", category: "Phone", amount: 60, dueDate: "2026-08-05" }
                ],
                transactions: [
                    { id: "txn-1", description: "Cash withdrawal", category: "Groceries", amount: -50, date: "2026-08-02" },
                    { id: "txn-2", description: "Paycheck", category: "Income", amount: 1000, date: "2026-08-01" }
                ]
            },
            "2026-09": {
                monthKey: "2026-09",
                startingBalance: 0,
                endingBalance: 0,
                paychecks: [],
                expenses: [],
                bills: [
                    { id: "bill-2", name: "Rent", category: "Housing", amount: 1600, dueDate: "2026-09-01" }
                ],
                transactions: []
            }
        }
    };
}

function sumFinancialTotals(data) {
    let total = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);

    Object.values(data.months).forEach(month => {
        total += month.bills.reduce((sum, bill) => sum + bill.amount, 0);
        total += month.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    });

    return total;
}

test("a known expense category and subcategory resolve to ids while original strings are preserved", () => {
    const harness = freshHarness({ preloadedData: categoriesResolutionFixture() });

    const data = harness.reload();
    const expense = data.expenses.find(item => item.id === "expense-1");

    assert.equal(expense.category, "Groceries");
    assert.equal(expense.subcategory, "Food");
    assert.equal(expense.categoryId, "groceries");
    assert.equal(expense.subcategoryId, "food");

    harness.cleanup();
});

test("a typo/unknown expense category remains unresolved and no custom category is created for it", () => {
    const harness = freshHarness({ preloadedData: categoriesResolutionFixture() });

    const data = harness.reload();
    const expense = data.expenses.find(item => item.id === "expense-2");

    assert.equal(expense.category, "Grocerries");
    assert.equal(expense.categoryId, null);
    assert.ok(!data.settings.categories.list.some(category => category.name === "Grocerries"));
    assert.equal(data.settings.categories.list.length, 21);

    harness.cleanup();
});

test("a known bill resolves a safe alias category/subcategory id and its strings are preserved", () => {
    const harness = freshHarness({ preloadedData: categoriesResolutionFixture() });

    const data = harness.reload();
    const bill = data.months["2026-08"].bills.find(item => item.id === "bill-1");

    assert.equal(bill.category, "Phone");
    assert.equal(bill.categoryId, "utilities");
    assert.equal(bill.subcategoryId, "phone");

    harness.cleanup();
});

test("a safe Manual Transaction category resolves an id, while ambiguous classifications stay unresolved", () => {
    const harness = freshHarness({ preloadedData: categoriesResolutionFixture() });

    const data = harness.reload();
    const groceryTxn = data.months["2026-08"].transactions.find(item => item.id === "txn-1");
    const incomeTxn = data.months["2026-08"].transactions.find(item => item.id === "txn-2");

    assert.equal(groceryTxn.category, "Groceries");
    assert.equal(groceryTxn.categoryId, "groceries");

    assert.equal(incomeTxn.category, "Income");
    assert.equal(incomeTxn.categoryId, undefined);

    harness.cleanup();
});

test("migration inspects every stored month, not only the selected one", () => {
    const harness = freshHarness({ preloadedData: categoriesResolutionFixture() });

    const data = harness.reload();
    const septemberBill = data.months["2026-09"].bills.find(item => item.id === "bill-2");

    assert.equal(septemberBill.category, "Housing");
    assert.equal(septemberBill.categoryId, "housing");

    harness.cleanup();
});

test("category resolution migration is idempotent and financial totals never change", () => {
    const harness = freshHarness({ preloadedData: categoriesResolutionFixture() });

    const before = harness.reload();
    const totalBefore = sumFinancialTotals(before);

    const after = harness.reload();
    const totalAfter = sumFinancialTotals(after);

    assert.equal(totalAfter, totalBefore);
    assert.equal(after.migrations.categoriesResolutionV1, true);

    const expenseBefore = before.expenses.find(item => item.id === "expense-1");
    const expenseAfter = after.expenses.find(item => item.id === "expense-1");
    assert.equal(expenseAfter.categoryId, expenseBefore.categoryId);
    assert.equal(expenseAfter.subcategoryId, expenseBefore.subcategoryId);

    const billBefore = before.months["2026-08"].bills.find(item => item.id === "bill-1");
    const billAfter = after.months["2026-08"].bills.find(item => item.id === "bill-1");
    assert.equal(billAfter.categoryId, billBefore.categoryId);
    assert.equal(billAfter.subcategoryId, billBefore.subcategoryId);

    assert.equal(after.settings.categories.list.length, 21);

    harness.cleanup();
});

test("an already-resolved categoryId is never overwritten by a later migration pass", () => {
    const harness = freshHarness({
        preloadedData: {
            ...categoriesResolutionFixture(),
            migrations: { categoriesResolutionV1: false },
            expenses: [
                { id: "expense-1", name: "Grocery Run", category: "Groceries", subcategory: "Food", categoryId: "custom-preset", subcategoryId: "custom-preset-sub", amount: 42, date: "2026-08-04" }
            ]
        }
    });

    const data = harness.reload();
    const expense = data.expenses.find(item => item.id === "expense-1");

    assert.equal(expense.categoryId, "custom-preset");
    assert.equal(expense.subcategoryId, "custom-preset-sub");

    harness.cleanup();
});
