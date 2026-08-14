/* =========================================================
   BUDGET TRACKER
   PWA / APP INSTALL SYSTEM
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const installButton = document.getElementById("installAppButton");

    let deferredInstallPrompt = null;


    /* =====================================================
       1. REGISTER SERVICE WORKER
       ===================================================== */

    if ("serviceWorker" in navigator) {

        window.addEventListener("load", () => {

            navigator.serviceWorker
                .register("./service-worker.js")
                .then((registration) => {

                    console.log(
                        "Budget Tracker service worker registered:",
                        registration.scope
                    );

                })
                .catch((error) => {

                    console.error(
                        "Service worker registration failed:",
                        error
                    );

                });

        });

    }


    /* =====================================================
       2. CHECK IF APP IS ALREADY INSTALLED
       ===================================================== */

    const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    if (isStandalone && installButton) {
        installButton.hidden = true;
    }


    /* =====================================================
       3. INSTALL PROMPT
       ===================================================== */

    window.addEventListener("beforeinstallprompt", (event) => {

        // Stop browser from immediately showing its own prompt.
        event.preventDefault();

        deferredInstallPrompt = event;

        if (installButton) {
            installButton.hidden = false;
        }

    });


    /* =====================================================
       4. INSTALL BUTTON
       ===================================================== */

    if (installButton) {

        installButton.addEventListener("click", async () => {

            if (!deferredInstallPrompt) {
                return;
            }

            deferredInstallPrompt.prompt();

            const result =
                await deferredInstallPrompt.userChoice;

            console.log(
                "Install result:",
                result.outcome
            );

            deferredInstallPrompt = null;

            installButton.hidden = true;

        });

    }


    /* =====================================================
       5. APP INSTALLED
       ===================================================== */

    window.addEventListener("appinstalled", () => {

        console.log("Budget Tracker installed.");

        deferredInstallPrompt = null;

        if (installButton) {
            installButton.hidden = true;
        }

    });

});