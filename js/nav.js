/* =========================================================
   BUDGET TRACKER
   Navigation + Month / Year Navigation
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


        /* Month controls */

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


        /* =================================================
           2. VALID APP PAGES
           ================================================= */

        /*
            Money Management is now an official app page.
        */

        const validPages = [

            "home",

            "budget",

            "money",

            "transactions",

            "savings",

            "reports",

            "settings"

        ];


        /* =================================================
           3. SHOW PAGE
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
               Remove active state from nav
               --------------------------------------------- */

            bottomNavButtons.forEach(
                button => {

                    button.classList.remove(
                        "active"
                    );

                }
            );


            /* ---------------------------------------------
               Highlight correct nav button

               Settings has no bottom nav tab.
               --------------------------------------------- */

            const activeNavButton =
                document.querySelector(
                    `.nav-button[data-page="${pageName}"]`
                );


            if (activeNavButton) {

                activeNavButton.classList.add(
                    "active"
                );

            }


            /* ---------------------------------------------
               Scroll to top
               --------------------------------------------- */

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });


            /* ---------------------------------------------
               Update URL
               --------------------------------------------- */

            if (updateHistory) {

                history.pushState(
                    {
                        page: pageName
                    },
                    "",
                    `#${pageName}`
                );

            }


            /* ---------------------------------------------
               Tell the rest of the app the page changed
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

        }


        /* =================================================
           4. PAGE NAVIGATION BUTTONS
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


                        /*
                            Don't create duplicate history
                            entries when clicking the page
                            you're already viewing.
                        */

                        const currentPage =
                            document.querySelector(
                                ".page.active"
                            );


                        if (
                            currentPage?.dataset.pageContent ===
                            pageName
                        ) {

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
           5. LOAD STARTING PAGE
           ================================================= */

        function loadStartingPage() {

            const pageFromURL =
                window.location.hash
                    .replace(
                        "#",
                        ""
                    );


            const pageName =
                validPages.includes(
                    pageFromURL
                )

                    ? pageFromURL

                    : "home";


            /*
                Use replaceState on initial page load.

                This avoids adding an unnecessary first
                history entry.
            */

            history.replaceState(
                {
                    page: pageName
                },
                "",
                `#${pageName}`
            );


            showPage(
                pageName,
                false
            );

        }


        /* =================================================
           6. BROWSER BACK / FORWARD
           ================================================= */

        window.addEventListener(
            "popstate",
            () => {

                const pageName =
                    window.location.hash
                        .replace(
                            "#",
                            ""
                        );


                if (
                    validPages.includes(
                        pageName
                    )
                ) {

                    showPage(
                        pageName,
                        false
                    );

                }

            }
        );


        /* =================================================
           7. YEAR SELECT OPTIONS
           ================================================= */

        function buildYearOptions() {

            if (!yearSelect) {
                return;
            }


            /*
                Clear existing options first.
            */

            yearSelect.innerHTML =
                "";


            const currentYear =
                new Date()
                    .getFullYear();


            /*
                Give the app a useful range.

                Example in 2026:

                2021 → 2036
            */

            const startYear =
                currentYear - 5;


            const endYear =
                currentYear + 10;


            for (
                let year = startYear;
                year <= endYear;
                year++
            ) {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    String(year);


                option.textContent =
                    String(year);


                yearSelect.appendChild(
                    option
                );

            }

        }


        /* =================================================
           8. CHECK / ADD YEAR OPTION
           ================================================= */

        /*
            This allows month navigation to move outside
            the initial year range if needed.
        */

        function ensureYearExists(
            year
        ) {

            if (!yearSelect) {
                return;
            }


            const yearString =
                String(year);


            const existingOption =
                Array.from(
                    yearSelect.options
                ).find(
                    option =>
                        option.value ===
                        yearString
                );


            if (existingOption) {
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


            /*
                Keep years sorted.
            */

            const options =
                Array.from(
                    yearSelect.options
                );


            options.sort(
                (a, b) =>
                    Number(a.value) -
                    Number(b.value)
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
           9. UPDATE MONTH TITLE
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
           10. GET SELECTED PERIOD
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
           11. SET SELECTED PERIOD
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


            monthSelect.value =
                String(month)
                    .padStart(
                        2,
                        "0"
                    );


            yearSelect.value =
                String(year);


            updateMonthTitle();


            /*
                Tell app.js the month/year changed.

                app.js listens for:

                    budget:month-changed

                and redraws all budget information.
            */

            document.dispatchEvent(

                new CustomEvent(
                    "budget:month-changed",
                    {
                        detail: {

                            year,

                            month:
                                String(month)
                                    .padStart(
                                        2,
                                        "0"
                                    ),

                            monthKey:
                                (
                                    `${year}-` +
                                    `${String(month)
                                        .padStart(
                                            2,
                                            "0"
                                        )}`
                                )

                        }
                    }
                )

            );

        }


        /* =================================================
           12. INITIALIZE CURRENT MONTH
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
                String(month)
                    .padStart(
                        2,
                        "0"
                    );


            yearSelect.value =
                String(year);


            updateMonthTitle();

        }


        /* =================================================
           13. MONTH DROPDOWN CHANGED
           ================================================= */

        if (monthSelect) {

            monthSelect.addEventListener(
                "change",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (!period) {
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
           14. YEAR DROPDOWN CHANGED
           ================================================= */

        if (yearSelect) {

            yearSelect.addEventListener(
                "change",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (!period) {
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
           15. PREVIOUS MONTH
           ================================================= */

        if (previousMonthButton) {

            previousMonthButton.addEventListener(
                "click",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (!period) {
                        return;
                    }


                    let year =
                        period.year;


                    let month =
                        period.month - 1;


                    /*
                        January → December previous year
                    */

                    if (month < 1) {

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
           16. NEXT MONTH
           ================================================= */

        if (nextMonthButton) {

            nextMonthButton.addEventListener(
                "click",
                () => {

                    const period =
                        getSelectedPeriod();


                    if (!period) {
                        return;
                    }


                    let year =
                        period.year;


                    let month =
                        period.month + 1;


                    /*
                        December → January next year
                    */

                    if (month > 12) {

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
           17. TODAY BUTTON
           ================================================= */

        if (todayButton) {

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
           18. START NAVIGATION
           ================================================= */

        /*
            Month navigation needs to initialize BEFORE
            app.js reads the selected month.
        */

        initializeMonthNavigation();


        loadStartingPage();


        /* =================================================
           19. EXPOSE NAVIGATION
           ================================================= */

        /*
            Makes it possible for other JavaScript files
            to change screens later.

            Example:

                BudgetNavigation.showPage("money");
        */

        window.BudgetNavigation = {

            showPage,

            getSelectedPeriod,

            setSelectedPeriod

        };


        console.log(
            "Budget Tracker navigation loaded."
        );

    }
);


/* =========================================================
   END NAV.JS
   ========================================================= */