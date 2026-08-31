"use strict";

/* =========================================================
   BP9 — PASSKEY UI

   js/auth/passkey-ui.js against a DOM stub + a stubbed
   MWalletPasskeys adapter. Covers the release-disabled and
   enabled-test-mode gateway + Settings behaviour, the removal
   confirmation, and accessibility.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Doc } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");
const UI_SRC = fs.readFileSync(path.join(ROOT, "js/auth/passkey-ui.js"), "utf8");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");


/* ---- DOM the module expects ---- */

function buildDom() {
    const doc = new Doc();

    const gate = doc.createElement("div");
    gate.setAttribute("id", "mw-auth-gate");
    doc.body.appendChild(gate);

    const signin = doc.createElement("section");
    signin.setAttribute("data-auth-view", "signin");
    gate.appendChild(signin);
    const email = doc.createElement("input"); email.setAttribute("name", "email"); email.type = "email"; signin.appendChild(email);
    const pass = doc.createElement("input"); pass.setAttribute("name", "password"); pass.type = "password"; signin.appendChild(pass);
    const signinBtn = doc.createElement("button"); signinBtn.setAttribute("data-auth-submit", ""); signinBtn.textContent = "Sign In"; signin.appendChild(signinBtn);
    const forgot = doc.createElement("button"); forgot.setAttribute("data-auth-action", "go-forgot"); forgot.textContent = "Forgot password?"; signin.appendChild(forgot);

    const wrap = doc.createElement("div");
    wrap.setAttribute("data-passkey-gateway", "");
    wrap.hidden = true;
    signin.appendChild(wrap);
    const pkBtn = doc.createElement("button");
    pkBtn.setAttribute("data-auth-action", "passkey-signin");
    pkBtn.textContent = "Use a Passkey";
    wrap.appendChild(pkBtn);
    const gmsg = doc.createElement("div"); gmsg.setAttribute("id", "mw-passkey-gateway-msg"); gmsg.hidden = true; wrap.appendChild(gmsg);

    /* Settings */
    const settings = doc.createElement("div");
    settings.setAttribute("id", "settings-page");
    doc.body.appendChild(settings);
    const panel = doc.createElement("div"); panel.setAttribute("id", "settings-passkey-panel"); panel.hidden = true; settings.appendChild(panel);
    const status = doc.createElement("span"); status.setAttribute("id", "settings-passkey-status"); panel.appendChild(status);
    const note = doc.createElement("small"); note.setAttribute("id", "settings-passkey-note"); panel.appendChild(note);
    const msg = doc.createElement("div"); msg.setAttribute("id", "settings-passkey-msg"); msg.hidden = true; panel.appendChild(msg);
    const listEl = doc.createElement("ul"); listEl.setAttribute("id", "settings-passkey-list"); panel.appendChild(listEl);
    const addBtn = doc.createElement("button"); addBtn.setAttribute("id", "settings-passkey-add-btn"); addBtn.setAttribute("data-passkey-action", "passkey-add"); addBtn.hidden = true; addBtn.textContent = "Add passkey"; settings.appendChild(addBtn);

    /* confirm dialog */
    const confirm = doc.createElement("div");
    confirm.setAttribute("id", "mw-passkey-confirm");
    confirm.setAttribute("role", "dialog");
    confirm.setAttribute("aria-modal", "true");
    confirm.setAttribute("aria-labelledby", "mw-passkey-confirm-title");
    confirm.setAttribute("aria-describedby", "mw-passkey-confirm-desc");
    confirm.hidden = true;
    doc.body.appendChild(confirm);
    const backdrop = doc.createElement("div"); backdrop.setAttribute("data-passkey-action", "confirm-cancel"); confirm.appendChild(backdrop);
    const ct = doc.createElement("h2"); ct.setAttribute("id", "mw-passkey-confirm-title"); ct.setAttribute("tabindex", "-1"); confirm.appendChild(ct);
    const cd = doc.createElement("p"); cd.setAttribute("id", "mw-passkey-confirm-desc"); cd.textContent = "Your email and password sign-in will remain available."; confirm.appendChild(cd);
    const cancel = doc.createElement("button"); cancel.setAttribute("id", "mw-passkey-confirm-cancel"); cancel.setAttribute("data-passkey-action", "confirm-cancel"); cancel.textContent = "Cancel"; confirm.appendChild(cancel);
    const remove = doc.createElement("button"); remove.setAttribute("id", "mw-passkey-confirm-remove"); remove.setAttribute("data-passkey-action", "confirm-remove"); remove.textContent = "Remove Passkey"; confirm.appendChild(remove);

    return { doc, gate, signin, wrap, pkBtn, gmsg, panel, status, note, listEl, addBtn, confirm, ct, remove, cancel, backdrop };
}

