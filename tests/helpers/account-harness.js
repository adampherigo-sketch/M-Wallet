"use strict";

/* =========================================================
   BP10 test helper — loads the real js/account/account-controls.js
   (and optionally account-ui.js) into a node:vm sandbox that
   already has the REAL js/storage.js engine (via StorageHarness)
   plus deterministic stand-ins for MWalletAuth, the BP4 owner
   record, BP5 first-run, BP6 walkthrough, and BP8 sync state.

   No real network, no real Supabase client, no real DOM.
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { StorageHarness, storageKey } = require("./storage-harness.js");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const CONTROLS_SRC = read("js/account/account-controls.js");
const UI_SRC = read("js/account/account-ui.js");

const OWNER_KEY = "mwallet.local.owner.v1";
const SETUP_KEY = "mwallet.setup.v1";
const DRAFT_KEY = "mwallet.setup.draft.v1";
const WT_RECORD_KEY = "mwallet.walkthrough.v1";
const WT_PROGRESS_KEY = "mwallet.walkthrough.progress.v1";
const SYNC_KEY = "mwallet.sync.state.v1";

function createAccountEnv(options) {
    options = options || {};

    const harnessOpts = { timestamp: options.timestamp || "2026-08-29T12:00:00.000Z" };
    if (Object.prototype.hasOwnProperty.call(options, "preloadedData")) {
        harnessOpts.preloadedData = options.preloadedData;
    }
    if (options.preloadedStorage) { harnessOpts.preloadedStorage = options.preloadedStorage; }
    const harness = new StorageHarness(harnessOpts);

    const ctx = harness.context;
    const ls = harness.localStorage;

    /* the account module reads window.localStorage; storage.js reads
       the bare localStorage — point both at the one MemoryStorage */
    ctx.window.localStorage = ls;
    if (!ctx.TextEncoder && typeof TextEncoder === "function") { ctx.TextEncoder = TextEncoder; }
    if (!ctx.structuredClone && typeof structuredClone === "function") { ctx.structuredClone = structuredClone; }
    ctx.setTimeout = setTimeout;
    ctx.clearTimeout = clearTimeout;

    /* ---- mutable auth facts ---- */
    const authFacts = Object.assign({
        configured: true,
        status: "signed_in",
        recoveryMode: false,
        user: { id: "owner-uuid-1", email: "owner@example.com", confirmed: true, isAnonymous: false }
    }, options.auth || {});

    const calls = {
        updateEmail: [],
        signOut: [],
        resetPassword: [],
        ensureOwnership: 0,
        firstRunResolve: 0,
        syncClear: 0,
        appRefresh: 0
    };

    const authResponses = Object.assign({
        updateEmail: { ok: true, verificationRequired: true, message: "Check your new email address to finish changing it." },
        signOut: { ok: true },
        resetPassword: { ok: true }
    }, options.authResponses || {});

    const authApi = {
        getState: () => ({
            configured: authFacts.configured,
            status: authFacts.status,
            recoveryMode: authFacts.recoveryMode,
            user: authFacts.user ? Object.assign({}, authFacts.user) : null
        }),
        isAuthenticated: () => authFacts.status === "signed_in",
        subscribe: (fn) => { authApi._sub = fn; return () => {}; },
        updateEmail: (email) => { calls.updateEmail.push(email); return Promise.resolve(resolve(authResponses.updateEmail)); },
        signOut: (opts) => { calls.signOut.push(opts || null); return Promise.resolve(resolve(authResponses.signOut)); },
        resetPassword: (email) => { calls.resetPassword.push(email); return Promise.resolve(resolve(authResponses.resetPassword)); }
    };
    function resolve(v) { return typeof v === "function" ? v() : v; }

    /* ---- BP4 owner record ---- */
    const migrationFacts = Object.assign({
        status: options.ownerStatus || "owned",
        matchesCurrentUser: options.ownerMatches !== false
    }, {});
    const migrationApi = {
        OWNER_KEY,
        getStatus: () => migrationFacts.status,
        getState: () => migrationFacts.status,
        getOwnership: () => ({
            present: migrationFacts.status !== "needs_claim",
            valid: migrationFacts.status === "owned" || migrationFacts.status === "fresh_claimed",
            matchesCurrentUser: migrationFacts.matchesCurrentUser === true
        }),
        ensureOwnership: () => {
            calls.ensureOwnership += 1;
            try { ls.setItem(OWNER_KEY, JSON.stringify({ schemaVersion: 1, ownerUserId: authFacts.user && authFacts.user.id, claimedAt: "t", source: "fresh" })); } catch (e) {}
            return { ok: true };
        }
    };

    /* ---- BP5 first-run ---- */
    const firstRunApi = {
        SETUP_KEY, DRAFT_KEY,
        _resolve: () => { calls.firstRunResolve += 1; }
    };

    /* ---- BP6 walkthrough ---- */
    const walkthroughApi = { RECORD_KEY: WT_RECORD_KEY, PROGRESS_KEY: WT_PROGRESS_KEY };

    /* ---- BP8 sync state ---- */
    const syncStateApi = {
        KEY: SYNC_KEY,
        clear: () => {
            calls.syncClear += 1;
            if (options.syncClearThrows) { throw new Error("sync clear failed"); }
            try { ls.removeItem(SYNC_KEY); } catch (e) {}
            return { ok: true };
        }
    };

    const syncRelease = { isEnabled: () => options.syncReleaseEnabled === true };
    const passkeyRelease = { isEnabled: () => options.passkeyReleaseEnabled === true };
    const passkeysApi = { getState: () => ({ registeredCount: options.passkeyCount != null ? options.passkeyCount : null }) };

    const appApi = { refresh: () => { calls.appRefresh += 1; } };

    Object.assign(ctx.window, {
        MWalletAuth: authApi,
        MWalletLocalMigration: migrationApi,
        MWalletFirstRun: firstRunApi,
        MWalletWalkthrough: walkthroughApi,
        MWalletSyncState: syncStateApi,
        MWalletSyncRelease: syncRelease,
        MWalletPasskeyRelease: passkeyRelease,
        MWalletPasskeys: passkeysApi,
        MWalletVersion: { version: options.appVersion || "0.9.0-beta.9" },
        BudgetApp: appApi
    });

    vm.runInContext(CONTROLS_SRC, ctx, { filename: "account-controls.js" });
    if (options.withUi) { vm.runInContext(UI_SRC, ctx, { filename: "account-ui.js" }); }

    const A = ctx.window.MWalletAccount;

    /* let a test make specific keys impossible to remove (a
       selectively-failing localStorage.removeItem) */
    const realRemove = ls.removeItem.bind(ls);
    const blocked = new Set();
    ls.removeItem = (key) => { if (blocked.has(String(key))) { return; } return realRemove(key); };

    return {
        harness, ctx, ls, A,
        authFacts, migrationFacts, calls,
        storageKey,
        keys: { OWNER_KEY, SETUP_KEY, DRAFT_KEY, WT_RECORD_KEY, WT_PROGRESS_KEY, SYNC_KEY },
        raw(key) { return ls.getItem(key || storageKey); },
        rawWallet() { const v = ls.getItem(storageKey); return v == null ? null : JSON.parse(v); },
        setItem(key, value) { ls.setItem(key, typeof value === "string" ? value : JSON.stringify(value)); },
        snapshot() { return ls.snapshot(); },
        setAuth(patch) { Object.assign(authFacts, patch); },
        setOwnerStatus(s) { migrationFacts.status = s; },
        blockRemoval(key) { blocked.add(String(key)); },
        unblockRemoval(key) { blocked.delete(String(key)); }
    };
}

/* a valid BP10 export wrapper around whatever wallet object is given */
function makeExport(wallet, over) {
    return JSON.stringify(Object.assign({
        format: "m-wallet-export",
        formatVersion: 1,
        createdAt: "2026-08-01T00:00:00.000Z",
        appVersion: "0.9.0-beta.9",
        wallet: wallet
    }, over || {}));
}

module.exports = { createAccountEnv, makeExport, CONTROLS_SRC, UI_SRC };
