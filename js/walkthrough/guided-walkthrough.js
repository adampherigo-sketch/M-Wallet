"use strict";

/* =========================================================
   M-WALLET — GUIDED APP WALKTHROUGH   (BP6)

       window.MWalletWalkthrough

   An OPTIONAL, replayable coach-mark tour that teaches a
   genuinely new owner what the major areas of M-Wallet do —
   AFTER BP4 has verified local ownership and BP5's first-run
   wizard has been completed.

   BP6 is an EDUCATION experience only:
     - BP4 is THE security gate (fail-closed) — never weakened
     - BP5 is the setup experience gate
     - BP6 is optional and FAILS OPEN: a broken tutorial must
       never lock a positively-verified, setup-complete owner
       out of the app

   Who auto-sees it (all required):
     - auth configured + signed in + not password recovery
     - BP4 status is "owned" / "fresh_claimed"
     - BP5 status is exactly "complete" (the fresh-user wizard
       path — NOT "existing" / legacy)
     - no walkthrough completed / skipped record for this owner

   Existing / legacy users are NEVER force-toured — they get
   the Settings replay option instead.

   Storage keys (metadata only, local only, never uploaded):
     mwallet.walkthrough.v1           completed / skipped record
     mwallet.walkthrough.progress.v1  first-time resume progress

   Identity is the Supabase user id, never the email. BP6 stores
   NO password / token / session / key / balance / transaction /
   bill / savings / M-Cash / financial total, makes ZERO network
   or cloud calls, and never writes localStorage["mWalletData"].
   ========================================================= */

