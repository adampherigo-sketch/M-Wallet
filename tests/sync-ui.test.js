"use strict";

/* =========================================================
   BP8 — SYNC UI

   1. sync-ui.js  — the #mw-sync-bootstrap gate + the
      #mw-sync-conflicts review overlay (keep / use-cloud /
      decide-later, confirmation, accessibility).
   2. settings-ui.js renderSyncStatus — the Cloud Sync row:
      disabled says "activation pending", Sync Now hidden;
      enabled shows the real statuses.

   No real network, no real Supabase.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Doc } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");
const SYNC_UI_SRC = fs.readFileSync(path.join(ROOT, "js/sync/sync-ui.js"), "utf8");
const SETTINGS_SRC = fs.readFileSync(path.join(ROOT, "js/settings-ui.js"), "utf8");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");


/* ---- build the sync-ui DOM the module expects ---------------------- */

function buildSyncDom() {
    const doc = new Doc();
    const app = doc.createElement("div");
    app.setAttribute("class", "app");
    doc.body.appendChild(app);

    const authGate = doc.createElement("div");
    authGate.setAttribute("id", "mw-auth-gate");
    authGate.hidden = true;
    doc.body.appendChild(authGate);

    // bootstrap gate
    const boot = doc.createElement("div");
    boot.setAttribute("id", "mw-sync-bootstrap");
    boot.setAttribute("role", "dialog");
    boot.setAttribute("aria-modal", "true");
    boot.hidden = true;
    doc.body.appendChild(boot);
    const bt = doc.createElement("h1"); bt.setAttribute("id", "mw-sync-bootstrap-title"); bt.setAttribute("tabindex", "-1"); boot.appendChild(bt);
    const bb = doc.createElement("p"); bb.setAttribute("id", "mw-sync-bootstrap-body"); bb.setAttribute("aria-live", "polite"); boot.appendChild(bb);
    const retry = doc.createElement("button"); retry.setAttribute("id", "mw-sync-bootstrap-retry"); retry.setAttribute("data-sync-action", "bootstrap-retry"); retry.hidden = true; boot.appendChild(retry);
    const offline = doc.createElement("button"); offline.setAttribute("id", "mw-sync-bootstrap-offline"); offline.setAttribute("data-sync-action", "bootstrap-offline"); offline.hidden = true; boot.appendChild(offline);

    // conflict overlay
    const conf = doc.createElement("div");
    conf.setAttribute("id", "mw-sync-conflicts");
    conf.setAttribute("role", "dialog");
    conf.setAttribute("aria-modal", "true");
    conf.setAttribute("aria-labelledby", "mw-sync-conflicts-title");
    conf.setAttribute("aria-describedby", "mw-sync-conflicts-desc");
    conf.hidden = true;
    doc.body.appendChild(conf);
    const backdrop = doc.createElement("div"); backdrop.setAttribute("data-sync-action", "conflicts-close"); conf.appendChild(backdrop);
    const card = doc.createElement("div"); conf.appendChild(card);
    const ct = doc.createElement("h2"); ct.setAttribute("id", "mw-sync-conflicts-title"); ct.setAttribute("tabindex", "-1"); card.appendChild(ct);
    const cd = doc.createElement("p"); cd.setAttribute("id", "mw-sync-conflicts-desc"); card.appendChild(cd);
    const empty = doc.createElement("p"); empty.setAttribute("id", "mw-sync-conflicts-empty"); empty.hidden = true; card.appendChild(empty);
    const listEl = doc.createElement("ul"); listEl.setAttribute("id", "mw-sync-conflicts-list"); card.appendChild(listEl);
    const closeBtn = doc.createElement("button"); closeBtn.setAttribute("data-sync-action", "conflicts-close"); card.appendChild(closeBtn);

    return { doc, boot, conf, listEl, empty, closeBtn, title: ct };
}

