/* =========================================================
   M-WALLET
   Main Application / Rendering
   app.js

   Reports + Savings Upgrade
   UI Cleanup 2: Cleaner Dashboard + Activity
   ========================================================= */

const BudgetApp = {

    initialized: false,
    reportsInitialized: false,
    refreshQueued: false,


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

        if (
            window.MCash &&
            typeof window.MCash.init ===
                "function"
        ) {
            window.MCash.init();
        }

        this.bindEvents();
        this.initializeReports();
        this.refresh();

        console.log(
            "M-Wallet app loaded - cleaner Dashboard + Activity ready."
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

        [
            "budget:money-saved",
            "mwallet:money-saved",
            "mwallet:income-updated",
            "mwallet:income-deleted",
            "mwallet:bill-updated",
            "mwallet:bill-deleted",
            "mwallet:expense-updated",
            "mwallet:expense-deleted",
            "mwallet:savings-updated",
            "mwallet:savings-goal-updated",
            "mwallet:savings-goal-deleted"
        ].forEach(eventName => {

            document.addEventListener(
                eventName,
                () => this.queueRefresh()
            );
        });


        [
            "budget:month-changed",
            "mwallet:month-changed"
        ].forEach(eventName => {

            document.addEventListener(
                eventName,
                () => this.queueRefresh()
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
       5. QUEUE APP REFRESH
       ===================================================== */

    queueRefresh() {

        if (
            this.refreshQueued
        ) {
            return;
        }

        this.refreshQueued =
            true;

        window.setTimeout(
            () => {

                this.refreshQueued =
                    false;

                this.refresh();
            },
            0
        );
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


        /* ZG2 — Zevaryn Grid dashboard modules.
           Display-only; each derives from existing snapshot /
           storage state. No financial logic is added here. */

        this.renderDashboardPeriodLabel();

        this.renderDashboardOverview(
            snapshot
        );

        this.renderDashboardBudget(
            snapshot
        );

        this.renderDashboardBillsSummary(
            snapshot
        );

        this.renderDashboardRecent(
            snapshot
        );
    },


    /* =====================================================
       6a. ZG2 — DASHBOARD PERIOD LABEL
       ===================================================== */

    renderDashboardPeriodLabel() {

        const label =
            document.getElementById(
                "dashboard-period-label"
            );

        const title =
            document.getElementById(
                "current-month"
            );

        if (
            !label ||
            !title
        ) {
            return;
        }

        const text =
            String(
                title.textContent || ""
            ).trim();

        label.textContent =
            text || "the selected month";
    },


    /* =====================================================
       6b. ZG2 — M-CASH WALLET TOTAL
       Derives from the existing stored cash wallet. Returns a
       dollar amount (number). Safe when M-Cash is unavailable.
       ===================================================== */

    getMCashTotal() {

        const storage =
            this.getStorage();

        const cashStorage =
            window.MCashStorage;

        if (
            !storage ||
            !cashStorage ||
            typeof cashStorage.calculateTotalCashCents !== "function"
        ) {
            return 0;
        }

        try {

            /* Total physical cash = spendable wallet + Cash Savings
               allocation, mirroring how the Savings card shows the
               full balance including goal allocations. */
            const state =
                typeof storage.getCashState === "function"
                    ? storage.getCashState()
                    : {
                        wallet: storage.getCashWallet
                            ? storage.getCashWallet()
                            : { denominations: {} }
                    };

            const walletCents =
                cashStorage.calculateTotalCashCents(
                    state.wallet || { denominations: {} }
                );

            const savedCents =
                state.savings
                    ? cashStorage.calculateTotalCashCents(state.savings)
                    : 0;

            return (
                (Number(walletCents) || 0) +
                (Number(savedCents) || 0)
            ) / 100;

        }
        catch (error) {

            return 0;
        }
    },


    /* =====================================================
       6c. ZG2 — TOTAL BALANCE + ACCOUNT GRID
       ===================================================== */

    renderDashboardOverview(snapshot) {

        const storage =
            this.getStorage();

        const summary =
            snapshot.summary || {};


        const checking =
            Number(
                summary.endingBalance
            ) || 0;


        const savings =
            typeof storage?.getTotalSavingsBalance === "function"
                ? (
                    Number(
                        storage.getTotalSavingsBalance()
                    ) || 0
                )
                : (
                    Number(
                        snapshot.totalSavingsBalance
                    ) || 0
                );


        const mcash =
            this.getMCashTotal();


        this.setMoneyText(
            "dashboard-total-balance",
            checking + savings + mcash
        );

        this.setMoneyText(
            "dashboard-savings-balance",
            savings
        );

        this.setMoneyText(
            "dashboard-mcash-balance",
            mcash
        );


        const totalSub =
            document.getElementById(
                "dashboard-total-sub"
            );

        if (totalSub) {

            totalSub.innerHTML = `
                Checking <strong>${this.escapeHTML(
                    this.formatCurrency(checking)
                )}</strong>
                &nbsp;·&nbsp;
                Savings <strong>${this.escapeHTML(
                    this.formatCurrency(savings)
                )}</strong>
                &nbsp;·&nbsp;
                M-Cash <strong>${this.escapeHTML(
                    this.formatCurrency(mcash)
                )}</strong>
            `;
        }


        const savingsMeta =
            document.getElementById(
                "dashboard-savings-meta"
            );

        if (savingsMeta) {

            const goals =
                Array.isArray(
                    snapshot.savingsGoals
                )
                    ? snapshot.savingsGoals
                    : [];

            savingsMeta.textContent =
                goals.length === 0
                    ? "General savings"
                    : (
                        goals.length === 1
                            ? "1 savings fund"
                            : `${goals.length} savings funds`
                    );
        }
    },


    /* =====================================================
       6d. ZG2 — MONTHLY BUDGET SNAPSHOT
       income = monthly income · spent = bills + expenses
       ===================================================== */

    renderDashboardBudget(snapshot) {

        const body =
            document.getElementById(
                "dashboard-budget-body"
            );

        const card =
            document.getElementById(
                "dashboard-budget"
            );

        if (!body) {
            return;
        }


        const summary =
            snapshot.summary || {};


        const income =
            Number(summary.income) || 0;

        const spent =
            (Number(summary.bills) || 0) +
            (Number(summary.expenses) || 0);


        if (card) {
            card.classList.remove(
                "zg-budget--over"
            );
        }


        if (income <= 0) {

            body.innerHTML = `
                <p class="empty-message">
                    Add income to see your monthly budget.
                </p>
            `;

            return;
        }


        const remaining =
            income - spent;

        const rawPercent =
            (spent / income) * 100;

        const fillPercent =
            Math.max(
                0,
                Math.min(
                    100,
                    rawPercent
                )
            );

        const overBudget =
            spent > income;


        if (
            card &&
            overBudget
        ) {
            card.classList.add(
                "zg-budget--over"
            );
        }


        const footRight =
            overBudget
                ? `<strong>${this.escapeHTML(
                    this.formatCurrency(
                        Math.abs(remaining)
                    )
                )}</strong> over budget`
                : `<strong>${this.escapeHTML(
                    this.formatCurrency(remaining)
                )}</strong> remaining`;


        const barClass =
            overBudget
                ? "z-progress-bar z-progress-bar--warning"
                : "z-progress-bar z-progress-bar--teal";


        body.innerHTML = `
            <div class="zg-budget-figure">
                <span class="zg-budget-pct">${Math.round(rawPercent)}%</span>
                <span class="zg-budget-of">
                    ${this.escapeHTML(
                        this.formatCurrency(spent)
                    )}
                    of
                    ${this.escapeHTML(
                        this.formatCurrency(income)
                    )}
                </span>
            </div>

            <div
                class="z-progress"
                role="progressbar"
                aria-label="Monthly budget used"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(fillPercent)}"
            >
                <div
                    class="${barClass}"
                    style="width: ${fillPercent}%"
                ></div>
            </div>

            <p class="zg-budget-foot">
                <span>Spent this month</span>
                <span>${footRight}</span>
            </p>
        `;
    },


    /* =====================================================
       6e. ZG2 — BILLS DUE SUMMARY
       Aggregates the same unpaid bills the list already shows.
       ===================================================== */

    renderDashboardBillsSummary(snapshot) {

        const element =
            document.getElementById(
                "dashboard-bills-summary"
            );

        if (!element) {
            return;
        }


        const unpaid =
            (Array.isArray(snapshot.bills)
                ? snapshot.bills
                : []
            ).filter(
                bill => !bill.paid
            );


        if (unpaid.length === 0) {

            /* The list container already shows a single
               "No upcoming bills." empty state — keep one voice. */
            element.hidden = true;
            element.textContent = "";

            return;
        }

        element.hidden = false;


        const total =
            unpaid.reduce(
                (sum, bill) =>
                    sum +
                    Math.abs(
                        Number(bill.amount) || 0
                    ),
                0
            );


        const countText =
            unpaid.length === 1
                ? "1 bill due"
                : `${unpaid.length} bills due`;


        element.innerHTML = `
            ${this.escapeHTML(countText)}
            &nbsp;·&nbsp;
            <strong>${this.escapeHTML(
                this.formatCurrency(total)
            )}</strong> total
        `;
    },


    /* =====================================================
       6f. ZG2 — RECENT TRANSACTIONS
       Same ledger + row markup as the Activity page, capped.
       ===================================================== */

    renderDashboardRecent(snapshot) {

        const container =
            document.getElementById(
                "dashboard-recent-transactions"
            );

        if (!container) {
            return;
        }


        const transactions =
            (Array.isArray(snapshot.transactions)
                ? [...snapshot.transactions]
                : []
            ).sort(
                (first, second) => {

                    const dateOrder =
                        this.compareDates(
                            second.date,
                            first.date
                        );

                    if (dateOrder !== 0) {
                        return dateOrder;
                    }

                    return String(
                        second.createdAt || ""
                    ).localeCompare(
                        String(
                            first.createdAt || ""
                        )
                    );
                }
            ).slice(0, 5);


        if (transactions.length === 0) {

            container.innerHTML = `
                <p class="empty-message">
                    No recent transactions yet.
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
                    3
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


        const goals =
            Array.isArray(
                snapshot.savingsGoals
            )
                ? snapshot.savingsGoals
                : [];


        const generalSavings =
            typeof storage?.getSavingsBalance ===
                "function"
                ? (
                    Number(
                        storage.getSavingsBalance()
                    ) || 0
                )
                : (
                    Number(
                        snapshot.generalSavingsBalance
                    ) || 0
                );


        const allocatedSavings =
            typeof storage?.getAllocatedSavingsTotal ===
                "function"
                ? (
                    Number(
                        storage.getAllocatedSavingsTotal()
                    ) || 0
                )
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
            typeof storage?.getTotalSavingsBalance ===
                "function"
                ? (
                    Number(
                        storage.getTotalSavingsBalance()
                    ) || 0
                )
                : (
                    generalSavings +
                    allocatedSavings
                );


        if (
            totalSavings <= 0 &&
            goals.length === 0
        ) {

            container.innerHTML = `
                <p class="empty-message">
                    No savings yet.
                </p>
            `;

            return;
        }


        /*
            ZG2 — Zevaryn snapshot.

            Detailed goal cards and savings controls stay on the
            Savings page. Here we surface the one answer the
            account card can't: progress on the fund closest to
            being funded.
        */

        const trackedGoals =
            goals
                .map(goal => {

                    const targetAmount =
                        Number(goal.targetAmount) || 0;

                    const currentAmount =
                        Number(goal.currentAmount) || 0;

                    return {
                        goal,
                        targetAmount,
                        currentAmount,
                        ratio:
                            targetAmount > 0
                                ? currentAmount / targetAmount
                                : 0
                    };
                })
                .filter(
                    entry =>
                        entry.targetAmount > 0 &&
                        entry.currentAmount < entry.targetAmount
                )
                .sort(
                    (a, b) => b.ratio - a.ratio
                );


        if (trackedGoals.length === 0) {

            container.innerHTML = `
                <div class="zg-snap-line">
                    <span>Total saved</span>
                    <strong>${this.escapeHTML(
                        this.formatCurrency(totalSavings)
                    )}</strong>
                </div>
                <p class="zg-snap-note">
                    ${
                        goals.length === 0
                            ? "General savings only — add a fund to start tracking goals."
                            : "Every savings fund is fully funded."
                    }
                </p>
            `;

            return;
        }


        const top =
            trackedGoals[0];

        const percent =
            Math.max(
                0,
                Math.min(
                    100,
                    top.ratio * 100
                )
            );


        container.innerHTML = `
            <div class="zg-snap-line">
                <span>Next fund · ${this.escapeHTML(
                    top.goal.name || "Savings Fund"
                )}</span>
                <strong>${Math.round(percent)}%</strong>
            </div>

            <div
                class="z-progress"
                role="progressbar"
                aria-label="${this.escapeHTML(top.goal.name || "Savings Fund")} funding progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(percent)}"
            >
                <div
                    class="z-progress-bar z-progress-bar--teal"
                    style="width: ${percent}%"
                ></div>
            </div>

            <div class="zg-snap-sub">
                <span>${this.escapeHTML(
                    this.formatCurrency(top.currentAmount)
                )} of ${this.escapeHTML(
                    this.formatCurrency(top.targetAmount)
                )}</span>
                <span>${this.escapeHTML(
                    this.formatCurrency(totalSavings)
                )} total saved</span>
            </div>
        `;
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


        /* ZG3 — Zevaryn Grid Budget command-center modules.
           Display-only; every value derives from the snapshot /
           existing storage getters. */

        this.renderBudgetPeriodLabel();

        this.renderBudgetOverview(
            snapshot,
            {
                monthlyIncome,
                monthlyExpenses
            }
        );

        this.renderBudgetCategoryBreakdown(
            snapshot
        );

        this.renderBudgetBillsDue(
            snapshot
        );
    },


    /* =====================================================
       10a. ZG3 — BUDGET PERIOD LABEL
       ===================================================== */

    renderBudgetPeriodLabel() {

        const label =
            document.getElementById(
                "budget-period-label"
            );

        const title =
            document.getElementById(
                "current-month"
            );

        if (
            !label ||
            !title
        ) {
            return;
        }

        const text =
            String(
                title.textContent || ""
            ).trim();

        label.textContent =
            text || "this month";
    },


    /* =====================================================
       10b. ZG3 — BUDGET OVERVIEW + PROGRESS
       ===================================================== */

    renderBudgetOverview(snapshot, totals) {

        const summary =
            snapshot.summary || {};


        const income =
            Number(
                (totals && totals.monthlyIncome) ??
                summary.income
            ) || 0;

        const bills =
            Number(summary.bills) || 0;

        const expenses =
            Number(summary.expenses) || 0;

        const remaining =
            Number(summary.remaining);

        const spent =
            bills + expenses;


        this.setMoneyText(
            "budget-bills-total",
            bills
        );

        this.setMoneyText(
            "budget-remaining",
            Number.isFinite(remaining)
                ? remaining
                : income - spent
        );


        const body =
            document.getElementById(
                "budget-progress-body"
            );

        const card =
            document.getElementById(
                "budget-overview"
            );

        if (!body) {
            return;
        }


        if (card) {
            card.classList.remove(
                "zg-bov--warn",
                "zg-bov--over"
            );
        }


        if (income <= 0) {

            body.innerHTML = `
                <p class="empty-message">
                    Add income to see how much of your budget is committed.
                </p>
            `;

            return;
        }


        const rawPercent =
            (spent / income) * 100;

        const fillPercent =
            Math.max(
                0,
                Math.min(
                    100,
                    rawPercent
                )
            );

        const leftover =
            income - spent;

        const overBudget =
            spent > income;

        const approaching =
            !overBudget &&
            rawPercent >= 85;


        let barClass =
            "z-progress-bar z-progress-bar--teal";

        if (overBudget) {

            barClass =
                "z-progress-bar z-progress-bar--danger";

            if (card) {
                card.classList.add(
                    "zg-bov--over"
                );
            }

        }
        else if (approaching) {

            barClass =
                "z-progress-bar z-progress-bar--warning";

            if (card) {
                card.classList.add(
                    "zg-bov--warn"
                );
            }

        }


        const headline =
            overBudget
                ? "Over budget"
                : (
                    approaching
                        ? "Almost committed"
                        : "Committed this month"
                );


        const footText =
            overBudget
                ? `<strong>${this.escapeHTML(
                    this.formatCurrency(
                        Math.abs(leftover)
                    )
                )}</strong> over`
                : `<strong>${this.escapeHTML(
                    this.formatCurrency(leftover)
                )}</strong> remaining`;


        body.innerHTML = `
            <div class="zg-bov-progress-head">
                <span class="zg-bov-pct">${Math.round(rawPercent)}%</span>
                <span class="zg-bov-of">
                    ${this.escapeHTML(headline)}
                    &middot;
                    ${this.escapeHTML(
                        this.formatCurrency(spent)
                    )}
                    of
                    ${this.escapeHTML(
                        this.formatCurrency(income)
                    )}
                </span>
            </div>

            <div
                class="z-progress"
                role="progressbar"
                aria-label="Income committed to bills and expenses"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow="${Math.round(fillPercent)}"
            >
                <div
                    class="${barClass}"
                    style="width: ${fillPercent}%"
                ></div>
            </div>

            <p class="zg-bov-progress-foot">
                <span>Bills + expenses committed</span>
                <span>${footText}</span>
            </p>
        `;
    },


    /* =====================================================
       10c. ZG3 — SPENDING BY CATEGORY (+ subcategories)
       ===================================================== */

    buildBudgetCategoryTree(expenses) {

        const list =
            Array.isArray(expenses)
                ? expenses
                : [];

        const map =
            new Map();

        list.forEach(
            expense => {

                const amount =
                    Math.abs(
                        Number(expense.amount) || 0
                    );

                if (amount <= 0) {
                    return;
                }

                const category =
                    String(
                        expense.category || "Other"
                    ).trim() || "Other";

                const subcategory =
                    String(
                        expense.subcategory || ""
                    ).trim();


                if (!map.has(category)) {
                    map.set(category, {
                        name: category,
                        total: 0,
                        subs: new Map()
                    });
                }

                const entry =
                    map.get(category);

                entry.total += amount;


                if (subcategory) {

                    entry.subs.set(
                        subcategory,
                        (entry.subs.get(subcategory) || 0) + amount
                    );
                }
            }
        );


        return [...map.values()]
            .map(entry => ({
                name: entry.name,
                total: entry.total,
                subs: [...entry.subs.entries()]
                    .map(([name, total]) => ({ name, total }))
                    .sort((a, b) => b.total - a.total)
            }))
            .sort((a, b) => b.total - a.total);
    },


    renderBudgetCategoryBreakdown(snapshot) {

        const container =
            document.getElementById(
                "budget-category-breakdown"
            );

        if (!container) {
            return;
        }


        const tree =
            this.buildBudgetCategoryTree(
                snapshot.expenses || []
            );


        if (tree.length === 0) {

            container.innerHTML = `
                <p class="empty-message">
                    No categorized spending yet.
                </p>
            `;

            return;
        }


        const grandTotal =
            tree.reduce(
                (sum, entry) => sum + entry.total,
                0
            );


        container.innerHTML =
            tree.map(entry => {

                const percent =
                    grandTotal > 0
                        ? (entry.total / grandTotal) * 100
                        : 0;


                const subRows =
                    entry.subs.length === 0
                        ? ""
                        : `
                            <div class="zg-bcat-subs">
                                ${entry.subs.map(sub => `
                                    <div class="zg-bcat-sub">
                                        <span>${this.escapeHTML(sub.name)}</span>
                                        <span>${this.escapeHTML(
                                            this.formatCurrency(sub.total)
                                        )}</span>
                                    </div>
                                `).join("")}
                            </div>
                        `;


                return `
                    <article class="zg-bcat-row">

                        <div class="zg-bcat-head">
                            <div class="zg-bcat-name">
                                <strong>${this.escapeHTML(entry.name)}</strong>
                                <span>${percent.toFixed(0)}%</span>
                            </div>
                            <strong class="zg-bcat-amount">${this.escapeHTML(
                                this.formatCurrency(entry.total)
                            )}</strong>
                        </div>

                        <div class="z-progress zg-bcat-track">
                            <div
                                class="z-progress-bar z-progress-bar--teal"
                                style="width: ${Math.min(percent, 100)}%"
                            ></div>
                        </div>

                        ${subRows}

                    </article>
                `;
            }).join("");
    },


    /* =====================================================
       10d. ZG3 — BILLS DUE (compact, next unpaid)
       ===================================================== */

    renderBudgetBillsDue(snapshot) {

        const container =
            document.getElementById(
                "budget-bills-due"
            );

        const countEl =
            document.getElementById(
                "budget-bills-due-count"
            );

        if (!container) {
            return;
        }


        const storage =
            this.getStorage();

        const monthKey =
            snapshot.monthKey;

        const currentMonthKey =
            storage &&
            typeof storage.getCurrentMonthKey === "function"
                ? storage.getCurrentMonthKey()
                : monthKey;

        const today =
            this.getTodayKey();


        const unpaid =
            (Array.isArray(snapshot.bills)
                ? snapshot.bills
                : []
            )
                .filter(bill => !bill.paid)
                .sort((a, b) =>
                    this.compareDates(a.dueDate, b.dueDate)
                );


        if (countEl) {
            countEl.textContent =
                unpaid.length === 0
                    ? ""
                    : String(unpaid.length);
        }


        if (unpaid.length === 0) {

            container.innerHTML = `
                <p class="empty-message">
                    Every bill for this month is paid.
                </p>
            `;

            return;
        }


        const total =
            unpaid.reduce(
                (sum, bill) =>
                    sum +
                    Math.abs(Number(bill.amount) || 0),
                0
            );


        const rows =
            unpaid.slice(0, 4).map(bill => {

                const overdue =
                    monthKey === currentMonthKey &&
                    bill.dueDate &&
                    bill.dueDate < today;


                return `
                    <article class="zg-bdue-row">
                        <div class="zg-bdue-info">
                            <strong>${this.escapeHTML(bill.name || "Bill")}</strong>
                            <span class="${overdue ? "zg-bdue-overdue" : ""}">
                                ${overdue ? "Overdue &middot; " : ""}${this.escapeHTML(
                                    this.formatDate(bill.dueDate)
                                )}
                            </span>
                        </div>
                        <span class="zg-bdue-amount">${this.escapeHTML(
                            this.formatCurrency(
                                Math.abs(Number(bill.amount) || 0)
                            )
                        )}</span>
                    </article>
                `;
            }).join("");


        const more =
            unpaid.length > 4
                ? `<p class="zg-bdue-more">+ ${unpaid.length - 4} more</p>`
                : "";


        container.innerHTML = `
            <p class="zg-bdue-summary">
                ${unpaid.length === 1 ? "1 bill" : `${unpaid.length} bills`}
                &middot;
                <strong>${this.escapeHTML(
                    this.formatCurrency(total)
                )}</strong> outstanding
            </p>
            ${rows}
            ${more}
        `;
    },


    /* =====================================================
       10e. ZG3 — BILL SCHEDULE + STATUS HELPERS
       ===================================================== */

    formatBillSchedule(bill) {

        if (!bill.recurring) {
            return {
                text: "One-time",
                recurring: false
            };
        }

        if (bill.endDate) {
            return {
                text: `Monthly · Ends ${this.formatDate(bill.endDate)}`,
                recurring: true
            };
        }

        return {
            text: "Monthly · No end date",
            recurring: true
        };
    },


    getBillStatus(bill, monthKey) {

        if (bill.paid) {
            return { label: "Paid", cls: "paid" };
        }

        const storage =
            this.getStorage();

        const currentMonthKey =
            storage &&
            typeof storage.getCurrentMonthKey === "function"
                ? storage.getCurrentMonthKey()
                : monthKey;

        const overdue =
            monthKey === currentMonthKey &&
            bill.dueDate &&
            bill.dueDate < this.getTodayKey();

        return overdue
            ? { label: "Overdue", cls: "overdue" }
            : { label: "Due", cls: "unpaid" };
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
            <div class="zg-ledger">
                ${sorted.map(item => {

                    const incomeId =
                        this.escapeHTML(
                            item.sourceId ||
                            item.id ||
                            ""
                        );


                    return `
                        <article class="zg-ledger-row">

                            <div class="zg-ledger-info">
                                <strong>${this.escapeHTML(
                                    item.source ||
                                    item.name ||
                                    "Income"
                                )}</strong>
                                <span class="zg-ledger-meta">
                                    ${this.escapeHTML(
                                        item.category || "Other Income"
                                    )}
                                    &middot; ${this.escapeHTML(
                                        this.formatIncomeFrequency(item)
                                    )}
                                    &middot; ${this.escapeHTML(
                                        this.formatDate(item.date)
                                    )}
                                </span>
                            </div>

                            <div class="zg-ledger-right">
                                <span class="zg-ledger-amount money-positive">${this.escapeHTML(
                                    this.formatCurrency(item.amount)
                                )}</span>
                                <div class="zg-ledger-actions">
                                    <button
                                        type="button"
                                        class="zg-bill-btn"
                                        data-income-edit="${incomeId}"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        class="zg-bill-btn zg-bill-btn--danger"
                                        data-income-delete="${incomeId}"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                        </article>
                    `;

                }).join("")}
            </div>
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
            <div class="zg-ledger">
                ${sorted.map(expense => {

                    const expenseId =
                        this.escapeHTML(
                            expense.sourceId ||
                            expense.id ||
                            ""
                        );

                    const metaParts =
                        [
                            expense.category || "Other",
                            expense.subcategory || "",
                            this.formatExpenseFrequency(expense)
                        ].filter(part => part && part !== "One-time");

                    if (!expense.recurring) {
                        metaParts.push("One-time");
                    }


                    return `
                        <article class="zg-ledger-row">

                            <div class="zg-ledger-info">
                                <strong>${this.escapeHTML(
                                    expense.name || "Expense"
                                )}</strong>
                                <span class="zg-ledger-meta">
                                    ${
                                        expense.merchant
                                            ? `${this.escapeHTML(expense.merchant)} &middot; `
                                            : ""
                                    }${this.escapeHTML(metaParts.join(" · "))}
                                    &middot; ${this.escapeHTML(
                                        this.formatDate(expense.date)
                                    )}
                                </span>
                                ${
                                    expense.notes
                                        ? `<span class="zg-ledger-note">${this.escapeHTML(
                                            expense.notes
                                        )}</span>`
                                        : ""
                                }
                            </div>

                            <div class="zg-ledger-right">
                                <span class="zg-ledger-amount money-negative">${this.escapeHTML(
                                    this.formatCurrency(expense.amount)
                                )}</span>
                                <div class="zg-ledger-actions">
                                    <button
                                        type="button"
                                        class="zg-bill-btn"
                                        data-expense-edit="${expenseId}"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        class="zg-bill-btn zg-bill-btn--danger"
                                        data-expense-delete="${expenseId}"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>

                        </article>
                    `;

                }).join("")}
            </div>
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
                (a, b) => {

                    const paidOrder =
                        Number(Boolean(a.paid)) -
                        Number(Boolean(b.paid));

                    if (paidOrder !== 0) {
                        return paidOrder;
                    }

                    return this.compareDates(
                        a.dueDate,
                        b.dueDate
                    );
                }
            );


        container.innerHTML = `
            <div class="zg-bill-list">
                ${sorted.map(bill => {

                    const billId =
                        this.escapeHTML(bill.id || "");

                    const safeMonthKey =
                        this.escapeHTML(monthKey || "");

                    const isPaid =
                        Boolean(bill.paid);

                    const status =
                        this.getBillStatus(bill, monthKey);

                    const schedule =
                        this.formatBillSchedule(bill);

                    const categoryLine =
                        [
                            bill.category || "Other",
                            bill.subcategory || ""
                        ]
                            .filter(Boolean)
                            .join(" · ");


                    return `
                        <article class="zg-bill ${isPaid ? "zg-bill--paid" : ""}">

                            <div class="zg-bill-main">

                                <div class="zg-bill-head">
                                    <strong class="zg-bill-name">${this.escapeHTML(
                                        bill.name || "Bill"
                                    )}</strong>
                                    <span class="zg-bill-amount">${this.escapeHTML(
                                        this.formatCurrency(bill.amount)
                                    )}</span>
                                </div>

                                <div class="zg-bill-meta">
                                    <span>Due ${this.escapeHTML(
                                        this.formatDate(bill.dueDate)
                                    )}</span>
                                    ${
                                        categoryLine
                                            ? `<span>${this.escapeHTML(categoryLine)}</span>`
                                            : ""
                                    }
                                    ${
                                        bill.merchant
                                            ? `<span>${this.escapeHTML(bill.merchant)}</span>`
                                            : ""
                                    }
                                </div>

                                <div class="zg-bill-badges">
                                    <span class="z-badge z-badge-${
                                        status.cls === "paid"
                                            ? "success"
                                            : (status.cls === "overdue" ? "danger" : "warning")
                                    }">${this.escapeHTML(status.label)}</span>
                                    ${
                                        schedule.recurring
                                            ? `<span class="z-badge z-badge-violet">&#8635; ${this.escapeHTML(
                                                schedule.text
                                            )}</span>`
                                            : `<span class="z-badge">${this.escapeHTML(schedule.text)}</span>`
                                    }
                                </div>

                                ${
                                    bill.notes
                                        ? `<p class="zg-bill-notes">${this.escapeHTML(bill.notes)}</p>`
                                        : ""
                                }

                            </div>

                            <div class="zg-bill-actions">

                                <button
                                    type="button"
                                    class="zg-bill-btn zg-bill-btn--pay"
                                    data-bill-paid="${billId}"
                                    data-bill-month="${safeMonthKey}"
                                >
                                    ${isPaid ? "Mark Unpaid" : "Mark Paid"}
                                </button>

                                <button
                                    type="button"
                                    class="zg-bill-btn"
                                    data-bill-edit="${billId}"
                                    data-bill-month="${safeMonthKey}"
                                >
                                    Edit
                                </button>

                                <button
                                    type="button"
                                    class="zg-bill-btn zg-bill-btn--danger"
                                    data-bill-delete="${billId}"
                                    data-bill-month="${safeMonthKey}"
                                >
                                    Delete
                                </button>

                            </div>

                        </article>
                    `;

                }).join("")}
            </div>
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


        if (!this.txFilters) {
            this.txFilters = {
                search: "",
                type: "all",
                category: ""
            };
        }


        /* Full, sorted activity feed for the selected month — cached so
           search / filter changes re-render without another storage read. */
        this._txAll =
            (Array.isArray(snapshot.transactions)
                ? [...snapshot.transactions]
                : []
            ).sort(
                (first, second) => {

                    const dateOrder =
                        this.compareDates(
                            second.date,
                            first.date
                        );

                    if (dateOrder !== 0) {
                        return dateOrder;
                    }

                    return String(
                        second.createdAt || ""
                    ).localeCompare(
                        String(first.createdAt || "")
                    );
                }
            );


        this.renderTransactionPeriodLabel();
        this.populateTxCategoryFilter(this._txAll);
        this.bindTransactionControls();
        this.applyTxFilters();
    },


    /* =====================================================
       17a. ZG4 — TRANSACTIONS PERIOD LABEL
       ===================================================== */

    renderTransactionPeriodLabel() {

        const label =
            document.getElementById(
                "tx-period-label"
            );

        const title =
            document.getElementById(
                "current-month"
            );

        if (!label || !title) {
            return;
        }

        label.textContent =
            String(title.textContent || "").trim() ||
            "this month";
    },


    /* =====================================================
       17b. ZG4 — CATEGORY FILTER OPTIONS
       Central category library ∪ categories present in the feed
       (so legacy / custom category strings still filter).
       ===================================================== */

    populateTxCategoryFilter(all) {

        const select =
            document.getElementById(
                "tx-category-filter"
            );

        if (!select) {
            return;
        }


        const storage =
            this.getStorage();

        const names =
            new Set();

        if (
            storage &&
            typeof storage.getCategories === "function"
        ) {
            try {
                storage.getCategories({ enabledOnly: true })
                    .forEach(category => {
                        if (category && category.name) {
                            names.add(String(category.name));
                        }
                    });
            }
            catch (error) {
                /* fall through to feed-derived names */
            }
        }

        (all || []).forEach(item => {
            if (item && item.category) {
                names.add(String(item.category));
            }
        });


        const sorted =
            [...names].sort((a, b) => a.localeCompare(b));

        const previous =
            this.txFilters.category;

        select.innerHTML =
            `<option value="">All categories</option>` +
            sorted.map(name =>
                `<option value="${this.escapeHTML(name)}">${this.escapeHTML(name)}</option>`
            ).join("");

        if (previous && sorted.includes(previous)) {
            select.value = previous;
        }
        else if (previous && !sorted.includes(previous)) {
            this.txFilters.category = "";
        }
    },


    /* =====================================================
       17c. ZG4 — CONTROL EVENT BINDING (once)
       ===================================================== */

    bindTransactionControls() {

        if (this._txControlsBound) {
            return;
        }


        const search =
            document.getElementById("tx-search");

        const categoryFilter =
            document.getElementById("tx-category-filter");

        const filterGroup =
            document.querySelector(".zg-tx-filters");

        if (!search || !categoryFilter || !filterGroup) {
            return;
        }


        search.addEventListener(
            "input",
            () => {
                this.txFilters.search =
                    search.value.trim().toLowerCase();
                this.applyTxFilters();
            }
        );

        categoryFilter.addEventListener(
            "change",
            () => {
                this.txFilters.category =
                    categoryFilter.value;
                this.applyTxFilters();
            }
        );

        filterGroup.addEventListener(
            "click",
            event => {

                const chip =
                    event.target.closest("[data-tx-filter]");

                if (!chip) {
                    return;
                }

                this.txFilters.type =
                    chip.dataset.txFilter || "all";

                filterGroup
                    .querySelectorAll("[data-tx-filter]")
                    .forEach(button => {

                        const active =
                            button === chip;

                        button.classList.toggle("is-active", active);
                        button.setAttribute(
                            "aria-pressed",
                            active ? "true" : "false"
                        );
                    });

                this.applyTxFilters();
            }
        );


        this._txControlsBound = true;
    },


    /* =====================================================
       17d. ZG4 — APPLY FILTERS + RENDER
       ===================================================== */

    getFilteredTransactions() {

        const all =
            Array.isArray(this._txAll)
                ? this._txAll
                : [];

        const {
            search,
            type,
            category
        } = this.txFilters;


        return all.filter(item => {

            const amount =
                Number(item.amount) || 0;


            if (type === "income" && amount < 0) {
                return false;
            }

            if (type === "expense" && amount >= 0) {
                return false;
            }


            if (
                category &&
                String(item.category || "") !== category
            ) {
                return false;
            }


            if (search) {

                const haystack =
                    [
                        item.description,
                        item.name,
                        item.merchant,
                        item.category,
                        item.subcategory,
                        item.notes
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                if (!haystack.includes(search)) {
                    return false;
                }
            }

            return true;
        });
    },


    applyTxFilters() {

        const all =
            Array.isArray(this._txAll)
                ? this._txAll
                : [];

        const filtered =
            this.getFilteredTransactions();

        const filtersActive =
            Boolean(
                this.txFilters.search ||
                this.txFilters.category ||
                this.txFilters.type !== "all"
            );


        this.renderTransactionOverview(filtered);
        this.renderTransactionCount(
            filtered.length,
            all.length,
            filtersActive
        );
        this.renderTransactionLedger(
            filtered,
            all.length,
            filtersActive
        );
    },


    renderTransactionCount(shown, total, filtersActive) {

        const element =
            document.getElementById("tx-results-count");

        if (!element) {
            return;
        }

        if (total === 0) {
            element.textContent = "";
            return;
        }

        element.textContent =
            filtersActive
                ? `${shown} of ${total} ${total === 1 ? "transaction" : "transactions"}`
                : `${total} ${total === 1 ? "transaction" : "transactions"}`;
    },


    renderTransactionOverview(list) {

        let income = 0;
        let spending = 0;

        (list || []).forEach(item => {

            const amount =
                Number(item.amount) || 0;

            if (amount >= 0) {
                income += amount;
            }
            else {
                spending += Math.abs(amount);
            }
        });


        this.setMoneyText("tx-total-income", income);
        this.setMoneyText("tx-total-spending", spending);
        this.setMoneyText("tx-total-net", income - spending);


        const netEl =
            document.getElementById("tx-total-net");

        if (netEl) {
            netEl.classList.toggle(
                "is-negative",
                income - spending < 0
            );
        }
    },


    /* =====================================================
       17e. ZG4 — LEDGER (date-grouped Zevaryn rows)
       ===================================================== */

    renderTransactionLedger(list, totalCount, filtersActive) {

        const container =
            document.getElementById("transaction-list");

        if (!container) {
            return;
        }


        if (totalCount === 0) {

            container.innerHTML = `
                <div class="zg-tx-empty">
                    <p class="empty-message">No transactions yet.</p>
                    <p class="zg-tx-empty-sub">
                        Add your first transaction to begin tracking activity.
                    </p>
                </div>
            `;

            return;
        }


        if (!list || list.length === 0) {

            container.innerHTML = `
                <div class="zg-tx-empty">
                    <p class="empty-message">No transactions match these filters.</p>
                    <p class="zg-tx-empty-sub">
                        Try a different search or clear the filters.
                    </p>
                </div>
            `;

            return;
        }


        /* group by calendar date, preserving the incoming newest-first order */
        const groups = [];
        const index = new Map();

        list.forEach(item => {

            const key =
                item.date || "undated";

            if (!index.has(key)) {
                index.set(key, groups.length);
                groups.push({ key, items: [] });
            }

            groups[index.get(key)].items.push(item);
        });


        container.innerHTML =
            groups.map(group => `
                <div class="zg-tx-group">

                    <div class="zg-tx-group-head">
                        <span>${this.escapeHTML(
                            group.key === "undated"
                                ? "No date"
                                : this.formatDate(group.key)
                        )}</span>
                        ${
                            group.items.length > 1
                                ? `<span>${this.escapeHTML(
                                    this.formatCurrency(
                                        group.items.reduce(
                                            (sum, item) =>
                                                sum + (Number(item.amount) || 0),
                                            0
                                        )
                                    )
                                )} · ${group.items.length}</span>`
                                : ""
                        }
                    </div>

                    ${group.items.map(item =>
                        this.createTransactionRow(item)
                    ).join("")}

                </div>
            `).join("");
    },


    createTransactionRow(transaction) {

        const amount =
            Number(transaction.amount) || 0;

        const isIncome =
            amount >= 0;

        const isSavings =
            transaction.sourceType === "savings-deposit";

        const toneClass =
            isSavings
                ? "is-savings"
                : (isIncome ? "is-income" : "is-expense");


        const title =
            transaction.description ||
            transaction.name ||
            "Transaction";

        const subtitle =
            this.getTransactionSubtitle(transaction);

        const typeLabel =
            isSavings
                ? "Transfer"
                : (isIncome ? "Income" : "Expense");


        return `
            <article class="zg-tx-row ${toneClass}">

                <div class="zg-tx-row-icon" aria-hidden="true">
                    ${this.getTransactionIcon(transaction)}
                </div>

                <div class="zg-tx-row-info">
                    <strong>${this.escapeHTML(title)}</strong>
                    <span class="zg-tx-row-meta">${this.escapeHTML(subtitle)}</span>
                    ${
                        transaction.notes
                            ? `<span class="zg-tx-row-note">${this.escapeHTML(transaction.notes)}</span>`
                            : ""
                    }
                </div>

                <div class="zg-tx-row-amount">
                    <span class="zg-tx-amount-value">${this.escapeHTML(
                        this.formatSignedCurrency(amount)
                    )}</span>
                    <span class="zg-tx-amount-type">${this.escapeHTML(typeLabel)}</span>
                </div>

            </article>
        `;
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
                        No savings goals yet.
                    </p>

                    <p class="zg-sav-empty-sub">
                        Create a goal when you want to organize part of your savings.
                    </p>

                </div>
            `;
        }
        else {

            container.innerHTML =
                goals.map(
                    goal =>
                        this.createSavingsGoalHTML(
                            goal,
                            true
                        )
                ).join("");
        }


        this.renderSavingsActivity(snapshot);
    },


    /* =====================================================
       20a. ZG5 — SAVINGS ACTIVITY (this month)
       Combines Checking↔Savings transfers + goal allocate /
       release events already recorded for the month.
       ===================================================== */

    renderSavingsActivity(snapshot) {

        const section =
            document.getElementById(
                "savings-activity-section"
            );

        const container =
            document.getElementById(
                "savings-activity"
            );

        if (!section || !container) {
            return;
        }


        const periodEl =
            document.getElementById(
                "savings-activity-period"
            );

        const title =
            document.getElementById("current-month");

        if (periodEl && title) {
            const text =
                String(title.textContent || "").trim();
            periodEl.textContent =
                text ? ` · ${text}` : "";
        }


        const events = [];


        (Array.isArray(snapshot.savingsDeposits)
            ? snapshot.savingsDeposits
            : []
        ).forEach(deposit => {

            const amount =
                Number(deposit.amount) || 0;

            if (amount === 0) {
                return;
            }

            events.push({
                date: deposit.date,
                label:
                    amount > 0
                        ? "Added to Savings"
                        : "Transferred to Checking",
                sub:
                    amount > 0
                        ? "Checking → General Savings"
                        : "General Savings → Checking",
                amount,
                tone: amount > 0 ? "in" : "out"
            });
        });


        (Array.isArray(snapshot.savingsTransfers)
            ? snapshot.savingsTransfers
            : []
        ).forEach(transfer => {

            const amount =
                Math.abs(Number(transfer.amount) || 0);

            if (amount === 0) {
                return;
            }

            const released =
                transfer.type === "goal-to-savings" ||
                transfer.direction === "goal-to-savings" ||
                transfer.type === "release";

            const goalName =
                transfer.goalName || "a fund";

            events.push({
                date: transfer.date,
                label:
                    released
                        ? `Released from ${goalName}`
                        : `Allocated to ${goalName}`,
                sub:
                    released
                        ? "Fund → Available savings"
                        : "Available savings → Fund",
                amount: released ? amount : -amount,
                tone: "move"
            });
        });


        if (events.length === 0) {
            section.hidden = true;
            container.innerHTML = "";
            return;
        }


        section.hidden = false;


        events.sort(
            (a, b) =>
                String(b.date || "").localeCompare(String(a.date || ""))
        );


        container.innerHTML =
            events.map(event => `
                <article class="zg-sav-act-row zg-sav-act-row--${this.escapeHTML(event.tone)}">
                    <div class="zg-sav-act-info">
                        <strong>${this.escapeHTML(event.label)}</strong>
                        <span>${this.escapeHTML(event.sub)}${
                            event.date
                                ? ` · ${this.escapeHTML(this.formatDate(event.date))}`
                                : ""
                        }</span>
                    </div>
                    <span class="zg-sav-act-amount">${this.escapeHTML(
                        event.tone === "move"
                            ? this.formatCurrency(Math.abs(event.amount))
                            : this.formatSignedCurrency(event.amount)
                    )}</span>
                </article>
            `).join("");
    },


    /* =====================================================
       21. SAVINGS GOAL CARD
       ===================================================== */

    createSavingsGoalHTML(
        goal,
        showActions = true
    ) {

        const target =
            Number(goal.targetAmount) || 0;

        const current =
            Math.max(0, Number(goal.currentAmount) || 0);

        const remaining =
            Math.max(target - current, 0);

        const rawPercent =
            target > 0
                ? (current / target) * 100
                : (current > 0 ? 100 : 0);

        const fillPercent =
            Math.min(100, Math.max(0, rawPercent));

        const goalId =
            this.escapeHTML(goal.id || "");

        const funded =
            target > 0 && current >= target;

        const overfunded =
            target > 0 && current > target;

        const nearlyThere =
            !funded && rawPercent >= 85;

        const barClass =
            "z-progress-bar z-progress-bar--teal";

        const statusBadge =
            funded
                ? '<span class="z-badge z-badge-teal">Funded</span>'
                : '<span class="z-badge">Active</span>';

        const remainingLine =
            funded
                ? (
                    overfunded
                        ? `${this.escapeHTML(this.formatCurrency(current - target))} over target`
                        : "Fully funded"
                )
                : `${this.escapeHTML(this.formatCurrency(remaining))} to go`;

        return `
            <article class="zg-goal ${funded ? "is-funded" : ""} ${nearlyThere ? "is-close" : ""}">

                <div class="zg-goal-head">
                    <div class="zg-goal-title">
                        <strong>${this.escapeHTML(goal.name || "Savings Goal")}</strong>
                        ${statusBadge}
                    </div>
                    <div class="zg-goal-amount">
                        <strong>${this.escapeHTML(this.formatCurrency(current))}</strong>
                        <span>of ${this.escapeHTML(this.formatCurrency(target))}</span>
                    </div>
                </div>

                <div
                    class="z-progress zg-goal-track"
                    role="progressbar"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow="${Math.round(fillPercent)}"
                    aria-label="${this.escapeHTML(goal.name || "Savings Goal")} funding progress"
                >
                    <div class="${barClass}" style="width: ${fillPercent}%"></div>
                </div>

                <div class="zg-goal-meta">
                    <span>${Math.round(rawPercent)}% funded</span>
                    <span>${remainingLine}</span>
                </div>

                ${
                    goal.targetDate
                        ? `<p class="zg-goal-detail">Target date &middot; ${this.escapeHTML(this.formatDate(goal.targetDate))}</p>`
                        : ""
                }

                ${
                    goal.notes
                        ? `<p class="zg-goal-notes">${this.escapeHTML(goal.notes)}</p>`
                        : ""
                }

                ${
                    showActions
                        ? `
                            <div class="zg-goal-actions">
                                <button
                                    type="button"
                                    class="zg-goal-btn zg-goal-btn--allocate"
                                    data-savings-allocate="${goalId}"
                                >
                                    Allocate
                                </button>
                                <button
                                    type="button"
                                    class="zg-goal-btn"
                                    data-savings-release="${goalId}"
                                    ${current <= 0 ? "disabled" : ""}
                                >
                                    Release
                                </button>
                                <button
                                    type="button"
                                    class="zg-goal-btn"
                                    data-savings-goal-edit="${goalId}"
                                >
                                    Edit
                                </button>
                                <button
                                    type="button"
                                    class="zg-goal-btn zg-goal-btn--danger"
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


        this.bindReportModeSwitcher();


        this.updateReportControlVisibility();
    },


    /* =====================================================
       23b. ZG7 — REPORT MODE SWITCHER (segmented control)

       The in-page [ Monthly ] [ Yearly ] [ Date-to-Date ]
       tabs are a skin over the existing #report-type-select.
       Clicking a tab sets that select and fires its native
       "change" event, so nav.js + the existing
       mwallet:report-type-changed flow stay the single source
       of truth. No report-mode behaviour is changed here.
       ===================================================== */

    bindReportModeSwitcher() {

        const reportsPage =
            document.getElementById(
                "reports-page"
            );

        const typeSelect =
            document.getElementById(
                "report-type-select"
            );


        if (
            !reportsPage ||
            !typeSelect
        ) {
            return;
        }


        reportsPage
            .querySelectorAll("[data-report-mode]")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    () => {

                        const mode =
                            button.getAttribute(
                                "data-report-mode"
                            );


                        if (
                            !mode ||
                            typeSelect.value === mode
                        ) {
                            return;
                        }


                        typeSelect.value =
                            mode;


                        typeSelect.dispatchEvent(
                            new Event(
                                "change",
                                { bubbles: true }
                            )
                        );
                    }
                );
            });


        this.syncReportModeSwitcher();
    },


    syncReportModeSwitcher() {

        const reportsPage =
            document.getElementById(
                "reports-page"
            );

        const typeSelect =
            document.getElementById(
                "report-type-select"
            );


        if (
            !reportsPage ||
            !typeSelect
        ) {
            return;
        }


        const active =
            typeSelect.value ||
            "monthly";


        reportsPage
            .querySelectorAll("[data-report-mode]")
            .forEach(button => {

                const isActive =
                    button.getAttribute(
                        "data-report-mode"
                    ) === active;


                button.classList.toggle(
                    "is-active",
                    isActive
                );

                button.setAttribute(
                    "aria-selected",
                    isActive
                        ? "true"
                        : "false"
                );
            });
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

        this.syncReportModeSwitcher();


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

        /*
            Total Spending is a display-only roll-up of the two
            spending totals the report already computed.
        */
        this.setMoneyText(
            "report-total-spending",
            reportData.bills + reportData.expenses
        );


        const netCard =
            document.querySelector(
                "#reports-page .zg-rep-stat--net"
            );

        if (netCard) {

            netCard.classList.toggle(
                "is-negative",
                reportData.net < 0
            );

            netCard.classList.toggle(
                "is-positive",
                reportData.net > 0
            );
        }


        this.renderReportEmptyNotice(
            reportData
        );


        this.renderReportTrend(
            reportData,
            selection
        );


        this.renderReportOverview(
            reportData
        );


        this.renderReportBreakdown(
            "report-category-breakdown",
            reportData.categories,
            "No categorized spending for this period."
        );


        this.renderReportBreakdown(
            "report-merchant-breakdown",
            reportData.merchants,
            "No merchant activity for this period."
        );


        this.renderReportDetail(
            reportData
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
                {},

            /*
                ZG7 display-only reshaping targets.

                subcategories: { category: { subcategory: amount } }
                timeline:      per-month rows for the trend / yearly chart
                spendingByDate:{ "YYYY-MM-DD": bills + expenses that day }

                None of these change income / bills / expenses / savings
                / net — they only let ReportAnalytics draw charts.
            */

            subcategories:
                {},

            timeline:
                [],

            spendingByDate:
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


        const addToBucket =
            (bucket, key, amount) => {

                const safeKey =
                    String(key || "").trim();

                const value =
                    Number(amount) || 0;

                if (
                    !safeKey ||
                    value <= 0
                ) {
                    return;
                }

                bucket[safeKey] =
                    (bucket[safeKey] || 0) + value;
            };


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


                    /*
                        ZG7 trend row — same numbers as the summary
                        cards, just kept per-month so the chart can
                        plot them. "spending" == |bills| + |expenses|
                        == the Total Spending card for this month.
                    */

                    const monthBills =
                        Math.abs(
                            Number(summary.bills) || 0
                        );

                    const monthExpenses =
                        Math.abs(
                            Number(summary.expenses) || 0
                        );


                    reportData.timeline.push({
                        monthKey,
                        income:
                            Number(summary.income) || 0,
                        bills:
                            monthBills,
                        expenses:
                            monthExpenses,
                        spending:
                            monthBills + monthExpenses,
                        savings:
                            savingsFlow
                    });


                    /*
                        Distribute this month's bills across their
                        due dates for the daily (monthly-view) trend.
                    */

                    (Array.isArray(snapshot.bills)
                        ? snapshot.bills
                        : []
                    ).forEach(bill => {

                        addToBucket(
                            reportData.spendingByDate,
                            bill.dueDate,
                            Math.abs(
                                Number(bill.amount) || 0
                            )
                        );
                    });


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


                            const subcategory =
                                String(
                                    expense.subcategory || ""
                                ).trim();


                            if (subcategory) {

                                if (
                                    !reportData.subcategories[category]
                                ) {
                                    reportData.subcategories[category] = {};
                                }

                                reportData.subcategories[category][
                                    subcategory
                                ] =
                                    (
                                        reportData.subcategories[category][
                                            subcategory
                                        ] || 0
                                    )
                                    +
                                    amount;
                            }


                            addToBucket(
                                reportData.spendingByDate,
                                expense.date,
                                amount
                            );
                        }
                    );


                    (snapshot.manualTransactions || [])
                        .filter(
                            transaction =>
                                Number(
                                    transaction.amount
                                ) < 0
                        )
                        .forEach(
                            transaction => {

                                const amount =
                                    Math.abs(
                                        Number(
                                            transaction.amount
                                        ) || 0
                                    );


                                const category =
                                    transaction.category ||
                                    "Other";


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


                                const merchant =
                                    transaction.merchant ||
                                    transaction.description ||
                                    "Unassigned";


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


                                const subcategory =
                                    String(
                                        transaction.subcategory || ""
                                    ).trim();


                                if (subcategory) {

                                    if (
                                        !reportData.subcategories[category]
                                    ) {
                                        reportData.subcategories[category] = {};
                                    }

                                    reportData.subcategories[category][
                                        subcategory
                                    ] =
                                        (
                                            reportData.subcategories[category][
                                                subcategory
                                            ] || 0
                                        )
                                        +
                                        amount;
                                }


                                addToBucket(
                                    reportData.spendingByDate,
                                    transaction.date,
                                    amount
                                );
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
       35b. ZG7 — TOP-LEVEL EMPTY NOTICE
       ===================================================== */

    renderReportEmptyNotice(reportData) {

        const notice =
            document.getElementById(
                "report-empty-notice"
            );


        if (!notice) {
            return;
        }


        const data =
            reportData || {};


        const hasActivity =
            (Math.abs(Number(data.income) || 0) > 0) ||
            (Math.abs(Number(data.bills) || 0) > 0) ||
            (Math.abs(Number(data.expenses) || 0) > 0) ||
            (Math.abs(Number(data.savings) || 0) > 0);


        notice.hidden = hasActivity;
    },


    /* =====================================================
       35c. ZG7 — SPENDING TREND CHART

       Monthly view  -> one bar per day  (spendingByDate)
       Yearly / range -> one bar per month (timeline.spending)

       Pure CSS bars. The authoritative totals still live in
       the summary cards; this only shows their distribution.
       ===================================================== */

    renderReportTrend(reportData, selection) {

        const container =
            document.getElementById(
                "report-trend-chart"
            );


        if (!container) {
            return;
        }


        const analytics =
            (
                typeof window !== "undefined" &&
                window.ReportAnalytics
            )
                ? window.ReportAnalytics
                : null;


        if (!analytics) {
            container.innerHTML = "";
            return;
        }


        const series =
            analytics.buildTrendSeries(
                reportData,
                selection
            );


        if (!series.hasData) {

            container.innerHTML = `
                <p class="empty-message">
                    No spending to chart for this period.
                </p>
            `;

            return;
        }


        const peakLabel =
            this.formatCurrency(
                series.max
            );

        const totalLabel =
            this.formatCurrency(
                series.total
            );


        const denseClass =
            series.points.length > 16
                ? " zg-rep-trend-plot--dense"
                : "";


        const columns =
            series.points.map(point => {

                const value =
                    Number(point.value) || 0;


                const heightPercent =
                    series.max > 0
                        ? Math.max(
                            (value / series.max) * 100,
                            value > 0 ? 4 : 0
                        )
                        : 0;


                const columnTitle =
                    `${point.fullLabel}: ${this.formatCurrency(value)}`;


                return `
                    <div
                        class="zg-rep-trend-col${value > 0 ? " has-value" : ""}"
                        title="${this.escapeHTML(columnTitle)}"
                    >
                        <span class="zg-rep-trend-bar-wrap">
                            <span
                                class="zg-rep-trend-bar"
                                style="height: ${heightPercent}%"
                            ></span>
                        </span>
                        <span class="zg-rep-trend-x">${
                            point.showLabel
                                ? this.escapeHTML(point.label)
                                : ""
                        }</span>
                    </div>
                `;
            }).join("");


        const summaryText =
            `${series.unitLabel}. Peak ${peakLabel}. ` +
            `Total ${totalLabel} across ${series.points.length} ` +
            `${series.mode === "daily" ? "days" : "months"}.`;


        container.innerHTML = `
            <div class="zg-rep-trend">

                <div class="zg-rep-trend-meta">
                    <span>${this.escapeHTML(series.unitLabel)}</span>
                    <span>Peak ${this.escapeHTML(peakLabel)} &middot; Total ${this.escapeHTML(totalLabel)}</span>
                </div>

                <div
                    class="zg-rep-trend-plot${denseClass}"
                    role="img"
                    aria-label="${this.escapeHTML(summaryText)}"
                >
                    ${columns}
                </div>

            </div>
        `;
    },


    /* =====================================================
       35d. ZG7 — DETAILED BREAKDOWN (category + subcategory)
       ===================================================== */

    renderReportDetail(reportData) {

        const container =
            document.getElementById(
                "report-detail-breakdown"
            );


        if (!container) {
            return;
        }


        const analytics =
            (
                typeof window !== "undefined" &&
                window.ReportAnalytics
            )
                ? window.ReportAnalytics
                : null;


        if (!analytics) {
            container.innerHTML = "";
            return;
        }


        const tree =
            analytics.buildCategoryTree(
                (reportData || {}).categories,
                (reportData || {}).subcategories
            );


        if (tree.length === 0) {

            container.innerHTML = `
                <p class="empty-message">
                    No categorized spending for this period.
                </p>
            `;

            return;
        }


        container.innerHTML = `
            <div class="zg-rep-detail">
                ${tree.map(category => {

                    const categoryPercent =
                        Number(category.percent) || 0;


                    const subRows =
                        category.subs.map(sub => `
                            <div class="zg-rep-detail-sub">
                                <span>${this.escapeHTML(sub.name)}</span>
                                <span>
                                    ${this.escapeHTML(
                                        this.formatCurrency(sub.total)
                                    )}
                                    <em>${(Number(sub.percent) || 0).toFixed(0)}%</em>
                                </span>
                            </div>
                        `).join("");


                    return `
                        <article class="zg-rep-detail-row">

                            <div class="zg-rep-detail-head">
                                <div class="zg-rep-detail-name">
                                    <strong>${this.escapeHTML(category.name)}</strong>
                                    <span>${categoryPercent.toFixed(1)}% of categorized spending</span>
                                </div>
                                <strong class="zg-rep-detail-amount">${this.escapeHTML(
                                    this.formatCurrency(category.total)
                                )}</strong>
                            </div>

                            <div class="z-progress zg-rep-detail-track">
                                <div
                                    class="z-progress-bar"
                                    style="width: ${Math.min(categoryPercent, 100)}%"
                                ></div>
                            </div>

                            ${
                                subRows
                                    ? `<div class="zg-rep-detail-subs">${subRows}</div>`
                                    : ""
                            }

                        </article>
                    `;
                }).join("")}
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

       BP10 — wallet backup / restore / erase moved out of app.js
       into js/account/account-controls.js + js/account/account-ui.js
       (Settings › My Data). Those flows validate the backup wrapper
       and financial schema, show a counts-only preview, require an
       explicit confirmation, and — for erase — a typed phrase plus a
       sign-out. The old #export-data / #clear-data buttons and the
       raw storage.exportData() / storage.clearAllData() one-tap paths
       are gone. This hook is kept (still called from init) in case a
       future Settings action needs app-level wiring.
       ===================================================== */

    bindSettingsActions() {
        /* no app-level Settings buttons remain */
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