"use strict";

/* =========================================================
   M-WALLET — WELCOME, BETA TESTER   (BP13)

       window.MWalletBetaWelcome

   A one-time "Welcome, beta tester" screen shown right after a
   tester signs in, before the first-run wizard / guided tour /
   app. It explains what the beta is, how to report problems,
   what not to share, which build they are on, what's new, and
   what is coming next. The tester must tick "I understand this
   is pre-release software" before Get Started is enabled.

   Who sees it (all required):
     - auth configured + signed in + not password recovery
     - BP4 ownership positively verified (owned / fresh_claimed)
     - no acknowledgement recorded for this account on this device
     - today (device local time) is before RETIRE_ON
       (1 January 2027) — from then on it never appears again and
       the Beta Hub replay row is hidden too

   It is an EXPERIENCE gate, so it FAILS OPEN: if this module is
   missing or throws, sign-in / setup / the app keep working.
   Storage unavailable -> the screen still shows and an
   acknowledgement is remembered for the rest of the session.

   Storage (metadata only, local only, never uploaded):
     mwallet.betaWelcome.v1
       { schemaVersion: 1,
         acknowledged: { <supabase user id>: { at, appVersion } } }

   No network, no cloud call, never touches mWalletData. All
   dynamic text is rendered with textContent.
   ========================================================= */

