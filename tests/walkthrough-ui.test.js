"use strict";

/* =========================================================
   BP6 — GUIDED APP WALKTHROUGH UI  (js/walkthrough/walkthrough-ui.js)

   Part 1 — pure logic: computePlacement / progressModel / stepModel
            (no DOM; positioning never yields NaN / Infinity).
   Part 2 — the DOM layer against the dom-stub #mw-walkthrough with
            a mocked MWalletWalkthrough + a fake window.
   Part 3 — integration: real auth-ui.js + guided-walkthrough.js +
            walkthrough-ui.js — the fresh owner is held behind the
            tour (app inert), Finish releases the app, and a setup
            module that never renders fails OPEN.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { buildWalkthroughDom } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");
const UI_SRC = fs.readFileSync(path.join(ROOT, "js/walkthrough/walkthrough-ui.js"), "utf8");
const SVC_SRC = fs.readFileSync(path.join(ROOT, "js/walkthrough/guided-walkthrough.js"), "utf8");
const AUTH_UI_SRC = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");

const USER_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
function signedIn(id) {
    return { configured: true, status: "signed_in", recoveryMode: false, user: { id: id || USER_A }, session: { userId: id || USER_A } };
}
function signedOut() { return { configured: true, status: "signed_out", recoveryMode: false, user: null, session: null }; }

function finiteObj(o) {
    return Object.keys(o).every(function (k) {
        var v = o[k];
        return typeof v !== "number" || Number.isFinite(v);
    });
}


/* =====================================================
   PART 1 — PURE LOGIC
   ===================================================== */

function loadPure() {
    const sandbox = { window: {}, document: undefined };
    sandbox.self = sandbox.window;
    vm.createContext(sandbox);
    vm.runInContext(UI_SRC, sandbox, { filename: "walkthrough-ui.js" });
    return sandbox.window.MWalletWalkthroughUI;
}

const VIEW = { viewportW: 390, viewportH: 844, cardW: 320, cardH: 200, bottomInset: 72, topInset: 8 };

test("computePlacement: no target -> centred, no spotlight, finite coords", () => {
    const ui = loadPure();
    const p = ui.computePlacement(Object.assign({}, VIEW, { targetRect: null, preferred: "bottom" }));
    assert.equal(p.placement, "center");
    assert.equal(p.spotlight, null);
    assert.ok(finiteObj({ x: p.x, y: p.y }), "finite x/y");
    assert.ok(p.x >= 0 && p.x <= VIEW.viewportW, "x within viewport");
});

test("computePlacement: a target with room below -> placed 'bottom' with a spotlight", () => {
    const ui = loadPure();
    const rect = { top: 100, left: 40, width: 300, height: 60 };
    const p = ui.computePlacement(Object.assign({}, VIEW, { targetRect: rect, preferred: "bottom" }));
    assert.equal(p.placement, "bottom");
    assert.ok(p.y >= rect.top + rect.height, "card below the target");
    assert.ok(p.spotlight, "spotlight present");
    assert.ok(finiteObj(p.spotlight), "finite spotlight box");
    assert.ok(p.spotlight.w > 0 && p.spotlight.h > 0);
});

test("computePlacement: no room below -> falls back to another side, keeps the spotlight", () => {
    const ui = loadPure();
    /* target near the bottom, tall card -> bottom won't fit */
    const rect = { top: 700, left: 40, width: 300, height: 60 };
    const p = ui.computePlacement(Object.assign({}, VIEW, { targetRect: rect, cardH: 300, preferred: "bottom" }));
    assert.notEqual(p.placement, "bottom");
    assert.ok(["top", "left", "right", "center"].indexOf(p.placement) !== -1);
    assert.ok(p.spotlight, "spotlight kept even when the card is centred");
    assert.ok(finiteObj({ x: p.x, y: p.y }));
});

