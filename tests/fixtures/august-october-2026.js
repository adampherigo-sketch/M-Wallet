"use strict";

/**
 * Frozen source: M-Wallet Three-Month Realistic Usage Trial.
 * Evidence status in the source report: simulated/calculated, not runtime verified.
 */

const fixture = {
    source: "M-Wallet Three-Month Realistic Usage Trial",
    months: ["2026-08", "2026-09", "2026-10"],

    inputs: {
        recurringIncome: [
            {
                id: "income-primary-paycheck",
                date: "2026-08-08",
                name: "Primary Paycheck",
                source: "Employer Payroll",
                category: "Employment",
                merchant: "Employer Payroll",
                amount: 2500,
                recurring: true,
                frequency: "biweekly"
            }
        ],
        generatedPaycheckOccurrences: [
            { date: "2026-08-22", amount: 2500 },
            { date: "2026-09-05", amount: 2500 },
            { date: "2026-09-19", amount: 2500 },
            { date: "2026-10-03", amount: 2500 },
            { date: "2026-10-17", amount: 2500 }
        ],
        recurringBills: [
            { id: "bill-rent", dueDate: "01", name: "Rent", category: "Housing", merchant: "Landlord", amount: 1600 },
            { id: "bill-phone", dueDate: "05", name: "Phone", category: "Phone", merchant: "Mobile Carrier", amount: 80 },
            { id: "bill-internet", dueDate: "07", name: "Internet", category: "Internet", merchant: "FiberNet", amount: 70 },
            { id: "bill-auto-insurance", dueDate: "12", name: "Auto Insurance", category: "Insurance", merchant: "SafeRoad Insurance", amount: 180 },
            { id: "bill-electric", dueDate: "18", name: "Electric", category: "Utilities", merchant: "City Electric", amount: 140 },
            { id: "bill-streaming", dueDate: "25", name: "Streaming Subscription", category: "Subscriptions", merchant: "StreamNow", amount: 25 }
        ],
        expenses: {
            "2026-08": [
                { date: "2026-08-04", name: "Grocery Run 1", category: "Groceries", merchant: "Fresh Market", amount: 145, recurring: false },
                { date: "2026-08-10", name: "Doctor Visit", category: "Health", merchant: "Primary Care Clinic", amount: 120, recurring: false },
                { date: "2026-08-14", name: "Transit", category: "Transportation", merchant: "Metro Transit", amount: 90, recurring: false },
                { date: "2026-08-16", name: "Vet Visit", category: "Pets", merchant: "Paws & Claws Veterinary", amount: 95, recurring: false },
                { date: "2026-08-20", name: "Grocery Run 2", category: "Groceries", merchant: "Fresh Market", amount: 188, recurring: false },
                { date: "2026-08-27", name: "Movie Night", category: "Entertainment", merchant: "Downtown Cinema", amount: 75, recurring: false },
                { date: "2026-08-29", name: "Household Supplies", category: "Household", merchant: "Home Supply Co.", amount: 60, recurring: false }
            ],
            "2026-09": [
                { date: "2026-09-03", name: "Grocery Run 1", category: "Groceries", merchant: "Corner Grocer", amount: 132, recurring: false },
                { date: "2026-09-09", name: "Doctor Visit", category: "Health", merchant: "Medical Clinic", amount: 145, recurring: false },
                { date: "2026-09-13", name: "Transit", category: "Transportation", merchant: "Metro Transit", amount: 120, recurring: false },
                { date: "2026-09-15", name: "Vet Visit", category: "Pets", merchant: "Animal Hospital", amount: 110, recurring: false },
                { date: "2026-09-19", name: "Emergency Auto Repair", category: "Other", merchant: "Emergency Auto Repair Shop", amount: 1200, recurring: false },
                { date: "2026-09-21", name: "Grocery Run 2", category: "Groceries", merchant: "Corner Grocer", amount: 204, recurring: false },
                { date: "2026-09-28", name: "Movie Night", category: "Entertainment", merchant: "Downtown Cinema", amount: 90, recurring: false }
            ],
            "2026-10": [
                { date: "2026-10-05", name: "Grocery Run 1", category: "Groceries", merchant: "Fresh Market", amount: 150, recurring: false },
                { date: "2026-10-08", name: "Doctor Visit", category: "Health", merchant: "Primary Care Clinic", amount: 130, recurring: false },
                { date: "2026-10-12", name: "Transit", category: "Transportation", merchant: "Metro Transit", amount: 100, recurring: false },
                { date: "2026-10-14", name: "Vet Visit", category: "Pets", merchant: "Paws & Claws Veterinary", amount: 125, recurring: false },
                { date: "2026-10-22", name: "Grocery Run 2", category: "Groceries", merchant: "Fresh Market", amount: 176, recurring: false },
                { date: "2026-10-26", name: "Movie Night", category: "Entertainment", merchant: "Downtown Cinema", amount: 110, recurring: false },
                { date: "2026-10-29", name: "Household Supplies", category: "Household", merchant: "Home Supply Co.", amount: 80, recurring: false }
            ]
        },
        oneTimeIncome: [
            { date: "2026-09-11", name: "Freelance Project", category: "Freelance", merchant: "Freelance Client", amount: 650 },
            { date: "2026-10-17", name: "Refund Reimbursement", category: "Refund / Reimbursement", merchant: "Retailer Refund", amount: 275 }
        ],
        savings: {
            deposits: [
                { date: "2026-08-23", amount: 400, from: "Checking", to: "General Savings" },
                { date: "2026-09-24", amount: 450, from: "Checking", to: "General Savings" },
                { date: "2026-10-23", amount: 500, from: "Checking", to: "General Savings" }
            ],
            allocations: [
                { date: "2026-08-24", amount: 150, from: "General Savings", to: "Emergency Fund" },
                { date: "2026-08-26", amount: 100, from: "General Savings", to: "Vacation Fund" },
                { date: "2026-09-25", amount: 200, from: "General Savings", to: "Emergency Fund" },
                { date: "2026-09-26", amount: 100, from: "General Savings", to: "Vacation Fund" },
                { date: "2026-10-24", amount: 150, from: "General Savings", to: "Emergency Fund" },
                { date: "2026-10-25", amount: 125, from: "General Savings", to: "Vacation Fund" }
            ],
            releases: [
                { date: "2026-09-27", amount: 50, from: "Emergency Fund", to: "General Savings" },
                { date: "2026-10-26", amount: 75, from: "Vacation Fund", to: "General Savings" }
            ]
        }
    },

    expected: {
        recurringBillTotal: 2095,
        recurringBillCount: 6,
        emergencyMonth: "2026-09",
        months: {
            "2026-08": { startingBalance: 3200, income: 5000, bills: 2095, expenses: 773, savingsMovement: 400, endingBalance: 4932, generalSavings: 150, emergencyFund: 150, vacationFund: 100, totalSavings: 400 },
            "2026-09": { startingBalance: 4932, income: 5650, bills: 2095, expenses: 2001, savingsMovement: 450, endingBalance: 6036, generalSavings: 350, emergencyFund: 300, vacationFund: 200, totalSavings: 850 },
            "2026-10": { startingBalance: 6036, income: 5275, bills: 2095, expenses: 871, savingsMovement: 500, endingBalance: 7845, generalSavings: 650, emergencyFund: 450, vacationFund: 250, totalSavings: 1350 }
        },
        continuity: [
            { from: "2026-08", endingBalance: 4932, to: "2026-09", startingBalance: 4932 },
            { from: "2026-09", endingBalance: 6036, to: "2026-10", startingBalance: 6036 }
        ],
        ledger: {
            "2026-08": [
                ["2026-08-01", "Starting balance", 3200, 3200], ["2026-08-01", "Rent", -1600, 1600], ["2026-08-04", "Grocery Run 1", -145, 1455], ["2026-08-05", "Phone", -80, 1375], ["2026-08-07", "Internet", -70, 1305], ["2026-08-08", "Paycheck", 2500, 3805], ["2026-08-10", "Doctor", -120, 3685], ["2026-08-12", "Insurance", -180, 3505], ["2026-08-14", "Transportation", -90, 3415], ["2026-08-16", "Vet", -95, 3320], ["2026-08-18", "Electric", -140, 3180], ["2026-08-20", "Grocery Run 2", -188, 2992], ["2026-08-22", "Paycheck", 2500, 5492], ["2026-08-23", "Savings deposit", -400, 5092], ["2026-08-25", "Subscription", -25, 5067], ["2026-08-27", "Entertainment", -75, 4992], ["2026-08-29", "Household", -60, 4932]
            ],
            "2026-09": [
                ["2026-09-01", "Inherited starting balance", 4932, 4932], ["2026-09-01", "Rent", -1600, 3332], ["2026-09-03", "Grocery Run 1", -132, 3200], ["2026-09-05", "Phone", -80, 3120], ["2026-09-05", "Paycheck", 2500, 5620], ["2026-09-07", "Internet", -70, 5550], ["2026-09-09", "Doctor", -145, 5405], ["2026-09-11", "Freelance income", 650, 6055], ["2026-09-12", "Insurance", -180, 5875], ["2026-09-13", "Transportation", -120, 5755], ["2026-09-15", "Vet", -110, 5645], ["2026-09-18", "Electric", -140, 5505], ["2026-09-19", "Paycheck", 2500, 8005], ["2026-09-19", "Emergency repair", -1200, 6805], ["2026-09-21", "Grocery Run 2", -204, 6601], ["2026-09-24", "Savings deposit", -450, 6151], ["2026-09-25", "Subscription", -25, 6126], ["2026-09-28", "Entertainment", -90, 6036]
            ],
            "2026-10": [
                ["2026-10-01", "Inherited starting balance", 6036, 6036], ["2026-10-01", "Rent", -1600, 4436], ["2026-10-03", "Paycheck", 2500, 6936], ["2026-10-05", "Phone", -80, 6856], ["2026-10-05", "Grocery Run 1", -150, 6706], ["2026-10-07", "Internet", -70, 6636], ["2026-10-08", "Doctor", -130, 6506], ["2026-10-12", "Insurance", -180, 6326], ["2026-10-12", "Transportation", -100, 6226], ["2026-10-14", "Vet", -125, 6101], ["2026-10-17", "Paycheck", 2500, 8601], ["2026-10-17", "Reimbursement", 275, 8876], ["2026-10-18", "Electric", -140, 8736], ["2026-10-22", "Grocery Run 2", -176, 8560], ["2026-10-23", "Savings deposit", -500, 8060], ["2026-10-25", "Subscription", -25, 8035], ["2026-10-26", "Entertainment", -110, 7925], ["2026-10-29", "Household", -80, 7845]
            ]
        }
    }
};

module.exports = Object.freeze(fixture);
