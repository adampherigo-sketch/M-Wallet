/* =========================================================
   BUDGET TRACKER
   Main Application
   ========================================================= */


document.addEventListener("DOMContentLoaded", () => {


    /* =====================================================
       1. MAKE SURE STORAGE EXISTS
       ===================================================== */

    if (typeof BudgetStorage === "undefined") {

        console.error(
            "BudgetStorage was not found. Make sure storage.js loads before app.js."
        );

        return;

    }


    /* =====================================================
       1B. MODAL MANAGEMENT SYSTEM
       ===================================================== */

    const ModalManager = {

        currentEditId: null,

        openModal(modalId) {

            const modal = document.getElementById(modalId);
            const overlay = document.getElementById("modal-overlay");

            if (modal && overlay) {
                modal.classList.add("active");
                overlay.classList.add("active");
                document.body.style.overflow = "hidden";
            }

        },

        closeModal(modalId) {

            const modal = document.getElementById(modalId);
            const overlay = document.getElementById("modal-overlay");

            if (modal) {
                modal.classList.remove("active");
            }

            if (overlay && !document.querySelector(".modal.active")) {
                overlay.classList.remove("active");
                document.body.style.overflow = "";
            }

        },

        closeAllModals() {

            document.querySelectorAll(".modal").forEach(modal => {
                modal.classList.remove("active");
            });

            const overlay = document.getElementById("modal-overlay");
            if (overlay) {
                overlay.classList.remove("active");
                document.body.style.overflow = "";
            }

        },

        setupModalControls() {

            // Close button clicks
            document.querySelectorAll("[data-modal-close]").forEach(button => {
                button.addEventListener("click", (e) => {
                    const modalId = e.target.dataset.modalClose;
                    this.closeModal(modalId);
                });
            });

            // Overlay clicks
            document.getElementById("modal-overlay")?.addEventListener("click", () => {
                this.closeAllModals();
            });

            // Escape key
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    this.closeAllModals();
                }
            });

        }

    };

    ModalManager.setupModalControls();


    /* =====================================================
       2. APP SETTINGS
       ===================================================== */

    const BudgetApp = {

        currentMonthKey: BudgetStorage.getCurrentMonthKey(),

        currency: "USD",


        /* =================================================
           3. INITIALIZE APP
           ================================================= */

        init() {

            this.prepareCurrentMonth();

            this.populateYearSelect();

            this.connectMonthControls();

            this.updateMonthControls();

            this.updateMonthHeading();

            this.connectButtons();

            this.connectDynamicActions();

            this.setupFormHandlers();

            this.renderAll();

            console.log("Budget Tracker app loaded.");

        },


        /* =================================================
           4. PREPARE CURRENT MONTH
           ================================================= */

        prepareCurrentMonth() {

            const data = BudgetStorage.load();

            /*
                If the current month already exists,
                don't do anything.
            */

            if (data.months[this.currentMonthKey]) {
                return;
            }


            /*
                Check whether the previous month exists.

                If it does, automatically carry the
                previous ending balance into this month.
            */

            const previousMonthKey =
                this.getPreviousMonthKey(
                    this.currentMonthKey
                );


            if (data.months[previousMonthKey]) {

                BudgetStorage.rolloverMonth(
                    previousMonthKey,
                    this.currentMonthKey
                );

            } else {

                BudgetStorage.getMonth(
                    this.currentMonthKey
                );

            }

        },

        /* =================================================
           YEAR DROPDOWN
           ================================================= */

        populateYearSelect() {

            const select =
                document.getElementById(
                    "year-select"
                );


            if (!select) {
                return;
            }


            const data =
                BudgetStorage.load();


            const currentYear =
                new Date().getFullYear();


            /*
                Default range:
                5 years back
                through
                10 years forward
            */

            let minimumYear =
                currentYear - 5;

            let maximumYear =
                currentYear + 10;


            /*
                If saved budgets exist outside that
                range, include those too.
            */

            Object.keys(
                data.months
            ).forEach(monthKey => {

                const year =
                    Number(
                        monthKey.split("-")[0]
                    );


                minimumYear =
                    Math.min(
                        minimumYear,
                        year
                    );


                maximumYear =
                    Math.max(
                        maximumYear,
                        year
                    );

            });


            select.innerHTML = "";


            for (
                let year = minimumYear;
                year <= maximumYear;
                year++
            ) {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    year;


                option.textContent =
                    year;


                select.appendChild(
                    option
                );

            }

        },

        /* =================================================
           CONNECT MONTH CONTROLS
           ================================================= */

        connectMonthControls() {

            const monthSelect =
                document.getElementById(
                    "month-select"
                );


            const yearSelect =
                document.getElementById(
                    "year-select"
                );


            const previousButton =
                document.getElementById(
                    "previous-month"
                );


            const nextButton =
                document.getElementById(
                    "next-month"
                );


            const todayButton =
                document.getElementById(
                    "today-month"
                );


            /* ---------------------------------------------
               Change Month Dropdown
            --------------------------------------------- */

            monthSelect
                ?.addEventListener(
                    "change",
                    () => {

                        this.goToSelectedMonth();

                    }
                );


            /* ---------------------------------------------
               Change Year Dropdown
            --------------------------------------------- */

            yearSelect
                ?.addEventListener(
                    "change",
                    () => {

                        this.goToSelectedMonth();

                    }
                );


            /* ---------------------------------------------
               Previous Month
            --------------------------------------------- */

            previousButton
                ?.addEventListener(
                    "click",
                    () => {

                        this.changeMonth(-1);

                    }
                );


            /* ---------------------------------------------
               Next Month
            --------------------------------------------- */

            nextButton
                ?.addEventListener(
                    "click",
                    () => {

                        this.changeMonth(1);

                    }
                );


            /* ---------------------------------------------
               Return to Actual Current Month
            --------------------------------------------- */

            todayButton
                ?.addEventListener(
                    "click",
                    () => {

                        this.currentMonthKey =
                            BudgetStorage
                                .getCurrentMonthKey();


                        this.prepareMonth(
                            this.currentMonthKey
                        );


                        this.refreshViewedMonth();

                    }
                );

        },

        /* =================================================
           GO TO SELECTED MONTH
           ================================================= */

        goToSelectedMonth() {

            const monthSelect =
                document.getElementById(
                    "month-select"
                );


            const yearSelect =
                document.getElementById(
                    "year-select"
                );


            if (
                !monthSelect
                ||
                !yearSelect
            ) {
                return;
            }


            const month =
                monthSelect.value;


            const year =
                yearSelect.value;


            this.currentMonthKey =
                `${year}-${month}`;


            this.prepareMonth(
                this.currentMonthKey
            );


            this.refreshViewedMonth();

        },

        /* =================================================
           MOVE FORWARD / BACKWARD MONTH
           ================================================= */

        changeMonth(direction) {

            const [year, month] =
                this.currentMonthKey
                    .split("-")
                    .map(Number);


            const date =
                new Date(
                    year,
                    month - 1 + direction,
                    1
                );


            this.currentMonthKey =
                this.createMonthKey(
                    date
                );


            this.prepareMonth(
                this.currentMonthKey
            );


            /*
                If we move outside the currently
                generated year dropdown range,
                rebuild it.
            */

            this.populateYearSelect();


            this.refreshViewedMonth();

        },

        /* =================================================
           REFRESH VIEWED MONTH
           ================================================= */

        refreshViewedMonth() {

            this.updateMonthControls();

            this.updateMonthHeading();

            this.renderAll();

        },

        /* =================================================
           UPDATE MONTH / YEAR CONTROLS
           ================================================= */

        updateMonthControls() {

            const monthSelect =
                document.getElementById(
                    "month-select"
                );


            const yearSelect =
                document.getElementById(
                    "year-select"
                );


            const [year, month] =
                this.currentMonthKey
                    .split("-");


            if (monthSelect) {

                monthSelect.value =
                    month;

            }


            if (yearSelect) {

                yearSelect.value =
                    year;

            }

        },

/* =================================================
   PREPARE ANY VIEWED MONTH
   ================================================= */

prepareMonth(monthKey) {

    const data =
        BudgetStorage.load();


    /*
        Month already exists.
    */

    if (data.months[monthKey]) {
        return;
    }


    const previousMonthKey =
        this.getPreviousMonthKey(
            monthKey
        );


    /*
        If the month before this one exists,
        carry its ending balance forward.

        This also copies recurring bills.
    */

    if (data.months[previousMonthKey]) {

        BudgetStorage.rolloverMonth(
            previousMonthKey,
            monthKey
        );

    } else {

        /*
            Otherwise create a fresh empty month.
        */

        BudgetStorage.getMonth(
            monthKey
        );

    }

},

        /* =================================================
           5. GET PREVIOUS MONTH
           ================================================= */

        getPreviousMonthKey(monthKey) {

            const [year, month] =
                monthKey.split("-").map(Number);

            const date =
                new Date(year, month - 2, 1);

            return this.createMonthKey(date);

        },


        /* =================================================
           6. CREATE MONTH KEY
           ================================================= */

        createMonthKey(date) {

            const year =
                date.getFullYear();

            const month =
                String(
                    date.getMonth() + 1
                ).padStart(2, "0");

            return `${year}-${month}`;

        },


        /* =================================================
           7. MONTH HEADING
           ================================================= */

        updateMonthHeading() {

            const heading =
                document.getElementById(
                    "current-month"
                );

            if (!heading) {
                return;
            }


            const [year, month] =
                this.currentMonthKey
                    .split("-")
                    .map(Number);


            const date =
                new Date(
                    year,
                    month - 1,
                    1
                );


            heading.textContent =
                date.toLocaleDateString(
                    undefined,
                    {
                        month: "long",
                        year: "numeric"
                    }
                );

        },


        /* =================================================
           8. FORMAT MONEY
           ================================================= */

        formatMoney(amount) {

            const number =
                Number(amount) || 0;


            return new Intl.NumberFormat(
                undefined,
                {
                    style: "currency",
                    currency: this.currency
                }
            ).format(number);

        },


        /* =================================================
           9. FORMAT DATE
           ================================================= */

        formatDate(dateValue) {

            if (!dateValue) {
                return "—";
            }


            /*
                Parse YYYY-MM-DD as a local date instead
                of UTC so dates don't shift backward.
            */

            const parts =
                dateValue.split("-");


            if (parts.length === 3) {

                const date =
                    new Date(
                        Number(parts[0]),
                        Number(parts[1]) - 1,
                        Number(parts[2])
                    );


                return date.toLocaleDateString(
                    undefined,
                    {
                        month: "short",
                        day: "numeric"
                    }
                );

            }


            return dateValue;

        },


        /* =================================================
           10. TODAY AS YYYY-MM-DD
           ================================================= */

        getToday() {

            const today =
                new Date();


            const year =
                today.getFullYear();

            const month =
                String(
                    today.getMonth() + 1
                ).padStart(2, "0");

            const day =
                String(
                    today.getDate()
                ).padStart(2, "0");


            return `${year}-${month}-${day}`;

        },


        /* =================================================
           11. ESCAPE USER TEXT
           ================================================= */

        escapeHTML(value) {

            return String(value ?? "")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");

        },


        /* =================================================
           12. SET ELEMENT TEXT
           ================================================= */

        setText(id, value) {

            const element =
                document.getElementById(id);

            if (element) {
                element.textContent = value;
            }

        },


        /* =================================================
           13. RENDER EVERYTHING
           ================================================= */

        renderAll() {

            this.renderDashboard();

            this.renderPaychecks();

            this.renderBills();

            this.renderExpenses();

            this.renderTransactions();

            this.renderSavings();

            this.renderReports();

        },


        /* =================================================
           14. DASHBOARD
           ================================================= */

        renderDashboard() {

            const summary =
                BudgetStorage.getMonthlySummary(
                    this.currentMonthKey
                );


            /*
                Main figures
            */

            this.setText(
                "checking-balance",
                this.formatMoney(
                    summary.endingBalance
                )
            );


            this.setText(
                "monthly-remaining",
                this.formatMoney(
                    summary.remaining
                )
            );


            this.setText(
                "monthly-savings",
                this.formatMoney(
                    summary.savings
                )
            );


            /*
                Summary cards
            */

            this.setText(
                "total-income",
                this.formatMoney(
                    summary.income
                )
            );


            this.setText(
                "total-bills",
                this.formatMoney(
                    summary.bills
                )
            );


            this.setText(
                "total-expenses",
                this.formatMoney(
                    summary.expenses
                )
            );


            this.setText(
                "total-savings",
                this.formatMoney(
                    summary.savings
                )
            );


            /*
                Starting balance
            */

            this.setText(
                "starting-balance",
                this.formatMoney(
                    summary.startingBalance
                )
            );


            this.renderUpcomingBills();

            this.renderNextPaycheck();

        },


        /* =================================================
           15. CREATE RUNNING BALANCE LOOKUP
           ================================================= */

        getRunningBalanceMap() {

            const running =
                BudgetStorage.getRunningBalance(
                    this.currentMonthKey
                );


            const map =
                new Map();


            running.forEach(
                transaction => {

                    map.set(
                        transaction.id,
                        transaction
                    );

                }
            );


            return map;

        },


        /* =================================================
           16. PAYCHECK TABLE
           ================================================= */

        renderPaychecks() {

            const container =
                document.getElementById(
                    "paycheck-list"
                );


            if (!container) {
                return;
            }


            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            if (!month.paychecks.length) {

                container.innerHTML = `
                    <p class="empty-message">
                        No paychecks added.
                    </p>
                `;

                return;

            }


            const balances =
                this.getRunningBalanceMap();


            const paychecks =
                [...month.paychecks]
                    .sort(
                        (a, b) =>
                            a.payDate.localeCompare(
                                b.payDate
                            )
                    );


            const rows =
                paychecks
                    .map(paycheck => {

                        const running =
                            balances.get(
                                paycheck.id
                            );


                        return `
                            <tr>

                                <td>
                                    ${this.formatDate(
                                        paycheck.payDate
                                    )}
                                </td>

                                <td>
                                    ${this.escapeHTML(
                                        paycheck.name
                                    )}
                                </td>

                                <td>
                                    ${Number(
                                        paycheck.hours
                                    ).toFixed(1)}
                                </td>

                                <td class="money-positive">
                                    +${this.formatMoney(
                                        paycheck.amount
                                    )}
                                </td>

                                <td>
                                    ${this.formatMoney(
                                        running?.balanceBefore
                                    )}
                                </td>

                                <td>
                                    ${this.formatMoney(
                                        running?.balanceAfter
                                    )}
                                </td>

                                <td>

                                    <button
                                        class="text-button"
                                        data-action="edit-paycheck"
                                        data-id="${paycheck.id}"
                                        type="button"
                                    >
                                        Edit
                                    </button>

                                    &nbsp;

                                    <button
                                        class="text-button"
                                        data-action="delete-paycheck"
                                        data-id="${paycheck.id}"
                                        type="button"
                                    >
                                        Delete
                                    </button>

                                </td>

                            </tr>
                        `;

                    })
                    .join("");


            container.innerHTML = `

                <table>

                    <thead>

                        <tr>

                            <th>Pay Date</th>

                            <th>Paycheck</th>

                            <th>Hours</th>

                            <th>Amount</th>

                            <th>Before</th>

                            <th>After</th>

                            <th></th>

                        </tr>

                    </thead>

                    <tbody>

                        ${rows}

                    </tbody>

                </table>

            `;

        },


        /* =================================================
           17. BILLS TABLE
           ================================================= */

        renderBills() {

            const container =
                document.getElementById(
                    "bill-list"
                );


            if (!container) {
                return;
            }


            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            if (!month.bills.length) {

                container.innerHTML = `
                    <p class="empty-message">
                        No bills added.
                    </p>
                `;

                return;

            }


            const balances =
                this.getRunningBalanceMap();


            const bills =
                [...month.bills]
                    .sort(
                        (a, b) =>
                            a.dueDate.localeCompare(
                                b.dueDate
                            )
                    );


            const rows =
                bills
                    .map(bill => {

                        const running =
                            balances.get(
                                bill.id
                            );


                        return `

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

                                <td class="money-negative">
                                    -${this.formatMoney(
                                        bill.amount
                                    )}
                                </td>

                                <td>
                                    ${
                                        bill.paid
                                            ? "Paid"
                                            : "Upcoming"
                                    }
                                </td>

                                <td>
                                    ${this.formatMoney(
                                        running?.balanceBefore
                                    )}
                                </td>

                                <td>
                                    ${this.formatMoney(
                                        running?.balanceAfter
                                    )}
                                </td>

                                <td>

                                    <button
                                        class="text-button"
                                        data-action="toggle-bill"
                                        data-id="${bill.id}"
                                        type="button"
                                    >
                                        ${
                                            bill.paid
                                                ? "Unpay"
                                                : "Paid"
                                        }
                                    </button>

                                    &nbsp;

                                    <button
                                        class="text-button"
                                        data-action="edit-bill"
                                        data-id="${bill.id}"
                                        type="button"
                                    >
                                        Edit
                                    </button>

                                    &nbsp;

                                    <button
                                        class="text-button"
                                        data-action="delete-bill"
                                        data-id="${bill.id}"
                                        type="button"
                                    >
                                        Delete
                                    </button>

                                </td>

                            </tr>

                        `;

                    })
                    .join("");


            container.innerHTML = `

                <table>

                    <thead>

                        <tr>

                            <th>Bill</th>

                            <th>Due</th>

                            <th>Amount</th>

                            <th>Status</th>

                            <th>Before</th>

                            <th>After</th>

                            <th></th>

                        </tr>

                    </thead>

                    <tbody>

                        ${rows}

                    </tbody>

                </table>

            `;

        },


        /* =================================================
           18. EXPENSE TABLE
           ================================================= */

        renderExpenses() {

            const container =
                document.getElementById(
                    "expense-list"
                );


            if (!container) {
                return;
            }


            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            if (!month.expenses.length) {

                container.innerHTML = `
                    <p class="empty-message">
                        No expenses added.
                    </p>
                `;

                return;

            }


            const balances =
                this.getRunningBalanceMap();


            const expenses =
                [...month.expenses]
                    .sort(
                        (a, b) =>
                            a.date.localeCompare(
                                b.date
                            )
                    );


            const rows =
                expenses
                    .map(expense => {

                        const running =
                            balances.get(
                                expense.id
                            );


                        return `

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
                                        expense.category
                                    )}
                                </td>

                                <td class="money-negative">
                                    -${this.formatMoney(
                                        expense.amount
                                    )}
                                </td>

                                <td>
                                    ${this.formatMoney(
                                        running?.balanceBefore
                                    )}
                                </td>

                                <td>
                                    ${this.formatMoney(
                                        running?.balanceAfter
                                    )}
                                </td>

                                <td>

                                    <button
                                        class="text-button"
                                        data-action="edit-expense"
                                        data-id="${expense.id}"
                                        type="button"
                                    >
                                        Edit
                                    </button>

                                    &nbsp;

                                    <button
                                        class="text-button"
                                        data-action="delete-expense"
                                        data-id="${expense.id}"
                                        type="button"
                                    >
                                        Delete
                                    </button>

                                </td>

                            </tr>

                        `;

                    })
                    .join("");


            container.innerHTML = `

                <table>

                    <thead>

                        <tr>

                            <th>Expense</th>

                            <th>Date</th>

                            <th>Category</th>

                            <th>Amount</th>

                            <th>Before</th>

                            <th>After</th>

                            <th></th>

                        </tr>

                    </thead>

                    <tbody>

                        ${rows}

                    </tbody>

                </table>

            `;

        },


        /* =================================================
           19. UPCOMING BILLS
           ================================================= */

        renderUpcomingBills() {

            const container =
                document.getElementById(
                    "upcoming-bills"
                );


            if (!container) {
                return;
            }


            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            const upcoming =
                month.bills

                    .filter(
                        bill => !bill.paid
                    )

                    .sort(
                        (a, b) =>
                            a.dueDate.localeCompare(
                                b.dueDate
                            )
                    )

                    .slice(0, 5);


            if (!upcoming.length) {

                container.innerHTML = `
                    <p class="empty-message">
                        No upcoming bills.
                    </p>
                `;

                return;

            }


            container.innerHTML =
                upcoming
                    .map(bill => `

                        <div class="transaction-item">

                            <div class="transaction-icon">
                                $
                            </div>

                            <div class="transaction-info">

                                <strong>
                                    ${this.escapeHTML(
                                        bill.name
                                    )}
                                </strong>

                                <span>
                                    Due ${this.formatDate(
                                        bill.dueDate
                                    )}
                                </span>

                            </div>

                            <div class="transaction-amount expense">

                                -${this.formatMoney(
                                    bill.amount
                                )}

                            </div>

                        </div>

                    `)
                    .join("");

        },


        /* =================================================
           20. NEXT PAYCHECK
           ================================================= */

        renderNextPaycheck() {

            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            const today =
                this.getToday();


            const paychecks =
                [...month.paychecks]
                    .sort(
                        (a, b) =>
                            a.payDate.localeCompare(
                                b.payDate
                            )
                    );


            let next =
                paychecks.find(
                    paycheck =>
                        paycheck.payDate >= today
                );


            /*
                If all paycheck dates already passed,
                display the last paycheck.
            */

            if (!next && paychecks.length) {

                next =
                    paychecks[
                        paychecks.length - 1
                    ];

            }


            if (!next) {

                this.setText(
                    "next-pay-date",
                    "—"
                );

                this.setText(
                    "next-pay-amount",
                    this.formatMoney(0)
                );

                return;

            }


            this.setText(
                "next-pay-date",
                this.formatDate(
                    next.payDate
                )
            );


            this.setText(
                "next-pay-amount",
                this.formatMoney(
                    next.amount
                )
            );

        },


        /* =================================================
           21. TRANSACTIONS PAGE
           ================================================= */

        renderTransactions() {

            const container =
                document.getElementById(
                    "transaction-list"
                );


            if (!container) {
                return;
            }


            const transactions =
                BudgetStorage.getTransactions(
                    this.currentMonthKey
                );


            if (!transactions.length) {

                container.innerHTML = `
                    <p class="empty-message">
                        No transactions yet.
                    </p>
                `;

                return;

            }


            const running =
                BudgetStorage.getRunningBalance(
                    this.currentMonthKey
                );


            const balanceMap =
                new Map();


            running.forEach(
                transaction => {

                    balanceMap.set(
                        transaction.id,
                        transaction.balanceAfter
                    );

                }
            );


            container.innerHTML =
                transactions
                    .map(transaction => {

                        const positive =
                            transaction.amount >= 0;


                        return `

                            <article class="transaction-item">

                                <div class="transaction-icon">

                                    ${
                                        positive
                                            ? "+"
                                            : "$"
                                    }

                                </div>


                                <div class="transaction-info">

                                    <strong>

                                        ${this.escapeHTML(
                                            transaction.name
                                        )}

                                    </strong>

                                    <span>

                                        ${this.escapeHTML(
                                            transaction.category
                                        )}

                                        ·

                                        ${this.formatDate(
                                            transaction.date
                                        )}

                                        · Balance:

                                        ${this.formatMoney(
                                            balanceMap.get(
                                                transaction.id
                                            )
                                        )}

                                    </span>

                                </div>


                                <div
                                    class="transaction-amount ${
                                        positive
                                            ? "income"
                                            : "expense"
                                    }"
                                >

                                    ${
                                        positive
                                            ? "+"
                                            : "-"
                                    }

                                    ${this.formatMoney(
                                        Math.abs(
                                            transaction.amount
                                        )
                                    )}

                                </div>

                            </article>

                        `;

                    })
                    .join("");

        },


        /* =================================================
           22. SAVINGS
           ================================================= */

        renderSavings() {

            const goals =
                BudgetStorage.getSavingsGoals();


            const goalsContainer =
                document.getElementById(
                    "savings-goals"
                );


            const overviewContainer =
                document.getElementById(
                    "savings-overview"
                );


            const totalSavings =
                goals.reduce(
                    (total, goal) =>
                        total +
                        Number(
                            goal.currentAmount
                        ),

                    0
                );


            this.setText(
                "savings-balance",
                this.formatMoney(
                    totalSavings
                )
            );


            if (!goals.length) {

                if (goalsContainer) {

                    goalsContainer.innerHTML = `
                        <p class="empty-message">
                            No savings goals created.
                        </p>
                    `;

                }


                if (overviewContainer) {

                    overviewContainer.innerHTML = `
                        <p class="empty-message">
                            No savings goals yet.
                        </p>
                    `;

                }


                return;

            }


            const goalCards =
                goals
                    .map(goal => {

                        let progress = 0;


                        if (
                            Number(
                                goal.targetAmount
                            ) > 0
                        ) {

                            progress =
                                (
                                    Number(
                                        goal.currentAmount
                                    )
                                    /
                                    Number(
                                        goal.targetAmount
                                    )
                                )
                                * 100;

                        }


                        progress =
                            Math.min(
                                Math.max(
                                    progress,
                                    0
                                ),
                                100
                            );


                        const remaining =
                            Math.max(
                                Number(
                                    goal.targetAmount
                                )
                                -
                                Number(
                                    goal.currentAmount
                                ),

                                0
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

                                        <div>

                                            ${this.formatMoney(
                                                goal.currentAmount
                                            )}

                                            /

                                            ${this.formatMoney(
                                                goal.targetAmount
                                            )}

                                        </div>

                                    </div>

                                    <strong>
                                        ${Math.round(
                                            progress
                                        )}%
                                    </strong>

                                </div>


                                <div class="savings-progress">

                                    <div
                                        class="savings-progress-bar"
                                        style="width: ${progress}%"
                                    ></div>

                                </div>


                                <p
                                    style="
                                        margin-top: 10px;
                                        color: var(--muted);
                                        font-size: .82rem;
                                    "
                                >

                                    Still needed:

                                    ${this.formatMoney(
                                        remaining
                                    )}

                                </p>


                                <div
                                    style="
                                        display: flex;
                                        gap: 12px;
                                        margin-top: 12px;
                                    "
                                >

                                    <button
                                        class="text-button"
                                        data-action="add-goal-money"
                                        data-id="${goal.id}"
                                        type="button"
                                    >
                                        + Add Money
                                    </button>


                                    <button
                                        class="text-button"
                                        data-action="edit-goal"
                                        data-id="${goal.id}"
                                        type="button"
                                    >
                                        Edit
                                    </button>


                                    <button
                                        class="text-button"
                                        data-action="delete-goal"
                                        data-id="${goal.id}"
                                        type="button"
                                    >
                                        Delete
                                    </button>

                                </div>

                            </article>

                        `;

                    })
                    .join("");


            if (goalsContainer) {

                goalsContainer.innerHTML =
                    goalCards;

            }


            if (overviewContainer) {

                overviewContainer.innerHTML =
                    goals
                        .slice(0, 3)
                        .map(goal => `

                            <div class="transaction-item">

                                <div class="transaction-icon">
                                    $
                                </div>

                                <div class="transaction-info">

                                    <strong>
                                        ${this.escapeHTML(
                                            goal.name
                                        )}
                                    </strong>

                                    <span>
                                        Goal:
                                        ${this.formatMoney(
                                            goal.targetAmount
                                        )}
                                    </span>

                                </div>

                                <div class="transaction-amount income">

                                    ${this.formatMoney(
                                        goal.currentAmount
                                    )}

                                </div>

                            </div>

                        `)
                        .join("");

            }

        },


        /* =================================================
           23. REPORTS
           ================================================= */

        renderReports() {

            const container =
                document.getElementById(
                    "monthly-chart"
                );


            if (!container) {
                return;
            }


            const summary =
                BudgetStorage.getMonthlySummary(
                    this.currentMonthKey
                );


            container.innerHTML = `

                <div
                    style="
                        width: 100%;
                        display: grid;
                        gap: 14px;
                    "
                >

                    <div>
                        Income:
                        <strong>
                            ${this.formatMoney(
                                summary.income
                            )}
                        </strong>
                    </div>

                    <div>
                        Bills:
                        <strong>
                            ${this.formatMoney(
                                summary.bills
                            )}
                        </strong>
                    </div>

                    <div>
                        Expenses:
                        <strong>
                            ${this.formatMoney(
                                summary.expenses
                            )}
                        </strong>
                    </div>

                    <div>
                        Savings:
                        <strong>
                            ${this.formatMoney(
                                summary.savings
                            )}
                        </strong>
                    </div>

                    <hr>

                    <div>

                        Projected Ending Balance:

                        <strong>
                            ${this.formatMoney(
                                summary.endingBalance
                            )}
                        </strong>

                    </div>

                </div>

            `;

        },


        /* =================================================
           24. CONNECT MAIN BUTTONS
           ================================================= */

        connectButtons() {

            document
                .getElementById(
                    "add-paycheck-button"
                )
                ?.addEventListener(
                    "click",
                    () => this.addPaycheck()
                );


            document
                .getElementById(
                    "add-bill-button"
                )
                ?.addEventListener(
                    "click",
                    () => this.addBill()
                );


            document
                .getElementById(
                    "add-expense-button"
                )
                ?.addEventListener(
                    "click",
                    () => this.addExpense()
                );


            document
                .getElementById(
                    "add-savings-button"
                )
                ?.addEventListener(
                    "click",
                    () => this.addSavingsGoal()
                );


            document
                .getElementById(
                    "add-transaction-button"
                )
                ?.addEventListener(
                    "click",
                    () => this.addTransaction()
                );


            document
                .getElementById(
                    "change-starting-balance"
                )
                ?.addEventListener(
                    "click",
                    () =>
                        this.changeStartingBalance()
                );


            document
                .getElementById(
                    "export-data"
                )
                ?.addEventListener(
                    "click",
                    () => this.exportData()
                );


            document
                .getElementById(
                    "clear-data"
                )
                ?.addEventListener(
                    "click",
                    () => this.resetData()
                );

        },


        /* =================================================
           25. DYNAMIC BUTTON ACTIONS
           ================================================= */

        connectDynamicActions() {

            document.addEventListener(
                "click",
                event => {

                    const button =
                        event.target.closest(
                            "[data-action]"
                        );


                    if (!button) {
                        return;
                    }


                    const action =
                        button.dataset.action;

                    const id =
                        button.dataset.id;


                    switch (action) {


                        case "delete-paycheck":

                            this.deletePaycheck(id);

                            break;


                        case "edit-paycheck":

                            this.editPaycheck(id);

                            break;


                        case "delete-bill":

                            this.deleteBill(id);

                            break;


                        case "edit-bill":

                            this.editBill(id);

                            break;


                        case "toggle-bill":

                            this.toggleBill(id);

                            break;


                        case "delete-expense":

                            this.deleteExpense(id);

                            break;


                        case "edit-expense":

                            this.editExpense(id);

                            break;


                        case "add-goal-money":

                            this.addMoneyToGoal(id);

                            break;


                        case "edit-goal":

                            this.editSavingsGoal(id);

                            break;


                        case "delete-goal":

                            this.deleteSavingsGoal(id);

                            break;

                    }

                }
            );

        },


        /* =================================================
           25B. SETUP FORM HANDLERS
           ================================================= */

        setupFormHandlers() {

            // Paycheck form submission
            document.getElementById("paycheck-form")?.addEventListener("submit", (e) => {
                e.preventDefault();
                const form = e.target;
                const data = {
                    name: form.name.value,
                    payDate: form.payDate.value,
                    hours: Number(form.hours.value) || 0,
                    amount: Number(form.amount.value) || 0
                };

                if (ModalManager.currentEditId) {
                    BudgetStorage.updatePaycheck(
                        ModalManager.currentEditId,
                        data,
                        this.currentMonthKey
                    );
                } else {
                    BudgetStorage.addPaycheck(data, this.currentMonthKey);
                }

                ModalManager.closeModal("paycheck-modal");
                this.renderAll();
            });

            // Bill form submission
            document.getElementById("bill-form")?.addEventListener("submit", (e) => {
                e.preventDefault();
                const form = e.target;
                const data = {
                    name: form.name.value,
                    dueDate: form.dueDate.value,
                    amount: Number(form.amount.value) || 0,
                    category: form.category.value,
                    recurring: form.recurring.checked
                };

                if (ModalManager.currentEditId) {
                    BudgetStorage.updateBill(
                        ModalManager.currentEditId,
                        data,
                        this.currentMonthKey
                    );
                } else {
                    data.paid = false;
                    BudgetStorage.addBill(data, this.currentMonthKey);
                }

                ModalManager.closeModal("bill-modal");
                this.renderAll();
            });

            // Expense form submission
            document.getElementById("expense-form")?.addEventListener("submit", (e) => {
                e.preventDefault();
                const form = e.target;
                const data = {
                    name: form.name.value,
                    date: form.date.value,
                    category: form.category.value,
                    amount: Number(form.amount.value) || 0
                };

                if (ModalManager.currentEditId) {
                    BudgetStorage.updateExpense(
                        ModalManager.currentEditId,
                        data,
                        this.currentMonthKey
                    );
                } else {
                    BudgetStorage.addExpense(data, this.currentMonthKey);
                }

                ModalManager.closeModal("expense-modal");
                this.renderAll();
            });

            // Savings goal form submission
            document.getElementById("savings-form")?.addEventListener("submit", (e) => {
                e.preventDefault();
                const form = e.target;
                const data = {
                    name: form.name.value,
                    targetAmount: Number(form.targetAmount.value) || 0,
                    currentAmount: Number(form.currentAmount.value) || 0
                };

                if (ModalManager.currentEditId) {
                    BudgetStorage.updateSavingsGoal(
                        ModalManager.currentEditId,
                        data
                    );
                } else {
                    BudgetStorage.addSavingsGoal(data);
                }

                ModalManager.closeModal("savings-modal");
                this.renderAll();
            });

            // Add money to savings goal form submission
            document.getElementById("add-savings-money-form")?.addEventListener("submit", (e) => {
                e.preventDefault();
                const form = e.target;
                const amount = Number(form.amount.value) || 0;

                if (ModalManager.currentEditId && amount > 0) {
                    const goals = BudgetStorage.getSavingsGoals();
                    const goal = goals.find(g => g.id === ModalManager.currentEditId);

                    if (goal) {
                        const newAmount = Number(goal.currentAmount) + amount;
                        BudgetStorage.updateSavingsGoal(
                            ModalManager.currentEditId,
                            {
                                name: goal.name,
                                targetAmount: goal.targetAmount,
                                currentAmount: newAmount
                            }
                        );
                        this.renderAll();
                    }
                }

                ModalManager.closeModal("add-savings-money-modal");
            });

            // Starting balance form submission
            document.getElementById("starting-balance-form")?.addEventListener("submit", (e) => {
                e.preventDefault();
                const form = e.target;
                const amount = Number(form.balance.value) || 0;

                BudgetStorage.setStartingBalance(
                    amount,
                    this.currentMonthKey
                );

                ModalManager.closeModal("starting-balance-modal");
                this.renderAll();
            });

        },


        /* =================================================
           26. ASK FOR MONEY (Legacy - kept for reference)
           ================================================= */

        promptMoney(
            message,
            defaultValue = ""
        ) {

            // This function is no longer used with modal forms
            // Keeping for backward compatibility
            const number = Number(defaultValue) || 0;
            return number;

        },


        /* =================================================
           27. ADD PAYCHECK
           ================================================= */

        addPaycheck() {

            ModalManager.currentEditId = null;

            const form = document.getElementById("paycheck-form");
            const modal = document.getElementById("paycheck-modal");

            // Reset form
            if (form) {
                form.reset();
                document.getElementById("paycheck-date").value = this.getToday();
                document.getElementById("paycheck-name").value = "Paycheck";
            }

            // Update title for add mode
            const title = document.getElementById("paycheck-modal-title");
            if (title) title.textContent = "Add Paycheck";

            ModalManager.openModal("paycheck-modal");

        },


        /* =================================================
           28. EDIT PAYCHECK
           ================================================= */

        editPaycheck(id) {

            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            const paycheck =
                month.paychecks.find(
                    item => item.id === id
                );

            if (!paycheck) {
                return;
            }

            ModalManager.currentEditId = id;

            // Populate form with existing data
            document.getElementById("paycheck-name").value = paycheck.name;
            document.getElementById("paycheck-date").value = paycheck.payDate;
            document.getElementById("paycheck-hours").value = paycheck.hours;
            document.getElementById("paycheck-amount").value = paycheck.amount;

            // Update title for edit mode
            const title = document.getElementById("paycheck-modal-title");
            if (title) title.textContent = "Edit Paycheck";

            ModalManager.openModal("paycheck-modal");

        },


        /* =================================================
           29. DELETE PAYCHECK
           ================================================= */

        deletePaycheck(id) {

            if (
                !confirm(
                    "Delete this paycheck?"
                )
            ) {
                return;
            }


            BudgetStorage.deletePaycheck(
                id,
                this.currentMonthKey
            );


            this.renderAll();

        },


        /* =================================================
           30. ADD BILL
           ================================================= */

        addBill() {

            ModalManager.currentEditId = null;

            // Reset form
            const form = document.getElementById("bill-form");
            if (form) {
                form.reset();
                document.getElementById("bill-date").value = this.getToday();
                document.getElementById("bill-category").value = "Bills";
                document.getElementById("bill-recurring").checked = false;
            }

            // Update title for add mode
            const title = document.getElementById("bill-modal-title");
            if (title) title.textContent = "Add Bill";

            ModalManager.openModal("bill-modal");

        },


        /* =================================================
           31. EDIT BILL
           ================================================= */

        editBill(id) {

            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            const bill =
                month.bills.find(
                    item => item.id === id
                );


            if (!bill) {
                return;
            }

            ModalManager.currentEditId = id;

            // Populate form with existing data
            document.getElementById("bill-name").value = bill.name;
            document.getElementById("bill-date").value = bill.dueDate;
            document.getElementById("bill-amount").value = bill.amount;
            document.getElementById("bill-category").value = bill.category;
            document.getElementById("bill-recurring").checked = bill.recurring;

            // Update title for edit mode
            const title = document.getElementById("bill-modal-title");
            if (title) title.textContent = "Edit Bill";

            ModalManager.openModal("bill-modal");

        },


        /* =================================================
           32. TOGGLE BILL PAID
           ================================================= */

        toggleBill(id) {

            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            const bill =
                month.bills.find(
                    item => item.id === id
                );


            if (!bill) {
                return;
            }


            BudgetStorage.markBillPaid(
                id,
                !bill.paid,
                this.currentMonthKey
            );


            this.renderAll();

        },


        /* =================================================
           33. DELETE BILL
           ================================================= */

        deleteBill(id) {

            if (
                !confirm(
                    "Delete this bill?"
                )
            ) {
                return;
            }


            BudgetStorage.deleteBill(
                id,
                this.currentMonthKey
            );


            this.renderAll();

        },


        /* =================================================
           34. ADD EXPENSE
           ================================================= */

        addExpense() {

            ModalManager.currentEditId = null;

            // Reset form
            const form = document.getElementById("expense-form");
            if (form) {
                form.reset();
                document.getElementById("expense-date").value = this.getToday();
            }

            // Update title for add mode
            const title = document.getElementById("expense-modal-title");
            if (title) title.textContent = "Add Expense";

            ModalManager.openModal("expense-modal");

        },


        /* =================================================
           35. EDIT EXPENSE
           ================================================= */

        editExpense(id) {

            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );


            const expense =
                month.expenses.find(
                    item => item.id === id
                );


            if (!expense) {
                return;
            }

            ModalManager.currentEditId = id;

            // Populate form with existing data
            document.getElementById("expense-name").value = expense.name;
            document.getElementById("expense-date").value = expense.date;
            document.getElementById("expense-amount").value = expense.amount;
            document.getElementById("expense-category").value = expense.category;

            // Update title for edit mode
            const title = document.getElementById("expense-modal-title");
            if (title) title.textContent = "Edit Expense";

            ModalManager.openModal("expense-modal");

        },


        /* =================================================
           36. DELETE EXPENSE
           ================================================= */

        deleteExpense(id) {

            if (
                !confirm(
                    "Delete this expense?"
                )
            ) {
                return;
            }


            BudgetStorage.deleteExpense(
                id,
                this.currentMonthKey
            );


            this.renderAll();

        },


        /* =================================================
           37. ADD SAVINGS GOAL
           ================================================= */

        addSavingsGoal() {

            ModalManager.currentEditId = null;

            // Reset form
            const form = document.getElementById("savings-form");
            if (form) {
                form.reset();
            }

            // Update title for add mode
            const title = document.getElementById("savings-modal-title");
            if (title) title.textContent = "Add Savings Goal";

            ModalManager.openModal("savings-modal");

        },


        /* =================================================
           38. ADD MONEY TO GOAL
           ================================================= */

        addMoneyToGoal(id) {

            ModalManager.currentEditId = id;

            // Reset form
            const form = document.getElementById("add-savings-money-form");
            if (form) {
                form.reset();
            }

            ModalManager.openModal("add-savings-money-modal");

        },


        /* =================================================
           39. EDIT SAVINGS GOAL
           ================================================= */

        editSavingsGoal(id) {

            const goals =
                BudgetStorage.getSavingsGoals();


            const goal =
                goals.find(
                    item => item.id === id
                );


            if (!goal) {
                return;
            }

            ModalManager.currentEditId = id;

            // Populate form with existing data
            document.getElementById("savings-name").value = goal.name;
            document.getElementById("savings-target").value = goal.targetAmount;
            document.getElementById("savings-current").value = goal.currentAmount;

            // Update title for edit mode
            const title = document.getElementById("savings-modal-title");
            if (title) title.textContent = "Edit Savings Goal";

            ModalManager.openModal("savings-modal");

        },


        /* =================================================
           40. DELETE SAVINGS GOAL
           ================================================= */

        deleteSavingsGoal(id) {

            if (
                !confirm(
                    "Delete this savings goal?"
                )
            ) {
                return;
            }


            BudgetStorage.deleteSavingsGoal(
                id
            );


            this.renderAll();

        },


        /* =================================================
           41. ADD GENERAL TRANSACTION
           ================================================= */

        addTransaction() {

            const type =
                prompt(
                    "What are you adding?\n\n" +
                    "income\n" +
                    "bill\n" +
                    "expense\n" +
                    "savings"
                );


            if (!type) {
                return;
            }


            switch (
                type.toLowerCase().trim()
            ) {


                case "income":

                case "paycheck":

                    this.addPaycheck();

                    break;


                case "bill":

                    this.addBill();

                    break;


                case "expense":

                    this.addExpense();

                    break;


                case "savings":

                    this.addSavingsTransfer();

                    break;


                default:

                    alert(
                        "Please enter income, bill, expense, or savings."
                    );

            }

        },


        /* =================================================
           42. ADD GENERAL SAVINGS TRANSFER
           ================================================= */

        addSavingsTransfer() {

            const goals =
                BudgetStorage.getSavingsGoals();


            let message =
                "Savings amount:";


            if (goals.length) {

                message =
                    "How much are you moving into savings?";

            }


            const amount =
                this.promptMoney(
                    message
                );


            if (
                amount === null
                ||
                amount === 0
            ) {
                return;
            }


            BudgetStorage.addSavingsTransfer(
                {

                    name: "Savings",

                    date: this.getToday(),

                    amount

                },

                this.currentMonthKey
            );


            this.renderAll();

        },


        /* =================================================
           43. STARTING BALANCE
           ================================================= */

        changeStartingBalance() {

            const month =
                BudgetStorage.getMonth(
                    this.currentMonthKey
                );

            // Populate form with current balance
            document.getElementById("starting-balance-input").value = month.startingBalance;

            ModalManager.openModal("starting-balance-modal");

        },


        /* =================================================
           44. EXPORT DATA
           ================================================= */

        exportData() {

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


            link.href = url;

            link.download =
                `budget-backup-${this.getToday()}.json`;


            document.body.appendChild(
                link
            );


            link.click();

            link.remove();


            URL.revokeObjectURL(
                url
            );

        },


        /* =================================================
           45. RESET APP DATA
           ================================================= */

        resetData() {

            const confirmed =
                confirm(
                    "This will permanently delete all budget data saved in this browser.\n\nAre you sure?"
                );


            if (!confirmed) {
                return;
            }


            const secondCheck =
                confirm(
                    "Last chance — delete everything?"
                );


            if (!secondCheck) {
                return;
            }


            BudgetStorage.clearAllData();


            this.prepareCurrentMonth();

            this.renderAll();


            alert(
                "Budget data has been reset."
            );

        }

    };


    /* =====================================================
       46. START APP
       ===================================================== */

    BudgetApp.init();


    /* =====================================================
       47. MAKE APP AVAILABLE IN CONSOLE
       ===================================================== */

    window.BudgetApp =
        BudgetApp;

});