"use strict";

/* =========================================================
   M-WALLET — FIRST-RUN SETUP   (BP5)

       window.MWalletFirstRun

   The first-run experience for a genuinely new, authenticated
   M-Wallet owner. It runs AFTER BP4 has positively verified
   local ownership (BP4 stays the security gate — this is an
   experience gate only).

   Who sees the wizard (all must be true):
     - auth configured + signed in + not in password recovery
     - BP4 says this account owns the local workspace
       (MWalletLocalMigration status is "owned" or "fresh_claimed")
     - no valid first-run completion record for this user
     - the local workspace has no meaningful established
       financial data (reuses BP4's meaningful-data detector)

   An EXISTING user (meaningful data, or a valid completion
   record) auto-skips — the wizard NEVER asks anyone to re-enter
   balances, and NEVER overwrites established financial values.

   Storage keys (metadata only, local only, never uploaded):
     mwallet.setup.v1        completion record
     mwallet.setup.draft.v1  in-progress wizard draft (owner-bound)

   Financial data stays in localStorage["mWalletData"] and is
   touched ONLY at Finish, and only:
     accounts.checking.name
     accounts.savings.name / .balance          (savings is authoritative here)
     settings.firstDayOfWeek
     the CURRENT calendar month's startingBalance   (the checking
       opening balance the dashboard + Budget page actually display)
       — set via storage.setStartingBalance(currentMonthKey), the
       canonical API, which also re-syncs the accounts.checking.balance
       cache. NEVER an arbitrary Budget-selected month.

   An EXISTING owner auto-skips: any BP4 meaningful signal OR a
   non-zero account balance / month starting balance on its own
   counts as established data — the wizard never runs over it and
   never overwrites it. If BP5's own convenience metadata cannot be
   written, the verified owner still reaches their wallet (fail open;
   BP4 stays the security gate).

   BP5 never creates income, bills, expenses, transactions,
   savings goals/transfers, M-Cash entries, categories, or
   recurrence records, and creates no month ACTIVITY. It makes
   ZERO network / cloud calls.
   ========================================================= */

