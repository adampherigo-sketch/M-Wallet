# BP9 — Passkeys / Device Authentication

**Status:** implementation complete; **passkey release gate ships OFF**. Live
WebAuthn / passkey verification against a real Supabase project + real devices —
and the choice of the permanent production **RP ID** — is **deferred to BP12**
and is a **hard release gate before BP13 closed beta**.
**Version:** `0.9.0-beta.8` · **Cache:** `m-wallet-v28`

---

## What a passkey is

A passkey is an asymmetric credential (a key pair) created by your device or
password manager. The **private key never leaves the authenticator**; only a
signed challenge is sent to the server, which verifies it against the stored
public key. There is no shared secret to phish or leak.

```
device / password manager  →  private key stays with the authenticator
                           →  WebAuthn ceremony (the OS asks you to verify)
                           →  signed challenge  →  Supabase Auth  →  public-key check
                           →  a normal Supabase session  →  M-Wallet's normal auth gates
```

### Passkey vs password

| | Passkey | Password |
| --- | --- | --- |
| What you do | Approve a device prompt (Face ID / Touch ID / Windows Hello / PIN / security key) | Type a secret |
| Phishing-resistant | **Yes** — bound to the site's origin / relying party | No |
| Stored by M-Wallet | Nothing | Nothing (Supabase handles it) |
| Recovery role in this beta | **None** — passkeys are an *alternative* sign-in method | Password + email reset is the recovery path |

Passkeys are **additive**. Email + password sign-in and password reset are never
removed. A passkey failure never locks you out of M-Wallet.

---

## What M-Wallet does and does not receive

**M-Wallet does not receive your fingerprint, your face scan, a facial image, or
any biometric template.** WebAuthn and your operating system perform the user
verification. The authenticator may ask for Face ID, Touch ID, Windows Hello, a
device PIN, an Android screen lock, a password-manager confirmation, or a
security key — M-Wallet only ever receives a WebAuthn *credential result*, not
biometric data. Supabase does not receive biometric data either.

The feature is worded **"Use a passkey"**, never "Face ID Login" — not every
device uses Face ID.

### Private key custody

Passkey private keys are managed by your authenticator / device / password
manager and are **not stored by M-Wallet**. Note that **synced passkeys** (e.g.
iCloud Keychain, a cross-platform password manager) may be synchronized across
your devices by that provider — a passkey is not always physically restricted to
one device.

### Phishing resistance — not magic

Passkeys are phishing-resistant because the credential is bound to the WebAuthn
relying-party / origin. They are **not** "impossible to hack" and **not** "100%
secure".

---

## BP9 architecture

| File | Global | Responsibility |
| --- | --- | --- |
| `js/auth/passkey-release.js` | `MWalletPasskeyRelease` | The activation gate. **Ships `enabled: false`.** No credentials, no RP ID. **No production enable path** — `setOverride` exists only when a test harness set `window.__MWALLET_TEST_ENV__ = true` *before* the script loaded. No query-string / localStorage / Settings / hostname switch. BP12 flips `BASE.enabled` itself. |
| `js/auth/passkeys.js` | `MWalletPasskeys` | Adapter over the vendored Supabase passkey API. No DOM. `initialize / getState / getCapabilities / signIn / register / list / rename / remove / diagnostics`. Reuses the **one** existing Supabase client via `MWalletAuth._getClient()` — never `createClient`, a token, or a direct fetch. Never calls `navigator.credentials` itself — the Supabase high-level methods own the ceremony. Returns only safe result objects and safe error codes. |
| `js/auth/passkey-ui.js` | `MWalletPasskeyUI` | The "Use a Passkey" gateway control (sign-in view), the Settings → Passkeys section (status, Add, list, Rename, Remove), and the removal-confirmation dialog. `textContent` only. |
| `css/passkeys.css` | — | Styling. Reuses `.mw-auth-*` / `.z-*`. |

The vendored client (`@supabase/supabase-js` 2.112.4) already includes the
passkey API. `js/auth/auth-client.js` adds `auth: { experimental: { passkey:
true } }` to the **existing** `createClient` call — this only makes the methods
*callable*; it triggers no passkey or WebAuthn activity, and `MWalletAuth.getState().user`
gains two non-sensitive booleans (`confirmed`, `isAnonymous`) that the enrollment
guard needs.

