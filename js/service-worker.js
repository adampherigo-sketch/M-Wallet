/* =========================================================
   BUDGET TRACKER
   Service Worker
   ========================================================= */

const CACHE_NAME = "budget-tracker-v1";

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./manifest.json",
    "./icons/app-icon.svg"
];


/* =========================================================
   INSTALL
   ========================================================= */

self.addEventListener("install", (event) => {

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(APP_SHELL);
            })
    );

    self.skipWaiting();

});


/* =========================================================
   ACTIVATE
   ========================================================= */

self.addEventListener("activate", (event) => {

    event.waitUntil(

        caches.keys().then((cacheNames) => {

            return Promise.all(

                cacheNames
                    .filter((cacheName) => {
                        return cacheName !== CACHE_NAME;
                    })
                    .map((cacheName) => {
                        return caches.delete(cacheName);
                    })

            );

        })

    );

    self.clients.claim();

});


/* =========================================================
   FETCH
   ========================================================= */

self.addEventListener("fetch", (event) => {

    if (event.request.method !== "GET") {
        return;
    }

    const requestURL = new URL(event.request.url);

    // Only manage files belonging to this app.
    if (requestURL.origin !== self.location.origin) {
        return;
    }


    /*
       Pages:
       Try the network first so development changes
       appear immediately.
    */

    if (event.request.mode === "navigate") {

        event.respondWith(

            fetch(event.request)

                .then((response) => {

                    const responseClone = response.clone();

                    caches.open(CACHE_NAME)
                        .then((cache) => {
                            cache.put(event.request, responseClone);
                        });

                    return response;

                })

                .catch(() => {

                    return caches.match(event.request)
                        .then((cachedResponse) => {
                            return cachedResponse || caches.match("./index.html");
                        });

                })

        );

        return;
    }


    /*
       CSS / JS / images:
       Use cache when available,
       otherwise download and save it.
    */

    event.respondWith(

        caches.match(event.request)

            .then((cachedResponse) => {

                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)

                    .then((response) => {

                        if (!response || response.status !== 200) {
                            return response;
                        }

                        const responseClone = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseClone);
                            });

                        return response;

                    });

            })

    );

});