(function (global) {

    var GATE_ID = "mw-beta-welcome";
    var RECORD_KEY = "mwallet.betaWelcome.v1";
    var RECORD_SCHEMA = 1;
    var CHANGED_EVENT = "mwallet:beta-welcome-changed";

    /* The screen retires at local midnight starting 1 January 2027.
       (month is 0-based: 0 = January) */
    var RETIRE_ON = { year: 2027, month: 0, day: 1 };

    /* -------------------------------------------------------
       UPCOMING FEATURES
       Features that are built but switched off in this build are
       added automatically from the live beta limitations, so the
       list never promises something that is already on. Add any
       other roadmap items here (plain text, no dates promised).
       ------------------------------------------------------- */
    var UPCOMING_CURATED = [];

    var UPCOMING_FROM_LIMITATION = {
        "sync": "Cloud backup and sync of your wallet across your devices.",
        "passkeys": "Passkey sign-in — use Face ID, Touch ID or your device PIN instead of a password.",
        "account-deletion": "Self-service account deletion from Settings.",
        "feedback-delivery": "Sending beta reports straight from the app, without copying or downloading them."
    };

    var overrides = { now: null };      /* test-only */
    var sessionAcks = {};                /* fallback when storage is unavailable */
    var doc = null;
    var gateEl = null;
    var wired = false;
    var mode = null;                     /* "auto" | "manual" | null */
    var lastFocus = null;


    /* =====================================================
       PURE HELPERS
       ===================================================== */

    function now() {
        if (overrides.now != null) { return new Date(overrides.now); }
        return new Date();
    }

    function retireDate() {
        return new Date(RETIRE_ON.year, RETIRE_ON.month, RETIRE_ON.day, 0, 0, 0, 0);
    }

    function isRetired(at) {
        var d = at ? new Date(at) : now();
        var t = d.getTime();
        if (!isFinite(t)) { return false; }
        return t >= retireDate().getTime();
    }

    function userIdOf(snap) {
        if (!snap) { return null; }
        if (snap.user && typeof snap.user.id === "string" && snap.user.id) { return snap.user.id; }
        if (snap.session && typeof snap.session.userId === "string" && snap.session.userId) { return snap.session.userId; }
        return null;
    }

    /* decide({ auth, ownershipVerified, acknowledged, now }) -> { show, reason } */
    function decide(input) {
        input = input || {};
        var snap = input.auth;
        if (isRetired(input.now)) { return { show: false, reason: "retired" }; }
        if (!snap || snap.configured !== true) { return { show: false, reason: "unconfigured" }; }
        if (snap.status !== "signed_in") { return { show: false, reason: "signed_out" }; }
        if (snap.recoveryMode === true) { return { show: false, reason: "recovery" }; }
        if (!userIdOf(snap)) { return { show: false, reason: "no_user" }; }
        if (input.ownershipVerified !== true) { return { show: false, reason: "ownership_pending" }; }
        if (input.acknowledged === true) { return { show: false, reason: "acknowledged" }; }
        return { show: true, reason: "welcome" };
    }

    /* upcoming(limitations) -> [string] */
    function upcoming(limitations) {
        var out = [];
        (Array.isArray(limitations) ? limitations : []).forEach(function (l) {
            var text = l && UPCOMING_FROM_LIMITATION[l.id];
            if (text && out.indexOf(text) === -1) { out.push(text); }
        });
        UPCOMING_CURATED.forEach(function (text) {
            if (typeof text === "string" && text.trim() && out.indexOf(text.trim()) === -1) { out.push(text.trim()); }
        });
        return out;
    }


    /* =====================================================
       STORAGE  (metadata key only — NEVER mWalletData)
       ===================================================== */

    function storage() {
        try { return global.localStorage || null; } catch (e) { return null; }
    }

    function readRecord() {
        var store = storage();
        if (!store) { return null; }
        try {
            var raw = store.getItem(RECORD_KEY);
            if (raw == null) { return null; }
            var r = JSON.parse(raw);
            if (!r || typeof r !== "object" || Array.isArray(r)) { return null; }
            if (r.schemaVersion !== RECORD_SCHEMA) { return null; }
            if (!r.acknowledged || typeof r.acknowledged !== "object" || Array.isArray(r.acknowledged)) { return null; }
            return r;
        } catch (e) { return null; }
    }

    function isAcknowledged(userId) {
        if (!userId) { return false; }
        if (sessionAcks[userId] === true) { return true; }
        var r = readRecord();
        var entry = r && Object.prototype.hasOwnProperty.call(r.acknowledged, userId) ? r.acknowledged[userId] : null;
        return !!(entry && typeof entry === "object" && typeof entry.at === "string");
    }

    function appVersion() {
        try { return (global.MWalletVersion && global.MWalletVersion.version) || null; }
        catch (e) { return null; }
    }

    function recordAcknowledgement(userId) {
        if (!userId) { return false; }
        sessionAcks[userId] = true;
        var store = storage();
        if (!store) { return false; }
        var r = readRecord() || { schemaVersion: RECORD_SCHEMA, acknowledged: {} };
        var at;
        try { at = now().toISOString(); } catch (e) { at = "1970-01-01T00:00:00.000Z"; }
        r.acknowledged[userId] = { at: at, appVersion: appVersion() };
        try { store.setItem(RECORD_KEY, JSON.stringify(r)); return true; }
        catch (e) { return false; }
    }


    /* =====================================================
       LIVE STATE
       ===================================================== */

    function authSnapshot() {
        try {
            var a = global.MWalletAuth;
            return (a && typeof a.getState === "function") ? a.getState() : null;
        } catch (e) { return null; }
    }

    function ownershipVerified() {
        try {
            var m = global.MWalletLocalMigration;
            if (!m || typeof m.getStatus !== "function") { return false; }
            var s = m.getStatus();
            return s === "owned" || s === "fresh_claimed";
        } catch (e) { return false; }
    }

    function currentDecision() {
        var snap = authSnapshot();
        return decide({
            auth: snap,
            ownershipVerified: ownershipVerified(),
            acknowledged: isAcknowledged(userIdOf(snap))
        });
    }

    function isPresenting() {
        return !!(gateEl && gateEl.hidden === false);
    }

    /* auth-ui guard: hold the app ONLY while the screen is really up */
    function guard() {
        return { release: !(isPresenting() && mode === "auto") };
    }


    /* =====================================================
       DOM
       ===================================================== */

    function q(sel) { return gateEl ? gateEl.querySelector(sel) : null; }

    function setText(sel, text) {
        var el = q(sel);
        if (el) { el.textContent = text == null ? "" : String(text); }
    }

    function fillList(sel, items, emptyText) {
        var el = q(sel);
        if (!el || !doc) { return; }
        while (el.firstChild) { el.removeChild(el.firstChild); }
        var list = (items && items.length) ? items : [emptyText];
        list.forEach(function (text) {
            var li = doc.createElement("li");
            li.textContent = String(text);
            el.appendChild(li);
        });
    }

    function fillContent() {
        var ops = global.MWalletBetaOps || null;
        var cfg = null;
        try { cfg = global.MWalletBetaConfig ? global.MWalletBetaConfig.get() : null; } catch (e) { cfg = null; }

        setText("[data-bw-version]", appVersion() || "Beta build");

        var notes = null;
        try { notes = ops && typeof ops.releaseNotes === "function" ? ops.releaseNotes() : null; } catch (e) { notes = null; }
        fillList("[data-bw-whats-new]",
            notes && notes.matchesBuild ? notes.highlights : [],
            "See Settings › Beta Hub › What's new for this build's changes.");

        var limits = [];
        try { limits = ops && typeof ops.currentLimitations === "function" ? ops.currentLimitations() : []; } catch (e) { limits = []; }
        fillList("[data-bw-upcoming]", upcoming(limits),
            "Nothing new announced yet — we'll list upcoming features here as they're planned.");

        var supportEl = q("[data-bw-support]");
        var supportWrap = q("[data-bw-support-wrap]");
        var email = cfg && cfg.supportConfigured ? cfg.supportEmail : null;
        if (supportEl) {
            supportEl.textContent = email || "";
            if (email) { supportEl.setAttribute("href", "mailto:" + email); }
        }
        if (supportWrap) { supportWrap.hidden = !email; }
    }

    function syncAuthUi() {
        try {
            var ui = global.MWalletAuthUI;
            if (ui && typeof ui.setBetaWelcomeScreenActive === "function") {
                ui.setBetaWelcomeScreenActive(isPresenting() && mode === "auto");
            }
            if (ui && typeof ui.renderState === "function") { ui.renderState(); }
        } catch (e) { /* never throw for a gate sync */ }
    }

    function announce() {
        try {
            if (doc && typeof doc.dispatchEvent === "function" && typeof global.CustomEvent === "function") {
                doc.dispatchEvent(new global.CustomEvent(CHANGED_EVENT, { detail: { presenting: isPresenting() } }));
            }
        } catch (e) { /* ignore */ }
    }

    function updateButton() {
        var box = q("[data-bw-ack]");
        var btn = q('[data-bw-action="start"]');
        var ackWrap = q("[data-bw-ack-wrap]");
        var manual = mode === "manual";
        if (ackWrap) { ackWrap.hidden = manual; }
        if (btn) {
            btn.textContent = manual ? "Close" : "Get Started";
            btn.disabled = manual ? false : !(box && box.checked === true);
        }
    }

    function setVisible(visible) {
        if (!gateEl) { return; }
        var was = gateEl.hidden === false;
        gateEl.hidden = !visible;
        gateEl.setAttribute("aria-hidden", visible ? "false" : "true");
        if (doc && doc.body && doc.body.classList) {
            doc.body.classList.toggle("mw-bw-open", visible);
        }
        if (visible && !was) {
            lastFocus = (doc && doc.activeElement) || null;
            var scroller = q(".mw-auth-card");
            if (scroller) { scroller.scrollTop = 0; }
            var heading = q("#mw-beta-welcome-heading");
            if (heading && typeof heading.focus === "function") {
                try { heading.focus(); } catch (e) { /* ignore */ }
            }
        } else if (!visible && was && mode === "manual" && lastFocus && typeof lastFocus.focus === "function") {
            try { lastFocus.focus(); } catch (e) { /* ignore */ }
        }
        if (visible !== was) { announce(); }
    }

    function updateReplayRow() {
        if (!doc || typeof doc.getElementById !== "function") { return; }
        var row = doc.getElementById("mw-beta-welcome-replay-btn");
        if (row) { row.hidden = isRetired(); }
    }

    function render() {
        if (!gateEl) { return; }
        try {
            updateReplayRow();
            if (mode === "manual") {
                if (isRetired()) { close(); }
                return;
            }
            var d = currentDecision();
            if (d.show) {
                if (!isPresenting()) {
                    mode = "auto";
                    var box = q("[data-bw-ack]");
                    if (box) { box.checked = false; }
                    fillContent();
                }
                mode = "auto";
                updateButton();
                setVisible(true);
            } else {
                if (mode === "auto") { mode = null; }
                setVisible(false);
            }
        } catch (e) {
            mode = null;
            try { setVisible(false); } catch (e2) { /* ignore */ }
        }
        syncAuthUi();
    }

    /* reopen from Settings -> Beta Hub (informational, no checkbox) */
    function open() {
        if (!gateEl || isRetired()) { return false; }
        mode = "manual";
        fillContent();
        updateButton();
        setVisible(true);
        syncAuthUi();
        return true;
    }

    function close() {
        mode = null;
        setVisible(false);
        syncAuthUi();
    }

    function acknowledge() {
        if (mode === "manual") { close(); return true; }
        var box = q("[data-bw-ack]");
        if (!box || box.checked !== true) { updateButton(); return false; }
        recordAcknowledgement(userIdOf(authSnapshot()));
        mode = null;
        setVisible(false);
        syncAuthUi();
        return true;
    }

    function focusables() {
        if (!gateEl) { return []; }
        return Array.prototype.slice.call(
            gateEl.querySelectorAll("button, [href], input, [tabindex]")
        ).filter(function (el) {
            return !el.disabled && !el.hidden && el.getAttribute("tabindex") !== "-1";
        });
    }

    function onClick(event) {
        var t = event.target && event.target.closest ? event.target.closest("[data-bw-action]") : null;
        if (!t) { return; }
        var action = t.getAttribute("data-bw-action");
        if (action === "open") { event.preventDefault(); open(); }
        else if (action === "start") { event.preventDefault(); acknowledge(); }
    }

    function onChange(event) {
        if (event.target && event.target.matches && event.target.matches("[data-bw-ack]")) { updateButton(); }
    }

    function onKeydown(event) {
        if (!isPresenting()) { return; }
        if (event.key === "Escape" && mode === "manual") { event.preventDefault(); close(); return; }
        if (event.key !== "Tab") { return; }
        var items = focusables();
        if (!items.length) { return; }
        var first = items[0];
        var last = items[items.length - 1];
        var active = doc.activeElement;
        var inside = typeof gateEl.contains === "function" ? gateEl.contains(active) : true;
        if (event.shiftKey && (active === first || !inside)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (active === last || !inside)) { event.preventDefault(); first.focus(); }
    }

    function init(injectedDoc) {
        doc = injectedDoc || (typeof document !== "undefined" ? document : null);
        if (!doc || typeof doc.getElementById !== "function") { return false; }
        gateEl = doc.getElementById(GATE_ID);
        if (!gateEl) { return false; }

        try {
            var ui = global.MWalletAuthUI;
            if (ui && typeof ui.setBetaWelcomeGuard === "function") { ui.setBetaWelcomeGuard(guard); }
        } catch (e) { /* fail open */ }

        if (!wired) {
            wired = true;
            doc.addEventListener("click", onClick);
            gateEl.addEventListener("change", onChange);
            doc.addEventListener("keydown", onKeydown, true);
            try {
                var a = global.MWalletAuth;
                if (a && typeof a.subscribe === "function") { a.subscribe(function () { render(); }); }
                var m = global.MWalletLocalMigration;
                if (m && typeof m.subscribe === "function") { m.subscribe(function () { render(); }); }
            } catch (e) { /* fail open */ }
        }
        render();
        return true;
    }

    function configureForTest(next) {
        overrides = { now: next && next.now != null ? next.now : null };
        if (next && next.resetSession) { sessionAcks = {}; }
    }


    global.MWalletBetaWelcome = {
        RECORD_KEY: RECORD_KEY,
        CHANGED_EVENT: CHANGED_EVENT,

        /* pure */
        decide: decide,
        isRetired: isRetired,
        retireDate: retireDate,
        upcoming: upcoming,

        /* state */
        isAcknowledged: isAcknowledged,
        isPresenting: isPresenting,
        guard: guard,

        /* dom */
        init: init,
        render: render,
        open: open,
        close: close,
        acknowledge: acknowledge,

        configureForTest: configureForTest
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