test("computePlacement: garbage rect / zero viewport never produce NaN or Infinity", () => {
    const ui = loadPure();
    const cases = [
        { targetRect: { top: NaN, left: 5, width: 10, height: 10 } },
        { targetRect: { top: Infinity, left: 0, width: 0, height: 0 } },
        { targetRect: { top: 0, left: 0, width: -50, height: -50 } },
        { viewportW: 0, viewportH: 0, targetRect: { top: 10, left: 10, width: 10, height: 10 } },
        { targetRect: {} }
    ];
    cases.forEach(function (c, i) {
        const p = ui.computePlacement(Object.assign({}, VIEW, c));
        assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), "case " + i + " finite x/y");
        assert.ok(typeof p.placement === "string");
        if (p.spotlight) { assert.ok(finiteObj(p.spotlight), "case " + i + " finite spotlight"); }
    });
});

test("computePlacement: the card stays inside the viewport for a target hard against an edge", () => {
    const ui = loadPure();
    const rect = { top: 10, left: 360, width: 40, height: 40 };  /* far right */
    const p = ui.computePlacement(Object.assign({}, VIEW, { targetRect: rect, preferred: "right" }));
    assert.ok(p.x >= 0, "x not negative");
    assert.ok(p.x + VIEW.cardW <= VIEW.viewportW + 1, "card right edge within viewport");
    assert.ok(p.y >= 0);
});

test("progressModel: 8 cells, done/current/todo, human label", () => {
    const ui = loadPure();
    assert.deepEqual(plain(ui.progressModel(0)).cells, ["current", "todo", "todo", "todo", "todo", "todo", "todo", "todo"]);
    assert.deepEqual(plain(ui.progressModel(3)).cells.slice(0, 4), ["done", "done", "done", "current"]);
    assert.equal(ui.progressModel(3).label, "Step 4 of 8");
    assert.equal(ui.progressModel(99).step, 8, "clamped");
    assert.equal(ui.progressModel(-2).step, 1, "clamped");
});

test("stepModel: 8 steps, correct pages, Start/Next/Finish labels", () => {
    const ui = loadPure();
    assert.equal(ui.TOTAL_STEPS, 8);
    assert.equal(ui.stepModel(0).id, "welcome");
    assert.equal(ui.stepModel(0).page, null);
    assert.equal(ui.stepModel(0).nextLabel, "Start Tour");
    assert.equal(ui.stepModel(0).isFirst, true);
    assert.equal(ui.stepModel(1).page, "home");
    assert.equal(ui.stepModel(1).nextLabel, "Next");
    assert.equal(ui.stepModel(7).id, "settings");
    assert.equal(ui.stepModel(7).nextLabel, "Finish Tour");
    assert.equal(ui.stepModel(7).isLast, true);
    /* the registry matches the service's step order */
    assert.deepEqual(plain(ui.STEPS).map(function (s) { return s.id; }),
        ["welcome", "home", "budget", "transactions", "savings", "m-cash", "reports", "settings"]);
});

test("walkthrough-ui renders copy via textContent — never assigns innerHTML", () => {
    assert.ok(!/\.innerHTML\s*=/.test(UI_SRC), "no innerHTML assignment");
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|createClient/.test(UI_SRC), "no network / cloud");
});


/* =====================================================
   PART 2 — DOM LAYER
   ===================================================== */

