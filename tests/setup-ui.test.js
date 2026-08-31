"use strict";

/* =========================================================
   BP5 — FIRST-RUN SETUP UI  (js/setup/setup-ui.js)

   Part 1 — pure logic (decideScreen / progressModel), no DOM.
   Part 2 — the DOM layer against the dom-stub #mw-setup-gate,
            with a mocked MWalletFirstRun / MWalletAuth and a
            spy MWalletAuthUI.
   Part 3 — integration: the REAL auth-ui.js + first-run-setup.js
            + setup-ui.js wired together, proving the two-stage
            gate (BP4 ownership -> BP5 setup -> app) keeps the
            financial app root inert until setup is done, then
            releases it.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { buildSetupDom, buildAuthDom } = require("./helpers/dom-stub.js");
const { StorageHarness, MemoryStorage } = require("./helpers/storage-harness.js");

const ROOT = path.resolve(__dirname, "..");
const SETUP_UI_SRC = fs.readFileSync(path.join(ROOT, "js/setup/setup-ui.js"), "utf8");
const AUTH_UI_SRC = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");
const FIRST_RUN_SRC = fs.readFileSync(path.join(ROOT, "js/setup/first-run-setup.js"), "utf8");

const USER_A = "11111111-aaaa-4aaa-8aaa-111111111111";

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function tick() { return new Promise((r) => setTimeout(r, 1)); }

function signedIn(id) {
    return { configured: true, status: "signed_in", recoveryMode: false, user: { id: id || USER_A }, session: { userId: id || USER_A } };
}
function signedOut() { return { configured: true, status: "signed_out", recoveryMode: false, user: null, session: null }; }


/* =====================================================
   PART 1 — PURE LOGIC
   ===================================================== */

function loadPure() {
    const sandbox = { window: {}, document: undefined };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(SETUP_UI_SRC, sandbox, { filename: "setup-ui.js" });
    return sandbox.window.MWalletSetupUI;
}

test("decideScreen: not the authed-owner path -> no setup gate", () => {
    const ui = loadPure();
    const not = [
        {},
        { configured: false },
        { configured: true, status: "signed_out" },
        { configured: true, status: "signed_in", recoveryMode: true }
    ];
    not.forEach((authSnap) => {
        const d = ui.decideScreen({ status: "required", step: 2 }, authSnap);
        assert.equal(d.gate, false);
    });
});

test("decideScreen: maps first-run status -> gate + step", () => {
    const ui = loadPure();
    const auth = signedIn();
    assert.deepEqual(
        plain(ui.decideScreen({ status: "required", step: 3 }, auth)),
        { gate: true, step: "3", reason: "required" }
    );
    assert.equal(ui.decideScreen({ status: "required", step: 99 }, auth).step, "1", "step clamped");
    assert.equal(ui.decideScreen({ status: "required" }, auth).step, "1", "missing step -> 1");

    const saving = ui.decideScreen({ status: "saving" }, auth);
    assert.equal(saving.gate, true);
    assert.equal(saving.step, "4");
    assert.equal(saving.busy, true);

    assert.equal(ui.decideScreen({ status: "checking" }, auth).gate, true);
    assert.equal(ui.decideScreen({ status: "error" }, auth).step, "error");

    ["complete", "existing", "inactive", undefined].forEach((status) => {
        assert.equal(ui.decideScreen({ status: status }, auth).gate, false, "status " + status + " -> no gate");
    });
});

test("progressModel: 4 cells, done/current/todo, human label", () => {
    const ui = loadPure();
    assert.deepEqual(plain(ui.progressModel(1)), { step: 1, total: 4, cells: ["current", "todo", "todo", "todo"], label: "Step 1 of 4" });
    assert.deepEqual(plain(ui.progressModel(3).cells), ["done", "done", "current", "todo"]);
    assert.equal(ui.progressModel(9).step, 1, "out-of-range clamps to 1");
});

test("setup-ui renders user values via textContent / value only — never assigns innerHTML", () => {
    assert.ok(!/\.innerHTML\s*=/.test(SETUP_UI_SRC), "setup-ui.js never assigns innerHTML");
});


/* =====================================================
   PART 2 — DOM LAYER (mocked services)
   ===================================================== */

