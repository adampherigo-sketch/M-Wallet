"use strict";

/* =========================================================
   BP2 + BP3 — AUTHENTICATION ARCHITECTURE + API TESTS

   Loads the real js/auth/*.js modules into a node:vm sandbox
   with mocked browser globals and a stubbed Supabase library.
   No network, no real Supabase project.

   BP2: unconfigured / configured / error state model · no
   library load while unconfigured · idempotent initialize() ·
   session restoration · exactly one auth-event listener ·
   offline startup + single reconnect · library / network
   failure -> safe error, no data loss · signOut safe in every
   state · subscribe/unsubscribe · diagnostics + state never
   expose tokens · secret / service_role / unknown key refused.

   BP3: signUp / signIn / resetPassword / updatePassword /
   resendVerification call the provider correctly · email
   normalized · input validation · safe result objects (no raw
   session / token) · provider errors mapped · PASSWORD_RECOVERY
   -> recoveryMode · password/token never logged · sub-path-safe
   redirect URL.

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
        clientOpts: null,
        calls: []            /* BP3: [{ method, args }] provider call log */
    };

    const logCall = (method, args) => libState.calls.push({ method, args });
    const providerResult = (name) => {
        /* options.provider[name] can be:
           - an Error  -> rejected
           - { error }  -> resolved provider error
           - { data }   -> resolved success payload
           - a function -> called with args
        */
        const spec = (options.provider || {})[name];
        return spec;
    };
    const respond = (name, args, successData) => {
        const spec = providerResult(name);
        if (spec instanceof Error) { return Promise.reject(spec); }
        if (typeof spec === "function") { return Promise.resolve(spec(...args)); }
        if (spec && (spec.error || spec.data)) { return Promise.resolve(spec); }
        return Promise.resolve({ data: successData || {}, error: null });
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
                        logCall("signOut", []);
                        if (options.signOutRejects) {
                            return Promise.reject(new Error("sign-out failed"));
                        }
                        libState.session = null;
                        return Promise.resolve({ error: null });
                    },
                    signUp(payload) {
                        logCall("signUp", [payload]);
                        return respond("signUp", [payload], {
                            user: { id: "new-user", email: payload && payload.email },
                            session: options.signUpAutoConfirm ? makeSession() : null
                        });
                    },
                    signInWithPassword(payload) {
                        logCall("signInWithPassword", [payload]);
                        return respond("signIn", [payload], {
                            user: { id: "user-123", email: payload && payload.email },
                            session: makeSession()
                        });
                    },
                    resetPasswordForEmail(email, opts) {
                        logCall("resetPasswordForEmail", [email, opts]);
                        return respond("resetPassword", [email, opts], {});
                    },
                    updateUser(payload) {
                        logCall("updateUser", [payload]);
                        return respond("updateUser", [payload], {
                            user: { id: "user-123", email: "tester@example.com" }
                        });
                    },
                    resend(payload) {
                        logCall("resend", [payload]);
                        return respond("resend", [payload], {});
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
    for (const file of AUTH_FILES.concat(["js/auth/auth-ui.js"])) {
        const code = fs.readFileSync(path.join(ROOT, file), "utf8");
        vm.runInContext(code, sandbox, { filename: file });
    }

    return {
        sandbox,
        auth: sandbox.MWalletAuth,
        ui: sandbox.MWalletAuthUI,
        resolved: sandbox.MWalletAuthConfigResolved,
        client: sandbox.MWalletAuthClient,
        libState,
        calls: libState.calls,
        consoleLines,
        consoleText() { return consoleLines.join("\n"); },
        callsTo(method) { return libState.calls.filter((c) => c.method === method); },
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


test("whenReady() resolves to a terminal-state snapshot", async () => {
    const env = makeAuthEnv({ config: VALID_CONFIG, session: makeSession() });
    const snap = await env.auth.whenReady();
    assert.equal(snap.status, "signed_in");
});


/* =====================================================
   BP3 — ACCOUNT ACTIONS (auth API)
   ===================================================== */

async function configured(options) {
    const env = makeAuthEnv(Object.assign({ config: VALID_CONFIG, session: null }, options || {}));
    await env.auth.initialize();
    return env;
}

test("BP3 API surface is present", async () => {
    const env = await configured();
    for (const m of ["signUp", "signIn", "signOut", "resetPassword", "updatePassword", "resendVerification"]) {
        assert.equal(typeof env.auth[m], "function", m);
    }
    assert.equal(typeof env.auth._internals.validateEmail, "function");
    assert.equal(typeof env.auth._internals.redirectUrl, "function");
});

test("signUp validates + normalizes email and calls the provider once", async () => {
    const env = await configured();
    const res = await env.auth.signUp("  NewUser@Example.COM ", "sup3rsecret!");
    assert.equal(res.ok, true);
    assert.equal(res.email, "newuser@example.com");
    assert.equal(res.needsVerification, true);           // mock returns no session

    const calls = env.callsTo("signUp");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args[0].email, "newuser@example.com");
    assert.equal(calls[0].args[0].password, "sup3rsecret!");
});

test("signUp rejects a weak password before any network call", async () => {
    const env = await configured();
    const res = await env.auth.signUp("a@b.com", "short");
    assert.equal(res.ok, false);
    assert.equal(res.code, "weak_password");
    assert.equal(res.field, "password");
    assert.equal(env.callsTo("signUp").length, 0);
});

test("signUp rejects an invalid email before any network call", async () => {
    const env = await configured();
    const res = await env.auth.signUp("not-an-email", "longenough1");
    assert.equal(res.ok, false);
    assert.equal(res.code, "invalid_email");
    assert.equal(env.callsTo("signUp").length, 0);
});

test("signUp with auto-confirm returns ok and no verification step", async () => {
    const env = await configured({ signUpAutoConfirm: true });
    const res = await env.auth.signUp("a@b.com", "longenough1");
    assert.equal(res.ok, true);
    assert.equal(res.needsVerification, false);
    // result never contains a session / tokens
    const blob = JSON.stringify(res);
    assert.ok(!blob.includes("access_token"));
    assert.ok(!blob.includes(SECRET_ACCESS_TOKEN));
});

test("signUp maps a provider 'already registered' error", async () => {
    const env = await configured({ provider: { signUp: { error: { message: "User already registered" } } } });
    const res = await env.auth.signUp("a@b.com", "longenough1");
    assert.equal(res.ok, false);
    assert.match(res.message, /already exists/i);
});

test("signIn success returns a safe result (no session) and provider is called normalized", async () => {
    const env = await configured();
    const res = await env.auth.signIn(" User@Example.com ", "pw-value-here");
    assert.equal(res.ok, true);
    const blob = JSON.stringify(res);
    assert.ok(!blob.includes("access_token") && !blob.includes(SECRET_ACCESS_TOKEN) && !blob.includes(SECRET_REFRESH_TOKEN));
    assert.equal(env.callsTo("signInWithPassword")[0].args[0].email, "user@example.com");
});

test("signIn invalid credentials -> mapped message, still signed_out", async () => {
    const env = await configured({ provider: { signIn: { error: { message: "Invalid login credentials" } } } });
    const res = await env.auth.signIn("a@b.com", "whatever");
    assert.equal(res.ok, false);
    assert.equal(res.code, "signin_failed");
    assert.match(res.message, /doesn't match/i);
    assert.equal(env.auth.getStatus(), "signed_out");
});

test("signIn email-not-confirmed is flagged for the resend flow", async () => {
    const env = await configured({ provider: { signIn: { error: { message: "Email not confirmed" } } } });
    const res = await env.auth.signIn("a@b.com", "whatever");
    assert.equal(res.ok, false);
    assert.equal(res.code, "email_not_confirmed");
    assert.equal(res.email, "a@b.com");
});

test("signIn requires a password before any network call", async () => {
    const env = await configured();
    const res = await env.auth.signIn("a@b.com", "");
    assert.equal(res.ok, false);
    assert.equal(res.code, "missing_password");
    assert.equal(env.callsTo("signInWithPassword").length, 0);
});

test("resetPassword returns a generic (non-enumerating) success and passes a redirectTo", async () => {
    const env = await configured();
    const res = await env.auth.resetPassword("Person@Example.com");
    assert.equal(res.ok, true);
    assert.match(res.message, /if that email has an account/i);
    const call = env.callsTo("resetPasswordForEmail")[0];
    assert.equal(call.args[0], "person@example.com");
    assert.ok("redirectTo" in call.args[1]);
});

test("resetPassword surfaces a rate-limit error", async () => {
    const env = await configured({ provider: { resetPassword: { error: { message: "For security purposes, you can only request this after 60 seconds" } } } });
    const res = await env.auth.resetPassword("a@b.com");
    assert.equal(res.ok, false);
    assert.match(res.message, /too many attempts/i);
});

test("updatePassword validates strength, calls updateUser, and clears recoveryMode", async () => {
    const env = await configured();
    env.fireAuthEvent("PASSWORD_RECOVERY", makeSession());
    assert.equal(env.auth.getState().recoveryMode, true);

    const weak = await env.auth.updatePassword("nope");
    assert.equal(weak.ok, false);
    assert.equal(env.callsTo("updateUser").length, 0);

    const res = await env.auth.updatePassword("a-brand-new-password");
    assert.equal(res.ok, true);
    assert.equal(env.callsTo("updateUser")[0].args[0].password, "a-brand-new-password");
    assert.equal(env.auth.getState().recoveryMode, false);
});

test("resendVerification calls resend with the normalized email + redirect", async () => {
    const env = await configured();
    const res = await env.auth.resendVerification("  A@B.com");
    assert.equal(res.ok, true);
    const call = env.callsTo("resend")[0];
    assert.equal(call.args[0].type, "signup");
    assert.equal(call.args[0].email, "a@b.com");
    assert.ok(call.args[0].options && "emailRedirectTo" in call.args[0].options);
});

test("every account action is a safe no-op when not configured", async () => {
    const env = makeAuthEnv();               // unconfigured
    await env.auth.initialize();
    for (const call of [
        env.auth.signUp("a@b.com", "longenough1"),
        env.auth.signIn("a@b.com", "longenough1"),
        env.auth.resetPassword("a@b.com"),
        env.auth.updatePassword("longenough1"),
        env.auth.resendVerification("a@b.com")
    ]) {
        const res = await call;
        assert.equal(res.ok, false);
        assert.equal(res.code, "not_configured");
    }
    assert.equal(env.libState.createClientCalls, 0);
    assert.equal(env.auth.getStatus(), "unconfigured");
});

test("PASSWORD_RECOVERY sets recoveryMode and the UI decision shows the recovery view", async () => {
    const env = await configured();
    env.fireAuthEvent("PASSWORD_RECOVERY", makeSession());
    const state = env.auth.getState();
    assert.equal(state.recoveryMode, true);
    const decision = env.ui.decideGate(state);
    assert.equal(decision.visible, true);
    assert.equal(decision.view, "recovery");
});

test("passwords and tokens never appear in the console during account actions", async () => {
    const env = await configured({ signUpAutoConfirm: true });
    env.auth.debug = true;                    // even verbose
    await env.auth.signUp("person@example.com", "T0p-Secret-Password");
    await env.auth.signIn("person@example.com", "T0p-Secret-Password");
    await env.auth.resetPassword("person@example.com");
    env.fireAuthEvent("PASSWORD_RECOVERY", makeSession());
    await env.auth.updatePassword("Another-Secret-Password");

    const log = env.consoleText();
    assert.ok(!log.includes("T0p-Secret-Password"), "signup/signin password leaked");
    assert.ok(!log.includes("Another-Secret-Password"), "recovery password leaked");
    assert.ok(!log.includes(SECRET_ACCESS_TOKEN) && !log.includes(SECRET_REFRESH_TOKEN), "token leaked");
});

test("getState()/getSession() still expose no tokens after signing in via signIn", async () => {
    const env = await configured();
    await env.auth.signIn("a@b.com", "whatever-pw");
    // mock signInWithPassword resolves with a session -> but state is driven by the event
    env.fireAuthEvent("SIGNED_IN", makeSession());
    assert.equal(env.auth.isAuthenticated(), true);
    const blob = JSON.stringify(env.auth.getState()) + JSON.stringify(env.auth.getSession());
    assert.ok(!blob.includes(SECRET_ACCESS_TOKEN) && !blob.includes(SECRET_REFRESH_TOKEN));
    assert.ok(!blob.toLowerCase().includes("access_token"));
});

test("redirectUrl() is sub-path safe", async () => {
    // domain root
    let env = makeAuthEnv({ config: VALID_CONFIG });
    env.sandbox.location = { origin: "http://127.0.0.1:4178", pathname: "/index.html", href: "http://127.0.0.1:4178/index.html" };
    assert.equal(env.auth._internals.redirectUrl(), "http://127.0.0.1:4178/");
    // repo sub-path (GitHub Pages)
    env.sandbox.location = { origin: "https://user.github.io", pathname: "/M-Wallet/index.html", href: "https://user.github.io/M-Wallet/index.html" };
    assert.equal(env.auth._internals.redirectUrl(), "https://user.github.io/M-Wallet/");
    // sub-path directory URL
    env.sandbox.location = { origin: "https://user.github.io", pathname: "/M-Wallet/", href: "https://user.github.io/M-Wallet/" };
    assert.equal(env.auth._internals.redirectUrl(), "https://user.github.io/M-Wallet/");
});


/* =====================================================
   BP3 — AUTH UI decision + validation (pure)
   ===================================================== */

test("decideGate: unconfigured never shows the gateway (developer not locked out)", () => {
    const env = makeAuthEnv();
    assert.deepEqual(plain(env.ui.decideGate({ configured: false, status: "unconfigured" })),
        { visible: false, view: null, reason: "unconfigured" });
});

test("decideGate: configured signed_out shows the gateway; signed_in hides it", () => {
    const env = makeAuthEnv();
    assert.equal(env.ui.decideGate({ configured: true, status: "signed_out" }).visible, true);
    assert.equal(env.ui.decideGate({ configured: true, status: "signed_in" }).visible, false);
});

test("decideGate: initializing shows a loading view (no flash of signed-out UI)", () => {
    const env = makeAuthEnv();
    const d = env.ui.decideGate({ configured: true, status: "initializing" });
    assert.equal(d.visible, true);
    assert.equal(d.view, "loading");
});

test("decideGate: error shows the gateway with a retry banner, never a blank screen", () => {
    const env = makeAuthEnv();
    const d = env.ui.decideGate({ configured: true, status: "error" });
    assert.equal(d.visible, true);
    assert.equal(d.banner, "error");
});

test("decideGate: recoveryMode outranks signed_in and shows the recovery view", () => {
    const env = makeAuthEnv();
    const d = env.ui.decideGate({ configured: true, status: "signed_in", recoveryMode: true });
    assert.equal(d.view, "recovery");
    assert.equal(d.visible, true);
});

test("auth-ui validators: signup password mismatch + signin/forgot/recovery", () => {
    const env = makeAuthEnv();
    const U = env.ui;
    assert.equal(U.validateSignUp({ email: "a@b.com", password: "abcdefgh", confirm: "different" }).field, "confirm");
    assert.equal(U.validateSignUp({ email: "bad", password: "abcdefgh", confirm: "abcdefgh" }).field, "email");
    assert.equal(U.validateSignUp({ email: "a@b.com", password: "x", confirm: "x" }).field, "password");
    assert.deepEqual(plain(U.validateSignUp({ email: " A@B.com ", password: "abcdefgh", confirm: "abcdefgh" })),
        { ok: true, email: "a@b.com", password: "abcdefgh" });

    assert.equal(U.validateSignIn({ email: "a@b.com", password: "" }).field, "password");
    assert.equal(U.validateSignIn({ email: "a@b.com", password: "anything" }).ok, true);

    assert.equal(U.validateForgot({ email: "nope" }).field, "email");
    assert.equal(U.validateForgot({ email: "a@b.com" }).ok, true);

    assert.equal(U.validateRecovery({ password: "abcdefgh", confirm: "nomatch" }).field, "confirm");
    assert.equal(U.validateRecovery({ password: "abcdefgh", confirm: "abcdefgh" }).ok, true);
});


/* ---- static wiring checks ---------------------------- */

test("service-worker precaches the auth modules + UI + vendored library and bumped the cache", () => {
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.ok(/CACHE_NAME\s*=\s*"m-wallet-v22"/.test(sw), "cache bumped to v22");
    for (const asset of [
        "./js/auth/auth-config.js",
        "./js/auth/auth-client.js",
        "./js/auth/auth.js",
        "./js/auth/auth-ui.js",
        "./css/auth.css",
        "./js/vendor/supabase-js.min.js"
    ]) {
        assert.ok(sw.includes('"' + asset + '"'), "APP_SHELL includes " + asset);
    }
});

test("service-worker keeps the cross-origin guard (auth traffic never cached)", () => {
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.ok(/requestURL\.origin\s*!==\s*[\s\S]*self\.location\.origin/.test(sw));
});

test("index.html loads the auth modules (incl. auth-ui) before the financial engine", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    /* match the <script> tags only (via the ?v= cache-buster) */
    const at = (needle) => html.indexOf(needle);
    const authConfigAt = at('js/auth/auth-config.js?v=');
    const authAt = at('js/auth/auth.js?v=');
    const authUiAt = at('js/auth/auth-ui.js?v=');
    const storageAt = at('js/storage.js?v=');
    assert.ok(authConfigAt > 0 && authAt > 0 && authUiAt > 0 && storageAt > 0);
    assert.ok(authConfigAt < storageAt, "auth-config before storage");
    assert.ok(authAt < authUiAt, "auth.js before auth-ui.js");
    assert.ok(authUiAt < storageAt, "auth-ui before storage");
    assert.ok(at('js/app-version.js?v=') < authConfigAt, "app-version first");
});

test("index.html has the auth gateway markup + auth.css, and financial page markup is untouched", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.ok(/href="\.\/css\/auth\.css/.test(html), "auth.css linked");
    assert.ok(/id="mw-auth-gate"/.test(html), "#mw-auth-gate present");
    // all six real views exist
    for (const v of ["welcome", "signup", "signin", "verify", "forgot", "recovery", "loading"]) {
        assert.ok(html.includes('data-auth-view="' + v + '"'), "view " + v);
    }
    // the gate starts hidden — never blocks first paint
    assert.ok(/id="mw-auth-gate"[\s\S]{0,200}\bhidden\b/.test(html), "#mw-auth-gate starts hidden");
    // financial pages still present
    for (const p of ["home-page", "budget-page", "transactions-page", "savings-page", "m-cash-page", "reports-page", "settings-page"]) {
        assert.ok(html.includes('id="' + p + '"'), p + " markup intact");
    }
    // password fields use the right autocomplete tokens
    assert.ok(html.includes('autocomplete="new-password"'), "new-password autocomplete");
    assert.ok(html.includes('autocomplete="current-password"'), "current-password autocomplete");
    assert.ok(html.includes('autocomplete="email"'), "email autocomplete");
});

test("auth-ui.js is version-bumped and auth.js re-versioned in index.html", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.ok(/js\/auth\/auth-ui\.js\?v=\d+/.test(html), "auth-ui.js has a cache-busting ?v");
    assert.ok(/js\/auth\/auth\.js\?v=3/.test(html), "auth.js bumped to ?v=3");
    assert.ok(/js\/settings-ui\.js\?v=4/.test(html), "settings-ui.js bumped to ?v=4");
});

test("app version bumped to 0.9.0-beta.2 and mirrored in package.json", () => {
    const av = fs.readFileSync(path.join(ROOT, "js/app-version.js"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.ok(/APP_VERSION\s*=\s*"0\.9\.0-beta\.2"/.test(av), "app-version.js");
    assert.equal(pkg.version, "0.9.0-beta.2", "package.json");
});

test(".gitignore excludes the local auth config override", () => {
    const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gi.includes("js/auth/auth-config.local.js"));
});

test("no auth source file contains a hard-coded credential or logs a session", () => {
    for (const file of AUTH_FILES.concat(["js/auth/auth-ui.js", "js/auth/auth-config.example.js"])) {
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
