"use strict";

/* =========================================================
   WELCOME, BETA TESTER  (js/beta/beta-welcome.js)

   Part 1 — pure logic: who sees it, the 1 January 2027 retirement,
            the upcoming-features list.
   Part 2 — the DOM layer: checkbox gates Get Started, the
            acknowledgement is remembered per account, the auth-ui
            guard holds the app only while the screen is up, the
            Beta Hub replay, fail-open storage.
   Part 3 — auth-ui integration: the real gate order holds the app
            behind the welcome and releases it on Get Started.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Doc } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/beta/beta-welcome.js"), "utf8");
const HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const SW = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");

const USER_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEFORE = "2026-11-12T12:00:00";
const NEW_YEARS_EVE = "2026-12-31T23:59:00";
const NEW_YEAR = "2027-01-01T00:00:00";

function signedIn(id) {
    return { configured: true, status: "signed_in", recoveryMode: false, user: { id: id || USER_A }, session: { userId: id || USER_A } };
}

function memoryStorage() {
    const map = new Map();
    return {
        map,
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: (k) => { map.delete(k); }
    };
}

function el(doc, tag, attrs, parent) {
    const e = doc.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => {
        if (k === "hidden") { e.hidden = attrs[k]; } else { e.setAttribute(k, attrs[k]); }
    });
    if (parent) { parent.appendChild(e); }
    return e;
}

function buildDom() {
    const doc = new Doc();
    const gate = el(doc, "div", { id: "mw-beta-welcome", hidden: true }, doc.body);
    doc._index.set("mw-beta-welcome", gate);
    const card = el(doc, "div", { class: "mw-auth-card" }, gate);
    card._classes.add("mw-auth-card");
    const h = el(doc, "h1", { id: "mw-beta-welcome-heading" }, card);
    el(doc, "span", { "data-bw-version": "" }, card);
    el(doc, "ul", { "data-bw-whats-new": "" }, card);
    el(doc, "ul", { "data-bw-upcoming": "" }, card);
    const supportWrap = el(doc, "li", { "data-bw-support-wrap": "", hidden: true }, card);
    el(doc, "a", { "data-bw-support": "", href: "#" }, supportWrap);
    const ackWrap = el(doc, "label", { "data-bw-ack-wrap": "" }, card);
    const box = el(doc, "input", { "data-bw-ack": "" }, ackWrap);
    const start = el(doc, "button", { "data-bw-action": "start" }, card);
    start.disabled = true;
    const replay = el(doc, "button", { id: "mw-beta-welcome-replay-btn", "data-bw-action": "open" }, doc.body);
    doc._index.set("mw-beta-welcome-replay-btn", replay);
    return { doc, gate, heading: h, box, start, replay, supportWrap };
}

function load(opts) {
    opts = opts || {};
    const dom = opts.dom || buildDom();
    const events = [];
    const authCalls = { active: [], renders: 0, guard: null };
    let authSnap = opts.auth === undefined ? signedIn() : opts.auth;
    let owner = opts.ownership || "owned";
    const authSubs = [];
    const window = {
        localStorage: opts.storage === null ? undefined : (opts.storage || memoryStorage()),
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
        MWalletVersion: { version: "0.9.0-beta.11" },
        MWalletBetaConfig: { get: () => ({ supportConfigured: true, supportEmail: "beta@example.com" }) },
        MWalletBetaOps: {
            releaseNotes: () => ({ matchesBuild: true, highlights: ["Exact-cent money."] }),
            currentLimitations: () => opts.limitations || [{ id: "passkeys" }, { id: "account-deletion" }, { id: "verification" }]
        },
        MWalletAuth: { getState: () => authSnap, subscribe: (fn) => authSubs.push(fn) },
        MWalletLocalMigration: { getStatus: () => owner, subscribe: () => {} }
    };
    if (opts.authUi !== false) {
        window.MWalletAuthUI = opts.authUi || {
            setBetaWelcomeGuard: (fn) => { authCalls.guard = fn; },
            setBetaWelcomeScreenActive: (v) => { authCalls.active.push(v); },
            renderState: () => { authCalls.renders += 1; }
        };
    }
    dom.doc.dispatchEvent = (ev) => { events.push(ev); return true; };
    const sandbox = { window, document: undefined };
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: "beta-welcome.js" });
    const bw = window.MWalletBetaWelcome;
    bw.configureForTest({ now: opts.now || BEFORE, resetSession: true });
    bw.init(dom.doc);
    return {
        bw, dom, window, events, authCalls,
        setAuth(s) { authSnap = s; authSubs.forEach((fn) => fn(s)); },
        setOwner(s) { owner = s; bw.render(); }
    };
}

function check(env, on) {
    env.dom.box.checked = on;
    env.dom.gate.dispatch("change", { target: env.dom.box });
}

function texts(ul) { return ul.childNodes.map((n) => n.textContent); }


/* ---- PART 1 — pure ---------------------------------- */

