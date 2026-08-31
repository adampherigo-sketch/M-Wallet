"use strict";

/* =========================================================
   BP2 — AUTHENTICATION ARCHITECTURE TESTS

   Loads the real js/auth/*.js modules into a node:vm sandbox
   with mocked browser globals and a stubbed Supabase library.
   No network, no real Supabase project.

   Covers the BP2.16 scenarios:
     - unconfigured / configured / error state model
     - no library load while unconfigured
     - idempotent initialize()
     - session restoration
     - exactly one auth-event listener
     - offline startup + single reconnect reconciliation
     - library / network failure -> safe error, no data loss
     - signOut safe in every state
     - subscribe / unsubscribe
     - diagnostics + state never expose tokens
     - service_role key refused
     - BP3 extension points fail loudly
   Plus static checks on index.html / service-worker / .gitignore.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

const AUTH_FILES = [
    "js/auth/auth-config.js",
    "js/auth/auth-client.js",
    "js/auth/auth.js"
];

function b64url(obj) {
    return Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/=+$/, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

/* current-style publishable key */
const PUBLISHABLE_KEY = "sb_publishable_" + "PkExampleABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/* current-style secret key (server-only, must be refused) */
const SECRET_KEY = "sb_secret_" + "SkExampleABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/* legacy browser-safe key: JWT, role "anon" */
const ANON_KEY =
    b64url({ alg: "HS256", typ: "JWT" }) + "." +
    b64url({ role: "anon", iss: "supabase", ref: "demoref" }) + "." +
    "signature_aaaaaaaaaaaaaaaaaaaa";

/* legacy privileged key: JWT, role "service_role" (must be refused) */
const SERVICE_ROLE_KEY =
    b64url({ alg: "HS256", typ: "JWT" }) + "." +
    b64url({ role: "service_role", iss: "supabase", ref: "demoref" }) + "." +
    "signature_aaaaaaaaaaaaaaaaaaaa";

/* a garbage / unrecognized key */
const UNKNOWN_KEY = "not-a-real-supabase-key-format-at-all";

const VALID_CONFIG = {
    supabaseUrl: "https://demoref.supabase.co",
    supabaseKey: PUBLISHABLE_KEY
};

const LEGACY_ANON_CONFIG = {
    supabaseUrl: "https://demoref.supabase.co",
    supabaseKey: ANON_KEY
};

const SECRET_ACCESS_TOKEN = "SECRET_ACCESS_TOKEN_do_not_leak";
const SECRET_REFRESH_TOKEN = "SECRET_REFRESH_TOKEN_do_not_leak";

function makeSession() {
    return {
        access_token: SECRET_ACCESS_TOKEN,
        refresh_token: SECRET_REFRESH_TOKEN,
        token_type: "bearer",
        expires_at: 9999999999,
        user: { id: "user-123", email: "tester@example.com" }
    };
}

function flush(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms || 15));
}

/* objects created inside the vm realm have a different
   Object.prototype, so bring them back to this realm before
   a deepStrictEqual comparison */
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