function makeSyncStub(over) {
    const calls = [];
    return Object.assign({
        _calls: calls,
        state: { releaseEnabled: false, status: "disabled", pendingCount: 0, conflictCount: 0, lastSuccessAt: null, bootstrapStatus: "idle" },
        conflicts: [],
        getState() { return this.state; },
        subscribe(fn) { this._notify = fn; return () => {}; },
        getConflicts() { return this.conflicts.slice(); },
        resolveConflict(type, key, choice) { calls.push({ op: "resolve", type, key, choice }); return Promise.resolve({ ok: true }); },
        bootstrapRetry() { calls.push({ op: "retry" }); return Promise.resolve({ status: "empty" }); },
        bootstrapContinueOffline() { calls.push({ op: "offline" }); return Promise.resolve({ status: "deferred" }); }
    }, over || {});
}

function loadSyncUi(dom, syncStub, authUiStub, confirmImpl) {
    const sandbox = {
        window: {}, console,
        document: dom.doc,
        confirm: confirmImpl || (() => true)
    };
    sandbox.self = sandbox.window;
    sandbox.window.MWalletSync = syncStub;
    sandbox.window.MWalletAuthUI = authUiStub || { setBootstrapScreenActive() {}, renderState() {} };
    sandbox.window.confirm = sandbox.confirm;
    vm.createContext(sandbox);
    vm.runInContext(SYNC_UI_SRC, sandbox, { filename: "sync-ui.js" });
    return sandbox.window.MWalletSyncUI;
}


/* ================================================================
   BOOTSTRAP GATE
   ================================================================ */

test("bootstrap gate: hidden for a non-bootstrap status; shows 'checking' copy while checking", () => {
    const dom = buildSyncDom();
    const stub = makeSyncStub();
    const ui = loadSyncUi(dom, stub);

    stub.state = { releaseEnabled: true, status: "syncing", bootstrapStatus: "idle" };
    ui.refresh();
    assert.equal(dom.boot.hidden, true);

    stub.state = { releaseEnabled: true, status: "syncing", bootstrapStatus: "checking" };
    ui.refresh();
    assert.equal(dom.boot.hidden, false);
    assert.match(dom.doc.getElementById("mw-sync-bootstrap-title").textContent, /Checking your cloud wallet/i);
    assert.equal(dom.doc.getElementById("mw-sync-bootstrap-retry").hidden, true, "no retry while still checking");
});

test("bootstrap gate: 'needs_decision' shows Retry + Continue Offline, wired to the engine", async () => {
    const dom = buildSyncDom();
    const stub = makeSyncStub();
    const ui = loadSyncUi(dom, stub);

    stub.state = { releaseEnabled: true, status: "syncing", bootstrapStatus: "needs_decision" };
    ui.refresh();
    assert.equal(dom.boot.hidden, false);
    const retry = dom.doc.getElementById("mw-sync-bootstrap-retry");
    const offline = dom.doc.getElementById("mw-sync-bootstrap-offline");
    assert.equal(retry.hidden, false);
    assert.equal(offline.hidden, false);
    assert.match(dom.doc.getElementById("mw-sync-bootstrap-body").textContent, /Continuing offline|reconcile/i);

    retry.dispatch("click", { target: retry });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(stub._calls.filter((c) => c.op === "retry").length, 1);

    offline.dispatch("click", { target: offline });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(stub._calls.filter((c) => c.op === "offline").length, 1);
});

test("bootstrap gate coordinates with auth-ui (setBootstrapScreenActive) and never syncs on its own", () => {
    const dom = buildSyncDom();
    const stub = makeSyncStub();
    let active = null;
    const authUi = { setBootstrapScreenActive(v) { active = v; }, renderState() {} };
    const ui = loadSyncUi(dom, stub, authUi);

    stub.state = { releaseEnabled: true, status: "syncing", bootstrapStatus: "checking" };
    ui.refresh();
    assert.equal(active, true, "screen active while presenting");

    stub.state = { releaseEnabled: true, status: "idle", bootstrapStatus: "ready" };
    ui.refresh();
    assert.equal(active, false, "released once the gate is gone");
});


/* ================================================================
   CONFLICT REVIEW OVERLAY
   ================================================================ */

