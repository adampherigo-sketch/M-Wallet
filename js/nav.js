/* =========================================================
   M-WALLET
   Navigation + Month / Year Navigation
   Reports Header Switching
   nav.js
   ========================================================= */


/* =========================================================
   1. WAIT FOR PAGE TO LOAD
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {

        /* =================================================
           DOM REFERENCES
           ================================================= */

        const navigationButtons =
            document.querySelectorAll(
                "[data-page]"
            );


        const pages =
            document.querySelectorAll(
                "[data-page-content]"
            );


        const bottomNavButtons =
            document.querySelectorAll(
                ".nav-button"
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
           2. VALID APP PAGES
           ================================================= */

        const validPages = [

            "home",

            "budget",

            "money",

            "transactions",

            "savings",

            "m-cash",

            "reports",

            "settings"

        ];


        const pageAliases = {

            "money-management":
                "money"

        };


        function resolvePageFromHash(
            hash = window.location.hash
        ) {

            const rawPage =
                String(
                    hash || ""
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
           3. HEADER MODE
           ================================================= */

        function updateHeaderForPage(
            pageName
        ) {

            const isReports =
                pageName ===
                "reports";


            /* ---------------------------------------------
               Normal Month / Year Navigation
               --------------------------------------------- */

            if (
                standardMonthNavigation
            ) {

                standardMonthNavigation.hidden =
                    isReports;

            }


            /* ---------------------------------------------
               Reports Type Selector
               --------------------------------------------- */

            if (
                reportNavigation
            ) {

                reportNavigation.hidden =
                    !isReports;

            }


            /* ---------------------------------------------
               Notify the rest of M-Wallet
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
           4. SHOW PAGE
           ================================================= */

        function showPage(
            pageName,
            updateHistory = true
        ) {

            const targetPage =
                document.querySelector(
                    `[data-page-content="${pageName}"]`
                );


            if (!targetPage) {

                console.warn(
                    `Page "${pageName}" was not found.`
                );

                return;

            }


            /* ---------------------------------------------
               Hide every page
               --------------------------------------------- */

            pages.forEach(
                page => {

                    page.classList.remove(
                        "active"
                    );

                }
            );


            /* ---------------------------------------------
               Show requested page
               --------------------------------------------- */

            targetPage.classList.add(
                "active"
            );


            /* ---------------------------------------------
               Update Header Mode
               --------------------------------------------- */

            updateHeaderForPage(
                pageName
            );


            /* ---------------------------------------------
               Remove Active State From Bottom Navigation
               --------------------------------------------- */

            bottomNavButtons.forEach(
                button => {

                    button.classList.remove(
                        "active"
                    );

                }
            );


            /* ---------------------------------------------
               Highlight Correct Bottom Navigation Button
               --------------------------------------------- */

            const activeNavButton =
                document.querySelector(
                    `.nav-button[data-page="${pageName}"]`
                );


            if (
                activeNavButton
            ) {

                activeNavButton.classList.add(
                    "active"
                );

            }


            /* ---------------------------------------------
               Scroll To Top
               --------------------------------------------- */

            window.scrollTo({

                top:
                    0,

                behavior:
                    "smooth"

            });


            /* ---------------------------------------------
               Update URL
               --------------------------------------------- */

            if (
                updateHistory
            ) {

                history.pushState(
                    {

                        page:
                            pageName

                    },
                    "",
                    `#${pageName}`
                );

            }


            /* ---------------------------------------------
               Notify Existing Budget Code
               --------------------------------------------- */

            document.dispatchEvent(

                new CustomEvent(
                    "budget:page-changed",
                    {

                        detail: {

                            page:
                                pageName

                        }

                    }
                )

            );


            /* ---------------------------------------------
               Notify M-Wallet Code
               --------------------------------------------- */

            document.dispatchEvent(

                new CustomEvent(
                    "mwallet:page-changed",
                    {

                        detail: {

                            page:
                                pageName

                        }

                    }
                )

            );

        }


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
           5. PAGE NAVIGATION BUTTONS
           ================================================= */

        navigationButtons.forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const pageName =
                            button.dataset.page;


                        if (
                            !validPages.includes(
                                pageName
                            )
                        ) {

                            console.warn(
                                `Unknown page: ${pageName}`
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

                            /*
                                Even if already on the page,
                                make sure the correct header
                                mode is active.
                            */

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
           6. LOAD STARTING PAGE
           ================================================= */

        function loadStartingPage() {

            handleUrlNavigation();

        }


        /* =================================================
           7. BROWSER BACK / FORWARD
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
           8. BUILD STANDARD YEAR OPTIONS
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
           9. CHECK / ADD STANDARD YEAR OPTION
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
                    a,
                    b
                ) =>

                    Number(
                        a.value
                    )
                    -
                    Number(
                        b.value
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
           10. UPDATE MONTH TITLE
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
           11. GET SELECTED PERIOD
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
           12. SET SELECTED PERIOD
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
           13. INITIALIZE CURRENT MONTH
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
           14. MONTH DROPDOWN CHANGED
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
           15. YEAR DROPDOWN CHANGED
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
           16. PREVIOUS MONTH
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
           17. NEXT MONTH
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
           18. TODAY BUTTON
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
           19. REPORT TYPE CHANGE EVENT
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
           20. START NAVIGATION
           ================================================= */

        initializeMonthNavigation();


        loadStartingPage();


        /* =================================================
           21. EXPOSE NAVIGATION
           ================================================= */

        window.BudgetNavigation = {

            showPage,

            getSelectedPeriod,

            setSelectedPeriod,

            updateHeaderForPage,

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
            "M-Wallet navigation loaded - Reports header switching ready."
        );

    }
);


/* =========================================================
   END NAV.JS
   ========================================================= */