/* Build a fresh isolated auth environment. */
function makeAuthEnv(options) {
    options = options || {};

    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;

    /* capture every console line so tests can assert nothing
       sensitive is ever logged */
    const consoleLines = [];
    const record = (level) => (...args) =>
        consoleLines.push(level + ": " + args.map((a) => {
            try { return typeof a === "string" ? a : JSON.stringify(a); }
            catch (e) { return String(a); }
        }).join(" "));
    sandbox.console = {
        info: record("info"), warn: record("warn"),
        error: record("error"), log: record("log"), debug: record("debug")
    };

    sandbox.atob = (s) => Buffer.from(s, "base64").toString("binary");
    sandbox.Buffer = Buffer;
    sandbox.setTimeout = setTimeout;
    sandbox.navigator = { onLine: options.online === false ? false : true };

    /* optional in-memory localStorage (for config-override tests) */
    if (options.localStorage !== false) {
        const store = Object.assign({}, options.localStorageSeed || {});
        sandbox.localStorage = {
            getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; },
            _store: store
        };
    }

    const connectivity = {};
    sandbox.addEventListener = (type, fn) => {
        (connectivity[type] = connectivity[type] || []).push(fn);
    };
    sandbox.removeEventListener = () => {};

    const libState = {
        appendChildCalls: 0,
        createClientCalls: 0,
        listenerCount: 0,
        lastCb: null,
        signOutCalls: 0,
        session: options.session || null,
        clientOpts: null
    };

    const mockLib = {
        createClient(url, key, opts) {
            libState.createClientCalls += 1;
            libState.clientOpts = opts;
            libState.clientUrl = url;
            libState.clientKey = key;
            return {
                auth: {
                    getSession() {
                        if (options.getSessionRejects) {
                            return Promise.reject(new Error("network unreachable"));
                        }
                        return Promise.resolve({
                            data: { session: libState.session },
                            error: null
                        });
                    },
                    onAuthStateChange(cb) {
                        libState.listenerCount += 1;
                        libState.lastCb = cb;
                        return {
                            data: {
                                subscription: {
                                    unsubscribe() { libState.listenerCount -= 1; }
                                }
                            }
                        };
                    },
                    signOut() {
                        libState.signOutCalls += 1;
                        if (options.signOutRejects) {
                            return Promise.reject(new Error("sign-out failed"));
                        }
                        libState.session = null;
                        return Promise.resolve({ error: null });
                    }
                }
            };
        }
    };

    sandbox.document = {
        readyState: "loading",
        head: {
            appendChild(node) {
                libState.appendChildCalls += 1;
                Promise.resolve().then(() => {
                    if (options.libLoadFails) {
                        if (typeof node.onerror === "function") { node.onerror(); }
                    } else {
                        sandbox.supabase = mockLib;
                        if (typeof node.onload === "function") { node.onload(); }
                    }
                });
            }
        },
        createElement() { return {}; },
        addEventListener() {}
    };

    if (options.preloadLib) {
        sandbox.supabase = mockLib;
    }
    if (options.config) {
        sandbox.MWalletAuthConfig = options.config;
    }

    vm.createContext(sandbox);
    for (const file of AUTH_FILES) {
        const code = fs.readFileSync(path.join(ROOT, file), "utf8");
        vm.runInContext(code, sandbox, { filename: file });
    }

    return {
        sandbox,
        auth: sandbox.MWalletAuth,
        resolved: sandbox.MWalletAuthConfigResolved,
        client: sandbox.MWalletAuthClient,
        libState,
        consoleLines,
        consoleText() { return consoleLines.join("\n"); },
        fireOnline() { (connectivity.online || []).forEach((fn) => fn()); },
        fireOffline() { (connectivity.offline || []).forEach((fn) => fn()); },
        fireAuthEvent(evt, session) {
            if (libState.lastCb) { libState.lastCb(evt, session); }
        }
    };
}


/* ---- module wiring ---------------------------------------- */

test("auth modules expose the documented globals", () => {
    const env = makeAuthEnv();
    assert.equal(typeof env.auth, "object");
    assert.equal(typeof env.auth.initialize, "function");
    assert.equal(typeof env.auth.getState, "function");
    assert.equal(typeof env.auth.subscribe, "function");
    assert.equal(typeof env.auth.signOut, "function");
    assert.equal(typeof env.client.createClient, "function");
    assert.equal(env.client.vendorVersion, "2.112.4");
    assert.equal(typeof env.resolved.isConfigured, "boolean");
});

test("state model constants match the spec", () => {
    const env = makeAuthEnv();
    assert.deepEqual(plain(env.auth.STATES), {
        UNCONFIGURED: "unconfigured",
        INITIALIZING: "initializing",
        SIGNED_OUT: "signed_out",
        SIGNED_IN: "signed_in",
        ERROR: "error"
    });
});