function makePasskeyStub(over) {
    const calls = [];
    const stub = Object.assign({
        _calls: calls,
        caps: { releaseEnabled: false, available: false, supported: false, secureContext: true, registeredCount: null },
        passkeys: [],
        getCapabilities() { return this.caps; },
        getState() { return { busy: false, registeredCount: this.caps.registeredCount }; },
        signIn() { calls.push("signIn"); return Promise.resolve(this._signInResult || { ok: true }); },
        register() { calls.push("register"); return Promise.resolve(this._registerResult || { ok: true }); },
        list() { calls.push("list"); return Promise.resolve({ ok: true, passkeys: this.passkeys.slice() }); },
        rename(ref, name) { calls.push("rename:" + ref + ":" + name); return Promise.resolve(this._renameResult || { ok: true }); },
        remove(ref) { calls.push("remove:" + ref); return Promise.resolve(this._removeResult || { ok: true }); }
    }, over || {});
    return stub;
}

function loadUi(dom, passkeyStub, authState, confirmImpl) {
    const sandbox = {
        window: {}, console, document: dom.doc,
        confirm: confirmImpl || (() => true)
    };
    sandbox.self = sandbox.window;
    sandbox.window.MWalletPasskeys = passkeyStub;
    sandbox.window.MWalletAuth = {
        getState: () => authState,
        subscribe: (fn) => { sandbox.window.__authSub = fn; return () => {}; }
    };
    sandbox.window.confirm = sandbox.confirm;
    vm.createContext(sandbox);
    vm.runInContext(UI_SRC, sandbox, { filename: "passkey-ui.js" });
    return sandbox.window.MWalletPasskeyUI;
}

const SIGNED_IN = { status: "signed_in", configured: true, user: { id: "u", email: "a@b.com", confirmed: true, isAnonymous: false } };


/* ================================================================
   RELEASE DISABLED
   ================================================================ */

test("release disabled: gateway passkey control stays hidden; password form untouched", () => {
    const dom = buildDom();
    const stub = makePasskeyStub({ caps: { releaseEnabled: false, available: false, supported: false } });
    const ui = loadUi(dom, stub, { status: "signed_out", configured: true });
    ui.refresh();
    assert.equal(dom.wrap.hidden, true, "no 'Use a Passkey' control for normal users");
    /* password sign-in + forgot are still present and untouched */
    assert.ok(dom.signin.querySelector('input[name="password"]'));
    assert.ok(dom.signin.querySelector('[data-auth-action="go-forgot"]'));
    assert.equal(stub._calls.length, 0, "no passkey call");
});

test("release disabled: Settings says 'activation pending', no Add button, no list", () => {
    const dom = buildDom();
    const stub = makePasskeyStub({ caps: { releaseEnabled: false, available: false, supported: false } });
    const ui = loadUi(dom, stub, SIGNED_IN);
    ui.refresh();
    assert.equal(dom.panel.hidden, false);
    assert.match(dom.status.textContent, /activation pending|verification/i);
    assert.match(dom.note.textContent, /password sign-in.*unaffected|stay off until|password reset/i);
    assert.equal(dom.addBtn.hidden, true, "no Add passkey button while disabled");
    assert.equal(dom.listEl.children.length, 0);
    assert.ok(!/Backed up/i.test(dom.status.textContent));
});