(function (global) {

    var RECORD_KEY = "mwallet.walkthrough.v1";
    var PROGRESS_KEY = "mwallet.walkthrough.progress.v1";
    var RECORD_SCHEMA = 1;
    var PROGRESS_SCHEMA = 1;
    var CONTENT_VERSION = 1;

    /* stable step ids — order defines the tour. The UI owns the
       copy + targets; here we only need the page each step visits. */
    var STEP_IDS = ["welcome", "home", "budget", "transactions", "savings", "m-cash", "reports", "settings"];
    var STEP_PAGES = {
        "welcome": null,          /* no navigation — stays where the user is */
        "home": "home",
        "budget": "budget",
        "transactions": "transactions",
        "savings": "savings",
        "m-cash": "m-cash",
        "reports": "reports",
        "settings": "settings"
    };
    var TOTAL_STEPS = STEP_IDS.length;

    var STATE = {
        INACTIVE: "inactive",     /* not the auto-tour path (unconfigured / signed out / not owner / recovery / existing user / already done) */
        CHECKING: "checking",     /* still deciding */
        ACTIVE: "active",         /* the tour is on screen */
        COMPLETED: "completed",   /* finished (this session or a prior one) */
        SKIPPED: "skipped",       /* skipped (and never later completed) */
        ERROR: "error"            /* something went wrong — FAILS OPEN, app stays usable */
    };

    var current = {
        status: STATE.CHECKING,
        stepId: STEP_IDS[0],
        stepIndex: 0,
        totalSteps: TOTAL_STEPS,
        mode: null,               /* "auto" | "manual" | null */
        contentVersion: CONTENT_VERSION,
        hasRecord: false,
        error: null               /* { code, message } — safe strings only */
    };

    var subscribers = [];
    var initPromise = null;


    /* =====================================================
       STORAGE HELPERS  (metadata keys only — NEVER mWalletData)
       ===================================================== */

    function storage() {
        try { return global.localStorage || null; } catch (e) { return null; }
    }

    function readJson(key) {
        var store = storage();
        if (!store) { return { available: false, present: false, valid: false, value: null }; }
        var raw;
        try { raw = store.getItem(key); }
        catch (e) { return { available: false, present: false, valid: false, value: null, errored: true }; }
        if (raw == null) { return { available: true, present: false, valid: false, value: null }; }
        var parsed;
        try { parsed = JSON.parse(raw); }
        catch (e) { return { available: true, present: true, valid: false, value: null }; }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { available: true, present: true, valid: false, value: null };
        }
        return { available: true, present: true, valid: true, value: parsed };
    }

    function writeJson(key, value) {
        var store = storage();
        if (!store) { return false; }
        try { store.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { return false; }
    }

    function removeKey(key) {
        var store = storage();
        if (!store) { return; }
        try { store.removeItem(key); } catch (e) { /* ignore */ }
    }

    function nowIso() {
        try { return new Date().toISOString(); }
        catch (e) { return "1970-01-01T00:00:00.000Z"; }
    }


    /* =====================================================
       AUTH + BP4 + BP5
       ===================================================== */

    function authSnapshot() {
        try {
            var auth = global.MWalletAuth;
            return (auth && typeof auth.getState === "function") ? auth.getState() : null;
        } catch (e) { return null; }
    }

    function currentUserId(snap) {
        snap = snap || authSnapshot();
        if (!snap) { return null; }
        if (snap.user && typeof snap.user.id === "string" && snap.user.id.length > 0) { return snap.user.id; }
        if (snap.session && typeof snap.session.userId === "string" && snap.session.userId.length > 0) { return snap.session.userId; }
        return null;
    }

    /* BP4 is authoritative. BP6 only proceeds when BP4 has
       POSITIVELY verified this account owns the workspace. */
    function ownershipVerified() {
        try {
            var m = global.MWalletLocalMigration;
            if (!m || typeof m.getStatus !== "function") { return false; }
            var s = m.getStatus();
            return s === "owned" || s === "fresh_claimed";
        } catch (e) { return false; }
    }

    function firstRunStatus() {
        try {
            var f = global.MWalletFirstRun;
            return (f && typeof f.getStatus === "function") ? f.getStatus() : null;
        } catch (e) { return null; }
    }

    function isAuthedOwnerPath(snap) {
        return !!snap && snap.configured === true &&
            snap.status === "signed_in" && snap.recoveryMode !== true &&
            ownershipVerified() && currentUserId(snap) != null;
    }


    /* =====================================================
       RECORD  (completed / skipped)
       ===================================================== */

    function readRecord(userId) {
        var res = readJson(RECORD_KEY);
        if (res.available === false) { return { present: false, valid: false, record: null, unavailable: true }; }
        if (!res.present) { return { present: false, valid: false, record: null }; }
        if (!res.valid) { return { present: true, valid: false, record: null }; }
        var r = res.value;
        var ok =
            r.schemaVersion === RECORD_SCHEMA &&
            typeof r.ownerUserId === "string" && r.ownerUserId.length > 0 &&
            (r.status === "completed" || r.status === "skipped");
        if (!ok) { return { present: true, valid: false, record: null }; }
        return {
            present: true,
            valid: true,
            matchesCurrentUser: userId != null && r.ownerUserId === userId,
            foreign: userId != null && r.ownerUserId !== userId,
            record: r
        };
    }

    function writeRecord(userId, status, priorRecord) {
        var prior = priorRecord && priorRecord.valid ? priorRecord.record : null;
        /* BP6.20 — the persisted status represents the user's STRONGEST
           state: once completed, a later skip does not downgrade it. */
        var effectiveStatus = status;
        if (prior && prior.status === "completed" && status === "skipped") {
            effectiveStatus = "completed";
        }
        var record = {
            schemaVersion: RECORD_SCHEMA,
            ownerUserId: String(userId),
            status: effectiveStatus,
            completedAt: effectiveStatus === "completed"
                ? ((prior && prior.completedAt) || nowIso())
                : ((prior && prior.completedAt) || null),
            skippedAt: effectiveStatus === "skipped"
                ? nowIso()
                : ((prior && prior.skippedAt) || null),
            contentVersion: CONTENT_VERSION
        };
        if (!writeJson(RECORD_KEY, record)) { return { ok: false, code: "record_write_failed", status: effectiveStatus }; }
        var verify = readRecord(userId);
        if (!verify.valid || !verify.matchesCurrentUser) { return { ok: false, code: "record_verify_failed", status: effectiveStatus }; }
        return { ok: true, status: effectiveStatus, record: verify.record };
    }


    /* =====================================================
       PROGRESS  (first-time resume only; owner-bound)
       ===================================================== */

    function readProgress(userId) {
        var res = readJson(PROGRESS_KEY);
        if (!res.present) { return { present: false, valid: false }; }
        if (!res.valid) { return { present: true, valid: false }; }
        var p = res.value;
        var ok =
            p.schemaVersion === PROGRESS_SCHEMA &&
            typeof p.ownerUserId === "string" && p.ownerUserId.length > 0 &&
            typeof p.stepId === "string";
        if (!ok) { return { present: true, valid: false }; }
        if (userId != null && p.ownerUserId !== userId) {
            return { present: true, valid: false, foreign: true };
        }
        var stepId = STEP_IDS.indexOf(p.stepId) !== -1 ? p.stepId : STEP_IDS[0];
        return { present: true, valid: true, matchesCurrentUser: true, stepId: stepId, mode: p.mode === "manual" ? "manual" : "auto" };
    }

    function persistProgress(userId, stepId, startedAt) {
        writeJson(PROGRESS_KEY, {
            schemaVersion: PROGRESS_SCHEMA,
            ownerUserId: String(userId),
            stepId: stepId,
            mode: "auto",
            startedAt: startedAt || nowIso(),
            updatedAt: nowIso()
        });
    }

    function clearProgress() {
        removeKey(PROGRESS_KEY);
    }


    /* =====================================================
       STATE
       ===================================================== */

    function stepIndexOf(stepId) {
        var i = STEP_IDS.indexOf(stepId);
        return i === -1 ? 0 : i;
    }

    function snapshot() {
        return {
            status: current.status,
            stepId: current.stepId,
            stepIndex: current.stepIndex,
            totalSteps: TOTAL_STEPS,
            mode: current.mode,
            contentVersion: current.contentVersion,
            isFirst: current.stepIndex <= 0,
            isLast: current.stepIndex >= TOTAL_STEPS - 1,
            hasRecord: current.hasRecord,
            error: current.error ? { code: current.error.code, message: current.error.message } : null
        };
    }

    function notify() {
        var snap = snapshot();
        subscribers.slice().forEach(function (fn) {
            try { fn(snap); } catch (e) { /* isolate */ }
        });
    }

    function setState(next) {
        var changed = false;
        Object.keys(next).forEach(function (k) {
            var before = current[k], after = next[k];
            var equal = before === after || (k === "error" && JSON.stringify(before) === JSON.stringify(after));
            if (!equal) { current[k] = after; changed = true; }
        });
        if (changed) { notify(); }
    }

    function refreshGate() {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.renderState === "function") {
                global.MWalletAuthUI.renderState();
            }
        } catch (e) { /* never throw for a gate refresh */ }
    }

    /* Navigate to the page a step lives on, via the app's canonical
       navigation API. NEVER submits a form, clicks a financial
       action, or changes the month. Failure here degrades the
       experience — it never breaks the tour. */
    function navigateForStep(stepId) {
        var page = STEP_PAGES[stepId];
        if (!page) { return; }
        try {
            var nav = global.BudgetNavigation || global.MWalletNavigation;
            if (nav && typeof nav.showPage === "function") {
                var currentPage = typeof nav.getCurrentPage === "function" ? nav.getCurrentPage() : null;
                if (currentPage !== page) { nav.showPage(page); }
            }
        } catch (e) { /* experience degradation only */ }
    }


    /* =====================================================
       CORE RESOLUTION  (auto-start decision; no financial write)
       ===================================================== */

    function resolve(snap) {
        snap = snap || authSnapshot();

        /* A manual replay in progress is the user's own choice —
           don't let a background re-resolve close it. */
        if (current.status === STATE.ACTIVE && current.mode === "manual") {
            refreshGate();
            return snapshot();
        }

        /* not the authed-owner path — BP2/BP3/BP4 own these states.
           A first-time progress record is KEPT (owner-bound) so the
           same owner can resume when they return. */
        if (!isAuthedOwnerPath(snap)) {
            setState({ status: STATE.INACTIVE, mode: null, error: null });
            refreshGate();
            return snapshot();
        }

        var userId = currentUserId(snap);
        var record = readRecord(userId);

        /* can't read our own metadata -> FAIL OPEN: no tour, straight
           to the app (the verified owner is never blocked) */
        if (record.unavailable) {
            setState({ status: STATE.INACTIVE, mode: null, error: null });
            refreshGate();
            return snapshot();
        }

        /* a valid record for THIS user -> terminal (never auto-start) */
        if (record.valid && record.matchesCurrentUser) {
            setState({
                status: record.record.status === "skipped" ? STATE.SKIPPED : STATE.COMPLETED,
                hasRecord: true,
                mode: null,
                error: null
            });
            clearProgress();
            refreshGate();
            return snapshot();
        }
        setState({ hasRecord: record.present });

        /* BP5 must be COMPLETE via the wizard. "existing" (legacy),
           "required", "inactive", "error" -> BP6 never auto-starts. */
        if (firstRunStatus() !== "complete") {
            setState({ status: STATE.INACTIVE, mode: null, error: null });
            refreshGate();
            return snapshot();
        }

        /* fresh wizard-completed owner, no record -> auto-start
           (resuming a first-time progress record if one is ours) */
        var progress = readProgress(userId);
        var startStep = (progress.valid && progress.matchesCurrentUser) ? progress.stepId : STEP_IDS[0];
        startAuto(userId, startStep);
        return snapshot();
    }

    function startAuto(userId, stepId) {
        var idx = stepIndexOf(stepId);
        persistProgress(userId, STEP_IDS[idx], nowIso());
        navigateForStep(STEP_IDS[idx]);
        setState({
            status: STATE.ACTIVE,
            mode: "auto",
            stepId: STEP_IDS[idx],
            stepIndex: idx,
            error: null
        });
        refreshGate();
    }


    /* =====================================================
       PUBLIC ACTIONS
       ===================================================== */

    function getState() { return snapshot(); }
    function getStatus() { return current.status; }

    /* Manual replay from Settings. Works for a verified owner whose
       setup is done (complete OR existing) regardless of any prior
       completed / skipped record. Does NOT persist progress, does
       NOT re-run BP5, does NOT touch BP4 or financial data. */
    function startManual() {
        var snap = authSnapshot();
        if (!isAuthedOwnerPath(snap)) { return { ok: false, code: "not_owner" }; }
        var setup = firstRunStatus();
        if (setup !== "complete" && setup !== "existing") { return { ok: false, code: "setup_incomplete" }; }
        navigateForStep(STEP_IDS[0]);
        setState({
            status: STATE.ACTIVE,
            mode: "manual",
            stepId: STEP_IDS[0],
            stepIndex: 0,
            error: null
        });
        refreshGate();
        return { ok: true };
    }

    /* auto-start entry point (used by the UI if it prefers to drive
       the first-time start explicitly; resolve() already auto-starts) */
    function start() {
        if (current.status === STATE.ACTIVE) { return { ok: true, alreadyActive: true }; }
        return Promise.resolve(resolve(authSnapshot())).then(function () {
            return { ok: current.status === STATE.ACTIVE, status: current.status };
        });
    }

    function goToStep(stepId) {
        if (current.status !== STATE.ACTIVE) { return { ok: false, code: "not_active" }; }
        var idx = STEP_IDS.indexOf(stepId);
        if (idx === -1) { idx = 0; }   /* unknown -> Welcome */
        if (current.mode === "auto") {
            var uid = currentUserId();
            if (uid) { persistProgress(uid, STEP_IDS[idx], null); }
        }
        navigateForStep(STEP_IDS[idx]);
        setState({ stepId: STEP_IDS[idx], stepIndex: idx, error: null });
        return { ok: true, stepId: STEP_IDS[idx], stepIndex: idx };
    }

    function next() {
        if (current.status !== STATE.ACTIVE) { return { ok: false, code: "not_active" }; }
        if (current.stepIndex >= TOTAL_STEPS - 1) { return complete(); }
        return goToStep(STEP_IDS[current.stepIndex + 1]);
    }

    function back() {
        if (current.status !== STATE.ACTIVE) { return { ok: false, code: "not_active" }; }
        if (current.stepIndex <= 0) { return { ok: false, code: "at_first" }; }
        return goToStep(STEP_IDS[current.stepIndex - 1]);
    }

    function skip() {
        var snap = authSnapshot();
        var userId = currentUserId(snap);
        var wasManual = current.mode === "manual";
        var prior = userId ? readRecord(userId) : { valid: false };

        /* Manual replay: a skip is just "close" — a prior completed /
           skipped status stays authoritative, and nothing is written
           for a "not viewed" user (they stay not-viewed). */
        if (wasManual) {
            var manualStatus = (prior.valid && prior.matchesCurrentUser && prior.record.status === "completed")
                ? STATE.COMPLETED
                : (prior.valid && prior.matchesCurrentUser ? STATE.SKIPPED : STATE.INACTIVE);
            setState({ status: manualStatus, mode: null, error: null });
            refreshGate();
            return { ok: true, closed: true, persisted: false };
        }

        /* First-time / auto tour: record the skip. */
        var wrote = userId ? writeRecord(userId, "skipped", prior) : { ok: false, code: "no_user_id", status: "skipped" };
        clearProgress();
        setState({
            status: wrote.status === "completed" ? STATE.COMPLETED : STATE.SKIPPED,
            hasRecord: wrote.ok,
            mode: null,
            error: wrote.ok ? null : { code: wrote.code, message: "We couldn't save that you skipped the tour — it may appear again next time. Your data is unchanged." }
        });
        refreshGate();
        return { ok: wrote.ok, status: wrote.status, persisted: wrote.ok };
    }

    function complete() {
        var snap = authSnapshot();
        var userId = currentUserId(snap);
        var wasAuto = current.mode === "auto";
        var prior = userId ? readRecord(userId) : { valid: false };

        if (prior.valid && prior.matchesCurrentUser && prior.record.status === "completed") {
            clearProgress();
            setState({ status: STATE.COMPLETED, hasRecord: true, mode: null, error: null });
            refreshGate();
            if (wasAuto) { navigateForStep("home"); }
            return { ok: true, alreadyComplete: true };
        }

        var wrote = userId ? writeRecord(userId, "completed", prior) : { ok: false, code: "no_user_id", status: "completed" };
        clearProgress();
        setState({
            status: STATE.COMPLETED,
            hasRecord: wrote.ok,
            mode: null,
            error: wrote.ok ? null : { code: wrote.code, message: "We couldn't record that you finished the tour — it may appear again next time. Your data is unchanged." }
        });
        refreshGate();
        if (wasAuto) { navigateForStep("home"); }
        return { ok: wrote.ok, persisted: wrote.ok };
    }

    /* Called by the UI when a render / positioning error occurs.
       BP6 FAILS OPEN — drop to a harmless terminal state so the
       verified owner keeps their app. */
    function bailOut(code) {
        clearProgress();
        setState({
            status: STATE.ERROR,
            mode: null,
            error: { code: String(code || "ui_error"), message: "The guided tour couldn't be shown. You can start it again from Settings." }
        });
        refreshGate();
        return { ok: true };
    }

    function retry() {
        return Promise.resolve(resolve(authSnapshot()));
    }


    /* =====================================================
       SUBSCRIBE / DIAGNOSTICS
       ===================================================== */

    function subscribe(listener) {
        if (typeof listener !== "function") { return function () {}; }
        subscribers.push(listener);
        try { listener(snapshot()); } catch (e) { /* ignore */ }
        return function unsubscribe() {
            var i = subscribers.indexOf(listener);
            if (i !== -1) { subscribers.splice(i, 1); }
        };
    }

    /* Non-sensitive only. No ownerUserId, no financial data, no
       tokens, no progress that identifies a user. */
    function diagnostics() {
        var record = readJson(RECORD_KEY);
        var progress = readJson(PROGRESS_KEY);
        return {
            status: current.status,
            stepId: current.stepId,
            stepIndex: current.stepIndex,
            totalSteps: TOTAL_STEPS,
            mode: current.mode,
            contentVersion: CONTENT_VERSION,
            recordKey: RECORD_KEY,
            progressKey: PROGRESS_KEY,
            hasRecord: record.present,
            recordValid: record.present ? record.valid : null,
            recordStatus: (record.valid && record.value) ? record.value.status : null,
            hasProgress: progress.present,
            ownershipVerified: ownershipVerified(),
            setupStatus: firstRunStatus(),
            subscriberCount: subscribers.length
        };
    }


    /* =====================================================
       BOOT + auth-ui GUARD  (fail-open experience gate)
       ===================================================== */

    function initialize() {
        if (initPromise) { return initPromise; }
        var auth = global.MWalletAuth;
        if (auth && typeof auth.subscribe === "function") {
            auth.subscribe(function (snap) { resolve(snap); });
        } else {
            resolve(authSnapshot());
        }
        /* re-resolve when BP5 finishes (fresh owner completes the
           wizard -> status "complete") or BP4 ownership settles */
        try {
            var f = global.MWalletFirstRun;
            if (f && typeof f.subscribe === "function") {
                f.subscribe(function () { resolve(authSnapshot()); });
            }
        } catch (e) { /* optional */ }
        try {
            var m = global.MWalletLocalMigration;
            if (m && typeof m.subscribe === "function") {
                m.subscribe(function () { resolve(authSnapshot()); });
            }
        } catch (e) { /* optional */ }
        initPromise = Promise.resolve(snapshot());
        return initPromise;
    }

    /* auth-ui consults this AFTER BP4 ownership + BP5 setup have both
       released. FAIL-OPEN: hold the app only while the tour is
       genuinely ACTIVE. Everything else -> release. */
    function walkthroughGuard(authSnap) {
        if (!authSnap || authSnap.configured !== true || authSnap.status !== "signed_in") {
            return { release: true };
        }
        return { release: current.status !== STATE.ACTIVE };
    }

    var api = {
        STATES: STATE,
        STEP_IDS: STEP_IDS.slice(),
        RECORD_KEY: RECORD_KEY,
        PROGRESS_KEY: PROGRESS_KEY,
        CONTENT_VERSION: CONTENT_VERSION,

        initialize: initialize,
        getState: getState,
        getStatus: getStatus,
        subscribe: subscribe,

        start: start,
        startManual: startManual,
        next: next,
        back: back,
        goToStep: goToStep,
        skip: skip,
        complete: complete,
        retry: retry,
        bailOut: bailOut,

        diagnostics: diagnostics,

        /* internal, for the UI + tests */
        _resolve: resolve,
        _walkthroughGuard: walkthroughGuard,
        _stepPages: STEP_PAGES
    };

    global.MWalletWalkthrough = api;

    (function registerGuard() {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.setWalkthroughGuard === "function") {
                global.MWalletAuthUI.setWalkthroughGuard(walkthroughGuard);
            }
        } catch (e) { /* auth-ui absent -> BP6 optional, app not blocked */ }
    })();

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initialize);
        } else {
            initialize();
        }
    }

})(typeof window !== "undefined" ? window : this);