function makeUiEnv(options) {
    options = options || {};
    const dom = buildWalkthroughDom();

    /* make the requested step's page the active one + give it a box */
    const activate = (page) => {
        Object.keys(dom.pages).forEach((name) => {
            const active = name === page;
            dom.pages[name].page.classList.toggle("active", active);
            dom.pages[name].target.setRect(active
                ? { top: 120, left: 16, width: 320, height: 90 }
                : { top: 0, left: 0, width: 0, height: 0 });
        });
    };
    activate("home");

    let snap = options.snap || { status: "active", stepId: "welcome", stepIndex: 0, totalSteps: 8, mode: "auto", isFirst: true, isLast: false, error: null };
    const subs = [];
    const calls = { next: 0, back: 0, skip: 0, bailOut: [] };
    const tour = {
        getState: () => snap,
        getStatus: () => snap.status,
        subscribe: (fn) => { subs.push(fn); try { fn(snap); } catch (e) {} return () => {}; },
        next: () => { calls.next += 1; },
        back: () => { calls.back += 1; },
        skip: () => { calls.skip += 1; },
        bailOut: (code) => { calls.bailOut.push(code); snap = { status: "error", stepIndex: snap.stepIndex, error: { code: code } }; subs.slice().forEach((f) => f(snap)); }
    };

    const authUiCalls = { setWalkthroughScreenActive: [], renderState: 0 };
    const navCalls = [];

    const sandbox = {
        document: undefined, console,
        setTimeout, clearTimeout, Promise, Math, Number, String, Object, Array, JSON, Date
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.innerWidth = options.vw || 390;
    sandbox.innerHeight = options.vh || 844;
    sandbox.matchMedia = () => ({ matches: options.reducedMotion === true, addEventListener: () => {}, addListener: () => {} });
    sandbox.requestAnimationFrame = (fn) => { try { fn(); } catch (e) {} return 1; };
    sandbox.getComputedStyle = () => ({ getPropertyValue: () => "" });
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};
    sandbox.MWalletWalkthrough = tour;
    sandbox.MWalletAuthUI = {
        setWalkthroughScreenActive: (v) => { authUiCalls.setWalkthroughScreenActive.push(v); },
        renderState: () => { authUiCalls.renderState += 1; }
    };
    sandbox.BudgetNavigation = {
        showPage: (p) => { navCalls.push(p); activate(p); },
        getCurrentPage: () => "home"
    };

    vm.createContext(sandbox);
    vm.runInContext(UI_SRC, sandbox, { filename: "walkthrough-ui.js" });

    const ui = sandbox.MWalletWalkthroughUI;
    ui.init(dom.document);

    return {
        dom, ui, tour, calls, authUiCalls, navCalls, activate,
        setSnap: (s) => { snap = s; subs.slice().forEach((f) => f(s)); },
        gate: dom.gate
    };
}

test("dom: active tour -> overlay visible, Welcome shown, auth-ui told the tour is up", () => {
    const env = makeUiEnv();
    assert.equal(env.gate.hidden, false, "overlay shown");
    assert.equal(env.dom.title.textContent, "Here’s your M-Wallet");
    assert.ok(env.dom.body.textContent.length > 0);
    assert.equal(env.dom.stepCount.textContent, "Step 1 of 8");
    assert.equal(env.dom.action("back").hidden, true, "Back hidden on step 1");
    assert.equal(env.dom.action("next").textContent, "Start Tour");
    assert.deepEqual(env.authUiCalls.setWalkthroughScreenActive.slice(-1), [true]);
});

test("dom: a middle step -> title/body/progress update, Back visible, Next label 'Next'", () => {
    const env = makeUiEnv();
    env.setSnap({ status: "active", stepId: "savings", stepIndex: 4, totalSteps: 8, mode: "auto", isFirst: false, isLast: false, error: null });
    assert.equal(env.dom.title.textContent, "Build toward your goals");
    assert.equal(env.dom.stepCount.textContent, "Step 5 of 8");
    assert.equal(env.dom.action("back").hidden, false);
    assert.equal(env.dom.action("next").textContent, "Next");
    const states = Array.prototype.slice.call(env.gate.querySelectorAll("[data-wt-progress] li")).map((li) => li.getAttribute("data-state"));
    assert.deepEqual(states.slice(0, 5), ["done", "done", "done", "done", "current"]);
});

test("dom: final step -> Next label 'Finish Tour'", () => {
    const env = makeUiEnv();
    env.setSnap({ status: "active", stepId: "settings", stepIndex: 7, totalSteps: 8, mode: "auto", isFirst: false, isLast: true, error: null });
    assert.equal(env.dom.action("next").textContent, "Finish Tour");
});

test("dom: a missing target -> card centred, spotlight hidden, Back/Next/Skip still work", () => {
    const env = makeUiEnv();
    /* a step whose target attribute exists but the page box is zero */
    env.dom.pages.budget.target.setRect({ top: 0, left: 0, width: 0, height: 0 });
    env.setSnap({ status: "active", stepId: "budget", stepIndex: 2, totalSteps: 8, mode: "auto", isFirst: false, isLast: false, error: null });

    assert.equal(env.gate.getAttribute("data-wt-has-target"), "false", "no usable target");
    assert.equal(env.dom.spotlight.hidden, true, "spotlight hidden");
    assert.equal(env.gate.getAttribute("data-wt-placement"), "center");

    env.dom.action("next").dispatch("click", { target: env.dom.action("next") });
    env.dom.action("back").dispatch("click", { target: env.dom.action("back") });
    env.dom.action("skip").dispatch("click", { target: env.dom.action("skip") });
    assert.equal(env.calls.next, 1);
    assert.equal(env.calls.back, 1);
    assert.equal(env.calls.skip, 1);
});