function makeUiEnv(options) {
    options = options || {};
    const dom = buildSetupDom();

    let firstRunSnap = options.firstRunSnap || { status: "required", step: 1, totalSteps: 4, error: null };
    let draftValues = options.draftValues || {
        checkingName: "Checking", checkingBalanceCents: 0,
        savingsName: "Savings", savingsBalanceCents: 0, firstDayOfWeek: "sunday"
    };
    const frSubs = [];
    const authSubs = [];
    const calls = { goToStep: [], nextStep: 0, previousStep: 0, finish: 0, retry: 0, updateDraft: [], signOut: 0 };

    const firstRun = {
        getState: () => firstRunSnap,
        getStatus: () => firstRunSnap.status,
        getDraftValues: () => draftValues,
        subscribe: (fn) => { frSubs.push(fn); try { fn(firstRunSnap); } catch (e) {} return () => {}; },
        parseMoneyToCents: (raw, opts) => {
            const t = String(raw == null ? "" : raw).replace(/[$,\s]/g, "");
            if (t === "") { return (opts && opts.allowEmpty) ? { ok: true, cents: 0 } : { ok: false, message: "Enter an amount." }; }
            if (!/^-?\d+(\.\d{1,2})?$/.test(t)) { return { ok: false, message: "Enter a valid amount." }; }
            return { ok: true, cents: Math.round(parseFloat(t) * 100) };
        },
        centsToDisplay: (c) => "$" + (Math.round(Number(c) || 0) / 100).toFixed(2),
        centsToDollars: (c) => Math.round(Number(c) || 0) / 100,
        sanitizeName: (raw, fb) => (String(raw == null ? "" : raw).trim() || String(fb || "")),
        goToStep: (n) => { calls.goToStep.push(n); return { ok: true, step: n }; },
        nextStep: () => { calls.nextStep += 1; return { ok: true, step: 3 }; },
        previousStep: () => { calls.previousStep += 1; return { ok: true, step: 1 }; },
        updateDraft: (patch) => { calls.updateDraft.push(patch); return { ok: true }; },
        finish: () => { calls.finish += 1; return Promise.resolve(options.finishResult || { ok: true }); },
        retry: () => { calls.retry += 1; return Promise.resolve(options.retryResult || { ok: true }); }
    };

    const auth = {
        getState: () => (options.authSnap || signedIn()),
        subscribe: (fn) => { authSubs.push(fn); try { fn(options.authSnap || signedIn()); } catch (e) {} return () => {}; },
        signOut: () => { calls.signOut += 1; return Promise.resolve({ ok: true }); }
    };

    const authUiCalls = { setSetupScreenActive: [], renderState: 0 };
    const authUi = {
        setSetupScreenActive: (v) => { authUiCalls.setSetupScreenActive.push(v); },
        renderState: () => { authUiCalls.renderState += 1; }
    };

    const sandbox = { document: undefined, console, setTimeout, Promise, Math, Number, String, Object, Array, JSON };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.MWalletFirstRun = firstRun;
    sandbox.MWalletAuth = auth;
    sandbox.MWalletAuthUI = authUi;
    vm.createContext(sandbox);
    vm.runInContext(SETUP_UI_SRC, sandbox, { filename: "setup-ui.js" });

    const ui = sandbox.MWalletSetupUI;
    ui.init(dom.document);

    return {
        dom, ui, calls, authUiCalls,
        setFirstRun: (snap) => { firstRunSnap = snap; frSubs.slice().forEach((f) => f(snap)); },
        setDraft: (v) => { draftValues = v; },
        gate: dom.setupGate
    };
}

test("dom: status 'required' step 1 -> gate visible, step 1 shown, auth-ui told the wizard is active", () => {
    const env = makeUiEnv({ firstRunSnap: { status: "required", step: 1, error: null } });
    assert.equal(env.gate.hidden, false, "setup gate shown");
    assert.equal(env.dom.step("1").hidden, false);
    ["2", "3", "4", "error"].forEach((k) => assert.equal(env.dom.step(k).hidden, true, "step " + k + " hidden"));
    assert.deepEqual(env.authUiCalls.setSetupScreenActive.slice(-1), [true]);
    assert.ok(env.authUiCalls.renderState > 0);
});

test("dom: status 'required' step 3 -> step 3 shown, progress cells done/done/current/todo", () => {
    const env = makeUiEnv({ firstRunSnap: { status: "required", step: 3, error: null } });
    assert.equal(env.dom.step("3").hidden, false);
    const states = env.dom.progressCells().map((li) => li.getAttribute("data-state"));
    assert.deepEqual(states, ["done", "done", "current", "todo"]);
    assert.equal(env.dom.stepCount().textContent, "Step 3 of 4");
});

