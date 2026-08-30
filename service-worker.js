/* =========================================================
   M-WALLET
   Service Worker
   GitHub / PWA Ready

   UI Cleanup 1
   Offline Asset / Version Cache Refresh
   ========================================================= */


/* =========================================================
   1. CACHE VERSION
   ========================================================= */

const CACHE_NAME = "m-wallet-v4";


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
   3. CACHE MATCH HELPER
   ========================================================= */

/*
    M-Wallet uses version query strings such as:

    ./js/nav.js?v=7
    ./css/style.css?v=7

    The app shell itself precaches the clean URLs:

    ./js/nav.js
    ./css/style.css

    ignoreSearch allows the service worker to treat those
    as the same underlying asset when offline.
*/

async function matchCachedRequest(
    request
) {

    return caches.match(
        request,
        {
            ignoreSearch: true
        }
    );

}


/* =========================================================
   4. INSTALL
   ========================================================= */

self.addEventListener(
    "install",
    event => {

        console.log(
            "[Service Worker] Installing:",
            CACHE_NAME
        );


        event.waitUntil(

            caches
                .open(
                    CACHE_NAME
                )

                .then(
                    cache => {

                        console.log(
                            "[Service Worker] Caching app shell"
                        );


                        return cache.addAll(
                            APP_SHELL
                        );

                    }
                )

        );


        /*
            Activate the new service worker immediately.
        */

        self.skipWaiting();

    }
);


/* =========================================================
   5. ACTIVATE
   ========================================================= */

self.addEventListener(
    "activate",
    event => {

        console.log(
            "[Service Worker] Activating:",
            CACHE_NAME
        );


        event.waitUntil(

            caches
                .keys()

                .then(
                    cacheNames => {

                        return Promise.all(

                            cacheNames.map(
                                cacheName => {

                                    if (
                                        cacheName !==
                                        CACHE_NAME
                                    ) {

                                        console.log(
                                            "[Service Worker] Removing old cache:",
                                            cacheName
                                        );


                                        return caches.delete(
                                            cacheName
                                        );

                                    }


                                    return null;

                                }
                            )

                        );

                    }
                )

                .then(
                    () =>
                        self.clients.claim()
                )

        );

    }
);


/* =========================================================
   6. FETCH REQUESTS
   ========================================================= */

self.addEventListener(
    "fetch",
    event => {


        /* -------------------------------------------------
           IGNORE NON-GET REQUESTS
           ------------------------------------------------- */

        if (
            event.request.method !==
            "GET"
        ) {

            return;

        }


        const requestURL =
            new URL(
                event.request.url
            );


        /* -------------------------------------------------
           ONLY MANAGE M-WALLET'S OWN RESOURCES
           ------------------------------------------------- */

        if (
            requestURL.origin !==
            self.location.origin
        ) {

            return;

        }



        /* =================================================
           7. PAGE NAVIGATION
           NETWORK FIRST
           ================================================= */

        if (
            event.request.mode ===
            "navigate"
        ) {

            event.respondWith(

                fetch(
                    event.request
                )

                    .then(
                        async response => {

                            /*
                                Cache successful page responses.
                            */

                            if (
                                response &&
                                response.ok
                            ) {

                                const cache =
                                    await caches.open(
                                        CACHE_NAME
                                    );


                                await cache.put(
                                    event.request,
                                    response.clone()
                                );

                            }


                            return response;

                        }
                    )


                    /* -------------------------------------
                       OFFLINE FALLBACK
                       ------------------------------------- */

                    .catch(
                        async () => {

                            const cachedPage =
                                await matchCachedRequest(
                                    event.request
                                );


                            if (
                                cachedPage
                            ) {

                                return cachedPage;

                            }


                            /*
                                If the exact page isn't
                                available, load the app shell.
                            */

                            return caches.match(
                                "./index.html"
                            );

                        }
                    )

            );


            return;

        }



        /* =================================================
           8. CSS / JAVASCRIPT / MANIFEST
           NETWORK FIRST
           ================================================= */

        const destination =
            event.request.destination;


        if (
            destination ===
                "script" ||

            destination ===
                "style" ||

            destination ===
                "manifest"
        ) {

            event.respondWith(

                fetch(
                    event.request
                )

                    .then(
                        async response => {

                            /*
                                Only cache valid successful
                                responses.
                            */

                            if (
                                !response ||
                                !response.ok
                            ) {

                                return response;

                            }


                            const cache =
                                await caches.open(
                                    CACHE_NAME
                                );


                            /*
                                Cache the exact online request.

                                Example:
                                ./js/nav.js?v=7
                            */

                            await cache.put(
                                event.request,
                                response.clone()
                            );


                            return response;

                        }
                    )


                    /* -------------------------------------
                       OFFLINE FALLBACK

                       ignoreSearch means:
                       nav.js?v=7 can use cached nav.js
                       ------------------------------------- */

                    .catch(
                        () => {

                            return matchCachedRequest(
                                event.request
                            );

                        }
                    )

            );


            return;

        }



        /* =================================================
           9. IMAGES / ICONS / STATIC FILES
           CACHE FIRST
           ================================================= */

        event.respondWith(

            matchCachedRequest(
                event.request
            )

                .then(
                    cachedResponse => {


                        if (
                            cachedResponse
                        ) {

                            return cachedResponse;

                        }


                        return fetch(
                            event.request
                        )

                            .then(
                                async response => {

                                    if (
                                        !response ||
                                        !response.ok
                                    ) {

                                        return response;

                                    }


                                    const cache =
                                        await caches.open(
                                            CACHE_NAME
                                        );


                                    await cache.put(
                                        event.request,
                                        response.clone()
                                    );


                                    return response;

                                }
                            );

                    }
                )

        );

    }
);


/* =========================================================
   END SERVICE-WORKER.JS
   ========================================================= */