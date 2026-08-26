"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const productionStoragePath = path.resolve(__dirname, "../../js/storage.js");
const cashStoragePath = path.resolve(__dirname, "../../js/m-cash/cash-storage.js");
const storageKey = "mWalletData";

class MemoryStorage {
    constructor(initialEntries = {}, options = {}) {
        this.entries = new Map();
        this.failWrites = Boolean(options.failWrites);

        Object.entries(initialEntries).forEach(([key, value]) => {
            this.entries.set(String(key), String(value));
        });
    }

    get length() {
        return this.entries.size;
    }

    clear() {
        this.entries.clear();
    }

    getItem(key) {
        const value = this.entries.get(String(key));
        return value === undefined ? null : value;
    }

    key(index) {
        return Array.from(this.entries.keys())[index] ?? null;
    }

    removeItem(key) {
        this.entries.delete(String(key));
    }

    setItem(key, value) {
        if (this.failWrites) {
            throw new Error("M-Wallet test localStorage write failed.");
        }

        this.entries.set(String(key), String(value));
    }

    snapshot() {
        return Object.fromEntries(this.entries);
    }
}

function fixedDateClass(timestamp) {
    const fixedTimestamp = new Date(timestamp).getTime();

    if (!Number.isFinite(fixedTimestamp)) {
        throw new TypeError("deterministic timestamp must be a valid date");
    }

    return class DeterministicDate extends Date {
        constructor(...args) {
            super(args.length === 0 ? fixedTimestamp : args[0], ...args.slice(1));
        }

        static now() {
            return fixedTimestamp;
        }
    };
}

class StorageHarness {
    constructor(options = {}) {
        this.options = options;
        this.idCounter = 0;
        this.localStorage = new MemoryStorage(options.preloadedStorage, {
            failWrites: options.failWrites
        });
        this.timestamp = options.timestamp || "2026-08-14T00:00:00.000Z";
        this.context = null;
        this.storage = null;
        this.previousGlobals = {};

        if (Object.prototype.hasOwnProperty.call(options, "preloadedData")) {
            this.localStorage.setItem(storageKey, JSON.stringify(options.preloadedData));
        }

        this.loadProductionStorage();
    }

    loadProductionStorage() {
        const deterministicIds = this.options.idFactory || ((prefix) => {
            this.idCounter += 1;
            return `${prefix}-test-${String(this.idCounter).padStart(4, "0")}`;
        });
        const crypto = {
            randomUUID: () => deterministicIds("uuid")
        };
        const document = {
            getElementById: () => null
        };
        const sandbox = {
            console,
            Date: fixedDateClass(this.timestamp),
            document,
            localStorage: this.localStorage,
            window: { crypto },
            setTimeout,
            clearTimeout
        };

        sandbox.window.window = sandbox.window;
        this.context = vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(cashStoragePath, "utf8"), this.context, {
            filename: cashStoragePath
        });
        vm.runInContext(fs.readFileSync(productionStoragePath, "utf8"), this.context, {
            filename: productionStoragePath
        });
        this.storage = this.context.window.BudgetStorage;

        if (!this.storage) {
            throw new Error("js/storage.js did not expose window.BudgetStorage.");
        }

        this.storage.generateId = deterministicIds;
        this.storage.now = () => new Date(this.timestamp).toISOString();
    }

    get rawData() {
        const raw = this.localStorage.getItem(storageKey);
        return raw === null ? null : JSON.parse(raw);
    }

    get rawStorage() {
        return this.localStorage.snapshot();
    }

    setFailWrites(value) {
        this.localStorage.failWrites = Boolean(value);
    }

    preload(value) {
        this.localStorage.setItem(storageKey, typeof value === "string" ? value : JSON.stringify(value));
    }

    reload() {
        return this.storage.load();
    }

    save(data) {
        return this.storage.save(data);
    }

    reset() {
        this.localStorage.clear();
        this.localStorage.failWrites = false;
        return this.reload();
    }

    cleanup() {
        this.context = null;
        this.storage = null;
        this.localStorage.clear();
    }
}

module.exports = {
    MemoryStorage,
    StorageHarness,
    productionStoragePath,
    storageKey
};
