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

test("service-worker precaches the auth + migration + setup + walkthrough + cloud + sync modules and bumped the cache", () => {
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.ok(/CACHE_NAME\s*=\s*"m-wallet-v27"/.test(sw), "cache bumped to v27");
    for (const asset of [
        "./js/auth/auth-config.js",
        "./js/auth/auth-client.js",
        "./js/auth/auth.js",
        "./js/auth/auth-ui.js",
        "./js/migration/local-user-migration.js",
        "./js/migration/migration-ui.js",
        "./js/setup/first-run-setup.js",
        "./js/setup/setup-ui.js",
        "./js/walkthrough/guided-walkthrough.js",
        "./js/walkthrough/walkthrough-ui.js",
        "./js/cloud/cloud-financial-codec.js",
        "./js/cloud/cloud-financial-store.js",
        "./js/sync/sync-release.js",
        "./js/sync/sync-state.js",
        "./js/sync/sync-planner.js",
        "./js/sync/sync-engine.js",
        "./js/sync/sync-ui.js",
        "./css/auth.css",
        "./css/migration.css",
        "./css/setup.css",
        "./css/walkthrough.css",
        "./css/sync.css",
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

test("changed modules are re-versioned in index.html", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.ok(/js\/auth\/auth-ui\.js\?v=6/.test(html), "auth-ui.js bumped to ?v=6");
    assert.ok(/js\/auth\/auth\.js\?v=3/.test(html), "auth.js still ?v=3");
    assert.ok(/js\/settings-ui\.js\?v=9/.test(html), "settings-ui.js bumped to ?v=9");
    assert.ok(/js\/setup\/first-run-setup\.js\?v=2/.test(html), "first-run-setup.js bumped to ?v=2");
    assert.ok(/js\/setup\/setup-ui\.js\?v=\d+/.test(html), "setup-ui.js has a ?v");
    assert.ok(/js\/walkthrough\/guided-walkthrough\.js\?v=\d+/.test(html), "guided-walkthrough.js has a ?v");
    assert.ok(/js\/walkthrough\/walkthrough-ui\.js\?v=\d+/.test(html), "walkthrough-ui.js has a ?v");
    assert.ok(/js\/cloud\/cloud-financial-codec\.js\?v=2/.test(html), "cloud-financial-codec.js bumped to ?v=2");
    assert.ok(/js\/cloud\/cloud-financial-store\.js\?v=2/.test(html), "cloud-financial-store.js bumped to ?v=2");
    assert.ok(/js\/sync\/sync-release\.js\?v=\d+/.test(html), "sync-release.js has a ?v");
    assert.ok(/js\/sync\/sync-state\.js\?v=\d+/.test(html), "sync-state.js has a ?v");
    assert.ok(/js\/sync\/sync-planner\.js\?v=\d+/.test(html), "sync-planner.js has a ?v");
    assert.ok(/js\/sync\/sync-engine\.js\?v=\d+/.test(html), "sync-engine.js has a ?v");
    assert.ok(/js\/sync\/sync-ui\.js\?v=\d+/.test(html), "sync-ui.js has a ?v");
    assert.ok(/js\/storage\.js\?v=8/.test(html), "storage.js bumped to ?v=8");
});

test("app version bumped to 0.9.0-beta.7 and mirrored in package.json", () => {
    const av = fs.readFileSync(path.join(ROOT, "js/app-version.js"), "utf8");
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.ok(/APP_VERSION\s*=\s*"0\.9\.0-beta\.7"/.test(av), "app-version.js");
    assert.equal(pkg.version, "0.9.0-beta.7", "package.json");
});

test("BP4 migration modules load after auth, before the financial engine", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const at = (needle) => html.indexOf(needle);
    const authUiAt = at("js/auth/auth-ui.js?v=");
    const migServiceAt = at("js/migration/local-user-migration.js?v=");
    const migUiAt = at("js/migration/migration-ui.js?v=");
    const storageAt = at("js/storage.js?v=");
    assert.ok(migServiceAt > 0 && migUiAt > 0, "migration scripts present");
    assert.ok(authUiAt < migServiceAt, "auth-ui before migration service (guard dependency)");
    assert.ok(migServiceAt < migUiAt, "migration service before migration UI");
    assert.ok(migUiAt < storageAt, "migration before the financial engine");
});

test("index.html has the BP4 migration gateway markup + migration.css, financial pages untouched", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.ok(/href="\.\/css\/migration\.css/.test(html), "migration.css linked");
    assert.ok(/id="mw-migration-gate"/.test(html), "#mw-migration-gate present");
    assert.ok(/id="mw-migration-gate"[\s\S]{0,240}\bhidden\b/.test(html), "#mw-migration-gate starts hidden");
    for (const s of ["checking", "needs_claim", "owner_mismatch", "error"]) {
        assert.ok(html.includes('data-migration-screen="' + s + '"'), "migration screen " + s);
    }
    /* NO destructive actions in BP4 */
    assert.ok(!/data-migration-action="(delete|reset|replace|start-over|override)"/.test(html),
        "no destructive migration action");
    assert.ok(html.includes('data-migration-action="claim"'), "claim action");
    assert.ok(html.includes('data-migration-action="sign-out"'), "sign-out action");
    /* financial pages still present */
    for (const p of ["home-page", "budget-page", "transactions-page", "savings-page", "m-cash-page", "reports-page", "settings-page"]) {
        assert.ok(html.includes('id="' + p + '"'), p + " markup intact");
    }
});

test("BP4 fail-closed: auth-ui carries the built-in ownership-hold fallback + fail-closed guard contract", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const authUi = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");
    const migration = fs.readFileSync(path.join(ROOT, "js/migration/local-user-migration.js"), "utf8");

    /* fallback markup lives in #mw-auth-gate (does NOT depend on migration-ui.js loading) */
    assert.ok(html.includes('data-auth-view="ownership-hold"'), "ownership-hold fallback view present");
    assert.ok(html.includes('data-auth-action="ownership-retry"'), "fallback Retry");
    assert.ok(html.includes('data-auth-action="ownership-signout"'), "fallback Sign Out");
    assert.ok(/Local data protection couldn't be verified/.test(html), "fallback message");

    /* auth-ui default for configured+signed_in is DENY: only an
       explicit { release: true } opens the app */
    assert.ok(/result\.release === true/.test(authUi), "auth-ui releases only on exact release === true");
    assert.ok(/ownershipReleased/.test(authUi) && /FAIL CLOSED/.test(authUi), "fail-closed logic present");
    assert.ok(!/hold\s*=\s*false/.test(authUi), "no 'default hold = false' (fail-open) left in auth-ui");

    /* migration guard uses the { release } contract */
    assert.ok(/release:\s*status === STATE\.OWNED \|\| status === STATE\.FRESH_CLAIMED/.test(migration),
        "migration guard releases only for owned / fresh_claimed");
});

test("no absolute-root asset URLs regressed (GitHub Pages /M-Wallet/ sub-path safe)", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    /* every migration/auth/css asset ref must be relative (./…), never /… */
    assert.ok(!/(src|href)="\/(js|css|icons)\//.test(html), "index.html uses relative asset URLs");
    assert.ok(!/"\/(js|css|icons)\//.test(sw), "service-worker APP_SHELL uses relative URLs");
});

test("BP5 first-run: setup loads after BP4, gate markup present, financial pages intact", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const at = (needle) => html.indexOf(needle);

    /* load order: auth-ui -> migration -> setup -> storage */
    const authUiAt = at("js/auth/auth-ui.js?v=");
    const migAt = at("js/migration/migration-ui.js?v=");
    const setupSvcAt = at("js/setup/first-run-setup.js?v=");
    const setupUiAt = at("js/setup/setup-ui.js?v=");
    const storageAt = at("js/storage.js?v=");
    assert.ok(setupSvcAt > 0 && setupUiAt > 0, "setup scripts present");
    assert.ok(authUiAt < setupSvcAt && migAt < setupSvcAt, "setup loads after auth-ui + migration");
    assert.ok(setupSvcAt < setupUiAt, "setup service before setup UI");
    assert.ok(setupUiAt < storageAt, "setup loads before the financial engine");

    /* gate markup — starts hidden, all 4 steps + error screen */
    assert.ok(/href="\.\/css\/setup\.css/.test(html), "setup.css linked");
    assert.ok(/id="mw-setup-gate"/.test(html), "#mw-setup-gate present");
    assert.ok(/id="mw-setup-gate"[\s\S]{0,220}\bhidden\b/.test(html), "#mw-setup-gate starts hidden");
    for (const s of ["1", "2", "3", "4", "error"]) {
        assert.ok(html.includes('data-setup-step="' + s + '"'), "setup step " + s);
    }
    /* NO "restart setup" control in BP5 */
    assert.ok(!/data-setup-action="(restart|reset)"/.test(html), "no restart/reset setup action");
    /* review values are rendered into spans (filled with textContent, never innerHTML) */
    assert.ok(html.includes('data-setup-review="review-checking-balance"'), "review slot present");

    /* the setup error screen must not make a claim that is false when a
       financial write succeeded but the completion metadata failed */
    const errStart = html.indexOf('data-setup-step="error"');
    const errSection = errStart >= 0 ? html.slice(errStart, html.indexOf("</section>", errStart) + 10) : "";
    assert.ok(errSection.length > 0, "error section found");
    assert.ok(!/your data has not been changed|nothing was saved|no changes were made/i.test(errSection),
        "error screen makes no false 'data unchanged' claim");
    assert.ok(/data is safe|Retry/i.test(errSection), "error screen still reassures + offers retry");

    /* financial pages untouched */
    for (const p of ["home-page", "budget-page", "transactions-page", "savings-page", "m-cash-page", "reports-page", "settings-page"]) {
        assert.ok(html.includes('id="' + p + '"'), p + " markup intact");
    }
});

test("BP5 fail-open: auth-ui setup guard holds ONLY on explicit { release: false }, and setup source is local-only", () => {
    const authUi = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");
    const setup = fs.readFileSync(path.join(ROOT, "js/setup/first-run-setup.js"), "utf8");
    const setupUi = fs.readFileSync(path.join(ROOT, "js/setup/setup-ui.js"), "utf8");

    /* auth-ui: BP5 gate consulted only AFTER ownershipReleased passes */
    assert.ok(/if \(!ownershipReleased\(lastSnapshot\)\)/.test(authUi), "ownership checked first");
    assert.ok(/setupReleased/.test(authUi) && /FAIL[- ]OPEN/i.test(authUi), "fail-open setup logic present");
    assert.ok(/return result\.release !== false/.test(authUi), "setup guard holds only on explicit release:false");

    /* the setup layer makes ZERO network / cloud calls */
    for (const [label, src] of [["first-run-setup.js", setup], ["setup-ui.js", setupUi]]) {
        assert.ok(!/\bfetch\s*\(/.test(src), label + " has no fetch()");
        assert.ok(!/XMLHttpRequest/.test(src), label + " has no XMLHttpRequest");
        assert.ok(!/\.from\s*\(/.test(src) || /Array\.prototype|\.slice\.call/.test(src), label + " no Supabase .from()");
        assert.ok(!/createClient|supabase\./.test(src), label + " no Supabase client use");
    }

    /* setup keys are the documented local metadata keys */
    assert.ok(/mwallet\.setup\.v1/.test(setup), "setup completion key");
    assert.ok(/mwallet\.setup\.draft\.v1/.test(setup), "setup draft key");

    /* balance-only workspaces auto-skip: no "balance signals don't count"
       exception; the checking opening balance goes to the CURRENT month */
    assert.ok(!/BALANCE_ONLY_SIGNALS|hasEstablishedActivity/.test(setup), "no balance-only exception");
    assert.ok(/hasEstablishedBalances|establishedFinancialState/.test(setup), "established-state check present");
    assert.ok(/getCurrentMonthKey/.test(setup), "opening balance targets the current calendar month");

    /* a failed 'existing' metadata write must NOT gate a verified owner */
    assert.ok(/fail[- ]?open/i.test(setup), "existing-user metadata failure fails open");
});


/* =========================================================
   BP6 — GUIDED APP WALKTHROUGH  (static / deployment)
   ========================================================= */

test("BP6 walkthrough: loads after BP4 + BP5, overlay markup present, targets on every page", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const at = (needle) => html.indexOf(needle);

    /* load order: auth-ui -> migration -> setup -> walkthrough -> storage */
    const authUiAt = at("js/auth/auth-ui.js?v=");
    const migAt = at("js/migration/migration-ui.js?v=");
    const setupUiAt = at("js/setup/setup-ui.js?v=");
    const wtSvcAt = at("js/walkthrough/guided-walkthrough.js?v=");
    const wtUiAt = at("js/walkthrough/walkthrough-ui.js?v=");
    const storageAt = at("js/storage.js?v=");
    assert.ok(wtSvcAt > 0 && wtUiAt > 0, "walkthrough scripts present");
    assert.ok(authUiAt < wtSvcAt && migAt < wtSvcAt && setupUiAt < wtSvcAt, "walkthrough loads after auth-ui + BP4 + BP5");
    assert.ok(wtSvcAt < wtUiAt, "walkthrough service before its UI");
    assert.ok(wtUiAt < storageAt, "walkthrough loads before the financial engine");

    assert.ok(/href="\.\/css\/walkthrough\.css/.test(html), "walkthrough.css linked");
    assert.ok(/id="mw-walkthrough"/.test(html), "#mw-walkthrough present");
    assert.ok(/id="mw-walkthrough"[\s\S]{0,260}\bhidden\b/.test(html), "#mw-walkthrough starts hidden");

    /* the overlay must live OUTSIDE the .app root so it stays usable
       while auth-ui makes .app inert */
    const appOpen = html.indexOf('<div class="app">');
    const appClose = html.indexOf("</div>", html.lastIndexOf('class="bottom-nav"'));
    const wtAt = html.indexOf('id="mw-walkthrough"');
    assert.ok(appOpen > 0 && wtAt > appOpen, "sanity");
    assert.ok(wtAt > appClose || appClose === -1 ? true : wtAt > html.indexOf("</main>"), "walkthrough overlay after the app content");
    /* stronger: the auth + setup gates and the walkthrough are all siblings after .app */
    assert.ok(html.indexOf('id="mw-walkthrough"') > html.indexOf('id="mw-setup-gate"'), "walkthrough after the setup gate");

    for (const t of ["home-overview", "budget-overview", "transactions-overview", "savings-overview", "m-cash-overview", "reports-overview", "settings-overview"]) {
        assert.ok(html.includes('data-walkthrough-target="' + t + '"'), "target " + t + " present");
    }
    /* action buttons + no forced-tutorial restart control */
    for (const a of ["skip", "back", "next"]) {
        assert.ok(html.includes('data-wt-action="' + a + '"'), "action " + a);
    }
    /* Settings replay row */
    assert.ok(html.includes('id="settings-walkthrough-panel"'), "Settings Guided Tour row");
    assert.ok(html.includes('data-set-action="walkthrough-start"'), "Settings replay button");

    /* financial pages untouched */
    for (const p of ["home-page", "budget-page", "transactions-page", "savings-page", "m-cash-page", "reports-page", "settings-page"]) {
        assert.ok(html.includes('id="' + p + '"'), p + " intact");
    }
});

test("BP6 fail-open: auth-ui walkthrough guard holds ONLY on explicit { release: false }, consulted after BP5", () => {
    const authUi = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");
    const svc = fs.readFileSync(path.join(ROOT, "js/walkthrough/guided-walkthrough.js"), "utf8");
    const ui = fs.readFileSync(path.join(ROOT, "js/walkthrough/walkthrough-ui.js"), "utf8");

    /* the BP6 gate is consulted only AFTER ownership + setup have released */
    const ownIdx = authUi.indexOf("if (!ownershipReleased(lastSnapshot))");
    const setupIdx = authUi.indexOf("if (!setupReleased(lastSnapshot))");
    const wtIdx = authUi.indexOf("if (!walkthroughReleased(lastSnapshot))");
    assert.ok(ownIdx > 0 && setupIdx > ownIdx && wtIdx > setupIdx,
        "renderState checks ownership -> setup -> walkthrough in that order");
    assert.ok(/walkthroughReleased/.test(authUi) && /FAIL[- ]OPEN/i.test(authUi), "fail-open walkthrough logic present");
    const wtRel = authUi.slice(authUi.indexOf("function walkthroughReleased"), authUi.indexOf("function walkthroughReleased") + 500);
    assert.ok(/typeof walkthroughGuard !== "function"[^]{0,40}return true/.test(wtRel), "no guard -> release");
    assert.ok(/catch \(e\) \{[\s\S]{0,30}return true/.test(wtRel), "throwing guard -> release");
    assert.ok(/return result\.release !== false/.test(wtRel), "holds only on an explicit release:false");

    /* the walkthrough layer makes ZERO network / cloud calls */
    for (const [label, src] of [["guided-walkthrough.js", svc], ["walkthrough-ui.js", ui]]) {
        assert.ok(!/\bfetch\s*\(/.test(src), label + " has no fetch()");
        assert.ok(!/XMLHttpRequest|WebSocket|sendBeacon/.test(src), label + " has no XHR / WebSocket / sendBeacon");
        assert.ok(!/createClient|supabase\.|\.rpc\s*\(/.test(src), label + " has no Supabase usage");
        assert.ok(!/\.from\s*\(/.test(src) || /Array\.prototype|\.slice\.call/.test(src), label + " no Supabase .from()");
        assert.ok(!/setItem\s*\(\s*["'`]mWalletData|removeItem\s*\(\s*["'`]mWalletData/.test(src), label + " never writes mWalletData");
        assert.ok(!/sb_secret_|service_role/.test(src), label + " no secret key references");
    }
    assert.ok(!/\.innerHTML\s*=/.test(ui), "walkthrough-ui never assigns innerHTML");

    /* local-only metadata keys; never auto-toured for a legacy user */
    assert.ok(/mwallet\.walkthrough\.v1/.test(svc), "walkthrough record key");
    assert.ok(/mwallet\.walkthrough\.progress\.v1/.test(svc), "walkthrough progress key");
    assert.ok(/firstRunStatus\(\)\s*!==\s*"complete"/.test(svc), "auto-start requires BP5 status 'complete' (not 'existing')");
    assert.ok(/ownershipVerified\(\)/.test(svc), "BP4 ownership required before BP6");
});

/* =========================================================
   BP7 — CLOUD FINANCIAL DATA + RLS  (static / deployment)
   ========================================================= */

test("BP7 cloud modules: codec before store, both before the financial engine, sub-path safe", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const at = (needle) => html.indexOf(needle);

    const wtUiAt = at("js/walkthrough/walkthrough-ui.js?v=");
    const codecAt = at("js/cloud/cloud-financial-codec.js?v=");
    const storeAt = at("js/cloud/cloud-financial-store.js?v=");
    const storageAt = at("js/storage.js?v=");
    assert.ok(codecAt > 0 && storeAt > 0, "cloud scripts present");
    assert.ok(wtUiAt < codecAt, "cloud loads after the BP2-BP6 gate layers");
    assert.ok(codecAt < storeAt, "the pure codec loads before the store that uses it");
    assert.ok(storeAt < storageAt, "cloud capability loads before the local financial engine");

    /* GitHub Pages /M-Wallet/ sub-path safe — relative, never root-absolute */
    assert.ok(!/["'(]\/js\/cloud\//.test(html), "no root-absolute /js/cloud/ URL in index.html");
    assert.ok(/\.\/js\/cloud\/cloud-financial-codec\.js/.test(html), "codec loaded with a ./ relative URL");
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.ok(!/["']\/js\/cloud\//.test(sw), "no root-absolute /js/cloud/ URL in service-worker APP_SHELL");
});

test("BP7: the codec is a PURE module — no Supabase, network, storage, or DOM", () => {
    let src = fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-codec.js"), "utf8");
    src = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");   /* strip comments */
    assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|navigator\./.test(src), "no network");
    assert.ok(!/createClient|supabase|_getClient|\.rpc\s*\(|\.from\s*\(/.test(src), "no Supabase");
    assert.ok(!/localStorage\.|sessionStorage\.|\.getItem\s*\(|\.setItem\s*\(/.test(src), "no web storage");
    assert.ok(!/document\.getElementById|\.addEventListener\s*\(|\.innerHTML/.test(src), "no DOM");
    assert.ok(!/Math\.random|Date\.now\s*\(\)|new Date\s*\(\s*\)/.test(src), "deterministic — no ambient time/random");
});

test("BP7: the store is the ONLY module that queries wallet_documents, and never escalates privilege", () => {
    const raw = fs.readFileSync(path.join(ROOT, "js/cloud/cloud-financial-store.js"), "utf8");
    const store = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");   /* strip comments */
    /* reuse of the ONE authenticated client, never a second one */
    assert.ok(/MWalletAuth\b/.test(store) && /\._getClient\s*\(\s*\)/.test(store), "reuses MWalletAuth._getClient()");
    assert.ok(!/createClient|new\s+SupabaseClient|auth-client/.test(store), "builds no second client");
    /* callers never supply ownership; the DB default + RLS own it */
    assert.ok(!/user_id\s*:/.test(store), "the store never sets user_id in a row it sends");
    assert.ok(!/service_role|sb_secret_|serviceRole|adminQuery|\bsetUserId\b|overrideOwner|hardDelete/.test(store),
        "no privileged / owner-override / hard-delete surface");
    /* safe logging only */
    assert.ok(!/console\.(log|info|warn|error|debug)\([^)]*(payload|token|session|user_id|password)/i.test(store),
        "never logs a payload / token / owner id");

    /* every other JS file stays away from the table + the raw client */
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { return walk(full); }
        return e.isFile() && e.name.endsWith(".js") ? [full] : [];
    });
    for (const file of walk(path.join(ROOT, "js"))) {
        if (file.endsWith("js/cloud/cloud-financial-store.js")) { continue; }
        const src = fs.readFileSync(file, "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");   /* strip comments */
        assert.ok(!/\.from\s*\(\s*["'`]wallet_documents/.test(src),
            path.relative(ROOT, file) + " must not query wallet_documents directly");
    }
});

test("BP7: no cloud source file embeds a credential", () => {
    for (const file of ["js/cloud/cloud-financial-codec.js", "js/cloud/cloud-financial-store.js",
        "supabase/migrations/20260831_bp7_wallet_documents.sql"]) {
        const src = fs.readFileSync(path.join(ROOT, file), "utf8");
        assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(src), file + " embeds no JWT");
        assert.ok(!/sb_secret_[A-Za-z0-9]/.test(src), file + " embeds no secret key");
        assert.ok(!/sb_publishable_[A-Za-z0-9]{12,}/.test(src), file + " embeds no real publishable key");
        assert.ok(!/[a-z0-9]{20}\.supabase\.co/i.test(src), file + " embeds no project URL");
    }
});

test(".gitignore excludes the local auth config override + BP7 verifier env files", () => {
    const gi = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    assert.ok(gi.includes("js/auth/auth-config.local.js"));
    assert.ok(/^\.env$/m.test(gi) && /^\.env\./m.test(gi), ".env / .env.* ignored for the BP7 live RLS verifier");
    assert.ok(/!\.env\.example/.test(gi), ".env.example stays tracked");
});

/* =========================================================
   BP8 — LOCAL-FIRST SYNC  (static / deployment)
   ========================================================= */

test("BP8: the sync release gate ships DISABLED and carries no credential", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/sync/sync-release.js"), "utf8");
    assert.ok(/enabled:\s*false/.test(src), "committed default is enabled:false");
    assert.ok(/verificationPhase:\s*["']BP12["']/.test(src), "points at BP12 verification");
    assert.ok(!/sb_secret_|service_role|eyJ[A-Za-z0-9_-]{20,}\./.test(src), "no credential");
    /* the only 'true' near enabled must be a test override, never the base */
    assert.ok(!/BASE\s*=\s*\{[^}]*enabled:\s*true/.test(src), "BASE never enables sync");
});

test("BP8: a NORMAL browser build has NO way to enable sync (no public override, no runtime switch)", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/sync/sync-release.js"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

    /* no query-string / localStorage / Settings / hostname switch */
    assert.ok(!/location\.search|URLSearchParams|location\.hostname|localhost/.test(code), "no url / hostname switch");
    assert.ok(!/localStorage|sessionStorage/.test(code), "no web-storage switch");

    /* load it WITHOUT the pre-load test opt-in -> setOverride must not exist */
    const prod = { window: {}, console };
    prod.self = prod.window;
    vm.createContext(prod);
    vm.runInContext(src, prod, { filename: "sync-release.js" });
    const R = prod.window.MWalletSyncRelease;
    assert.equal(R.isEnabled(), false, "disabled by default");
    assert.equal(typeof R.setOverride, "undefined", "no setOverride in a normal build");
    assert.ok(!("__testEnv" in R), "not flagged as a test env");
    /* even setting the flag AFTER load does nothing */
    prod.window.__MWALLET_TEST_ENV__ = true;
    assert.equal(typeof R.setOverride, "undefined", "the flag is read once, at load — too late now");
    assert.equal(R.isEnabled(), false);

    /* WITH the pre-load opt-in -> the test override is available */
    const testEnv = { window: { __MWALLET_TEST_ENV__: true }, console, __MWALLET_TEST_ENV__: true };
    testEnv.self = testEnv.window;
    vm.createContext(testEnv);
    vm.runInContext(src, testEnv, { filename: "sync-release.js" });
    const RT = testEnv.window.MWalletSyncRelease;
    assert.equal(typeof RT.setOverride, "function", "test harness can still enable the engine");
    assert.equal(RT.isEnabled(), false, "still off until explicitly overridden");
    RT.setOverride({ enabled: true });
    assert.equal(RT.isEnabled(), true, "enabled test mode works");
    RT.setOverride(null);
    assert.equal(RT.isEnabled(), false);
});

test("BP8: no js/ file reads a sync-enable switch from url / localStorage / a setting", () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) { return walk(full); }
        return e.isFile() && e.name.endsWith(".js") ? [full] : [];
    });
    for (const file of walk(path.join(ROOT, "js/sync"))) {
        const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        assert.ok(!/setOverride\s*\(\s*\{\s*enabled:\s*true/.test(src),
            path.relative(ROOT, file) + " never turns sync on itself");
    }
});

test("BP8: sync modules load after the cloud store, before the financial engine, sub-path safe", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    const at = (n) => html.indexOf(n);
    const storeAt = at("js/cloud/cloud-financial-store.js?v=");
    const relAt = at("js/sync/sync-release.js?v=");
    const stateAt = at("js/sync/sync-state.js?v=");
    const planAt = at("js/sync/sync-planner.js?v=");
    const engAt = at("js/sync/sync-engine.js?v=");
    const uiAt = at("js/sync/sync-ui.js?v=");
    const storageAt = at("js/storage.js?v=");
    assert.ok(relAt > storeAt, "sync loads after the cloud store");
    assert.ok(relAt < stateAt && stateAt < planAt && planAt < engAt && engAt < uiAt, "release -> state -> planner -> engine -> ui");
    assert.ok(uiAt < storageAt, "sync loads before the financial engine");
    assert.ok(!/["'(]\/js\/sync\//.test(html), "no root-absolute /js/sync/ URL in index.html");
    const sw = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
    assert.ok(!/["']\/js\/sync\//.test(sw), "no root-absolute /js/sync/ URL in the service worker");
});

test("BP8: the pure modules make no network / storage / DOM access", () => {
    for (const file of ["js/sync/sync-planner.js"]) {
        let src = fs.readFileSync(path.join(ROOT, file), "utf8")
            .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(src), file + " no network");
        assert.ok(!/localStorage\.|\.setItem\s*\(|\.getItem\s*\(/.test(src), file + " no storage");
        assert.ok(!/document\.getElementById|addEventListener/.test(src), file + " no DOM");
        assert.ok(!/\.from\s*\(\s*["'`]wallet_documents|createClient/.test(src), file + " no Supabase");
    }
});

test("BP8: the sync engine + release + planner + state embed no credential and never log a payload", () => {
    for (const file of ["js/sync/sync-release.js", "js/sync/sync-state.js", "js/sync/sync-planner.js",
        "js/sync/sync-engine.js", "js/sync/sync-ui.js"]) {
        const raw = fs.readFileSync(path.join(ROOT, file), "utf8");
        const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
        assert.ok(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./.test(raw), file + " embeds no JWT");
        assert.ok(!/sb_secret_[A-Za-z0-9]|service_role/.test(src), file + " no privileged key");
        assert.ok(!/[a-z0-9]{20}\.supabase\.co/i.test(raw), file + " no project URL");
        assert.ok(!/console\.(log|info|warn|error|debug)\s*\([^)]*(payload|balance|ownerUserId|access_token|refresh_token)/i.test(src),
            file + " never logs a payload / owner id / token");
    }
});

test("BP8: js/storage.js dispatches ONE post-save event and keeps its sync return contract", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8");
    assert.ok(/mwallet:financial-saved/.test(src), "emits mwallet:financial-saved");
    assert.ok(/detail:\s*\{\s*source:\s*["']local["']\s*\}/.test(src), "detail carries no financial payload");
    assert.ok(/saveSilently/.test(src) && /_suppressFinancialSaved/.test(src), "load()'s normalization re-save is suppressed");
    /* save() still returns a boolean synchronously (no async, no throw) */
    assert.ok(/save\(data\)\s*\{[\s\S]*?return true;[\s\S]*?return false;/.test(src), "save() still returns true/false");
    assert.ok(!/async\s+save\s*\(/.test(src), "save() is not async");
});

test("BP8: auth-ui gate order is ownership -> BOOTSTRAP -> setup -> walkthrough", () => {
    const src = fs.readFileSync(path.join(ROOT, "js/auth/auth-ui.js"), "utf8");
    const o = src.indexOf("ownershipReleased(lastSnapshot)");
    const b = src.indexOf("bootstrapReleased(lastSnapshot)");
    const s = src.indexOf("setupReleased(lastSnapshot)");
    const w = src.indexOf("walkthroughReleased(lastSnapshot)");
    assert.ok(o > 0 && b > 0 && s > 0 && w > 0, "all four gate checks present");
    assert.ok(o < b && b < s && s < w, "BP8 bootstrap sits between BP4 ownership and BP5 setup");
    /* bootstrap guard is fail-open like BP5/BP6 */
    const rel = src.slice(src.indexOf("function bootstrapReleased"), src.indexOf("function setupReleased"));
    assert.ok(/typeof bootstrapGuard !== "function"[^]{0,40}return true/.test(rel), "no guard -> release");
    assert.ok(/catch \(e\) \{[\s\S]{0,30}return true/.test(rel), "throwing guard -> release");
    assert.ok(/return result\.release !== false/.test(rel), "holds only on explicit release:false");
});

test("BP8: index.html has the bootstrap gate + conflict overlay markup, starting hidden", () => {
    const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
    assert.ok(/id="mw-sync-bootstrap"[\s\S]{0,200}\bhidden\b/.test(html), "#mw-sync-bootstrap starts hidden");
    assert.ok(/id="mw-sync-conflicts"[\s\S]{0,200}\bhidden\b/.test(html), "#mw-sync-conflicts starts hidden");
    assert.ok(/data-sync-action="bootstrap-retry"/.test(html) && /data-sync-action="bootstrap-offline"/.test(html));
    assert.ok(/href="\.\/css\/sync\.css/.test(html), "sync.css linked");
    /* financial pages untouched */
    for (const p of ["home-page", "budget-page", "transactions-page", "savings-page", "m-cash-page", "reports-page", "settings-page"]) {
        assert.ok(html.includes('id="' + p + '"'), p + " intact");
    }
    /* the Settings sync row never says "backed up" */
    assert.ok(/id="settings-sync-panel"/.test(html));
    assert.ok(!/Backed up|backed up/.test(html.slice(html.indexOf("settings-sync-panel"), html.indexOf("settings-sync-panel") + 600)));
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