(function (global) {

    var SETUP_KEY = "mwallet.setup.v1";
    var DRAFT_KEY = "mwallet.setup.draft.v1";
    var SETUP_SCHEMA = 1;
    var DRAFT_SCHEMA = 1;

    var TOTAL_STEPS = 4;
    var FIRST_DAYS = ["sunday", "monday"];

    /* money bounds: -$999,999,999.99 .. $999,999,999.99 in cents */
    var MAX_CENTS = 99999999999;
    var NAME_MAX = 40;

    var STATE = {
        INACTIVE: "inactive",     /* not our path (unconfigured / signed out / not owner / recovery) */
        CHECKING: "checking",     /* determining whether setup is needed */
        REQUIRED: "required",     /* fresh verified owner — wizard shown */
        SAVING: "saving",         /* Finish in progress */
        COMPLETE: "complete",     /* setup done via the wizard */
        EXISTING: "existing",     /* auto-skipped — established / legacy workspace */
        ERROR: "error"            /* could not save during Finish */
    };

    var current = {
        status: STATE.CHECKING,
        step: 1,
        totalSteps: TOTAL_STEPS,
        hasCompletionRecord: false,
        hasDraft: false,
        meaningfulData: null,
        error: null               /* { code, message } — safe strings only */
    };

    var subscribers = [];
    var initPromise = null;


    /* =====================================================
       STORAGE HELPERS  (metadata keys only; never mWalletData
       except the single canonical Finish write)
       ===================================================== */

    function storage() {
        try { return global.localStorage || null; } catch (e) { return null; }
    }

    function readJson(key) {
        var store = storage();
        if (!store) { return { available: false, present: false, valid: false, value: null }; }
        var raw;
        try { raw = store.getItem(key); }
        catch (e) { return { available: true, present: true, valid: false, value: null }; }
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
       AUTH + OWNERSHIP
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

    /* BP4 is authoritative. BP5 only proceeds when BP4 has
       POSITIVELY verified this account owns the workspace. */
    function ownershipVerified() {
        try {
            var m = global.MWalletLocalMigration;
            if (!m || typeof m.getStatus !== "function") { return false; }
            var s = m.getStatus();
            return s === "owned" || s === "fresh_claimed";
        } catch (e) { return false; }
    }

    /* Reuse BP4's read-only meaningful-data detector so BP5 does
       not carry a conflicting second definition. */
    function detectMeaningful() {
        try {
            var m = global.MWalletLocalMigration;
            if (m && typeof m.detectMeaningfulLocalData === "function") {
                return m.detectMeaningfulLocalData();
            }
        } catch (e) { /* fall through */ }
        return { readable: null, present: null, meaningful: null, signals: [], reason: "unavailable" };
    }

    /* Read the raw financial blob WITHOUT calling storage.js (whose
       load() self-saves). Read-only, no side effects. */
    function rawFinancialData() {
        var store = storage();
        if (!store) { return null; }
        var raw;
        try { raw = store.getItem("mWalletData"); } catch (e) { return null; }
        if (raw == null) { return null; }
        try {
            var d = JSON.parse(raw);
            return (d && typeof d === "object" && !Array.isArray(d)) ? d : null;
        } catch (e) { return null; }
    }

    /* A non-zero account balance OR a non-zero month starting balance
       is ESTABLISHED financial state on its own — no income / bills /
       transactions required. BP5 never runs the balance wizard over
       it and never overwrites it. (BP4's detector already flags the
       synced account balances; this also covers a month startingBalance
       whose cache happens to be desynced.) */
    function hasEstablishedBalances(data) {
        if (!data || typeof data !== "object") { return false; }
        var acc = (data.accounts && typeof data.accounts === "object") ? data.accounts : {};
        if (acc.checking && Number(acc.checking.balance) !== 0 && Number.isFinite(Number(acc.checking.balance))) { return true; }
        if (acc.savings && Number(acc.savings.balance) !== 0 && Number.isFinite(Number(acc.savings.balance))) { return true; }
        var months = (data.months && typeof data.months === "object") ? data.months : {};
        return Object.keys(months).some(function (k) {
            var m = months[k];
            var sb = m ? Number(m.startingBalance) : 0;
            return Number.isFinite(sb) && sb !== 0;
        });
    }

    /* Established financial state = BP4 says meaningful, OR there is a
       non-zero balance / starting balance. (data optional — falls back
       to the raw blob.) */
    function establishedFinancialState(detection, data) {
        if (detection && detection.meaningful === true) { return true; }
        return hasEstablishedBalances(data || rawFinancialData());
    }


    /* =====================================================
       MONEY PARSING  (integer cents; no float dust)
       ===================================================== */

    function parseMoneyToCents(raw, options) {
        options = options || {};
        var text = String(raw == null ? "" : raw).trim().replace(/[$,\s]/g, "");
        if (text === "") {
            return options.allowEmpty
                ? { ok: true, cents: 0 }
                : { ok: false, code: "empty", message: "Enter an amount." };
        }
        var match = /^(-?)(\d{0,12})(?:\.(\d{0,2}))?$/.exec(text);
        if (!match || (match[2] === "" && (match[3] === undefined || match[3] === ""))) {
            return { ok: false, code: "format", message: "Enter a valid amount, like 1,250.00." };
        }
        var sign = match[1] === "-" ? -1 : 1;
        var whole = match[2] === "" ? 0 : parseInt(match[2], 10);
        var fracRaw = match[3] === undefined ? "" : match[3];
        var frac = (fracRaw + "00").slice(0, 2);
        var cents = sign * (whole * 100 + parseInt(frac, 10));
        if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_CENTS) {
            return { ok: false, code: "range", message: "That amount is too large." };
        }
        return { ok: true, cents: cents };
    }

    /* integer cents -> a clean 2-decimal dollar number for the
       storage engine (which stores balances as dollar numbers) */
    function centsToDollars(cents) {
        var n = Math.round(Number(cents) || 0);
        return Number((n / 100).toFixed(2));
    }

    function centsToDisplay(cents) {
        var dollars = centsToDollars(cents);
        try {
            return dollars.toLocaleString("en-US", { style: "currency", currency: "USD" });
        } catch (e) {
            return "$" + dollars.toFixed(2);
        }
    }

    function sanitizeName(raw, fallback) {
        var text = String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]/g, "").trim();
        if (text.length > NAME_MAX) { text = text.slice(0, NAME_MAX).trim(); }
        return text || String(fallback || "");
    }


    /* =====================================================
       DRAFT  (owner-bound; local; never logged / sent)
       ===================================================== */

    function defaultDraftValues() {
        return {
            checkingName: "Checking",
            checkingBalanceCents: 0,
            savingsName: "Savings",
            savingsBalanceCents: 0,
            firstDayOfWeek: "sunday"
        };
    }

    function readDraft(userId) {
        var res = readJson(DRAFT_KEY);
        if (!res.present) { return { present: false, valid: false, draft: null }; }
        if (!res.valid) { return { present: true, valid: false, draft: null }; }
        var d = res.value;
        var ok =
            d.schemaVersion === DRAFT_SCHEMA &&
            typeof d.ownerUserId === "string" && d.ownerUserId.length > 0 &&
            d.values && typeof d.values === "object";
        if (!ok) { return { present: true, valid: false, draft: null }; }
        /* a draft that belongs to a different owner is IGNORED
           (never applied, never rendered) */
        if (userId != null && d.ownerUserId !== userId) {
            return { present: true, valid: false, draft: null, foreign: true };
        }
        var v = d.values;
        var values = {
            checkingName: sanitizeName(v.checkingName, "Checking"),
            checkingBalanceCents: clampCents(v.checkingBalanceCents, true),
            savingsName: sanitizeName(v.savingsName, "Savings"),
            savingsBalanceCents: clampCents(v.savingsBalanceCents, false),
            firstDayOfWeek: FIRST_DAYS.indexOf(v.firstDayOfWeek) !== -1 ? v.firstDayOfWeek : "sunday"
        };
        var step = Number(d.step);
        if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) { step = 1; }
        return {
            present: true, valid: true,
            draft: { ownerUserId: d.ownerUserId, step: step, values: values, applyStarted: d.applyStarted === true }
        };
    }

    function clampCents(raw, allowNegative) {
        var n = Math.round(Number(raw));
        if (!Number.isSafeInteger(n)) { n = 0; }
        if (!allowNegative && n < 0) { n = 0; }
        if (n > MAX_CENTS) { n = MAX_CENTS; }
        if (n < -MAX_CENTS) { n = -MAX_CENTS; }
        return n;
    }

    var workingDraft = null; /* { ownerUserId, step, values, applyStarted } for the active session */

    function ensureWorkingDraft(userId) {
        if (workingDraft && workingDraft.ownerUserId === userId) { return workingDraft; }
        var loaded = readDraft(userId);
        workingDraft = {
            ownerUserId: userId,
            step: (loaded.valid && loaded.draft) ? loaded.draft.step : 1,
            values: (loaded.valid && loaded.draft) ? loaded.draft.values : defaultDraftValues(),
            /* true once finish() has begun writing financial fields — so a
               retry after a partial/interrupted apply continues the wizard
               rather than being reclassified as an existing workspace. */
            applyStarted: (loaded.valid && loaded.draft) ? loaded.draft.applyStarted === true : false
        };
        return workingDraft;
    }

    function persistDraft() {
        if (!workingDraft) { return; }
        writeJson(DRAFT_KEY, {
            schemaVersion: DRAFT_SCHEMA,
            ownerUserId: workingDraft.ownerUserId,
            step: workingDraft.step,
            applyStarted: workingDraft.applyStarted === true,
            values: {
                checkingName: workingDraft.values.checkingName,
                checkingBalanceCents: workingDraft.values.checkingBalanceCents,
                savingsName: workingDraft.values.savingsName,
                savingsBalanceCents: workingDraft.values.savingsBalanceCents,
                firstDayOfWeek: workingDraft.values.firstDayOfWeek
            },
            updatedAt: nowIso()
        });
    }

    function clearDraft() {
        workingDraft = null;
        removeKey(DRAFT_KEY);
    }


    /* =====================================================
       COMPLETION RECORD
       ===================================================== */

    function readCompletion(userId) {
        var res = readJson(SETUP_KEY);
        if (!res.present) { return { present: false, valid: false, record: null }; }
        if (!res.valid) { return { present: true, valid: false, record: null }; }
        var r = res.value;
        var ok =
            r.schemaVersion === SETUP_SCHEMA &&
            typeof r.ownerUserId === "string" && r.ownerUserId.length > 0 &&
            r.status === "complete" &&
            typeof r.completedAt === "string" &&
            (r.source === "wizard" || r.source === "existing");
        if (!ok) { return { present: true, valid: false, record: null }; }
        return {
            present: true,
            valid: true,
            matchesCurrentUser: userId != null && r.ownerUserId === userId,
            record: r
        };
    }

    function writeCompletion(userId, source) {
        var record = {
            schemaVersion: SETUP_SCHEMA,
            ownerUserId: String(userId),
            status: "complete",
            completedAt: nowIso(),
            source: source
        };
        if (!writeJson(SETUP_KEY, record)) { return { ok: false, code: "write_failed" }; }
        var verify = readCompletion(userId);
        if (!verify.valid || !verify.matchesCurrentUser) { return { ok: false, code: "verify_failed" }; }
        return { ok: true, record: verify.record };
    }


    /* =====================================================
       STATE
       ===================================================== */

    function snapshot() {
        return {
            status: current.status,
            step: current.step,
            totalSteps: current.totalSteps,
            hasCompletionRecord: current.hasCompletionRecord,
            hasDraft: current.hasDraft,
            meaningfulData: current.meaningfulData,
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


    /* =====================================================
       CORE RESOLUTION  (idempotent; no financial write)
       ===================================================== */

    function resolve(snap) {
        snap = snap || authSnapshot();

        /* not our path — BP2/BP3/BP4 own these states */
        if (!snap || snap.configured !== true ||
            snap.status !== "signed_in" || snap.recoveryMode === true ||
            !ownershipVerified()) {
            setState({ status: STATE.INACTIVE, error: null });
            refreshGate();
            return snapshot();
        }

        var userId = currentUserId(snap);
        if (!userId) {
            /* BP4 would already have blocked this; stay inactive so
               BP4's fail-closed handling remains authoritative */
            setState({ status: STATE.INACTIVE, error: null });
            refreshGate();
            return snapshot();
        }

        /* a Finish in progress — don't re-decide underneath it */
        if (current.status === STATE.SAVING) {
            refreshGate();
            return snapshot();
        }

        var completion = readCompletion(userId);
        var detection = detectMeaningful();
        var established = establishedFinancialState(detection, null);

        setState({
            hasCompletionRecord: completion.present,
            meaningfulData: established
        });

        /* 1. a valid completion record for THIS user -> done */
        if (completion.valid && completion.matchesCurrentUser) {
            setState({ status: completion.record.source === "existing" ? STATE.EXISTING : STATE.COMPLETE, error: null });
            refreshGate();
            return snapshot();
        }

        /* 1b. this owner's own wizard began writing financial fields but
               never recorded completion (a partial / interrupted Finish,
               possibly across a reload). Resume it — do NOT reclassify as
               'existing' just because BP5's own write made the workspace
               look established. */
        var interruptedDraft = readDraft(userId);
        if (interruptedDraft.valid && interruptedDraft.draft && interruptedDraft.draft.applyStarted === true) {
            ensureWorkingDraft(userId);
            setState({
                status: STATE.ERROR,
                error: { code: "resume_finish", message: "Your setup didn't finish saving. Retry to complete it — your M-Wallet data is safe." }
            });
            refreshGate();
            return snapshot();
        }

        /* 2. established financial state (any BP4 meaningful signal OR a
              non-zero balance / starting balance) -> auto-skip, never
              touch it. Covers legacy claims and a balance-only workspace
              (checking or savings set, no other activity). */
        if (established) {
            /* Best-effort convenience metadata. If it fails to write we
               STILL do NOT run the balance wizard and STILL let the
               verified owner reach their established wallet — BP5 is a
               fail-open experience layer; BP4 stays authoritative. */
            var wrote = writeCompletion(userId, "existing");
            setState({
                status: STATE.EXISTING,
                hasCompletionRecord: wrote.ok || completion.present,
                error: null
            });
            clearDraft();
            refreshGate();
            return snapshot();
        }

        /* 3. corrupt / unreadable financial storage -> BP4 owns the
              screen; nothing safe for BP5 to do */
        if (detection.readable === false) {
            setState({ status: STATE.INACTIVE, error: null });
            refreshGate();
            return snapshot();
        }

        /* 4. fresh verified owner, no completion record -> wizard */
        var draft = ensureWorkingDraft(userId);
        var draftRes = readDraft(userId);
        setState({
            status: STATE.REQUIRED,
            step: draft.step,
            hasDraft: draftRes.present && draftRes.valid,
            error: null
        });
        refreshGate();
        return snapshot();
    }


    /* =====================================================
       WIZARD ACTIONS
       ===================================================== */

    function getState() { return snapshot(); }
    function getStatus() { return current.status; }

    function getProgress() {
        return {
            step: current.step,
            totalSteps: TOTAL_STEPS,
            isFirst: current.step <= 1,
            isLast: current.step >= TOTAL_STEPS
        };
    }

    /* the current draft VALUES for the wizard UI. Owner-bound;
       returned by value; never logged. */
    function getDraftValues() {
        var userId = currentUserId();
        if (!userId) { return null; }
        var draft = ensureWorkingDraft(userId);
        return {
            checkingName: draft.values.checkingName,
            checkingBalanceCents: draft.values.checkingBalanceCents,
            savingsName: draft.values.savingsName,
            savingsBalanceCents: draft.values.savingsBalanceCents,
            firstDayOfWeek: draft.values.firstDayOfWeek
        };
    }

    /* patch is { checkingName?, checkingBalanceCents?, savingsName?,
       savingsBalanceCents?, firstDayOfWeek? }. Values are validated
       here; the wizard never writes mWalletData. */
    function updateDraft(patch) {
        if (current.status !== STATE.REQUIRED && current.status !== STATE.ERROR) {
            return { ok: false, code: "not_editing" };
        }
        var userId = currentUserId();
        if (!userId) { return { ok: false, code: "no_user_id" }; }
        var draft = ensureWorkingDraft(userId);
        patch = patch || {};

        if (Object.prototype.hasOwnProperty.call(patch, "checkingName")) {
            draft.values.checkingName = sanitizeName(patch.checkingName, "Checking");
        }
        if (Object.prototype.hasOwnProperty.call(patch, "savingsName")) {
            draft.values.savingsName = sanitizeName(patch.savingsName, "Savings");
        }
        if (Object.prototype.hasOwnProperty.call(patch, "checkingBalanceCents")) {
            draft.values.checkingBalanceCents = clampCents(patch.checkingBalanceCents, true);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "savingsBalanceCents")) {
            draft.values.savingsBalanceCents = clampCents(patch.savingsBalanceCents, false);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "firstDayOfWeek")) {
            if (FIRST_DAYS.indexOf(patch.firstDayOfWeek) === -1) {
                return { ok: false, code: "bad_first_day" };
            }
            draft.values.firstDayOfWeek = patch.firstDayOfWeek;
        }

        persistDraft();
        setState({ hasDraft: true });
        return { ok: true };
    }

    function validateStep(step) {
        var v = getDraftValues();
        if (!v) { return { ok: false, code: "no_user_id" }; }
        if (step === 2) {
            if (!v.checkingName) { return { ok: false, field: "checkingName", message: "Give your checking account a name." }; }
            if (!v.savingsName) { return { ok: false, field: "savingsName", message: "Give your savings account a name." }; }
            if (v.savingsBalanceCents < 0) { return { ok: false, field: "savingsBalance", message: "Savings can't be negative." }; }
        }
        if (step === 3) {
            if (FIRST_DAYS.indexOf(v.firstDayOfWeek) === -1) {
                return { ok: false, field: "firstDayOfWeek", message: "Pick a supported option." };
            }
        }
        return { ok: true };
    }

    function nextStep() {
        if (current.status !== STATE.REQUIRED) { return { ok: false, code: "not_editing" }; }
        var check = validateStep(current.step);
        if (!check.ok) { return check; }
        if (current.step >= TOTAL_STEPS) { return { ok: false, code: "at_last" }; }
        if (workingDraft) { workingDraft.step = current.step + 1; persistDraft(); }
        setState({ step: current.step + 1 });
        return { ok: true, step: current.step };
    }

    function previousStep() {
        if (current.status !== STATE.REQUIRED) { return { ok: false, code: "not_editing" }; }
        if (current.step <= 1) { return { ok: false, code: "at_first" }; }
        if (workingDraft) { workingDraft.step = current.step - 1; persistDraft(); }
        setState({ step: current.step - 1 });
        return { ok: true, step: current.step };
    }

    function goToStep(step) {
        if (current.status !== STATE.REQUIRED) { return { ok: false, code: "not_editing" }; }
        if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) { return { ok: false, code: "bad_step" }; }
        if (workingDraft) { workingDraft.step = step; persistDraft(); }
        setState({ step: step });
        return { ok: true, step: step };
    }


    /* =====================================================
       FINISH  (the ONLY intentional financial write)
       ===================================================== */

    function getFinancialStorage() {
        return global.MWalletStorage || global.BudgetStorage || null;
    }

    function accountsMatchTarget(accounts, target) {
        if (!accounts || typeof accounts !== "object") { return false; }
        var c = accounts.checking || {};
        var s = accounts.savings || {};
        return String(c.name) === target.checkingName &&
            Number(c.balance) === target.checkingDollars &&
            String(s.name) === target.savingsName &&
            Number(s.balance) === target.savingsDollars;
    }

    /* The checking opening balance belongs on the CURRENT calendar
       month (canonical: storage.getCurrentMonthKey()) — NEVER an
       arbitrary month the Budget page happens to have selected. */
    function currentMonthKey(storageApi) {
        try {
            if (typeof storageApi.getCurrentMonthKey === "function") { return storageApi.getCurrentMonthKey(); }
            if (typeof storageApi.getSelectedMonthKey === "function") { return storageApi.getSelectedMonthKey(); }
        } catch (e) { /* ignore */ }
        return null;
    }

    /* the CURRENT month's starting balance is the checking opening
       balance the app displays (dashboard + Budget show the derived
       ending balance, not accounts.checking.balance). */
    function startingBalanceMatches(data, monthKey, dollars) {
        if (!data || !monthKey || !data.months || typeof data.months !== "object") { return false; }
        var m = data.months[monthKey];
        if (!m || typeof m !== "object") { return false; }
        return Number(m.startingBalance) === Number(dollars);
    }

    function finish() {
        return new Promise(function (settle) {
            /* 1-2. auth still signed in with a valid user id */
            var snap = authSnapshot();
            var userId = currentUserId(snap);
            if (!snap || snap.configured !== true || snap.status !== "signed_in" || snap.recoveryMode === true || !userId) {
                settle({ ok: false, code: "not_signed_in", message: "Please sign in again to finish setup." });
                return;
            }
            /* 3. BP4 still says this user owns the workspace */
            if (!ownershipVerified()) {
                settle({ ok: false, code: "ownership", message: "We couldn't confirm this device belongs to your account." });
                return;
            }
            /* 4. the draft belongs to this same owner */
            var draftRes = readDraft(userId);
            if (draftRes.foreign) {
                settle({ ok: false, code: "draft_owner", message: "Setup couldn't be completed. Please start again." });
                return;
            }
            var draft = ensureWorkingDraft(userId);
            /* did a PRIOR finish() attempt already begin writing financial
               fields for this draft? (survives a partial/interrupted apply
               and a reload) */
            var applyAlreadyStarted = draft.applyStarted === true;

            /* 5. not already completed */
            var completion = readCompletion(userId);
            if (completion.valid && completion.matchesCurrentUser) {
                clearDraft();
                setState({ status: completion.record.source === "existing" ? STATE.EXISTING : STATE.COMPLETE, error: null });
                refreshGate();
                settle({ ok: true, alreadyComplete: true });
                return;
            }

            /* 7. re-validate every draft value */
            var v = draft.values;
            var names = {
                checking: sanitizeName(v.checkingName, "Checking"),
                savings: sanitizeName(v.savingsName, "Savings")
            };
            if (!names.checking || !names.savings) {
                settle({ ok: false, code: "invalid_name", message: "Both accounts need a name." });
                return;
            }
            var checkingCents = clampCents(v.checkingBalanceCents, true);
            var savingsCents = clampCents(v.savingsBalanceCents, false);
            if (savingsCents < 0) {
                settle({ ok: false, code: "negative_savings", message: "Savings can't be negative." });
                return;
            }

            var target = {
                checkingName: names.checking,
                checkingDollars: centsToDollars(checkingCents),
                savingsName: names.savings,
                savingsDollars: centsToDollars(savingsCents),
                firstDayOfWeek: FIRST_DAYS.indexOf(v.firstDayOfWeek) !== -1 ? v.firstDayOfWeek : "sunday"
            };

            setState({ status: STATE.SAVING, error: null });
            refreshGate();

            var storageApi = getFinancialStorage();
            if (!storageApi || typeof storageApi.load !== "function" || typeof storageApi.save !== "function") {
                setState({ status: STATE.ERROR, error: { code: "no_storage", message: "M-Wallet storage isn't available. Try again." } });
                refreshGate();
                settle({ ok: false, code: "no_storage", message: "M-Wallet storage isn't available. Try again." });
                return;
            }

            /* 8. load via the canonical storage layer */
            var data;
            try { data = storageApi.load(); }
            catch (e) {
                setState({ status: STATE.ERROR, error: { code: "load_failed", message: "We couldn't read your saved data. Nothing was changed — retry to continue." } });
                refreshGate();
                settle({ ok: false, code: "load_failed", message: "We couldn't read your saved data. Nothing was changed — retry to continue." });
                return;
            }
            if (data && data.recoveryMode === true) {
                setState({ status: STATE.ERROR, error: { code: "recovery_mode", message: "Your saved M-Wallet data needs recovery before setup can finish. It has not been changed." } });
                refreshGate();
                settle({ ok: false, code: "recovery_mode", message: "Your saved M-Wallet data needs recovery before setup can finish. It has not been changed." });
                return;
            }

            var detection = detectMeaningful();
            var monthKey = currentMonthKey(storageApi);
            var canSetStarting = typeof storageApi.setStartingBalance === "function";
            var alreadyApplied = data && accountsMatchTarget(data.accounts, target) &&
                data.settings && data.settings.firstDayOfWeek === target.firstDayOfWeek &&
                (!canSetStarting || startingBalanceMatches(data, monthKey, target.checkingDollars));

            /* 6. safety: an unexpectedly-established workspace (real
               financial state that appeared since the wizard opened, e.g.
               another tab) is NEVER overwritten. But a workspace that
               THIS wizard run already began writing (applyAlreadyStarted,
               or the fields already match target) must be completed, not
               reclassified. */
            if (establishedFinancialState(detection, data) && !alreadyApplied && !applyAlreadyStarted) {
                var wrote = writeCompletion(userId, "existing");
                clearDraft();
                setState({ status: STATE.EXISTING, hasCompletionRecord: wrote.ok, error: null });
                refreshGate();
                settle({ ok: true, applied: false, reason: "existing_data" });
                return;
            }

            /* 9-12. apply ONLY the BP5 fields via the canonical API */
            var appliedStartingBalance = false;
            if (!alreadyApplied) {
                /* mark the draft BEFORE the first write so a partial /
                   interrupted apply is resumed, not treated as existing */
                if (!applyAlreadyStarted && workingDraft) {
                    workingDraft.applyStarted = true;
                    persistDraft();
                    applyAlreadyStarted = true;
                }

                try {
                    if (!data.accounts || typeof data.accounts !== "object") { data.accounts = {}; }
                    if (!data.accounts.checking || typeof data.accounts.checking !== "object") { data.accounts.checking = {}; }
                    if (!data.accounts.savings || typeof data.accounts.savings !== "object") { data.accounts.savings = {}; }
                    if (!data.settings || typeof data.settings !== "object") { data.settings = {}; }

                    data.accounts.checking.name = target.checkingName;
                    data.accounts.savings.name = target.savingsName;
                    data.accounts.savings.balance = target.savingsDollars;
                    data.settings.firstDayOfWeek = target.firstDayOfWeek;
                    /* only poke the derived cache directly when there is no
                       setStartingBalance() to keep it in sync for us */
                    if (!canSetStarting) { data.accounts.checking.balance = target.checkingDollars; }
                } catch (e) {
                    setState({ status: STATE.ERROR, error: { code: "prepare_failed", message: "Something went wrong preparing your setup. Try again." } });
                    refreshGate();
                    settle({ ok: false, code: "prepare_failed", message: "Something went wrong preparing your setup. Try again." });
                    return;
                }

                var saved = false;
                try { saved = storageApi.save(data) !== false; }
                catch (e) { saved = false; }

                if (!saved) {
                    setState({ status: STATE.ERROR, error: { code: "save_failed", message: "We couldn't save your setup. Check your device storage and try again." } });
                    refreshGate();
                    settle({ ok: false, code: "save_failed", message: "We couldn't save your setup. Check your device storage and try again." });
                    return;
                }

                /* 11. the checking opening balance = the CURRENT month's
                   starting balance (what the app actually displays).
                   setStartingBalance() also re-syncs accounts.checking.balance. */
                if (canSetStarting) {
                    var sbResult;
                    try { sbResult = storageApi.setStartingBalance(target.checkingDollars, monthKey); }
                    catch (e) { sbResult = null; }
                    if (sbResult === null || sbResult === false) {
                        /* account details ARE saved; only the opening
                           balance is pending — retry continues from here */
                        setState({ status: STATE.ERROR, error: { code: "starting_balance_failed", message: "We saved your account details but couldn't finish. Retry to continue setup." } });
                        refreshGate();
                        settle({ ok: false, code: "starting_balance_failed", message: "We saved your account details but couldn't finish. Retry to continue setup." });
                        return;
                    }
                    appliedStartingBalance = true;
                }

                /* 12. verify the save */
                var reloaded;
                try { reloaded = storageApi.load(); } catch (e) { reloaded = null; }
                var startingOk = !appliedStartingBalance ||
                    startingBalanceMatches(reloaded, monthKey, target.checkingDollars);
                if (!reloaded || !accountsMatchTarget(reloaded.accounts, target) ||
                    !reloaded.settings || reloaded.settings.firstDayOfWeek !== target.firstDayOfWeek ||
                    !startingOk) {
                    setState({ status: STATE.ERROR, error: { code: "verify_failed", message: "Your setup didn't save correctly. Retry to continue." } });
                    refreshGate();
                    settle({ ok: false, code: "verify_failed", message: "Your setup didn't save correctly. Retry to continue." });
                    return;
                }
            }

            /* 13-14. write + verify the completion record */
            var completed = writeCompletion(userId, "wizard");
            if (!completed.ok) {
                /* the financial values ARE saved and valid; keep the
                   draft so retry re-writes ONLY the metadata (retry
                   is idempotent because alreadyApplied will be true) */
                setState({ status: STATE.ERROR, error: { code: "meta_write_failed", message: "Your setup is saved — we just couldn't record that it finished. Retry to continue." } });
                refreshGate();
                settle({ ok: false, code: "meta_write_failed", message: "Your setup is saved — we just couldn't record that it finished. Retry to continue.", retryFinancial: false });
                return;
            }

            /* 15-16. remove the draft, transition to complete */
            clearDraft();
            setState({ status: STATE.COMPLETE, hasCompletionRecord: true, hasDraft: false, error: null });
            refreshGate();

            /* 17-18. let the app re-render the dashboard with the new balances */
            try {
                var app = global.BudgetApp || global.MWalletApp;
                if (app && typeof app.refresh === "function") { app.refresh(); }
            } catch (e) { /* ignore */ }

            settle({ ok: true, applied: !alreadyApplied });
        });
    }

    function retry() {
        if (current.status === STATE.ERROR || current.status === STATE.SAVING) {
            return finish();
        }
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

    /* Non-sensitive only. No ownerUserId, no draft values, no raw
       financial data, no tokens. */
    function diagnostics() {
        var completion = readJson(SETUP_KEY);
        var draft = readJson(DRAFT_KEY);
        return {
            status: current.status,
            step: current.step,
            totalSteps: TOTAL_STEPS,
            setupKey: SETUP_KEY,
            draftKey: DRAFT_KEY,
            hasCompletionRecord: completion.present,
            completionRecordValid: completion.present ? completion.valid : null,
            completionSource: (completion.valid && completion.value) ? completion.value.source : null,
            hasDraft: draft.present,
            draftValid: draft.present ? draft.valid : null,
            meaningfulLocalData: detectMeaningful().meaningful,
            establishedFinancialState: establishedFinancialState(detectMeaningful(), null),
            ownershipVerified: ownershipVerified(),
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
        /* re-resolve when BP4 ownership settles (e.g. the user just
           clicked "Keep & Protect My Data" -> needs_claim -> owned) so a
           balance-only workspace is recognised as EXISTING immediately,
           not one reload later. */
        try {
            var mig = global.MWalletLocalMigration;
            if (mig && typeof mig.subscribe === "function") {
                mig.subscribe(function () { resolve(authSnapshot()); });
            }
        } catch (e) { /* BP4 absent -> BP5 stays inactive, app not blocked */ }
        /* BP8: when the sync engine restores an existing wallet onto a
           fresh device, re-decide so this owner is recognised as
           EXISTING (established data) and the balance wizard never
           appears. Reuses BP5's own established-data detection — no
           BP8-specific logic here. */
        try {
            var sync = global.MWalletSync;
            if (sync && typeof sync.subscribe === "function") {
                sync.subscribe(function () { resolve(authSnapshot()); });
            }
        } catch (e) { /* BP8 absent -> BP5 unaffected */ }
        initPromise = Promise.resolve(snapshot());
        return initPromise;
    }

    /* auth-ui calls this ONLY after BP4 ownership is positively
       verified. Hold the app for setup only while a fresh owner
       still needs the wizard (or a Finish is in progress / just
       errored). Everything else -> release. */
    function setupGuard(authSnap) {
        if (!authSnap || authSnap.configured !== true || authSnap.status !== "signed_in") {
            return { release: true };
        }
        var s = current.status;
        var hold = s === STATE.REQUIRED || s === STATE.SAVING || s === STATE.CHECKING || s === STATE.ERROR;
        return { release: !hold };
    }

    var api = {
        STATES: STATE,
        SETUP_KEY: SETUP_KEY,
        DRAFT_KEY: DRAFT_KEY,

        initialize: initialize,
        getState: getState,
        getStatus: getStatus,
        getProgress: getProgress,
        getDraftValues: getDraftValues,
        subscribe: subscribe,

        updateDraft: updateDraft,
        validateStep: validateStep,
        nextStep: nextStep,
        previousStep: previousStep,
        goToStep: goToStep,
        finish: finish,
        retry: retry,

        diagnostics: diagnostics,

        /* helpers exposed for the UI + tests (pure, non-sensitive) */
        parseMoneyToCents: parseMoneyToCents,
        centsToDollars: centsToDollars,
        centsToDisplay: centsToDisplay,
        sanitizeName: sanitizeName,

        /* internal */
        _resolve: resolve,
        _setupGuard: setupGuard
    };

    global.MWalletFirstRun = api;

    (function registerGuard() {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.setSetupGuard === "function") {
                global.MWalletAuthUI.setSetupGuard(setupGuard);
            }
        } catch (e) { /* auth-ui absent -> BP5 is optional, app not blocked */ }
    })();

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initialize);
        } else {
            initialize();
        }
    }

})(typeof window !== "undefined" ? window : this);
