"use strict";

/* =========================================================
   M-WALLET  ·  ZEVARYN GRID
   ZG8 — Settings: System Configuration Center

   Surfaces capabilities that already live in storage.js but
   had no UI:
     - the category / subcategory registry (add / rename /
       enable / delete, with system protection) — every write
       goes through an existing storage.* method, unchanged
     - storage.importData()  (file → normalize → save)
     - a local-storage usage read-out
     - service-worker / offline status

   No storage business logic is added or changed here.
   Exposed as window.SettingsUI. Pure helpers are unit-tested
   in tests/settings-ui.test.js.
   ========================================================= */

(function (global) {

    /* ---- pure helpers (unit-tested) ------------------- */

    function estimateStorageBytes(raw) {
        // localStorage is UTF-16 in most engines; 2 bytes/char is the
        // honest upper bound for a rough "space used" read-out.
        var text = typeof raw === "string" ? raw : "";
        return text.length * 2;
    }

    function formatBytes(bytes) {
        var n = Number(bytes);
        if (!Number.isFinite(n) || n < 0) {
            n = 0;
        }
        if (n < 1024) {
            return n + " B";
        }
        if (n < 1024 * 1024) {
            return (n / 1024).toFixed(1) + " KB";
        }
        return (n / (1024 * 1024)).toFixed(2) + " MB";
    }

    function categoryRowModel(category) {
        var cat = category || {};
        var subs = Array.isArray(cat.subcategories) ? cat.subcategories : [];
        return {
            id: String(cat.id || ""),
            name: String(cat.name || ""),
            system: Boolean(cat.system),
            enabled: cat.enabled !== false,
            subCount: subs.length,
            subEnabledCount: subs.filter(function (s) {
                return s && s.enabled !== false;
            }).length
        };
    }


    /* ---- environment ------------------------------------ */

    function storage() {
        return global.MWalletStorage || global.BudgetStorage || null;
    }

    function app() {
        return global.BudgetApp || global.MWalletApp || null;
    }

    function esc(value) {
        var a = app();
        if (a && typeof a.escapeHTML === "function") {
            return a.escapeHTML(value);
        }
        return String(value == null ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function refreshApp() {
        var a = app();
        if (a && typeof a.refresh === "function") {
            try {
                a.refresh();
            } catch (error) {
                /* non-fatal */
            }
        }
    }


    /* ---- module state ---------------------------------- */

    var wired = false;
    var expandedCategoryId = null;
    // { kind: "category"|"subcategory", categoryId, subcategoryId }
    var editing = null;
    // "category" | { subcategoryOf: categoryId } | null
    var adding = null;
    var pendingFocus = null;


    /* ---- feedback ------------------------------------- */

    function setStatus(message, type) {
        var el = document.getElementById("settings-status");
        if (!el) {
            return;
        }
        el.textContent = message || "";
        el.classList.remove("is-success", "is-error");
        if (type === "success") {
            el.classList.add("is-success");
        } else if (type === "error") {
            el.classList.add("is-error");
        }
        el.hidden = !message;
    }


    /* ---- category manager render --------------------- */

    function renderCategoryManager() {

        var host = document.getElementById("settings-category-manager");
        if (!host) {
            return;
        }

        var store = storage();
        if (!store || typeof store.getCategories !== "function") {
            host.innerHTML =
                '<p class="zg-set-empty">Category management is unavailable.</p>';
            return;
        }

        var categories = store.getCategories();
        var models = categories.map(categoryRowModel);

        var totalCats = models.length;
        var customCats = models.filter(function (m) {
            return !m.system;
        }).length;

        var rowsHtml = categories.map(function (category) {
            return renderCategoryRow(category);
        }).join("");

        var addHtml = "";
        if (adding === "category") {
            addHtml =
                '<form class="zg-set-add" data-set-form="add-category">' +
                    '<input class="z-input" id="settings-new-category-input" name="name" ' +
                        'type="text" maxlength="40" autocomplete="off" ' +
                        'placeholder="New category name" aria-label="New category name">' +
                    '<div class="zg-set-add-actions">' +
                        '<button type="submit" class="z-btn z-btn-primary">Create</button>' +
                        '<button type="button" class="z-btn z-btn-secondary" ' +
                            'data-set-action="add-category-cancel">Cancel</button>' +
                    '</div>' +
                '</form>';
        } else {
            addHtml =
                '<button type="button" class="zg-set-add-trigger" ' +
                    'data-set-action="add-category-open">' +
                    '<span aria-hidden="true">+</span> Add category</button>';
        }

        host.innerHTML =
            '<div class="zg-set-cat-head">' +
                '<div>' +
                    '<span class="zg-set-cat-count">' + totalCats + ' categories</span>' +
                    '<span class="zg-set-cat-sub">' + customCats + ' custom · ' +
                        (totalCats - customCats) + ' system</span>' +
                '</div>' +
            '</div>' +
            addHtml +
            '<ul class="zg-set-cat-list">' + rowsHtml + '</ul>';
    }


    function renderCategoryRow(category) {

        var m = categoryRowModel(category);
        var isExpanded = expandedCategoryId === m.id;
        var isEditing =
            editing &&
            editing.kind === "category" &&
            editing.categoryId === m.id;

        var badge = m.system
            ? '<span class="z-badge z-badge-teal">System</span>'
            : '<span class="z-badge z-badge-violet">Custom</span>';

        var nameBlock;
        if (isEditing) {
            nameBlock =
                '<form class="zg-set-rename" data-set-form="rename-category" ' +
                    'data-cat-id="' + esc(m.id) + '">' +
                    '<input class="z-input" id="settings-rename-input" name="name" type="text" ' +
                        'maxlength="40" autocomplete="off" value="' + esc(m.name) + '" ' +
                        'aria-label="Rename category">' +
                    '<button type="submit" class="z-btn z-btn-primary">Save</button>' +
                    '<button type="button" class="z-btn z-btn-secondary" ' +
                        'data-set-action="rename-cancel">Cancel</button>' +
                '</form>';
        } else {
            nameBlock =
                '<div class="zg-set-cat-name">' +
                    '<strong>' + esc(m.name) + '</strong>' +
                    badge +
                '</div>' +
                '<div class="zg-set-cat-meta">' + m.subCount + ' subcategor' +
                    (m.subCount === 1 ? "y" : "ies") +
                    (m.subCount
                        ? ' · ' + m.subEnabledCount + ' enabled'
                        : "") +
                '</div>';
        }

        var toggleId = "settings-cat-toggle-" + esc(m.id);
        var toggle =
            '<label class="zg-switch" for="' + toggleId + '">' +
                '<input type="checkbox" id="' + toggleId + '" ' +
                    'data-set-toggle="category" data-cat-id="' + esc(m.id) + '" ' +
                    'aria-label="' + esc(m.name) + ' category, enabled" ' +
                    (m.enabled ? "checked" : "") + '>' +
                '<span class="zg-switch-track" aria-hidden="true"></span>' +
                '<span class="zg-switch-label">' +
                    (m.enabled ? "Enabled" : "Disabled") + '</span>' +
            '</label>';

        var actions =
            '<button type="button" class="zg-set-link" ' +
                'data-set-action="rename-category" data-cat-id="' + esc(m.id) + '">Rename</button>' +
            (m.system
                ? ""
                : '<button type="button" class="zg-set-link zg-set-link--danger" ' +
                    'data-set-action="delete-category" data-cat-id="' + esc(m.id) + '">Delete</button>') +
            '<button type="button" class="zg-set-link" ' +
                'data-set-action="' + (isExpanded ? "collapse-category" : "expand-category") + '" ' +
                'data-cat-id="' + esc(m.id) + '" aria-expanded="' + (isExpanded ? "true" : "false") + '">' +
                (isExpanded ? "Hide" : "Manage") + '</button>';

        var subsHtml = "";
        if (isExpanded) {
            subsHtml = renderSubcategoryPanel(category);
        }

        return (
            '<li class="zg-set-cat-row' + (m.enabled ? "" : " is-disabled") + '">' +
                '<div class="zg-set-cat-info">' + nameBlock + '</div>' +
                toggle +
                '<div class="zg-set-cat-actions">' + actions + '</div>' +
                subsHtml +
            '</li>'
        );
    }


    function renderSubcategoryPanel(category) {

        var store = storage();
        var m = categoryRowModel(category);
        var subs = (store && typeof store.getSubcategories === "function")
            ? store.getSubcategories(m.id)
            : (category.subcategories || []);

        var rows = subs.map(function (sub) {

            var subModel = {
                id: String(sub.id || ""),
                name: String(sub.name || ""),
                system: Boolean(sub.system),
                enabled: sub.enabled !== false
            };

            var isEditing =
                editing &&
                editing.kind === "subcategory" &&
                editing.categoryId === m.id &&
                editing.subcategoryId === subModel.id;

            var nameCell;
            if (isEditing) {
                nameCell =
                    '<form class="zg-set-rename" data-set-form="rename-subcategory" ' +
                        'data-cat-id="' + esc(m.id) + '" data-sub-id="' + esc(subModel.id) + '">' +
                        '<input class="z-input" id="settings-rename-input" name="name" type="text" ' +
                            'maxlength="40" autocomplete="off" value="' + esc(subModel.name) + '" ' +
                            'aria-label="Rename subcategory">' +
                        '<button type="submit" class="z-btn z-btn-primary">Save</button>' +
                        '<button type="button" class="z-btn z-btn-secondary" ' +
                            'data-set-action="rename-cancel">Cancel</button>' +
                    '</form>';
            } else {
                nameCell =
                    '<span class="zg-set-sub-name">' + esc(subModel.name) + '</span>' +
                    (subModel.system
                        ? '<span class="z-badge z-badge-teal">System</span>'
                        : '<span class="z-badge z-badge-violet">Custom</span>');
            }

            var toggleId = "settings-sub-toggle-" + esc(subModel.id);

            return (
                '<li class="zg-set-sub-row' + (subModel.enabled ? "" : " is-disabled") + '">' +
                    '<div class="zg-set-sub-info">' + nameCell + '</div>' +
                    '<label class="zg-switch zg-switch--sm" for="' + toggleId + '">' +
                        '<input type="checkbox" id="' + toggleId + '" data-set-toggle="subcategory" ' +
                            'data-cat-id="' + esc(m.id) + '" data-sub-id="' + esc(subModel.id) + '" ' +
                            'aria-label="' + esc(subModel.name) + ' subcategory, enabled" ' +
                            (subModel.enabled ? "checked" : "") + '>' +
                        '<span class="zg-switch-track" aria-hidden="true"></span>' +
                        '<span class="zg-switch-label">' +
                            (subModel.enabled ? "On" : "Off") + '</span>' +
                    '</label>' +
                    '<div class="zg-set-sub-actions">' +
                        '<button type="button" class="zg-set-link" data-set-action="rename-subcategory" ' +
                            'data-cat-id="' + esc(m.id) + '" data-sub-id="' + esc(subModel.id) + '">Rename</button>' +
                        (subModel.system
                            ? ""
                            : '<button type="button" class="zg-set-link zg-set-link--danger" ' +
                                'data-set-action="delete-subcategory" data-cat-id="' + esc(m.id) + '" ' +
                                'data-sub-id="' + esc(subModel.id) + '">Delete</button>') +
                    '</div>' +
                '</li>'
            );
        }).join("");

        var addRow;
        if (adding && adding.subcategoryOf === m.id) {
            addRow =
                '<form class="zg-set-add zg-set-add--sub" data-set-form="add-subcategory" ' +
                    'data-cat-id="' + esc(m.id) + '">' +
                    '<input class="z-input" id="settings-new-subcategory-input" name="name" type="text" ' +
                        'maxlength="40" autocomplete="off" placeholder="New subcategory name" ' +
                        'aria-label="New subcategory name">' +
                    '<div class="zg-set-add-actions">' +
                        '<button type="submit" class="z-btn z-btn-primary">Add</button>' +
                        '<button type="button" class="z-btn z-btn-secondary" ' +
                            'data-set-action="add-subcategory-cancel">Cancel</button>' +
                    '</div>' +
                '</form>';
        } else {
            addRow =
                '<button type="button" class="zg-set-add-trigger zg-set-add-trigger--sub" ' +
                    'data-set-action="add-subcategory-open" data-cat-id="' + esc(m.id) + '">' +
                    '<span aria-hidden="true">+</span> Add subcategory</button>';
        }

        return (
            '<div class="zg-set-sub-panel">' +
                (rows
                    ? '<ul class="zg-set-sub-list">' + rows + '</ul>'
                    : '<p class="zg-set-empty">No subcategories yet.</p>') +
                addRow +
            '</div>'
        );
    }


    /* ---- storage / system panels -------------------- */

    function renderStorageInfo() {
        var el = document.getElementById("settings-storage-info");
        if (!el) {
            return;
        }
        var store = storage();
        var used = 0;
        try {
            var raw = global.localStorage.getItem(
                (store && store.storageKey) || "mWalletData"
            );
            used = estimateStorageBytes(raw || "");
        } catch (error) {
            used = 0;
        }
        el.textContent = "≈ " + formatBytes(used) + " used in this browser";
    }

    function renderSystemStatus() {
        var el = document.getElementById("settings-sw-status");
        if (!el) {
            return;
        }
        var offlineReady = false;
        try {
            offlineReady = Boolean(
                global.navigator &&
                global.navigator.serviceWorker &&
                global.navigator.serviceWorker.controller
            );
        } catch (error) {
            offlineReady = false;
        }
        var online = true;
        try {
            online = global.navigator ? global.navigator.onLine !== false : true;
        } catch (error) {
            online = true;
        }
        el.textContent = offlineReady
            ? "Offline-ready · " + (online ? "online" : "offline")
            : "Preparing offline support";
    }

    function renderVersionInfo() {
        var v = global.MWalletVersion || null;

        var setText = function (id, value) {
            var el = document.getElementById(id);
            if (el && value != null && value !== "") {
                el.textContent = value;
            }
        };

        if (v) {
            setText("settings-app-version", v.version);
            setText(
                "settings-app-channel",
                v.channel
                    ? v.channel.charAt(0).toUpperCase() + v.channel.slice(1)
                    : null
            );
        }

        var store = storage();
        if (store && typeof store.version !== "undefined") {
            setText("settings-data-schema", "v" + String(store.version));
        }
    }

    /* BP2/BP3 — account status +, when signed in, a safe account
       panel (email + Sign Out). Never renders a token, session,
       key, or metadata. */
    function renderAuthStatus() {
        var el = document.getElementById("settings-auth-status");
        var panel = document.getElementById("settings-account-panel");
        var emailEl = document.getElementById("settings-account-email");
        var signOutBtn = document.getElementById("settings-sign-out-btn");
        var resetBtn = document.getElementById("settings-account-reset-btn");

        var hide = function (node) { if (node) { node.hidden = true; } };
        var show = function (node) { if (node) { node.hidden = false; } };

        var auth = global.MWalletAuth;
        if (!auth || typeof auth.getState !== "function") {
            if (el) { el.textContent = "Unavailable"; }
            hide(panel); hide(signOutBtn); hide(resetBtn);
            return;
        }

        var state = auth.getState();
        var labels = {
            unconfigured: "Not configured",
            initializing: "Checking…",
            signed_out: "Ready · signed out",
            signed_in: "Signed in",
            error: "Unavailable"
        };
        if (el) { el.textContent = labels[state.status] || "—"; }

        if (state.status === "signed_in" && state.user && state.user.email) {
            if (emailEl) { emailEl.textContent = state.user.email; }
            show(panel); show(signOutBtn); show(resetBtn);
        } else {
            hide(panel); hide(signOutBtn); hide(resetBtn);
        }

        renderLocalDataStatus(state);
        renderFirstRunStatus(state);
        renderWalkthroughStatus(state);
        renderCloudFinancialStatus(state);
        renderSyncStatus(state);
    }

    /* BP4 — local data ownership status. Shown only for the
       signed-in owner (Settings is unreachable during an
       ownership mismatch because the app stays gated).
       Never exposes ownerUserId or migration metadata, and
       never claims the data is backed up or synced. */
    function renderLocalDataStatus(authStateSnapshot) {
        var panel = document.getElementById("settings-local-data-panel");
        var statusEl = document.getElementById("settings-local-data-status");
        if (!panel) { return; }

        var migration = global.MWalletLocalMigration;
        var authState = authStateSnapshot ||
            (global.MWalletAuth && typeof global.MWalletAuth.getState === "function"
                ? global.MWalletAuth.getState()
                : null);

        var signedIn = authState && authState.status === "signed_in";
        var migStatus = (migration && typeof migration.getStatus === "function")
            ? migration.getStatus()
            : null;

        if (!signedIn || (migStatus !== "owned" && migStatus !== "fresh_claimed")) {
            panel.hidden = true;
            return;
        }

        panel.hidden = false;
        if (statusEl) { statusEl.textContent = "Protected on this device"; }
    }

    /* BP5 — first-run setup status. Shown once setup is done
       (via the wizard OR auto-skipped for an existing user).
       Never exposes the owner id or the metadata source. There
       is deliberately no "Restart Setup" control in BP5. */
    function renderFirstRunStatus(authStateSnapshot) {
        var panel = document.getElementById("settings-first-run-panel");
        var statusEl = document.getElementById("settings-first-run-status");
        if (!panel) { return; }

        var firstRun = global.MWalletFirstRun;
        var authState = authStateSnapshot ||
            (global.MWalletAuth && typeof global.MWalletAuth.getState === "function"
                ? global.MWalletAuth.getState()
                : null);

        var signedIn = authState && authState.status === "signed_in";
        var setupStatus = (firstRun && typeof firstRun.getStatus === "function")
            ? firstRun.getStatus()
            : null;

        if (!signedIn || (setupStatus !== "complete" && setupStatus !== "existing")) {
            panel.hidden = true;
            return;
        }

        panel.hidden = false;
        if (statusEl) { statusEl.textContent = "Complete"; }
    }

    /* BP6 — guided walkthrough replay control. Shown for a
       signed-in owner whose setup is done (complete OR existing).
       Never exposes the owner id or any progress. Manual replay
       never re-runs BP5, never touches BP4 or financial data. */
    function renderWalkthroughStatus(authStateSnapshot) {
        var panel = document.getElementById("settings-walkthrough-panel");
        var statusEl = document.getElementById("settings-walkthrough-status");
        var btn = document.getElementById("settings-walkthrough-btn");
        var btnLabel = document.getElementById("settings-walkthrough-btn-label");
        if (!panel || !btn) { return; }

        var tour = global.MWalletWalkthrough;
        var authState = authStateSnapshot ||
            (global.MWalletAuth && typeof global.MWalletAuth.getState === "function"
                ? global.MWalletAuth.getState()
                : null);
        var firstRun = global.MWalletFirstRun;

        var signedIn = authState && authState.status === "signed_in";
        var setupStatus = (firstRun && typeof firstRun.getStatus === "function") ? firstRun.getStatus() : null;
        var tourStatus = (tour && typeof tour.getStatus === "function") ? tour.getStatus() : null;

        /* Settings itself is only reachable once the app is released,
           so a signed-in owner here is already BP4-verified. */
        if (!signedIn || !tour || (setupStatus !== "complete" && setupStatus !== "existing")) {
            panel.hidden = true;
            btn.hidden = true;
            return;
        }

        panel.hidden = false;
        btn.hidden = false;

        var label = "Not viewed";
        var cta = "Start Tour";
        if (tourStatus === "completed") { label = "Completed"; cta = "Replay Tour"; }
        else if (tourStatus === "skipped") { label = "Skipped"; cta = "Start Tour"; }
        else if (tourStatus === "active") { label = "In progress"; cta = "Resume Tour"; }

        if (statusEl) { statusEl.textContent = label; }
        if (btnLabel) { btnLabel.textContent = cta; }
    }

    function onWalkthroughStart() {
        var tour = global.MWalletWalkthrough;
        if (!tour || typeof tour.startManual !== "function") { return; }
        var res = tour.startManual();
        if (res && res.ok === false) {
            setStatus("The tour can't start right now.", "error");
        }
    }

    /* BP7 — read-only cloud-storage capability status. BP7 does NOT
       sync: this row never says "backed up" / "synced". The status is
       derived without a network call; the optional Check button is the
       only thing that touches the network, and only when clicked. */
    var CLOUD_LABELS = {
        unconfigured: "Not configured",
        signed_out: "Ready for verification",
        ready: "Available — sync not enabled",
        unavailable: "Unavailable"
    };
    var CLOUD_CHECK_LABELS = {
        schema_missing: "Schema not installed",
        forbidden: "Unavailable",
        network_error: "Unavailable — offline",
        signed_out: "Ready for verification",
        client_unavailable: "Unavailable",
        unconfigured: "Not configured"
    };

    function renderCloudFinancialStatus(authStateSnapshot) {
        var panel = document.getElementById("settings-cloud-panel");
        var statusEl = document.getElementById("settings-cloud-status");
        var checkBtn = document.getElementById("settings-cloud-check-btn");
        if (!panel) { return; }

        var cloud = global.MWalletCloudFinancial;
        var authState = authStateSnapshot ||
            (global.MWalletAuth && typeof global.MWalletAuth.getState === "function"
                ? global.MWalletAuth.getState()
                : null);
        var signedIn = authState && authState.status === "signed_in";

        /* Settings is only reachable once the app is released, so a
           signed-in owner here is already BP4-verified. Show the row
           only when there is a Supabase project + a signed-in owner. */
        if (!signedIn || !cloud || !authState || authState.configured !== true) {
            panel.hidden = true;
            if (checkBtn) { checkBtn.hidden = true; }
            return;
        }

        panel.hidden = false;
        if (checkBtn) { checkBtn.hidden = false; }

        var state = typeof cloud.getState === "function" ? cloud.getState() : null;
        var diag = typeof cloud.diagnostics === "function" ? cloud.diagnostics() : null;
        var label = (state && CLOUD_LABELS[state.status]) || "—";
        if (diag && diag.lastCheck) {
            if (diag.lastCheck.ok) { label = "Available — sync not enabled"; }
            else if (CLOUD_CHECK_LABELS[diag.lastCheck.code]) { label = CLOUD_CHECK_LABELS[diag.lastCheck.code]; }
        }
        if (statusEl) { statusEl.textContent = label; }
    }

    function onCloudCheck() {
        var cloud = global.MWalletCloudFinancial;
        if (!cloud || typeof cloud.checkAvailability !== "function") { return; }
        var btn = document.getElementById("settings-cloud-check-btn");
        if (btn) { btn.disabled = true; }
        setStatus("Checking cloud storage…");
        Promise.resolve(cloud.checkAvailability()).then(function (res) {
            if (btn) { btn.disabled = false; }
            renderCloudFinancialStatus();
            if (res && res.ok) {
                setStatus("Cloud storage is reachable. Sync is still not enabled.", "success");
            } else if (res && res.code === "schema_missing") {
                setStatus("Cloud storage isn't set up on the server yet.", "error");
            } else {
                setStatus("Couldn't reach cloud storage right now.", "error");
            }
        }).catch(function () {
            if (btn) { btn.disabled = false; }
            renderCloudFinancialStatus();
            setStatus("Couldn't reach cloud storage right now.", "error");
        });
    }

    /* BP8 — local-first sync status. In the committed build the sync
       RELEASE GATE is OFF: the engine is built but makes no cloud
       requests. This row never says "Backed up". "Sync Now" and the
       conflict "Review" control appear ONLY when release is enabled
       (BP12 will flip that after live verification). */
    var SYNC_LABELS = {
        disabled: "Built — activation pending pre-beta verification",
        unconfigured: "Not configured",
        signed_out: "Signed out",
        idle: "Up to date",
        syncing: "Syncing…",
        offline: "Offline — changes saved on this device",
        pending: "Changes waiting to sync",
        conflicts: "Needs attention",
        unsupported: "Cloud unavailable",
        error: "Sync unavailable"
    };

    function renderSyncStatus(authStateSnapshot) {
        var panel = document.getElementById("settings-sync-panel");
        var statusEl = document.getElementById("settings-sync-status");
        var noteEl = document.getElementById("settings-sync-note");
        var syncNowBtn = document.getElementById("settings-sync-now-btn");
        var reviewBtn = document.getElementById("settings-sync-review-btn");
        if (!panel) { return; }

        var sync = global.MWalletSync;
        var authState = authStateSnapshot ||
            (global.MWalletAuth && typeof global.MWalletAuth.getState === "function"
                ? global.MWalletAuth.getState()
                : null);
        var signedIn = authState && authState.status === "signed_in";

        if (!signedIn || !sync || !authState || authState.configured !== true) {
            panel.hidden = true;
            if (syncNowBtn) { syncNowBtn.hidden = true; }
            if (reviewBtn) { reviewBtn.hidden = true; }
            return;
        }

        panel.hidden = false;

        var state = typeof sync.getState === "function" ? sync.getState() : null;
        var releaseOn = !!(state && state.releaseEnabled);
        var status = state ? state.status : "disabled";
        var label = SYNC_LABELS[status] || SYNC_LABELS.disabled;

        if (releaseOn && status === "pending" && state.pendingCount > 0) {
            label = state.pendingCount + (state.pendingCount === 1 ? " change waiting" : " changes waiting");
        }
        if (releaseOn && status === "conflicts" && state.conflictCount > 0) {
            label = "Needs attention — " + state.conflictCount +
                (state.conflictCount === 1 ? " conflict" : " conflicts");
        }
        if (releaseOn && status === "idle" && state.lastSuccessAt) {
            label = "Up to date";
        }
        if (statusEl) { statusEl.textContent = label; }

        if (noteEl) {
            noteEl.textContent = releaseOn
                ? "Financial changes reconcile across your signed-in devices. Conflicts are never resolved silently."
                : "Your financial data remains local on this device. Cloud synchronization stays off until pre-beta security verification is complete.";
        }

        if (syncNowBtn) { syncNowBtn.hidden = !releaseOn; }
        if (reviewBtn) {
            reviewBtn.hidden = !(releaseOn && state && state.conflictCount > 0);
        }
    }

    function onSyncNow() {
        var sync = global.MWalletSync;
        if (!sync || typeof sync.syncNow !== "function") { return; }
        var st = typeof sync.getState === "function" ? sync.getState() : null;
        if (!st || !st.releaseEnabled) { return; }
        var btn = document.getElementById("settings-sync-now-btn");
        if (btn) { btn.disabled = true; }
        setStatus("Syncing…");
        Promise.resolve(sync.syncNow({ manual: true })).then(function (res) {
            if (btn) { btn.disabled = false; }
            renderSyncStatus();
            if (res && res.status === "conflicts") {
                setStatus("Some financial data needs your attention.", "error");
            } else if (res && (res.status === "offline" || res.status === "error")) {
                setStatus("Couldn't sync right now. Your data is safe on this device.", "error");
            } else {
                setStatus("Sync finished.", "success");
            }
        }).catch(function () {
            if (btn) { btn.disabled = false; }
            renderSyncStatus();
            setStatus("Couldn't sync right now. Your data is safe on this device.", "error");
        });
    }

    function onSyncReview() {
        var ui = global.MWalletSyncUI;
        if (ui && typeof ui.openConflicts === "function") {
            ui.openConflicts();
        }
    }

    function onSignOut() {
        var auth = global.MWalletAuth;
        if (!auth || typeof auth.signOut !== "function") {
            return;
        }
        var btn = document.getElementById("settings-sign-out-btn");
        if (btn) { btn.disabled = true; }
        setStatus("Signing out…");
        auth.signOut().then(function (res) {
            if (btn) { btn.disabled = false; }
            renderAll();
            setStatus(
                res && res.ok ? "Signed out. Your local data is unchanged." : "Signed out on this device.",
                "success"
            );
        }).catch(function () {
            if (btn) { btn.disabled = false; }
            renderAll();
        });
    }

    function onAccountPasswordReset() {
        var auth = global.MWalletAuth;
        var state = auth && typeof auth.getState === "function" ? auth.getState() : null;
        var email = state && state.user ? state.user.email : "";
        if (!auth || typeof auth.resetPassword !== "function" || !email) {
            return;
        }
        var btn = document.getElementById("settings-account-reset-btn");
        if (btn) { btn.disabled = true; }
        setStatus("Sending reset email…");
        auth.resetPassword(email).then(function (res) {
            if (btn) { btn.disabled = false; }
            setStatus(
                (res && res.message) || "If that email has an account, a reset link is on its way.",
                res && res.ok ? "success" : "error"
            );
        }).catch(function () {
            if (btn) { btn.disabled = false; }
            setStatus("Could not send the reset email right now.", "error");
        });
    }


    function renderAll() {
        renderCategoryManager();
        renderStorageInfo();
        renderSystemStatus();
        renderVersionInfo();
        renderAuthStatus();
        applyPendingFocus();
    }

    function applyPendingFocus() {
        if (!pendingFocus) {
            return;
        }
        var el = document.getElementById(pendingFocus);
        pendingFocus = null;
        if (el && typeof el.focus === "function") {
            el.focus();
            if (typeof el.select === "function") {
                el.select();
            }
        }
    }


    /* ---- writes -------------------------------------- */

    function afterMutation(message, type) {
        editing = null;
        adding = null;
        renderAll();
        refreshApp();
        setStatus(message, type || "success");
    }

    function addCategory(name) {
        var store = storage();
        var trimmed = String(name || "").trim();
        if (!trimmed) {
            setStatus("Enter a category name.", "error");
            return;
        }
        var created = store.addCustomCategory(trimmed);
        if (!created) {
            setStatus('Could not add "' + trimmed + '" — that name is already in use.', "error");
            return;
        }
        expandedCategoryId = created.id;
        afterMutation('Added category "' + created.name + '".');
    }

    function renameCategory(categoryId, name) {
        var store = storage();
        var trimmed = String(name || "").trim();
        if (!trimmed) {
            setStatus("Enter a category name.", "error");
            return;
        }
        var result = store.renameCategory(categoryId, trimmed);
        if (!result) {
            setStatus("Could not rename — that name is already in use.", "error");
            return;
        }
        afterMutation('Renamed to "' + result.name + '".');
    }

    function deleteCategory(categoryId) {
        var store = storage();
        var current = store.getCategory(categoryId);
        if (!current) {
            return;
        }
        if (current.system) {
            setStatus("System categories can be disabled but not deleted.", "error");
            return;
        }
        var ok = global.confirm(
            'Delete the category "' + current.name + '"? ' +
            'Existing transactions keep their category label; only the option is removed.'
        );
        if (!ok) {
            return;
        }
        if (!store.deleteCustomCategory(categoryId)) {
            setStatus("Could not delete that category.", "error");
            return;
        }
        if (expandedCategoryId === categoryId) {
            expandedCategoryId = null;
        }
        afterMutation('Deleted category "' + current.name + '".');
    }

    function setCategoryEnabled(categoryId, enabled) {
        var store = storage();
        if (!store.setCategoryEnabled(categoryId, enabled)) {
            setStatus("Could not update that category.", "error");
            renderAll();
            return;
        }
        afterMutation(enabled ? "Category enabled." : "Category disabled.");
    }

    function addSubcategory(categoryId, name) {
        var store = storage();
        var trimmed = String(name || "").trim();
        if (!trimmed) {
            setStatus("Enter a subcategory name.", "error");
            return;
        }
        var created = store.addCustomSubcategory(categoryId, trimmed);
        if (!created) {
            setStatus('Could not add "' + trimmed + '" — that name is already in use.', "error");
            return;
        }
        expandedCategoryId = categoryId;
        afterMutation('Added subcategory "' + created.name + '".');
    }

    function renameSubcategory(categoryId, subcategoryId, name) {
        var store = storage();
        var trimmed = String(name || "").trim();
        if (!trimmed) {
            setStatus("Enter a subcategory name.", "error");
            return;
        }
        var result = store.renameSubcategory(categoryId, subcategoryId, trimmed);
        if (!result) {
            setStatus("Could not rename — that name is already in use.", "error");
            return;
        }
        afterMutation('Renamed to "' + result.name + '".');
    }

    function deleteSubcategory(categoryId, subcategoryId) {
        var store = storage();
        var current = store.getSubcategory(categoryId, subcategoryId);
        if (!current) {
            return;
        }
        if (current.system) {
            setStatus("System subcategories can be disabled but not deleted.", "error");
            return;
        }
        var ok = global.confirm('Delete the subcategory "' + current.name + '"?');
        if (!ok) {
            return;
        }
        if (!store.deleteCustomSubcategory(categoryId, subcategoryId)) {
            setStatus("Could not delete that subcategory.", "error");
            return;
        }
        afterMutation('Deleted subcategory "' + current.name + '".');
    }

    function setSubcategoryEnabled(categoryId, subcategoryId, enabled) {
        var store = storage();
        if (!store.setSubcategoryEnabled(categoryId, subcategoryId, enabled)) {
            setStatus("Could not update that subcategory.", "error");
            renderAll();
            return;
        }
        afterMutation(enabled ? "Subcategory enabled." : "Subcategory disabled.");
    }


    /* ---- import ------------------------------------- */

    function handleImportFile(file) {
        var store = storage();
        if (!file || !store || typeof store.importData !== "function") {
            return;
        }
        var reader = new FileReader();
        reader.onload = function () {
            var ok = global.confirm(
                "Importing replaces ALL current M-Wallet data on this device with the " +
                "contents of this file. This cannot be undone. Continue?"
            );
            if (!ok) {
                setStatus("Import cancelled.", "error");
                return;
            }
            var imported = false;
            try {
                imported = store.importData(String(reader.result || ""));
            } catch (error) {
                imported = false;
            }
            if (imported) {
                expandedCategoryId = null;
                editing = null;
                adding = null;
                refreshApp();
                renderAll();
                setStatus("Data imported successfully.", "success");
            } else {
                setStatus("Import failed — that file isn't valid M-Wallet data.", "error");
            }
        };
        reader.onerror = function () {
            setStatus("Could not read that file.", "error");
        };
        reader.readAsText(file);
    }


    /* ---- events ------------------------------------- */

    function onClick(event) {

        var trigger = event.target.closest("[data-set-action]");
        if (trigger) {
            var action = trigger.getAttribute("data-set-action");
            var catId = trigger.getAttribute("data-cat-id");
            var subId = trigger.getAttribute("data-sub-id");

            if (action === "auth-sign-out") {
                onSignOut();
                return;
            }
            if (action === "auth-password-reset") {
                onAccountPasswordReset();
                return;
            }
            if (action === "walkthrough-start") {
                onWalkthroughStart();
                return;
            }
            if (action === "cloud-check") {
                onCloudCheck();
                return;
            }
            if (action === "sync-now") {
                onSyncNow();
                return;
            }
            if (action === "sync-review") {
                onSyncReview();
                return;
            }

            if (action === "add-category-open") {
                adding = "category";
                editing = null;
                pendingFocus = "settings-new-category-input";
                renderAll();
                setStatus("");
                return;
            }
            if (action === "add-category-cancel") {
                adding = null;
                renderAll();
                return;
            }
            if (action === "rename-category") {
                editing = { kind: "category", categoryId: catId };
                adding = null;
                pendingFocus = "settings-rename-input";
                renderAll();
                setStatus("");
                return;
            }
            if (action === "rename-cancel") {
                editing = null;
                renderAll();
                return;
            }
            if (action === "delete-category") {
                deleteCategory(catId);
                return;
            }
            if (action === "expand-category") {
                expandedCategoryId = catId;
                adding = null;
                editing = null;
                renderAll();
                return;
            }
            if (action === "collapse-category") {
                if (expandedCategoryId === catId) {
                    expandedCategoryId = null;
                }
                adding = null;
                editing = null;
                renderAll();
                return;
            }
            if (action === "add-subcategory-open") {
                adding = { subcategoryOf: catId };
                editing = null;
                expandedCategoryId = catId;
                pendingFocus = "settings-new-subcategory-input";
                renderAll();
                setStatus("");
                return;
            }
            if (action === "add-subcategory-cancel") {
                adding = null;
                renderAll();
                return;
            }
            if (action === "rename-subcategory") {
                editing = {
                    kind: "subcategory",
                    categoryId: catId,
                    subcategoryId: subId
                };
                adding = null;
                pendingFocus = "settings-rename-input";
                renderAll();
                setStatus("");
                return;
            }
            if (action === "delete-subcategory") {
                deleteSubcategory(catId, subId);
                return;
            }
            return;
        }

        if (event.target.closest("#settings-import-trigger")) {
            var input = document.getElementById("settings-import-input");
            if (input) {
                input.click();
            }
        }
    }

    function onSubmit(event) {
        var form = event.target.closest("[data-set-form]");
        if (!form) {
            return;
        }
        event.preventDefault();

        var kind = form.getAttribute("data-set-form");
        var field = form.querySelector('[name="name"]');
        var value = field ? field.value : "";
        var catId = form.getAttribute("data-cat-id");
        var subId = form.getAttribute("data-sub-id");

        if (kind === "add-category") {
            addCategory(value);
        } else if (kind === "rename-category") {
            renameCategory(catId, value);
        } else if (kind === "add-subcategory") {
            addSubcategory(catId, value);
        } else if (kind === "rename-subcategory") {
            renameSubcategory(catId, subId, value);
        }
    }

    function onChange(event) {
        var toggle = event.target.closest("[data-set-toggle]");
        if (toggle) {
            var kind = toggle.getAttribute("data-set-toggle");
            var catId = toggle.getAttribute("data-cat-id");
            var subId = toggle.getAttribute("data-sub-id");
            if (kind === "category") {
                setCategoryEnabled(catId, toggle.checked);
            } else if (kind === "subcategory") {
                setSubcategoryEnabled(catId, subId, toggle.checked);
            }
            return;
        }

        if (event.target.id === "settings-import-input") {
            var file = event.target.files && event.target.files[0];
            handleImportFile(file);
            event.target.value = "";
        }
    }


    /* ---- lifecycle --------------------------------- */

    function init() {
        if (wired) {
            renderAll();
            return;
        }
        var page = document.getElementById("settings-page");
        if (!page) {
            return;
        }
        wired = true;

        page.addEventListener("click", onClick);
        page.addEventListener("submit", onSubmit);
        page.addEventListener("change", onChange);

        document.addEventListener("mwallet:page-changed", function (event) {
            if (event.detail && event.detail.page === "settings") {
                setStatus("");
                renderAll();
            }
        });

        /* keep the Accounts row live if auth state settles or
           changes while Settings is open (one subscription) */
        if (global.MWalletAuth && typeof global.MWalletAuth.subscribe === "function") {
            global.MWalletAuth.subscribe(function () {
                renderAuthStatus();
            });
        }

        /* BP4 — keep the Local Data row live as ownership resolves */
        if (global.MWalletLocalMigration && typeof global.MWalletLocalMigration.subscribe === "function") {
            global.MWalletLocalMigration.subscribe(function () {
                renderLocalDataStatus();
            });
        }

        /* BP5 — keep the First-Run Setup row live */
        if (global.MWalletFirstRun && typeof global.MWalletFirstRun.subscribe === "function") {
            global.MWalletFirstRun.subscribe(function () {
                renderFirstRunStatus();
                renderWalkthroughStatus();
            });
        }

        /* BP6 — keep the Guided Tour row live */
        if (global.MWalletWalkthrough && typeof global.MWalletWalkthrough.subscribe === "function") {
            global.MWalletWalkthrough.subscribe(function () {
                renderWalkthroughStatus();
            });
        }

        /* BP8 — keep the Cloud Sync row live as the engine works */
        if (global.MWalletSync && typeof global.MWalletSync.subscribe === "function") {
            global.MWalletSync.subscribe(function () {
                renderSyncStatus();
            });
        }

        renderAll();
    }

    global.SettingsUI = {
        init: init,
        render: renderAll,
        renderCategoryManager: renderCategoryManager,
        // exposed for tests
        estimateStorageBytes: estimateStorageBytes,
        formatBytes: formatBytes,
        categoryRowModel: categoryRowModel,
        renderSyncStatus: renderSyncStatus,
        onSyncNow: onSyncNow,
        onSyncReview: onSyncReview
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }
    }

})(typeof window !== "undefined" ? window : this);
