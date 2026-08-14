/* =========================================================
   M-WALLET
   Main Application / Rendering
   app.js

   Reports + Savings Upgrade
   ========================================================= */

const BudgetApp = {

    initialized: false,
    reportsInitialized: false,


    /* =====================================================
       1. STORAGE
       ===================================================== */

    getStorage() {
        return (
            window.MWalletStorage ||
            window.BudgetStorage ||
            null
        );
    },


    /* =====================================================
       2. INITIALIZE
       ===================================================== */

    init() {

        if (this.initialized) {
            return;
        }

        const storage = this.getStorage();

        if (!storage) {
            console.error(
                "M-Wallet storage is not available. Make sure storage.js loads before app.js."
            );
            return;
        }

        this.initialized = true;

        this.bindEvents();
        this.initializeReports();
        this.refresh();

        console.log(
            "M-Wallet app loaded - Reports + Savings system ready."
        );
    },


    /* =====================================================
       3. EVENTS
       ===================================================== */

    bindEvents() {

        const storage = this.getStorage();

        const monthSelect =
            document.getElementById("month-select");

        const yearSelect =
            document.getElementById("year-select");


        if (monthSelect) {
            monthSelect.addEventListener(
                "change",
                () => this.refresh()
            );
        }


        if (yearSelect) {
            yearSelect.addEventListener(
                "change",
                () => this.refresh()
            );
        }


        [
            "previous-month",
            "next-month",
            "today-month"
        ].forEach(buttonId => {

            const button =
                document.getElementById(buttonId);

            if (!button) {
                return;
            }

            button.addEventListener(
                "click",
                () => {
                    window.setTimeout(
                        () => this.refresh(),
                        0
                    );
                }
            );
        });


        [
            "budget:money-saved",
            "mwallet:money-saved",
            "mwallet:income-updated",
            "mwallet:income-deleted",
            "mwallet:expense-updated",
            "mwallet:expense-deleted",
            "mwallet:savings-updated",
            "mwallet:savings-goal-updated",
            "mwallet:savings-goal-deleted",
            "budget:month-changed",
            "mwallet:month-changed"
        ].forEach(eventName => {

            document.addEventListener(
                eventName,
                () => this.refresh()
            );
        });


        document.addEventListener(
            "mwallet:page-changed",
            event => {

                if (
                    event.detail?.page ===
                    "reports"
                ) {
                    this.renderReports();
                }

                if (
                    event.detail?.page ===
                    "savings"
                ) {
                    const monthKey =
                        storage.getSelectedMonthKey();

                    const snapshot =
                        storage.getMonthSnapshot(
                            monthKey
                        );

                    this.renderSavings(
                        snapshot
                    );
                }
            }
        );


        document.addEventListener(
            "mwallet:report-type-changed",
            () => {

                this.updateReportControlVisibility();
                this.renderReports();
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
       4. REFRESH APP
       ===================================================== */

    refresh() {

        const storage = this.getStorage();

        if (!storage) {
            return;
        }

        try {

            const monthKey =
                storage.getSelectedMonthKey();

            const snapshot =
                storage.getMonthSnapshot(
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

            this.renderReports();


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
       5. CURRENT MONTH TITLE
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
       6. DASHBOARD
       ===================================================== */

    renderDashboard(snapshot) {

        const summary =
            snapshot.summary || {};


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
       7. UPCOMING BILLS
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
            storage.getCurrentMonthKey();

        const today =
            this.getTodayKey();


        const bills =
            [...(snapshot.bills || [])]
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
       8. NEXT INCOME
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
                    item => item.date
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
                        item.date >= today
                );
        }


        const nextIncome =
            income[0];


        if (!nextIncome) {

            dateElement.textContent =
                "—";

            amountElement.textContent =
                this.formatCurrency(0);

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
       9. DASHBOARD SAVINGS
       ===================================================== */

    renderDashboardSavings(snapshot) {

        const container =
            document.getElementById(
                "savings-overview"
            );


        if (!container) {
            return;
        }


        const storage =
            this.getStorage();


        const generalSavings =
            typeof storage?.getSavingsBalance ===
                "function"
                ? storage.getSavingsBalance()
                : (
                    Number(
                        snapshot.generalSavingsBalance
                    ) || 0
                );


        const goals =
            Array.isArray(
                snapshot.savingsGoals
            )
                ? snapshot.savingsGoals
                    .slice(
                        0,
                        3
                    )
                : [];


        if (
            goals.length === 0
        ) {

            if (
                generalSavings > 0
            ) {

                container.innerHTML = `
                    <article class="savings-goal-card">

                        <div class="savings-goal-header">

                            <span>
                                General Savings
                            </span>

                            <strong>
                                ${this.formatCurrency(
                                    generalSavings
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
                        goal,
                        false
                    )
            ).join("");
    },


    /* =====================================================
       10. MONTHLY BUDGET
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
                ? storage.getMonthlyIncomeTotal(
                    snapshot.monthKey
                )
                : 0;


        const yearlyIncome =
            typeof storage
                .getYearlyIncomeTotal ===
                "function"
                ? storage.getYearlyIncomeTotal(
                    selectedYear
                )
                : 0;


        const monthlyExpenses =
            typeof storage
                .getMonthlyExpenseTotal ===
                "function"
                ? storage.getMonthlyExpenseTotal(
                    snapshot.monthKey
                )
                : 0;


        const yearlyExpenses =
            typeof storage
                .getYearlyExpenseTotal ===
                "function"
                ? storage.getYearlyExpenseTotal(
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
            snapshot.bills || [],
            snapshot.monthKey
        );

        this.renderExpenseTable(
            snapshot.expenses || []
        );
    },


    /* =====================================================
       11. INCOME TABLE
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
       12. INCOME FREQUENCY
       ===================================================== */

    formatIncomeFrequency(income) {

        if (!income.recurring) {
            return "One-time";
        }


        switch (income.frequency) {

            case "weekly":
                return "Weekly";

            case "biweekly":
                return "Biweekly";

            case "twice-monthly":
                return "Twice Monthly";

            case "monthly":
                return "Monthly";

            case "custom":
                return this.formatCustomFrequency(
                    income
                );

            default:
                return "Recurring";
        }
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
                                        >
                                            Edit
                                        </button>

                                        <button
                                            type="button"
                                            class="text-button money-negative"
                                            data-expense-delete="${this.escapeHTML(
                                                expenseId
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
       14. EXPENSE FREQUENCY
       ===================================================== */

    formatExpenseFrequency(expense) {

        if (!expense.recurring) {
            return "One-time";
        }


        switch (expense.frequency) {

            case "weekly":
                return "Weekly";

            case "biweekly":
                return "Biweekly";

            case "monthly":
                return "Monthly";

            case "yearly":
                return "Yearly";

            case "custom":
                return this.formatCustomFrequency(
                    expense
                );

            default:
                return "Recurring";
        }
    },


    /* =====================================================
       15. CUSTOM FREQUENCY
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
       16. BILL TABLE
       ===================================================== */

    renderBillTable(
        bills,
        monthKey
    ) {

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
                    <th>Status</th>
                    <th>Repeats</th>
                    <th>Actions</th>

                </tr>

            </thead>


            <tbody>

                ${sorted.map(bill => {

                    const billId =
                        this.escapeHTML(
                            bill.id || ""
                        );


                    const safeMonthKey =
                        this.escapeHTML(
                            monthKey || ""
                        );


                    const isPaid =
                        Boolean(
                            bill.paid
                        );


                    return `

                        <tr>

                            <td>

                                <strong>
                                    ${this.escapeHTML(
                                        bill.name ||
                                        "Bill"
                                    )}
                                </strong>

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

                                <span class="
                                    bill-status
                                    ${isPaid
                                        ? "paid"
                                        : "unpaid"}
                                ">

                                    ${isPaid
                                        ? "Paid"
                                        : "Unpaid"}

                                </span>

                            </td>


                            <td>

                                ${bill.recurring
                                    ? "Yes"
                                    : "No"}

                            </td>


                            <td>

                                <div class="income-actions bill-actions">

                                    <button
                                        type="button"
                                        class="text-button"
                                        data-bill-paid="${billId}"
                                        data-bill-month="${safeMonthKey}"
                                    >

                                        ${isPaid
                                            ? "Mark Unpaid"
                                            : "Mark Paid"}

                                    </button>


                                    <button
                                        type="button"
                                        class="text-button"
                                        data-bill-edit="${billId}"
                                        data-bill-month="${safeMonthKey}"
                                    >
                                        Edit
                                    </button>


                                    <button
                                        type="button"
                                        class="text-button money-negative"
                                        data-bill-delete="${billId}"
                                        data-bill-month="${safeMonthKey}"
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
       17. TRANSACTIONS / ACTIVITY
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

                                    ${
                                        transaction.date
                                            ? ` · ${this.formatDate(
                                                transaction.date
                                            )}`
                                            : ""
                                    }

                                </span>

                            </div>

                            <div class="
                                transaction-amount
                                ${
                                    isIncome
                                        ? "income"
                                        : "expense"
                                }
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
       18. TRANSACTION ICON
       ===================================================== */

    getTransactionIcon(transaction) {

        switch (
            transaction.sourceType
        ) {

            case "income":
            case "paycheck":
                return "💵";

            case "bill":
                return "🧾";

            case "expense":
                return "🛒";

            case "savings-deposit":

                if (
                    transaction.direction ===
                    "savings-to-checking"
                ) {
                    return "↩";
                }

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
       19. TRANSACTION SUBTITLE
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

            const parts = [];

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

            if (
                transaction.direction ===
                "savings-to-checking"
            ) {

                return (
                    "General Savings → Checking"
                );
            }


            if (
                transaction.direction ===
                "checking-to-goal"
            ) {

                return (
                    "Checking → Savings Fund"
                );
            }


            return (
                "Checking → General Savings"
            );
        }


        if (
            transaction.sourceType ===
            "expense"
        ) {

            const parts = [];


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
       20. SAVINGS PAGE
       ===================================================== */

    renderSavings(snapshot) {

        const storage =
            this.getStorage();


        if (!storage) {
            return;
        }


        const goals =
            Array.isArray(
                snapshot.savingsGoals
            )
                ? snapshot.savingsGoals
                : [];


        const generalSavings =
            typeof storage
                .getSavingsBalance ===
                "function"
                ? storage.getSavingsBalance()
                : (
                    Number(
                        snapshot.generalSavingsBalance
                    ) || 0
                );


        const allocatedSavings =
            typeof storage
                .getAllocatedSavingsTotal ===
                "function"
                ? storage.getAllocatedSavingsTotal()
                : goals.reduce(
                    (total, goal) =>
                        total +
                        (
                            Number(
                                goal.currentAmount
                            ) || 0
                        ),
                    0
                );


        const totalSavings =
            typeof storage
                .getTotalSavingsBalance ===
                "function"
                ? storage.getTotalSavingsBalance()
                : (
                    generalSavings +
                    allocatedSavings
                );


        /*
            Main savings balance now means
            GENERAL SAVINGS only.
        */

        this.setMoneyText(
            "savings-balance",
            generalSavings
        );


        /*
            These IDs are used by the upgraded
            Savings HTML when present.
        */

        this.setMoneyText(
            "savings-general-balance",
            generalSavings
        );

        this.setMoneyText(
            "savings-allocated-balance",
            allocatedSavings
        );

        this.setMoneyText(
            "savings-total-balance",
            totalSavings
        );


        const container =
            document.getElementById(
                "savings-goals"
            );


        if (!container) {
            return;
        }


        if (
            goals.length === 0
        ) {

            container.innerHTML = `
                <div class="savings-empty-state">

                    <p class="empty-message">
                        No savings goals created.
                    </p>

                    <button
                        type="button"
                        class="primary-button"
                        data-money-action="savings-goal"
                    >
                        + Create Savings Goal
                    </button>

                </div>
            `;

            return;
        }


        container.innerHTML =
            goals.map(
                goal =>
                    this.createSavingsGoalHTML(
                        goal,
                        true
                    )
            ).join("");
    },


    /* =====================================================
       21. SAVINGS GOAL CARD
       ===================================================== */

    createSavingsGoalHTML(
        goal,
        showActions = true
    ) {

        const target =
            Number(
                goal.targetAmount
            ) || 0;


        const current =
            Number(
                goal.currentAmount
            ) || 0;


        const remaining =
            Math.max(
                target - current,
                0
            );


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


        const goalId =
            this.escapeHTML(
                goal.id ||
                ""
            );


        const completed =
            target > 0 &&
            current >= target;


        return `
            <article class="
                savings-goal-card
                ${
                    completed
                        ? "completed"
                        : ""
                }
            ">

                <div class="savings-goal-header">

                    <div class="savings-goal-title">

                        <strong>
                            ${this.escapeHTML(
                                goal.name ||
                                "Savings Goal"
                            )}
                        </strong>

                        ${
                            completed
                                ? `
                                    <span class="savings-goal-complete">
                                        ✓ Goal Complete
                                    </span>
                                `
                                : `
                                    <span>
                                        ${this.formatCurrency(
                                            remaining
                                        )}
                                        still needed
                                    </span>
                                `
                        }

                    </div>

                    <div class="savings-goal-amount">

                        <strong>
                            ${this.formatCurrency(
                                current
                            )}
                        </strong>

                        <span>
                            of
                            ${this.formatCurrency(
                                target
                            )}
                        </span>

                    </div>

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


                <div class="savings-goal-progress-details">

                    <span>
                        ${percent.toFixed(0)}% funded
                    </span>

                    <span>
                        ${this.formatCurrency(
                            remaining
                        )}
                        remaining
                    </span>

                </div>


                ${
                    goal.targetDate
                        ? `
                            <div class="savings-goal-target-date">
                                Target:
                                ${this.formatDate(
                                    goal.targetDate
                                )}
                            </div>
                        `
                        : ""
                }


                ${
                    goal.notes
                        ? `
                            <p class="savings-goal-notes">
                                ${this.escapeHTML(
                                    goal.notes
                                )}
                            </p>
                        `
                        : ""
                }


                ${
                    showActions
                        ? `
                            <div class="savings-goal-actions">

                                <button
                                    type="button"
                                    class="savings-action-button allocate"
                                    data-savings-allocate="${goalId}"
                                >
                                    + Allocate
                                </button>

                                <button
                                    type="button"
                                    class="savings-action-button release"
                                    data-savings-release="${goalId}"
                                    ${
                                        current <= 0
                                            ? "disabled"
                                            : ""
                                    }
                                >
                                    ↩ Return
                                </button>

                                <button
                                    type="button"
                                    class="savings-action-button edit"
                                    data-savings-goal-edit="${goalId}"
                                >
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    class="savings-action-button delete"
                                    data-savings-goal-delete="${goalId}"
                                >
                                    Delete
                                </button>

                            </div>
                        `
                        : ""
                }

            </article>
        `;
    },


    /* =====================================================
       22. CALCULATE OVERALL SAVINGS
       ===================================================== */

    calculateOverallSavings() {

        const storage =
            this.getStorage();


        if (!storage) {
            return 0;
        }


        if (
            typeof storage
                .getTotalSavingsBalance ===
                "function"
        ) {

            return (
                Number(
                    storage.getTotalSavingsBalance()
                ) || 0
            );
        }


        const data =
            storage.load();


        const goals =
            Array.isArray(
                data.savingsGoals
            )
                ? data.savingsGoals
                : [];


        const goalTotal =
            goals.reduce(
                (total, goal) =>
                    total +
                    (
                        Number(
                            goal.currentAmount
                        ) || 0
                    ),
                0
            );


        const generalSavings =
            Number(
                data.accounts
                    ?.savings
                    ?.balance
            ) || 0;


        return (
            generalSavings +
            goalTotal
        );
    },


    /* =====================================================
       23. REPORTS INITIALIZATION
       ===================================================== */

    initializeReports() {

        if (
            this.reportsInitialized
        ) {
            return;
        }


        const reportTypeSelect =
            document.getElementById(
                "report-type-select"
            );


        if (!reportTypeSelect) {
            return;
        }


        this.reportsInitialized =
            true;


        this.populateReportYearSelectors();


        const today =
            new Date();


        const currentYear =
            String(
                today.getFullYear()
            );


        const currentMonth =
            String(
                today.getMonth() + 1
            ).padStart(
                2,
                "0"
            );


        const monthlyMonth =
            document.getElementById(
                "report-month-select"
            );

        const monthlyYear =
            document.getElementById(
                "report-month-year-select"
            );

        const yearlyYear =
            document.getElementById(
                "report-year-select"
            );

        const startMonth =
            document.getElementById(
                "report-start-month-select"
            );

        const startYear =
            document.getElementById(
                "report-start-year-select"
            );

        const endMonth =
            document.getElementById(
                "report-end-month-select"
            );

        const endYear =
            document.getElementById(
                "report-end-year-select"
            );


        reportTypeSelect.value =
            reportTypeSelect.value ||
            "monthly";


        if (monthlyMonth) {
            monthlyMonth.value =
                currentMonth;
        }


        if (monthlyYear) {
            monthlyYear.value =
                currentYear;
        }


        if (yearlyYear) {
            yearlyYear.value =
                currentYear;
        }


        if (startMonth) {
            startMonth.value =
                "01";
        }


        if (startYear) {
            startYear.value =
                currentYear;
        }


        if (endMonth) {
            endMonth.value =
                currentMonth;
        }


        if (endYear) {
            endYear.value =
                currentYear;
        }


        [
            monthlyMonth,
            monthlyYear,
            yearlyYear,
            startMonth,
            startYear,
            endMonth,
            endYear
        ].forEach(control => {

            if (!control) {
                return;
            }


            control.addEventListener(
                "change",
                () => this.renderReports()
            );
        });


        this.updateReportControlVisibility();
    },


    /* =====================================================
       24. REPORT YEARS
       ===================================================== */

    getAvailableReportYears() {

        const storage =
            this.getStorage();


        const currentYear =
            new Date()
                .getFullYear();


        const years =
            new Set();


        for (
            let year =
                currentYear - 10;

            year <=
                currentYear + 10;

            year++
        ) {
            years.add(year);
        }


        if (!storage) {
            return Array.from(
                years
            ).sort(
                (a, b) =>
                    a - b
            );
        }


        try {

            const data =
                storage.load();


            Object.keys(
                data.months || {}
            ).forEach(monthKey => {

                const year =
                    Number(
                        monthKey
                            .split("-")[0]
                    );


                if (
                    Number.isFinite(
                        year
                    )
                ) {
                    years.add(year);
                }
            });


            [
                ...(data.income || []),
                ...(data.expenses || [])
            ].forEach(item => {

                if (!item.date) {
                    return;
                }


                const year =
                    Number(
                        String(
                            item.date
                        ).slice(
                            0,
                            4
                        )
                    );


                if (
                    Number.isFinite(
                        year
                    )
                ) {
                    years.add(year);
                }
            });

        }

        catch (error) {

            console.warn(
                "M-Wallet could not read years for Reports:",
                error
            );
        }


        return Array.from(
            years
        ).sort(
            (a, b) =>
                a - b
        );
    },


    /* =====================================================
       25. REPORT YEAR SELECTORS
       ===================================================== */

    populateReportYearSelectors() {

        const selectors = [

            document.getElementById(
                "report-month-year-select"
            ),

            document.getElementById(
                "report-year-select"
            ),

            document.getElementById(
                "report-start-year-select"
            ),

            document.getElementById(
                "report-end-year-select"
            )
        ];


        const years =
            this.getAvailableReportYears();


        selectors.forEach(
            selector => {

                if (!selector) {
                    return;
                }


                const existingValue =
                    selector.value;


                selector.innerHTML =
                    "";


                years.forEach(year => {

                    const option =
                        document.createElement(
                            "option"
                        );


                    option.value =
                        String(year);

                    option.textContent =
                        String(year);


                    selector.appendChild(
                        option
                    );
                });


                if (
                    existingValue &&
                    years.includes(
                        Number(
                            existingValue
                        )
                    )
                ) {
                    selector.value =
                        existingValue;
                }
            }
        );
    },


    /* =====================================================
       26. REPORT CONTROL VISIBILITY
       ===================================================== */

    updateReportControlVisibility() {

        const reportTypeSelect =
            document.getElementById(
                "report-type-select"
            );


        const monthlyControls =
            document.getElementById(
                "report-monthly-controls"
            );


        const yearlyControls =
            document.getElementById(
                "report-yearly-controls"
            );


        const rangeControls =
            document.getElementById(
                "report-range-controls"
            );


        const description =
            document.getElementById(
                "report-control-description"
            );


        if (!reportTypeSelect) {
            return;
        }


        const reportType =
            reportTypeSelect.value ||
            "monthly";


        if (monthlyControls) {
            monthlyControls.hidden =
                reportType !==
                "monthly";
        }


        if (yearlyControls) {
            yearlyControls.hidden =
                reportType !==
                "yearly";
        }


        if (rangeControls) {
            rangeControls.hidden =
                reportType !==
                "range";
        }


        if (!description) {
            return;
        }


        switch (reportType) {

            case "yearly":

                description.textContent =
                    "Choose the year you want to review.";

                break;


            case "range":

                description.textContent =
                    "Choose a starting month and ending month for your report.";

                break;


            default:

                description.textContent =
                    "Choose the month and year you want to review.";

                break;
        }
    },


    /* =====================================================
       27. REPORT SELECTION
       ===================================================== */

    getReportSelection() {

        const reportTypeSelect =
            document.getElementById(
                "report-type-select"
            );


        if (!reportTypeSelect) {
            return null;
        }


        const reportType =
            reportTypeSelect.value ||
            "monthly";


        if (
            reportType ===
            "yearly"
        ) {

            const year =
                document.getElementById(
                    "report-year-select"
                )?.value;


            if (!year) {
                return null;
            }


            return {
                type:
                    "yearly",
                year
            };
        }


        if (
            reportType ===
            "range"
        ) {

            const startMonth =
                document.getElementById(
                    "report-start-month-select"
                )?.value;

            const startYear =
                document.getElementById(
                    "report-start-year-select"
                )?.value;

            const endMonth =
                document.getElementById(
                    "report-end-month-select"
                )?.value;

            const endYear =
                document.getElementById(
                    "report-end-year-select"
                )?.value;


            if (
                !startMonth ||
                !startYear ||
                !endMonth ||
                !endYear
            ) {
                return null;
            }


            let startKey =
                `${startYear}-${startMonth}`;

            let endKey =
                `${endYear}-${endMonth}`;


            if (
                startKey > endKey
            ) {

                const temp =
                    startKey;

                startKey =
                    endKey;

                endKey =
                    temp;
            }


            return {
                type:
                    "range",
                startKey,
                endKey
            };
        }


        const month =
            document.getElementById(
                "report-month-select"
            )?.value;

        const year =
            document.getElementById(
                "report-month-year-select"
            )?.value;


        if (
            !month ||
            !year
        ) {
            return null;
        }


        return {
            type:
                "monthly",
            month,
            year,
            monthKey:
                `${year}-${month}`
        };
    },


    /* =====================================================
       28. REPORT MONTH KEYS
       ===================================================== */

    getReportMonthKeys(selection) {

        if (!selection) {
            return [];
        }


        if (
            selection.type ===
            "monthly"
        ) {

            return [
                selection.monthKey
            ];
        }


        if (
            selection.type ===
            "yearly"
        ) {

            const keys = [];


            for (
                let month = 1;
                month <= 12;
                month++
            ) {

                keys.push(
                    `${selection.year}-${String(
                        month
                    ).padStart(
                        2,
                        "0"
                    )}`
                );
            }


            return keys;
        }


        if (
            selection.type ===
            "range"
        ) {

            return this.buildMonthRange(
                selection.startKey,
                selection.endKey
            );
        }


        return [];
    },


    /* =====================================================
       29. BUILD MONTH RANGE
       ===================================================== */

    buildMonthRange(
        startKey,
        endKey
    ) {

        const results = [];


        const [
            startYearValue,
            startMonthValue
        ] =
            String(
                startKey
            ).split("-");


        const [
            endYearValue,
            endMonthValue
        ] =
            String(
                endKey
            ).split("-");


        let year =
            Number(
                startYearValue
            );

        let month =
            Number(
                startMonthValue
            );


        const endYear =
            Number(
                endYearValue
            );

        const endMonth =
            Number(
                endMonthValue
            );


        let safety = 0;


        while (
            (
                year < endYear ||
                (
                    year === endYear &&
                    month <= endMonth
                )
            )
            &&
            safety < 600
        ) {

            results.push(
                `${year}-${String(
                    month
                ).padStart(
                    2,
                    "0"
                )}`
            );


            month += 1;


            if (
                month > 12
            ) {

                month = 1;
                year += 1;
            }


            safety += 1;
        }


        return results;
    },


    /* =====================================================
       30. RENDER REPORTS
       ===================================================== */

    renderReports() {

        const storage =
            this.getStorage();

        const reportsPage =
            document.getElementById(
                "reports-page"
            );


        if (
            !storage ||
            !reportsPage
        ) {
            return;
        }


        if (
            !this.reportsInitialized
        ) {
            this.initializeReports();
        }


        this.updateReportControlVisibility();


        const selection =
            this.getReportSelection();


        if (!selection) {
            return;
        }


        const monthKeys =
            this.getReportMonthKeys(
                selection
            );


        const reportData =
            this.collectReportData(
                monthKeys
            );


        this.renderReportPeriodLabel(
            selection
        );


        this.setMoneyText(
            "report-total-income",
            reportData.income
        );

        this.setMoneyText(
            "report-total-bills",
            reportData.bills
        );

        this.setMoneyText(
            "report-total-expenses",
            reportData.expenses
        );

        this.setMoneyText(
            "report-total-savings",
            reportData.savings
        );

        this.setMoneyText(
            "report-net-remaining",
            reportData.net
        );


        this.renderReportOverview(
            reportData
        );


        this.renderReportBreakdown(
            "report-category-breakdown",
            reportData.categories,
            "No categorized expenses in this report."
        );


        this.renderReportBreakdown(
            "report-merchant-breakdown",
            reportData.merchants,
            "No merchant spending in this report."
        );
    },


    /* =====================================================
       31. COLLECT REPORT DATA
       ===================================================== */

    collectReportData(monthKeys) {

        const storage =
            this.getStorage();


        const reportData = {

            income:
                0,

            bills:
                0,

            expenses:
                0,

            /*
                Signed savings flow:

                positive = net money moved
                           Checking → Savings

                negative = net money moved
                           Savings → Checking
            */

            savings:
                0,

            savingsDeposited:
                0,

            savingsWithdrawn:
                0,

            net:
                0,

            categories:
                {},

            merchants:
                {}
        };


        if (
            !storage ||
            !Array.isArray(
                monthKeys
            )
        ) {
            return reportData;
        }


        monthKeys.forEach(
            monthKey => {

                try {

                    const snapshot =
                        storage.getMonthSnapshot(
                            monthKey
                        );


                    const summary =
                        snapshot.summary ||
                        {};


                    reportData.income +=
                        Number(
                            summary.income
                        ) || 0;


                    reportData.bills +=
                        Math.abs(
                            Number(
                                summary.bills
                            ) || 0
                        );


                    reportData.expenses +=
                        Math.abs(
                            Number(
                                summary.expenses
                            ) || 0
                        );


                    /*
                        IMPORTANT:
                        Do NOT use Math.abs(summary.savings).

                        A withdrawal is negative savings flow
                        and must increase Checking rather than
                        pretending that more money was saved.
                    */

                    const savingsFlow =
                        Number(
                            summary.savings
                        ) || 0;


                    reportData.savings +=
                        savingsFlow;


                    const savingsDeposits =
                        Array.isArray(
                            snapshot.savingsDeposits
                        )
                            ? snapshot.savingsDeposits
                            : [];


                    savingsDeposits.forEach(
                        transfer => {

                            const amount =
                                Number(
                                    transfer.amount
                                ) || 0;


                            if (
                                amount > 0
                            ) {

                                reportData
                                    .savingsDeposited +=
                                    amount;
                            }


                            if (
                                amount < 0
                            ) {

                                reportData
                                    .savingsWithdrawn +=
                                    Math.abs(
                                        amount
                                    );
                            }
                        }
                    );


                    const expenses =
                        Array.isArray(
                            snapshot.expenses
                        )
                            ? snapshot.expenses
                            : [];


                    expenses.forEach(
                        expense => {

                            const amount =
                                Math.abs(
                                    Number(
                                        expense.amount
                                    ) || 0
                                );


                            if (
                                amount <= 0
                            ) {
                                return;
                            }


                            const category =
                                String(
                                    expense.category ||
                                    "Other"
                                ).trim()
                                ||
                                "Other";


                            const merchant =
                                String(
                                    expense.merchant ||
                                    "Unassigned"
                                ).trim()
                                ||
                                "Unassigned";


                            reportData.categories[
                                category
                            ] =
                                (
                                    reportData.categories[
                                        category
                                    ] || 0
                                )
                                +
                                amount;


                            reportData.merchants[
                                merchant
                            ] =
                                (
                                    reportData.merchants[
                                        merchant
                                    ] || 0
                                )
                                +
                                amount;
                        }
                    );

                }

                catch (error) {

                    console.warn(
                        `Could not include ${monthKey} in report:`,
                        error
                    );
                }
            }
        );


        reportData.net =
            reportData.income
            -
            reportData.bills
            -
            reportData.expenses
            -
            reportData.savings;


        return reportData;
    },


    /* =====================================================
       32. REPORT PERIOD LABEL
       ===================================================== */

    renderReportPeriodLabel(
        selection
    ) {

        const label =
            document.getElementById(
                "report-period-label"
            );


        if (
            !label ||
            !selection
        ) {
            return;
        }


        if (
            selection.type ===
            "yearly"
        ) {

            label.textContent =
                selection.year;

            return;
        }


        if (
            selection.type ===
            "range"
        ) {

            label.textContent =
                (
                    `${this.formatMonthKey(
                        selection.startKey
                    )} – ` +
                    `${this.formatMonthKey(
                        selection.endKey
                    )}`
                );

            return;
        }


        label.textContent =
            this.formatMonthKey(
                selection.monthKey
            );
    },


    /* =====================================================
       33. FORMAT MONTH KEY
       ===================================================== */

    formatMonthKey(monthKey) {

        if (!monthKey) {
            return "—";
        }


        const [
            yearValue,
            monthValue
        ] =
            String(
                monthKey
            ).split("-");


        const year =
            Number(
                yearValue
            );

        const month =
            Number(
                monthValue
            );


        if (
            !Number.isFinite(year) ||
            !Number.isFinite(month)
        ) {

            return String(
                monthKey
            );
        }


        const date =
            new Date(
                year,
                month - 1,
                1
            );


        return new Intl.DateTimeFormat(
            "en-US",
            {
                month:
                    "long",
                year:
                    "numeric"
            }
        ).format(
            date
        );
    },


    /* =====================================================
       34. REPORT OVERVIEW
       ===================================================== */

    renderReportOverview(reportData) {

        const container =
            document.getElementById(
                "report-overview-chart"
            );


        if (!container) {
            return;
        }


        const values = [

            {
                label:
                    "Income",
                value:
                    reportData.income,
                className:
                    "income"
            },

            {
                label:
                    "Bills",
                value:
                    reportData.bills,
                className:
                    "bills"
            },

            {
                label:
                    "Expenses",
                value:
                    reportData.expenses,
                className:
                    "expenses"
            },

            {
                label:
                    reportData.savings < 0
                        ? "Net Savings Withdrawal"
                        : "Net Savings",

                value:
                    reportData.savings,

                className:
                    "savings"
            }
        ];


        const maximum =
            Math.max(
                ...values.map(
                    item =>
                        Math.abs(
                            Number(
                                item.value
                            ) || 0
                        )
                ),
                1
            );


        container.innerHTML = `
            <div class="report-overview-bars">

                ${values.map(item => {

                    const amount =
                        Number(
                            item.value
                        ) || 0;


                    const absoluteAmount =
                        Math.abs(
                            amount
                        );


                    const percent =
                        Math.min(
                            (
                                absoluteAmount /
                                maximum
                            ) * 100,
                            100
                        );


                    return `
                        <article class="report-overview-row">

                            <div class="report-overview-row-header">

                                <span>
                                    ${this.escapeHTML(
                                        item.label
                                    )}
                                </span>

                                <strong>
                                    ${this.formatCurrency(
                                        amount
                                    )}
                                </strong>

                            </div>

                            <div class="report-overview-track">

                                <div
                                    class="
                                        report-overview-fill
                                        ${this.escapeHTML(
                                            item.className
                                        )}
                                    "
                                    style="width: ${percent}%"
                                ></div>

                            </div>

                        </article>
                    `;

                }).join("")}

            </div>
        `;
    },


    /* =====================================================
       35. REPORT BREAKDOWN
       ===================================================== */

    renderReportBreakdown(
        containerId,
        breakdown,
        emptyMessage
    ) {

        const container =
            document.getElementById(
                containerId
            );


        if (!container) {
            return;
        }


        const entries =
            Object.entries(
                breakdown || {}
            )
                .filter(
                    ([
                        ,
                        amount
                    ]) =>
                        Number(amount) > 0
                )
                .sort(
                    (first, second) =>
                        Number(
                            second[1]
                        )
                        -
                        Number(
                            first[1]
                        )
                );


        if (
            entries.length === 0
        ) {

            container.innerHTML = `
                <p class="empty-message">
                    ${this.escapeHTML(
                        emptyMessage
                    )}
                </p>
            `;

            return;
        }


        const total =
            entries.reduce(
                (
                    sum,
                    [
                        ,
                        amount
                    ]
                ) =>
                    sum +
                    (
                        Number(amount) || 0
                    ),
                0
            );


        container.innerHTML = `
            <div class="report-breakdown-items">

                ${entries.map(
                    ([
                        name,
                        amount
                    ]) => {

                        const numericAmount =
                            Number(
                                amount
                            ) || 0;


                        const percent =
                            total > 0
                                ? (
                                    numericAmount /
                                    total
                                ) * 100
                                : 0;


                        return `
                            <article class="report-breakdown-item">

                                <div class="report-breakdown-header">

                                    <div>

                                        <strong>
                                            ${this.escapeHTML(
                                                name
                                            )}
                                        </strong>

                                        <span>
                                            ${percent.toFixed(1)}%
                                        </span>

                                    </div>

                                    <strong>
                                        ${this.formatCurrency(
                                            numericAmount
                                        )}
                                    </strong>

                                </div>

                                <div class="report-breakdown-track">

                                    <div
                                        class="report-breakdown-fill"
                                        style="width: ${Math.min(
                                            percent,
                                            100
                                        )}%"
                                    ></div>

                                </div>

                            </article>
                        `;
                    }
                ).join("")}

            </div>
        `;
    },


    /* =====================================================
       36. CURRENCY
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


        if (storage) {

            try {

                const data =
                    storage.load();


                currency =
                    data.settings
                        ?.currency
                    ||
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
       37. SIGNED CURRENCY
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
       38. DATE FORMAT
       ===================================================== */

    formatDate(dateValue) {

        if (!dateValue) {
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
       39. DATE COMPARISON
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
       40. TODAY KEY
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
       41. SET MONEY TEXT
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
       42. ESCAPE HTML
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
       43. SETTINGS
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
                () =>
                    this.exportBudgetData()
            );
        }


        if (clearButton) {

            clearButton.addEventListener(
                "click",
                () =>
                    this.resetBudgetData()
            );
        }
    },


    /* =====================================================
       44. EXPORT DATA
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
       45. RESET DATA
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


        if (!confirmed) {
            return;
        }


        storage.clearAllData();

        this.refresh();
    }

};


/* =========================================================
   46. EXPOSE APP
   ========================================================= */

window.BudgetApp =
    BudgetApp;

window.MWalletApp =
    BudgetApp;


/* =========================================================
   47. START APP
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