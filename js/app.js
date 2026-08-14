/* =========================================================
   M-WALLET
   Main Application / Rendering
   app.js
   Phase 2.2 - Expense Management
   ========================================================= */


/* =========================================================
   1. MAIN APP OBJECT
   ========================================================= */

const BudgetApp = {

    initialized: false,


    /* =====================================================
       2. GET STORAGE SYSTEM
       ===================================================== */

    getStorage() {

        return (
            window.MWalletStorage ||
            window.BudgetStorage ||
            null
        );

    },


    /* =====================================================
       3. INITIALIZE APP
       ===================================================== */

    init() {

        if (this.initialized) {
            return;
        }


        this.initialized = true;


        const storage =
            this.getStorage();


        if (!storage) {

            console.error(
                "M-Wallet storage is not available. Make sure storage.js loads before app.js."
            );

            return;

        }


        this.bindEvents();

        this.refresh();


        console.log(
            "M-Wallet app loaded - P2.2 Expense Management."
        );

    },


    /* =====================================================
       4. BIND APP EVENTS
       ===================================================== */

    bindEvents() {

        const storage =
            this.getStorage();


        const monthSelect =
            document.getElementById(
                "month-select"
            );


        const yearSelect =
            document.getElementById(
                "year-select"
            );


        if (monthSelect) {

            monthSelect.addEventListener(
                "change",
                () => {

                    this.refresh();

                }
            );

        }


        if (yearSelect) {

            yearSelect.addEventListener(
                "change",
                () => {

                    this.refresh();

                }
            );

        }


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


        document.addEventListener(
            "budget:money-saved",
            () => {

                this.refresh();

            }
        );


        document.addEventListener(
            "mwallet:money-saved",
            () => {

                this.refresh();

            }
        );


        document.addEventListener(
            "mwallet:income-updated",
            () => {

                this.refresh();

            }
        );


        document.addEventListener(
            "mwallet:income-deleted",
            () => {

                this.refresh();

            }
        );


        document.addEventListener(
            "mwallet:expense-updated",
            () => {

                this.refresh();

            }
        );


        document.addEventListener(
            "mwallet:expense-deleted",
            () => {

                this.refresh();

            }
        );


        document.addEventListener(
            "budget:month-changed",
            () => {

                this.refresh();

            }
        );


        document.addEventListener(
            "mwallet:month-changed",
            () => {

                this.refresh();

            }
        );


        window.addEventListener(
            "storage",
            event => {

                if (
                    storage &&
                    event.key ===
                        storage.storageKey
                ) {

                    this.refresh();

                }

            }
        );


        this.bindSettingsActions();

    },


    /* =====================================================
       5. REFRESH ENTIRE APP
       ===================================================== */

    refresh() {

        const storage =
            this.getStorage();


        if (!storage) {
            return;
        }


        try {

            const monthKey =
                storage
                    .getSelectedMonthKey();


            const snapshot =
                storage
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


            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:app-refreshed",
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
                "M-Wallet could not refresh:",
                error
            );

        }

    },


    /* =====================================================
       6. UPDATE CURRENT MONTH TITLE
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
       7. RENDER DASHBOARD
       ===================================================== */

    renderDashboard(snapshot) {

        const summary =
            snapshot.summary;


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


        this.renderUpcomingBills(
            snapshot
        );


        this.renderNextIncome(
            snapshot
        );


        this.renderDashboardSavings(
            snapshot
        );

    },


    /* =====================================================
       8. UPCOMING BILLS
       ===================================================== */

    renderUpcomingBills(snapshot) {

        const storage =
            this.getStorage();


        const container =
            document.getElementById(
                "upcoming-bills"
            );


        if (
            !container ||
            !storage
        ) {

            return;

        }


        const monthKey =
            snapshot.monthKey;


        const currentMonthKey =
            storage
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

                    bill.dueDate <
                        today;


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

                                ${this.escapeHTML(
                                    status
                                )}

                            </span>

                        </div>

                        <div class="transaction-amount expense">

                            ${this.formatCurrency(
                                -Math.abs(
                                    Number(
                                        bill.amount
                                    ) || 0
                                )
                            )}

                        </div>

                    </article>

                `;

            }).join("");

    },


    /* =====================================================
       9. NEXT INCOME
       ===================================================== */

    renderNextIncome(snapshot) {

        const storage =
            this.getStorage();


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
            !amountElement ||
            !storage
        ) {

            return;

        }


        let income =
            Array.isArray(
                snapshot.income
            )
                ? [...snapshot.income]
                : [];


        income =
            income

                .filter(
                    item =>
                        item.date
                )

                .sort(
                    (a, b) =>
                        this.compareDates(
                            a.date,
                            b.date
                        )
                );


        if (
            snapshot.monthKey ===
            storage.getCurrentMonthKey()
        ) {

            const today =
                this.getTodayKey();


            income =
                income.filter(
                    item =>
                        item.date >=
                        today
                );

        }


        const nextIncome =
            income[0];


        if (!nextIncome) {

            dateElement.textContent =
                "—";


            amountElement.textContent =
                this.formatCurrency(
                    0
                );


            return;

        }


        dateElement.textContent =
            this.formatDate(
                nextIncome.date
            );


        amountElement.textContent =
            this.formatCurrency(
                nextIncome.amount
            );

    },


    /* =====================================================
       10. DASHBOARD SAVINGS
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
            Array.isArray(
                snapshot.savingsGoals
            )
                ? snapshot.savingsGoals.slice(
                    0,
                    3
                )
                : [];


        if (
            goals.length === 0
        ) {

            if (
                snapshot.summary.savings >
                0
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
       11. RENDER MONTHLY BUDGET
       ===================================================== */

    renderBudget(snapshot) {

        const storage =
            this.getStorage();


        if (!storage) {
            return;
        }


        this.setMoneyText(
            "starting-balance",
            snapshot.startingBalance
        );


        const selectedYear =
            snapshot
                .monthKey
                .split("-")[0];


        const monthlyIncome =
            typeof storage
                .getMonthlyIncomeTotal ===
                "function"

                ? storage
                    .getMonthlyIncomeTotal(
                        snapshot.monthKey
                    )

                : 0;


        const yearlyIncome =
            typeof storage
                .getYearlyIncomeTotal ===
                "function"

                ? storage
                    .getYearlyIncomeTotal(
                        selectedYear
                    )

                : 0;


        this.setMoneyText(
            "monthly-income-total",
            monthlyIncome
        );


        this.setMoneyText(
            "yearly-income-total",
            yearlyIncome
        );


        const monthlyExpenses =
            typeof storage
                .getMonthlyExpenseTotal ===
                "function"

                ? storage
                    .getMonthlyExpenseTotal(
                        snapshot.monthKey
                    )

                : 0;


        const yearlyExpenses =
            typeof storage
                .getYearlyExpenseTotal ===
                "function"

                ? storage
                    .getYearlyExpenseTotal(
                        selectedYear
                    )

                : 0;


        this.setMoneyText(
            "monthly-expense-total",
            monthlyExpenses
        );


        this.setMoneyText(
            "yearly-expense-total",
            yearlyExpenses
        );


        this.renderIncomeTable(
            snapshot.income || []
        );


        this.renderBillTable(
            snapshot.bills || []
        );


        this.renderExpenseTable(
            snapshot.expenses || []
        );

    },


    /* =====================================================
       12. INCOME TABLE
       ===================================================== */

    renderIncomeTable(income) {

        const container =
            document.getElementById(
                "income-list"
            );


        if (!container) {
            return;
        }


        if (
            !Array.isArray(income) ||
            income.length === 0
        ) {

            container.innerHTML = `

                <p class="empty-message">
                    No income added.
                </p>

            `;


            return;

        }


        const sorted =
            [...income].sort(
                (a, b) =>
                    this.compareDates(
                        a.date,
                        b.date
                    )
            );


        container.innerHTML = `

            <table>

                <thead>

                    <tr>

                        <th>Income</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Frequency</th>
                        <th>Amount</th>
                        <th>Actions</th>

                    </tr>

                </thead>


                <tbody>

                    ${sorted.map(item => {

                        const incomeId =
                            item.sourceId ||
                            item.id ||
                            "";


                        return `

                            <tr>

                                <td>

                                    <strong>
                                        ${this.escapeHTML(
                                            item.source ||
                                            item.name ||
                                            "Income"
                                        )}
                                    </strong>

                                </td>


                                <td>

                                    ${this.formatDate(
                                        item.date
                                    )}

                                </td>


                                <td>

                                    ${this.escapeHTML(
                                        item.category ||
                                        "Other Income"
                                    )}

                                </td>


                                <td>

                                    ${this.escapeHTML(
                                        this.formatIncomeFrequency(
                                            item
                                        )
                                    )}

                                </td>


                                <td class="money-positive">

                                    ${this.formatCurrency(
                                        item.amount
                                    )}

                                </td>


                                <td>

                                    <div class="income-actions">

                                        <button
                                            type="button"
                                            class="text-button"
                                            data-income-edit="${this.escapeHTML(
                                                incomeId
                                            )}"
                                        >
                                            Edit
                                        </button>


                                        <button
                                            type="button"
                                            class="text-button money-negative"
                                            data-income-delete="${this.escapeHTML(
                                                incomeId
                                            )}"
                                        >
                                            Delete
                                        </button>

                                    </div>

                                </td>

                            </tr>

                        `;

                    }).join("")}

                </tbody>

            </table>

        `;

    },


    /* =====================================================
       13. FORMAT INCOME FREQUENCY
       ===================================================== */

    formatIncomeFrequency(income) {

        if (
            !income.recurring
        ) {

            return "One-time";

        }


        switch (
            income.frequency
        ) {

            case "weekly":

                return "Weekly";


            case "biweekly":

                return "Biweekly";


            case "twice-monthly":

                return "Twice Monthly";


            case "monthly":

                return "Monthly";


            case "custom":

                return this
                    .formatCustomFrequency(
                        income
                    );


            default:

                return "Recurring";

        }

    },


    /* =====================================================
       14. EXPENSE TABLE - P2.2
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
            !Array.isArray(expenses) ||
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
                        <th>Merchant</th>
                        <th>Category</th>
                        <th>Subcategory</th>
                        <th>Frequency</th>
                        <th>Amount</th>
                        <th>Actions</th>

                    </tr>

                </thead>


                <tbody>

                    ${sorted.map(expense => {

                        const expenseId =
                            expense.sourceId ||
                            expense.id ||
                            "";


                        return `

                            <tr>

                                <td>

                                    <strong>
                                        ${this.escapeHTML(
                                            expense.name ||
                                            "Expense"
                                        )}
                                    </strong>

                                    ${
                                        expense.notes
                                            ? `
                                                <div class="table-note">

                                                    ${this.escapeHTML(
                                                        expense.notes
                                                    )}

                                                </div>
                                            `
                                            : ""
                                    }

                                </td>


                                <td>

                                    ${this.formatDate(
                                        expense.date
                                    )}

                                </td>


                                <td>

                                    ${this.escapeHTML(
                                        expense.merchant ||
                                        "—"
                                    )}

                                </td>


                                <td>

                                    ${this.escapeHTML(
                                        expense.category ||
                                        "Other"
                                    )}

                                </td>


                                <td>

                                    ${this.escapeHTML(
                                        expense.subcategory ||
                                        "—"
                                    )}

                                </td>


                                <td>

                                    ${this.escapeHTML(
                                        this.formatExpenseFrequency(
                                            expense
                                        )
                                    )}

                                </td>


                                <td class="money-negative">

                                    ${this.formatCurrency(
                                        expense.amount
                                    )}

                                </td>


                                <td>

                                    <div class="expense-actions">

                                        <button
                                            type="button"
                                            class="text-button"
                                            data-expense-edit="${this.escapeHTML(
                                                expenseId
                                            )}"
                                            aria-label="Edit ${this.escapeHTML(
                                                expense.name ||
                                                "expense"
                                            )}"
                                        >
                                            Edit
                                        </button>


                                        <button
                                            type="button"
                                            class="text-button money-negative"
                                            data-expense-delete="${this.escapeHTML(
                                                expenseId
                                            )}"
                                            aria-label="Delete ${this.escapeHTML(
                                                expense.name ||
                                                "expense"
                                            )}"
                                        >
                                            Delete
                                        </button>

                                    </div>

                                </td>

                            </tr>

                        `;

                    }).join("")}

                </tbody>

            </table>

        `;

    },


    /* =====================================================
       15. FORMAT EXPENSE FREQUENCY
       ===================================================== */

    formatExpenseFrequency(expense) {

        if (
            !expense.recurring
        ) {

            return "One-time";

        }


        switch (
            expense.frequency
        ) {

            case "weekly":

                return "Weekly";


            case "biweekly":

                return "Biweekly";


            case "monthly":

                return "Monthly";


            case "yearly":

                return "Yearly";


            case "custom":

                return this
                    .formatCustomFrequency(
                        expense
                    );


            default:

                return "Recurring";

        }

    },


    /* =====================================================
       16. FORMAT CUSTOM FREQUENCY
       ===================================================== */

    formatCustomFrequency(item) {

        const interval =
            Number(
                item.customInterval
            ) || 1;


        const unit =
            item.customUnit ||
            "months";


        let label =
            unit;


        if (
            interval === 1 &&
            label.endsWith("s")
        ) {

            label =
                label.slice(
                    0,
                    -1
                );

        }


        label =
            label.charAt(0)
                .toUpperCase() +
            label.slice(1);


        return (
            `Every ${interval} ${label}`
        );

    },


    /* =====================================================
       17. BILL TABLE
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
            !Array.isArray(bills) ||
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
       18. TRANSACTION / ACTIVITY PAGE
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
            Array.isArray(
                snapshot.transactions
            )
                ? snapshot.transactions
                : [];


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
       19. TRANSACTION ICON
       ===================================================== */

    getTransactionIcon(transaction) {

        switch (
            transaction.sourceType
        ) {

            case "income":

                return "💵";


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
       20. TRANSACTION SUBTITLE
       ===================================================== */

    getTransactionSubtitle(
        transaction
    ) {

        if (
            transaction.sourceType ===
            "bill"
        ) {

            return transaction.paid

                ? (
                    `${transaction.category || "Bill"} · Paid`
                )

                : (
                    `${transaction.category || "Bill"} · Planned Bill`
                );

        }


        if (
            transaction.sourceType ===
            "income"
        ) {

            const parts =
                [];


            parts.push(
                transaction.category ||
                "Income"
            );


            if (
                transaction.recurring
            ) {

                parts.push(
                    this.formatIncomeFrequency(
                        transaction
                    )
                );

            }


            return parts.join(
                " · "
            );

        }


        if (
            transaction.sourceType ===
            "savings-deposit"
        ) {

            return "Savings";

        }


        if (
            transaction.sourceType ===
            "expense"
        ) {

            const parts =
                [];


            if (
                transaction.merchant
            ) {

                parts.push(
                    transaction.merchant
                );

            }


            if (
                transaction.category
            ) {

                parts.push(
                    transaction.category
                );

            }


            if (
                transaction.subcategory
            ) {

                parts.push(
                    transaction.subcategory
                );

            }


            if (
                transaction.recurring
            ) {

                parts.push(
                    this.formatExpenseFrequency(
                        transaction
                    )
                );

            }


            return (
                parts.join(
                    " · "
                )
                ||
                "Expense"
            );

        }


        return (
            transaction.category ||
            "Transaction"
        );

    },


    /* =====================================================
       21. SAVINGS PAGE
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
            Array.isArray(
                snapshot.savingsGoals
            )
                ? snapshot.savingsGoals
                : [];


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
       22. SAVINGS GOAL CARD
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


        let percent =
            0;


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
       23. CALCULATE OVERALL SAVINGS
       ===================================================== */

    calculateOverallSavings() {

        const storage =
            this.getStorage();


        if (!storage) {
            return 0;
        }


        const data =
            storage.load();


        const savingsGoals =
            Array.isArray(
                data.savingsGoals
            )
                ? data.savingsGoals
                : [];


        const goalTotal =
            savingsGoals.reduce(
                (
                    total,
                    goal
                ) =>

                    total +
                    (
                        Number(
                            goal.currentAmount
                        ) || 0
                    ),

                0
            );


        let generalSavings =
            0;


        Object.values(
            data.months ||
            {}
        ).forEach(month => {

            const deposits =
                Array.isArray(
                    month.savingsDeposits
                )
                    ? month.savingsDeposits
                    : [];


            deposits.forEach(
                deposit => {

                    if (
                        !deposit.goalId
                    ) {

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
       24. FORMAT CURRENCY
       ===================================================== */

    formatCurrency(value) {

        const storage =
            this.getStorage();


        const amount =
            Number(
                value
            ) || 0;


        let currency =
            "USD";


        if (
            storage
        ) {

            try {

                const data =
                    storage.load();


                currency =
                    data.settings?.currency ||
                    "USD";

            }

            catch (error) {

                currency =
                    "USD";

            }

        }


        return new Intl.NumberFormat(
            "en-US",
            {

                style:
                    "currency",

                currency

            }
        ).format(
            amount
        );

    },


    /* =====================================================
       25. FORMAT SIGNED CURRENCY
       ===================================================== */

    formatSignedCurrency(value) {

        const amount =
            Number(
                value
            ) || 0;


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
       26. FORMAT DATE
       ===================================================== */

    formatDate(dateValue) {

        if (
            !dateValue
        ) {

            return "—";

        }


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
            ] =
                parts;


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

                        month:
                            "short",

                        day:
                            "numeric",

                        year:
                            "numeric"

                    }
                ).format(
                    date
                );

            }

        }


        return String(
            dateValue
        );

    },


    /* =====================================================
       27. DATE COMPARISON
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


        return String(
            first
        ).localeCompare(
            String(
                second
            )
        );

    },


    /* =====================================================
       28. TODAY KEY
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
       29. SET MONEY ELEMENT
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
       30. ESCAPE HTML
       ===================================================== */

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
       31. SETTINGS ACTIONS
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


        if (
            exportButton
        ) {

            exportButton.addEventListener(
                "click",
                () => {

                    this.exportBudgetData();

                }
            );

        }


        if (
            clearButton
        ) {

            clearButton.addEventListener(
                "click",
                () => {

                    this.resetBudgetData();

                }
            );

        }

    },


    /* =====================================================
       32. EXPORT M-WALLET DATA
       ===================================================== */

    exportBudgetData() {

        const storage =
            this.getStorage();


        if (!storage) {
            return;
        }


        const json =
            storage.exportData();


        const blob =
            new Blob(
                [
                    json
                ],
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
            `m-wallet-${this.getTodayKey()}.json`;


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
       33. RESET M-WALLET DATA
       ===================================================== */

    resetBudgetData() {

        const storage =
            this.getStorage();


        if (!storage) {
            return;
        }


        const confirmed =
            window.confirm(
                "Reset all M-Wallet data? This cannot be undone."
            );


        if (
            !confirmed
        ) {

            return;

        }


        storage.clearAllData();


        this.refresh();

    }

};


/* =========================================================
   34. EXPOSE APP GLOBALLY
   ========================================================= */

window.BudgetApp =
    BudgetApp;


window.MWalletApp =
    BudgetApp;


/* =========================================================
   35. START APP
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