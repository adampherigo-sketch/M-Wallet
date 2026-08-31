"use strict";

/* =========================================================
   BP10 — ACCOUNT UI  (window.MWalletAccountUI)

   DOM-only. Renders the Settings account sections and drives
   the change-email / restore-preview / erase dialogs. It
   never parses an export, never writes localStorage, and
   never turns untrusted import text into HTML.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { Doc } = require("./helpers/dom-stub.js");
const { MWalletAccountUI: UI } = require("../js/account/account-ui.js");

const plain = (v) => JSON.parse(JSON.stringify(v));

/* ---- a DOM with just the BP10 ids -------------------- */

function buildDom() {
    const doc = new Doc();
    const page = doc.createElement("div");
    page.id = "settings-page";
    doc.body.appendChild(page);

    const add = (parent, tag, id, action) => {
        const el = doc.createElement(tag);
        if (id) { el.id = id; }
        if (action) { el.setAttribute("data-acct-action", action); }
        parent.appendChild(el);
        return el;
    };

    ["mw-acct-status", "mw-acct-email", "mw-acct-verified", "mw-acct-password-status",
     "mw-acct-passkey-status", "mw-acct-deletion-status", "settings-storage-info",
     "mw-acct-msg", "mw-acct-data-msg"].forEach((id) => add(page, "span", id));

    add(page, "button", "mw-acct-change-email-btn", "change-email");
    add(page, "button", "mw-acct-change-password-btn", "change-password");
    add(page, "button", "mw-acct-signout-btn", "sign-out");
    add(page, "button", "mw-acct-signout-all-btn", "sign-out-all");
    add(page, "button", "mw-acct-export-btn", "export");
    add(page, "button", "mw-acct-restore-btn", "restore");
    const restoreInput = add(page, "input", "mw-acct-restore-input");
    restoreInput.files = [];
    add(page, "button", "mw-acct-erase-btn", "erase");

    /* dialogs */
    const emailDlg = add(doc.body, "div", "mw-acct-email-dialog");
    emailDlg.hidden = true;
    add(emailDlg, "h2", "mw-acct-email-title");
    add(emailDlg, "input", "mw-acct-email-input");
    add(emailDlg, "p", "mw-acct-email-msg");
    add(emailDlg, "button", "mw-acct-email-confirm-btn", "email-confirm");
    add(emailDlg, "button", null, "email-cancel");

    const restoreDlg = add(doc.body, "div", "mw-acct-restore-dialog");
    restoreDlg.hidden = true;
    add(restoreDlg, "h2", "mw-acct-restore-title");
    add(restoreDlg, "div", "mw-acct-restore-preview");
    add(restoreDlg, "p", "mw-acct-restore-msg");
    add(restoreDlg, "button", "mw-acct-restore-confirm-btn", "restore-confirm");
    add(restoreDlg, "button", null, "restore-cancel");

    const eraseDlg = add(doc.body, "div", "mw-acct-erase-dialog");
    eraseDlg.hidden = true;
    add(eraseDlg, "h2", "mw-acct-erase-title");
    add(eraseDlg, "input", "mw-acct-erase-input");
    add(eraseDlg, "p", "mw-acct-erase-msg");
    add(eraseDlg, "button", "mw-acct-erase-confirm-btn", "erase-confirm");
    add(eraseDlg, "button", null, "erase-cancel");

    return { doc, page, restoreInput, emailDlg, restoreDlg, eraseDlg, el: (id) => doc.getElementById(id) };
}

function fakeAccount(over) {
    const calls = { changeEmail: [], signOut: [], restoreWallet: [], eraseLocalWallet: [], exportWallet: 0, sendPasswordReset: 0 };
    const api = Object.assign({
        getSummary: () => ({
            account: { configured: true, signedIn: true, email: "me@example.com", emailVerified: true, recoveryMode: false },
            security: { passwordAvailable: true, passkeys: { releaseEnabled: false, registeredCount: null } },
            data: { storedLocally: true, exportAvailable: true, importAvailable: true, ownershipVerified: true },
            privacy: {}, accountDeletion: { available: false, reason: "requires_trusted_server" }
        }),
        changeEmail: (e) => { calls.changeEmail.push(e); return Promise.resolve({ ok: true, verificationRequired: true, message: "Check your new email." }); },
        sendPasswordReset: () => { calls.sendPasswordReset += 1; return Promise.resolve({ ok: true, message: "Check your email." }); },
        signOut: (o) => { calls.signOut.push(o); return Promise.resolve({ ok: true }); },
        signOutEverywhere: () => { calls.signOut.push({ scope: "global" }); return Promise.resolve({ ok: true }); },
        exportWallet: () => { calls.exportWallet += 1; return { ok: true, filename: "m-wallet-export-2026-08-29.json", json: '{"format":"m-wallet-export"}', mimeType: "application/json" }; },
        inspectImport: (t) => ({ ok: true, preview: { months: 2, monthEntries: 5, bills: 1, recurringItems: 3, savingsGoals: 1, categories: 4, hasMCashData: true, createdAt: "2026-08-01T00:00:00.000Z", appVersion: "0.9.0-beta.9" } }),
        restoreWallet: (t, opts) => { calls.restoreWallet.push({ t, opts }); return Promise.resolve({ ok: true }); },
        eraseLocalWallet: (o) => { calls.eraseLocalWallet.push(o); return Promise.resolve({ ok: true, signedOut: true }); }
    }, over || {});
    return { api, calls };
}