test("dom: hydrateFromDraft fills inputs by value and the review by textContent", () => {
    const env = makeUiEnv({
        firstRunSnap: { status: "required", step: 4, error: null },
        draftValues: { checkingName: "Everyday", checkingBalanceCents: 128075, savingsName: "Emergency", savingsBalanceCents: 500000, firstDayOfWeek: "monday" }
    });
    assert.equal(env.dom.field("checkingName").value, "Everyday");
    assert.equal(env.dom.field("checkingBalance").value, "1280.75");
    assert.equal(env.dom.field("savingsBalance").value, "5000.00");
    assert.equal(env.dom.review("review-checking-name").textContent, "Everyday");
    assert.equal(env.dom.review("review-checking-balance").textContent, "$1280.75");
    assert.equal(env.dom.review("review-first-day").textContent, "Monday");
});

test("dom: a hostile account name is rendered as inert text (no child nodes, no markup parsing)", () => {
    const payload = '<img src=x onerror="alert(1)">';
    const env = makeUiEnv({
        firstRunSnap: { status: "required", step: 4, error: null },
        draftValues: { checkingName: payload, checkingBalanceCents: 0, savingsName: "S", savingsBalanceCents: 0, firstDayOfWeek: "sunday" }
    });
    const el = env.dom.review("review-checking-name");
    assert.equal(el.textContent, payload, "stored verbatim as text");
    assert.equal(el.childNodes.length, 0, "no parsed child nodes");
    assert.equal(env.dom.field("checkingName").value, payload, "input carries it as a value, not markup");
});

test("dom: status 'error' -> error section + code-specific message from first-run state", () => {
    const env = makeUiEnv({ firstRunSnap: { status: "error", step: 4, error: { code: "save_failed", message: "We couldn't save your setup. Check your device storage and try again." } } });
    assert.equal(env.dom.step("error").hidden, false);
    const errMsg = env.dom.step("error").querySelector("[data-setup-msg]");
    assert.equal(errMsg.textContent, "We couldn't save your setup. Check your device storage and try again.");
    assert.equal(errMsg.hidden, false);
});

const FALSE_CLAIMS = /your data has not been changed|nothing was saved|no changes were made|nothing has been saved/i;

test("dom: the error screen never claims financial data is unchanged — for ANY error code", () => {
    ["save_failed", "starting_balance_failed", "meta_write_failed", "verify_failed", "load_failed", "recovery_mode"].forEach((code) => {
        const env = makeUiEnv({
            firstRunSnap: {
                status: "error", step: 4,
                error: { code: code, message: "Your setup is saved — we just couldn't record that it finished. Retry to continue." }
            }
        });
        const section = env.dom.step("error");
        const fullText = section.querySelectorAll("p, [data-setup-msg]").map((el) => el.textContent).join(" ");
        assert.ok(!FALSE_CLAIMS.test(fullText), code + ": error screen must not falsely claim 'data unchanged' — got: " + fullText);
        /* the reassurance it DOES give is truthful for every path */
        assert.ok(/safe|retry/i.test(fullText), code + ": error screen should still reassure + offer retry");
    });
});

test("dom: a missing per-code message falls back to a generic that is still accurate", () => {
    const env = makeUiEnv({ firstRunSnap: { status: "error", step: 4, error: { code: "verify_failed", message: "" } } });
    const errMsg = env.dom.step("error").querySelector("[data-setup-msg]");
    assert.ok(errMsg.textContent.length > 0, "a fallback message is shown");
    assert.ok(!FALSE_CLAIMS.test(errMsg.textContent), "the generic fallback makes no false claim");
});

test("dom: status 'saving' -> review step, buttons disabled (busy)", () => {
    const env = makeUiEnv({ firstRunSnap: { status: "saving", step: 4, error: null } });
    assert.equal(env.dom.step("4").hidden, false);
    const buttons = env.gate.querySelectorAll("button");
    assert.ok(buttons.length > 0);
    assert.ok(buttons.every((b) => b.disabled === true), "all buttons disabled while saving");
});

test("dom: 'complete' / 'existing' -> gate hidden, auth-ui told the wizard is gone", () => {
    ["complete", "existing"].forEach((status) => {
        const env = makeUiEnv({ firstRunSnap: { status: status, step: 4, error: null } });
        assert.equal(env.gate.hidden, true, status + " -> gate hidden");
        assert.deepEqual(env.authUiCalls.setSetupScreenActive.slice(-1), [false]);
    });
});

