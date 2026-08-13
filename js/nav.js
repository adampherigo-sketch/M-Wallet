/* =========================================================
   BUDGET TRACKER
   Navigation System
   ========================================================= */


/* =========================================================
   1. WAIT FOR PAGE TO LOAD
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    // Find every button/link that has a data-page attribute.
    // Examples:
    // data-page="home"
    // data-page="budget"
    // data-page="savings"

    const navigationButtons = document.querySelectorAll("[data-page]");

    // Find every app page.
    const pages = document.querySelectorAll("[data-page-content]");

    // Bottom navigation buttons only.
    const bottomNavButtons = document.querySelectorAll(".nav-button");


    /* =====================================================
       2. SHOW PAGE FUNCTION
       ===================================================== */

    function showPage(pageName) {

        // Find the page that matches the requested page name.
        const targetPage = document.querySelector(
            `[data-page-content="${pageName}"]`
        );

        // Stop if the page does not exist.
        if (!targetPage) {
            console.warn(`Page "${pageName}" was not found.`);
            return;
        }


        /* -----------------------------------------------
           Hide all pages
        ------------------------------------------------ */

        pages.forEach((page) => {
            page.classList.remove("active");
        });


        /* -----------------------------------------------
           Show selected page
        ------------------------------------------------ */

        targetPage.classList.add("active");


        /* -----------------------------------------------
           Remove active state from bottom navigation
        ------------------------------------------------ */

        bottomNavButtons.forEach((button) => {
            button.classList.remove("active");
        });


        /* -----------------------------------------------
           Highlight correct bottom navigation button

           Settings does not have a bottom navigation
           button, so nothing will be highlighted there.
        ------------------------------------------------ */

        const activeNavButton = document.querySelector(
            `.nav-button[data-page="${pageName}"]`
        );

        if (activeNavButton) {
            activeNavButton.classList.add("active");
        }


        /* -----------------------------------------------
           Scroll back to top when switching screens
        ------------------------------------------------ */

        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });


        /* -----------------------------------------------
           Update URL hash

           Example:
           #home
           #budget
           #savings
        ------------------------------------------------ */

        history.replaceState(
            null,
            "",
            `#${pageName}`
        );
    }


    /* =====================================================
       3. NAVIGATION BUTTON CLICKS
       ===================================================== */

    navigationButtons.forEach((button) => {

        button.addEventListener("click", () => {

            const pageName = button.dataset.page;

            showPage(pageName);

        });

    });


    /* =====================================================
       4. LOAD CORRECT PAGE ON STARTUP
       ===================================================== */

    function loadStartingPage() {

        // Remove the # from the URL.
        const pageFromURL = window.location.hash.replace("#", "");

        // List of valid pages currently in the app.
        const validPages = [
            "home",
            "budget",
            "transactions",
            "savings",
            "reports",
            "settings"
        ];


        // If URL contains a valid page, open it.
        if (validPages.includes(pageFromURL)) {

            showPage(pageFromURL);

        } else {

            // Otherwise always start on dashboard.
            showPage("home");

        }

    }


    loadStartingPage();


    /* =====================================================
       5. BROWSER BACK / FORWARD SUPPORT
       ===================================================== */

    window.addEventListener("hashchange", () => {

        const pageName = window.location.hash.replace("#", "");

        const pageExists = document.querySelector(
            `[data-page-content="${pageName}"]`
        );

        if (pageExists) {
            showPage(pageName);
        }

    });

});