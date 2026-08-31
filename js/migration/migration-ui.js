"use strict";

/* =========================================================
   M-WALLET — LOCAL MIGRATION UI   (BP4)

       window.MWalletMigrationUI

   The user-facing screens for local data ownership, layered
   on the BP3 auth gateway. It:

     - shows #mw-migration-gate over the (already inert) app
       whenever a signed-in user's local ownership is not yet
       resolved
     - CHECKING  — brief branded loading
     - EXISTING DATA FOUND (needs_claim) — "Keep & Protect My
       Data" / "Sign Out"
     - OWNER MISMATCH — a different-account warning / "Sign Out"
       (NO owner id, NO email, NO financial content shown)
     - ERROR — "We couldn't verify the local data owner" /
       "Retry" / "Sign Out"

   The financial app root's inert/hidden state is NOT managed
   here — js/auth/auth-ui.js owns it, driven by the guard the
   migration service registers. This module only toggles
   #mw-migration-gate and wires its buttons.

   Markup: index.html (#mw-migration-gate). Styling:
   css/migration.css (+ shared .mw-auth-* / .z-* primitives).
   ========================================================= */

(function (global) {

    var GATE_ID = "mw-migration-gate";
    var SCREENS = ["checking", "needs_claim", "owner_mismatch", "error"];

    var GENERIC_CLAIM_ERROR = "We couldn't protect your data right now. Please try again.";


    /* =====================================================
       PURE LOGIC  (unit-tested, no DOM)
       ===================================================== */

    /* From the auth + migration snapshots, decide whether the
       migration gate is up and which screen it shows. */
    function decideScreen(authSnap, migrationSnap) {
        authSnap = authSnap || {};
        migrationSnap = migrationSnap || {};

        if (!authSnap.configured) { return { gate: false, screen: null, reason: "unconfigured" }; }
        if (authSnap.recoveryMode === true) { return { gate: false, screen: null, reason: "recovery" }; }
        if (authSnap.status !== "signed_in") { return { gate: false, screen: null, reason: "not-signed-in" }; }

        switch (migrationSnap.status) {
            case "owned":
            case "fresh_claimed":
                return { gate: false, screen: null, reason: migrationSnap.status };
            case "needs_claim":
                return { gate: true, screen: "needs_claim", reason: "needs_claim" };
            case "owner_mismatch":
                return { gate: true, screen: "owner_mismatch", reason: "owner_mismatch" };
            case "error":
                return { gate: true, screen: "error", reason: "error" };
            case "checking":
            case "unconfigured":
            default:
                return { gate: true, screen: "checking", reason: "checking" };
        }
    }

    function mapClaimError(code) {
        return ({
            owner_mismatch: "This data belongs to a different account. Sign in with that account.",
            owner_metadata_malformed: "We couldn't verify the local data owner on this device.",
            financial_data_unreadable: "We couldn't read the M-Wallet data stored on this device.",
            no_user_id: "We couldn't verify your account. Try signing in again.",
            not_signed_in: "Please sign in and try again.",
            not_configured: "Accounts aren't set up on this build."
        })[code] || GENERIC_CLAIM_ERROR;
    }


    /* =====================================================
       DOM LAYER
       ===================================================== */

    var doc = null;
    var gateEl = null;
    var wired = false;
    var currentScreen = null;
    var busy = false;

    function q(sel) { return gateEl.querySelector(sel); }
    function qa(sel) { return Array.prototype.slice.call(gateEl.querySelectorAll(sel)); }

    function auth() { return global.MWalletAuth || null; }
    function migration() { return global.MWalletLocalMigration || null; }

    function authState() {
        var a = auth();
        return (a && typeof a.getState === "function") ? a.getState() : null;
    }
    function migrationState() {
        var m = migration();
        return (m && typeof m.getState === "function") ? m.getState() : null;
    }

    function setGateVisible(visible) {
        if (!gateEl) { return; }
        gateEl.hidden = !visible;
        gateEl.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function showScreen(name) {
        if (SCREENS.indexOf(name) === -1) { name = "checking"; }
        currentScreen = name;
        SCREENS.forEach(function (screen) {
            var el = q('[data-migration-screen="' + screen + '"]');
            if (el) { el.hidden = (screen !== name); }
        });
        var host = q('[data-migration-screen="' + name + '"]');
        if (host) {
            var focusTarget = host.querySelector("h1, [data-migration-autofocus], button");
            if (focusTarget) { try { focusTarget.focus(); } catch (e) { /* ignore */ } }
        }
    }

    function setMessage(text, tone) {
        /* message region belongs to the visible screen */
        var host = currentScreen
            ? q('[data-migration-screen="' + currentScreen + '"]')
            : gateEl;
        var el = host ? host.querySelector("[data-migration-msg]") : null;
        if (!el) { return; }
        el.textContent = text || "";
        el.classList.remove("is-error", "is-success");
        if (tone === "error") { el.classList.add("is-error"); }
        else if (tone === "success") { el.classList.add("is-success"); }
        el.hidden = !text;
    }

    function clearAllMessages() {
        qa("[data-migration-msg]").forEach(function (el) {
            el.textContent = "";
            el.hidden = true;
            el.classList.remove("is-error", "is-success");
        });
    }

    function setBusy(value) {
        busy = Boolean(value);
        qa("button").forEach(function (btn) { btn.disabled = busy; });
        if (gateEl) { gateEl.classList.toggle("is-busy", busy); }
    }

    /* tell auth-ui whether this module is presenting an ownership
       screen, then let it re-run its fail-closed gate decision */
    function syncAuthUi(active) {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.setOwnershipScreenActive === "function") {
                global.MWalletAuthUI.setOwnershipScreenActive(active);
            }
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.renderState === "function") {
                global.MWalletAuthUI.renderState();
            }
        } catch (e) { /* never throw into the app for a gate sync */ }
    }

    function render() {
        if (!gateEl) { return; }
        var decision = decideScreen(authState(), migrationState());

        if (!decision.gate) {
            setGateVisible(false);
            setMessage("");
            syncAuthUi(false);
            return;
        }

        setGateVisible(true);
        if (currentScreen !== decision.screen) {
            clearAllMessages();
            showScreen(decision.screen);
        }

        if (decision.screen === "error") {
            var m = migrationState();
            setMessage((m && m.error && m.error.message) || "We couldn't verify the local data owner on this device.", "error");
        }

        syncAuthUi(true);
    }


    /* ---- actions ---------------------------------------- */

    function onClaim() {
        var m = migration();
        if (!m || typeof m.claimExistingData !== "function" || busy) { return; }
        setBusy(true);
        setMessage("");

        m.claimExistingData().then(function (result) {
            setBusy(false);
            if (result && result.ok) {
                /* migration state is now owned -> the guard opens the
                   app and render() hides this gate */
                render();
                return;
            }
            setMessage(mapClaimError(result && result.code), "error");
        }).catch(function () {
            setBusy(false);
            setMessage(GENERIC_CLAIM_ERROR, "error");
        });
    }

    function onRetry() {
        var m = migration();
        if (!m || typeof m.ensureOwnership !== "function" || busy) { return; }
        setBusy(true);
        setMessage("");

        Promise.resolve(m.ensureOwnership()).then(function () {
            setBusy(false);
            render();
        }).catch(function () {
            setBusy(false);
            render();
        });
    }

    function onSignOut() {
        var a = auth();
        if (!a || typeof a.signOut !== "function" || busy) { return; }
        setBusy(true);
        a.signOut().then(function () { setBusy(false); }).catch(function () { setBusy(false); });
        /* the SIGNED_OUT auth event re-resolves migration -> render() */
    }

    function onClick(event) {
        var trigger = event.target && event.target.closest
            ? event.target.closest("[data-migration-action]")
            : null;
        if (!trigger) { return; }
        var action = trigger.getAttribute("data-migration-action");
        if (action === "claim") { onClaim(); }
        else if (action === "retry") { onRetry(); }
        else if (action === "sign-out") { onSignOut(); }
    }

    function init(injectedDoc) {
        doc = injectedDoc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        gateEl = doc.getElementById(GATE_ID);
        if (!gateEl) { return false; }

        if (!wired) {
            wired = true;
            gateEl.addEventListener("click", onClick);

            var m = migration();
            if (m && typeof m.subscribe === "function") {
                m.subscribe(function () { render(); });
            }
            /* also follow auth directly so recovery / sign-out flips
               are reflected even if migration state is unchanged */
            var a = auth();
            if (a && typeof a.subscribe === "function") {
                a.subscribe(function () { render(); });
            }
        }

        render();
        return true;
    }


    global.MWalletMigrationUI = {
        SCREENS: SCREENS,

        /* pure */
        decideScreen: decideScreen,
        mapClaimError: mapClaimError,

        /* dom */
        init: init,
        render: render,
        showScreen: showScreen
    };


    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
