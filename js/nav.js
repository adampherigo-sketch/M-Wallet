/* =========================================================
   M-WALLET
   Navigation + Month / Year Navigation
   Reports Header Switching
   Universal Quick Add

   UI CLEANUP 1
   ========================================================= */


/* =========================================================
   1. WAIT FOR PAGE TO LOAD
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /* =================================================
           2. UI CLEANUP
           ================================================= */

        function prepareCleanInterface() {

            /* ---------------------------------------------
               REMOVE STANDALONE MONEY MANAGEMENT PAGE

               Money actions now live in:
               - Universal Add button
               - Budget
               - Activity
               - Savings
               --------------------------------------------- */

            const moneyPage =
                document.querySelector(
                    '[data-page-content="money"]'
                );


            if (
                moneyPage
            ) {

                moneyPage.remove();

            }


            /* ---------------------------------------------
               CONVERT BOTTOM MONEY BUTTON INTO QUICK ADD

               Any other data-page="money" buttons are
               duplicate "Manage Money" links and are removed.
               --------------------------------------------- */

            const moneyButtons =
                document.querySelectorAll(
                    '[data-page="money"]'
                );


            moneyButtons.forEach(
                button => {

                    if (
                        button.classList.contains(
                            "nav-button"
                        )
                    ) {

                        button.setAttribute(
                            "data-quick-add-toggle",
                            ""
                        );


                        button.setAttribute(
                            "aria-haspopup",
                            "dialog"
                        );


                        button.setAttribute(
                            "aria-controls",
                            "quick-add-menu"
                        );


                        button.setAttribute(
                            "aria-expanded",
                            "false"
                        );


                        button.setAttribute(
                            "aria-label",
                            "Add money"
                        );


                        const icon =
                            button.querySelector(
                                ".nav-icon"
                            );


                        if (
                            icon
                        ) {

                            icon.textContent =
                                "＋";

                        }


                        const spans =
                            button.querySelectorAll(
                                "span"
                            );


                        if (
                            spans.length > 1
                        ) {

                            spans[
                                spans.length - 1
                            ].textContent =
                                "Add";

                        }

                    }

                    else {

                        /*
                            Remove duplicate:
                            + Manage Money

                            buttons from Dashboard /
                            Budget headings.
                        */

                        button.remove();

                    }

                }
            );


            /* ---------------------------------------------
               REMOVE DUPLICATE STARTING BALANCE
               FROM SETTINGS

               Starting Balance stays where it logically
               belongs: Budget.
               --------------------------------------------- */

            const settingsStartingBalance =
                document.getElementById(
                    "change-starting-balance"
                );


            if (
                settingsStartingBalance
            ) {

                settingsStartingBalance.remove();

            }


            /* ---------------------------------------------
               CREATE UNIVERSAL QUICK ADD MENU

               Reuses the existing Money Modal visual
               system so no financial-form code changes
               are required.
               --------------------------------------------- */

            if (
                !document.getElementById(
                    "quick-add-menu"
                )
            ) {

                document.body.insertAdjacentHTML(
                    "beforeend",
                    `
                    <div
                        class="money-modal quick-add-modal"
                        id="quick-add-menu"
                        aria-hidden="true"
                    >

                        <div
                            class="money-modal-overlay"
                            data-quick-add-close
                        >
                        </div>


                        <div
                            class="money-modal-content"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="quick-add-title"
                        >

                            <div class="money-modal-header">

                                <div>

                                    <p class="money-modal-label">
                                        M-Wallet
                                    </p>

                                    <h3 id="quick-add-title">
                                        Add Money
                                    </h3>

                                </div>


                                <button
                                    type="button"
                                    class="money-modal-close"
                                    data-quick-add-close
                                    aria-label="Close Add Money menu"
                                    title="Close"
                                >
                                    ×
                                </button>

                            </div>


                            <div class="money-modal-body">

                                <div class="money-action-grid">


                                    <button
                                        type="button"
                                        class="money-action-card"
                                        data-money-action="income"
                                    >

                                        <span class="money-action-icon">
                                            💵
                                        </span>


                                        <span class="money-action-content">

                                            <strong>
                                                Income
                                            </strong>

                                            <small>
                                                Record money coming in.
                                            </small>

                                        </span>


                                        <span class="money-action-arrow">
                                            ›
                                        </span>

                                    </button>


                                    <button
                                        type="button"
                                        class="money-action-card"
                                        data-money-action="bill"
                                    >

                                        <span class="money-action-icon">
                                            🧾
                                        </span>


                                        <span class="money-action-content">

                                            <strong>
                                                Bill
                                            </strong>

                                            <small>
                                                Add a one-time or recurring bill.
                                            </small>

                                        </span>


                                        <span class="money-action-arrow">
                                            ›
                                        </span>

                                    </button>


                                    <button
                                        type="button"
                                        class="money-action-card"
                                        data-money-action="expense"
                                    >

                                        <span class="money-action-icon">
                                            🛒
                                        </span>


                                        <span class="money-action-content">

                                            <strong>
                                                Expense
                                            </strong>

                                            <small>
                                                Record everyday spending.
                                            </small>

                                        </span>


                                        <span class="money-action-arrow">
                                            ›
                                        </span>

                                    </button>


                                    <button
                                        type="button"
                                        class="money-action-card"
                                        data-money-action="transaction"
                                    >

                                        <span class="money-action-icon">
                                            ⇄
                                        </span>


                                        <span class="money-action-content">

                                            <strong>
                                                Transaction
                                            </strong>

                                            <small>
                                                Manually record money in or out.
                                            </small>

                                        </span>


                                        <span class="money-action-arrow">
                                            ›
                                        </span>

                                    </button>


                                </div>

                            </div>

                        </div>

                    </div>
                    `
                );

            }

        }


        prepareCleanInterface();


        /* =================================================
           3. DOM REFERENCES
           ================================================= */

        const navigationButtons =
            document.querySelectorAll(
                "[data-page]:not([data-quick-add-toggle])"
            );


        const pages =
            document.querySelectorAll(
                "[data-page-content]"
            );


        const bottomNavButtons =
            document.querySelectorAll(
                ".nav-button"
            );


        const quickAddToggle =
            document.querySelector(
                "[data-quick-add-toggle]"
            );


        const quickAddMenu =
            document.getElementById(
                "quick-add-menu"
            );


        /* -------------------------------------------------
           STANDARD MONTH CONTROLS
           ------------------------------------------------- */

        const standardMonthNavigation =
            document.getElementById(
                "standard-month-navigation"
            );


        const monthSelect =
            document.getElementById(
                "month-select"
            );


        const yearSelect =
            document.getElementById(
                "year-select"
            );


        const previousMonthButton =
            document.getElementById(
                "previous-month"
            );


        const nextMonthButton =
            document.getElementById(
                "next-month"
            );


        const todayButton =
            document.getElementById(
                "today-month"
            );


        const currentMonthTitle =
            document.getElementById(
                "current-month"
            );


        /* -------------------------------------------------
           REPORTS HEADER CONTROLS
           ------------------------------------------------- */

        const reportNavigation =
            document.getElementById(
                "report-navigation"
            );


        const reportTypeSelect =
            document.getElementById(
                "report-type-select"
            );


        /* =================================================
           4. VALID APP PAGES
           ================================================= */

        const validPages = [

            "home",

            "budget",

            "transactions",

            "savings",

            "m-cash",

            "reports",

            "settings"

        ];


        /*
            Old #money links remain backward-compatible.

            Anyone opening an old Money Management URL
            will safely land on Budget instead.
        */

        const pageAliases = {

            money:
                "budget",

            "money-management":
                "budget"

        };


        /* =================================================
           5. QUICK ADD
           ================================================= */

        function openQuickAdd() {

            if (
                !quickAddMenu
            ) {

                return;

            }


            quickAddMenu.classList.add(
                "active"
            );


            quickAddMenu.setAttribute(
                "aria-hidden",
                "false"
            );


            if (
                quickAddToggle
            ) {

                quickAddToggle.setAttribute(
                    "aria-expanded",
                    "true"
                );

            }


            document.body.classList.add(
                "modal-open"
            );


            window.setTimeout(
                () => {

                    const firstAction =
                        quickAddMenu.querySelector(
                            "[data-money-action]"
                        );


                    if (
                        firstAction
                    ) {

                        firstAction.focus();

                    }

                },
                50
            );

        }


        function closeQuickAdd(
            restoreFocus = true
        ) {

            if (
                !quickAddMenu
            ) {

                return;

            }


            quickAddMenu.classList.remove(
                "active"
            );


            quickAddMenu.setAttribute(
                "aria-hidden",
                "true"
            );


            if (
                quickAddToggle
            ) {

                quickAddToggle.setAttribute(
                    "aria-expanded",
                    "false"
                );

            }


            /*
                Only unlock scrolling if the normal
                money form is not currently open.
            */

            const regularMoneyModal =
                document.getElementById(
                    "money-modal"
                );


            if (
                !regularMoneyModal ||
                !regularMoneyModal.classList.contains(
                    "active"
                )
            ) {

                document.body.classList.remove(
                    "modal-open"
                );

            }


            if (
                restoreFocus &&
                quickAddToggle
            ) {

                quickAddToggle.focus();

            }

        }


        if (
            quickAddToggle
        ) {

            quickAddToggle.addEventListener(
                "click",
                event => {

                    event.preventDefault();


                    if (
                        quickAddMenu
                            ?.classList
                            .contains(
                                "active"
                            )
                    ) {

                        closeQuickAdd();

                    }

                    else {

                        openQuickAdd();

                    }

                }
            );

        }


        if (
            quickAddMenu
        ) {

            quickAddMenu.addEventListener(
                "click",
                event => {

                    const closeButton =
                        event.target.closest(
                            "[data-quick-add-close]"
                        );


                    if (
                        closeButton
                    ) {

                        event.preventDefault();


                        closeQuickAdd();


                        return;

                    }


                    /*
                        money.js already listens for
                        [data-money-action].

                        We simply close this chooser first,
                        then money.js opens the real form.
                    */

                    const moneyAction =
                        event.target.closest(
                            "[data-money-action]"
                        );


                    if (
                        moneyAction
                    ) {

                        closeQuickAdd(
                            false
                        );

                    }

                }
            );

        }


        document.addEventListener(
            "keydown",
            event => {

                if (
                    event.key !==
                    "Escape"
                ) {

                    return;

                }


                if (
                    quickAddMenu
                        ?.classList
                        .contains(
                            "active"
                        )
                ) {

                    event.preventDefault();


                    closeQuickAdd();

                }

            }
        );


        /* =================================================
           6. RESOLVE PAGE FROM HASH
           ================================================= */

        function resolvePageFromHash(
            hash = window.location.hash
        ) {

            const rawPage =
                String(
                    hash ||
                    ""
                )
                    .replace(
                        /^#/,
                        ""
                    )
                    .trim()
                    .toLowerCase();


            if (
                !rawPage
            ) {

                return "home";

            }


            const resolvedPage =
                pageAliases[
                    rawPage
                ] ||
                rawPage;


            if (
                validPages.includes(
                    resolvedPage
                )
            ) {

                return resolvedPage;

            }


            return null;

        }


        /* =================================================
           7. HEADER MODE
           ================================================= */

        function updateHeaderForPage(
            pageName
        ) {

            const isReports =
                pageName ===
                "reports";


            /* ---------------------------------------------
               NORMAL MONTH / YEAR NAVIGATION
               --------------------------------------------- */

            if (
                standardMonthNavigation
            ) {

                standardMonthNavigation.hidden =
                    isReports;

            }


            /* ---------------------------------------------
               REPORT TYPE SELECTOR
               --------------------------------------------- */

            if (
                reportNavigation
            ) {

                reportNavigation.hidden =
                    !isReports;

            }


            /* ---------------------------------------------
               NOTIFY APP
               --------------------------------------------- */

            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:header-mode-changed",
                    {

                        detail: {

                            page:
                                pageName,

                            mode:
                                isReports
                                    ? "reports"
                                    : "standard"

                        }

                    }
                )

            );

        }


        /* =================================================
           8. SHOW PAGE
           ================================================= */

        function showPage(
            pageName,
            updateHistory = true
        ) {

            const resolvedPage =
                pageAliases[
                    pageName
                ] ||
                pageName;


            const targetPage =
                document.querySelector(
                    `[data-page-content="${resolvedPage}"]`
                );


            if (
                !targetPage
            ) {

                console.warn(
                    `Page "${resolvedPage}" was not found.`
                );


                return;

            }


            closeQuickAdd(
                false
            );


            /* ---------------------------------------------
               HIDE EVERY PAGE
               --------------------------------------------- */

            pages.forEach(
                page => {

                    page.classList.remove(
                        "active"
                    );

                }
            );


            /* ---------------------------------------------
               SHOW REQUESTED PAGE
               --------------------------------------------- */

            targetPage.classList.add(
                "active"
            );


            /* ---------------------------------------------
               UPDATE HEADER
               --------------------------------------------- */

            updateHeaderForPage(
                resolvedPage
            );


            /* ---------------------------------------------
               CLEAR NAV ACTIVE STATES
               --------------------------------------------- */

            bottomNavButtons.forEach(
                button => {

                    button.classList.remove(
                        "active"
                    );

                }
            );


            /* ---------------------------------------------
               HIGHLIGHT CURRENT DESTINATION

               Quick Add is an action, not a page, so
               it never receives the page-active state.
               --------------------------------------------- */

            const activeNavButton =
                document.querySelector(
                    `.nav-button[data-page="${resolvedPage}"]:not([data-quick-add-toggle])`
                );


            if (
                activeNavButton
            ) {

                activeNavButton.classList.add(
                    "active"
                );

            }


            /* ---------------------------------------------
               SCROLL TO TOP
               --------------------------------------------- */

            window.scrollTo({

                top:
                    0,

                behavior:
                    "smooth"

            });


            /* ---------------------------------------------
               UPDATE URL
               --------------------------------------------- */

            if (
                updateHistory
            ) {

                history.pushState(
                    {

                        page:
                            resolvedPage

                    },
                    "",
                    `#${resolvedPage}`
                );

            }


            /* ---------------------------------------------
               EXISTING BUDGET EVENT
               --------------------------------------------- */

            document.dispatchEvent(

                new CustomEvent(
                    "budget:page-changed",
                    {

                        detail: {

                            page:
                                resolvedPage

                        }

                    }
                )

            );


            /* ---------------------------------------------
               M-WALLET PAGE EVENT
               --------------------------------------------- */

            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:page-changed",
                    {

                        detail: {

                            page:
                                resolvedPage

                        }

                    }
                )

            );

        }


        /* =================================================
           9. URL NAVIGATION
           ================================================= */

        function handleUrlNavigation() {

            const resolvedPage =
                resolvePageFromHash();


            const pageName =
                resolvedPage ||
                "home";


            const canonicalHash =
                `#${pageName}`;


            if (
                window.location.hash !==
                canonicalHash
            ) {

                history.replaceState(
                    null,
                    "",
                    canonicalHash
                );

            }


            showPage(
                pageName,
                false
            );

        }


        /* =================================================
           10. PAGE NAVIGATION BUTTONS
           ================================================= */

        navigationButtons.forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const requestedPage =
                            button.dataset.page;


                        const pageName =
                            pageAliases[
                                requestedPage
                            ] ||
                            requestedPage;


                        if (
                            !validPages.includes(
                                pageName
                            )
                        ) {

                            console.warn(
                                `Unknown page: ${requestedPage}`
                            );


                            return;

                        }


                        const currentPage =
                            document.querySelector(
                                ".page.active"
                            );


                        if (
                            currentPage
                                ?.dataset
                                .pageContent ===
                            pageName
                        ) {

                            updateHeaderForPage(
                                pageName
                            );


                            return;

                        }


                        showPage(
                            pageName
                        );

                    }
                );

            }
        );


        /* =================================================
           11. LOAD STARTING PAGE
           ================================================= */

        function loadStartingPage() {

            handleUrlNavigation();

        }


        /* =================================================
           12. BROWSER BACK / FORWARD
           ================================================= */

        window.addEventListener(
            "popstate",
            () => {

                handleUrlNavigation();

            }
        );


        window.addEventListener(
            "hashchange",
            () => {

                handleUrlNavigation();

            }
        );


        /* =================================================
           13. BUILD YEAR OPTIONS
           ================================================= */

        function buildYearOptions() {

            if (
                !yearSelect
            ) {

                return;

            }


            yearSelect.innerHTML =
                "";


            const currentYear =
                new Date()
                    .getFullYear();


            const startYear =
                currentYear - 5;


            const endYear =
                currentYear + 10;


            for (
                let year =
                    startYear;

                year <=
                    endYear;

                year++
            ) {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    String(
                        year
                    );


                option.textContent =
                    String(
                        year
                    );


                yearSelect.appendChild(
                    option
                );

            }

        }


        /* =================================================
           14. ENSURE YEAR EXISTS
           ================================================= */

        function ensureYearExists(
            year
        ) {

            if (
                !yearSelect
            ) {

                return;

            }


            const yearString =
                String(
                    year
                );


            const existingOption =
                Array.from(
                    yearSelect.options
                ).find(
                    option =>
                        option.value ===
                        yearString
                );


            if (
                existingOption
            ) {

                return;

            }


            const option =
                document.createElement(
                    "option"
                );


            option.value =
                yearString;


            option.textContent =
                yearString;


            yearSelect.appendChild(
                option
            );


            const options =
                Array.from(
                    yearSelect.options
                );


            options.sort(
                (
                    first,
                    second
                ) =>

                    Number(
                        first.value
                    )
                    -
                    Number(
                        second.value
                    )
            );


            yearSelect.innerHTML =
                "";


            options.forEach(
                yearOption => {

                    yearSelect.appendChild(
                        yearOption
                    );

                }
            );

        }


        /* =================================================
           15. UPDATE MONTH TITLE
           ================================================= */

        function updateMonthTitle() {

            if (
                !monthSelect ||
                !yearSelect ||
                !currentMonthTitle
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


            currentMonthTitle.textContent =
                `${monthName} ${yearSelect.value}`;

        }


        /* =================================================
           16. GET SELECTED PERIOD
           ================================================= */

        function getSelectedPeriod() {

            if (
                !monthSelect ||
                !yearSelect
            ) {

                return null;

            }


            return {

                month:
                    Number(
                        monthSelect.value
                    ),

                year:
                    Number(
                        yearSelect.value
                    )

            };

        }


        /* =================================================
           17. SET SELECTED PERIOD
           ================================================= */

        function setSelectedPeriod(
            year,
            month
        ) {

            if (
                !monthSelect ||
                !yearSelect
            ) {

                return;

            }


            ensureYearExists(
                year
            );


            const monthString =
                String(
                    month
                ).padStart(
                    2,
                    "0"
                );


            monthSelect.value =
                monthString;


            yearSelect.value =
                String(
                    year
                );


            updateMonthTitle();


            const detail = {

                year,

                month:
                    monthString,

                monthKey:
                    `${year}-${monthString}`

            };


            document.dispatchEvent(

                new CustomEvent(
                    "budget:month-changed",
                    {
                        detail
                    }
                )

            );


            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:month-changed",
                    {
                        detail
                    }
                )

            );

        }


        /* =================================================
           18. INITIALIZE MONTH NAVIGATION
           ================================================= */

        function initializeMonthNavigation() {

            if (
                !monthSelect ||
                !yearSelect
            ) {

                return;

            }


            buildYearOptions();


            const today =
                new Date();


            const year =
                today.getFullYear();


            const month =
                today.getMonth() + 1;


            ensureYearExists(
                year
            );


            monthSelect.value =
                String(
                    month
                ).padStart(
                    2,
                    "0"
                );


            yearSelect.value =
                String(
                    year
                );


            updateMonthTitle();

        }


        /* =================================================
           19. MONTH DROPDOWN
           ================================================= */

        if (
            monthSelect
        ) {

            monthSelect.addEventListener(
                "change",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (
                        !period
                    ) {

                        return;

                    }


                    setSelectedPeriod(
                        period.year,
                        period.month
                    );

                }
            );

        }


        /* =================================================
           20. YEAR DROPDOWN
           ================================================= */

        if (
            yearSelect
        ) {

            yearSelect.addEventListener(
                "change",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (
                        !period
                    ) {

                        return;

                    }


                    setSelectedPeriod(
                        period.year,
                        period.month
                    );

                }
            );

        }


        /* =================================================
           21. PREVIOUS MONTH
           ================================================= */

        if (
            previousMonthButton
        ) {

            previousMonthButton.addEventListener(
                "click",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (
                        !period
                    ) {

                        return;

                    }


                    let year =
                        period.year;


                    let month =
                        period.month - 1;


                    if (
                        month < 1
                    ) {

                        month =
                            12;


                        year -=
                            1;

                    }


                    setSelectedPeriod(
                        year,
                        month
                    );

                }
            );

        }


        /* =================================================
           22. NEXT MONTH
           ================================================= */

        if (
            nextMonthButton
        ) {

            nextMonthButton.addEventListener(
                "click",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (
                        !period
                    ) {

                        return;

                    }


                    let year =
                        period.year;


                    let month =
                        period.month + 1;


                    if (
                        month > 12
                    ) {

                        month =
                            1;


                        year +=
                            1;

                    }


                    setSelectedPeriod(
                        year,
                        month
                    );

                }
            );

        }


        /* =================================================
           23. TODAY BUTTON
           ================================================= */

        if (
            todayButton
        ) {

            todayButton.addEventListener(
                "click",
                () => {

                    const today =
                        new Date();


                    setSelectedPeriod(

                        today.getFullYear(),

                        today.getMonth() + 1

                    );

                }
            );

        }


        /* =================================================
           24. REPORT TYPE
           ================================================= */

        if (
            reportTypeSelect
        ) {

            reportTypeSelect.addEventListener(
                "change",
                () => {

                    const reportType =
                        reportTypeSelect.value;


                    document.dispatchEvent(

                        new CustomEvent(
                            "mwallet:report-type-changed",
                            {

                                detail: {

                                    reportType

                                }

                            }
                        )

                    );

                }
            );

        }


        /* =================================================
           25. START NAVIGATION
           ================================================= */

        initializeMonthNavigation();


        loadStartingPage();


        /* =================================================
           26. EXPOSE NAVIGATION
           ================================================= */

        window.BudgetNavigation = {

            showPage,

            getSelectedPeriod,

            setSelectedPeriod,

            updateHeaderForPage,

            openQuickAdd,

            closeQuickAdd,


            getCurrentPage() {

                const currentPage =
                    document.querySelector(
                        ".page.active"
                    );


                return (

                    currentPage
                        ?.dataset
                        .pageContent ||

                    "home"

                );

            },


            isReportsPage() {

                return (

                    this.getCurrentPage() ===
                    "reports"

                );

            }

        };


        window.MWalletNavigation =
            window.BudgetNavigation;


        console.log(
            "M-Wallet navigation loaded - simplified navigation + Quick Add ready."
        );

    }
);


/* =========================================================
   END NAV.JS
   ========================================================= */