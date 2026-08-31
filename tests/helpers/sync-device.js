"use strict";

/* =========================================================
   BP8 test helper — a simulated M-Wallet "device".

   Each device is an isolated node:vm sandbox holding its own
   copy of the sync engine + its sibling modules, its own
   sync-state localStorage, and its own real js/storage.js
   financial engine (via StorageHarness). Dependencies the
   engine needs from the rest of the app (auth, BP4 ownership,
   BP5, the cloud store, online state) are injected through
   MWalletSync.configureForTest().

   Two devices for the same user share ONE FakeCloud table.
   ========================================================= */

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { StorageHarness } = require("./storage-harness.js");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const CODEC = read("js/cloud/cloud-financial-codec.js");
const PLANNER = read("js/sync/sync-planner.js");
const SYNC_STATE = read("js/sync/sync-state.js");
const SYNC_RELEASE = read("js/sync/sync-release.js");
const SYNC_ENGINE = read("js/sync/sync-engine.js");

function sha256(str) {
    return Promise.resolve(crypto.createHash("sha256").update(String(str)).digest("hex"));
}

class SyncDevice {
    constructor(options) {
        options = options || {};
        this.name = options.name || "device";
        this.cloud = options.cloud;                     /* a FakeCloud */
        this.userId = options.userId || "user-a";
        this.ownership = options.ownership || "owned";   /* BP4 status */
        this.online = options.online !== false;
        this.recoveryMode = options.recoveryMode === true;
        this.signedIn = options.signedIn !== false;
        this.configured = options.configured !== false;

        /* real financial engine + its own localStorage */
        this.harness = new StorageHarness(options.harnessOptions || {});
        if (options.preloadedData) { this.harness.preload(options.preloadedData); }

        /* sync-state gets its own separate localStorage map */
        this.syncStore = new Map(Object.entries(options.syncStateSeed || {}));
        const syncLocalStorage = {
            getItem: (k) => (this.syncStore.has(String(k)) ? this.syncStore.get(String(k)) : null),
            setItem: (k, v) => { this.syncStore.set(String(k), String(v)); },
            removeItem: (k) => { this.syncStore.delete(String(k)); }
        };

        this.appRefreshes = 0;
        this.firstRunResolves = 0;
        this.authSubscribers = [];
        this.migrationSubscribers = [];
        this._releaseEnabled = false;   /* flipped by enableRelease() */
        this.raceHook = null;

        const self = this;

        const sandbox = {
            window: {}, console,
            setTimeout: (fn) => { /* no real timers in tests */ return 0; },
            clearTimeout: () => {},
            Promise, JSON, Math, Date, Number, String, Object, Array, TextEncoder,
            crypto: { subtle: null }
        };
        sandbox.self = sandbox.window;
        /* opt the sandbox into the test env BEFORE sync-release.js loads so
           its (test-only) setOverride exists for the sync-release static test */
        sandbox.__MWALLET_TEST_ENV__ = true;
        sandbox.window.__MWALLET_TEST_ENV__ = true;
        sandbox.window.localStorage = syncLocalStorage;
        sandbox.localStorage = syncLocalStorage;

        vm.createContext(sandbox);
        vm.runInContext(CODEC, sandbox, { filename: "codec.js" });
        vm.runInContext(PLANNER, sandbox, { filename: "planner.js" });
        vm.runInContext(SYNC_STATE, sandbox, { filename: "sync-state.js" });
        vm.runInContext(SYNC_RELEASE, sandbox, { filename: "sync-release.js" });
        vm.runInContext(SYNC_ENGINE, sandbox, { filename: "sync-engine.js" });

        this.sandbox = sandbox;
        this.engine = sandbox.window.MWalletSync;
        this.release = sandbox.window.MWalletSyncRelease;
        this.syncState = sandbox.window.MWalletSyncState;
        this.codec = sandbox.window.MWalletCloudFinancialCodec;

        const authApi = {
            getState: () => ({
                configured: self.configured,
                status: self.signedIn ? "signed_in" : "signed_out",
                recoveryMode: self.recoveryMode,
                user: self.signedIn ? { id: self.userId, email: self.userId + "@example.com" } : null
            }),
            isAuthenticated: () => self.signedIn === true,
            subscribe: (fn) => { self.authSubscribers.push(fn); return () => {}; },
            _getClient: () => ({})
        };
        const migrationApi = {
            getStatus: () => self.ownership,
            getState: () => ({ status: self.ownership }),
            detectMeaningfulLocalData: () => self._detect(),
            subscribe: (fn) => { self.migrationSubscribers.push(fn); return () => {}; }
        };
        const firstRunApi = {
            _resolve: () => { self.firstRunResolves += 1; },
            getStatus: () => "inactive"
        };
        const appApi = { refresh: () => { self.appRefreshes += 1; } };

        /* PREFERRED test enablement: dependency injection. The engine reads a
           plain release stub — the real MWalletSyncRelease is never mutated. */
        const releaseStub = {
            isEnabled: () => self._releaseEnabled === true,
            getState: () => ({
                enabled: self._releaseEnabled === true,
                verificationPhase: "BP12",
                reason: self._releaseEnabled ? null : "live_security_verification_pending"
            })
        };

        this.engine.configureForTest({
            release: releaseStub,
            auth: authApi,
            migration: migrationApi,
            firstRun: firstRunApi,
            store: self.cloud,
            codec: sandbox.window.MWalletCloudFinancialCodec,
            planner: sandbox.window.MWalletSyncPlanner,
            syncState: sandbox.window.MWalletSyncState,
            storage: self.harness.storage,
            app: appApi,
            hash: sha256,
            now: () => new Date(1756000000000).toISOString(),
            isOnline: () => self.online === true
        });
    }