test("dom: Start click -> goToStep(2); Back click -> previousStep", () => {
    const env = makeUiEnv({ firstRunSnap: { status: "required", step: 1, error: null } });

    env.dom.action("start").dispatch("click", { target: env.dom.action("start") });
    assert.deepEqual(env.calls.goToStep, [2]);

    env.setFirstRun({ status: "required", step: 3, error: null });
    env.dom.action("back").dispatch("click", { target: env.dom.action("back") });
    assert.equal(env.calls.previousStep, 1);
});

test("dom: Continue is submit-driven — one submit advances exactly one step (no double-fire)", () => {
    const env = makeUiEnv({ firstRunSnap: { status: "required", step: 2, error: null } });
    env.dom.field("checkingName").value = "Main";

    const btn = env.gate.querySelector('[data-setup-step="2"] [data-setup-action="continue"]');
    /* a real click on a type=submit button is ignored by onClick... */
    btn.dispatch("click", { target: btn });
    assert.equal(env.calls.nextStep, 0, "onClick does not advance a submit button");

    /* ...the form's submit event is what advances the step */
    const form = env.gate.querySelector('[data-setup-form="2"]');
    form.dispatch("submit", { target: form });
    assert.equal(env.calls.nextStep, 1, "exactly one advance");
    assert.ok(env.calls.updateDraft.length > 0, "fields committed to the draft before advancing");
});

test("dom: Finish is submit-driven; a later Sign Out click calls auth.signOut()", async () => {
    const env = makeUiEnv({ firstRunSnap: { status: "required", step: 4, error: null } });

    const form = env.gate.querySelector('[data-setup-form="4"]');
    form.dispatch("submit", { target: form });
    assert.equal(env.calls.finish, 1);
    await tick();   /* let finish()'s promise settle -> setBusy(false) */

    env.setFirstRun({ status: "error", step: 4, error: { message: "x" } });
    env.dom.action("sign-out").dispatch("click", { target: env.dom.action("sign-out") });
    assert.equal(env.calls.signOut, 1);
});


/* =====================================================
   PART 3 — INTEGRATION (real auth-ui + first-run + setup-ui)
   ===================================================== */