test("decide: a signed-in, verified owner who hasn't acknowledged sees the welcome", () => {
    const { bw } = load({ auth: null });
    assert.deepEqual({ ...bw.decide({ auth: signedIn(), ownershipVerified: true, acknowledged: false, now: BEFORE }) },
        { show: true, reason: "welcome" });
});

test("decide: hidden when unconfigured, signed out, in recovery, ownership pending, or acknowledged", () => {
    const { bw } = load({ auth: null });
    const base = { auth: signedIn(), ownershipVerified: true, acknowledged: false, now: BEFORE };
    assert.equal(bw.decide({ ...base, auth: { configured: false, status: "signed_out" } }).reason, "unconfigured");
    assert.equal(bw.decide({ ...base, auth: { configured: true, status: "signed_out" } }).reason, "signed_out");
    assert.equal(bw.decide({ ...base, auth: { ...signedIn(), recoveryMode: true } }).reason, "recovery");
    assert.equal(bw.decide({ ...base, ownershipVerified: false }).reason, "ownership_pending");
    assert.equal(bw.decide({ ...base, acknowledged: true }).reason, "acknowledged");
});

test("retirement: shown through 31 Dec 2026, gone from 1 Jan 2027 (device local time)", () => {
    const { bw } = load({ auth: null });
    assert.equal(bw.isRetired(NEW_YEARS_EVE), false);
    assert.equal(bw.isRetired(NEW_YEAR), true);
    assert.equal(bw.isRetired("2027-06-01T09:00:00"), true);
    assert.equal(bw.decide({ auth: signedIn(), ownershipVerified: true, acknowledged: false, now: NEW_YEAR }).reason, "retired");
});

test("upcoming: built-but-off features are listed; already-on features and non-features are not", () => {
    const { bw } = load({ auth: null });
    const list = bw.upcoming([{ id: "passkeys" }, { id: "verification" }, { id: "feedback-delivery" }]);
    assert.equal(list.length, 2);
    assert.ok(list[0].startsWith("Passkey sign-in"));
    assert.ok(/beta reports/.test(list[1]));
    assert.equal(bw.upcoming([]).length, 0);
    assert.equal(bw.upcoming(null).length, 0);
});


/* ---- PART 2 — DOM ----------------------------------- */

test("dom: after sign-in the welcome shows, fills content, focuses the heading, and holds the app", () => {
    const env = load();
    assert.equal(env.dom.gate.hidden, false);
    assert.equal(env.dom.doc.activeElement, env.dom.heading);
    assert.equal(env.dom.doc.querySelector("[data-bw-version]").textContent, "0.9.0-beta.11");
    assert.deepEqual(texts(env.dom.doc.querySelector("[data-bw-whats-new]")), ["Exact-cent money."]);
    assert.equal(env.dom.doc.querySelector("[data-bw-upcoming]").childNodes.length, 2);
    assert.equal(env.dom.supportWrap.hidden, false);
    assert.equal(env.dom.doc.querySelector("[data-bw-support]").getAttribute("href"), "mailto:beta@example.com");
    assert.equal(env.bw.isPresenting(), true);
    assert.equal(env.authCalls.guard().release, false, "auth-ui guard holds while the screen is up");
    assert.equal(env.authCalls.active[env.authCalls.active.length - 1], true);
    assert.ok(env.events.some((e) => e.type === "mwallet:beta-welcome-changed"), "setup / tour are told to wait");
});

test("dom: Get Started stays disabled until the pre-release checkbox is ticked", () => {
    const env = load();
    assert.equal(env.dom.start.disabled, true);
    env.dom.doc.dispatch("click", { target: env.dom.start });
    assert.equal(env.dom.gate.hidden, false, "clicking a disabled-state Get Started does nothing");
    check(env, true);
    assert.equal(env.dom.start.disabled, false);
    check(env, false);
    assert.equal(env.dom.start.disabled, true);
});

test("dom: acknowledging hides the screen, releases the app, and is remembered for that account", () => {
    const storage = memoryStorage();
    const env = load({ storage });
    check(env, true);
    env.dom.doc.dispatch("click", { target: env.dom.start });
    assert.equal(env.dom.gate.hidden, true);
    assert.equal(env.authCalls.guard().release, true);
    assert.equal(env.authCalls.active[env.authCalls.active.length - 1], false);
    const rec = JSON.parse(storage.getItem("mwallet.betaWelcome.v1"));
    assert.equal(rec.schemaVersion, 1);
    assert.equal(rec.acknowledged[USER_A].appVersion, "0.9.0-beta.11");
    assert.ok(!/mWalletData/.test([...storage.map.keys()].join()), "never touches the wallet");

    const again = load({ storage });
    assert.equal(again.dom.gate.hidden, true, "not shown again on the next launch");
});

