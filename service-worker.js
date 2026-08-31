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

const CACHE_NAME = "m-wallet-v28";


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
    "./css/budget.css",
    "./css/transactions.css",
    "./css/savings.css",
    "./css/reports.css",
    "./css/settings.css",
    "./css/zg9.css",
    "./css/auth.css",
    "./css/migration.css",
    "./css/setup.css",
    "./css/walkthrough.css",
    "./css/sync.css",
    "./css/passkeys.css",

    "./js/app-version.js",

    "./js/auth/auth-config.js",
    "./js/auth/auth-client.js",
    "./js/auth/auth.js",
    "./js/auth/auth-ui.js",
    "./js/auth/passkey-release.js",
    "./js/auth/passkeys.js",
    "./js/auth/passkey-ui.js",

    "./js/migration/local-user-migration.js",
    "./js/migration/migration-ui.js",

    "./js/setup/first-run-setup.js",
    "./js/setup/setup-ui.js",

    "./js/walkthrough/guided-walkthrough.js",
    "./js/walkthrough/walkthrough-ui.js",

    "./js/cloud/cloud-financial-codec.js",
    "./js/cloud/cloud-financial-store.js",

    "./js/sync/sync-release.js",
    "./js/sync/sync-state.js",
    "./js/sync/sync-planner.js",
    "./js/sync/sync-engine.js",
    "./js/sync/sync-ui.js",

    "./js/storage.js",
    "./js/nav.js",
    "./js/app.js",
    "./js/money.js",
    "./js/pwa.js",

    "./js/reports-analytics.js",
    "./js/settings-ui.js",

    "./js/m-cash/cash-ui.js",
    "./js/m-cash/cash-storage.js",
    "./js/m-cash/cash-calculator.js",
    "./js/m-cash/cash-savings.js",
    "./js/m-cash/cash.js",

    /*
        Vendored auth library. Precached so a future signed-in
        build works offline, but only executed by auth-client.js
        when a Supabase project is actually configured.
    */
    "./js/vendor/supabase-js.min.js",

    "./icons/m-wallet-icon-192.png",
    "./icons/m-wallet-icon-512.png",
    "./icons/m-wallet-icon-512-maskable.png",
    "./icons/m-wallet-apple-touch-icon.png"

];


/* =========================================================
   3. CACHE MATCH HELPER
   ========================================================= */

/*
    M-Wallet asset URLs carry a version query string (for example
    ./js/app.js?v=N or ./css/style.css?v=N). The app shell
    precaches the clean URLs; ignoreSearch lets those versioned
    requests resolve to the same cached files offline.
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

        /*
            Only same-origin app-shell requests are handled here.
            Every cross-origin request is left entirely to the
            browser — the service worker never inspects, caches,
            or replays it. This is also what keeps authentication
            traffic (Supabase token / session endpoints, always a
            different origin) out of the cache: it is never seen
            by this handler.
        */
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