test("password recovery wins: no 'Use a Passkey' control and no Settings passkey panel during recovery", () => {
    const dom = buildDom();
    const stub = makePasskeyStub({ caps: { releaseEnabled: true, available: true, supported: true } });
    const ui = loadUi(dom, stub, { status: "signed_in", configured: true, recoveryMode: true, user: { id: "u", email: "a@b.com", confirmed: true } });
    ui.refresh();
    assert.equal(dom.wrap.hidden, true, "no passkey ceremony offered during recovery");
    assert.equal(dom.panel.hidden, true, "Settings passkey panel hidden during recovery");
    assert.equal(stub._calls.length, 0);
});

test("no passkey / WebAuthn / API call happens from module load or initialize()", () => {
    const { createPasskeyEnv } = require("./helpers/passkey-harness.js");
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    return Promise.resolve(env.P.initialize()).then(() => {
        assert.equal(env.supa.calls.length, 0, "loading + initialize() makes zero Supabase passkey calls");
    });
});

test("release disabled: clicking a passkey action can start NO ceremony", () => {
    const dom = buildDom();
    const stub = makePasskeyStub({ caps: { releaseEnabled: false, available: false } });
    const ui = loadUi(dom, stub, SIGNED_IN);
    ui.refresh();
    /* the gateway button is hidden; even a forced click is a no-op */
    dom.pkBtn.dispatch("click", { target: dom.pkBtn });
    assert.equal(stub._calls.filter((c) => c === "signIn").length, 0);
    dom.addBtn.dispatch("click", { target: dom.addBtn });
    assert.equal(stub._calls.filter((c) => c === "register").length, 0);
});


/* ================================================================
   ENABLED TEST MODE
   ================================================================ */

function enabledDom(capsOver, passkeyRows) {
    const dom = buildDom();
    const stub = makePasskeyStub({
        caps: Object.assign({ releaseEnabled: true, available: true, supported: true, secureContext: true, registeredCount: 0 }, capsOver || {}),
        passkeys: (passkeyRows || []).slice()
    });
    const confirmCalls = [];
    const ui = loadUi(dom, stub, SIGNED_IN, (m) => { confirmCalls.push(m); return confirmCalls._answer !== false; });
    return { dom, stub, ui, confirmCalls };
}
const settle = () => new Promise((r) => setTimeout(r, 8));

test("enabled: 'Use a Passkey' becomes visible; one click -> one signIn; password stays", async () => {
    const { dom, stub, ui } = enabledDom();
    ui.refresh();
    assert.equal(dom.wrap.hidden, false);
    assert.ok(dom.signin.querySelector('input[name="password"]'), "password field still there");

    dom.pkBtn.dispatch("click", { target: dom.pkBtn });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(stub._calls.filter((c) => c === "signIn").length, 1);
});

test("enabled: a cancelled sign-in shows truthful copy, not a scary error", async () => {
    const { dom, stub, ui } = enabledDom();
    stub._signInResult = { ok: false, code: "user_cancelled" };
    ui.refresh();
    dom.pkBtn.dispatch("click", { target: dom.pkBtn });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    assert.equal(dom.gmsg.hidden, false);
    assert.match(dom.gmsg.textContent, /cancelled/i);
});

test("enabled: an unsupported browser -> Settings says not supported, no Add button", () => {
    const { dom, ui } = enabledDom({ available: false, supported: false });
    ui.refresh();
    assert.match(dom.status.textContent, /not supported/i);
    assert.equal(dom.addBtn.hidden, true);
});

test("enabled: 'Add passkey' visible; one click -> one register", async () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 0 });
    ui.refresh();
    assert.equal(dom.addBtn.hidden, false);
    dom.addBtn.dispatch("click", { target: dom.addBtn });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(stub._calls.filter((c) => c === "register").length, 1);
});