    enableRelease() { this._releaseEnabled = true; }
    disableRelease() { this._releaseEnabled = false; }

    /* inject a one-shot "the user edits during the sync request" callback */
    setRaceHook(fn) { this.engine._setRaceHook(fn); }

    _detect() {
        try {
            const raw = this.harness.localStorage.getItem("mWalletData");
            if (!raw) { return { readable: true, present: false, meaningful: false, signals: [] }; }
            const data = JSON.parse(raw);
            const signals = [];
            if ((data.income || []).length) { signals.push("income"); }
            if ((data.expenses || []).length) { signals.push("expenses"); }
            if ((data.savingsGoals || []).length) { signals.push("savings-goals"); }
            const acc = data.accounts || {};
            if (acc.checking && Number(acc.checking.balance)) { signals.push("checking-balance"); }
            if (acc.savings && Number(acc.savings.balance)) { signals.push("savings-balance"); }
            Object.keys(data.months || {}).forEach((mk) => {
                const m = data.months[mk] || {};
                ["bills", "paychecks", "expenses", "transactions", "savingsDeposits"].forEach((f) => {
                    if ((m[f] || []).length) { signals.push("month:" + f); }
                });
                if (Number(m.startingBalance)) { signals.push("month:startingBalance"); }
            });
            if (data.cash && data.cash.initialized === true) { signals.push("cash"); }
            return { readable: true, present: true, meaningful: signals.length > 0, signals };
        } catch (e) {
            return { readable: false, present: true, meaningful: null, signals: [] };
        }
    }

    /* --- data access --- */
    data() { return JSON.parse(this.harness.localStorage.getItem("mWalletData")); }
    setData(next) { this.harness.preload(next); }
    localEdit(mutator) {
        const d = this.harness.reload();
        mutator(d);
        this.harness.save(d);
    }
    syncMeta() {
        const raw = this.syncStore.get("mwallet.sync.state.v1");
        return raw ? JSON.parse(raw) : null;
    }

    /* --- engine actions --- */
    sync() { return Promise.resolve(this.engine.syncNow({ manual: true })); }
    bootstrap() { return Promise.resolve(this.engine.runBootstrap()); }
    state() { return this.engine.getState(); }
    conflicts() { return this.engine.getConflicts(); }
    resolve(type, key, choice) { return Promise.resolve(this.engine.resolveConflict(type, key, choice)); }

    teardown() {
        try { this.engine._teardownForTest(); } catch (e) {}
        try { this.harness.cleanup(); } catch (e) {}
    }
}

function defaultWallet(over) {
    return Object.assign({
        version: 5,
        migrations: { savingsAccountV5: true, categoriesV1: true, categoriesResolutionV1: true },
        settings: { currency: "USD", currencySymbol: "$", firstDayOfWeek: "sunday", categories: { version: 1, list: [] } },
        income: [], expenses: [], months: {}, savingsGoals: [], savingsTransfers: [],
        cash: { initialized: false, wallet: { denominations: {} }, savings: { denominations: {} }, history: [], settings: {} },
        accounts: { checking: { name: "Checking", balance: 0 }, savings: { name: "General Savings", balance: 0 } }
    }, over || {});
}

module.exports = { SyncDevice, defaultWallet, sha256 };
