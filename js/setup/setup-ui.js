"use strict";

/* =========================================================
   M-WALLET - FIRST-RUN SETUP UI   (BP5)

       window.MWalletSetupUI

   The wizard screens for js/setup/first-run-setup.js. It:
     - shows #mw-setup-gate over the (BP4-verified) financial app
       ONLY while MWalletFirstRun status is "required" / "saving"
       / "checking" / "error"
     - drives the 4 steps: Welcome / Your accounts / Preferences
       / Review, plus a Save error screen
     - writes account names + balances only to the setup DRAFT as
       the user types (never mWalletData)
     - renders every user-entered value with textContent (XSS-safe)

   The financial app root's inert/hidden state is owned by
   js/auth/auth-ui.js. This module tells it, via
   setSetupScreenActive(bool) + renderState(), when the wizard
   is up. BP4 remains the security gate; BP5 is fail-open, so if
   this module fails to load the verified owner still reaches
   their app.
   ========================================================= */

(function (global) {

    var GATE_ID = "mw-setup-gate";
    var STEP_KEYS = ["1", "2", "3", "4", "error"];

    /* Truthful for EVERY error path: BP5 never corrupts data, a failed
       save leaves the prior value, and a partial apply leaves valid
       intermediate values. Never claims "nothing was saved". */
    var GENERIC_SAVE_ERROR = "Your M-Wallet data is safe. Retry to continue setup from where it stopped.";


    /* =====================================================
       PURE LOGIC  (unit-tested, no DOM)
       ===================================================== */

    /* From the first-run + auth snapshots decide whether the
       wizard gate is up and which step section it shows. */
    function decideScreen(setupSnap, authSnap) {
        setupSnap = setupSnap || {};
        authSnap = authSnap || {};

        /* not the authed-owner path -> auth/BP4 own the screen */
        if (authSnap.configured !== true || authSnap.status !== "signed_in" || authSnap.recoveryMode === true) {
            return { gate: false, step: null, reason: "not-owner-path" };
        }

        switch (setupSnap.status) {
            case "required":
                return { gate: true, step: String(clampStep(setupSnap.step)), reason: "required" };
            case "saving":
                return { gate: true, step: "4", busy: true, reason: "saving" };
            case "checking":
                return { gate: true, step: "1", reason: "checking" };
            case "error":
                return { gate: true, step: "error", reason: "error" };
            case "complete":
            case "existing":
            case "inactive":
            default:
                return { gate: false, step: null, reason: setupSnap.status || "inactive" };
        }
    }

    function clampStep(step) {
        var n = Number(step);
        if (!Number.isInteger(n) || n < 1 || n > 4) { return 1; }
        return n;
    }

    /* progress descriptor for a given active step (1..4) */
    function progressModel(step) {
        step = clampStep(step);
        var cells = [];
        for (var i = 1; i <= 4; i++) {
            cells.push(i < step ? "done" : (i === step ? "current" : "todo"));
        }
        return { step: step, total: 4, cells: cells, label: "Step " + step + " of 4" };
    }


    /* =====================================================
       DOM LAYER
       ===================================================== */

    var doc = null;
    var gateEl = null;
    var wired = false;
    var currentStep = null;
    var busy = false;

    function firstRun() { return global.MWalletFirstRun || null; }
    function auth() { return global.MWalletAuth || null; }

    function firstRunState() {
        var f = firstRun();
        return (f && typeof f.getState === "function") ? f.getState() : null;
    }
    function authState() {
        var a = auth();
        return (a && typeof a.getState === "function") ? a.getState() : null;
    }

    function q(sel) { return gateEl ? gateEl.querySelector(sel) : null; }
    function qa(sel) { return gateEl ? Array.prototype.slice.call(gateEl.querySelectorAll(sel)) : []; }

    function stepEl(key) { return q('[data-setup-step="' + key + '"]'); }

    function setGateVisible(visible) {
        if (!gateEl) { return; }
        gateEl.hidden = !visible;
        gateEl.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    /* tell auth-ui the wizard is (not) presenting, then let it
       re-run its fail-closed/fail-open gate decision */
    function syncAuthUi(active) {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.setSetupScreenActive === "function") {
                global.MWalletAuthUI.setSetupScreenActive(active);
            }
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.renderState === "function") {
                global.MWalletAuthUI.renderState();
            }
        } catch (e) { /* never throw for a gate sync */ }
    }

    function setMessage(text, tone) {
        var host = currentStep ? stepEl(currentStep) : gateEl;
        var el = host ? host.querySelector("[data-setup-msg]") : null;
        if (!el) { return; }
        el.textContent = text || "";
        el.classList.remove("is-error", "is-success");
        if (tone === "error") { el.classList.add("is-error"); }
        else if (tone === "success") { el.classList.add("is-success"); }
        el.hidden = !text;
    }

    function clearMessages() {
        qa("[data-setup-msg]").forEach(function (el) {
            el.textContent = "";
            el.hidden = true;
            el.classList.remove("is-error", "is-success");
        });
    }

    function markInvalid(field) {
        qa("[data-setup-field]").forEach(function (el) { el.removeAttribute("aria-invalid"); });
        if (!field) { return; }
        var el = q('[data-setup-field="' + field + '"]');
        if (el) {
            el.setAttribute("aria-invalid", "true");
            try { el.focus(); } catch (e) { /* ignore */ }
        }
    }

    function setBusy(value) {
        busy = Boolean(value);
        qa("button").forEach(function (b) { b.disabled = busy; });
        if (gateEl) { gateEl.classList.toggle("is-busy", busy); }
    }

    function renderProgress(step) {
        var model = progressModel(step);
        qa("[data-setup-progress] li").forEach(function (li, index) {
            li.setAttribute("data-state", model.cells[index] || "todo");
        });
        qa("[data-setup-step-count]").forEach(function (el) { el.textContent = model.label; });
        var host = q("[data-setup-progress]");
        if (host) { host.setAttribute("aria-label", model.label); }
    }

    function showStep(key) {
        if (STEP_KEYS.indexOf(String(key)) === -1) { key = "1"; }
        key = String(key);
        currentStep = key;
        STEP_KEYS.forEach(function (k) {
            var el = stepEl(k);
            if (el) { el.hidden = (k !== key); }
        });
        if (key !== "error") {
            renderProgress(clampStep(key));
        }
        var host = stepEl(key);
        if (host) {
            var focusTarget = host.querySelector("h1, [data-setup-autofocus], input, button");
            if (focusTarget) { try { focusTarget.focus(); } catch (e) { /* ignore */ } }
        }
    }

    /* fill the form inputs / review from the draft (owner-bound,
       returned by value). Every value goes in via .value or
       textContent - never innerHTML. */
    function hydrateFromDraft() {
        var f = firstRun();
        if (!f || typeof f.getDraftValues !== "function") { return; }
        var v = f.getDraftValues();
        if (!v) { return; }

        var setVal = function (field, val) {
            var el = q('[data-setup-field="' + field + '"]');
            if (el && doc.activeElement !== el) { el.value = val; }
        };
        setVal("checkingName", v.checkingName);
        setVal("savingsName", v.savingsName);
        setVal("checkingBalance", centsToInput(v.checkingBalanceCents));
        setVal("savingsBalance", centsToInput(v.savingsBalanceCents));

        qa('[data-setup-field="firstDayOfWeek"]').forEach(function (radio) {
            radio.checked = (radio.value === v.firstDayOfWeek);
        });

        /* review */
        var display = function (cents) {
            return (f && typeof f.centsToDisplay === "function")
                ? f.centsToDisplay(cents)
                : "$" + (Math.round(Number(cents) || 0) / 100).toFixed(2);
        };
        var review = {
            "review-checking-name": v.checkingName,
            "review-checking-balance": display(v.checkingBalanceCents),
            "review-savings-name": v.savingsName,
            "review-savings-balance": display(v.savingsBalanceCents),
            "review-first-day": v.firstDayOfWeek === "monday" ? "Monday" : "Sunday"
        };
        Object.keys(review).forEach(function (id) {
            var el = q('[data-setup-review="' + id + '"]');
            if (el) { el.textContent = review[id]; }  /* XSS-safe */
        });
    }

    function centsToInput(cents) {
        var n = Math.round(Number(cents) || 0);
        return (n / 100).toFixed(2);
    }


    function render() {
        if (!gateEl) { return; }
        var decision = decideScreen(firstRunState(), authState());

        if (!decision.gate) {
            setGateVisible(false);
            syncAuthUi(false);
            return;
        }

        setGateVisible(true);
        if (currentStep !== decision.step) {
            clearMessages();
            showStep(decision.step);
        } else if (decision.step !== "error") {
            renderProgress(clampStep(decision.step));
        }

        hydrateFromDraft();

        if (decision.step === "error") {
            var s = firstRunState();
            setMessage((s && s.error && s.error.message) || GENERIC_SAVE_ERROR, "error");
        }
        if (decision.busy) { setBusy(true); }

        syncAuthUi(true);
    }


    /* ---- input -> draft --------------------------------- */

    function readMoneyField(field) {
        var f = firstRun();
        var el = q('[data-setup-field="' + field + '"]');
        var raw = el ? el.value : "";
        if (!f || typeof f.parseMoneyToCents !== "function") { return { ok: false }; }
        return f.parseMoneyToCents(raw, { allowEmpty: true });
    }

    function commitField(field) {
        var f = firstRun();
        if (!f || typeof f.updateDraft !== "function") { return; }
        var el = q('[data-setup-field="' + field + '"]');
        if (!el) { return; }

        if (field === "checkingName" || field === "savingsName") {
            f.updateDraft(pick(field, el.value));
            return;
        }
        if (field === "checkingBalance" || field === "savingsBalance") {
            var parsed = readMoneyField(field);
            if (parsed && parsed.ok) {
                var key = field === "checkingBalance" ? "checkingBalanceCents" : "savingsBalanceCents";
                var patch = {};
                patch[key] = parsed.cents;
                f.updateDraft(patch);
                markInvalid(null);
            } else if (parsed && parsed.message) {
                markInvalid(field);
                setMessage(parsed.message, "error");
            }
            return;
        }
        if (field === "firstDayOfWeek") {
            var checked = q('[data-setup-field="firstDayOfWeek"]:checked');
            if (checked) { f.updateDraft({ firstDayOfWeek: checked.value }); }
        }
    }

    function pick(field, value) {
        var patch = {};
        patch[field === "checkingName" ? "checkingName" : "savingsName"] = value;
        return patch;
    }

    function commitAllFields() {
        ["checkingName", "checkingBalance", "savingsName", "savingsBalance", "firstDayOfWeek"].forEach(commitField);
    }


    /* ---- actions -------------------------------------- */

    function onStart() {
        var f = firstRun();
        if (!f || busy) { return; }
        setMessage("");
        if (typeof f.goToStep === "function") { f.goToStep(2); }
    }

    function onContinue() {
        var f = firstRun();
        if (!f || busy) { return; }
        commitAllFields();
        var res = (typeof f.nextStep === "function") ? f.nextStep() : { ok: false };
        if (res && res.ok) {
            setMessage("");
            markInvalid(null);
            return;
        }
        if (res && res.message) {
            setMessage(res.message, "error");
            markInvalid(res.field || null);
        }
    }

    function onBack() {
        var f = firstRun();
        if (!f || busy) { return; }
        commitAllFields();
        setMessage("");
        markInvalid(null);
        if (typeof f.previousStep === "function") { f.previousStep(); }
    }

    function onFinish() {
        var f = firstRun();
        if (!f || typeof f.finish !== "function" || busy) { return; }
        commitAllFields();
        setBusy(true);
        setMessage("Saving your setup...", "");

        f.finish().then(function (res) {
            setBusy(false);
            if (res && res.ok) {
                /* first-run status -> complete/existing; the guard
                   releases and render() hides this gate */
                render();
                return;
            }
            setMessage((res && res.message) || GENERIC_SAVE_ERROR, "error");
        }).catch(function () {
            setBusy(false);
            setMessage(GENERIC_SAVE_ERROR, "error");
        });
    }

    function onRetry() {
        var f = firstRun();
        if (!f || busy) { return; }
        setBusy(true);
        setMessage("Trying again...", "");
        var attempt = (typeof f.retry === "function") ? f.retry() : Promise.resolve();
        Promise.resolve(attempt).then(function (res) {
            setBusy(false);
            if (res && res.ok) { render(); return; }
            setMessage((res && res.message) || GENERIC_SAVE_ERROR, "error");
        }).catch(function () {
            setBusy(false);
            setMessage(GENERIC_SAVE_ERROR, "error");
        });
    }

    function onSignOut() {
        var a = auth();
        if (!a || typeof a.signOut !== "function" || busy) { return; }
        setBusy(true);
        a.signOut().then(function () { setBusy(false); }).catch(function () { setBusy(false); });
    }

    function onClick(event) {
        var trigger = event.target && event.target.closest
            ? event.target.closest("[data-setup-action]")
            : null;
        if (!trigger) { return; }
        /* A submit button inside a step form (Continue / Finish) also
           fires the form's submit event — onSubmit owns those so the
           step never advances twice on one click. */
        if (trigger.getAttribute("type") === "submit") { return; }
        switch (trigger.getAttribute("data-setup-action")) {
            case "start": onStart(); break;
            case "continue": onContinue(); break;
            case "back": onBack(); break;
            case "finish": onFinish(); break;
            case "retry": onRetry(); break;
            case "sign-out": onSignOut(); break;
            default: break;
        }
    }

    function onSubmit(event) {
        var form = event.target && event.target.closest
            ? event.target.closest("form[data-setup-form]")
            : null;
        if (!form) { return; }
        event.preventDefault();
        /* Enter on a step form == the step's primary action */
        var step = form.getAttribute("data-setup-form");
        if (step === "2" || step === "3") { onContinue(); }
        else if (step === "4") { onFinish(); }
    }

    function onInput(event) {
        var el = event.target && event.target.closest
            ? event.target.closest("[data-setup-field]")
            : null;
        if (!el) { return; }
        commitField(el.getAttribute("data-setup-field"));
    }


    function init(injectedDoc) {
        doc = injectedDoc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        gateEl = doc.getElementById(GATE_ID);
        if (!gateEl) { return false; }

        if (!wired) {
            wired = true;
            gateEl.addEventListener("click", onClick);
            gateEl.addEventListener("submit", onSubmit);
            gateEl.addEventListener("change", onInput);
            gateEl.addEventListener("blur", onInput, true);

            var f = firstRun();
            if (f && typeof f.subscribe === "function") {
                f.subscribe(function () { render(); });
            }
            var a = auth();
            if (a && typeof a.subscribe === "function") {
                a.subscribe(function () { render(); });
            }
        }

        render();
        return true;
    }


    global.MWalletSetupUI = {
        STEP_KEYS: STEP_KEYS,

        /* pure */
        decideScreen: decideScreen,
        progressModel: progressModel,

        /* dom */
        init: init,
        render: render,
        showStep: showStep
    };


    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