function withConflicts(list) {
    const dom = buildSyncDom();
    const stub = makeSyncStub({ conflicts: list });
    const confirmCalls = [];
    const ui = loadSyncUi(dom, stub, null, (msg) => { confirmCalls.push(msg); return confirmCalls._answer !== false; });
    return { dom, stub, ui, confirmCalls };
}

const SAMPLE = [
    { documentType: "month", documentKey: "2026-08", title: "August 2026 budget", reason: "both_changed", baseRevision: 1, remoteRevision: 2 },
    { documentType: "cash", documentKey: "primary", title: "M-Cash", reason: "revision_conflict", baseRevision: 1, remoteRevision: 3 },
    { documentType: "settings", documentKey: "primary", title: "Settings", reason: "both_changed", baseRevision: 2, remoteRevision: 4 }
];

test("conflict overlay: human labels, no raw JSON, no owner id, no payload", () => {
    const { dom, ui } = withConflicts(SAMPLE);
    ui.openConflicts();

    assert.equal(dom.conf.hidden, false);
    const text = dom.listEl._descendants().map((n) => n.textContent).join(" | ");
    assert.match(text, /August 2026 budget/);
    assert.match(text, /M-Cash/);
    assert.match(text, /Settings/);
    assert.ok(!/[{}\[\]]/.test(text), "no raw JSON braces/brackets");
    assert.ok(!/user-|ownerUserId|[0-9a-f]{8}-[0-9a-f]{4}/.test(text), "no owner id");
    assert.ok(!/balance|amount|payload|transactions/i.test(text), "no financial payload words");
});

test("conflict overlay: empty state when there are no conflicts", () => {
    const { dom, ui } = withConflicts([]);
    ui.openConflicts();
    assert.equal(dom.empty.hidden, false);
    assert.equal(dom.listEl.children.length, 0);
});

test("Keep this device: one explicit click -> exactly one keep-local resolution call", async () => {
    const { dom, stub, ui } = withConflicts(SAMPLE.slice(0, 1));
    ui.openConflicts();
    const keep = dom.listEl._descendants().find((n) => n.getAttribute("data-sync-action") === "resolve-keep");
    keep.dispatch("click", { target: keep });
    await Promise.resolve(); await Promise.resolve();
    const calls = stub._calls.filter((c) => c.op === "resolve");
    assert.equal(calls.length, 1);
    assert.deepEqual({ t: calls[0].type, k: calls[0].key, c: calls[0].choice }, { t: "month", k: "2026-08", c: "keep-local" });
});

test("Use cloud version: requires confirmation; cancel = zero action; confirm = one use-cloud call", async () => {
    const { dom, stub, ui, confirmCalls } = withConflicts(SAMPLE.slice(0, 1));
    ui.openConflicts();
    const useCloud = dom.listEl._descendants().find((n) => n.getAttribute("data-sync-action") === "resolve-cloud");

    /* cancel */
    confirmCalls._answer = false;
    useCloud.dispatch("click", { target: useCloud });
    await Promise.resolve(); await Promise.resolve();
    assert.equal(stub._calls.filter((c) => c.op === "resolve").length, 0, "cancel does nothing");
    assert.equal(confirmCalls.length, 1);
    assert.match(confirmCalls[0], /replace|current cloud version/i, "warning mentions the local copy is replaced");

    /* confirm */
    confirmCalls._answer = true;
    useCloud.dispatch("click", { target: useCloud });
    await Promise.resolve(); await Promise.resolve();
    const calls = stub._calls.filter((c) => c.op === "resolve");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].choice, "use-cloud");
});

test("Decide later: leaves the conflict unresolved, changes no data, keeps the overlay usable", async () => {
    const { dom, stub, ui } = withConflicts(SAMPLE.slice(0, 1));
    ui.openConflicts();
    const later = dom.listEl._descendants().find((n) => n.getAttribute("data-sync-action") === "resolve-later");
    later.dispatch("click", { target: later });
    await Promise.resolve();
    assert.equal(stub._calls.filter((c) => c.op === "resolve").length, 0);
    assert.equal(dom.conf.hidden, false, "overlay stays open / reopenable");
});

