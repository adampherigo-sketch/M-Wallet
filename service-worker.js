/* =========================================================
   M-WALLET
   Service Worker
   GitHub / PWA Ready

   Final UI Cleanup
   Offline Asset / Version Cache Refresh
   ========================================================= */


/* =========================================================
   1. CACHE VERSION
   ========================================================= */

const CACHE_NAME = "m-wallet-v7";


/* =========================================================
   2. CORE APP FILES
   ========================================================= */

const APP_SHELL = [

    "./",
    "./index.html",

    "./manifest.json",

    "./css/style.css",
    "./css/m-cash.css",
    "./css/zevaryn-grid.css",
    "./css/dashboard.css",

    "./js/storage.js",
    "./js/nav.js",
    "./js/app.js",
    "./js/money.js",
    "./js/pwa.js",

    "./js/m-cash/cash-ui.js",
    "./js/m-cash/cash-storage.js",
    "./js/m-cash/cash.js",

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

    ./js/app.js?v=8
    ./css/style.css?v=8

    The app shell precaches the clean URLs. ignoreSearch lets
    versioned requests use those same cached files offline.
*/

async function matchCachedRequest(request) {

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
                .open(CACHE_NAME)
                .then(cache => {

                    console.log(
                        "[Service Worker] Caching app shell"
                    );

                    return cache.addAll(APP_SHELL);
                })
        );

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
                .then(cacheNames => {

                    return Promise.all(
                        cacheNames.map(cacheName => {

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
                .then(() => self.clients.claim())
        );
    }
);


/* =========================================================
   6. FETCH REQUESTS
   ========================================================= */

self.addEventListener(
    "fetch",
    event => {

        if (event.request.method !== "GET") {
            return;
        }

        const requestURL =
            new URL(event.request.url);

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
                fetch(event.request)
                    .then(async response => {

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
                    })
                    .catch(async () => {

                        const cachedPage =
                            await matchCachedRequest(
                                event.request
                            );

                        if (cachedPage) {
                            return cachedPage;
                        }

                        return caches.match(
                            "./index.html"
                        );
                    })
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
            destination === "script" ||
            destination === "style" ||
            destination === "manifest"
        ) {

            event.respondWith(
                fetch(event.request)
                    .then(async response => {

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
                    })
                    .catch(
                        () =>
                            matchCachedRequest(
                                event.request
                            )
                    )
            );

            return;
        }


        /* =================================================
           9. IMAGES / ICONS / STATIC FILES
           CACHE FIRST
           ================================================= */

        event.respondWith(
            matchCachedRequest(event.request)
                .then(cachedResponse => {

                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    return fetch(event.request)
                        .then(async response => {

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
                        });
                })
        );
    }
);


/* =========================================================
   END SERVICE-WORKER.JS
   ========================================================= */