test("enabled: unverified email -> 'Verify your email first', no Add button", () => {
    const dom = buildDom();
    const stub = makePasskeyStub({ caps: { releaseEnabled: true, available: true, supported: true } });
    const ui = loadUi(dom, stub, { status: "signed_in", configured: true, user: { id: "u", email: "a@b.com", confirmed: false, isAnonymous: false } });
    ui.refresh();
    assert.match(dom.status.textContent, /verify your email/i);
    assert.equal(dom.addBtn.hidden, true);
});


/* ================================================================
   LIST / RENAME / REMOVE  UI
   ================================================================ */

const LIST = [
    { _ref: "cred_a", friendlyName: "Adam's MacBook", createdAt: "2026-07-01T00:00:00Z", lastUsedAt: "2026-08-20T00:00:00Z" },
    { _ref: "cred_b", friendlyName: "iPhone", createdAt: "2026-07-15T00:00:00Z" }
];

test("Settings list: friendly names + dates render as text, no credential id, no raw JSON, no token", () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 2 }, LIST);
    ui.refresh();
    return settle().then(() => {
        const text = dom.listEl._descendants().map((n) => n.textContent).join(" | ");
        assert.match(text, /Adam's MacBook/);
        assert.match(text, /iPhone/);
        assert.ok(!/cred_a|cred_b/.test(text), "credential handle never rendered as text");
        assert.ok(!/[{}\[\]]/.test(text), "no raw JSON");
        assert.ok(!/token|a@b\.com|\bu\b(?!sed)/i.test(text));
        assert.match(dom.status.textContent, /2 passkeys registered/i);
    });
});

test("XSS: a hostile friendly name renders as plain text (no innerHTML)", () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 1 }, [{ _ref: "cred_x", friendlyName: "<img src=x onerror=alert(1)>", createdAt: "2026-07-01T00:00:00Z" }]);
    ui.refresh();
    return settle().then(() => {
        const nameEl = dom.listEl._descendants().find((n) => n.tagName === "STRONG");
        assert.ok(nameEl);
        assert.equal(nameEl.textContent, '<img src=x onerror=alert(1)>');
        /* textContent set -> childNodes cleared (no parsed markup) */
        assert.equal(nameEl.children.length, 0);
        assert.ok(!/innerHTML/.test(UI_SRC.replace(/\/\*[\s\S]*?\*\//g, "")), "passkey-ui.js never assigns innerHTML");
    });
});

test("Remove: opens the confirmation dialog; Cancel = zero delete calls", async () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 2 }, LIST);
    ui.refresh();
    await settle();

    const removeBtn = dom.listEl._descendants().find((n) => n.getAttribute("data-passkey-action") === "passkey-remove");
    removeBtn.dispatch("click", { target: removeBtn });
    assert.equal(dom.confirm.hidden, false, "confirm dialog opened");
    assert.match(dom.confirm._descendants().map((n) => n.textContent).join(" "), /password sign-in.*remain|remain available/i);

    dom.cancel.dispatch("click", { target: dom.cancel });
    assert.equal(dom.confirm.hidden, true);
    assert.equal(stub._calls.filter((c) => c.startsWith("remove:")).length, 0, "Cancel removed nothing");
});

test("Remove: Confirm -> exactly one remove call for that passkey", async () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 2 }, LIST);
    ui.refresh();
    await settle();

    const removeBtn = dom.listEl._descendants().find((n) => n.getAttribute("data-passkey-action") === "passkey-remove");
    removeBtn.dispatch("click", { target: removeBtn });
    dom.remove.dispatch("click", { target: dom.remove });
    await Promise.resolve(); await Promise.resolve();
    const calls = stub._calls.filter((c) => c.startsWith("remove:"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0], "remove:cred_a");
});

test("Remove: Escape closes the dialog non-destructively", async () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 1 }, [LIST[0]]);
    ui.refresh();
    await settle();
    const removeBtn = dom.listEl._descendants().find((n) => n.getAttribute("data-passkey-action") === "passkey-remove");
    removeBtn.dispatch("click", { target: removeBtn });
    assert.equal(dom.confirm.hidden, false);
    dom.doc.dispatch("keydown", { key: "Escape" });
    assert.equal(dom.confirm.hidden, true);
    assert.equal(stub._calls.filter((c) => c.startsWith("remove:")).length, 0);
});

