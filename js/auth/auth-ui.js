"use strict";

/* =========================================================
   M-WALLET — AUTHENTICATION UI   (BP3)

       window.MWalletAuthUI

   The user-facing account experience layered on top of the
   BP2/BP3 architecture (window.MWalletAuth). Responsibilities:

     - decide, from auth state, whether the account gateway
       covers the app (pure: decideGate)
     - drive the gateway views: welcome / sign in / create
       account / verify email / forgot password / set new
       password / loading / connection error
     - validate form input before calling MWalletAuth
     - render provider errors and success messages via
       textContent into aria-live regions (never innerHTML)

   Boundaries:
     - NEVER shows, stores, or logs a token / session / password
     - NEVER touches financial storage (localStorage["mWalletData"])
     - When auth is UNCONFIGURED the gateway stays hidden and the
       local-first app is used exactly as before — the developer
       is never locked out.

   The markup lives in index.html (#mw-auth-gate); this module
   only toggles and fills it. Styling: css/auth.css.
   ========================================================= */

(function (global) {

    var GATE_ID = "mw-auth-gate";
    var VIEWS = ["loading", "welcome", "signup", "signin", "verify", "forgot", "recovery"];

    var GENERIC_ERROR = "Something went wrong. Please try again.";


    /* =====================================================
       PURE LOGIC  (unit-tested, no DOM)
       ===================================================== */

    /* Given an auth snapshot, decide what the gateway does. */
    function decideGate(state) {
        state = state || {};

        /* not configured -> local-first app, no gateway, ever */
        if (!state.configured) {
            return { visible: false, view: null, reason: "unconfigured" };
        }

        /* a password-recovery callback outranks everything until
           the new password is saved */
        if (state.recoveryMode) {
            return { visible: true, view: "recovery", reason: "recovery" };
        }

        switch (state.status) {
            case "signed_in":
                return { visible: false, view: null, reason: "signed_in" };
            case "initializing":
                return { visible: true, view: "loading", reason: "initializing" };
            case "error":
                return { visible: true, view: "welcome", banner: "error", reason: "error" };
            case "signed_out":
            default:
                return { visible: true, view: "welcome", reason: "signed_out" };
        }
    }

    function internals() {
        return (global.MWalletAuth && global.MWalletAuth._internals) || null;
    }

    function checkEmail(value) {
        var api = internals();
        if (api) { return api.validateEmail(value); }
        var v = String(value == null ? "" : value).trim().toLowerCase();
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
            ? { ok: true, value: v }
            : { ok: false, field: "email", message: "Enter a valid email address." };
    }

    function checkPassword(value) {
        var api = internals();
        if (api) { return api.validatePassword(value); }
        return String(value || "").length >= 8
            ? { ok: true }
            : { ok: false, field: "password", message: "Use at least 8 characters." };
    }

    function validateSignUp(input) {
        input = input || {};
        var e = checkEmail(input.email);
        if (!e.ok) { return e; }
        var p = checkPassword(input.password);
        if (!p.ok) { return p; }
        if (String(input.password) !== String(input.confirm)) {
            return { ok: false, field: "confirm", message: "Those passwords don't match." };
        }
        return { ok: true, email: e.value, password: String(input.password) };
    }

    function validateSignIn(input) {
        input = input || {};
        var e = checkEmail(input.email);
        if (!e.ok) { return e; }
        if (!String(input.password || "")) {
            return { ok: false, field: "password", message: "Enter your password." };
        }
        return { ok: true, email: e.value, password: String(input.password) };
    }

    function validateForgot(input) {
        input = input || {};
        var e = checkEmail(input.email);
        if (!e.ok) { return e; }
        return { ok: true, email: e.value };
    }

    function validateRecovery(input) {
        input = input || {};
        var p = checkPassword(input.password);
        if (!p.ok) { return p; }
        if (String(input.password) !== String(input.confirm)) {
            return { ok: false, field: "confirm", message: "Those passwords don't match." };
        }
        return { ok: true, password: String(input.password) };
    }


    /* =====================================================
       DOM LAYER
       ===================================================== */

    var doc = null;
    var gateEl = null;
    var appEl = null;
    var wired = false;
    var currentView = null;
    var lastSnapshot = null;
    var pendingSignupEmail = "";

    function q(sel, root) {
        return (root || gateEl).querySelector(sel);
    }
    function qa(sel, root) {
        return Array.prototype.slice.call((root || gateEl).querySelectorAll(sel));
    }

    function viewEl(name) {
        return q('[data-auth-view="' + name + '"]');
    }

    function setBusy(formOrView, busy) {
        if (!formOrView) { return; }
        var btn = formOrView.querySelector("[data-auth-submit], [data-auth-action]");
        qa("button", formOrView).forEach(function (b) {
            b.disabled = !!busy;
        });
        if (btn) {
            if (busy && !btn.hasAttribute("data-label")) {
                btn.setAttribute("data-label", btn.textContent);
                btn.textContent = "Working…";
            } else if (!busy && btn.hasAttribute("data-label")) {
                btn.textContent = btn.getAttribute("data-label");
                btn.removeAttribute("data-label");
            }
        }
        formOrView.classList.toggle("is-busy", !!busy);
    }

    /* aria-live message region for a view. `tone` in
       "error" | "success" | "" */
    function setMessage(view, text, tone) {
        var el = q('[data-auth-msg="' + view + '"]');
        if (!el) { return; }
        el.textContent = text || "";
        el.classList.remove("is-error", "is-success");
        if (tone === "error") { el.classList.add("is-error"); }
        else if (tone === "success") { el.classList.add("is-success"); }
        el.hidden = !text;
    }

    function clearMessages() {
        qa("[data-auth-msg]").forEach(function (el) {
            el.textContent = "";
            el.hidden = true;
            el.classList.remove("is-error", "is-success");
        });
    }

    function markInvalid(view, field) {
        var host = viewEl(view);
        if (!host) { return; }
        qa("[name]", host).forEach(function (input) {
            input.removeAttribute("aria-invalid");
        });
        if (field) {
            var el = host.querySelector('[name="' + field + '"]');
            if (el) {
                el.setAttribute("aria-invalid", "true");
                try { el.focus(); } catch (e) { /* ignore */ }
            }
        }
    }

    function showView(name) {
        if (VIEWS.indexOf(name) === -1) { name = "welcome"; }
        currentView = name;
        VIEWS.forEach(function (v) {
            var el = viewEl(v);
            if (el) { el.hidden = (v !== name); }
        });
        /* move focus to the heading of the shown view for AT + keyboard */
        var host = viewEl(name);
        if (host) {
            var focusTarget = host.querySelector("h1, [data-auth-autofocus], input, button");
            if (focusTarget) {
                try { focusTarget.focus(); } catch (e) { /* ignore */ }
            }
        }
    }

    function open(view) {
        if (!gateEl) { return; }
        applyVisible(true);
        clearMessages();
        showView(view || "welcome");
    }

    function applyVisible(visible) {
        if (!gateEl) { return; }
        var changing = gateEl.hidden === visible; /* hidden===visible means state flips */
        if (visible) {
            gateEl.hidden = false;
            gateEl.setAttribute("aria-hidden", "false");
            if (appEl) {
                appEl.setAttribute("aria-hidden", "true");
                try { appEl.inert = true; } catch (e) { /* older browsers */ }
            }
            if (doc.body && doc.body.classList) {
                doc.body.classList.add("mw-auth-locked");
            }
        } else {
            gateEl.hidden = true;
            gateEl.setAttribute("aria-hidden", "true");
            if (appEl) {
                appEl.removeAttribute("aria-hidden");
                try { appEl.inert = false; } catch (e) { /* older browsers */ }
            }
            if (doc.body && doc.body.classList) {
                doc.body.classList.remove("mw-auth-locked");
            }
        }
        return changing;
    }

    /* Render from an auth snapshot. */
    function renderState(snapshot) {
        lastSnapshot = snapshot || (global.MWalletAuth && global.MWalletAuth.getState());
        if (!gateEl || !lastSnapshot) { return; }

        var decision = decideGate(lastSnapshot);

        if (!decision.visible) {
            applyVisible(false);
            return;
        }

        var wasHidden = gateEl.hidden;
        applyVisible(true);

        /* only (re)pick the view on entry or when auth forces it
           (loading -> recovery -> etc); don't yank a user out of a
           form they're filling because a token refreshed */
        var forced = decision.view === "loading" ||
            decision.view === "recovery" ||
            wasHidden ||
            currentView === null ||
            currentView === "loading";

        if (forced) {
            showView(decision.view);
        }

        if (decision.banner === "error") {
            var retry = q('[data-auth-action="retry"]');
            if (retry) { retry.hidden = false; }
            setMessage("welcome",
                "We couldn't reach the sign-in service. Retry, or keep using M-Wallet on this device.",
                "error");
        }
    }


    /* ---- form submission --------------------------------- */

    function fieldValue(form, name) {
        var el = form.querySelector('[name="' + name + '"]');
        return el ? el.value : "";
    }

    function auth() {
        return global.MWalletAuth || null;
    }

    function handleSignUp(form) {
        var check = validateSignUp({
            email: fieldValue(form, "email"),
            password: fieldValue(form, "password"),
            confirm: fieldValue(form, "confirm")
        });
        if (!check.ok) {
            setMessage("signup", check.message, "error");
            markInvalid("signup", check.field);
            return;
        }
        markInvalid("signup", null);
        setMessage("signup", "");
        setBusy(form, true);

        auth().signUp(check.email, check.password).then(function (res) {
            setBusy(form, false);
            if (res && res.ok) {
                pendingSignupEmail = res.email || check.email;
                if (res.needsVerification) {
                    var target = q("[data-auth-email]");
                    if (target) { target.textContent = pendingSignupEmail; }
                    showView("verify");
                } else {
                    /* auto-confirm on: SIGNED_IN event will hide the gate */
                    setMessage("signup", "Account created. Signing you in…", "success");
                }
                return;
            }
            setMessage("signup", (res && res.message) || GENERIC_ERROR, "error");
            markInvalid("signup", res && res.field);
        }).catch(function () {
            setBusy(form, false);
            setMessage("signup", GENERIC_ERROR, "error");
        });
    }

    function handleSignIn(form) {
        var check = validateSignIn({
            email: fieldValue(form, "email"),
            password: fieldValue(form, "password")
        });
        if (!check.ok) {
            setMessage("signin", check.message, "error");
            markInvalid("signin", check.field);
            return;
        }
        markInvalid("signin", null);
        setMessage("signin", "");
        setBusy(form, true);

        auth().signIn(check.email, check.password).then(function (res) {
            setBusy(form, false);
            if (res && res.ok) {
                /* the SIGNED_IN event hides the gate */
                return;
            }
            if (res && res.code === "email_not_confirmed") {
                pendingSignupEmail = res.email || check.email;
                var target = q("[data-auth-email]");
                if (target) { target.textContent = pendingSignupEmail; }
                showView("verify");
                setMessage("verify", "Your email isn't verified yet. Open the link we sent, or resend it below.", "error");
                return;
            }
            setMessage("signin", (res && res.message) || GENERIC_ERROR, "error");
        }).catch(function () {
            setBusy(form, false);
            setMessage("signin", GENERIC_ERROR, "error");
        });
    }

    function handleForgot(form) {
        var check = validateForgot({ email: fieldValue(form, "email") });
        if (!check.ok) {
            setMessage("forgot", check.message, "error");
            markInvalid("forgot", check.field);
            return;
        }
        markInvalid("forgot", null);
        setMessage("forgot", "");
        setBusy(form, true);

        auth().resetPassword(check.email).then(function (res) {
            setBusy(form, false);
            if (res && res.ok) {
                setMessage("forgot", res.message || "Check your email for a reset link.", "success");
                return;
            }
            setMessage("forgot", (res && res.message) || GENERIC_ERROR, "error");
        }).catch(function () {
            setBusy(form, false);
            setMessage("forgot", GENERIC_ERROR, "error");
        });
    }

    function handleRecovery(form) {
        var check = validateRecovery({
            password: fieldValue(form, "password"),
            confirm: fieldValue(form, "confirm")
        });
        if (!check.ok) {
            setMessage("recovery", check.message, "error");
            markInvalid("recovery", check.field);
            return;
        }
        markInvalid("recovery", null);
        setMessage("recovery", "");
        setBusy(form, true);

        auth().updatePassword(check.password).then(function (res) {
            setBusy(form, false);
            if (res && res.ok) {
                setMessage("recovery", res.message || "Password updated.", "success");
                /* recoveryMode cleared in auth.js -> renderState hides the gate
                   (signed_in) or shows sign-in (signed_out) */
                renderState(auth() && auth().getState());
                return;
            }
            setMessage("recovery", (res && res.message) || GENERIC_ERROR, "error");
        }).catch(function () {
            setBusy(form, false);
            setMessage("recovery", GENERIC_ERROR, "error");
        });
    }

    function handleResend() {
        var email = pendingSignupEmail;
        if (!email) {
            setMessage("verify", "Enter your email on the sign-in screen and try again.", "error");
            return;
        }
        var btn = q('[data-auth-action="resend"]');
        if (btn) { btn.disabled = true; }
        setMessage("verify", "");

        auth().resendVerification(email).then(function (res) {
            if (btn) { btn.disabled = false; }
            setMessage("verify",
                (res && res.message) || (res && res.ok ? "Verification email sent." : GENERIC_ERROR),
                res && res.ok ? "success" : "error");
        }).catch(function () {
            if (btn) { btn.disabled = false; }
            setMessage("verify", GENERIC_ERROR, "error");
        });
    }


    /* ---- wiring ------------------------------------------ */

    function onSubmit(event) {
        var form = event.target && event.target.closest ? event.target.closest("[data-auth-form]") : null;
        if (!form) { return; }
        event.preventDefault();
        var kind = form.getAttribute("data-auth-form");
        clearMessages();
        if (kind === "signup") { handleSignUp(form); }
        else if (kind === "signin") { handleSignIn(form); }
        else if (kind === "forgot") { handleForgot(form); }
        else if (kind === "recovery") { handleRecovery(form); }
    }

    function onClick(event) {
        var trigger = event.target && event.target.closest ? event.target.closest("[data-auth-action]") : null;
        if (!trigger) { return; }
        var action = trigger.getAttribute("data-auth-action");

        if (action === "go-signup") { clearMessages(); showView("signup"); return; }
        if (action === "go-signin") { clearMessages(); showView("signin"); return; }
        if (action === "go-forgot") { clearMessages(); showView("forgot"); return; }
        if (action === "go-welcome") { clearMessages(); showView("welcome"); return; }
        if (action === "resend") { handleResend(); return; }
        if (action === "retry") {
            trigger.hidden = true;
            setMessage("welcome", "");
            var a = auth();
            if (a && typeof a.initialize === "function") {
                /* re-run initialize's session read via a fresh attempt */
                if (typeof a._getClient === "function" && a._getClient()) {
                    a._getClient().auth.getSession().then(function () {
                        renderState(a.getState());
                    }).catch(function () {
                        setMessage("welcome", "Still can't reach the sign-in service.", "error");
                        trigger.hidden = false;
                    });
                } else {
                    a.initialize().then(function () { renderState(a.getState()); });
                }
            }
            return;
        }
    }

    function init(injectedDoc) {
        doc = injectedDoc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        gateEl = doc.getElementById(GATE_ID);
        if (!gateEl) { return false; }
        appEl = doc.querySelector ? doc.querySelector(".app") : null;

        if (!wired) {
            wired = true;
            gateEl.addEventListener("submit", onSubmit);
            gateEl.addEventListener("click", onClick);

            var a = global.MWalletAuth;
            if (a && typeof a.subscribe === "function") {
                a.subscribe(function (snap) { renderState(snap); });
            } else if (a && typeof a.getState === "function") {
                renderState(a.getState());
            }
        } else {
            renderState(global.MWalletAuth && global.MWalletAuth.getState());
        }
        return true;
    }


    global.MWalletAuthUI = {
        VIEWS: VIEWS,

        /* pure */
        decideGate: decideGate,
        validateSignUp: validateSignUp,
        validateSignIn: validateSignIn,
        validateForgot: validateForgot,
        validateRecovery: validateRecovery,

        /* dom */
        init: init,
        open: open,
        renderState: renderState,
        showView: showView
    };


    /* self-boot (scripts run at end of <body>, DOM is ready) */
    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
