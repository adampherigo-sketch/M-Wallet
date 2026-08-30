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


    function renderAll() {
        renderCategoryManager();
        renderStorageInfo();
        renderSystemStatus();
        renderVersionInfo();
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

        renderAll();
    }

    global.SettingsUI = {
        init: init,
        render: renderAll,
        renderCategoryManager: renderCategoryManager,
        // exposed for tests
        estimateStorageBytes: estimateStorageBytes,
        formatBytes: formatBytes,
        categoryRowModel: categoryRowModel
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
        } else {
            init();
        }
    }

})(typeof window !== "undefined" ? window : this);