test("Rename: swaps to an edit field; Save -> one rename call for that passkey", async () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 1 }, [LIST[0]]);
    ui.refresh();
    await settle();

    const renameBtn = dom.listEl._descendants().find((n) => n.getAttribute("data-passkey-action") === "passkey-rename");
    renameBtn.dispatch("click", { target: renameBtn });
    const input = dom.listEl._descendants().find((n) => n.getAttribute("data-passkey-rename-input"));
    assert.ok(input, "rename input appeared");
    input.value = "Work laptop";
    const saveBtn = dom.listEl._descendants().find((n) => n.getAttribute("data-passkey-action") === "passkey-rename-save");
    saveBtn.dispatch("click", { target: saveBtn });
    await Promise.resolve(); await Promise.resolve();
    const calls = stub._calls.filter((c) => c.startsWith("rename:"));
    assert.equal(calls.length, 1);
    assert.equal(calls[0], "rename:cred_a:Work laptop");
});


/* ================================================================
   ACCESSIBILITY / MARKUP
   ================================================================ */

test("confirm dialog: role/aria-modal/labelledby/describedby + focus into dialog + button controls", async () => {
    const { dom, stub, ui } = enabledDom({ registeredCount: 1 }, [LIST[0]]);
    ui.refresh();
    await settle();
    const removeBtn = dom.listEl._descendants().find((n) => n.getAttribute("data-passkey-action") === "passkey-remove");
    removeBtn.dispatch("click", { target: removeBtn });

    assert.equal(dom.confirm.getAttribute("role"), "dialog");
    assert.equal(dom.confirm.getAttribute("aria-modal"), "true");
    assert.equal(dom.confirm.getAttribute("aria-labelledby"), "mw-passkey-confirm-title");
    assert.equal(dom.confirm.getAttribute("aria-describedby"), "mw-passkey-confirm-desc");
    assert.equal(dom.confirm.getAttribute("aria-hidden"), "false");
    assert.equal(dom.doc.activeElement, dom.ct, "focus moved into the dialog");
    assert.equal(dom.remove.tagName, "BUTTON");
    assert.equal(dom.cancel.tagName, "BUTTON");
});

test("index.html + css: dialog semantics, aria-live status, 44px targets, reduced motion", () => {
    assert.match(INDEX_HTML, /id="mw-passkey-confirm"[\s\S]{0,220}role="dialog"[\s\S]{0,120}aria-modal="true"/);
    assert.match(INDEX_HTML, /id="mw-passkey-confirm"[\s\S]{0,260}aria-describedby="mw-passkey-confirm-desc"/);
    assert.match(INDEX_HTML, /id="settings-passkey-status"[^>]*aria-live="polite"/);
    assert.match(INDEX_HTML, /id="mw-passkey-gateway-msg"[^>]*aria-live="assertive"/);
    /* the sign-in view keeps email + password + forgot + create */
    const signin = INDEX_HTML.slice(INDEX_HTML.indexOf('data-auth-view="signin"'), INDEX_HTML.indexOf('data-auth-view="verify"'));
    assert.match(signin, /name="password"/);
    assert.match(signin, /data-auth-action="go-forgot"/);
    assert.match(signin, /data-auth-action="passkey-signin"/);
    const css = fs.readFileSync(path.join(ROOT, "css/passkeys.css"), "utf8");
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /min-height:\s*44px/);
});

test("index.html: 'Use a Passkey' block starts hidden and is never labelled 'Face ID Login'", () => {
    assert.match(INDEX_HTML, /data-passkey-gateway[^>]*hidden/);
    assert.ok(!/Face ID Login|Face ID Sign/i.test(INDEX_HTML));
    assert.match(INDEX_HTML, /Face ID, Touch ID, Windows Hello, a device PIN, or a security key/);
});