/* ---- unconfigured (the current default) ------------------- */

test("with no config: resolves to 'unconfigured' and never loads the library", async () => {
    const env = makeAuthEnv();
    await env.auth.initialize();

    assert.equal(env.auth.getStatus(), "unconfigured");
    assert.equal(env.auth.isConfigured(), false);
    assert.equal(env.auth.isAuthenticated(), false);
    assert.equal(env.auth.getUser(), null);
    assert.equal(env.libState.appendChildCalls, 0);
    assert.equal(env.libState.createClientCalls, 0);
});

test("unconfigured: signOut() is a safe no-op", async () => {
    const env = makeAuthEnv();
    await env.auth.initialize();
    const result = await env.auth.signOut();
    assert.deepEqual(plain(result), { ok: true });
    assert.equal(env.libState.signOutCalls, 0);
    assert.equal(env.auth.getStatus(), "unconfigured");
});

test("invalid Supabase URL is treated as unconfigured", async () => {
    const env = makeAuthEnv({
        config: { supabaseUrl: "http://evil.example.com", supabaseKey: ANON_KEY }
    });
    assert.equal(env.resolved.isConfigured, false);
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "unconfigured");
});


/* ---- BP2 security hardening: browser key validation ------- */

test("HARDENING 1 — a valid sb_publishable_ key is accepted", async () => {
    const env = makeAuthEnv({ config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: PUBLISHABLE_KEY }, session: null });
    assert.equal(env.resolved.isConfigured, true);
    assert.equal(env.resolved.keyType, "publishable");
    assert.equal(env.resolved.keyRejected, false);
    assert.equal(env.resolved.keyProblem, null);
    assert.equal(env.resolved.getPublicConfig().key, PUBLISHABLE_KEY);

    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_out");
    assert.equal(env.auth.isConfigured(), true);
    assert.equal(env.auth.diagnostics().keyType, "publishable");
});

test("HARDENING 2 — an sb_secret_ key is rejected and never used", async () => {
    const env = makeAuthEnv({ config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: SECRET_KEY } });
    assert.equal(env.resolved.keyRejected, true);
    assert.equal(env.resolved.keyProblem, "secret-key");
    assert.equal(env.resolved.rejectedServiceRoleKey, true);
    assert.equal(env.resolved.isConfigured, false);
    assert.equal(env.resolved.getPublicConfig(), null);

    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "unconfigured");
    assert.equal(env.auth.getState().configIssue, "secret-key");
    assert.equal(env.libState.appendChildCalls, 0);
    assert.equal(env.libState.createClientCalls, 0);
});

test("HARDENING 3 — a legacy anon JWT is accepted", async () => {
    const env = makeAuthEnv({ config: LEGACY_ANON_CONFIG, session: null });
    assert.equal(env.resolved.isConfigured, true);
    assert.equal(env.resolved.keyType, "legacy_anon");
    assert.equal(env.resolved.keyRejected, false);

    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_out");
    assert.equal(env.auth.diagnostics().keyType, "legacy_anon");
});

test("HARDENING 4 — a legacy service_role JWT is rejected", async () => {
    const env = makeAuthEnv({ config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: SERVICE_ROLE_KEY } });
    assert.equal(env.resolved.keyRejected, true);
    assert.equal(env.resolved.keyProblem, "service-role-key");
    assert.equal(env.resolved.rejectedServiceRoleKey, true);
    assert.equal(env.resolved.isConfigured, false);

    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "unconfigured");
    assert.equal(env.auth.getState().configIssue, "service-role-key");
    assert.equal(env.libState.createClientCalls, 0);
});

test("HARDENING — an unrecognized key format is rejected", async () => {
    const env = makeAuthEnv({ config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: UNKNOWN_KEY } });
    assert.equal(env.resolved.keyRejected, true);
    assert.equal(env.resolved.keyProblem, "unrecognized-key-format");
    assert.equal(env.resolved.isConfigured, false);

    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "unconfigured");
    assert.equal(env.auth.getState().configIssue, "unrecognized-key-format");
});

