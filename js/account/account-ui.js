"use strict";

/* =========================================================
   M-WALLET — ACCOUNT / PRIVACY / RECOVERY  ·  UI   (BP10)

       window.MWalletAccountUI

   Renders the Settings account-management sections and drives
   the three BP10 dialogs:

     - change email        (#mw-acct-email-dialog)
     - restore from backup (#mw-acct-restore-dialog)  — safe
       counts-only preview + explicit confirmation
     - erase this device   (#mw-acct-erase-dialog)    — strong
       warning + typed phrase + final button

   All account logic lives in js/account/account-controls.js
   (window.MWalletAccount). This file is DOM only: it never
   parses an export, never writes localStorage, never touches
   the stored financial wallet. Untrusted import text is passed
   to MWalletAccount.inspectImport / restoreWallet and is never
   turned into HTML here (textContent only).
   ========================================================= */

(function (global) {

    var EMAIL_DIALOG = "mw-acct-email-dialog";
    var RESTORE_DIALOG = "mw-acct-restore-dialog";
    var ERASE_DIALOG = "mw-acct-erase-dialog";

    var ERASE_PHRASE = "ERASE";

    var ERROR_TEXT = {
        auth_required: "Sign in first.",
        not_configured: "Accounts aren't set up in this build.",
        recovery_mode: "Finish resetting your password first.",
        not_supported: "That isn't available right now.",
        invalid_email: "Enter a valid email address.",
        same_email: "That is already your email address.",
        email_update_failed: "Could not start the email change. Try again.",
        password_update_failed: "Could not send the reset email. Try again.",
        export_failed: "Could not build the backup file.",
        no_wallet: "There is no wallet data to export yet.",
        invalid_json: "That file isn't valid JSON.",
        invalid_export: "That file isn't an M-Wallet backup.",
        unsupported_export: "That backup was made by a newer version of M-Wallet.",
        unsupported_schema: "That backup uses a newer data format than this app understands.",
        missing_wallet: "That backup has no wallet data in it.",
        invalid_wallet: "That backup's wallet data is malformed.",
        unsafe_keys: "That file contains unsafe keys and was rejected.",
        too_large: "That file is too large to be an M-Wallet backup.",
        confirmation_required: "Please confirm to continue.",
        owner_mismatch: "This wallet belongs to a different account.",
        import_failed: "Restore failed. Your existing wallet was not changed.",
        local_storage_error: "This browser blocked the write. Your existing wallet was not changed.",
        sync_reset_failed: "Could not safely reset sync data — your existing wallet was not changed.",
        erase_failed: "Erase failed. Your wallet on this device was not changed.",
        erase_incomplete: "Some data could not be removed, so your wallet on this device was kept. Nothing was assumed erased.",
        erased_signout_failed: "Your wallet was erased from this device, but sign-out didn't finish. Use “Sign out” again to finish.",
        busy: "Please wait for the current action to finish.",
        cancelled: "Cancelled.",
        unknown_error: "Something went wrong. Try again."
    };


    /* =====================================================
       PURE HELPERS (unit-tested)
       ===================================================== */

    function friendlyError(code) {
        return ERROR_TEXT[code] || ERROR_TEXT.unknown_error;
    }

    function accountRowModel(summary) {
        var s = summary || {};
        var acct = s.account || {};
        var data = s.data || {};
        var statusLabel = !acct.configured
            ? "Not configured"
            : (acct.signedIn ? "Signed in" : "Signed out");
        var verifiedLabel = null;
        var verifiedClass = null;
        if (acct.signedIn) {
            verifiedLabel = acct.emailVerified ? "Verified" : "Verification required";
            verifiedClass = acct.emailVerified ? "is-verified" : "is-unverified";
        }
        return {
            statusLabel: statusLabel,
            signedIn: acct.signedIn === true,
            configured: acct.configured === true,
            email: acct.email || null,
            verifiedLabel: verifiedLabel,
            verifiedClass: verifiedClass,
            recoveryMode: acct.recoveryMode === true,
            exportEnabled: data.exportAvailable === true,
            importEnabled: data.importAvailable === true,
            ownershipVerified: data.ownershipVerified === true
        };
    }

    function passkeyRowLabel(summary) {
        var pk = (summary && summary.security && summary.security.passkeys) || {};
        if (!pk.releaseEnabled) { return "Activation pending"; }
        if (typeof pk.registeredCount === "number") {
            return pk.registeredCount === 1 ? "1 passkey" : pk.registeredCount + " passkeys";
        }
        return "Available";
    }

    function previewRows(preview) {
        var p = preview || {};
        var rows = [
            { label: "Months", value: numOr0(p.months) },
            { label: "Entries in months", value: numOr0(p.monthEntries) },
            { label: "Scheduled bills", value: numOr0(p.bills) },
            { label: "Recurring income / expenses", value: numOr0(p.recurringItems) },
            { label: "Savings goals", value: numOr0(p.savingsGoals) },
            { label: "Categories", value: numOr0(p.categories) }
        ];
        if (p.hasMCashData) { rows.push({ label: "M-Cash data", value: "included" }); }
        if (p.createdAt) { rows.push({ label: "Backup date", value: shortDate(p.createdAt) }); }
        if (p.appVersion) { rows.push({ label: "Made with", value: String(p.appVersion) }); }
        return rows;
    }

    function eraseArmed(typed, phrase) {
        var want = String(phrase || ERASE_PHRASE).trim().toUpperCase();
        return String(typed || "").trim().toUpperCase() === want;
    }

    function numOr0(v) { return (typeof v === "number" && isFinite(v)) ? v : 0; }

    function shortDate(iso) {
        try {
            var dt = new Date(iso);
            if (isNaN(dt.getTime())) { return String(iso); }
            return dt.getFullYear() + "-" +
                String(dt.getMonth() + 1).padStart(2, "0") + "-" +
                String(dt.getDate()).padStart(2, "0");
        } catch (e) { return String(iso); }
    }

    function exportFilename(preview) { /* kept for parity/testing */
        return "m-wallet-export.json";
    }


    /* =====================================================
       DEPENDENCIES (overridable for tests)
       ===================================================== */

    var doc = null;
    var deps = {
        account: null,
        auth: null,
        confirm: null,
        download: null,
        readFile: null
    };

    function account() { return deps.account || global.MWalletAccount || null; }
    function auth() { return deps.auth || global.MWalletAuth || null; }

    function askConfirm(message) {
        if (typeof deps.confirm === "function") { return deps.confirm(message); }
        try { return global.confirm ? global.confirm(message) : true; }
        catch (e) { return false; }
    }

    /* Blob + object URL + temporary anchor, revoked afterwards. No
       network. Viewers of a published artifact can't download, but this
       is the real app, not an artifact. */
    function triggerDownload(filename, text, mimeType) {
        if (typeof deps.download === "function") {
            return deps.download(filename, text, mimeType);
        }
        try {
            var blob = new global.Blob([text], { type: mimeType || "application/json" });
            var url = global.URL.createObjectURL(blob);
            var a = doc.createElement("a");
            a.href = url;
            a.download = filename;
            a.rel = "noopener";
            (doc.body || doc.documentElement).appendChild(a);
            a.click();
            a.parentNode && a.parentNode.removeChild(a);
            global.setTimeout(function () {
                try { global.URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
            }, 4000);
            return true;
        } catch (e) {
            return false;
        }
    }

    function readFileText(file) {
        if (typeof deps.readFile === "function") { return Promise.resolve(deps.readFile(file)); }
        if (file && typeof file.text === "function") { return file.text(); }
        return new Promise(function (resolve, reject) {
            try {
                var reader = new global.FileReader();
                reader.onload = function () { resolve(String(reader.result || "")); };
                reader.onerror = function () { reject(new Error("read_failed")); };
                reader.readAsText(file);
            } catch (e) { reject(e); }
        });
    }

    function configureForTest(overrides) {
        if (overrides == null) {
            deps = { account: null, auth: null, confirm: null, download: null, readFile: null };
            doc = (typeof document !== "undefined") ? document : null;
            wired = false;
            return;
        }
        if (overrides.doc) { doc = overrides.doc; }
        ["account", "auth", "confirm", "download", "readFile"].forEach(function (k) {
            if (k in overrides) { deps[k] = overrides[k]; }
        });
    }


    /* =====================================================
       DOM UTILITIES
       ===================================================== */

    function $(id) { return doc && typeof doc.getElementById === "function" ? doc.getElementById(id) : null; }

    function setText(id, value) {
        var el = $(id);
        if (el) { el.textContent = (value == null ? "" : String(value)); }
    }

    function show(el) { if (el) { el.hidden = false; } }
    function hide(el) { if (el) { el.hidden = true; } }

    function setMsg(id, message, type) {
        var el = $(id);
        if (!el) { return; }
        el.textContent = message || "";
        if (el.classList) {
            el.classList.remove("is-success", "is-error");
            if (type === "success") { el.classList.add("is-success"); }
            else if (type === "error") { el.classList.add("is-error"); }
        }
        el.hidden = !message;
    }

    function clearChildren(el) {
        if (!el) { return; }
        if (typeof el.replaceChildren === "function") { el.replaceChildren(); return; }
        while (el.firstChild) { el.removeChild(el.firstChild); }
        el.textContent = "";
    }


    /* =====================================================
       RENDER
       ===================================================== */

    function currentSummary() {
        var a = account();
        try {
            return (a && typeof a.getSummary === "function") ? a.getSummary() : null;
        } catch (e) { return null; }
    }

    function render() {
        if (!doc || typeof doc.getElementById !== "function") { return; }
        var summary = currentSummary();
        var m = accountRowModel(summary);

        setText("mw-acct-status", m.statusLabel);

        var emailEl = $("mw-acct-email");
        if (emailEl) { emailEl.textContent = m.email || "Not signed in"; }

        var verifiedEl = $("mw-acct-verified");
        if (verifiedEl) {
            verifiedEl.textContent = m.verifiedLabel || "—";
            if (verifiedEl.classList) {
                verifiedEl.classList.remove("is-verified", "is-unverified");
                if (m.verifiedClass) { verifiedEl.classList.add(m.verifiedClass); }
            }
        }

        /* signed-in-only controls */
        toggle("mw-acct-change-email-btn", m.signedIn && !m.recoveryMode);
        toggle("mw-acct-change-password-btn", m.signedIn && !m.recoveryMode);
        toggle("mw-acct-signout-btn", m.signedIn);
        toggle("mw-acct-signout-all-btn", m.signedIn);

        setText("mw-acct-password-status", m.configured ? "Email + password" : "—");
        setText("mw-acct-passkey-status", passkeyRowLabel(summary));

        /* My Data */
        var exportBtn = $("mw-acct-export-btn");
        if (exportBtn) { exportBtn.disabled = !m.exportEnabled; }
        var restoreBtn = $("mw-acct-restore-btn");
        if (restoreBtn) { restoreBtn.disabled = !m.importEnabled; }

        /* the local-storage usage read-out (#settings-storage-info) is
           owned by settings-ui.js renderStorageInfo(); this file does
           not read the financial key. */
        renderDeletionStatus(summary);
    }

    function toggle(id, on) {
        var el = $(id);
        if (!el) { return; }
        el.hidden = !on;
    }

    function renderDeletionStatus(summary) {
        var el = $("mw-acct-deletion-status");
        if (!el) { return; }
        var st = (summary && summary.accountDeletion) || {};
        el.textContent = st.available ? "Available" : "Not available in beta";
    }


    /* =====================================================
       DIALOG PLUMBING
       ===================================================== */

    var openDialogId = null;
    var dialogOpener = null;

    function openDialog(id, focusId) {
        var el = $(id);
        if (!el) { return; }
        dialogOpener = (doc && doc.activeElement) || null;
        openDialogId = id;
        el.hidden = false;
        el.setAttribute && el.setAttribute("aria-hidden", "false");
        var f = focusId && $(focusId);
        if (f && typeof f.focus === "function") { f.focus(); }
    }

    function closeDialog(id) {
        var el = $(id || openDialogId);
        if (el) {
            el.hidden = true;
            el.setAttribute && el.setAttribute("aria-hidden", "true");
        }
        openDialogId = null;
        try { if (dialogOpener && typeof dialogOpener.focus === "function") { dialogOpener.focus(); } }
        catch (e) { /* ignore */ }
        dialogOpener = null;
    }


    /* =====================================================
       ACTIONS
       ===================================================== */

    var pendingRestoreText = null;
    var working = false;

    function onActionClick(event) {
        var t = event && event.target && event.target.closest
            ? event.target.closest("[data-acct-action]")
            : null;
        if (!t) { return; }
        var action = t.getAttribute("data-acct-action");

        switch (action) {
            case "change-email": return openEmailDialog();
            case "email-cancel": return closeDialog(EMAIL_DIALOG);
            case "email-confirm": return submitEmailChange();

            case "change-password": return sendPasswordReset(t);

            case "sign-out": return doSignOut(t, "local");
            case "sign-out-all": return doSignOutAll(t);

            case "export": return doExport(t);

            case "restore": return openRestorePicker();
            case "restore-cancel": return cancelRestore();
            case "restore-confirm": return confirmRestore(t);

            case "erase": return openEraseDialog();
            case "erase-cancel": return closeDialog(ERASE_DIALOG);
            case "erase-export-first": return doExport(t);
            case "erase-confirm": return confirmErase(t);
        }
    }

    function onKeydown(event) {
        if (!openDialogId) { return; }
        var key = event && (event.key || event.code);
        if (key === "Escape" || key === "Esc") {
            if (event.preventDefault) { event.preventDefault(); }
            /* Escape always cancels non-destructively */
            if (openDialogId === RESTORE_DIALOG) { cancelRestore(); }
            else { closeDialog(openDialogId); }
        }
    }

    /* ---- change email ---- */

    function openEmailDialog() {
        var input = $("mw-acct-email-input");
        if (input) { input.value = ""; }
        setMsg("mw-acct-email-msg", "", null);
        openDialog(EMAIL_DIALOG, "mw-acct-email-input");
    }

    function submitEmailChange() {
        if (working) { return; }
        var a = account();
        var input = $("mw-acct-email-input");
        var value = input ? String(input.value || "") : "";
        if (!a || typeof a.changeEmail !== "function") {
            setMsg("mw-acct-email-msg", friendlyError("not_supported"), "error");
            return;
        }
        working = true;
        var btn = $("mw-acct-email-confirm-btn");
        if (btn) { btn.disabled = true; }
        Promise.resolve(a.changeEmail(value)).then(function (res) {
            working = false;
            if (btn) { btn.disabled = false; }
            if (res && res.ok) {
                closeDialog(EMAIL_DIALOG);
                setMsg("mw-acct-msg",
                    res.message || "Check your new email address to finish the change.",
                    "success");
                return;
            }
            setMsg("mw-acct-email-msg", (res && res.message) || friendlyError(res && res.code), "error");
        }).catch(function () {
            working = false;
            if (btn) { btn.disabled = false; }
            setMsg("mw-acct-email-msg", friendlyError("email_update_failed"), "error");
        });
    }

    /* ---- change password (BP3 reset email) ---- */

    function sendPasswordReset(trigger) {
        if (working) { return; }
        var a = account();
        if (!a || typeof a.sendPasswordReset !== "function") { return; }
        working = true;
        if (trigger) { trigger.disabled = true; }
        Promise.resolve(a.sendPasswordReset()).then(function (res) {
            working = false;
            if (trigger) { trigger.disabled = false; }
            if (res && res.ok) {
                setMsg("mw-acct-msg", res.message || "Check your email for a password-reset link.", "success");
            } else {
                setMsg("mw-acct-msg", (res && res.message) || friendlyError(res && res.code), "error");
            }
        }).catch(function () {
            working = false;
            if (trigger) { trigger.disabled = false; }
            setMsg("mw-acct-msg", friendlyError("password_update_failed"), "error");
        });
    }

    /* ---- sign out ---- */

    function doSignOut(trigger, scope) {
        if (working) { return; }
        var a = account();
        if (!a || typeof a.signOut !== "function") { return; }
        working = true;
        if (trigger) { trigger.disabled = true; }
        Promise.resolve(a.signOut({ scope: scope || "local" })).then(function () {
            working = false;
            if (trigger) { trigger.disabled = false; }
            setMsg("mw-acct-msg", "Signed out on this device. Your local wallet is untouched.", "success");
            render();
        }).catch(function () {
            working = false;
            if (trigger) { trigger.disabled = false; }
        });
    }

    function doSignOutAll(trigger) {
        if (!askConfirm(
            "Sign out of M-Wallet on every device? You'll need to sign in again everywhere. " +
            "Your local wallet on this device is not changed."
        )) { return; }
        if (working) { return; }
        var a = account();
        if (!a || typeof a.signOutEverywhere !== "function") { return; }
        working = true;
        if (trigger) { trigger.disabled = true; }
        Promise.resolve(a.signOutEverywhere()).then(function () {
            working = false;
            if (trigger) { trigger.disabled = false; }
            setMsg("mw-acct-msg", "Signed out on all devices.", "success");
            render();
        }).catch(function () {
            working = false;
            if (trigger) { trigger.disabled = false; }
        });
    }

    /* ---- export ---- */

    function doExport(trigger) {
        var a = account();
        if (!a || typeof a.exportWallet !== "function") { return; }
        var res;
        try { res = a.exportWallet(); } catch (e) { res = null; }
        if (!res || !res.ok) {
            setMsg("mw-acct-data-msg", friendlyError(res && res.code), "error");
            return;
        }
        var ok = triggerDownload(res.filename, res.json, res.mimeType || "application/json");
        if (ok === false) {
            setMsg("mw-acct-data-msg", "Could not start the download.", "error");
            return;
        }
        setMsg("mw-acct-data-msg",
            "Backup file created. It is NOT encrypted — store it somewhere private.", "success");
    }

    /* ---- restore ---- */

    function openRestorePicker() {
        var input = $("mw-acct-restore-input");
        if (input && typeof input.click === "function") { input.click(); }
    }

    function onRestoreFilePicked(event) {
        var input = event && event.target;
        var file = input && input.files && input.files[0];
        if (input) { input.value = ""; }
        if (!file) { return; }
        readFileText(file).then(function (text) {
            pendingRestoreText = String(text || "");
            var a = account();
            var res = (a && typeof a.inspectImport === "function")
                ? a.inspectImport(pendingRestoreText)
                : { ok: false, code: "not_supported" };
            if (!res || !res.ok) {
                pendingRestoreText = null;
                setMsg("mw-acct-data-msg", friendlyError(res && res.code), "error");
                return;
            }
            fillRestorePreview(res.preview);
            openDialog(RESTORE_DIALOG, "mw-acct-restore-title");
        }).catch(function () {
            pendingRestoreText = null;
            setMsg("mw-acct-data-msg", "Could not read that file.", "error");
        });
    }

    function fillRestorePreview(preview) {
        var host = $("mw-acct-restore-preview");
        if (!host) { return; }
        clearChildren(host);
        previewRows(preview).forEach(function (row) {
            var line = doc.createElement("div");
            line.className = "mw-acct-preview-row";
            var l = doc.createElement("span");
            l.textContent = row.label;
            var v = doc.createElement("span");
            v.textContent = String(row.value);
            line.appendChild(l);
            line.appendChild(v);
            host.appendChild(line);
        });
        setMsg("mw-acct-restore-msg", "", null);
    }

    function cancelRestore() {
        pendingRestoreText = null;
        closeDialog(RESTORE_DIALOG);
        setMsg("mw-acct-data-msg", "Restore cancelled. Nothing was changed.", null);
    }

    function confirmRestore(trigger) {
        if (working) { return; }
        var a = account();
        var text = pendingRestoreText;
        if (!text || !a || typeof a.restoreWallet !== "function") {
            cancelRestore();
            return;
        }
        working = true;
        if (trigger) { trigger.disabled = true; }
        Promise.resolve(a.restoreWallet(text, { confirmed: true })).then(function (res) {
            working = false;
            if (trigger) { trigger.disabled = false; }
            pendingRestoreText = null;
            closeDialog(RESTORE_DIALOG);
            if (res && res.ok) {
                setMsg("mw-acct-data-msg",
                    "Wallet restored from backup on this device.", "success");
                render();
            } else {
                setMsg("mw-acct-data-msg", (res && res.message) || friendlyError(res && res.code), "error");
            }
        }).catch(function () {
            working = false;
            if (trigger) { trigger.disabled = false; }
            pendingRestoreText = null;
            closeDialog(RESTORE_DIALOG);
            setMsg("mw-acct-data-msg", friendlyError("import_failed"), "error");
        });
    }

    /* ---- erase this device ---- */

    function openEraseDialog() {
        var input = $("mw-acct-erase-input");
        if (input) { input.value = ""; }
        var confirmBtn = $("mw-acct-erase-confirm-btn");
        if (confirmBtn) { confirmBtn.disabled = true; }
        setMsg("mw-acct-erase-msg", "", null);
        openDialog(ERASE_DIALOG, "mw-acct-erase-title");
    }

    function onEraseInput(event) {
        var input = event && event.target;
        if (!input || input.id !== "mw-acct-erase-input") { return; }
        var confirmBtn = $("mw-acct-erase-confirm-btn");
        if (confirmBtn) { confirmBtn.disabled = !eraseArmed(input.value, ERASE_PHRASE); }
    }

    function confirmErase(trigger) {
        if (working) { return; }
        var a = account();
        var input = $("mw-acct-erase-input");
        var typed = input ? input.value : "";
        if (!eraseArmed(typed, ERASE_PHRASE)) {
            setMsg("mw-acct-erase-msg", 'Type ' + ERASE_PHRASE + ' to confirm.', "error");
            return;
        }
        if (!a || typeof a.eraseLocalWallet !== "function") { return; }
        working = true;
        if (trigger) { trigger.disabled = true; }
        Promise.resolve(a.eraseLocalWallet({ phrase: typed })).then(function (res) {
            working = false;
            if (trigger) { trigger.disabled = false; }
            if (res && res.ok) {
                closeDialog(ERASE_DIALOG);
                setMsg("mw-acct-data-msg",
                    "This device's wallet was erased and you were signed out.", "success");
                render();
                return;
            }
            if (res && res.erased === true) {
                /* the wallet IS gone — only sign-out did not finish.
                   Close the dialog, tell the truth, and re-render into a
                   safe post-erase state (the Account section still shows
                   "Sign out"). Never imply the wallet still exists. */
                closeDialog(ERASE_DIALOG);
                setMsg("mw-acct-data-msg", friendlyError(res.code), "error");
                render();
                return;
            }
            setMsg("mw-acct-erase-msg", (res && res.message) || friendlyError(res && res.code), "error");
        }).catch(function () {
            working = false;
            if (trigger) { trigger.disabled = false; }
            setMsg("mw-acct-erase-msg", friendlyError("erase_failed"), "error");
        });
    }


    /* =====================================================
       WIRING
       ===================================================== */

    var wired = false;

    function init(injectedDoc) {
        doc = injectedDoc || doc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        var settingsPage = $("settings-page");
        if (!settingsPage && !$(EMAIL_DIALOG)) { return false; }

        if (!wired) {
            wired = true;
            if (settingsPage) { settingsPage.addEventListener("click", onActionClick); }

            [EMAIL_DIALOG, RESTORE_DIALOG, ERASE_DIALOG].forEach(function (id) {
                var el = $(id);
                if (el) { el.addEventListener("click", onActionClick); }
            });

            var restoreInput = $("mw-acct-restore-input");
            if (restoreInput) { restoreInput.addEventListener("change", onRestoreFilePicked); }

            var eraseInput = $("mw-acct-erase-input");
            if (eraseInput) { eraseInput.addEventListener("input", onEraseInput); }

            if (typeof doc.addEventListener === "function") {
                doc.addEventListener("keydown", onKeydown);
            }

            try {
                var a = auth();
                if (a && typeof a.subscribe === "function") {
                    a.subscribe(function () { render(); });
                }
            } catch (e) { /* ignore */ }

            try {
                if (typeof doc.addEventListener === "function") {
                    doc.addEventListener("mwallet:page-changed", function (ev) {
                        if (ev && ev.detail && ev.detail.page === "settings") { render(); }
                    });
                }
            } catch (e) { /* ignore */ }
        }

        render();
        return true;
    }


    global.MWalletAccountUI = {
        init: init,
        render: render,
        configureForTest: configureForTest,

        /* pure helpers (unit-tested) */
        friendlyError: friendlyError,
        accountRowModel: accountRowModel,
        passkeyRowLabel: passkeyRowLabel,
        previewRows: previewRows,
        eraseArmed: eraseArmed,
        exportFilename: exportFilename,

        /* dialog ids */
        EMAIL_DIALOG: EMAIL_DIALOG,
        RESTORE_DIALOG: RESTORE_DIALOG,
        ERASE_DIALOG: ERASE_DIALOG
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