test("Close + Escape are non-destructive (no resolution call, overlay hides)", async () => {
    const { dom, stub, ui } = withConflicts(SAMPLE);
    ui.openConflicts();

    dom.closeBtn.dispatch("click", { target: dom.closeBtn });
    assert.equal(dom.conf.hidden, true);
    assert.equal(stub._calls.length, 0);

    ui.openConflicts();
    assert.equal(dom.conf.hidden, false);
    dom.doc.dispatch("keydown", { key: "Escape" });
    assert.equal(dom.conf.hidden, true, "Escape closes the review");
    assert.equal(stub._calls.length, 0, "Escape resolved nothing");
});

test("accessibility: dialog semantics + focus + describedby + keyboard-reachable buttons", () => {
    const { dom, ui } = withConflicts(SAMPLE.slice(0, 1));
    ui.openConflicts();

    assert.equal(dom.conf.getAttribute("role"), "dialog");
    assert.equal(dom.conf.getAttribute("aria-modal"), "true");
    assert.equal(dom.conf.getAttribute("aria-labelledby"), "mw-sync-conflicts-title");
    assert.equal(dom.conf.getAttribute("aria-describedby"), "mw-sync-conflicts-desc");
    assert.equal(dom.conf.getAttribute("aria-hidden"), "false");
    assert.equal(dom.doc.activeElement, dom.title, "focus moved into the dialog on open");

    /* every RESOLUTION control is a real, keyboard-reachable <button>
       (the backdrop div is only a click-to-dismiss convenience) */
    const resolveEls = dom.conf._descendants().filter((n) => {
        const a = n.getAttribute("data-sync-action");
        return a === "resolve-keep" || a === "resolve-cloud" || a === "resolve-later";
    });
    assert.equal(resolveEls.length, 3);
    resolveEls.forEach((el) => assert.equal(el.tagName, "BUTTON"));
    /* at least one keyboard-reachable Close button exists */
    const closeButtons = dom.conf._descendants().filter((n) =>
        n.tagName === "BUTTON" && n.getAttribute("data-sync-action") === "conflicts-close");
    assert.ok(closeButtons.length >= 1);
});

test("index.html: conflict + bootstrap markup carries full dialog semantics, and sync.css has reduced-motion + 44px", () => {
    assert.match(INDEX_HTML, /id="mw-sync-conflicts"[\s\S]{0,220}role="dialog"[\s\S]{0,120}aria-modal="true"/);
    assert.match(INDEX_HTML, /id="mw-sync-conflicts"[\s\S]{0,260}aria-describedby="mw-sync-conflicts-desc"/);
    assert.match(INDEX_HTML, /id="mw-sync-bootstrap"[\s\S]{0,220}role="dialog"/);
    assert.match(INDEX_HTML, /id="settings-sync-status"[^>]*aria-live="polite"/);
    const css = fs.readFileSync(path.join(ROOT, "css/sync.css"), "utf8");
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /min-height:\s*44px/);
});


/* ================================================================
   SETTINGS "CLOUD SYNC" ROW
   ================================================================ */

function loadSettingsWithSyncRow(syncState, authState, syncExtra) {
    const els = {};
    const cl = () => ({ add() {}, remove() {}, toggle() {}, contains() { return false; } });
    const get = (id) => (els[id] || (els[id] = {
        id, hidden: false, disabled: false, textContent: "", className: "",
        classList: cl(), style: {},
        getAttribute: () => null, setAttribute: () => {}, removeAttribute: () => {},
        addEventListener: () => {}, closest: () => null, focus: () => {}
    }));
    ["settings-page", "settings-sync-panel", "settings-sync-status", "settings-sync-note",
     "settings-sync-now-btn", "settings-sync-review-btn", "settings-status"].forEach(get);

    const fakeDoc = {
        readyState: "loading",          /* -> settings-ui.js defers init, never runs it */
        addEventListener() {},
        getElementById: (id) => els[id] || null,
        querySelector: () => null
    };
    const sandbox = { window: {}, console, document: fakeDoc };
    sandbox.self = sandbox.window;
    sandbox.window.MWalletSync = Object.assign({ getState: () => syncState }, syncExtra || {});
    sandbox.window.MWalletAuth = { getState: () => authState };
    vm.createContext(sandbox);
    vm.runInContext(SETTINGS_SRC, sandbox, { filename: "settings-ui.js" });
    return { S: sandbox.window.SettingsUI, els, sandbox };
}

