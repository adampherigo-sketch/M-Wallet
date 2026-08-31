"use strict";

/* =========================================================
   BP9 — PASSKEY CAPABILITY DETECTION

   getCapabilities() must reflect the browser + Supabase client
   reality without making any network or WebAuthn call, and
   must NOT treat "no platform authenticator" as "no passkeys".
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const { createPasskeyEnv } = require("./helpers/passkey-harness.js");

function caps(env) { return JSON.parse(JSON.stringify(env.P.getCapabilities())); }


test("full support: enabled + WebAuthn + secure context + API present -> available", () => {
    const env = createPasskeyEnv({ webAuthnSupported: true, secureContext: true });
    env.enable();
    const c = caps(env);
    assert.equal(c.webAuthnSupported, true);
    assert.equal(c.secureContext, true);
    assert.equal(c.passkeyApiSupported, true);
    assert.equal(c.managementApiSupported, true);
    assert.equal(c.available, true);
});

test("release disabled -> not available even with full browser support", () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    /* not enabled */
    const c = caps(env);
    assert.equal(c.releaseEnabled, false);
    assert.equal(c.available, false);
});

test("PublicKeyCredential absent -> webAuthnSupported false, not available", () => {
    const env = createPasskeyEnv({
        webauthn: () => ({ webAuthnSupported: false, secureContext: true })
    });
    env.enable();
    const c = caps(env);
    assert.equal(c.webAuthnSupported, false);
    assert.equal(c.available, false);
});

test("navigator.credentials absent -> not available", () => {
    const env = createPasskeyEnv({
        webauthn: () => ({ webAuthnSupported: false, secureContext: true })
    });
    env.enable();
    assert.equal(caps(env).available, false);
});

test("insecure context -> not available", () => {
    const env = createPasskeyEnv({
        webauthn: () => ({ webAuthnSupported: true, secureContext: false })
    });
    env.enable();
    const c = caps(env);
    assert.equal(c.secureContext, false);
    assert.equal(c.available, false);
});

test("Supabase passkey API absent -> passkeyApiSupported false, not available", () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    /* strip the passkey methods from the client */
    env.authApi._getClient = () => ({ auth: { onAuthStateChange: () => ({}) } });
    const c = caps(env);
    assert.equal(c.passkeyApiSupported, false);
    assert.equal(c.available, false);
});

test("management API absent but sign-in present -> managementApiSupported false", () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    env.authApi._getClient = () => ({ auth: {
        signInWithPasskey: () => {}, registerPasskey: () => {}
        /* no .passkey */
    } });
    const c = caps(env);
    assert.equal(c.passkeyApiSupported, true);
    assert.equal(c.managementApiSupported, false);
});

test("a missing built-in platform authenticator does NOT disable passkeys", () => {
    /* the user may still have a security key or a synced/cross-device passkey */
    const env = createPasskeyEnv({
        webAuthnSupported: true, secureContext: true,
        webauthn: () => ({
            webAuthnSupported: true, secureContext: true,
            platformAuthenticatorHint: false   /* diagnostic only */
        })
    });
    env.enable();
    const c = caps(env);
    assert.equal(c.platformAuthenticatorHint, false);
    assert.equal(c.available, true, "still available — platform-authenticator hint is not a gate");
});

test("capability detection performs no network / WebAuthn call", () => {
    const env = createPasskeyEnv({ webAuthnSupported: true });
    env.enable();
    env.P.getCapabilities();
    env.P.getState();
    env.P.diagnostics();
    assert.equal(env.supa.calls.length, 0, "zero Supabase calls from capability checks");
});

test("diagnostics never expose an email / user id / token", () => {
    const env = createPasskeyEnv({
        webAuthnSupported: true,
        auth: { user: { id: "secret-uuid-123", email: "leak@example.com", confirmed: true } }
    });
    env.enable();
    const blob = JSON.stringify(env.P.diagnostics()) + JSON.stringify(env.P.getState());
    assert.ok(!blob.includes("secret-uuid-123"));
    assert.ok(!blob.includes("leak@example.com"));
    assert.ok(!/token|bearer|authorization/i.test(blob));
});
