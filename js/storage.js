/* =========================================================
   BUDGET TRACKER
   Local Storage / Data Management
   ========================================================= */


/* =========================================================
   1. STORAGE SETTINGS
   ========================================================= */

/*
    Everything for the app will be stored inside ONE
    localStorage object.

    Later, if we move to a database/cloud account system,
    this file can be replaced without rebuilding the UI.
*/

const BudgetStorage = {

    storageKey: "budgetTrackerData",

    version: 1,


    /* =====================================================
       2. CREATE DEFAULT DATA
       ===================================================== */

    createDefaultData() {

        return {

            version: this.version,

            settings: {

                currency: "USD",

                currencySymbol: "$",

                firstDayOfWeek: "sunday"

            },


            /*
                Each month gets its own budget data.

                Example key:

                "2026-08"
                "2026-09"
                "2027-01"
            */

            months: {},


            /*
                Savings goals live outside individual months
                because they can continue for many months.
            */

            savingsGoals: [],


            /*
                General account information.
            */

            accounts: {

                checking: {
                    name: "Checking",
                    balance: 0
                },

                savings: {
                    name: "Savings",
                    balance: 0
                }

            }

        };

    },


    /* =====================================================
       3. CREATE DEFAULT MONTH
       ===================================================== */

    createDefaultMonth(monthKey) {

        return {

            monthKey: monthKey,

            startingBalance: 0,

            endingBalance: 0,


            /* -------------------------------------------
               Income / Paychecks
            ------------------------------------------- */

            paychecks: [],


            /* -------------------------------------------
               Monthly Bills
            ------------------------------------------- */

            bills: [],


            /* -------------------------------------------
               Everyday Expenses
            ------------------------------------------- */

            expenses: [],


            /* -------------------------------------------
               Transfers Into Savings
            ------------------------------------------- */

            savingsTransfers: [],


            /* -------------------------------------------
               Optional Notes
            ------------------------------------------- */

            notes: "",


            createdAt: new Date().toISOString(),

            updatedAt: new Date().toISOString()

        };

    },


    /* =====================================================
       4. LOAD ALL DATA
       ===================================================== */

    load() {

        const savedData = localStorage.getItem(this.storageKey);


        // Nothing has been saved yet.
        if (!savedData) {

            const defaultData = this.createDefaultData();

            this.save(defaultData);

            return defaultData;

        }


        try {

            const parsedData = JSON.parse(savedData);

            return parsedData;

        } catch (error) {

            console.error(
                "Budget Tracker could not load saved data:",
                error
            );


            // If stored data becomes corrupted,
            // return fresh data instead of crashing.
            const defaultData = this.createDefaultData();

            this.save(defaultData);

            return defaultData;

        }

    },


    /* =====================================================
       5. SAVE ALL DATA
       ===================================================== */

    save(data) {

        try {

            localStorage.setItem(
                this.storageKey,
                JSON.stringify(data)
            );

            return true;

        } catch (error) {

            console.error(
                "Budget Tracker could not save data:",
                error
            );

            return false;

        }

    },


    /* =====================================================
       6. GET CURRENT MONTH KEY
       ===================================================== */

    getCurrentMonthKey() {

        const today = new Date();

        const year = today.getFullYear();

        const month = String(
            today.getMonth() + 1
        ).padStart(2, "0");

        return `${year}-${month}`;

    },


    /* =====================================================
       7. CREATE MONTH KEY FROM DATE
       ===================================================== */

    getMonthKeyFromDate(dateValue) {

        const date = new Date(dateValue);

        const year = date.getFullYear();

        const month = String(
            date.getMonth() + 1
        ).padStart(2, "0");

        return `${year}-${month}`;

    },


    /* =====================================================
       8. GET MONTH
       ===================================================== */

    getMonth(monthKey = this.getCurrentMonthKey()) {

        const data = this.load();


        // Create month automatically if it does not exist.
        if (!data.months[monthKey]) {

            data.months[monthKey] =
                this.createDefaultMonth(monthKey);

            this.save(data);

        }

        return data.months[monthKey];

    },


    /* =====================================================
       9. SAVE MONTH
       ===================================================== */

    saveMonth(monthKey, monthData) {

        const data = this.load();

        monthData.updatedAt = new Date().toISOString();

        data.months[monthKey] = monthData;

        this.save(data);

        return monthData;

    },


    /* =====================================================
       10. GENERATE UNIQUE ID
       ===================================================== */

    generateId(prefix = "item") {

        return `${prefix}-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2)}`;

    },


    /* =====================================================
       11. SET STARTING BALANCE
       ===================================================== */

    setStartingBalance(amount, monthKey = this.getCurrentMonthKey()) {

        const month = this.getMonth(monthKey);

        month.startingBalance = Number(amount) || 0;

        this.saveMonth(monthKey, month);

        return month.startingBalance;

    },


    /* =====================================================
       12. ADD PAYCHECK
       ===================================================== */

    addPaycheck(paycheck, monthKey = this.getCurrentMonthKey()) {

        const month = this.getMonth(monthKey);

        const newPaycheck = {

            id: this.generateId("paycheck"),

            name: paycheck.name || "Paycheck",

            payDate: paycheck.payDate || "",

            hours: Number(paycheck.hours) || 0,

            amount: Number(paycheck.amount) || 0,

            notes: paycheck.notes || "",

            createdAt: new Date().toISOString()

        };

        month.paychecks.push(newPaycheck);

        this.saveMonth(monthKey, month);

        return newPaycheck;

    },


    /* =====================================================
       13. UPDATE PAYCHECK
       ===================================================== */

    updatePaycheck(
        paycheckId,
        updates,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const paycheck = month.paychecks.find(
            item => item.id === paycheckId
        );

        if (!paycheck) {
            return null;
        }


        Object.assign(paycheck, updates);


        if (updates.hours !== undefined) {
            paycheck.hours = Number(updates.hours) || 0;
        }

        if (updates.amount !== undefined) {
            paycheck.amount = Number(updates.amount) || 0;
        }


        this.saveMonth(monthKey, month);

        return paycheck;

    },


    /* =====================================================
       14. DELETE PAYCHECK
       ===================================================== */

    deletePaycheck(
        paycheckId,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        month.paychecks = month.paychecks.filter(
            paycheck => paycheck.id !== paycheckId
        );

        this.saveMonth(monthKey, month);

    },


    /* =====================================================
       15. ADD BILL
       ===================================================== */

    addBill(bill, monthKey = this.getCurrentMonthKey()) {

        const month = this.getMonth(monthKey);

        const newBill = {

            id: this.generateId("bill"),

            name: bill.name || "Bill",

            dueDate: bill.dueDate || "",

            amount: Number(bill.amount) || 0,

            category: bill.category || "Bills",

            paid: Boolean(bill.paid),

            paidDate: bill.paidDate || "",

            recurring: Boolean(bill.recurring),

            notes: bill.notes || "",

            createdAt: new Date().toISOString()

        };

        month.bills.push(newBill);

        this.saveMonth(monthKey, month);

        return newBill;

    },


    /* =====================================================
       16. UPDATE BILL
       ===================================================== */

    updateBill(
        billId,
        updates,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const bill = month.bills.find(
            item => item.id === billId
        );

        if (!bill) {
            return null;
        }


        Object.assign(bill, updates);


        if (updates.amount !== undefined) {
            bill.amount = Number(updates.amount) || 0;
        }


        this.saveMonth(monthKey, month);

        return bill;

    },


    /* =====================================================
       17. MARK BILL PAID
       ===================================================== */

    markBillPaid(
        billId,
        paid = true,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const bill = month.bills.find(
            item => item.id === billId
        );

        if (!bill) {
            return null;
        }


        bill.paid = paid;


        if (paid) {

            bill.paidDate =
                new Date().toISOString().split("T")[0];

        } else {

            bill.paidDate = "";

        }


        this.saveMonth(monthKey, month);

        return bill;

    },


    /* =====================================================
       18. DELETE BILL
       ===================================================== */

    deleteBill(
        billId,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        month.bills = month.bills.filter(
            bill => bill.id !== billId
        );

        this.saveMonth(monthKey, month);

    },


    /* =====================================================
       19. ADD EXPENSE
       ===================================================== */

    addExpense(
        expense,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const newExpense = {

            id: this.generateId("expense"),

            name: expense.name || "Expense",

            date: expense.date || "",

            amount: Number(expense.amount) || 0,

            category: expense.category || "Other",

            paymentMethod:
                expense.paymentMethod || "Checking",

            notes: expense.notes || "",

            createdAt: new Date().toISOString()

        };

        month.expenses.push(newExpense);

        this.saveMonth(monthKey, month);

        return newExpense;

    },


    /* =====================================================
       20. UPDATE EXPENSE
       ===================================================== */

    updateExpense(
        expenseId,
        updates,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const expense = month.expenses.find(
            item => item.id === expenseId
        );

        if (!expense) {
            return null;
        }


        Object.assign(expense, updates);


        if (updates.amount !== undefined) {
            expense.amount = Number(updates.amount) || 0;
        }


        this.saveMonth(monthKey, month);

        return expense;

    },


    /* =====================================================
       21. DELETE EXPENSE
       ===================================================== */

    deleteExpense(
        expenseId,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        month.expenses = month.expenses.filter(
            expense => expense.id !== expenseId
        );

        this.saveMonth(monthKey, month);

    },


    /* =====================================================
       22. ADD SAVINGS TRANSFER
       ===================================================== */

    addSavingsTransfer(
        transfer,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const newTransfer = {

            id: this.generateId("savings-transfer"),

            goalId: transfer.goalId || null,

            name: transfer.name || "Savings",

            date: transfer.date || "",

            amount: Number(transfer.amount) || 0,

            notes: transfer.notes || "",

            createdAt: new Date().toISOString()

        };

        month.savingsTransfers.push(newTransfer);

        this.saveMonth(monthKey, month);


        /*
            If the transfer belongs to a savings goal,
            update the goal automatically.
        */

        if (newTransfer.goalId) {

            this.addToSavingsGoal(
                newTransfer.goalId,
                newTransfer.amount
            );

        }


        return newTransfer;

    },


    /* =====================================================
       23. DELETE SAVINGS TRANSFER
       ===================================================== */

    deleteSavingsTransfer(
        transferId,
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        month.savingsTransfers =
            month.savingsTransfers.filter(
                transfer => transfer.id !== transferId
            );

        this.saveMonth(monthKey, month);

    },


    /* =====================================================
       24. GET ALL SAVINGS GOALS
       ===================================================== */

    getSavingsGoals() {

        const data = this.load();

        return data.savingsGoals;

    },


    /* =====================================================
       25. ADD SAVINGS GOAL
       ===================================================== */

    addSavingsGoal(goal) {

        const data = this.load();

        const newGoal = {

            id: this.generateId("goal"),

            name: goal.name || "Savings Goal",

            targetAmount:
                Number(goal.targetAmount) || 0,

            currentAmount:
                Number(goal.currentAmount) || 0,

            targetDate:
                goal.targetDate || "",

            notes:
                goal.notes || "",

            completed: false,

            createdAt:
                new Date().toISOString()

        };


        data.savingsGoals.push(newGoal);

        this.save(data);

        return newGoal;

    },


    /* =====================================================
       26. UPDATE SAVINGS GOAL
       ===================================================== */

    updateSavingsGoal(goalId, updates) {

        const data = this.load();

        const goal = data.savingsGoals.find(
            item => item.id === goalId
        );

        if (!goal) {
            return null;
        }


        Object.assign(goal, updates);


        if (updates.targetAmount !== undefined) {

            goal.targetAmount =
                Number(updates.targetAmount) || 0;

        }


        if (updates.currentAmount !== undefined) {

            goal.currentAmount =
                Number(updates.currentAmount) || 0;

        }


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >= goal.targetAmount;


        this.save(data);

        return goal;

    },


    /* =====================================================
       27. ADD MONEY TO SAVINGS GOAL
       ===================================================== */

    addToSavingsGoal(goalId, amount) {

        const data = this.load();

        const goal = data.savingsGoals.find(
            item => item.id === goalId
        );

        if (!goal) {
            return null;
        }


        goal.currentAmount += Number(amount) || 0;


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >= goal.targetAmount;


        this.save(data);

        return goal;

    },


    /* =====================================================
       28. DELETE SAVINGS GOAL
       ===================================================== */

    deleteSavingsGoal(goalId) {

        const data = this.load();

        data.savingsGoals =
            data.savingsGoals.filter(
                goal => goal.id !== goalId
            );

        this.save(data);

    },


    /* =====================================================
       29. CALCULATE TOTAL INCOME
       ===================================================== */

    getTotalIncome(monthKey = this.getCurrentMonthKey()) {

        const month = this.getMonth(monthKey);

        return month.paychecks.reduce(
            (total, paycheck) =>
                total + Number(paycheck.amount),

            0
        );

    },


    /* =====================================================
       30. CALCULATE TOTAL BILLS
       ===================================================== */

    getTotalBills(monthKey = this.getCurrentMonthKey()) {

        const month = this.getMonth(monthKey);

        return month.bills.reduce(
            (total, bill) =>
                total + Number(bill.amount),

            0
        );

    },


    /* =====================================================
       31. CALCULATE TOTAL EXPENSES
       ===================================================== */

    getTotalExpenses(monthKey = this.getCurrentMonthKey()) {

        const month = this.getMonth(monthKey);

        return month.expenses.reduce(
            (total, expense) =>
                total + Number(expense.amount),

            0
        );

    },


    /* =====================================================
       32. CALCULATE TOTAL SAVINGS
       ===================================================== */

    getTotalSavingsTransfers(
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        return month.savingsTransfers.reduce(
            (total, transfer) =>
                total + Number(transfer.amount),

            0
        );

    },


    /* =====================================================
       33. CALCULATE ENDING BALANCE
       ===================================================== */

    calculateEndingBalance(
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const income =
            this.getTotalIncome(monthKey);

        const bills =
            this.getTotalBills(monthKey);

        const expenses =
            this.getTotalExpenses(monthKey);

        const savings =
            this.getTotalSavingsTransfers(monthKey);


        const endingBalance =

            Number(month.startingBalance)

            + income

            - bills

            - expenses

            - savings;


        month.endingBalance = endingBalance;

        this.saveMonth(monthKey, month);

        return endingBalance;

    },


    /* =====================================================
       34. GET MONTHLY SUMMARY
       ===================================================== */

    getMonthlySummary(
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const income =
            this.getTotalIncome(monthKey);

        const bills =
            this.getTotalBills(monthKey);

        const expenses =
            this.getTotalExpenses(monthKey);

        const savings =
            this.getTotalSavingsTransfers(monthKey);

        const endingBalance =
            Number(month.startingBalance)
            + income
            - bills
            - expenses
            - savings;


        return {

            monthKey,

            startingBalance:
                Number(month.startingBalance),

            income,

            bills,

            expenses,

            savings,

            endingBalance,

            remaining:
                income
                - bills
                - expenses
                - savings

        };

    },


    /* =====================================================
       35. GET TRANSACTIONS
       ===================================================== */

    getTransactions(
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        const transactions = [];


        /* Paychecks */

        month.paychecks.forEach(paycheck => {

            transactions.push({

                id: paycheck.id,

                type: "income",

                name: paycheck.name,

                date: paycheck.payDate,

                amount: Number(paycheck.amount),

                category: "Income"

            });

        });


        /* Bills */

        month.bills.forEach(bill => {

            transactions.push({

                id: bill.id,

                type: "bill",

                name: bill.name,

                date: bill.dueDate,

                amount: -Math.abs(
                    Number(bill.amount)
                ),

                category: bill.category,

                paid: bill.paid

            });

        });


        /* Expenses */

        month.expenses.forEach(expense => {

            transactions.push({

                id: expense.id,

                type: "expense",

                name: expense.name,

                date: expense.date,

                amount: -Math.abs(
                    Number(expense.amount)
                ),

                category: expense.category

            });

        });


        /* Savings */

        month.savingsTransfers.forEach(transfer => {

            transactions.push({

                id: transfer.id,

                type: "savings",

                name: transfer.name,

                date: transfer.date,

                amount: -Math.abs(
                    Number(transfer.amount)
                ),

                category: "Savings"

            });

        });


        /*
            Sort newest transaction first.
        */

        transactions.sort((a, b) => {

            return new Date(b.date) - new Date(a.date);

        });


        return transactions;

    },


    /* =====================================================
       36. GET RUNNING BALANCE
       ===================================================== */

    getRunningBalance(
        monthKey = this.getCurrentMonthKey()
    ) {

        const month = this.getMonth(monthKey);

        let balance =
            Number(month.startingBalance);

        const transactions =
            this.getTransactions(monthKey);


        /*
            Running balances need to be processed
            oldest → newest.
        */

        transactions.sort((a, b) => {

            return new Date(a.date) - new Date(b.date);

        });


        return transactions.map(transaction => {

            const balanceBefore = balance;

            balance += Number(transaction.amount);


            return {

                ...transaction,

                balanceBefore,

                balanceAfter: balance

            };

        });

    },


    /* =====================================================
       37. MONTH ROLLOVER
       ===================================================== */

    rolloverMonth(
        previousMonthKey,
        newMonthKey
    ) {

        const previousMonth =
            this.getMonth(previousMonthKey);

        const previousEndingBalance =
            this.calculateEndingBalance(
                previousMonthKey
            );


        const data = this.load();


        /*
            Do not overwrite a month that already exists.
        */

        if (data.months[newMonthKey]) {

            return data.months[newMonthKey];

        }


        const newMonth =
            this.createDefaultMonth(newMonthKey);


        newMonth.startingBalance =
            previousEndingBalance;


        /*
            Copy recurring bills into new month.
        */

        newMonth.bills =
            previousMonth.bills

                .filter(bill => bill.recurring)

                .map(bill => ({

                    ...bill,

                    id: this.generateId("bill"),

                    paid: false,

                    paidDate: "",

                    createdAt:
                        new Date().toISOString()

                }));


        data.months[newMonthKey] = newMonth;

        this.save(data);

        return newMonth;

    },


    /* =====================================================
       38. EXPORT DATA
       ===================================================== */

    exportData() {

        const data = this.load();

        return JSON.stringify(
            data,
            null,
            2
        );

    },


    /* =====================================================
       39. IMPORT DATA
       ===================================================== */

    importData(jsonData) {

        try {

            const parsedData =
                typeof jsonData === "string"
                    ? JSON.parse(jsonData)
                    : jsonData;


            if (!parsedData.months) {

                throw new Error(
                    "Invalid Budget Tracker data."
                );

            }


            this.save(parsedData);

            return true;

        } catch (error) {

            console.error(
                "Unable to import Budget Tracker data:",
                error
            );

            return false;

        }

    },


    /* =====================================================
       40. CLEAR ALL DATA
       ===================================================== */

    clearAllData() {

        localStorage.removeItem(
            this.storageKey
        );

        const defaultData =
            this.createDefaultData();

        this.save(defaultData);

        return defaultData;

    }

};


/* =========================================================
   41. INITIALIZE STORAGE
   ========================================================= */

/*
    This makes sure storage exists as soon as
    the app loads.
*/

BudgetStorage.load();


/* =========================================================
   42. DEVELOPMENT HELPER
   ========================================================= */

/*
    Because BudgetStorage is global, you can open the
    browser console and type:

        BudgetStorage.load()

    or:

        BudgetStorage.getMonthlySummary()

    to see your stored information.
*/

console.log(
    "Budget Tracker storage loaded."
);