test("dom: clicking Next / Back / Skip calls the service exactly once each (no double-fire)", () => {
    const env = makeUiEnv();
    env.setSnap({ status: "active", stepId: "home", stepIndex: 1, totalSteps: 8, mode: "auto", isFirst: false, isLast: false, error: null });
    env.dom.action("next").dispatch("click", { target: env.dom.action("next") });
    assert.equal(env.calls.next, 1);
    env.dom.action("back").dispatch("click", { target: env.dom.action("back") });
    assert.equal(env.calls.back, 1);
});

test("dom: Escape behaves as Skip", () => {
    const env = makeUiEnv();
    env.dom.document.dispatch("keydown", { key: "Escape", preventDefault: () => {} });
    assert.equal(env.calls.skip, 1);
});

test("dom: status leaves 'active' -> overlay hides, auth-ui told the tour is gone", () => {
    const env = makeUiEnv();
    assert.equal(env.gate.hidden, false);
    env.setSnap({ status: "completed", stepIndex: 7, error: null });
    assert.equal(env.gate.hidden, true);
    assert.deepEqual(env.authUiCalls.setWalkthroughScreenActive.slice(-1), [false]);
});

test("dom: a spotlight target -> spotlight positioned with finite, in-bounds box", () => {
    const env = makeUiEnv();
    env.dom.pages.home.target.setRect({ top: 140, left: 20, width: 320, height: 88 });
    env.setSnap({ status: "active", stepId: "home", stepIndex: 1, totalSteps: 8, mode: "auto", isFirst: false, isLast: false, error: null });
    assert.equal(env.gate.getAttribute("data-wt-has-target"), "true");
    assert.equal(env.dom.spotlight.hidden, false);
    const x = parseFloat(env.dom.spotlight.style.left);
    const w = parseFloat(env.dom.spotlight.style.width);
    assert.ok(Number.isFinite(x) && Number.isFinite(w));
    assert.ok(x >= 0 && x + w <= 390 + 1);
});


/* =====================================================
   PART 3 — INTEGRATION (real auth-ui + service + ui)
   ===================================================== */

function makeIntegration() {
    const dom = buildWalkthroughDom();

    let authSnap = signedOut();
    const authSubs = [];
    let migStatus = "fresh_claimed";
    let setupStatus = "required";
    const setupSubs = [];

    const store = Object.create(null);
    const localStorage = {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        key: (i) => Object.keys(store)[i] ?? null,
        get length() { return Object.keys(store).length; }
    };

    const sandbox = {
        document: undefined, console,
        setTimeout, clearTimeout, Promise, Math, Number, String, Object, Array, JSON, Date,
        localStorage
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.innerWidth = 390;
    sandbox.innerHeight = 844;
    sandbox.matchMedia = () => ({ matches: false, addEventListener: () => {}, addListener: () => {} });
    sandbox.requestAnimationFrame = (fn) => { try { fn(); } catch (e) {} return 1; };
    sandbox.getComputedStyle = () => ({ getPropertyValue: () => "" });
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};

    sandbox.MWalletAuth = {
        getState: () => authSnap,
        subscribe: (fn) => { authSubs.push(fn); try { fn(authSnap); } catch (e) {} return () => {}; },
        signOut: () => { authSnap = signedOut(); authSubs.slice().forEach((f) => f(authSnap)); return Promise.resolve({ ok: true }); }
    };
    sandbox.MWalletLocalMigration = { getStatus: () => migStatus, subscribe: () => () => {} };
    sandbox.MWalletFirstRun = {
        getStatus: () => setupStatus,
        subscribe: (fn) => { setupSubs.push(fn); try { fn(); } catch (e) {} return () => {}; }
    };
    sandbox.BudgetNavigation = { showPage: () => {}, getCurrentPage: () => "home" };

    vm.createContext(sandbox);
    vm.runInContext(AUTH_UI_SRC, sandbox, { filename: "auth-ui.js" });
    vm.runInContext(SVC_SRC, sandbox, { filename: "guided-walkthrough.js" });
    vm.runInContext(UI_SRC, sandbox, { filename: "walkthrough-ui.js" });

    const w = sandbox;
    w.MWalletAuthUI.init(dom.document);
    w.MWalletWalkthrough.initialize();
    w.MWalletWalkthroughUI.init(dom.document);
    /* stand in for BP4 + BP5 releasing */
    w.MWalletAuthUI.setPostAuthGuard(() => ({ release: true }));
    w.MWalletAuthUI.setSetupGuard(() => ({ release: true }));

    return {
        dom, w,
        setAuth: (s) => { authSnap = s; authSubs.slice().forEach((f) => f(s)); },
        setSetup: (s) => { setupStatus = s; setupSubs.slice().forEach((f) => f()); },
        appInert: () => dom.app.inert === true && dom.app.getAttribute("aria-hidden") === "true",
        tourVisible: () => dom.gate.hidden === false
    };
}

