/* =========================================================
   BUDGET TRACKER
   Service Worker
   GitHub / PWA Ready
   ========================================================= */


/* =========================================================
   1. CACHE VERSION
   ========================================================= */

const CACHE_NAME = "budget-tracker-v2";


/* =========================================================
   2. CORE APP FILES
   ========================================================= */

const APP_SHELL = [

    "./",
    "./index.html",

    "./manifest.json",

    "./css/style.css",

    "./js/storage.js",
    "./js/nav.js",
    "./js/app.js",
    "./js/money.js",
    "./js/pwa.js",

    "./icons/icon-192.png",
    "./icons/icon-512.png",
    "./icons/icon-512-maskable.png",
    "./icons/apple-touch-icon.png"

];


/* =========================================================
   3. INSTALL
   ========================================================= */

self.addEventListener("install", (event) => {

    console.log(
        "[Service Worker] Installing:",
        CACHE_NAME
    );


    event.waitUntil(

        caches
            .open(CACHE_NAME)

            .then((cache) => {

                console.log(
                    "[Service Worker] Caching app shell"
                );

                return cache.addAll(APP_SHELL);

            })

    );


    /*
       Activate this new service worker immediately
       instead of waiting for old tabs to close.
    */

    self.skipWaiting();

});


/* =========================================================
   4. ACTIVATE
   ========================================================= */

self.addEventListener("activate", (event) => {

    console.log(
        "[Service Worker] Activating:",
        CACHE_NAME
    );


    event.waitUntil(

        caches
            .keys()

            .then((cacheNames) => {

                return Promise.all(

                    cacheNames.map((cacheName) => {

                        if (cacheName !== CACHE_NAME) {

                            console.log(
                                "[Service Worker] Removing old cache:",
                                cacheName
                            );

                            return caches.delete(cacheName);

                        }

                        return null;

                    })

                );

            })

    );


    /*
       Take control of currently open Budget Tracker pages.
    */

    self.clients.claim();

});


/* =========================================================
   5. FETCH REQUESTS
   ========================================================= */

self.addEventListener("fetch", (event) => {


    /* -----------------------------------------------------
       Ignore anything that is not a GET request.
    ----------------------------------------------------- */

    if (event.request.method !== "GET") {
        return;
    }


    const requestURL =
        new URL(event.request.url);


    /* -----------------------------------------------------
       Only manage files belonging to Budget Tracker.

       This prevents the service worker from attempting
       to cache outside websites/resources.
    ----------------------------------------------------- */

    if (
        requestURL.origin !==
        self.location.origin
    ) {
        return;
    }



    /* =====================================================
       6. PAGE NAVIGATION
       NETWORK FIRST
       ===================================================== */

    if (event.request.mode === "navigate") {

        event.respondWith(

            fetch(event.request)

                .then((response) => {

                    /*
                       Save the newest page.
                    */

                    const responseClone =
                        response.clone();


                    caches
                        .open(CACHE_NAME)

                        .then((cache) => {

                            cache.put(
                                event.request,
                                responseClone
                            );

                        });


                    return response;

                })


                /* -----------------------------------------
                   OFFLINE FALLBACK
                ----------------------------------------- */

                .catch(async () => {

                    const cachedPage =
                        await caches.match(
                            event.request
                        );


                    if (cachedPage) {
                        return cachedPage;
                    }


                    /*
                       If the requested page isn't cached,
                       open the Budget Tracker shell.
                    */

                    return caches.match(
                        "./index.html"
                    );

                })

        );


        return;

    }



    /* =====================================================
       7. CSS / JAVASCRIPT / MANIFEST
       NETWORK FIRST
       ===================================================== */

    const destination =
        event.request.destination;


    if (
        destination === "script" ||
        destination === "style" ||
        destination === "manifest"
    ) {

        event.respondWith(

            fetch(event.request)

                .then((response) => {

                    /*
                       Only cache successful responses.
                    */

                    if (
                        !response ||
                        response.status !== 200
                    ) {
                        return response;
                    }


                    const responseClone =
                        response.clone();


                    caches
                        .open(CACHE_NAME)

                        .then((cache) => {

                            cache.put(
                                event.request,
                                responseClone
                            );

                        });


                    return response;

                })


                /* -----------------------------------------
                   If offline, use the cached file.
                ----------------------------------------- */

                .catch(() => {

                    return caches.match(
                        event.request
                    );

                })

        );


        return;

    }



    /* =====================================================
       8. IMAGES / ICONS / OTHER STATIC FILES
       CACHE FIRST
       ===================================================== */

    event.respondWith(

        caches
            .match(event.request)

            .then((cachedResponse) => {


                /*
                   If we already have the image/icon,
                   use it immediately.
                */

                if (cachedResponse) {
                    return cachedResponse;
                }



                /*
                   Otherwise download it.
                */

                return fetch(event.request)

                    .then((response) => {


                        if (
                            !response ||
                            response.status !== 200
                        ) {
                            return response;
                        }


                        const responseClone =
                            response.clone();


                        caches
                            .open(CACHE_NAME)

                            .then((cache) => {

                                cache.put(
                                    event.request,
                                    responseClone
                                );

                            });


                        return response;

                    });

            })

    );

});