test("HARDENING 5 — every rejected credential leaves auth safely unconfigured (app never blocked)", async () => {
    for (const badKey of [SECRET_KEY, SERVICE_ROLE_KEY, UNKNOWN_KEY]) {
        const env = makeAuthEnv({ config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: badKey } });
        const snap = await env.auth.initialize();

        assert.equal(snap.status, "unconfigured");
        assert.equal(snap.configured, false);
        assert.equal(snap.isAuthenticated, false);
        assert.equal(snap.error, null);
        assert.ok(typeof snap.configIssue === "string" && snap.configIssue.length > 0);
        // nothing built, no library fetched, no throw, signOut still safe
        assert.equal(env.libState.createClientCalls, 0);
        assert.equal(env.libState.appendChildCalls, 0);
        const out = await env.auth.signOut();
        assert.equal(out.ok, true);
    }
});

test("HARDENING 6 — no credential value appears in state, diagnostics, errors, or logs", async () => {
    const distinctive = "sb_secret_ZZTOPsecretVALUE_9f8e7d6c5b4a3210deadbeefcafef00d";
    const env = makeAuthEnv({ config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: distinctive } });
    await env.auth.initialize();

    const surfaces = [
        JSON.stringify(env.auth.getState()),
        JSON.stringify(env.auth.diagnostics()),
        JSON.stringify(plain(env.resolved) || {}),
        env.consoleText()
    ];
    for (const surface of surfaces) {
        assert.ok(!surface.includes(distinctive), "key value leaked into: " + surface.slice(0, 120));
        assert.ok(!surface.includes("ZZTOPsecretVALUE"), "key fragment leaked");
    }
    // a warning WAS emitted (actionable misconfig) but only with a safe reason token
    assert.ok(/browser authentication configuration was ignored/i.test(env.consoleText()));
    assert.ok(/secret key/i.test(env.consoleText()));
});

test("HARDENING — accepted publishable key value is not logged", async () => {
    const env = makeAuthEnv({ config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: PUBLISHABLE_KEY }, session: null });
    env.auth.debug = true; // even in verbose mode
    await env.auth.initialize();
    assert.ok(!env.consoleText().includes(PUBLISHABLE_KEY));
});


/* ---- BP2 hardening: local configuration path -------------- */

test("localStorage override supplies config with no file or HTML edit", async () => {
    const env = makeAuthEnv({
        localStorageSeed: {
            "mwallet.auth.config": JSON.stringify({
                supabaseUrl: "https://demoref.supabase.co",
                supabaseKey: PUBLISHABLE_KEY
            })
        },
        session: null
    });
    assert.equal(env.resolved.isConfigured, true);
    assert.equal(env.resolved.configSource, "localStorage");
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_out");
});

test("saveLocalConfig persists a publishable key and refuses a secret key", () => {
    const env = makeAuthEnv();

    const bad = env.resolved.saveLocalConfig("https://demoref.supabase.co", SECRET_KEY);
    assert.equal(bad.ok, false);
    assert.equal(bad.problem, "secret-key");
    assert.equal(env.sandbox.localStorage._store["mwallet.auth.config"], undefined);

    const good = env.resolved.saveLocalConfig("https://demoref.supabase.co", PUBLISHABLE_KEY);
    assert.equal(good.ok, true);
    assert.equal(good.keyType, "publishable");
    const stored = JSON.parse(env.sandbox.localStorage._store["mwallet.auth.config"]);
    assert.equal(stored.supabaseUrl, "https://demoref.supabase.co");
    assert.equal(stored.supabaseKey, PUBLISHABLE_KEY);

    const cleared = env.resolved.clearLocalConfig();
    assert.equal(cleared.ok, true);
    assert.equal(env.sandbox.localStorage._store["mwallet.auth.config"], undefined);
});