---

## The release gate

While `MWalletPasskeyRelease.isEnabled()` is `false` (the committed default):

- **no** `registerPasskey` / `signInWithPasskey` / `passkey.list|update|delete` call
- **no** `navigator.credentials` call
- **no** automatic passkey prompt, **no** conditional-UI / autofill request
- the "Use a Passkey" gateway control is **not shown** to normal users
- Settings → Passkeys shows *"Built — activation pending security verification"*
  with no button that can start a WebAuthn ceremony

Nothing about passkeys activates from module load, from `SIGNED_IN`, or after
signup. Enrollment and sign-in are always explicit user actions.

BP9 is **not MFA**. Passkey sign-in is used as a passwordless *first-factor*
method, not a second factor. No TOTP / phone MFA is added.

---

## Feature detection

`MWalletPasskeys.getCapabilities()` reports (without any network / WebAuthn call):

```
{ releaseEnabled, webAuthnSupported, secureContext, configured,
  passkeyApiSupported, managementApiSupported, platformAuthenticatorHint, available }
```

`webAuthnSupported` requires `window.PublicKeyCredential` plus
`navigator.credentials.create` / `.get`. A **missing built-in platform
authenticator is not a blocker** — the user may have a security key or a synced /
cross-device passkey; `platformAuthenticatorHint` is diagnostic only. `available`
is true only when the release gate is on **and** the browser + client support it
**and** the context is secure (HTTPS).

There is no insecure-HTTP production fallback. Local development is truthful: an
arbitrary LAN HTTP address is not treated as passkey-ready.

---

## RP ID / origin model

**The WebAuthn relying-party ID (RP ID) is NOT hard-coded in M-Wallet
JavaScript.** It belongs in Supabase project configuration
(Authentication → Passkeys: RP display name, RP ID, allowed origins).

> ### ⚠️ DO NOT ENROL REAL BETA-USER PASSKEYS UNTIL THE PRODUCTION RP ID IS FINAL
>
> Changing the RP ID later makes every passkey enrolled before the change
> **unusable**. This warning must stay on the BP12 release checklist.

The current deployment is a GitHub Pages **project URL**
(`https://adampherigo-sketch.github.io/M-Wallet/`). This is **not** automatically
the final RP ID. Before any real passkey is enrolled, the operator must choose
the permanent production host. WebAuthn is origin / RP based:

- the relying-party configuration must match the production host
- a path such as `/M-Wallet/` is **not** a separate WebAuthn origin
- `localhost` development and the production domain cannot be assumed to share
  one RP configuration
- real passkey validation must happen against the actual intended HTTPS
  deployment whose host matches the RP configuration

Do not attempt to bypass WebAuthn origin checks.

---

## Passkey management

When the gate is on and the user is signed in, Settings → Passkeys uses the
official API:

- **List** — `client.auth.passkey.list()`. The server list is held **in memory
  only**, never persisted to `localStorage`. It is fetched once when the section
  is shown, and again after add / rename / remove — never on a timer, never on
  every render.
- **Rename** — `client.auth.passkey.update({ passkeyId, friendlyName })`.
  Friendly names: trimmed, non-empty, ≤ 120 characters, rendered with
  `textContent`. Never auto-filled with an email, user id, or financial data.
  The new name is not shown as final until the server confirms.
