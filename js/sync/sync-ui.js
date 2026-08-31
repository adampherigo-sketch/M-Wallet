"use strict";

/* =========================================================
   M-WALLET — SYNC UI   (BP8)

       window.MWalletSyncUI

   Two surfaces, both dormant while the sync RELEASE GATE is
   off (the committed BP8 default):

     1. #mw-sync-bootstrap — a brief gate shown on a FRESH
        device (empty local wallet) while the engine checks the
        cloud for an existing wallet, so a returning user never
        creates a competing starting balance in BP5. If the
        cloud can't be reached it offers Retry / Continue
        Offline. Coordinates with auth-ui exactly like the BP4
        / BP5 / BP6 gates. Fully fail-open.

     2. #mw-sync-conflicts — a review overlay listing documents
        that changed on two devices at once. Per document:
        "Keep this device" / "Use cloud version" / "Decide
        later". Never dumps raw JSON, never shows an owner id.

   This module renders text with textContent only — never
   innerHTML with dynamic values.
   ========================================================= */

(function (global) {

    var BOOT_ID = "mw-sync-bootstrap";
    var CONFLICT_ID = "mw-sync-conflicts";

    var doc = null;
    var wired = false;
    var bootEl = null;
    var conflictEl = null;

    function sync() {
        try { return global.MWalletSync || null; } catch (e) { return null; }
    }
    function authUi() {
        try { return global.MWalletAuthUI || null; } catch (e) { return null; }
    }

    /* =====================================================
       BOOTSTRAP GATE
       ===================================================== */

    var BOOT_COPY = {
        checking: {
            title: "Checking your cloud wallet",
            body: "One moment — making sure this device has your latest M-Wallet data before you start."
        },
        needs_decision: {
            title: "Couldn't check your cloud wallet",
            body: "Cloud data may already exist for this account. Continuing offline creates or uses local data on this device — M-Wallet will reconcile it when sync is available."
        }
    };

    function bootScreenFor(status) {
        if (status === "checking") { return "checking"; }
        if (status === "needs_decision") { return "needs_decision"; }
        return null;
    }

    function renderBootstrap() {
        if (!bootEl) { return; }
        var s = sync();
        var state = s && typeof s.getState === "function" ? s.getState() : null;
        var screen = state ? bootScreenFor(state.bootstrapStatus) : null;

        var ui = authUi();

        if (!screen) {
            bootEl.hidden = true;
            if (ui && typeof ui.setBootstrapScreenActive === "function") { ui.setBootstrapScreenActive(false); }
            if (ui && typeof ui.renderState === "function") { ui.renderState(); }
            return;
        }

        var copy = BOOT_COPY[screen];
        setText("mw-sync-bootstrap-title", copy.title);
        setText("mw-sync-bootstrap-body", copy.body);

        var retryBtn = doc.getElementById("mw-sync-bootstrap-retry");
        var offlineBtn = doc.getElementById("mw-sync-bootstrap-offline");
        if (retryBtn) { retryBtn.hidden = screen !== "needs_decision"; }
        if (offlineBtn) { offlineBtn.hidden = screen !== "needs_decision"; }

        bootEl.hidden = false;
        if (ui && typeof ui.setBootstrapScreenActive === "function") { ui.setBootstrapScreenActive(true); }
        if (ui && typeof ui.renderState === "function") { ui.renderState(); }
    }

    function onBootstrapClick(event) {
        var trigger = event.target.closest ? event.target.closest("[data-sync-action]") : null;
        if (!trigger) { return; }
        var action = trigger.getAttribute("data-sync-action");
        var s = sync();
        if (!s) { return; }
        if (action === "bootstrap-retry" && typeof s.bootstrapRetry === "function") {
            trigger.disabled = true;
            Promise.resolve(s.bootstrapRetry()).then(function () { trigger.disabled = false; renderBootstrap(); });
        } else if (action === "bootstrap-offline" && typeof s.bootstrapContinueOffline === "function") {
            trigger.disabled = true;
            Promise.resolve(s.bootstrapContinueOffline()).then(function () { trigger.disabled = false; renderBootstrap(); });
        }
    }

    /* =====================================================
       CONFLICT REVIEW OVERLAY
       ===================================================== */

    var REASON_COPY = {
        both_changed: "changed on this device and in the cloud",
        both_changed_no_base: "changed on this device and in the cloud",
        revision_conflict: "changed in the cloud while this device also had changes",
        unsupported_remote_delete: "was removed in the cloud but is needed on this device",
        invalid_remote_document: "the cloud copy could not be read safely"
    };

    var conflictOpener = null;   /* element to restore focus to on close */

    function openConflicts() {
        try {
            conflictOpener = (doc && doc.activeElement) ? doc.activeElement : null;
        } catch (e) { conflictOpener = null; }
        renderConflicts(true);
        /* move focus into the dialog */
        try {
            var title = doc.getElementById("mw-sync-conflicts-title");
            if (title && typeof title.focus === "function") { title.focus(); }
        } catch (e) { /* ignore */ }
    }

    function closeConflicts() {
        if (conflictEl) {
            conflictEl.hidden = true;
            conflictEl.setAttribute("aria-hidden", "true");
        }
        /* NON-DESTRUCTIVE: closing never resolves or changes any data */
        try {
            if (conflictOpener && typeof conflictOpener.focus === "function") { conflictOpener.focus(); }
        } catch (e) { /* ignore */ }
        conflictOpener = null;
    }

    function onConflictKeydown(event) {
        if (!conflictEl || conflictEl.hidden) { return; }
        var key = event && (event.key || event.code);
        if (key === "Escape" || key === "Esc") {
            if (event.preventDefault) { event.preventDefault(); }
            closeConflicts();
        }
    }

    function renderConflicts(forceOpen) {
        if (!conflictEl) { return; }
        var s = sync();
        var list = (s && typeof s.getConflicts === "function") ? s.getConflicts() : [];
        var listEl = doc.getElementById("mw-sync-conflicts-list");
        var emptyEl = doc.getElementById("mw-sync-conflicts-empty");

        if (listEl && typeof listEl.replaceChildren === "function") { listEl.replaceChildren(); }
        else if (listEl) { while (listEl.firstChild) { listEl.removeChild(listEl.firstChild); } }

        if (!list.length) {
            if (emptyEl) { emptyEl.hidden = false; }
            if (!forceOpen) {
                conflictEl.hidden = true;
                conflictEl.setAttribute("aria-hidden", "true");
            } else {
                conflictEl.hidden = false;
                conflictEl.setAttribute("aria-hidden", "false");
            }
            return;
        }
        if (emptyEl) { emptyEl.hidden = true; }

        list.forEach(function (c) {
            var item = doc.createElement("li");
            item.className = "mw-sync-conflict";
            item.setAttribute("data-doc-type", c.documentType);
            item.setAttribute("data-doc-key", c.documentKey);

            var title = doc.createElement("strong");
            title.textContent = c.title;
            item.appendChild(title);

            var desc = doc.createElement("p");
            desc.textContent = (c.title) + " " + (REASON_COPY[c.reason] || "changed in two places") + ". Choose which version to keep.";
            item.appendChild(desc);

            var actions = doc.createElement("div");
            actions.className = "mw-sync-conflict-actions";
            actions.appendChild(makeButton("Keep this device", "resolve-keep", c));
            actions.appendChild(makeButton("Use cloud version", "resolve-cloud", c));
            actions.appendChild(makeButton("Decide later", "resolve-later", c));
            item.appendChild(actions);

            if (listEl) { listEl.appendChild(item); }
        });

        conflictEl.hidden = false;
        conflictEl.setAttribute("aria-hidden", "false");
    }

    function makeButton(label, action, conflict) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "z-btn mw-sync-conflict-btn";
        b.textContent = label;
        b.setAttribute("data-sync-action", action);
        b.setAttribute("data-doc-type", conflict.documentType);
        b.setAttribute("data-doc-key", conflict.documentKey);
        return b;
    }

    function onConflictClick(event) {
        var trigger = event.target.closest ? event.target.closest("[data-sync-action]") : null;
        if (!trigger) { return; }
        var action = trigger.getAttribute("data-sync-action");

        if (action === "conflicts-close") { closeConflicts(); return; }
        if (action === "resolve-later") { return; }   /* leave it; overlay can be reopened */

        var type = trigger.getAttribute("data-doc-type");
        var key = trigger.getAttribute("data-doc-key");
        var s = sync();
        if (!s || typeof s.resolveConflict !== "function") { return; }

        var choice = action === "resolve-keep" ? "keep-local" : (action === "resolve-cloud" ? "use-cloud" : null);
        if (!choice) { return; }

        if (action === "resolve-cloud" && !global.confirm(
            "This replaces this device's copy of \"" + describeItem(trigger) + "\" with the current cloud version. Continue?"
        )) { return; }

        setItemBusy(trigger, true);
        Promise.resolve(s.resolveConflict(type, key, choice)).then(function () {
            setItemBusy(trigger, false);
            renderConflicts(true);
        }).catch(function () {
            setItemBusy(trigger, false);
            renderConflicts(true);
        });
    }

    function describeItem(triggerEl) {
        var li = triggerEl.closest ? triggerEl.closest(".mw-sync-conflict") : null;
        var strong = li ? li.querySelector("strong") : null;
        return strong ? strong.textContent : "this data";
    }

    function setItemBusy(triggerEl, busy) {
        var li = triggerEl.closest ? triggerEl.closest(".mw-sync-conflict") : null;
        if (!li) { return; }
        li.querySelectorAll("button").forEach(function (b) { b.disabled = busy === true; });
    }

    /* =====================================================
       WIRING
       ===================================================== */

    function setText(id, text) {
        var el = doc.getElementById(id);
        if (el) { el.textContent = text; }
    }

    function refresh() {
        renderBootstrap();
        renderConflicts(false);
    }

    function init(injectedDoc) {
        doc = injectedDoc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        bootEl = doc.getElementById(BOOT_ID);
        conflictEl = doc.getElementById(CONFLICT_ID);
        if (!bootEl && !conflictEl) { return false; }

        if (!wired) {
            wired = true;
            if (bootEl) { bootEl.addEventListener("click", onBootstrapClick); }
            if (conflictEl) { conflictEl.addEventListener("click", onConflictClick); }
            if (typeof doc.addEventListener === "function") {
                doc.addEventListener("keydown", onConflictKeydown);
            }
            var s = sync();
            if (s && typeof s.subscribe === "function") {
                s.subscribe(function () { refresh(); });
            }
        }
        refresh();
        return true;
    }

    global.MWalletSyncUI = {
        init: init,
        refresh: refresh,
        openConflicts: openConflicts,
        closeConflicts: closeConflicts
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