test("dom: a different account on the same device still gets its own welcome", () => {
    const storage = memoryStorage();
    const env = load({ storage });
    check(env, true);
    env.dom.doc.dispatch("click", { target: env.dom.start });
    env.setAuth(signedIn(USER_B));
    assert.equal(env.dom.gate.hidden, false);
    assert.equal(env.dom.box.checked, false, "checkbox starts unticked for the new tester");
});

test("dom: waits for sign-in and ownership, and hides on sign-out", () => {
    const env = load({ auth: { configured: true, status: "signed_out" }, ownership: "checking" });
    assert.equal(env.dom.gate.hidden, true);
    env.setAuth(signedIn());
    assert.equal(env.dom.gate.hidden, true, "not before ownership is verified");
    env.setOwner("fresh_claimed");
    assert.equal(env.dom.gate.hidden, false);
    env.setAuth({ configured: true, status: "signed_out" });
    assert.equal(env.dom.gate.hidden, true);
});

test("dom: from 1 January 2027 it never appears and the Beta Hub replay row is hidden", () => {
    const env = load({ now: NEW_YEAR });
    assert.equal(env.dom.gate.hidden, true);
    assert.equal(env.dom.replay.hidden, true);
    assert.equal(env.bw.open(), false);
    assert.equal(env.authCalls.guard().release, true);
});

test("dom: Beta Hub replay opens it without the checkbox and never holds the app", () => {
    const env = load();
    check(env, true);
    env.dom.doc.dispatch("click", { target: env.dom.start });
    env.dom.doc.dispatch("click", { target: env.dom.replay });
    assert.equal(env.dom.gate.hidden, false);
    assert.equal(env.dom.doc.querySelector("[data-bw-ack-wrap]").hidden, true);
    assert.equal(env.dom.start.disabled, false);
    assert.equal(env.dom.start.textContent, "Close");
    assert.equal(env.authCalls.guard().release, true, "replay is informational — app is not gated");
    env.dom.doc.dispatch("keydown", { key: "Escape" });
    assert.equal(env.dom.gate.hidden, true);
});

test("fail-open: no localStorage -> still shown, acknowledgement lasts for the session", () => {
    const env = load({ storage: null });
    assert.equal(env.dom.gate.hidden, false);
    check(env, true);
    env.dom.doc.dispatch("click", { target: env.dom.start });
    env.bw.render();
    assert.equal(env.dom.gate.hidden, true);
});

test("fail-open: a corrupt record is ignored, not thrown", () => {
    const storage = memoryStorage();
    storage.setItem("mwallet.betaWelcome.v1", "{not json");
    const env = load({ storage });
    assert.equal(env.dom.gate.hidden, false);
});


/* ---- PART 3 — auth-ui gate order -------------------- */

test("auth-ui: consults the beta-welcome guard after ownership and before setup, failing open", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");
    const own = src.indexOf("if (!ownershipReleased(lastSnapshot))");
    const welcome = src.indexOf("if (!betaWelcomeReleased(lastSnapshot))");
    const setup = src.indexOf("if (!setupReleased(lastSnapshot))");
    assert.ok(own > 0 && own < welcome && welcome < setup);
    assert.ok(/function betaWelcomeReleased[\s\S]*?typeof betaWelcomeGuard !== "function"\) \{ return true; \}/.test(src), "no guard -> released");
});

test("setup + tour wait while the welcome is on screen", () => {
    for (const rel of ["js/setup/setup-ui.js", "js/walkthrough/walkthrough-ui.js"]) {
        const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
        assert.ok(/betaWelcomePresenting\(\)/.test(src), rel + " checks the welcome");
        assert.ok(/mwallet:beta-welcome-changed/.test(src), rel + " re-renders when it closes");
    }
});


/* ---- wiring ------------------------------------------ */

test("wiring: markup, script after beta-ui, stylesheet, Beta Hub row, precached", () => {
    assert.ok(/id="mw-beta-welcome"[\s\S]*?role="dialog"/.test(HTML));
    assert.ok(/data-bw-ack[\s\S]*?data-bw-action="start" disabled/.test(HTML), "Get Started starts disabled");
    assert.ok(HTML.indexOf("js/beta/beta-ui.js?v=") < HTML.indexOf("js/beta/beta-welcome.js?v="));
    assert.ok(HTML.indexOf("js/beta/beta-welcome.js?v=") < HTML.indexOf("js/app.js?v="));
    assert.ok(/css\/beta-welcome\.css\?v=\d+/.test(HTML));
    assert.ok(/id="mw-beta-welcome-replay-btn"[\s\S]*?data-bw-action="open"/.test(HTML));
    assert.ok(SW.includes('"./js/beta/beta-welcome.js"') && SW.includes('"./css/beta-welcome.css"'));
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(SRC), "no network");
    assert.ok(!/innerHTML/.test(SRC), "textContent only");
});