function makeIntegration() {
    const dom = buildAuthDom();

    const harness = new StorageHarness();
    harness.storage.load();
    harness.storage.load();
    const ls = harness.localStorage;
    const rawSet = MemoryStorage.prototype.setItem.bind(ls);
    ls.setItem = (k, v) => rawSet(k, v);

    let authSnap = signedOut();
    const authSubs = [];

    const sandbox = {
        document: undefined, console,
        setTimeout, clearTimeout, Promise, Math, Number, String, Object, Array, JSON, Date,
        localStorage: ls
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    sandbox.MWalletAuth = {
        getState: () => authSnap,
        subscribe: (fn) => { authSubs.push(fn); try { fn(authSnap); } catch (e) {} return () => {}; },
        signOut: () => { authSnap = signedOut(); authSubs.slice().forEach((f) => f(authSnap)); return Promise.resolve({ ok: true }); }
    };
    sandbox.MWalletLocalMigration = {
        getStatus: () => "fresh_claimed",
        detectMeaningfulLocalData: () => ({ readable: true, present: true, meaningful: false, signals: [], reason: "fresh" })
    };
    sandbox.MWalletStorage = harness.storage;
    sandbox.BudgetApp = { refresh: () => {} };

    vm.createContext(sandbox);
    vm.runInContext(AUTH_UI_SRC, sandbox, { filename: "auth-ui.js" });
    vm.runInContext(FIRST_RUN_SRC, sandbox, { filename: "first-run-setup.js" });
    vm.runInContext(SETUP_UI_SRC, sandbox, { filename: "setup-ui.js" });

    const w = sandbox;
    w.MWalletAuthUI.init(dom.document);
    w.MWalletFirstRun.initialize();
    w.MWalletSetupUI.init(dom.document);

    /* stand in for BP4: ownership positively verified */
    w.MWalletAuthUI.setPostAuthGuard(() => ({ release: true }));

    return {
        dom, harness, w,
        setAuth: (s) => { authSnap = s; authSubs.slice().forEach((f) => f(s)); },
        appInert: () => dom.app.inert === true && dom.app.getAttribute("aria-hidden") === "true",
        setupVisible: () => dom.setupGate.hidden === false
    };
}

test("integration: a fresh verified owner is held behind the setup wizard, not the financial app", () => {
    const env = makeIntegration();

    env.setAuth(signedIn());

    assert.equal(env.w.MWalletFirstRun.getStatus(), "required");
    assert.equal(env.appInert(), true, "financial app root stays inert during setup");
    assert.equal(env.setupVisible(), true, "#mw-setup-gate is shown");
    assert.equal(env.dom.setupStep("1").hidden, false, "step 1 (welcome) is visible");
    assert.equal(env.dom.gate.hidden, true, "the auth gate is not the thing showing");
});

test("integration: finishing setup releases the financial app and hides the wizard", async () => {
    const env = makeIntegration();
    env.setAuth(signedIn());

    env.w.MWalletFirstRun.updateDraft({ checkingName: "Everyday", checkingBalanceCents: 150000 });
    env.w.MWalletFirstRun.goToStep(4);
    const res = await env.w.MWalletFirstRun.finish();
    assert.equal(res.ok, true);

    assert.equal(env.w.MWalletFirstRun.getStatus(), "complete");
    assert.equal(env.appInert(), false, "financial app root released");
    assert.equal(env.setupVisible(), false, "#mw-setup-gate hidden");

    const data = JSON.parse(env.harness.localStorage.getItem("mWalletData"));
    assert.equal(data.accounts.checking.name, "Everyday");
    assert.equal(data.accounts.checking.balance, 1500);
});

test("integration: clicking through the wizard advances exactly one step per Continue", () => {
    const env = makeIntegration();
    env.setAuth(signedIn());
    const gate = env.dom.setupGate;
    const stepShown = (k) => env.dom.setupStep(k).hidden === false;

    assert.ok(stepShown("1"), "starts on Welcome");
    env.dom.setupAction("start").dispatch("click", { target: env.dom.setupAction("start") });
    assert.ok(stepShown("2"), "Start -> step 2");

    /* one Continue on step 2 must land on step 3 — never skip to 4 */
    const form2 = gate.querySelector('[data-setup-form="2"]');
    form2.dispatch("submit", { target: form2 });
    assert.ok(stepShown("3"), "one Continue -> step 3 (no double-advance)");
    assert.equal(env.w.MWalletFirstRun.getState().step, 3);

    const form3 = gate.querySelector('[data-setup-form="3"]');
    form3.dispatch("submit", { target: form3 });
    assert.ok(stepShown("4"), "step 3 Continue -> Review");
    assert.equal(env.w.MWalletFirstRun.getState().step, 4);
});

test("integration: BP5 UI failing to load never traps a verified owner (fail-open)", () => {
    /* auth-ui + first-run only; setup-ui never initialises */
    const dom = buildAuthDom();
    const harness = new StorageHarness();
    harness.storage.load(); harness.storage.load();
    let authSnap = signedOut();
    const authSubs = [];
    const sandbox = {
        document: undefined, console, setTimeout, clearTimeout, Promise,
        Math, Number, String, Object, Array, JSON, Date, localStorage: harness.localStorage
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.MWalletAuth = {
        getState: () => authSnap,
        subscribe: (fn) => { authSubs.push(fn); try { fn(authSnap); } catch (e) {} return () => {}; },
        signOut: () => Promise.resolve({ ok: true })
    };
    sandbox.MWalletLocalMigration = {
        getStatus: () => "fresh_claimed",
        detectMeaningfulLocalData: () => ({ readable: true, present: true, meaningful: false, signals: [], reason: "fresh" })
    };
    sandbox.MWalletStorage = harness.storage;
    vm.createContext(sandbox);
    vm.runInContext(AUTH_UI_SRC, sandbox, { filename: "auth-ui.js" });
    vm.runInContext(FIRST_RUN_SRC, sandbox, { filename: "first-run-setup.js" });

    const w = sandbox;
    w.MWalletAuthUI.init(dom.document);
    w.MWalletFirstRun.initialize();
    w.MWalletAuthUI.setPostAuthGuard(() => ({ release: true }));

    authSnap = signedIn();
    authSubs.slice().forEach((f) => f(authSnap));

    /* setup guard says "hold" but no setup screen is up -> auth-ui
       fails OPEN and reveals the verified owner's app */
    assert.equal(dom.app.inert === true, false, "verified owner is not trapped behind broken onboarding");
    assert.equal(dom.setupGate.hidden, true);
});
