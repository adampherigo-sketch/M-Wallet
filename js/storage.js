/* =========================================================
   BUDGET TRACKER
   Local Storage / Data Management
   storage.js
   ========================================================= */


/* =========================================================
   1. STORAGE OBJECT
   ========================================================= */

const BudgetStorage = {

    storageKey: "budgetTrackerData",

    version: 2,


    /* =====================================================
       2. CREATE DEFAULT APP DATA
       ===================================================== */

    createDefaultData() {

        return {

            version: this.version,


            /* ---------------------------------------------
               APP SETTINGS
               --------------------------------------------- */

            settings: {

                currency: "USD",

                currencySymbol: "$",

                firstDayOfWeek: "sunday"

            },


            /* ---------------------------------------------
               MONTHLY BUDGETS

               Example:

               months: {
                   "2026-08": {...},
                   "2026-09": {...}
               }
               --------------------------------------------- */

            months: {},


            /* ---------------------------------------------
               SAVINGS GOALS

               Savings goals are global instead of being
               locked inside one month.

               Example:
               Emergency Fund created in August will still
               exist when viewing September.

               Each goal does remember which month it was
               originally created in.
               --------------------------------------------- */

            savingsGoals: [],


            /* ---------------------------------------------
               ACCOUNTS
               --------------------------------------------- */

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

            monthKey,


            /* ---------------------------------------------
               START / END BALANCE
               --------------------------------------------- */

            startingBalance: 0,

            endingBalance: 0,


            /* ---------------------------------------------
               PAYCHECKS
               --------------------------------------------- */

            paychecks: [],


            /* ---------------------------------------------
               BILLS
               --------------------------------------------- */

            bills: [],


            /* ---------------------------------------------
               EXPENSES
               --------------------------------------------- */

            expenses: [],


            /* ---------------------------------------------
               MANUAL TRANSACTIONS
               --------------------------------------------- */

            transactions: [],


            /* ---------------------------------------------
               SAVINGS DEPOSITS FOR THIS MONTH
               --------------------------------------------- */

            savingsDeposits: [],


            /*
                Compatibility with our original storage
                structure.

                Earlier versions called these
                savingsTransfers.

                normalizeMonth() keeps this synced with
                savingsDeposits so older app.js code does
                not immediately break.
            */

            savingsTransfers: [],


            /* ---------------------------------------------
               MONTH NOTES
               --------------------------------------------- */

            notes: "",


            createdAt:
                new Date().toISOString(),

            updatedAt:
                new Date().toISOString()

        };

    },


    /* =====================================================
       4. NORMALIZE / MIGRATE MONTH
       ===================================================== */

    normalizeMonth(month, monthKey) {

        if (!month) {

            return this.createDefaultMonth(
                monthKey
            );

        }


        month.monthKey =
            month.monthKey || monthKey;


        month.startingBalance =
            Number(month.startingBalance) || 0;


        month.endingBalance =
            Number(month.endingBalance) || 0;


        if (!Array.isArray(month.paychecks)) {
            month.paychecks = [];
        }


        if (!Array.isArray(month.bills)) {
            month.bills = [];
        }


        if (!Array.isArray(month.expenses)) {
            month.expenses = [];
        }


        if (!Array.isArray(month.transactions)) {
            month.transactions = [];
        }


        /*
            VERSION 1 → VERSION 2 MIGRATION

            Old storage used:
                savingsTransfers

            New storage uses:
                savingsDeposits
        */

        if (!Array.isArray(month.savingsDeposits)) {

            if (Array.isArray(month.savingsTransfers)) {

                month.savingsDeposits =
                    [...month.savingsTransfers];

            }

            else {

                month.savingsDeposits = [];

            }

        }


        /*
            Keep old name available temporarily for
            compatibility with earlier app.js code.
        */

        month.savingsTransfers =
            month.savingsDeposits;


        if (typeof month.notes !== "string") {
            month.notes = "";
        }


        month.createdAt =
            month.createdAt ||
            new Date().toISOString();


        month.updatedAt =
            month.updatedAt ||
            new Date().toISOString();


        return month;

    },


    /* =====================================================
       5. NORMALIZE / MIGRATE ALL DATA
       ===================================================== */

    normalizeData(data) {

        if (
            !data ||
            typeof data !== "object"
        ) {

            return this.createDefaultData();

        }


        if (!data.settings) {

            data.settings =
                this.createDefaultData().settings;

        }


        if (!data.months) {
            data.months = {};
        }


        if (!Array.isArray(data.savingsGoals)) {
            data.savingsGoals = [];
        }


        if (!data.accounts) {

            data.accounts =
                this.createDefaultData().accounts;

        }


        Object.keys(
            data.months
        ).forEach(monthKey => {

            data.months[monthKey] =
                this.normalizeMonth(
                    data.months[monthKey],
                    monthKey
                );

        });


        data.version =
            this.version;


        return data;

    },


    /* =====================================================
       6. LOAD ALL DATA
       ===================================================== */

    load() {

        const savedData =
            localStorage.getItem(
                this.storageKey
            );


        /*
            First launch.
        */

        if (!savedData) {

            const defaultData =
                this.createDefaultData();


            this.save(defaultData);


            return defaultData;

        }


        try {

            const parsedData =
                JSON.parse(savedData);


            const normalizedData =
                this.normalizeData(
                    parsedData
                );


            /*
                Save migrated structure automatically.
            */

            this.save(
                normalizedData
            );


            return normalizedData;

        }

        catch (error) {

            console.error(
                "Budget Tracker could not load saved data:",
                error
            );


            const defaultData =
                this.createDefaultData();


            this.save(
                defaultData
            );


            return defaultData;

        }

    },


    /* =====================================================
       7. SAVE ALL DATA
       ===================================================== */

    save(data) {

        try {

            localStorage.setItem(
                this.storageKey,
                JSON.stringify(data)
            );


            return true;

        }

        catch (error) {

            console.error(
                "Budget Tracker could not save data:",
                error
            );


            return false;

        }

    },


    /* =====================================================
       8. CURRENT REAL-WORLD MONTH KEY
       ===================================================== */

    getCurrentMonthKey() {

        const today =
            new Date();


        const year =
            today.getFullYear();


        const month =
            String(
                today.getMonth() + 1
            ).padStart(2, "0");


        return `${year}-${month}`;

    },


    /* =====================================================
       9. GET MONTH SELECTED IN APP
       ===================================================== */

    /*
        THIS IS IMPORTANT.

        Instead of assuming the user is always looking at
        the current real-world month, storage.js checks:

            #month-select
            #year-select

        This means if the user changes:

            August 2026
                ↓
            September 2026

        all storage functions automatically begin reading
        and writing September's budget.
    */

    getSelectedMonthKey() {

        const monthSelect =
            document.getElementById(
                "month-select"
            );


        const yearSelect =
            document.getElementById(
                "year-select"
            );


        const selectedMonth =
            monthSelect?.value;


        const selectedYear =
            yearSelect?.value;


        if (
            selectedMonth &&
            selectedYear
        ) {

            return (
                `${selectedYear}-` +
                `${selectedMonth}`
            );

        }


        return this.getCurrentMonthKey();

    },


    /* =====================================================
       10. CREATE MONTH KEY FROM DATE
       ===================================================== */

    getMonthKeyFromDate(dateValue) {

        /*
            YYYY-MM-DD can safely be read directly without
            timezone conversion.
        */

        if (
            typeof dateValue === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
        ) {

            return dateValue.slice(
                0,
                7
            );

        }


        const date =
            new Date(dateValue);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return this.getSelectedMonthKey();

        }


        const year =
            date.getFullYear();


        const month =
            String(
                date.getMonth() + 1
            ).padStart(2, "0");


        return `${year}-${month}`;

    },


    /* =====================================================
       11. DEFAULT DATE FOR MONTH
       ===================================================== */

    getDefaultDateForMonth(
        monthKey = this.getSelectedMonthKey()
    ) {

        const [
            year,
            month
        ] = monthKey.split("-");


        return `${year}-${month}-01`;

    },


    /* =====================================================
       12. GET MONTH
       ===================================================== */

    getMonth(
        monthKey = this.getSelectedMonthKey()
    ) {

        const data =
            this.load();


        if (!data.months[monthKey]) {

            data.months[monthKey] =
                this.createDefaultMonth(
                    monthKey
                );


            this.save(data);

        }


        data.months[monthKey] =
            this.normalizeMonth(
                data.months[monthKey],
                monthKey
            );


        return data.months[
            monthKey
        ];

    },


    /* =====================================================
       13. GET SELECTED MONTH
       ===================================================== */

    getSelectedMonth() {

        return this.getMonth(
            this.getSelectedMonthKey()
        );

    },


    /* =====================================================
       14. SAVE MONTH
       ===================================================== */

    saveMonth(
        monthKey,
        monthData
    ) {

        const data =
            this.load();


        monthData =
            this.normalizeMonth(
                monthData,
                monthKey
            );


        monthData.updatedAt =
            new Date().toISOString();


        data.months[monthKey] =
            monthData;


        this.save(data);


        return monthData;

    },


    /* =====================================================
       15. GENERATE UNIQUE ID
       ===================================================== */

    generateId(prefix = "item") {

        if (
            window.crypto &&
            typeof window.crypto.randomUUID ===
                "function"
        ) {

            return (
                `${prefix}-` +
                crypto.randomUUID()
            );

        }


        return (
            `${prefix}-` +
            `${Date.now()}-` +
            `${Math.random()
                .toString(16)
                .slice(2)}`
        );

    },


    /* =====================================================
       16. GET ID FROM MONEY.JS RECORD
       ===================================================== */

    getRecordId(
        item,
        prefix
    ) {

        return (
            item?.id ||
            this.generateId(prefix)
        );

    },


    /* =====================================================
       17. STARTING BALANCE
       ===================================================== */

    setStartingBalance(
        amount,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        month.startingBalance =
            Number(amount) || 0;


        this.saveMonth(
            monthKey,
            month
        );


        return month.startingBalance;

    },


    getStartingBalance(
        monthKey = this.getSelectedMonthKey()
    ) {

        return Number(
            this.getMonth(
                monthKey
            ).startingBalance
        ) || 0;

    },


    /* =====================================================
       18. PAYCHECKS
       ===================================================== */

    addPaycheck(
        paycheck,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const newPaycheck = {

            id:
                this.getRecordId(
                    paycheck,
                    "paycheck"
                ),

            name:
                paycheck.name ||
                "Paycheck",

            payDate:
                paycheck.payDate ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            hours:
                Number(
                    paycheck.hours
                ) || 0,

            amount:
                Number(
                    paycheck.amount
                ) || 0,

            notes:
                paycheck.notes || "",

            createdAt:
                paycheck.createdAt ||
                new Date().toISOString()

        };


        month.paychecks.push(
            newPaycheck
        );


        this.saveMonth(
            monthKey,
            month
        );


        return newPaycheck;

    },


    getPaychecks(
        monthKey = this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).paychecks
        ];

    },


    updatePaycheck(
        paycheckId,
        updates,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const paycheck =
            month.paychecks.find(
                item =>
                    item.id ===
                    paycheckId
            );


        if (!paycheck) {
            return null;
        }


        Object.assign(
            paycheck,
            updates
        );


        if (
            updates.hours !== undefined
        ) {

            paycheck.hours =
                Number(
                    updates.hours
                ) || 0;

        }


        if (
            updates.amount !== undefined
        ) {

            paycheck.amount =
                Number(
                    updates.amount
                ) || 0;

        }


        this.saveMonth(
            monthKey,
            month
        );


        return paycheck;

    },


    deletePaycheck(
        paycheckId,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        month.paychecks =
            month.paychecks.filter(
                paycheck =>
                    paycheck.id !==
                    paycheckId
            );


        this.saveMonth(
            monthKey,
            month
        );


        return true;

    },


    /* =====================================================
       19. BILLS
       ===================================================== */

    addBill(
        bill,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const newBill = {

            id:
                this.getRecordId(
                    bill,
                    "bill"
                ),

            name:
                bill.name ||
                "Bill",

            dueDate:
                bill.dueDate ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            amount:
                Number(
                    bill.amount
                ) || 0,

            category:
                bill.category ||
                "Other",

            paid:
                Boolean(
                    bill.paid
                ),

            paidDate:
                bill.paidDate || "",

            recurring:
                Boolean(
                    bill.recurring
                ),

            notes:
                bill.notes || "",

            createdAt:
                bill.createdAt ||
                new Date().toISOString()

        };


        month.bills.push(
            newBill
        );


        this.saveMonth(
            monthKey,
            month
        );


        return newBill;

    },


    getBills(
        monthKey = this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).bills
        ];

    },


    updateBill(
        billId,
        updates,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const bill =
            month.bills.find(
                item =>
                    item.id === billId
            );


        if (!bill) {
            return null;
        }


        Object.assign(
            bill,
            updates
        );


        if (
            updates.amount !== undefined
        ) {

            bill.amount =
                Number(
                    updates.amount
                ) || 0;

        }


        if (
            updates.recurring !== undefined
        ) {

            bill.recurring =
                Boolean(
                    updates.recurring
                );

        }


        this.saveMonth(
            monthKey,
            month
        );


        return bill;

    },


    markBillPaid(
        billId,
        paid = true,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const bill =
            month.bills.find(
                item =>
                    item.id === billId
            );


        if (!bill) {
            return null;
        }


        bill.paid =
            Boolean(paid);


        bill.paidDate =
            paid
                ? new Date()
                    .toISOString()
                    .split("T")[0]
                : "";


        this.saveMonth(
            monthKey,
            month
        );


        return bill;

    },


    deleteBill(
        billId,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        month.bills =
            month.bills.filter(
                bill =>
                    bill.id !==
                    billId
            );


        this.saveMonth(
            monthKey,
            month
        );


        return true;

    },


    /* =====================================================
       20. EXPENSES
       ===================================================== */

    addExpense(
        expense,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const newExpense = {

            id:
                this.getRecordId(
                    expense,
                    "expense"
                ),

            name:
                expense.name ||
                "Expense",

            date:
                expense.date ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            amount:
                Math.abs(
                    Number(
                        expense.amount
                    ) || 0
                ),

            category:
                expense.category ||
                "Other",

            paymentMethod:
                expense.paymentMethod ||
                "Checking",

            notes:
                expense.notes || "",

            createdAt:
                expense.createdAt ||
                new Date().toISOString()

        };


        month.expenses.push(
            newExpense
        );


        this.saveMonth(
            monthKey,
            month
        );


        return newExpense;

    },


    getExpenses(
        monthKey = this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).expenses
        ];

    },


    updateExpense(
        expenseId,
        updates,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const expense =
            month.expenses.find(
                item =>
                    item.id ===
                    expenseId
            );


        if (!expense) {
            return null;
        }


        Object.assign(
            expense,
            updates
        );


        if (
            updates.amount !== undefined
        ) {

            expense.amount =
                Math.abs(
                    Number(
                        updates.amount
                    ) || 0
                );

        }


        this.saveMonth(
            monthKey,
            month
        );


        return expense;

    },


    deleteExpense(
        expenseId,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        month.expenses =
            month.expenses.filter(
                expense =>
                    expense.id !==
                    expenseId
            );


        this.saveMonth(
            monthKey,
            month
        );


        return true;

    },


    /* =====================================================
       21. MANUAL TRANSACTIONS
       ===================================================== */

    /*
        Manual transactions allow:

            +500.00 = money in
            -25.00  = money out
    */

    addTransaction(
        transaction,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const newTransaction = {

            id:
                this.getRecordId(
                    transaction,
                    "transaction"
                ),

            description:
                transaction.description ||
                transaction.name ||
                "Transaction",

            date:
                transaction.date ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            category:
                transaction.category ||
                "Other",

            amount:
                Number(
                    transaction.amount
                ) || 0,

            notes:
                transaction.notes || "",

            createdAt:
                transaction.createdAt ||
                new Date().toISOString()

        };


        month.transactions.push(
            newTransaction
        );


        this.saveMonth(
            monthKey,
            month
        );


        return newTransaction;

    },


    getManualTransactions(
        monthKey = this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).transactions
        ];

    },


    updateTransaction(
        transactionId,
        updates,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const transaction =
            month.transactions.find(
                item =>
                    item.id ===
                    transactionId
            );


        if (!transaction) {
            return null;
        }


        Object.assign(
            transaction,
            updates
        );


        if (
            updates.amount !== undefined
        ) {

            transaction.amount =
                Number(
                    updates.amount
                ) || 0;

        }


        this.saveMonth(
            monthKey,
            month
        );


        return transaction;

    },


    deleteTransaction(
        transactionId,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        month.transactions =
            month.transactions.filter(
                transaction =>
                    transaction.id !==
                    transactionId
            );


        this.saveMonth(
            monthKey,
            month
        );


        return true;

    },


    /* =====================================================
       22. SAVINGS GOALS
       ===================================================== */

    getSavingsGoals() {

        const data =
            this.load();


        return [
            ...data.savingsGoals
        ];

    },


    /*
        Optional helper if later we want to see only goals
        that were CREATED during a specific month.
    */

    getSavingsGoalsCreatedInMonth(
        monthKey = this.getSelectedMonthKey()
    ) {

        return this
            .getSavingsGoals()
            .filter(
                goal =>
                    goal.createdMonthKey ===
                    monthKey
            );

    },


    addSavingsGoal(
        goal,
        monthKey = this.getSelectedMonthKey()
    ) {

        const data =
            this.load();


        const targetAmount =
            Number(
                goal.targetAmount
            ) || 0;


        const currentAmount =
            Number(
                goal.currentAmount
            ) || 0;


        const newGoal = {

            id:
                this.getRecordId(
                    goal,
                    "goal"
                ),

            name:
                goal.name ||
                "Savings Goal",

            targetAmount,

            currentAmount,

            createdMonthKey:
                goal.monthKey ||
                monthKey,

            targetDate:
                goal.targetDate || "",

            notes:
                goal.notes || "",

            completed:
                targetAmount > 0 &&
                currentAmount >=
                    targetAmount,

            createdAt:
                goal.createdAt ||
                new Date().toISOString(),

            updatedAt:
                new Date().toISOString()

        };


        data.savingsGoals.push(
            newGoal
        );


        this.save(data);


        return newGoal;

    },


    updateSavingsGoal(
        goalId,
        updates
    ) {

        const data =
            this.load();


        const goal =
            data.savingsGoals.find(
                item =>
                    item.id === goalId
            );


        if (!goal) {
            return null;
        }


        Object.assign(
            goal,
            updates
        );


        if (
            updates.targetAmount !== undefined
        ) {

            goal.targetAmount =
                Number(
                    updates.targetAmount
                ) || 0;

        }


        if (
            updates.currentAmount !== undefined
        ) {

            goal.currentAmount =
                Number(
                    updates.currentAmount
                ) || 0;

        }


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            new Date().toISOString();


        this.save(data);


        return goal;

    },


    addToSavingsGoal(
        goalId,
        amount
    ) {

        const data =
            this.load();


        const goal =
            data.savingsGoals.find(
                item =>
                    item.id === goalId
            );


        if (!goal) {
            return null;
        }


        goal.currentAmount +=
            Number(amount) || 0;


        goal.completed =
            goal.targetAmount > 0 &&
            goal.currentAmount >=
                goal.targetAmount;


        goal.updatedAt =
            new Date().toISOString();


        this.save(data);


        return goal;

    },


    deleteSavingsGoal(goalId) {

        const data =
            this.load();


        data.savingsGoals =
            data.savingsGoals.filter(
                goal =>
                    goal.id !== goalId
            );


        this.save(data);


        return true;

    },


    /* =====================================================
       23. SAVINGS DEPOSITS
       ===================================================== */

    addSavingsDeposit(
        deposit,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        const amount =
            Math.abs(
                Number(
                    deposit.amount
                ) || 0
            );


        const newDeposit = {

            id:
                this.getRecordId(
                    deposit,
                    "savings-deposit"
                ),

            goalId:
                deposit.goalId ||
                null,

            name:
                deposit.name ||
                "Savings Deposit",

            date:
                deposit.date ||
                this.getDefaultDateForMonth(
                    monthKey
                ),

            amount,

            notes:
                deposit.notes || "",

            createdAt:
                deposit.createdAt ||
                new Date().toISOString()

        };


        month.savingsDeposits.push(
            newDeposit
        );


        /*
            Keep backwards-compatible alias synced.
        */

        month.savingsTransfers =
            month.savingsDeposits;


        this.saveMonth(
            monthKey,
            month
        );


        /*
            If this deposit is attached to a savings goal,
            update that goal too.
        */

        if (newDeposit.goalId) {

            this.addToSavingsGoal(
                newDeposit.goalId,
                amount
            );

        }


        return newDeposit;

    },


    getSavingsDeposits(
        monthKey = this.getSelectedMonthKey()
    ) {

        return [
            ...this.getMonth(
                monthKey
            ).savingsDeposits
        ];

    },


    deleteSavingsDeposit(
        depositId,
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(monthKey);


        month.savingsDeposits =
            month.savingsDeposits.filter(
                deposit =>
                    deposit.id !==
                    depositId
            );


        month.savingsTransfers =
            month.savingsDeposits;


        this.saveMonth(
            monthKey,
            month
        );


        return true;

    },


    /* -----------------------------------------------------
       OLD NAME COMPATIBILITY

       Existing code can still call:

           addSavingsTransfer()
           deleteSavingsTransfer()
       ----------------------------------------------------- */

    addSavingsTransfer(
        transfer,
        monthKey = this.getSelectedMonthKey()
    ) {

        return this.addSavingsDeposit(
            transfer,
            monthKey
        );

    },


    deleteSavingsTransfer(
        transferId,
        monthKey = this.getSelectedMonthKey()
    ) {

        return this.deleteSavingsDeposit(
            transferId,
            monthKey
        );

    },


    /* =====================================================
       24. MONEY.JS SAVE ROUTER
       ===================================================== */

    /*
        THIS IS THE MAIN CONNECTION BETWEEN:

            money.js
                ↓
            storage.js


        money.js sends a record such as:

        {
            type: "paycheck",
            monthKey: "2026-08",
            name: "Amazon",
            amount: 750
        }

        saveMoneyEntry() decides which storage function
        should handle it.
    */

    saveMoneyEntry(record) {

        if (
            !record ||
            !record.type
        ) {

            throw new Error(
                "Money entry is missing a type."
            );

        }


        const monthKey =
            record.monthKey ||
            this.getSelectedMonthKey();


        switch (record.type) {


            /* PAYCHECK */

            case "paycheck":

                return this.addPaycheck(
                    record,
                    monthKey
                );


            /* BILL */

            case "bill":

                return this.addBill(
                    record,
                    monthKey
                );


            /* EXPENSE */

            case "expense":

                return this.addExpense(
                    record,
                    monthKey
                );


            /* MANUAL TRANSACTION */

            case "transaction":

                return this.addTransaction(
                    record,
                    monthKey
                );


            /* SAVINGS GOAL */

            case "savings-goal":

                return this.addSavingsGoal(
                    record,
                    monthKey
                );


            /* SAVINGS DEPOSIT */

            case "savings-deposit":

                return this.addSavingsDeposit(
                    record,
                    monthKey
                );


            /* STARTING BALANCE */

            case "starting-balance":

                return this.setStartingBalance(
                    record.balance,
                    monthKey
                );


            default:

                throw new Error(
                    `Unknown money entry type: ${record.type}`
                );

        }

    },


    /* =====================================================
       25. TOTAL PAYCHECK INCOME
       ===================================================== */

    getPaycheckIncome(
        monthKey = this.getSelectedMonthKey()
    ) {

        return this
            .getPaychecks(monthKey)
            .reduce(
                (total, paycheck) =>

                    total +
                    Number(
                        paycheck.amount
                    ),

                0
            );

    },


    /* =====================================================
       26. POSITIVE MANUAL TRANSACTIONS
       ===================================================== */

    getManualTransactionIncome(
        monthKey = this.getSelectedMonthKey()
    ) {

        return this
            .getManualTransactions(
                monthKey
            )
            .filter(
                transaction =>
                    Number(
                        transaction.amount
                    ) > 0
            )
            .reduce(
                (total, transaction) =>

                    total +
                    Number(
                        transaction.amount
                    ),

                0
            );

    },


    /* =====================================================
       27. NEGATIVE MANUAL TRANSACTIONS
       ===================================================== */

    getManualTransactionExpenses(
        monthKey = this.getSelectedMonthKey()
    ) {

        return this
            .getManualTransactions(
                monthKey
            )
            .filter(
                transaction =>
                    Number(
                        transaction.amount
                    ) < 0
            )
            .reduce(
                (total, transaction) =>

                    total +
                    Math.abs(
                        Number(
                            transaction.amount
                        )
                    ),

                0
            );

    },


    /* =====================================================
       28. TOTAL INCOME
       ===================================================== */

    getTotalIncome(
        monthKey = this.getSelectedMonthKey()
    ) {

        return (
            this.getPaycheckIncome(
                monthKey
            )

            +

            this.getManualTransactionIncome(
                monthKey
            )
        );

    },


    /* =====================================================
       29. TOTAL BILLS
       ===================================================== */

    getTotalBills(
        monthKey = this.getSelectedMonthKey()
    ) {

        return this
            .getBills(monthKey)
            .reduce(
                (total, bill) =>

                    total +
                    Number(
                        bill.amount
                    ),

                0
            );

    },


    /* =====================================================
       30. TOTAL EXPENSES
       ===================================================== */

    getTotalExpenses(
        monthKey = this.getSelectedMonthKey()
    ) {

        const normalExpenses =
            this
                .getExpenses(
                    monthKey
                )
                .reduce(
                    (
                        total,
                        expense
                    ) =>

                        total +
                        Number(
                            expense.amount
                        ),

                    0
                );


        const manualExpenses =
            this.getManualTransactionExpenses(
                monthKey
            );


        return (
            normalExpenses +
            manualExpenses
        );

    },


    /* =====================================================
       31. TOTAL SAVINGS DEPOSITS
       ===================================================== */

    getTotalSavingsDeposits(
        monthKey = this.getSelectedMonthKey()
    ) {

        return this
            .getSavingsDeposits(
                monthKey
            )
            .reduce(
                (
                    total,
                    deposit
                ) =>

                    total +
                    Number(
                        deposit.amount
                    ),

                0
            );

    },


    /*
        Original method name kept for compatibility.
    */

    getTotalSavingsTransfers(
        monthKey = this.getSelectedMonthKey()
    ) {

        return this.getTotalSavingsDeposits(
            monthKey
        );

    },


    /* =====================================================
       32. CALCULATE ENDING BALANCE
       ===================================================== */

    calculateEndingBalance(
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const income =
            this.getTotalIncome(
                monthKey
            );


        const bills =
            this.getTotalBills(
                monthKey
            );


        const expenses =
            this.getTotalExpenses(
                monthKey
            );


        const savings =
            this.getTotalSavingsDeposits(
                monthKey
            );


        const endingBalance =

            Number(
                month.startingBalance
            )

            + income

            - bills

            - expenses

            - savings;


        month.endingBalance =
            endingBalance;


        this.saveMonth(
            monthKey,
            month
        );


        return endingBalance;

    },


    /* =====================================================
       33. MONTHLY SUMMARY
       ===================================================== */

    getMonthlySummary(
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const income =
            this.getTotalIncome(
                monthKey
            );


        const bills =
            this.getTotalBills(
                monthKey
            );


        const expenses =
            this.getTotalExpenses(
                monthKey
            );


        const savings =
            this.getTotalSavingsDeposits(
                monthKey
            );


        const startingBalance =
            Number(
                month.startingBalance
            ) || 0;


        const endingBalance =

            startingBalance

            + income

            - bills

            - expenses

            - savings;


        return {

            monthKey,

            startingBalance,

            income,

            bills,

            expenses,

            savings,

            endingBalance,


            /*
                Remaining money from this month's
                income after planned spending.
            */

            remaining:

                income

                - bills

                - expenses

                - savings

        };

    },


    /* =====================================================
       34. COMBINED ACTIVITY / TRANSACTIONS
       ===================================================== */

    getTransactions(
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        const transactions = [];


        /* -------------------------------------------------
           PAYCHECKS
           ------------------------------------------------- */

        month.paychecks.forEach(
            paycheck => {

                transactions.push({

                    id:
                        paycheck.id,

                    sourceType:
                        "paycheck",

                    type:
                        "income",

                    name:
                        paycheck.name,

                    description:
                        paycheck.name,

                    date:
                        paycheck.payDate,

                    amount:
                        Math.abs(
                            Number(
                                paycheck.amount
                            )
                        ),

                    category:
                        "Income"

                });

            }
        );


        /* -------------------------------------------------
           BILLS
           ------------------------------------------------- */

        month.bills.forEach(
            bill => {

                transactions.push({

                    id:
                        bill.id,

                    sourceType:
                        "bill",

                    type:
                        "bill",

                    name:
                        bill.name,

                    description:
                        bill.name,

                    date:
                        bill.dueDate,

                    amount:
                        -Math.abs(
                            Number(
                                bill.amount
                            )
                        ),

                    category:
                        bill.category,

                    paid:
                        bill.paid

                });

            }
        );


        /* -------------------------------------------------
           EXPENSES
           ------------------------------------------------- */

        month.expenses.forEach(
            expense => {

                transactions.push({

                    id:
                        expense.id,

                    sourceType:
                        "expense",

                    type:
                        "expense",

                    name:
                        expense.name,

                    description:
                        expense.name,

                    date:
                        expense.date,

                    amount:
                        -Math.abs(
                            Number(
                                expense.amount
                            )
                        ),

                    category:
                        expense.category

                });

            }
        );


        /* -------------------------------------------------
           MANUAL TRANSACTIONS
           ------------------------------------------------- */

        month.transactions.forEach(
            transaction => {

                const amount =
                    Number(
                        transaction.amount
                    ) || 0;


                transactions.push({

                    id:
                        transaction.id,

                    sourceType:
                        "transaction",

                    type:
                        amount >= 0
                            ? "income"
                            : "expense",

                    name:
                        transaction.description,

                    description:
                        transaction.description,

                    date:
                        transaction.date,

                    amount,

                    category:
                        transaction.category

                });

            }
        );


        /* -------------------------------------------------
           SAVINGS
           ------------------------------------------------- */

        month.savingsDeposits.forEach(
            deposit => {

                transactions.push({

                    id:
                        deposit.id,

                    sourceType:
                        "savings-deposit",

                    type:
                        "savings",

                    name:
                        deposit.name,

                    description:
                        deposit.name,

                    date:
                        deposit.date,

                    amount:
                        -Math.abs(
                            Number(
                                deposit.amount
                            )
                        ),

                    category:
                        "Savings"

                });

            }
        );


        /*
            Newest first.

            If a record has no date, put it last.
        */

        transactions.sort(
            (a, b) => {

                const aDate =
                    a.date
                        ? new Date(
                            `${a.date}T00:00:00`
                        )
                        : new Date(0);


                const bDate =
                    b.date
                        ? new Date(
                            `${b.date}T00:00:00`
                        )
                        : new Date(0);


                return (
                    bDate -
                    aDate
                );

            }
        );


        return transactions;

    },


    /* =====================================================
       35. RUNNING BALANCE
       ===================================================== */

    getRunningBalance(
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        let balance =
            Number(
                month.startingBalance
            ) || 0;


        const transactions =
            this.getTransactions(
                monthKey
            );


        /*
            Oldest → newest.
        */

        transactions.sort(
            (a, b) => {

                const aDate =
                    a.date
                        ? new Date(
                            `${a.date}T00:00:00`
                        )
                        : new Date(0);


                const bDate =
                    b.date
                        ? new Date(
                            `${b.date}T00:00:00`
                        )
                        : new Date(0);


                return (
                    aDate -
                    bDate
                );

            }
        );


        return transactions.map(
            transaction => {

                const balanceBefore =
                    balance;


                balance +=
                    Number(
                        transaction.amount
                    );


                return {

                    ...transaction,

                    balanceBefore,

                    balanceAfter:
                        balance

                };

            }
        );

    },


    /* =====================================================
       36. GET EVERYTHING FOR ONE MONTH
       ===================================================== */

    /*
        app.js can call ONE function when the user
        changes months.

        Example:

            BudgetStorage.getMonthSnapshot("2026-09")

        or simply:

            BudgetStorage.getMonthSnapshot()

        The second version automatically uses the month
        selected in the header.
    */

    getMonthSnapshot(
        monthKey = this.getSelectedMonthKey()
    ) {

        const month =
            this.getMonth(
                monthKey
            );


        return {

            monthKey,

            startingBalance:
                Number(
                    month.startingBalance
                ) || 0,

            paychecks:
                this.getPaychecks(
                    monthKey
                ),

            bills:
                this.getBills(
                    monthKey
                ),

            expenses:
                this.getExpenses(
                    monthKey
                ),

            manualTransactions:
                this.getManualTransactions(
                    monthKey
                ),

            savingsDeposits:
                this.getSavingsDeposits(
                    monthKey
                ),

            savingsGoals:
                this.getSavingsGoals(),

            transactions:
                this.getTransactions(
                    monthKey
                ),

            summary:
                this.getMonthlySummary(
                    monthKey
                )

        };

    },


    /* =====================================================
       37. MONTH ROLLOVER
       ===================================================== */

    rolloverMonth(
        previousMonthKey,
        newMonthKey
    ) {

        const previousMonth =
            this.getMonth(
                previousMonthKey
            );


        const previousEndingBalance =
            this.calculateEndingBalance(
                previousMonthKey
            );


        const data =
            this.load();


        /*
            Never overwrite existing month data.
        */

        if (
            data.months[
                newMonthKey
            ]
        ) {

            return data.months[
                newMonthKey
            ];

        }


        const newMonth =
            this.createDefaultMonth(
                newMonthKey
            );


        newMonth.startingBalance =
            previousEndingBalance;


        /*
            Copy recurring bills.
        */

        newMonth.bills =
            previousMonth.bills

                .filter(
                    bill =>
                        bill.recurring
                )

                .map(
                    bill => {

                        const newDueDate =
                            bill.dueDate
                                ? (
                                    `${newMonthKey}-` +
                                    `${bill.dueDate.slice(-2)}`
                                )
                                : this.getDefaultDateForMonth(
                                    newMonthKey
                                );


                        return {

                            ...bill,

                            id:
                                this.generateId(
                                    "bill"
                                ),

                            dueDate:
                                newDueDate,

                            paid:
                                false,

                            paidDate:
                                "",

                            createdAt:
                                new Date()
                                    .toISOString()

                        };

                    }
                );


        data.months[
            newMonthKey
        ] = newMonth;


        this.save(data);


        return newMonth;

    },


    /* =====================================================
       38. CHECK IF MONTH EXISTS
       ===================================================== */

    monthExists(monthKey) {

        const data =
            this.load();


        return Boolean(
            data.months[
                monthKey
            ]
        );

    },


    /* =====================================================
       39. GET ALL MONTH KEYS
       ===================================================== */

    getMonthKeys() {

        const data =
            this.load();


        return Object.keys(
            data.months
        ).sort();

    },


    /* =====================================================
       40. EXPORT DATA
       ===================================================== */

    exportData() {

        const data =
            this.load();


        return JSON.stringify(
            data,
            null,
            2
        );

    },


    /* =====================================================
       41. IMPORT DATA
       ===================================================== */

    importData(jsonData) {

        try {

            const parsedData =

                typeof jsonData ===
                    "string"

                    ? JSON.parse(
                        jsonData
                    )

                    : jsonData;


            if (
                !parsedData ||
                !parsedData.months
            ) {

                throw new Error(
                    "Invalid Budget Tracker data."
                );

            }


            const normalized =
                this.normalizeData(
                    parsedData
                );


            this.save(
                normalized
            );


            return true;

        }

        catch (error) {

            console.error(
                "Unable to import Budget Tracker data:",
                error
            );


            return false;

        }

    },


    /* =====================================================
       42. CLEAR ALL DATA
       ===================================================== */

    clearAllData() {

        localStorage.removeItem(
            this.storageKey
        );


        /*
            Remove temporary money.js storage created
            during development before this version of
            storage.js existed.
        */

        localStorage.removeItem(
            "budgetTrackerMoneyEntries"
        );


        const defaultData =
            this.createDefaultData();


        this.save(
            defaultData
        );


        return defaultData;

    }

};


/* =========================================================
   43. EXPOSE STORAGE GLOBALLY
   ========================================================= */

/*
    money.js specifically checks:

        window.BudgetStorage

    Declaring:

        const BudgetStorage = ...

    by itself is not enough for that check.

    This explicitly connects the two files.
*/

window.BudgetStorage =
    BudgetStorage;


/* =========================================================
   44. INITIALIZE STORAGE
   ========================================================= */

BudgetStorage.load();


/* =========================================================
   45. DEVELOPMENT HELPER
   ========================================================= */

console.log(
    "Budget Tracker storage v2 loaded."
);