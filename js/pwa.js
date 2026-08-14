/* =========================================================
   BUDGET TRACKER
   PWA / APP INSTALL SYSTEM
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const installButton =
        document.getElementById("installAppButton");

    const installedMessage =
        document.getElementById("app-installed-message");


    let deferredInstallPrompt = null;


    /* =====================================================
       1. DEVICE / APP MODE CHECKS
       ===================================================== */

    const isIOS =
        /iphone|ipad|ipod/i.test(
            window.navigator.userAgent
        );


    const isStandalone = () => {

        return (
            window.matchMedia(
                "(display-mode: standalone)"
            ).matches ||

            window.navigator.standalone === true
        );

    };


    /* =====================================================
       2. UPDATE INSTALL DISPLAY
       ===================================================== */

    function updateInstallDisplay() {

        /*
           App is already installed / running
           in standalone mode.
        */

        if (isStandalone()) {

            if (installButton) {
                installButton.hidden = true;
            }

            if (installedMessage) {
                installedMessage.hidden = false;
            }

            return;
        }


        /*
           Normal browser mode.
        */

        if (installedMessage) {
            installedMessage.hidden = true;
        }


        /*
           iPhone / iPad do not normally fire
           beforeinstallprompt.

           Show our install button anyway so
           we can explain how to add the app.
        */

        if (isIOS && installButton) {
            installButton.hidden = false;
        }

    }


    updateInstallDisplay();



    /* =====================================================
       3. REGISTER SERVICE WORKER
       ===================================================== */

    if ("serviceWorker" in navigator) {

        window.addEventListener("load", async () => {

            try {

                const registration =
                    await navigator.serviceWorker.register(
                        "./service-worker.js",
                        {
                            scope: "./"
                        }
                    );


                console.log(
                    "[PWA] Service worker registered:",
                    registration.scope
                );


                /*
                   Check GitHub for a newer
                   service-worker.js whenever
                   the app launches.
                */

                try {

                    await registration.update();

                    console.log(
                        "[PWA] Checked for app updates."
                    );

                }
                catch (updateError) {

                    console.warn(
                        "[PWA] Update check failed:",
                        updateError
                    );

                }


            }
            catch (error) {

                console.error(
                    "[PWA] Service worker registration failed:",
                    error
                );

            }

        });

    }
    else {

        console.warn(
            "[PWA] Service workers are not supported."
        );

    }



    /* =====================================================
       4. BROWSER INSTALL PROMPT
       ===================================================== */

    window.addEventListener(
        "beforeinstallprompt",
        (event) => {

            /*
               Prevent the browser from immediately
               displaying its own installation UI.
            */

            event.preventDefault();


            /*
               Save the event so our Settings
               button can trigger it.
            */

            deferredInstallPrompt = event;


            /*
               Show Install Budget Tracker.
            */

            if (
                installButton &&
                !isStandalone()
            ) {

                installButton.hidden = false;

            }


            console.log(
                "[PWA] Budget Tracker can be installed."
            );

        }
    );



    /* =====================================================
       5. INSTALL BUTTON
       ===================================================== */

    if (installButton) {

        installButton.addEventListener(
            "click",
            async () => {


                /* =========================================
                   IPHONE / IPAD
                   ========================================= */

                if (
                    isIOS &&
                    !deferredInstallPrompt
                ) {

                    alert(
                        "To install Budget Tracker on your iPhone or iPad:\n\n" +
                        "1. Open Budget Tracker in Safari.\n" +
                        "2. Tap the Share button.\n" +
                        "3. Tap “Add to Home Screen.”\n" +
                        "4. Tap “Add.”\n\n" +
                        "Budget Tracker will then appear on your Home Screen like an app."
                    );

                    return;

                }



                /* =========================================
                   CHROME / EDGE / SUPPORTED BROWSERS
                   ========================================= */

                if (!deferredInstallPrompt) {

                    console.log(
                        "[PWA] Install prompt is not currently available."
                    );

                    return;

                }


                try {

                    deferredInstallPrompt.prompt();


                    const result =
                        await deferredInstallPrompt.userChoice;


                    console.log(
                        "[PWA] Install result:",
                        result.outcome
                    );


                    /*
                       The prompt can only be used once.
                    */

                    deferredInstallPrompt = null;


                    /*
                       Hide button after accepted install.
                    */

                    if (
                        result.outcome === "accepted"
                    ) {

                        installButton.hidden = true;

                    }


                }
                catch (error) {

                    console.error(
                        "[PWA] Installation failed:",
                        error
                    );

                }

            }
        );

    }



    /* =====================================================
       6. APP INSTALLED EVENT
       ===================================================== */

    window.addEventListener(
        "appinstalled",
        () => {

            console.log(
                "[PWA] Budget Tracker installed successfully."
            );


            deferredInstallPrompt = null;


            if (installButton) {
                installButton.hidden = true;
            }


            if (installedMessage) {
                installedMessage.hidden = false;
            }

        }
    );



    /* =====================================================
       7. WATCH FOR DISPLAY MODE CHANGES
       ===================================================== */

    const standaloneMedia =
        window.matchMedia(
            "(display-mode: standalone)"
        );


    standaloneMedia.addEventListener(
        "change",
        () => {

            updateInstallDisplay();

        }
    );



    /* =====================================================
       8. SERVICE WORKER READY
       ===================================================== */

    if ("serviceWorker" in navigator) {

        navigator.serviceWorker.ready

            .then(() => {

                console.log(
                    "[PWA] Budget Tracker is ready for offline use."
                );

            })

            .catch((error) => {

                console.warn(
                    "[PWA] Service worker not ready:",
                    error
                );

            });

    }

});