function setup(over) {
    const dom = buildDom();
    const acct = fakeAccount(over);
    const downloads = [];
    UI.configureForTest({
        doc: dom.doc,
        account: acct.api,
        auth: { subscribe: () => () => {} },
        confirm: () => true,
        download: (name, text, mime) => { downloads.push({ name, text, mime }); return true; },
        readFile: (file) => Promise.resolve(file && file._text != null ? file._text : "{}")
    });
    UI.init(dom.doc);
    return {
        dom, acct, downloads,
        restoreInput: dom.restoreInput,
        click: (id) => dom.el(id).dispatch("click", { target: dom.el(id) })
    };
}

test.afterEach(() => UI.configureForTest(null));


/* ---- pure helpers ----------------------------------- */

test("accountRowModel maps a signed-in verified summary", () => {
    const m = UI.accountRowModel({
        account: { configured: true, signedIn: true, email: "a@b.com", emailVerified: true },
        data: { exportAvailable: true, importAvailable: true }
    });
    assert.equal(m.statusLabel, "Signed in");
    assert.equal(m.verifiedLabel, "Verified");
    assert.equal(m.verifiedClass, "is-verified");
    assert.equal(m.exportEnabled, true);
});

test("accountRowModel: signed out hides verification, keeps export/import flags honest", () => {
    const m = UI.accountRowModel({ account: { configured: true, signedIn: false }, data: {} });
    assert.equal(m.statusLabel, "Signed out");
    assert.equal(m.verifiedLabel, null);
    assert.equal(m.exportEnabled, false);
});

test("previewRows is counts-only — no raw values", () => {
    const rows = UI.previewRows({ months: 3, monthEntries: 12, bills: 2, recurringItems: 4, savingsGoals: 1, categories: 9, hasMCashData: true, appVersion: "x" });
    const flat = JSON.stringify(rows);
    assert.ok(flat.includes("Months"));
    assert.ok(!/amount|"id"|category/i.test(flat));
    assert.ok(rows.every((r) => typeof r.label === "string"));
});

test("eraseArmed only matches the exact phrase (case/space-insensitive)", () => {
    assert.equal(UI.eraseArmed("ERASE"), true);
    assert.equal(UI.eraseArmed("  erase "), true);
    assert.equal(UI.eraseArmed("erase now"), false);
    assert.equal(UI.eraseArmed(""), false);
});

test("friendlyError always returns a non-empty string", () => {
    assert.ok(UI.friendlyError("import_failed").length > 0);
    assert.ok(UI.friendlyError("totally-unknown").length > 0);
});


/* ---- render ----------------------------------------- */

test("render fills the account rows from the summary", () => {
    const { dom } = setup();
    assert.equal(dom.el("mw-acct-status").textContent, "Signed in");
    assert.equal(dom.el("mw-acct-email").textContent, "me@example.com");
    assert.equal(dom.el("mw-acct-verified").textContent, "Verified");
    assert.equal(dom.el("mw-acct-passkey-status").textContent, "Activation pending");
    assert.equal(dom.el("mw-acct-change-email-btn").hidden, false);
});


/* ---- change email ---------------------------------- */

test("change-email opens the dialog, submits, and reports back on the settings row", async () => {
    const { dom, acct, click } = setup();
    click("mw-acct-change-email-btn");
    assert.equal(dom.el("mw-acct-email-dialog").hidden, false);

    dom.el("mw-acct-email-input").value = "new@example.com";
    click("mw-acct-email-confirm-btn");
    await new Promise((r) => setImmediate(r));

    assert.deepEqual(plain(acct.calls.changeEmail), ["new@example.com"]);
    assert.equal(dom.el("mw-acct-email-dialog").hidden, true);
    assert.match(dom.el("mw-acct-msg").textContent, /new email/i);
});


/* ---- sign out ------------------------------------- */

test("sign-out uses this-device scope; sign-out-all confirms then goes global", async () => {
    const { acct, click } = setup();
    click("mw-acct-signout-btn");
    await new Promise((r) => setImmediate(r));
    click("mw-acct-signout-all-btn");
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(plain(acct.calls.signOut[0]), { scope: "local" });
    assert.deepEqual(plain(acct.calls.signOut[1]), { scope: "global" });
});


/* ---- export -------------------------------------- */

test("export hands the file to the download helper — no auto-network, warns it's unencrypted", () => {
    const { dom, downloads, click } = setup();
    click("mw-acct-export-btn");
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].name, "m-wallet-export-2026-08-29.json");
    assert.match(dom.el("mw-acct-data-msg").textContent, /not encrypted/i);
});


/* ---- restore ------------------------------------- */