test("integration: a fresh wizard-complete owner is held behind the tour, not the financial app", () => {
    const env = makeIntegration();
    env.setAuth(signedIn());
    env.setSetup("complete");   /* BP5 finishes */

    assert.equal(env.w.MWalletWalkthrough.getStatus(), "active");
    assert.equal(env.appInert(), true, "financial app root inert during the tour");
    assert.equal(env.tourVisible(), true, "#mw-walkthrough shown");
    assert.equal(env.dom.title.textContent.length > 0, true);
});

test("integration: finishing the tour releases the financial app and hides the overlay", () => {
    const env = makeIntegration();
    env.setAuth(signedIn());
    env.setSetup("complete");

    for (let i = 0; i < 8; i += 1) { env.w.MWalletWalkthrough.next(); }
    assert.equal(env.w.MWalletWalkthrough.getStatus(), "completed");
    assert.equal(env.appInert(), false, "financial app released");
    assert.equal(env.tourVisible(), false, "#mw-walkthrough hidden");
});

test("integration: the tour UI never mounting fails OPEN (verified owner keeps the app)", () => {
    /* auth-ui + service only; walkthrough-ui never initialises */
    const dom = buildWalkthroughDom();
    let authSnap = signedOut();
    const authSubs = [];
    let setupStatus = "complete";
    const setupSubs = [];
    const store = Object.create(null);
    const sandbox = {
        document: undefined, console, setTimeout, clearTimeout, Promise,
        Math, Number, String, Object, Array, JSON, Date,
        localStorage: {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }, key: () => null, get length() { return 0; }
        }
    };
    sandbox.window = sandbox; sandbox.self = sandbox;
    sandbox.MWalletAuth = { getState: () => authSnap, subscribe: (fn) => { authSubs.push(fn); fn(authSnap); return () => {}; }, signOut: () => Promise.resolve({ ok: true }) };
    sandbox.MWalletLocalMigration = { getStatus: () => "fresh_claimed", subscribe: () => () => {} };
    sandbox.MWalletFirstRun = { getStatus: () => setupStatus, subscribe: (fn) => { setupSubs.push(fn); fn(); return () => {}; } };
    sandbox.BudgetNavigation = { showPage: () => {}, getCurrentPage: () => "home" };
    vm.createContext(sandbox);
    vm.runInContext(AUTH_UI_SRC, sandbox, { filename: "auth-ui.js" });
    vm.runInContext(SVC_SRC, sandbox, { filename: "guided-walkthrough.js" });

    const w = sandbox;
    w.MWalletAuthUI.init(dom.document);
    w.MWalletWalkthrough.initialize();
    w.MWalletAuthUI.setPostAuthGuard(() => ({ release: true }));
    w.MWalletAuthUI.setSetupGuard(() => ({ release: true }));

    authSnap = signedIn();
    authSubs.slice().forEach((f) => f(authSnap));

    /* the service says "active" (guard would hold) but no overlay is
       presenting -> auth-ui fails open and reveals the app */
    assert.equal(w.MWalletWalkthrough.getStatus(), "active");
    assert.equal(dom.app.inert === true, false, "a broken/absent tour UI never traps the owner");
});