- **Remove** — `client.auth.passkey.delete({ passkeyId })` behind an **explicit
  confirmation** ("Remove this passkey? … Your email and password sign-in will
  remain available."). One confirmation removes exactly one passkey. A failed
  delete keeps the item (no optimistic removal).

Only safe metadata is shown (friendly name, created / last-used dates). Raw
public keys, credential binaries, challenges, tokens, and internal session
objects are never rendered or logged. Credential IDs exist transiently inside the
adapter because the API needs them, and are never displayed or logged.

### Last passkey

M-Wallet accounts always retain email + password, so removing the **last**
passkey is not a lockout — it is allowed after the explicit confirmation. *(If a
future audit finds that users can exist without a password, last-credential
protection must be redesigned.)*

---

## Coordination with the other layers

Passkeys answer **"who is signing in?"** only. They are independent of:

- **BP4** — "does this authenticated user own the local wallet?" A
  passkey-authenticated User B still hits `owner_mismatch` on User A's device;
  no app release, no sync, no financial data shown.
- **BP7 RLS** — "can this user access this cloud financial row?"
- **BP8 sync** — "how do financial documents synchronize?" `MWalletSyncRelease`
  stays `false`; no passkey code references it. A passkey sign-in opens the
  normal local wallet after BP4 verification.

A successful passkey sign-in enters the **same** gate chain as a password
sign-in: `AUTH → BP4 ownership → BP8 bootstrap → BP5 setup → BP6 walkthrough →
APP`. The adapter never creates a session itself — Supabase sets it and fires
`onAuthStateChange`, and the existing BP2/BP3 pipeline takes over. Password
recovery still wins: during recovery mode, passkey sign-in / enrollment /
management are all unavailable.

---

## Errors

Authenticator dialogs are frequently cancelled — that is **not** a fatal error.
Raw `DOMException` / Supabase text is never shown. The adapter maps to a fixed
set of safe codes: `user_cancelled`, `no_passkey_available`, `unsupported`,
`insecure_context`, `not_configured`, `project_not_enabled`, `network_error`,
`auth_failed`, `management_failed`, `invalid_name`, `busy`, `recovery_mode`,
`signed_out`, `not_confirmed`, `anonymous`, `disabled`, `unknown_error`.
A cancelled sign-in reads simply: *"Passkey sign-in was cancelled."*

An unsupported browser: *"Passkeys are not supported in this browser"* — the
account is not implied to be broken, and password sign-in remains available.

---

## Not end-to-end encryption

Passkeys improve **authentication**. They do **not** encrypt cloud financial
documents. **RLS ≠ E2EE** still stands: cloud financial payloads are protected by
Row Level Security / access control, **not** zero-knowledge, **not**
end-to-end encrypted.

---

## BP12 live passkey verification

**Do NOT run any of this during BP9.** This is the BP12 procedure.

1. Decide the final, permanent M-Wallet production hostname / domain.
2. Confirm it is served over HTTPS.
3. Confirm the WebAuthn relying-party strategy for that host.
4. Open the Supabase M-Wallet Beta project → **Authentication** → **Passkeys**.
5. **Enable** passkey authentication.
6. Set **RP Display Name**: `M-Wallet`.
7. Set the final **RP ID** (the chosen production host).
8. Configure the exact allowed production origin(s).
9. Save. Use the normal publishable client config — **never `service_role`**.
10. Build a BP12 verification build with the passkey release gate flipped on
    (`BASE.enabled = true` in `passkey-release.js`).
11. On Device A: register a passkey.
12. Sign out.
13. Sign in using the passkey (no email typed).
14. Verify the BP4 ownership gate still runs.
15. Verify email + password sign-in still works.
16. Verify password reset still works.
17. Register a second passkey; rename one; delete one; verify the remaining one
    still signs in.
18. Verify the unsupported-browser fallback (a browser without WebAuthn).
19. Verify cancellation is friendly.
20. Verify wrong-origin / wrong-RP protections reject the ceremony.
21. Test Safari / macOS, Safari / iPhone, Chrome / macOS, Chrome / Windows,
    Chrome / Android — where available. Do not fake results for unavailable
    devices.
22. For each: platform passkey, synced passkey, PIN / Windows Hello, security
    key, cancel, no-credential, sign-out, recovery, account switch.
23. Inspect network / logs / Cache Storage / token behaviour — no credential,
    token, or WebAuthn response is cached or logged.
24. **Only after every check PASSES**, decide whether to enable the production
    passkey release for BP13 closed beta.

If any check fails: **passkey release remains OFF.**

---

## Still pending (tracked to their phases)

- **BP9 — live WebAuthn / passkey verification + final RP ID** → BP12; hard gate
  before BP13.
- **BP8 — live multi-device sync verification** → BP12.
- **BP7 — migration application + two-user RLS attack test** → BP12.
- **BP3 — live Supabase signup / verification / password-reset round trip.**
- **BP4 — live multi-account ownership verification.**