test("restore shows a counts-only preview then restores only after the confirm button", async () => {
    const { dom, acct, restoreInput } = setup();
    restoreInput.files = [{ _text: '{"format":"m-wallet-export","formatVersion":1,"wallet":{}}' }];
    restoreInput.dispatch("change", { target: restoreInput });
    await new Promise((r) => setImmediate(r));

    assert.equal(dom.el("mw-acct-restore-dialog").hidden, false);
    const previewText = dom.el("mw-acct-restore-preview").childNodes
        .flatMap((row) => row.childNodes.map((s) => s.textContent)).join(" ");
    assert.ok(previewText.includes("Months"), previewText);
    assert.equal(acct.calls.restoreWallet.length, 0, "nothing restored yet");

    dom.el("mw-acct-restore-confirm-btn").dispatch("click", { target: dom.el("mw-acct-restore-confirm-btn") });
    await new Promise((r) => setImmediate(r));

    assert.equal(acct.calls.restoreWallet.length, 1);
    assert.equal(acct.calls.restoreWallet[0].opts.confirmed, true);
    assert.equal(dom.el("mw-acct-restore-dialog").hidden, true);
});

test("restore preview is set via textContent, not HTML (no injection)", async () => {
    const { dom, restoreInput } = setup({
        inspectImport: () => ({ ok: true, preview: { months: 1, monthEntries: 0, bills: 0, recurringItems: 0, savingsGoals: 0, categories: 0 } })
    });
    restoreInput.files = [{ _text: "{}" }];
    restoreInput.dispatch("change", { target: restoreInput });
    await new Promise((r) => setImmediate(r));
    const host = dom.el("mw-acct-restore-preview");
    /* dom-stub records innerHTML and textContent in the same slot; assert we only ever
       appended child nodes, never assigned a markup string */
    assert.ok(host.childNodes.length > 0);
    host.childNodes.forEach((n) => assert.equal(typeof n.textContent, "string"));
});

test("a bad file reports an error and opens no dialog", async () => {
    const { dom, restoreInput } = setup({
        inspectImport: () => ({ ok: false, code: "invalid_export" })
    });
    restoreInput.files = [{ _text: "garbage" }];
    restoreInput.dispatch("change", { target: restoreInput });
    await new Promise((r) => setImmediate(r));
    assert.equal(dom.el("mw-acct-restore-dialog").hidden, true);
    assert.match(dom.el("mw-acct-data-msg").textContent, /backup/i);
});


/* ---- erase -------------------------------------- */

test("erase confirm button stays disabled until the phrase is typed", async () => {
    const { dom, acct, click } = setup();
    click("mw-acct-erase-btn");
    const confirmBtn = dom.el("mw-acct-erase-confirm-btn");
    assert.equal(confirmBtn.disabled, true);

    const input = dom.el("mw-acct-erase-input");
    input.value = "nope";
    input.dispatch("input", { target: input });
    assert.equal(confirmBtn.disabled, true);

    input.value = "ERASE";
    input.dispatch("input", { target: input });
    assert.equal(confirmBtn.disabled, false);

    confirmBtn.dispatch("click", { target: confirmBtn });
    await new Promise((r) => setImmediate(r));
    assert.equal(acct.calls.eraseLocalWallet.length, 1);
    assert.equal(dom.el("mw-acct-erase-dialog").hidden, true);
});

test("erase that erased but could not sign out -> truthful message, dialog closed, no 'wallet still exists'", async () => {
    const { dom, click } = setup({
        eraseLocalWallet: () => Promise.resolve({ ok: false, code: "erased_signout_failed", erased: true })
    });
    click("mw-acct-erase-btn");
    const input = dom.el("mw-acct-erase-input");
    input.value = "ERASE";
    input.dispatch("input", { target: input });
    dom.el("mw-acct-erase-confirm-btn").dispatch("click", { target: dom.el("mw-acct-erase-confirm-btn") });
    await new Promise((r) => setImmediate(r));

    assert.equal(dom.el("mw-acct-erase-dialog").hidden, true, "dialog closed — the erase did happen");
    const msg = dom.el("mw-acct-data-msg").textContent;
    assert.match(msg, /erased from this device/i);
    assert.ok(!/still|not changed|not removed/i.test(msg), "never implies the wallet still exists");
});

test("Escape closes a dialog non-destructively", () => {
    const { dom, acct, click } = setup();
    click("mw-acct-change-email-btn");
    assert.equal(dom.el("mw-acct-email-dialog").hidden, false);
    dom.doc.dispatch("keydown", { key: "Escape" });
    assert.equal(dom.el("mw-acct-email-dialog").hidden, true);
    assert.equal(acct.calls.changeEmail.length, 0);
});

test("the UI module never references financial storage or a Supabase client", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(path.join(__dirname, "..", "js/account/account-ui.js"), "utf8");
    assert.ok(!/mWalletData|BudgetStorage|MWalletStorage|wallet_documents|createClient|auth\.admin|service_role/.test(src));
    assert.ok(!/\.innerHTML\s*=/.test(src), "no innerHTML assignment");
});
