"use strict";

/* =========================================================
   BP3 — AUTHENTICATION UI (js/auth/auth-ui.js)

   Loads the real auth.js + auth-ui.js into a node:vm sandbox
   with a stubbed Supabase library and a minimal DOM stub
   (tests/helpers/dom-stub.js). Verifies the gateway wiring:
   show/hide, view switching, form submit -> MWalletAuth,
   validation surfacing, and that the local app is never
   locked out when auth is unconfigured.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { buildAuthDom } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");

const PUBLISHABLE_KEY = "sb_publishable_" + "UiExampleABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const VALID_CONFIG = { supabaseUrl: "https://demoref.supabase.co", supabaseKey: PUBLISHABLE_KEY };

const SESSION = {
    access_token: "UI_SECRET_ACCESS_TOKEN",
    refresh_token: "UI_SECRET_REFRESH_TOKEN",
    expires_at: 9999999999,
    user: { id: "u1", email: "person@example.com" }
};

function flush() { return new Promise((r) => setTimeout(r, 10)); }

function makeEnv(options) {
    options = options || {};
    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    const consoleLines = [];
    const rec = (lvl) => (...a) => consoleLines.push(lvl + ": " + a.map(String).join(" "));
    sandbox.console = { info: rec("info"), warn: rec("warn"), error: rec("error"), log: rec("log"), debug: rec("debug") };
    sandbox.atob = (s) => Buffer.from(s, "base64").toString("binary");
    sandbox.Buffer = Buffer;
    sandbox.setTimeout = setTimeout;
    sandbox.navigator = { onLine: true };
    sandbox.addEventListener = () => {};
    sandbox.removeEventListener = () => {};

    const calls = [];
    const providerErr = options.providerErr || {};
    const mk = (name, ok) => (payload) => {
        calls.push({ name, payload });
        if (providerErr[name]) { return Promise.resolve({ data: {}, error: { message: providerErr[name] } }); }
        return Promise.resolve({ data: ok(payload), error: null });
    };

    let lastCb = null;
    sandbox.supabase = {
        createClient() {
            return {
                auth: {
                    getSession: () => Promise.resolve({ data: { session: options.session || null }, error: null }),
                    onAuthStateChange: (cb) => { lastCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
                    signOut: mk("signOut", () => ({})),
                    signUp: mk("signUp", (p) => ({ user: { email: p.email }, session: options.autoConfirm ? SESSION : null })),
                    signInWithPassword: mk("signInWithPassword", (p) => ({ user: { email: p.email }, session: SESSION })),
                    resetPasswordForEmail: mk("resetPasswordForEmail", () => ({})),
                    updateUser: mk("updateUser", () => ({ user: { email: "person@example.com" } })),
                    resend: mk("resend", () => ({}))
                }
            };
        }
    };

    if (options.config !== null) {
        sandbox.MWalletAuthConfig = options.config || VALID_CONFIG;
    }

    vm.createContext(sandbox);
    ["js/auth/auth-config.js", "js/auth/auth-client.js", "js/auth/auth.js", "js/auth/auth-ui.js"].forEach((f) => {
        vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
    });

    return {
        sandbox,
        auth: sandbox.MWalletAuth,
        ui: sandbox.MWalletAuthUI,
        calls,
        consoleText: () => consoleLines.join("\n"),
        fireEvent: (evt, session) => { if (lastCb) { lastCb(evt, session); } }
    };
}


test("unconfigured: init() leaves the gateway hidden — the local app is never locked out", async () => {
    const env = makeEnv({ config: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);

    assert.equal(dom.gate.hidden, true);
    assert.equal(dom.app.hasAttribute("aria-hidden"), false);
    assert.equal(dom.document.body.classList.contains("mw-auth-locked"), false);
});

test("configured + signed_out: init() shows the gateway on the welcome view and locks the app", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    assert.equal(dom.gate.hidden, false);
    assert.equal(dom.view("welcome").hidden, false);
    assert.equal(dom.view("signup").hidden, true);
    assert.equal(dom.app.getAttribute("aria-hidden"), "true");
    assert.equal(dom.app.inert, true);
    assert.equal(dom.document.body.classList.contains("mw-auth-locked"), true);
});

test("configured + signed_in: the gateway is hidden and the app is interactive", async () => {
    const env = makeEnv({ session: SESSION });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    assert.equal(dom.gate.hidden, true);
    assert.equal(dom.app.hasAttribute("aria-hidden"), false);
    assert.equal(dom.app.inert, false);
});

test("nav buttons switch views without leaving the gateway", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    dom.view("welcome").querySelector('[data-auth-action="go-signup"]').dispatch("click");
    assert.equal(dom.view("signup").hidden, false);
    assert.equal(dom.view("welcome").hidden, true);

    dom.view("signup").querySelector('[data-auth-action="go-signin"]').dispatch("click");
    assert.equal(dom.view("signin").hidden, false);
});

test("sign-up submit: validates, normalizes email, calls MWalletAuth.signUp, shows verify view", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    dom.input("signup", "email").value = "  NewUser@Example.COM ";
    dom.input("signup", "password").value = "sup3rsecret";
    dom.input("signup", "confirm").value = "sup3rsecret";
    dom.form("signup").dispatch("submit", { target: dom.form("signup") });
    await flush();

    const call = env.calls.find((c) => c.name === "signUp");
    assert.ok(call, "provider signUp called");
    assert.equal(call.payload.email, "newuser@example.com");
    assert.equal(dom.view("verify").hidden, false);
    assert.equal(dom.document.querySelector("[data-auth-email]").textContent, "newuser@example.com");
    // password never written to the console
    assert.ok(!env.consoleText().includes("sup3rsecret"));
});

test("sign-up submit: password mismatch is surfaced and no network call is made", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    dom.input("signup", "email").value = "a@b.com";
    dom.input("signup", "password").value = "abcdefgh";
    dom.input("signup", "confirm").value = "different";
    dom.form("signup").dispatch("submit", { target: dom.form("signup") });
    await flush();

    assert.equal(env.calls.some((c) => c.name === "signUp"), false);
    const msg = dom.msg("signup");
    assert.match(msg.textContent, /passwords don't match/i);
    assert.equal(msg.hidden, false);
});

test("sign-in submit: invalid credentials show a mapped message, gateway stays", async () => {
    const env = makeEnv({ session: null, providerErr: { signInWithPassword: "Invalid login credentials" } });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    env.ui.showView("signin");
    dom.input("signin", "email").value = "a@b.com";
    dom.input("signin", "password").value = "wrongpass";
    dom.form("signin").dispatch("submit", { target: dom.form("signin") });
    await flush();

    assert.match(dom.msg("signin").textContent, /doesn't match/i);
    assert.equal(dom.gate.hidden, false);
});

test("sign-in submit: success -> SIGNED_IN event hides the gateway", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    env.ui.showView("signin");
    dom.input("signin", "email").value = "person@example.com";
    dom.input("signin", "password").value = "correctpass";
    dom.form("signin").dispatch("submit", { target: dom.form("signin") });
    await flush();
    env.fireEvent("SIGNED_IN", SESSION);

    assert.equal(dom.gate.hidden, true);
});

test("forgot-password submit: generic success message, no account enumeration", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    env.ui.showView("forgot");
    dom.input("forgot", "email").value = "person@example.com";
    dom.form("forgot").dispatch("submit", { target: dom.form("forgot") });
    await flush();

    assert.ok(env.calls.some((c) => c.name === "resetPasswordForEmail"));
    assert.match(dom.msg("forgot").textContent, /if that email has an account/i);
});

test("password recovery: PASSWORD_RECOVERY shows the recovery view; save calls updateUser and closes the gate", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    env.fireEvent("PASSWORD_RECOVERY", SESSION);
    assert.equal(dom.view("recovery").hidden, false);
    assert.equal(dom.gate.hidden, false);

    dom.input("recovery", "password").value = "a-fresh-password";
    dom.input("recovery", "confirm").value = "a-fresh-password";
    dom.form("recovery").dispatch("submit", { target: dom.form("recovery") });
    await flush();

    assert.ok(env.calls.some((c) => c.name === "updateUser"));
    assert.equal(env.auth.getState().recoveryMode, false);
    assert.equal(dom.gate.hidden, true);          // now signed_in, no recovery
    assert.ok(!env.consoleText().includes("a-fresh-password"));
});

test("verify view: resend calls resendVerification for the pending email", async () => {
    const env = makeEnv({ session: null });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    await flush();

    // go through signup to set the pending email
    dom.input("signup", "email").value = "pending@example.com";
    dom.input("signup", "password").value = "abcdefgh";
    dom.input("signup", "confirm").value = "abcdefgh";
    dom.form("signup").dispatch("submit", { target: dom.form("signup") });
    await flush();

    dom.view("verify").querySelector('[data-auth-action="resend"]').dispatch("click");
    await flush();

    const call = env.calls.find((c) => c.name === "resend");
    assert.ok(call);
    assert.equal(call.payload.email, "pending@example.com");
});

test("no token value ever reaches the DOM", async () => {
    const env = makeEnv({ session: SESSION });
    await env.auth.initialize();
    const dom = buildAuthDom();
    env.ui.init(dom.document);
    env.fireEvent("SIGNED_IN", SESSION);
    await flush();

    const dump = JSON.stringify(collectText(dom.document.body));
    assert.ok(!dump.includes("UI_SECRET_ACCESS_TOKEN"));
    assert.ok(!dump.includes("UI_SECRET_REFRESH_TOKEN"));
});

function collectText(node, acc) {
    acc = acc || [];
    if (node.textContent) { acc.push(node.textContent); }
    (node.children || []).forEach((c) => collectText(c, acc));
    return acc;
}
