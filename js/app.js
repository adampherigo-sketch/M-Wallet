/* =========================================================
   BUDGET TRACKER
   Main Application / Rendering
   app.js
   ========================================================= */


/* =========================================================
   1. MAIN APP OBJECT
   ========================================================= */

const BudgetApp = {

    initialized: false,


    /* =====================================================
       2. INITIALIZE APP
       ===================================================== */

    init() {

        if (this.initialized) {
            return;
        }

        this.initialized = true;


        if (!window.BudgetStorage) {

            console.error(
                "BudgetStorage is not available. Make sure storage.js loads before app.js."
            );

            return;
        }


        this.bindEvents();

        this.refresh();

        console.log(
            "Budget Tracker app loaded."
        );

    },


    /* =====================================================
       3. BIND APP EVENTS
       ===================================================== */

    bindEvents() {

        const monthSelect =
            document.getElementById(
                "month-select"
            );

        const yearSelect =
            document.getElementById(
                "year-select"
            );


        /* -------------------------------------------------
           MONTH CHANGED
           ------------------------------------------------- */

        if (monthSelect) {

            monthSelect.addEventListener(
                "change",
                () => {

                    this.refresh();

                }
            );

        }


        /* -------------------------------------------------
           YEAR CHANGED
           ------------------------------------------------- */

        if (yearSelect) {

            yearSelect.addEventListener(
                "change",
                () => {

                    this.refresh();

                }
            );

        }


        /* -------------------------------------------------
           PREVIOUS / NEXT / TODAY

           nav.js handles changing the selected month.

           app.js waits until that change finishes,
           then redraws the budget.
           ------------------------------------------------- */

        [
            "previous-month",
            "next-month",
            "today-month"
        ].forEach(buttonId => {

            const button =
                document.getElementById(
                    buttonId
                );


            if (!button) {
                return;
            }


            button.addEventListener(
                "click",
                () => {

                    window.setTimeout(
                        () => {

                            this.refresh();

                        },
                        0
                    );

                }
            );

        });


        /* -------------------------------------------------
           MONEY SAVED

           money.js fires:

               budget:money-saved

           immediately after something is stored.
           ------------------------------------------------- */

        document.addEventListener(
            "budget:money-saved",
            () => {

                this.refresh();

            }
        );


        /* -------------------------------------------------
           OPTIONAL MONTH EVENT FROM NAV.JS
           ------------------------------------------------- */

        document.addEventListener(
            "budget:month-changed",
            () => {

                this.refresh();

            }
        );


        /* -------------------------------------------------
           ANOTHER TAB CHANGED LOCAL STORAGE
           ------------------------------------------------- */

        window.addEventListener(
            "storage",
            event => {

                if (
                    event.key ===
                    BudgetStorage.storageKey
                ) {

                    this.refresh();

                }

            }
        );


        /* -------------------------------------------------
           SETTINGS BUTTONS
           ------------------------------------------------- */

        this.bindSettingsActions();

    },


    /* =====================================================
       4. REFRESH ENTIRE APP
       ===================================================== */

    /*
        This is now the master redraw function.

        Anytime money changes:

            Save
            Month
            Year
            Reset

        we call this one function.
    */

    refresh() {

        try {

            const monthKey =
                BudgetStorage
                    .getSelectedMonthKey();


            const snapshot =
                BudgetStorage
                    .getMonthSnapshot(
                        monthKey
                    );


            this.updateCurrentMonthTitle();

            this.renderDashboard(
                snapshot
            );

            this.renderBudget(
                snapshot
            );

            this.renderTransactions(
                snapshot
            );

            this.renderSavings(
                snapshot
            );


            /*
                Future parts of the app can listen
                for this if needed.
            */

            document.dispatchEvent(

                new CustomEvent(
                    "budget:app-refreshed",
                    {
                        detail: {
                            monthKey,
                            snapshot
                        }
                    }
                )

            );

        }

        catch (error) {

            console.error(
                "Budget Tracker could not refresh:",
                error
            );

        }

    },


    /* =====================================================
       5. UPDATE CURRENT MONTH HEADING
       ===================================================== */

    updateCurrentMonthTitle() {

        const monthSelect =
            document.getElementById(
                "month-select"
            );

        const yearSelect =
            document.getElementById(
                "year-select"
            );

        const title =
            document.getElementById(
                "current-month"
            );


        if (
            !monthSelect ||
            !yearSelect ||
            !title
        ) {
            return;
        }


        const selectedOption =
            monthSelect.options[
                monthSelect.selectedIndex
            ];


        const monthName =
            selectedOption
                ? selectedOption.textContent
                : "";


        title.textContent =
            `${monthName} ${yearSelect.value}`;

    },


    /* =====================================================
       6. RENDER DASHBOARD
       ===================================================== */

    renderDashboard(snapshot) {

        const summary =
            snapshot.summary;


        /* -------------------------------------------------
           MAIN BALANCE
           ------------------------------------------------- */

        this.setMoneyText(
            "checking-balance",
            summary.endingBalance
        );


        this.setMoneyText(
            "monthly-remaining",
            summary.remaining
        );


        this.setMoneyText(
            "monthly-savings",
            summary.savings
        );


        /* -------------------------------------------------
           MONTH SUMMARY
           ------------------------------------------------- */

        this.setMoneyText(
            "total-income",
            summary.income
        );


        this.setMoneyText(
            "total-bills",
            summary.bills
        );


        this.setMoneyText(
            "total-expenses",
            summary.expenses
        );


        this.setMoneyText(
            "total-savings",
            summary.savings
        );


        /* -------------------------------------------------
           DASHBOARD SECTIONS
           ------------------------------------------------- */

        this.renderUpcomingBills(
            snapshot
        );


        this.renderNextPaycheck(
            snapshot
        );


        this.renderDashboardSavings(
            snapshot
        );

    },


    /* =====================================================
       7. UPCOMING BILLS
       ===================================================== */

    renderUpcomingBills(snapshot) {

        const container =
            document.getElementById(
                "upcoming-bills"
            );


        if (!container) {
            return;
        }


        const monthKey =
            snapshot.monthKey;


        const currentMonthKey =
            BudgetStorage
                .getCurrentMonthKey();


        const today =
            this.getTodayKey();


        const bills =
            [...snapshot.bills]

                .filter(
                    bill =>
                        !bill.paid
                )

                .sort(
                    (a, b) =>
                        this.compareDates(
                            a.dueDate,
                            b.dueDate
                        )
                )

                .slice(
                    0,
                    5
                );


        if (
            bills.length === 0
        ) {

            container.innerHTML = `

                <p class="empty-message">
                    No upcoming bills.
                </p>

            `;

            return;

        }


        container.innerHTML =
            bills.map(bill => {

                const overdue =
                    monthKey ===
                        currentMonthKey &&

                    bill.dueDate &&
                    bill.dueDate < today;


                const status =
                    overdue
                        ? "Overdue"
                        : this.formatDate(
                            bill.dueDate
                        );


                return `

                    <article class="transaction-item">

                        <div class="transaction-icon">
                            🧾
                        </div>


                        <div class="transaction-info">

                            <strong>
                                ${this.escapeHTML(
                                    bill.name
                                )}
                            </strong>

                            <span>
                                ${this.escapeHTML(
                                    bill.category ||
                                    "Bill"
                                )}
                                ·
                                ${status}
                            </span>

                        </div>


                        <div class="transaction-amount expense">
                            ${this.formatCurrency(
                                -Math.abs(
                                    Number(
                                        bill.amount
                                    )
                                )
                            )}
                        </div>

                    </article>

                `;

            }).join("");

    },


    /* =====================================================
       8. NEXT PAYCHECK
       ===================================================== */

    renderNextPaycheck(snapshot) {

        const dateElement =
            document.getElementById(
                "next-pay-date"
            );

        const amountElement =
            document.getElementById(
                "next-pay-amount"
            );


        if (
            !dateElement ||
            !amountElement
        ) {
            return;
        }


        let paychecks =
            [...snapshot.paychecks]

                .filter(
                    paycheck =>
                        paycheck.payDate
                )

                .sort(
                    (a, b) =>
                        this.compareDates(
                            a.payDate,
                            b.payDate
                        )
                );


        /*
            When looking at the current month,
            "Next Paycheck" should actually mean
            today or later.
        */

        if (
            snapshot.monthKey ===
            BudgetStorage.getCurrentMonthKey()
        ) {

            const today =
                this.getTodayKey();


            paychecks =
                paychecks.filter(
                    paycheck =>
                        paycheck.payDate >=
                        today
                );

        }


        const nextPaycheck =
            paychecks[0];


        if (!nextPaycheck) {

            dateElement.textContent =
                "—";


            amountElement.textContent =
                this.formatCurrency(0);


            return;

        }


        dateElement.textContent =
            this.formatDate(
                nextPaycheck.payDate
            );


        amountElement.textContent =
            this.formatCurrency(
                nextPaycheck.amount
            );

    },


    /* =====================================================
       9. DASHBOARD SAVINGS OVERVIEW
       ===================================================== */

    renderDashboardSavings(snapshot) {

        const container =
            document.getElementById(
                "savings-overview"
            );


        if (!container) {
            return;
        }


        const goals =
            snapshot.savingsGoals.slice(
                0,
                3
            );


        if (
            goals.length === 0
        ) {

            if (
                snapshot.summary.savings > 0
            ) {

                container.innerHTML = `

                    <article class="savings-goal-card">

                        <div class="savings-goal-header">

                            <span>
                                Saved this month
                            </span>

                            <strong>
                                ${this.formatCurrency(
                                    snapshot.summary.savings
                                )}
                            </strong>

                        </div>

                    </article>

                `;

                return;

            }


            container.innerHTML = `

                <p class="empty-message">
                    No savings goals yet.
                </p>

            `;

            return;

        }


        container.innerHTML =
            goals.map(
                goal =>
                    this.createSavingsGoalHTML(
                        goal
                    )
            ).join("");

    },


    /* =====================================================
       10. RENDER MONTHLY BUDGET PAGE
       ===================================================== */

    renderBudget(snapshot) {

        this.setMoneyText(
            "starting-balance",
            snapshot.startingBalance
        );


        this.renderPaycheckTable(
            snapshot.paychecks
        );


        this.renderBillTable(
            snapshot.bills
        );


        this.renderExpenseTable(
            snapshot.expenses
        );

    },


    /* =====================================================
       11. PAYCHECK TABLE
       ===================================================== */

    renderPaycheckTable(paychecks) {

        const container =
            document.getElementById(
                "paycheck-list"
            );


        if (!container) {
            return;
        }


        if (
            paychecks.length === 0
        ) {

            container.innerHTML = `

                <p class="empty-message">
                    No paychecks added.
                </p>

            `;

            return;

        }


        const sorted =
            [...paychecks].sort(
                (a, b) =>
                    this.compareDates(
                        a.payDate,
                        b.payDate
                    )
            );


        container.innerHTML = `

            <table>

                <thead>

                    <tr>
                        <th>Paycheck</th>
                        <th>Pay Date</th>
                        <th>Hours</th>
                        <th>Amount</th>
                    </tr>

                </thead>


                <tbody>

                    ${sorted.map(paycheck => `

                        <tr>

                            <td>
                                ${this.escapeHTML(
                                    paycheck.name
                                )}
                            </td>

                            <td>
                                ${this.formatDate(
                                    paycheck.payDate
                                )}
                            </td>

                            <td>
                                ${this.formatHours(
                                    paycheck.hours
                                )}
                            </td>

                            <td class="money-positive">
                                ${this.formatCurrency(
                                    paycheck.amount
                                )}
                            </td>

                        </tr>

                    `).join("")}

                </tbody>

            </table>

        `;

    },


    /* =====================================================
       12. BILL TABLE
       ===================================================== */

    renderBillTable(bills) {

        const container =
            document.getElementById(
                "bill-list"
            );


        if (!container) {
            return;
        }


        if (
            bills.length === 0
        ) {

            container.innerHTML = `

                <p class="empty-message">
                    No bills added.
                </p>

            `;

            return;

        }


        const sorted =
            [...bills].sort(
                (a, b) =>
                    this.compareDates(
                        a.dueDate,
                        b.dueDate
                    )
            );


        container.innerHTML = `

            <table>

                <thead>

                    <tr>
                        <th>Bill</th>
                        <th>Due</th>
                        <th>Category</th>
                        <th>Amount</th>
                        <th>Repeats</th>
                    </tr>

                </thead>


                <tbody>

                    ${sorted.map(bill => `

                        <tr>

                            <td>
                                ${this.escapeHTML(
                                    bill.name
                                )}
                            </td>

                            <td>
                                ${this.formatDate(
                                    bill.dueDate
                                )}
                            </td>

                            <td>
                                ${this.escapeHTML(
                                    bill.category ||
                                    "Other"
                                )}
                            </td>

                            <td class="money-negative">
                                ${this.formatCurrency(
                                    bill.amount
                                )}
                            </td>

                            <td>
                                ${bill.recurring
                                    ? "Yes"
                                    : "No"}
                            </td>

                        </tr>

                    `).join("")}

                </tbody>

            </table>

        `;

    },


    /* =====================================================
       13. EXPENSE TABLE
       ===================================================== */

    renderExpenseTable(expenses) {

        const container =
            document.getElementById(
                "expense-list"
            );


        if (!container) {
            return;
        }


        if (
            expenses.length === 0
        ) {

            container.innerHTML = `

                <p class="empty-message">
                    No expenses added.
                </p>

            `;

            return;

        }


        const sorted =
            [...expenses].sort(
                (a, b) =>
                    this.compareDates(
                        b.date,
                        a.date
                    )
            );


        container.innerHTML = `

            <table>

                <thead>

                    <tr>
                        <th>Expense</th>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Amount</th>
                    </tr>

                </thead>


                <tbody>

                    ${sorted.map(expense => `

                        <tr>

                            <td>
                                ${this.escapeHTML(
                                    expense.name
                                )}
                            </td>

                            <td>
                                ${this.formatDate(
                                    expense.date
                                )}
                            </td>

                            <td>
                                ${this.escapeHTML(
                                    expense.category ||
                                    "Other"
                                )}
                            </td>

                            <td class="money-negative">
                                ${this.formatCurrency(
                                    expense.amount
                                )}
                            </td>

                        </tr>

                    `).join("")}

                </tbody>

            </table>

        `;

    },


    /* =====================================================
       14. TRANSACTION / ACTIVITY PAGE
       ===================================================== */

    renderTransactions(snapshot) {

        const container =
            document.getElementById(
                "transaction-list"
            );


        if (!container) {
            return;
        }


        const transactions =
            snapshot.transactions;


        if (
            transactions.length === 0
        ) {

            container.innerHTML = `

                <p class="empty-message">
                    No transactions yet.
                </p>

            `;

            return;

        }


        container.innerHTML =
            transactions.map(
                transaction => {

                    const amount =
                        Number(
                            transaction.amount
                        ) || 0;


                    const isIncome =
                        amount >= 0;


                    const icon =
                        this.getTransactionIcon(
                            transaction
                        );


                    const subtitle =
                        this.getTransactionSubtitle(
                            transaction
                        );


                    return `

                        <article class="transaction-item">

                            <div class="transaction-icon">
                                ${icon}
                            </div>


                            <div class="transaction-info">

                                <strong>
                                    ${this.escapeHTML(
                                        transaction.description ||
                                        transaction.name ||
                                        "Transaction"
                                    )}
                                </strong>


                                <span>
                                    ${this.escapeHTML(
                                        subtitle
                                    )}

                                    ${transaction.date
                                        ? ` · ${this.formatDate(
                                            transaction.date
                                        )}`
                                        : ""
                                    }
                                </span>

                            </div>


                            <div class="
                                transaction-amount
                                ${isIncome
                                    ? "income"
                                    : "expense"}
                            ">
                                ${this.formatSignedCurrency(
                                    amount
                                )}
                            </div>

                        </article>

                    `;

                }
            ).join("");

    },


    /* =====================================================
       15. TRANSACTION ICON
       ===================================================== */

    getTransactionIcon(
        transaction
    ) {

        switch (
            transaction.sourceType
        ) {

            case "paycheck":
                return "💵";


            case "bill":
                return "🧾";


            case "expense":
                return "🛒";


            case "savings-deposit":
                return "🏦";


            case "transaction":

                return (
                    Number(
                        transaction.amount
                    ) >= 0
                        ? "+"
                        : "−"
                );


            default:
                return "$";

        }

    },


    /* =====================================================
       16. TRANSACTION SUBTITLE
       ===================================================== */

    getTransactionSubtitle(
        transaction
    ) {

        if (
            transaction.sourceType ===
            "bill"
        ) {

            return transaction.paid
                ? `${transaction.category || "Bill"} · Paid`
                : `${transaction.category || "Bill"} · Planned bill`;

        }


        return (
            transaction.category ||
            "Transaction"
        );

    },


    /* =====================================================
       17. SAVINGS PAGE
       ===================================================== */

    renderSavings(snapshot) {

        const balance =
            this.calculateOverallSavings();


        this.setMoneyText(
            "savings-balance",
            balance
        );


        const container =
            document.getElementById(
                "savings-goals"
            );


        if (!container) {
            return;
        }


        const goals =
            snapshot.savingsGoals;


        if (
            goals.length === 0
        ) {

            container.innerHTML = `

                <p class="empty-message">
                    No savings goals created.
                </p>

            `;

            return;

        }


        container.innerHTML =
            goals.map(
                goal =>
                    this.createSavingsGoalHTML(
                        goal
                    )
            ).join("");

    },


    /* =====================================================
       18. CREATE SAVINGS GOAL CARD
       ===================================================== */

    createSavingsGoalHTML(goal) {

        const target =
            Number(
                goal.targetAmount
            ) || 0;


        const current =
            Number(
                goal.currentAmount
            ) || 0;


        let percent = 0;


        if (
            target > 0
        ) {

            percent =
                (
                    current /
                    target
                ) * 100;

        }


        percent =
            Math.min(
                Math.max(
                    percent,
                    0
                ),
                100
            );


        return `

            <article class="savings-goal-card">

                <div class="savings-goal-header">

                    <div>

                        <strong>
                            ${this.escapeHTML(
                                goal.name
                            )}
                        </strong>

                    </div>


                    <strong>
                        ${this.formatCurrency(
                            current
                        )}
                        /
                        ${this.formatCurrency(
                            target
                        )}
                    </strong>

                </div>


                <div
                    class="savings-progress"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${percent.toFixed(0)}"
                >

                    <div
                        class="savings-progress-bar"
                        style="width: ${percent}%"
                    ></div>

                </div>

            </article>

        `;

    },


    /* =====================================================
       19. CALCULATE OVERALL SAVINGS
       ===================================================== */

    /*
        Goal-linked deposits are already represented by
        goal.currentAmount.

        Therefore:

        overall savings =
            all goal current amounts
            +
            savings deposits NOT assigned to a goal

        This prevents goal deposits from being counted twice.
    */

    calculateOverallSavings() {

        const data =
            BudgetStorage.load();


        const goalTotal =
            data.savingsGoals.reduce(
                (total, goal) =>

                    total +
                    Number(
                        goal.currentAmount
                    ),

                0
            );


        let generalSavings =
            0;


        Object.values(
            data.months
        ).forEach(month => {

            const deposits =
                Array.isArray(
                    month.savingsDeposits
                )
                    ? month.savingsDeposits
                    : [];


            deposits.forEach(
                deposit => {

                    if (!deposit.goalId) {

                        generalSavings +=
                            Number(
                                deposit.amount
                            ) || 0;

                    }

                }
            );

        });


        return (
            goalTotal +
            generalSavings
        );

    },


    /* =====================================================
       20. FORMAT CURRENCY
       ===================================================== */

    formatCurrency(value) {

        const amount =
            Number(value) || 0;


        let currency =
            "USD";


        try {

            const data =
                BudgetStorage.load();


            currency =
                data.settings?.currency ||
                "USD";

        }

        catch (error) {

            currency =
                "USD";

        }


        return new Intl.NumberFormat(
            "en-US",
            {
                style: "currency",
                currency
            }
        ).format(amount);

    },


    /* =====================================================
       21. FORMAT SIGNED CURRENCY
       ===================================================== */

    formatSignedCurrency(value) {

        const amount =
            Number(value) || 0;


        if (
            amount > 0
        ) {

            return (
                "+" +
                this.formatCurrency(
                    amount
                )
            );

        }


        return this.formatCurrency(
            amount
        );

    },


    /* =====================================================
       22. FORMAT DATE
       ===================================================== */

    formatDate(dateValue) {

        if (!dateValue) {
            return "—";
        }


        /*
            Handle YYYY-MM-DD without UTC timezone shifting.
        */

        const parts =
            String(
                dateValue
            ).split("-");


        if (
            parts.length === 3
        ) {

            const [
                year,
                month,
                day
            ] = parts;


            const date =
                new Date(
                    Number(year),
                    Number(month) - 1,
                    Number(day)
                );


            if (
                !Number.isNaN(
                    date.getTime()
                )
            ) {

                return new Intl.DateTimeFormat(
                    "en-US",
                    {
                        month: "short",
                        day: "numeric",
                        year: "numeric"
                    }
                ).format(date);

            }

        }


        return dateValue;

    },


    /* =====================================================
       23. FORMAT HOURS
       ===================================================== */

    formatHours(value) {

        const hours =
            Number(value) || 0;


        return hours.toLocaleString(
            "en-US",
            {
                maximumFractionDigits: 2
            }
        );

    },


    /* =====================================================
       24. DATE COMPARISON
       ===================================================== */

    compareDates(
        first,
        second
    ) {

        if (
            !first &&
            !second
        ) {
            return 0;
        }


        if (!first) {
            return 1;
        }


        if (!second) {
            return -1;
        }


        return String(first)
            .localeCompare(
                String(second)
            );

    },


    /* =====================================================
       25. TODAY KEY
       ===================================================== */

    getTodayKey() {

        const today =
            new Date();


        const year =
            today.getFullYear();


        const month =
            String(
                today.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        const day =
            String(
                today.getDate()
            ).padStart(
                2,
                "0"
            );


        return (
            `${year}-` +
            `${month}-` +
            `${day}`
        );

    },


    /* =====================================================
       26. SET MONEY ELEMENT
       ===================================================== */

    setMoneyText(
        elementId,
        value
    ) {

        const element =
            document.getElementById(
                elementId
            );


        if (!element) {
            return;
        }


        element.textContent =
            this.formatCurrency(
                value
            );

    },


    /* =====================================================
       27. ESCAPE HTML
       ===================================================== */

    /*
        Prevent user-entered names such as bill names
        from accidentally becoming HTML.
    */

    escapeHTML(value) {

        return String(
            value ?? ""
        )

            .replaceAll(
                "&",
                "&amp;"
            )

            .replaceAll(
                "<",
                "&lt;"
            )

            .replaceAll(
                ">",
                "&gt;"
            )

            .replaceAll(
                '"',
                "&quot;"
            )

            .replaceAll(
                "'",
                "&#039;"
            );

    },


    /* =====================================================
       28. SETTINGS ACTIONS
       ===================================================== */

    bindSettingsActions() {

        const exportButton =
            document.getElementById(
                "export-data"
            );


        const clearButton =
            document.getElementById(
                "clear-data"
            );


        if (exportButton) {

            exportButton.addEventListener(
                "click",
                () => {

                    this.exportBudgetData();

                }
            );

        }


        if (clearButton) {

            clearButton.addEventListener(
                "click",
                () => {

                    this.resetBudgetData();

                }
            );

        }

    },


    /* =====================================================
       29. EXPORT BUDGET DATA
       ===================================================== */

    exportBudgetData() {

        const json =
            BudgetStorage.exportData();


        const blob =
            new Blob(
                [json],
                {
                    type:
                        "application/json"
                }
            );


        const url =
            URL.createObjectURL(
                blob
            );


        const link =
            document.createElement(
                "a"
            );


        link.href =
            url;


        link.download =
            `budget-tracker-${this.getTodayKey()}.json`;


        document.body.appendChild(
            link
        );


        link.click();


        link.remove();


        URL.revokeObjectURL(
            url
        );

    },


    /* =====================================================
       30. RESET BUDGET DATA
       ===================================================== */

    resetBudgetData() {

        const confirmed =
            window.confirm(
                "Reset all Budget Tracker data? This cannot be undone."
            );


        if (!confirmed) {
            return;
        }


        BudgetStorage.clearAllData();


        this.refresh();

    }

};


/* =========================================================
   31. EXPOSE APP GLOBALLY
   ========================================================= */

window.BudgetApp =
    BudgetApp;


/* =========================================================
   32. START APP
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            BudgetApp.init();

        }
    );

}

else {

    BudgetApp.init();

}


/* =========================================================
   END APP.JS
   ========================================================= */