test("window.MWalletAuthConfig wins over a localStorage override", async () => {
    const env = makeAuthEnv({
        config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: PUBLISHABLE_KEY },
        localStorageSeed: {
            "mwallet.auth.config": JSON.stringify({ supabaseUrl: "https://other.supabase.co", supabaseKey: ANON_KEY })
        }
    });
    assert.equal(env.resolved.configSource, "window");
    assert.equal(env.resolved.getPublicConfig().url, "https://demoref.supabase.co");
});

test("missing localStorage does not throw at config resolution", async () => {
    const env = makeAuthEnv({ localStorage: false });
    assert.equal(env.resolved.isConfigured, false);
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "unconfigured");
});


/* ---- configured, session restoration --------------------- */

test("configured + no stored session -> signed_out", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: null });
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_out");
    assert.equal(env.auth.isAuthenticated(), false);
    assert.equal(env.auth.getUser(), null);
    assert.equal(env.libState.createClientCalls, 1);
});

test("configured + stored session -> signed_in with a safe user", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_in");
    assert.equal(env.auth.isAuthenticated(), true);
    assert.deepEqual(plain(env.auth.getUser()), { id: "user-123", email: "tester@example.com" });
});

test("restored session never exposes access or refresh tokens", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();

    const stateJSON = JSON.stringify(env.auth.getState());
    const sessionJSON = JSON.stringify(env.auth.getSession());
    const diagJSON = JSON.stringify(env.auth.diagnostics());

    for (const blob of [stateJSON, sessionJSON, diagJSON]) {
        assert.ok(!blob.includes(SECRET_ACCESS_TOKEN), "no access token in " + blob);
        assert.ok(!blob.includes(SECRET_REFRESH_TOKEN), "no refresh token in " + blob);
        assert.ok(!blob.toLowerCase().includes("access_token"));
        assert.ok(!blob.toLowerCase().includes("refresh_token"));
    }
    // the safe session summary keeps only these keys
    assert.deepEqual(
        Object.keys(plain(env.auth.getSession())).sort(),
        ["active", "email", "expiresAt", "userId"]
    );
});

test("the Supabase client uses its own storage key, clear of financial data", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: null });
    await env.auth.initialize();
    const key = env.libState.clientOpts.auth.storageKey;
    assert.ok(typeof key === "string" && key.length > 0);
    assert.notEqual(key, "mWalletData");
    assert.equal(env.libState.clientOpts.auth.persistSession, true);
});


/* ---- idempotency + single listener ----------------------- */

test("initialize() is idempotent (same promise, one client, one listener)", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    const p1 = env.auth.initialize();
    const p2 = env.auth.initialize();
    const p3 = env.auth.initialize();
    assert.equal(p1, p2);
    assert.equal(p2, p3);
    await Promise.all([p1, p2, p3]);
    assert.equal(env.libState.createClientCalls, 1);
    assert.equal(env.libState.listenerCount, 1);
});

test("exactly one auth-event listener even across repeated init + reconnect", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();
    await env.auth.initialize();
    env.fireOnline();
    await flush();
    assert.equal(env.libState.listenerCount, 1);
    assert.equal(env.auth.diagnostics().hasEventListener, true);
});


/* ---- auth events ---------------------------------------- */

test("SIGNED_OUT event transitions state to signed_out and clears the user", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_in");

    env.fireAuthEvent("SIGNED_OUT", null);
    assert.equal(env.auth.getStatus(), "signed_out");
    assert.equal(env.auth.getUser(), null);
    assert.equal(env.auth.getSession(), null);
});

test("TOKEN_REFRESHED keeps the session signed_in", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: null });
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_out");

    env.fireAuthEvent("TOKEN_REFRESHED", makeSession());
    assert.equal(env.auth.getStatus(), "signed_in");
    assert.deepEqual(plain(env.auth.getUser()), { id: "user-123", email: "tester@example.com" });
});


