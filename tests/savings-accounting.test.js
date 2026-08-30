"use strict";

/*
 * ZG5 — Savings accounting invariants.
 *
 * These lock in the money-conservation rules the Savings redesign
 * depends on (and must never quietly change): allocation/release
 * move money *within* Savings without altering the total, and
 * Checking<->Savings transfers conserve money across the two
 * accounts. Exercises js/storage.js unchanged via the harness.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const { StorageHarness } = require("./helpers/storage-harness.js");

function freshStorage() {
    const storage = new StorageHarness().storage;
    storage.setStartingBalance(5000, "2026-08"); // give Checking headroom
    return storage;
}


test("allocating to a goal moves money within Savings and leaves the total unchanged", () => {
    const storage = freshStorage();

    storage.depositToSavings(1000, { date: "2026-08-05", monthKey: "2026-08" });
    const goal = storage.addSavingsGoal({ name: "Emergency Fund", targetAmount: 2000 }, "2026-08");

    assert.equal(storage.getSavingsBalance(), 1000);
    assert.equal(storage.getAllocatedSavingsTotal(), 0);
    assert.equal(storage.getTotalSavingsBalance(), 1000);

    storage.allocateSavingsToGoal(goal.id, 400, { date: "2026-08-06" });

    assert.equal(storage.getTotalSavingsBalance(), 1000, "total savings unchanged");
    assert.equal(storage.getSavingsBalance(), 600, "available decreases by the allocation");
    assert.equal(storage.getAllocatedSavingsTotal(), 400, "goal balance increases by the allocation");
});


test("releasing from a goal returns money to available and leaves the total unchanged", () => {
    const storage = freshStorage();

    storage.depositToSavings(1000, { date: "2026-08-05", monthKey: "2026-08" });
    const goal = storage.addSavingsGoal({ name: "Vacation", targetAmount: 2500 }, "2026-08");

    storage.allocateSavingsToGoal(goal.id, 300, { date: "2026-08-06" });
    storage.releaseSavingsFromGoal(goal.id, 100, { date: "2026-08-07" });

    assert.equal(storage.getTotalSavingsBalance(), 1000);
    assert.equal(storage.getSavingsBalance(), 800);
    assert.equal(storage.getAllocatedSavingsTotal(), 200);
});


test("allocation cannot exceed available savings", () => {
    const storage = freshStorage();

    storage.depositToSavings(300, { date: "2026-08-05", monthKey: "2026-08" });
    const goal = storage.addSavingsGoal({ name: "Too Big", targetAmount: 5000 }, "2026-08");

    assert.throws(
        () => storage.allocateSavingsToGoal(goal.id, 400, { date: "2026-08-06" }),
        /General Savings/
    );

    assert.equal(storage.getSavingsBalance(), 300, "nothing moved on the rejected allocation");
    assert.equal(storage.getAllocatedSavingsTotal(), 0);
});


test("Checking <-> Savings transfers conserve money across both accounts", () => {
    const storage = freshStorage();

    const checkingStart = storage.getCheckingAccountBalance();

    storage.depositToSavings(250, { date: "2026-08-10", monthKey: "2026-08" });
    assert.equal(storage.getSavingsBalance(), 250, "savings + 250");
    assert.equal(storage.getCheckingAccountBalance(), checkingStart - 250, "checking - 250");

    storage.withdrawFromSavings(100, { date: "2026-08-12", monthKey: "2026-08" });
    assert.equal(storage.getSavingsBalance(), 150, "savings - 100");
    assert.equal(storage.getCheckingAccountBalance(), checkingStart - 150, "checking + 100 back");
});


test("deleting a goal returns its allocated money to available savings (total unchanged)", () => {
    const storage = freshStorage();

    storage.depositToSavings(1000, { date: "2026-08-05", monthKey: "2026-08" });
    const goal = storage.addSavingsGoal({ name: "TempGoal", targetAmount: 500 }, "2026-08");
    storage.allocateSavingsToGoal(goal.id, 400, { date: "2026-08-06" });

    assert.equal(storage.getSavingsBalance(), 600);

    const deleted = storage.deleteSavingsGoal(goal.id);
    assert.ok(deleted);

    assert.equal(storage.getTotalSavingsBalance(), 1000, "total savings unchanged by deletion");
    assert.equal(storage.getSavingsBalance(), 1000, "allocated money returns to available");
    assert.equal(storage.getAllocatedSavingsTotal(), 0);
    assert.equal(storage.getSavingsGoals().length, 0);
});


test("an overfunded goal reports a real percentage over 100 without NaN/Infinity", () => {
    const storage = freshStorage();

    storage.depositToSavings(1000, { date: "2026-08-05", monthKey: "2026-08" });
    const goal = storage.addSavingsGoal({ name: "Small", targetAmount: 200 }, "2026-08");
    storage.allocateSavingsToGoal(goal.id, 250, { date: "2026-08-06" });

    const stored = storage.getSavingsGoalById(goal.id);
    const percent =
        (Number(stored.currentAmount) / Number(stored.targetAmount)) * 100;

    assert.ok(Number.isFinite(percent));
    assert.ok(percent > 100);
});
