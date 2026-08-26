"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const fixture = require("./fixtures/august-october-2026.js");
const {
    StorageHarness,
    productionStoragePath,
    storageKey
} = require("./helpers/storage-harness.js");

function sum(records) {
    return records.reduce((total, record) => total + record.amount, 0);
}

function recordsForMonth(monthKey) {
    return fixture.inputs.expenses[monthKey] || [];
}

test("fixture contains the frozen three-month contract", () => {
    assert.deepEqual(fixture.months, ["2026-08", "2026-09", "2026-10"]);
    assert.equal(fixture.inputs.recurringIncome[0].amount, 2500);
    assert.equal(fixture.inputs.recurringBills.length, 6);
    assert.equal(fixture.expected.recurringBillTotal, 2095);
    assert.equal(fixture.expected.emergencyMonth, "2026-09");
});

test("fixture expected totals are internally consistent", () => {
    assert.equal(sum(fixture.inputs.recurringBills), fixture.expected.recurringBillTotal);

    const incomeByMonth = {
        "2026-08": 2500 + 2500,
        "2026-09": 2500 + 2500 + 650,
        "2026-10": 2500 + 2500 + 275
    };

    for (const monthKey of fixture.months) {
        const expected = fixture.expected.months[monthKey];
        const expenseTotal = sum(recordsForMonth(monthKey));

        assert.equal(expenseTotal, expected.expenses);
        assert.equal(incomeByMonth[monthKey], expected.income);
        assert.equal(
            expected.startingBalance + expected.income - expected.bills - expected.expenses - expected.savingsMovement,
            expected.endingBalance
        );
    }

    for (const continuity of fixture.expected.continuity) {
        assert.equal(continuity.endingBalance, continuity.startingBalance);
        assert.equal(
            fixture.expected.months[continuity.from].endingBalance,
            continuity.endingBalance
        );
        assert.equal(
            fixture.expected.months[continuity.to].startingBalance,
            continuity.startingBalance
        );
    }
});

test("fixture savings balances reconcile without production execution", () => {
    let generalSavings = 0;
    let emergencyFund = 0;
    let vacationFund = 0;

    for (const monthKey of fixture.months) {
        const deposits = fixture.inputs.savings.deposits.filter(record => record.date.startsWith(monthKey));
        const allocations = fixture.inputs.savings.allocations.filter(record => record.date.startsWith(monthKey));
        const releases = fixture.inputs.savings.releases.filter(record => record.date.startsWith(monthKey));

        generalSavings += sum(deposits) - sum(allocations.filter(record => record.to === "Emergency Fund")) - sum(allocations.filter(record => record.to === "Vacation Fund"));
        generalSavings += sum(releases);
        emergencyFund += sum(allocations.filter(record => record.to === "Emergency Fund"));
        vacationFund += sum(allocations.filter(record => record.to === "Vacation Fund"));
        emergencyFund -= sum(releases.filter(record => record.from === "Emergency Fund"));
        vacationFund -= sum(releases.filter(record => record.from === "Vacation Fund"));

        const expected = fixture.expected.months[monthKey];
        assert.equal(generalSavings, expected.generalSavings);
        assert.equal(emergencyFund, expected.emergencyFund);
        assert.equal(vacationFund, expected.vacationFund);
        assert.equal(generalSavings + emergencyFund + vacationFund, expected.totalSavings);
    }
});

test("VM loads unchanged production storage and exposes BudgetStorage", () => {
    const harness = new StorageHarness();

    try {
        assert.match(productionStoragePath, /[\\/]js[\\/]storage\.js$/);
        assert.equal(typeof harness.storage.load, "function");
        assert.equal(harness.context.window.BudgetStorage, harness.storage);
        assert.equal(harness.context.window.MWalletStorage, harness.storage);
    } finally {
        harness.cleanup();
    }
});

test("harness instances have isolated string-compatible localStorage", () => {
    const first = new StorageHarness();
    const second = new StorageHarness();

    try {
        first.localStorage.setItem("number", 42);
        assert.equal(first.localStorage.getItem("number"), "42");
        assert.equal(second.localStorage.getItem("number"), null);
        assert.equal(first.localStorage.length, 2);
        assert.notEqual(first.localStorage.getItem(storageKey), null);
    } finally {
        first.cleanup();
        second.cleanup();
    }
});

test("save and reload preserve raw state", () => {
    const harness = new StorageHarness();
    const data = { version: 5, marker: "foundation", months: {} };

    try {
        assert.equal(harness.save(data), true);
        assert.equal(harness.rawData.marker, "foundation");
        assert.equal(harness.reload().marker, "foundation");
        assert.equal(harness.rawStorage[storageKey] !== undefined, true);
    } finally {
        harness.cleanup();
    }
});

test("IDs and timestamps are deterministic", () => {
    const harness = new StorageHarness({ timestamp: "2026-08-14T12:34:56.000Z" });

    try {
        assert.equal(harness.storage.now(), "2026-08-14T12:34:56.000Z");
        assert.equal(harness.storage.generateId("expense"), "expense-test-0001");
        assert.equal(harness.storage.generateId("expense"), "expense-test-0002");
    } finally {
        harness.cleanup();
    }
});

test("failWrites simulates storage write failure", () => {
    const harness = new StorageHarness({ failWrites: true });

    try {
        assert.equal(harness.save({ marker: "blocked" }), false);
        assert.equal(harness.rawStorage[storageKey], undefined);
    } finally {
        harness.cleanup();
    }
});

test("preloaded corrupt storage is inspectable and not overwritten", () => {
    const corruptValue = "{not valid json";
    const harness = new StorageHarness({
        preloadedStorage: { [storageKey]: corruptValue }
    });

    try {
        assert.equal(harness.rawStorage[storageKey], corruptValue);
        assert.equal(harness.storage.load().recoveryMode, true);
        assert.equal(harness.rawStorage[storageKey], corruptValue);
    } finally {
        harness.cleanup();
    }
});

test("host localStorage is not accessed", () => {
    const previous = global.localStorage;
    const sentinel = {
        getItem() {
            throw new Error("host localStorage accessed");
        }
    };

    global.localStorage = sentinel;

    try {
        const harness = new StorageHarness();
        assert.notEqual(harness.localStorage, sentinel);
        harness.cleanup();
        assert.equal(global.localStorage, sentinel);
    } finally {
        global.localStorage = previous;
    }
});