/* ---- offline behaviour ---------------------------------- */

test("offline at startup: restores from stored session, no deletion, one deferred reconcile", async () => {
    const env = makeAuthEnv({ online: false, config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();

    assert.equal(env.auth.getStatus(), "signed_in");
    assert.equal(env.libState.signOutCalls, 0);
    assert.equal(env.auth.diagnostics().deferredForOffline, true);
    assert.equal(env.auth.getState().online, false);
});

test("reconnect performs exactly one reconciliation, not a loop", async () => {
    const env = makeAuthEnv({ online: false, config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();
    const before = env.libState.createClientCalls;

    env.fireOnline();
    await flush();
    env.fireOnline();
    await flush();

    assert.equal(env.auth.getState().online, true);
    assert.equal(env.auth.diagnostics().deferredForOffline, false);
    // client was reused; listener not re-added
    assert.equal(env.libState.createClientCalls, before);
    assert.equal(env.libState.listenerCount, 1);
});


/* ---- failure handling ---------------------------------- */

test("library load failure -> error state, no throw, financial layer untouched", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, libLoadFails: true });
    const snap = await env.auth.initialize();
    assert.equal(snap.status, "error");
    assert.equal(env.auth.getStatus(), "error");
    assert.ok(env.auth.getState().error);
    assert.equal(env.libState.signOutCalls, 0);
});

test("getSession() network failure -> error state, session not deleted", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, getSessionRejects: true, session: makeSession() });
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "error");
    assert.equal(env.auth.getState().error.code, "init_failed");
    assert.equal(env.libState.signOutCalls, 0);
});

test("a service_role key in browser config is refused and left safely unconfigured", async () => {
    const env = makeAuthEnv({
        config: { supabaseUrl: "https://demoref.supabase.co", supabaseKey: SERVICE_ROLE_KEY }
    });
    assert.equal(env.resolved.rejectedServiceRoleKey, true);
    assert.equal(env.resolved.keyRejected, true);
    assert.equal(env.resolved.keyProblem, "service-role-key");
    assert.equal(env.resolved.isConfigured, false);
    assert.equal(env.resolved.getPublicConfig(), null);

    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "unconfigured");
    assert.equal(env.auth.isAuthenticated(), false);
    assert.equal(env.auth.getState().error, null);
    assert.equal(env.auth.getState().configIssue, "service-role-key");
    assert.equal(env.libState.createClientCalls, 0);
});


/* ---- signOut ------------------------------------------- */

test("signOut() while signed_in clears state to signed_out", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();
    const result = await env.auth.signOut();
    assert.deepEqual(plain(result), { ok: true });
    assert.equal(env.libState.signOutCalls, 1);
    assert.equal(env.auth.getStatus(), "signed_out");
    assert.equal(env.auth.getUser(), null);
});

test("signOut() still clears the local view if the provider call fails", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession(), signOutRejects: true });
    await env.auth.initialize();
    const result = await env.auth.signOut();
    assert.equal(result.ok, false);
    assert.equal(env.auth.getStatus(), "signed_out");
});


/* ---- subscribe ---------------------------------------- */

test("subscribe() delivers an immediate snapshot then updates, and unsubscribe stops it", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: null });
    const seen = [];
    const unsub = env.auth.subscribe((snap) => seen.push(snap.status));

    assert.equal(seen.length, 1); // immediate snapshot

    await env.auth.initialize();
    assert.ok(seen.includes("signed_out"));

    const countBeforeUnsub = seen.length;
    unsub();
    env.fireAuthEvent("SIGNED_IN", makeSession());
    assert.equal(seen.length, countBeforeUnsub); // no more callbacks
});

test("a throwing subscriber cannot break auth", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: null });
    env.auth.subscribe(() => { throw new Error("bad subscriber"); });
    await env.auth.initialize();
    assert.equal(env.auth.getStatus(), "signed_out");
});


