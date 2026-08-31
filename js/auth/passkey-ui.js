"use strict";

/* =========================================================
   M-WALLET — PASSKEY UI   (BP9)

       window.MWalletPasskeyUI

   Two surfaces, both governed by MWalletPasskeyRelease:

     1. The auth gateway "Use a Passkey" control (in the
        welcome + sign-in views). Shown ONLY when passkeys are
        actually available (release enabled + configured +
        WebAuthn + secure context + API present). Password
        sign-in and password recovery are never removed.

     2. Settings → the Passkeys section: status, "Add Passkey",
        and a list with Rename / Remove per passkey plus an
        explicit removal-confirmation dialog.

   While the release gate is off (the committed BP9 build):
     - the gateway control is NOT shown to normal users
     - Settings shows a truthful "activation pending
       verification" status with no button that can start a
       WebAuthn ceremony

   All dynamic text is written with textContent — never
   innerHTML. No credential id / raw JSON / owner id / token
   is ever rendered or logged.
   ========================================================= */

(function (global) {

    var CONFIRM_ID = "mw-passkey-confirm";

    var doc = null;
    var wired = false;
    var confirmEl = null;
    var pendingRemoveRef = null;
    var confirmOpener = null;
    var cachedList = null;      /* in-memory only — the passkeys shown in Settings */
    var listFetching = false;

    var ERROR_TEXT = {
        disabled: "Passkeys aren't turned on in this build yet.",
        not_configured: "Passkeys aren't available right now.",
        unsupported: "This browser doesn't support passkeys.",
        insecure_context: "Passkeys need a secure (https) connection.",
        recovery_mode: "Finish resetting your password first.",
        signed_out: "Sign in first to manage passkeys.",
        not_confirmed: "Verify your email before adding a passkey.",
        anonymous: "Passkeys aren't available for this account.",
        user_cancelled: "Passkey sign-in was cancelled.",
        no_passkey_available: "No passkey was available on this device.",
        project_not_enabled: "Passkeys aren't enabled for this project yet.",
        network_error: "Couldn't reach the sign-in service. Check your connection.",
        auth_failed: "Passkey sign-in didn't succeed. Try again or use your password.",
        management_failed: "That passkey change didn't save. Please try again.",
        invalid_name: "Enter a name between 1 and 120 characters.",
        busy: "Please wait for the current passkey action to finish.",
        unknown_error: "Something went wrong with the passkey. Try again or use your password."
    };

    function passkeys() {
        try { return global.MWalletPasskeys || null; } catch (e) { return null; }
    }
    function caps() {
        var p = passkeys();
        try { return (p && typeof p.getCapabilities === "function") ? p.getCapabilities() : null; }
        catch (e) { return null; }
    }
    function setText(id, text) {
        var el = doc && doc.getElementById(id);
        if (el) { el.textContent = text == null ? "" : String(text); }
    }
    function announce(id, text) {
        var el = doc && doc.getElementById(id);
        if (el) { el.hidden = !text; el.textContent = text || ""; }
    }


    /* =====================================================
       1. AUTH GATEWAY  "Use a Passkey"
       ===================================================== */

    function authSnap() {
        try {
            return (global.MWalletAuth && typeof global.MWalletAuth.getState === "function")
                ? global.MWalletAuth.getState() : null;
        } catch (e) { return null; }
    }

    function gatewayAvailable() {
        var c = caps();
        var s = authSnap();
        /* password recovery always wins — never offer a passkey ceremony
           that would interrupt the "set a new password" flow */
        if (s && s.recoveryMode === true) { return false; }
        return !!(c && c.available === true);
    }

    /* auth-ui.js calls this from its click handler for
       data-auth-action="passkey-signin". One click -> one ceremony. */
    function startGatewaySignIn(triggerEl) {
        var p = passkeys();
        if (!p || typeof p.signIn !== "function") { return; }
        if (!gatewayAvailable()) { return; }

        var st = typeof p.getState === "function" ? p.getState() : null;
        if (st && st.busy) { return; }

        var buttons = gatewayButtons();
        setGatewayBusy(buttons, true);
        gatewayMessage("");

        Promise.resolve(p.signIn()).then(function (res) {
            setGatewayBusy(buttons, false);
            if (res && res.ok) {
                /* success: the Supabase auth listener + the BP2/BP3 pipeline
                   move the app forward. Nothing to do here. */
                gatewayMessage("");
                return;
            }
            gatewayMessage(ERROR_TEXT[res && res.code] || ERROR_TEXT.unknown_error);
        }).catch(function () {
            setGatewayBusy(buttons, false);
            gatewayMessage(ERROR_TEXT.unknown_error);
        });
        void triggerEl;
    }

    function gatewayButtons() {
        if (!doc || typeof doc.querySelectorAll !== "function") { return []; }
        var list = doc.querySelectorAll('[data-auth-action="passkey-signin"]');
        return list ? Array.prototype.slice.call(list) : [];
    }

    function setGatewayBusy(buttons, isBusy) {
        buttons.forEach(function (b) {
            b.disabled = !!isBusy;
            if (isBusy && !b.hasAttribute("data-label")) {
                b.setAttribute("data-label", b.textContent);
                b.textContent = "Waiting for your device…";
            } else if (!isBusy && b.hasAttribute("data-label")) {
                b.textContent = b.getAttribute("data-label");
                b.removeAttribute("data-label");
            }
        });
    }

    function gatewayMessage(text) {
        announce("mw-passkey-gateway-msg", text);
    }

    /* show / hide the gateway passkey controls to match availability.
       Called on init and whenever auth state changes. */
    function renderGateway() {
        if (!doc || typeof doc.querySelectorAll !== "function") { return; }
        var show = gatewayAvailable();
        var wraps = doc.querySelectorAll("[data-passkey-gateway]");
        Array.prototype.slice.call(wraps || []).forEach(function (w) {
            w.hidden = !show;
        });
        if (!show) { gatewayMessage(""); }
    }


    /* =====================================================
       2. SETTINGS  →  Passkeys
       ===================================================== */

    function renderSettings(authStateSnapshot) {
        var panel = doc && doc.getElementById("settings-passkey-panel");
        if (!panel) { return; }

        var p = passkeys();
        var authState = authStateSnapshot ||
            (global.MWalletAuth && typeof global.MWalletAuth.getState === "function"
                ? global.MWalletAuth.getState()
                : null);
        var signedIn = authState && authState.status === "signed_in";
        var configured = authState && authState.configured === true;
        var addBtn = doc.getElementById("settings-passkey-add-btn");
        var listEl = doc.getElementById("settings-passkey-list");
        var statusEl = doc.getElementById("settings-passkey-status");
        var noteEl = doc.getElementById("settings-passkey-note");

        /* recovery mode: hide passkey management entirely, the recovery
           screen owns the flow */
        if (!signedIn || !configured || !p || (authState && authState.recoveryMode === true)) {
            panel.hidden = true;
            if (addBtn) { addBtn.hidden = true; }
            if (listEl) { clearChildren(listEl); }
            return;
        }
        panel.hidden = false;

        var c = caps() || {};
        var releaseOn = c.releaseEnabled === true;

        if (!releaseOn) {
            if (statusEl) { statusEl.textContent = "Built — activation pending security verification"; }
            if (noteEl) {
                noteEl.textContent = "Passkeys let you sign in without your password. They stay off until pre-beta security verification is complete. Your password sign-in and password reset are unaffected.";
            }
            if (addBtn) { addBtn.hidden = true; }
            if (listEl) { clearChildren(listEl); }
            return;
        }

        if (!c.supported) {
            if (statusEl) { statusEl.textContent = "Not supported in this browser"; }
            if (noteEl) { noteEl.textContent = "This browser doesn't support passkeys. You can still sign in with your email and password."; }
            if (addBtn) { addBtn.hidden = true; }
            if (listEl) { clearChildren(listEl); }
            return;
        }

        var confirmedFalse = authState.user && authState.user.confirmed === false;
        if (confirmedFalse) {
            if (statusEl) { statusEl.textContent = "Verify your email first"; }
            if (noteEl) { noteEl.textContent = "Verify your email address before adding a passkey."; }
            if (addBtn) { addBtn.hidden = true; }
            if (listEl) { clearChildren(listEl); }
            return;
        }

        if (noteEl) {
            noteEl.textContent = "Use a passkey to sign in without your password. Your device may ask for Face ID, Touch ID, Windows Hello, a device PIN, or a security key. Your password sign-in stays available.";
        }
        if (addBtn) { addBtn.hidden = false; }

        /* fetch the list ONCE when the section becomes usable — never on
           every render, never on a timer */
        if (cachedList == null && !listFetching) { fetchList(); }

        updateStatusCount();
        renderList(cachedList || []);
    }

    function updateStatusCount() {
        var statusEl = doc && doc.getElementById("settings-passkey-status");
        if (!statusEl) { return; }
        var count = cachedList == null ? null : cachedList.length;
        statusEl.textContent = (count == null)
            ? "Ready"
            : (count === 0 ? "No passkeys yet"
                : (count + (count === 1 ? " passkey registered" : " passkeys registered")));
    }

    /* explicit fetch: on first show, and after add / rename / remove */
    function fetchList() {
        var p = passkeys();
        if (!p || typeof p.list !== "function" || listFetching) { return Promise.resolve(); }
        listFetching = true;
        return Promise.resolve(p.list()).then(function (res) {
            listFetching = false;
            cachedList = (res && res.ok && Array.isArray(res.passkeys)) ? res.passkeys.slice() : [];
            updateStatusCount();
            renderList(cachedList);
            return res;
        }).catch(function () {
            listFetching = false;
            cachedList = cachedList || [];
            return { ok: false };
        });
    }

    function refreshAndRenderList() {
        cachedList = null;              /* force a re-fetch */
        return fetchList();
    }

    function renderList(rows) {
        var listEl = doc && doc.getElementById("settings-passkey-list");
        if (!listEl) { return; }
        clearChildren(listEl);
        rows = Array.isArray(rows) ? rows : [];

        if (!rows.length) {
            var empty = doc.createElement("p");
            empty.className = "mw-passkey-empty";
            empty.textContent = (cachedList == null) ? "Loading your passkeys…" : "No passkeys on this account yet.";
            listEl.appendChild(empty);
            return;
        }

        rows.forEach(function (pk) {
            listEl.appendChild(buildRow(pk));
        });
    }

    function buildRow(pk) {
        var li = doc.createElement("li");
        li.className = "mw-passkey-row";
        if (pk._ref) { li.setAttribute("data-passkey-ref", pk._ref); }

        var name = doc.createElement("strong");
        name.className = "mw-passkey-name";
        name.textContent = pk.friendlyName || "Passkey";
        li.appendChild(name);

        var meta = doc.createElement("p");
        meta.className = "mw-passkey-meta";
        meta.textContent = metaLine(pk);
        li.appendChild(meta);

        var actions = doc.createElement("div");
        actions.className = "mw-passkey-row-actions";
        actions.appendChild(rowButton("Rename", "passkey-rename", pk));
        actions.appendChild(rowButton("Remove", "passkey-remove", pk));
        li.appendChild(actions);

        return li;
    }

    function rowButton(label, action, pk) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "z-btn z-btn-secondary mw-passkey-row-btn";
        b.textContent = label;
        b.setAttribute("data-passkey-action", action);
        if (pk._ref) { b.setAttribute("data-passkey-ref", pk._ref); }
        return b;
    }

    function metaLine(pk) {
        var parts = [];
        if (pk.createdAt) { parts.push("Added " + friendlyDate(pk.createdAt)); }
        if (pk.lastUsedAt) { parts.push("last used " + friendlyDate(pk.lastUsedAt)); }
        return parts.length ? parts.join(" · ") : "Passkey";
    }

    function friendlyDate(iso) {
        try {
            var dt = new Date(iso);
            if (isNaN(dt.getTime())) { return "recently"; }
            return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
        } catch (e) { return "recently"; }
    }


    /* ---- Settings actions ---- */

    function onSettingsClick(event) {
        var trigger = event.target && event.target.closest
            ? event.target.closest("[data-passkey-action], [data-set-action='passkey-add']")
            : null;
        if (!trigger) { return; }
        var action = trigger.getAttribute("data-passkey-action") || trigger.getAttribute("data-set-action");

        if (action === "passkey-add") { onAdd(trigger); return; }
        if (action === "passkey-rename") { onRename(trigger); return; }
        if (action === "passkey-remove") { openRemoveConfirm(trigger.getAttribute("data-passkey-ref"), trigger); return; }
        if (action === "passkey-rename-save") { onRenameSave(trigger); return; }
        if (action === "passkey-rename-cancel") { renderList(cachedList || []); return; }
    }

    function settingsMessage(text, kind) {
        announce("settings-passkey-msg", text);
        var el = doc && doc.getElementById("settings-passkey-msg");
        if (el) { el.setAttribute("data-kind", kind || ""); }
    }

    function onAdd(trigger) {
        var p = passkeys();
        if (!p || typeof p.register !== "function") { return; }
        /* defence in depth: even a forced click on a hidden control starts
           no WebAuthn ceremony while passkeys aren't actually available */
        var c = caps();
        if (!c || c.releaseEnabled !== true || c.supported !== true) { return; }
        if (trigger) { trigger.disabled = true; }
        settingsMessage("Follow your device's prompt to add a passkey…");
        Promise.resolve(p.register()).then(function (res) {
            if (trigger) { trigger.disabled = false; }
            if (res && res.ok) {
                settingsMessage("Passkey added.", "success");
                refreshAndRenderList();
                return;
            }
            settingsMessage(ERROR_TEXT[res && res.code] || ERROR_TEXT.unknown_error,
                (res && res.code === "user_cancelled") ? null : "error");
        }).catch(function () {
            if (trigger) { trigger.disabled = false; }
            settingsMessage(ERROR_TEXT.unknown_error, "error");
        });
    }

    function onRename(trigger) {
        var ref = trigger.getAttribute("data-passkey-ref");
        var li = trigger.closest ? trigger.closest(".mw-passkey-row") : null;
        if (!li || !ref) { return; }

        clearChildren(li);
        li.setAttribute("data-editing", "true");

        var field = doc.createElement("div");
        field.className = "mw-passkey-rename";
        var label = doc.createElement("label");
        label.className = "z-label";
        label.setAttribute("for", "mw-passkey-rename-input");
        label.textContent = "Passkey name";
        var input = doc.createElement("input");
        input.className = "z-input";
        input.id = "mw-passkey-rename-input";
        input.type = "text";
        input.maxLength = 120;
        input.setAttribute("data-passkey-rename-input", "true");
        field.appendChild(label);
        field.appendChild(input);
        li.appendChild(field);

        var actions = doc.createElement("div");
        actions.className = "mw-passkey-row-actions";
        var save = rowButton("Save", "passkey-rename-save", { _ref: ref });
        save.className = "z-btn z-btn-primary mw-passkey-row-btn";
        actions.appendChild(save);
        actions.appendChild(rowButton("Cancel", "passkey-rename-cancel", { _ref: ref }));
        li.appendChild(actions);

        if (typeof input.focus === "function") { input.focus(); }
    }

    function onRenameSave(trigger) {
        var ref = trigger.getAttribute("data-passkey-ref");
        var li = trigger.closest ? trigger.closest(".mw-passkey-row") : null;
        var input = li ? li.querySelector("[data-passkey-rename-input]") : null;
        var value = input ? input.value : "";
        var p = passkeys();
        if (!p || typeof p.rename !== "function" || !ref) { return; }

        trigger.disabled = true;
        Promise.resolve(p.rename(ref, value)).then(function (res) {
            trigger.disabled = false;
            if (res && res.ok) {
                settingsMessage("Passkey renamed.", "success");
                refreshAndRenderList();
                return;
            }
            settingsMessage(ERROR_TEXT[res && res.code] || ERROR_TEXT.management_failed, "error");
        }).catch(function () {
            trigger.disabled = false;
            settingsMessage(ERROR_TEXT.management_failed, "error");
        });
    }


    /* ---- removal confirmation dialog ---- */

    function openRemoveConfirm(ref, opener) {
        if (!confirmEl || !ref) { return; }
        pendingRemoveRef = ref;
        confirmOpener = opener || (doc && doc.activeElement) || null;
        confirmEl.hidden = false;
        confirmEl.setAttribute("aria-hidden", "false");
        var title = doc.getElementById("mw-passkey-confirm-title");
        if (title && typeof title.focus === "function") { title.focus(); }
        var busyBtn = doc.getElementById("mw-passkey-confirm-remove");
        if (busyBtn) { busyBtn.disabled = false; }
    }

    function closeRemoveConfirm() {
        if (confirmEl) {
            confirmEl.hidden = true;
            confirmEl.setAttribute("aria-hidden", "true");
        }
        pendingRemoveRef = null;
        try { if (confirmOpener && typeof confirmOpener.focus === "function") { confirmOpener.focus(); } }
        catch (e) { /* ignore */ }
        confirmOpener = null;
    }

    function onConfirmClick(event) {
        var trigger = event.target && event.target.closest
            ? event.target.closest("[data-passkey-action]")
            : null;
        if (!trigger) { return; }
        var action = trigger.getAttribute("data-passkey-action");

        if (action === "confirm-cancel") { closeRemoveConfirm(); return; }
        if (action !== "confirm-remove") { return; }

        var ref = pendingRemoveRef;
        var p = passkeys();
        if (!ref || !p || typeof p.remove !== "function") { closeRemoveConfirm(); return; }

        trigger.disabled = true;
        Promise.resolve(p.remove(ref)).then(function (res) {
            closeRemoveConfirm();
            if (res && res.ok) {
                settingsMessage("Passkey removed. Your password sign-in is still available.", "success");
                refreshAndRenderList();
                return;
            }
            settingsMessage(ERROR_TEXT[res && res.code] || ERROR_TEXT.management_failed, "error");
            renderList(cachedList || []);   /* keep the list as-is on failure */
        }).catch(function () {
            closeRemoveConfirm();
            settingsMessage(ERROR_TEXT.management_failed, "error");
            renderList();
        });
    }

    function onKeydown(event) {
        if (!confirmEl || confirmEl.hidden) { return; }
        var key = event && (event.key || event.code);
        if (key === "Escape" || key === "Esc") {
            if (event.preventDefault) { event.preventDefault(); }
            closeRemoveConfirm();   /* non-destructive */
        }
    }


    /* =====================================================
       WIRING
       ===================================================== */

    function clearChildren(el) {
        if (!el) { return; }
        if (typeof el.replaceChildren === "function") { el.replaceChildren(); return; }
        while (el.firstChild) { el.removeChild(el.firstChild); }
        el.textContent = "";
    }

    function refresh() {
        renderGateway();
        renderSettings();
    }

    function init(injectedDoc) {
        doc = injectedDoc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        confirmEl = doc.getElementById(CONFIRM_ID);
        var gate = doc.getElementById("mw-auth-gate");
        var settingsPage = doc.getElementById("settings-page");
        if (!gate && !settingsPage && !confirmEl) { return false; }

        if (!wired) {
            wired = true;
            if (gate) { gate.addEventListener("click", function (e) {
                var t = e.target && e.target.closest ? e.target.closest('[data-auth-action="passkey-signin"]') : null;
                if (t) { startGatewaySignIn(t); }
            }); }
            if (settingsPage) { settingsPage.addEventListener("click", onSettingsClick); }
            if (confirmEl) { confirmEl.addEventListener("click", onConfirmClick); }
            if (typeof doc.addEventListener === "function") { doc.addEventListener("keydown", onKeydown); }

            try {
                var a = global.MWalletAuth;
                if (a && typeof a.subscribe === "function") {
                    a.subscribe(function () { refresh(); });
                }
            } catch (e) { /* ignore */ }
        }
        refresh();
        return true;
    }

    global.MWalletPasskeyUI = {
        init: init,
        refresh: refresh,
        renderGateway: renderGateway,
        renderSettings: renderSettings,
        startGatewaySignIn: startGatewaySignIn,
        openRemoveConfirm: openRemoveConfirm,
        closeRemoveConfirm: closeRemoveConfirm
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