const SIGNED_IN = { status: "signed_in", configured: true, user: { email: "a@b.com" } };

test("Settings row — RELEASE DISABLED: says activation pending, Sync Now + Review hidden", () => {
    const { S, els } = loadSettingsWithSyncRow(
        { releaseEnabled: false, status: "disabled", pendingCount: 0, conflictCount: 0 },
        SIGNED_IN
    );
    S.renderSyncStatus(SIGNED_IN);
    assert.equal(els["settings-sync-panel"].hidden, false);
    assert.match(els["settings-sync-status"].textContent, /activation pending|verification/i);
    assert.match(els["settings-sync-note"].textContent, /remains local on this device/i);
    assert.ok(!/Backed up/i.test(els["settings-sync-status"].textContent));
    assert.equal(els["settings-sync-now-btn"].hidden, true, "Sync Now hidden while disabled");
    assert.equal(els["settings-sync-review-btn"].hidden, true);
});

test("Settings row — RELEASE DISABLED: onSyncNow triggers NO cloud synchronization", () => {
    let syncNowCalled = 0;
    const { S } = loadSettingsWithSyncRow(
        { releaseEnabled: false, status: "disabled" }, SIGNED_IN,
        { syncNow: () => { syncNowCalled += 1; return Promise.resolve({}); } }
    );
    S.onSyncNow();
    assert.equal(syncNowCalled, 0, "a disabled release must not run a sync cycle even if the method exists");
});

test("Settings row — ENABLED: onSyncNow DOES run one cycle", () => {
    let syncNowCalled = 0;
    const { S } = loadSettingsWithSyncRow(
        { releaseEnabled: true, status: "idle" }, SIGNED_IN,
        { syncNow: () => { syncNowCalled += 1; return Promise.resolve({ status: "idle" }); } }
    );
    S.onSyncNow();
    assert.equal(syncNowCalled, 1);
});

test("Settings row — ENABLED test mode: each engine status maps to a clear label", () => {
    const cases = [
        [{ releaseEnabled: true, status: "idle", lastSuccessAt: "2026-08-31T00:00:00Z" }, /Up to date/i],
        [{ releaseEnabled: true, status: "syncing" }, /Syncing/i],
        [{ releaseEnabled: true, status: "offline" }, /Offline — changes saved/i],
        [{ releaseEnabled: true, status: "pending", pendingCount: 3 }, /3 changes waiting/i],
        [{ releaseEnabled: true, status: "conflicts", conflictCount: 2 }, /Needs attention — 2 conflicts/i],
        [{ releaseEnabled: true, status: "conflicts", conflictCount: 1 }, /1 conflict\b/i]
    ];
    for (const [state, re] of cases) {
        const { S, els } = loadSettingsWithSyncRow(state, SIGNED_IN);
        S.renderSyncStatus(SIGNED_IN);
        assert.match(els["settings-sync-status"].textContent, re, JSON.stringify(state));
    }
});

test("Settings row — ENABLED + conflicts: Sync Now shown, Review shown", () => {
    const { S, els } = loadSettingsWithSyncRow(
        { releaseEnabled: true, status: "conflicts", conflictCount: 1, pendingCount: 0 }, SIGNED_IN
    );
    S.renderSyncStatus(SIGNED_IN);
    assert.equal(els["settings-sync-now-btn"].hidden, false);
    assert.equal(els["settings-sync-review-btn"].hidden, false);
});

test("Settings row — signed out: the whole panel is hidden", () => {
    const { S, els } = loadSettingsWithSyncRow(
        { releaseEnabled: true, status: "idle" },
        { status: "signed_out", configured: true }
    );
    S.renderSyncStatus({ status: "signed_out", configured: true });
    assert.equal(els["settings-sync-panel"].hidden, true);
});