/* ---- diagnostics -------------------------------------- */

test("diagnostics() returns only non-sensitive fields", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    await env.auth.initialize();
    const diag = env.auth.diagnostics();
    assert.deepEqual(
        Object.keys(plain(diag)).sort(),
        [
            "configIssue", "configured", "deferredForOffline", "hasEventListener",
            "keyType", "libraryLoaded", "online", "provider", "status",
            "subscriberCount", "vendorVersion"
        ]
    );
    // keyType is the FAMILY, never the key value
    assert.equal(diag.keyType, "publishable");
    const blob = JSON.stringify(diag).toLowerCase();
    assert.ok(!blob.includes("token"));
    assert.ok(!blob.includes("password"));
    assert.ok(!blob.includes("tester@example.com"));
    assert.ok(!blob.includes(PUBLISHABLE_KEY.toLowerCase()));
});


/* ---- BP3 extension points ---------------------------- */

test("BP3 extension points exist and reject clearly in BP2", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: null });
    await env.auth.initialize();
    for (const name of ["signUp", "signIn", "resetPassword"]) {
        assert.equal(typeof env.auth[name], "function");
        await assert.rejects(env.auth[name](), /BP3/);
    }
});

test("whenReady() resolves to a terminal-state snapshot", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    const snap = await env.auth.whenReady();
    assert.equal(snap.status, "signed_in");
});


/* ---- static wiring checks ---------------------------- */

test("service-worker precaches the auth modules + vendored library and bumped the cache", () => {
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.ok(/CACHE_NAME\s*=\s*"m-wallet-v21"/.test(sw), "cache bumped to v21");
    for (const asset of [
        "./js/auth/auth-config.js",
        "./js/auth/auth-client.js",
        "./js/auth/auth.js",
        "./js/vendor/supabase-js.min.js"
    ]) {
        assert.ok(sw.includes('"' + asset + '"'), "APP_SHELL includes " + asset);
    }
});

test("service-worker keeps the cross-origin guard (auth traffic never cached)", () => {
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.ok(/requestURL\.origin\s*!==\s*[\s\S]*self\.location\.origin/.test(sw));
});

test("index.html loads the auth modules before the financial engine", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const authConfigAt = html.indexOf("js/auth/auth-config.js");
    const authAt = html.indexOf("js/auth/auth.js");
    const storageAt = html.indexOf("js/storage.js");
    assert.ok(authConfigAt > 0 && authAt > 0 && storageAt > 0);
    assert.ok(authConfigAt < storageAt, "auth-config before storage");
    assert.ok(authAt < storageAt, "auth before storage");
    assert.ok(html.indexOf("js/app-version.js") < authConfigAt, "app-version first");
});

test(".gitignore excludes the local auth config override", () => {
    const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gi.includes("js/auth/auth-config.local.js"));
});

test("no auth source file contains a hard-coded credential or logs a session", () => {
    for (const file of AUTH_FILES.concat(["js/auth/auth-config.example.js"])) {
        const src = fs.readFileSync(path.join(ROOT, file), "utf8");
        // no real JWT
        assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(src), file + " embeds no JWT");
        // no real publishable / secret key literal (placeholders use <…>)
        assert.ok(!/sb_secret_[A-Za-z0-9]/.test(src), file + " embeds no secret key");
        assert.ok(!/sb_publishable_[A-Za-z0-9]{12,}/.test(src), file + " embeds no real publishable key");
        // no key field assigned a long literal
        assert.ok(
            !/(supabase(Anon|Publishable)?Key|anonKey|publishableKey)\s*:\s*["'][A-Za-z0-9._-]{25,}/.test(src),
            file + " assigns no real key literal"
        );
        // never logs a session / token / password
        assert.ok(
            !/console\.(log|info|warn|error|debug)\([^)]*(session|token|password)/i.test(src),
            file + " never logs a session/token/password"
        );
    }
});
