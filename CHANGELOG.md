# Changelog

All notable changes to M-Wallet. This project follows semantic versioning with
a pre‑release channel: `0.9.0-beta.1` → `0.9.0-beta.2` → `0.9.1-beta.1` → …

Entries below the first version are historical milestones drawn from the Git
history; they predate formal version tagging and are grouped by the phase name
used in their commits.

---

## [Unreleased]

### BP11 — Beta operations + feedback (`0.9.0-beta.9` → `0.9.0-beta.10`)

Tooling to run M-Wallet as a professional closed beta: a **Beta Hub** in
Settings, a structured **user-initiated** feedback / bug-report flow with
optional privacy-safe diagnostics, a known-issues registry, curated release
notes, and the tester + triage documentation. **This is not telemetry** —
M-Wallet still has no analytics or advertising trackers, and BP11 keeps it that
way: feedback is sent **only** when the tester presses Send, and only when a
feedback destination is configured.

- **New modules** — `js/beta/beta-config.js` (`MWalletBetaConfig` — public deploy
  config; committed `feedbackEndpoint: null`, `supportEmail: null`; no secret),
  `js/beta/beta-known-issues.js` (`MWalletBetaKnownIssues` — curated static
  registry, empty for beta.10, honest empty state), `js/beta/beta-ops.js`
  (`MWalletBetaOps` — build summary, **sanitised diagnostics**, live-derived beta
  limitations, `MWB-<uuid>` report-id generator, curated release notes; no DOM),
  `js/beta/beta-feedback.js` (`MWalletBetaFeedback` — validation, versioned
  payload, and the **single** network boundary `submit()`; no DOM),
  `js/beta/beta-ui.js` (`MWalletBetaUI` — Beta Hub + feedback / known-issues /
  what's-new dialogs; fails open). New `css/beta.css`.
- **Report format** — `{ format: "m-wallet-beta-feedback", formatVersion: 1,
  reportId, createdAt, appVersion, channel, category, severity, title,
  description, stepsToReproduce, expectedBehavior, actualBehavior, contactEmail,
  diagnostics }`. `formatVersion` is independent of the app / wallet / export
  versions. Field limits: title 120, description 5000, steps/expected/actual
  3000, email 254; whole report capped at 48 KiB. Text is trimmed, CRLF→LF, null
  bytes stripped; rendered with `textContent` only.
- **Safe diagnostics (opt-in, unchecked by default)** — app version, channel,
  current screen, online, standalone, SW-controlled, viewport, user-agent
  string, language, auth *state label*, sync/passkey release flags, feedback-
  configured flag. Previewable before sending. **Never** wallet data, balances,
  transactions, aggregate financial counts, user UUID, owner id, account email
  (unless separately opted in), tokens, sessions, passkey/sync ids, localStorage,
  or cookies.
- **Transport** — `submit()` is the only outbound network call in the app: one
  `POST` of JSON, HTTPS-only (`http:`/`javascript:`/`data:`/`file:`/`ftp:`/`ws:`
  rejected), `credentials: "omit"`, `~15 s` `AbortController` timeout, **no
  retry, no background queue, no auto-resend on reconnect**. 4xx and 5xx both map
  to `server_error`; raw bodies and fetch exceptions are never shown; only a
  short plain `reference` string is accepted, else the local `reportId` is used.
  Double-clicking Send yields one request.
- **Manual fallback** — Copy (plain text to clipboard) and Download
  (`m-wallet-feedback-<reportId>.json` via Blob + object URL) never use the
  network and work offline. No feedback draft is written to `localStorage` —
  form state is in memory only; a refresh loses it (by design).
- **Auth-gateway reporting** — a "Report a beta problem" control on the sign-in
  screen opens the same privacy-safe dialog while signed out / in an auth error /
  on the verify screen. Authentication never depends on feedback code.
- **Beta Hub (Settings)** — program name + version, "Report a beta problem",
  feedback-delivery status, known issues, what's new, current beta limitations
  (derived truthfully from the live release gates), and support status (the
  configured email, or "Direct support contact has not been configured for this
  build").
- **Service worker** — `m-wallet-v29` → `m-wallet-v30`; `APP_SHELL` adds
  `css/beta.css` + the five `js/beta/*` modules. The feedback `POST` is
  non-GET **and** cross-origin, so the SW returns early for it — its request and
  response never touch Cache Storage.
- **Version** — `0.9.0-beta.9` → `0.9.0-beta.10` (`js/app-version.js` +
  `package.json`).
- **Legacy `storage.exportData` / `importData` / `clearAllData`** — unchanged;
  BP11 adds nothing that reaches them.
- **Docs** — new `docs/BP11-BETA-OPERATIONS.md`, `docs/BETA-TESTER-GUIDE.md`,
  `docs/BETA-ISSUE-TRIAGE.md`. The closed-beta access model is documented as
  **server-side only** — no front-end allowlist exists or is planned.
- **Tests** — `758` → `840`. New: `tests/beta-config.test.js`,
  `tests/beta-ops.test.js`, `tests/beta-feedback.test.js`,
  `tests/beta-known-issues.test.js`, `tests/beta-ui.test.js`,
  `tests/beta-integrity.test.js` (+ `tests/helpers/beta-harness.js`), plus BP11
  static checks in `tests/auth-architecture.test.js`. No test sends real
  feedback; no live endpoint verification yet.
- **Status** — **IMPLEMENTATION COMPLETE — LIVE FEEDBACK-ENDPOINT VERIFICATION
  DEFERRED TO BP12.** BP11 closes no release gate. Not enabled: BP8 sync, BP9
  passkeys. Still pending: everything already deferred to BP12/BP13 plus a
  configured + verified feedback destination.

### BP10 — Account, privacy & recovery controls (`0.9.0-beta.8` → `0.9.0-beta.9`)

Settings becomes a trustworthy **account-management centre**: change email,
change password, sign out (this device / everywhere), export a wallet backup,
restore from a backup, erase this device's wallet, and an honest privacy
statement. **Core rule: account management never silently destroys financial
data** — every destructive action is explicit, scoped, confirmed, truthful, and
recoverable where reasonable. No account action modifies `mWalletData`.

- **New modules** — `js/account/account-controls.js`
  (`window.MWalletAccount` — DOM-free API: `getSummary`, `changeEmail`,
  `sendPasswordReset`, `signOut`/`signOutEverywhere`, `exportWallet`,
  `inspectImport`, `restoreWallet`, `eraseLocalWallet`, `diagnostics`) and
  `js/account/account-ui.js` (`window.MWalletAccountUI` — Settings sections +
  the change-email / restore-preview / erase dialogs). New `css/account.css`.
  Account logic no longer piles into `settings-ui.js`.
- **auth.js (`?v=4` → `?v=5`)** — adds `updateEmail(newEmail)` (through the ONE
  existing Supabase client: `auth.updateUser({ email }, { emailRedirectTo })`;
  Supabase emails the **new** address to confirm; guarded against recovery mode /
  signed-out / same-email). `signOut(opts)` now accepts
  `{ scope: "local" | "global" | "others" }` and passes it through. **No second
  client.**
- **Export** — `m-wallet-export-YYYY-MM-DD.json`, wrapper
  `{ format:"m-wallet-export", formatVersion:1, createdAt, appVersion, wallet }`.
  `formatVersion` is **separate** from the `mWalletData` schema version. Reads the
  **raw** stored string (never `storage.load()`), so `mWalletData` is
  byte-identical before/after. Excludes every auth / token / config / owner /
  setup / walkthrough / sync / passkey artifact. `Blob` + object URL + temporary
  anchor, revoked after; **no network**. **Not encrypted — the UI says so.**
- **Restore** — choose file → parse → validate wrapper → validate financial
  schema → **counts-only preview** (no raw rows) → explicit confirmation →
  `storage.normalizeData` (the canonical migrator) → `storage.save` → verify
  reload → clear `mwallet.sync.state.v1` → rebind ownership from the
  **signed-in** user (never from the file; stray identity keys stripped) →
  re-resolve BP5 → refresh. Rejects: bad JSON, wrong wrapper, future export
  version, missing/malformed wallet, `__proto__`/`prototype`/`constructor` keys,
  non-finite numbers, `> 5 MiB`, future schema. Replace (not merge); refuses on
  `owner_mismatch`; a failed write leaves the previous wallet intact.
- **Erase wallet from this device** — labelled as such, **never "Delete
  account"**. Two-step: warning (with "Export a backup first") → type `ERASE` →
  final button. Removes `mWalletData` + every owner-bound sidecar (keys read from
  each module's own export), **verifies each is gone**, then signs out so the
  session cannot auto-reclaim. Reports `erase_incomplete` rather than claiming
  success. **Never `localStorage.clear()`**; keeps `mwallet.auth.config` and
  unrelated site data.
- **Account deletion — NOT IMPLEMENTED.** Supabase Auth deletion needs
  `auth.admin` / `service_role`; a browser admin credential would be insecure and
  this static PWA has no trusted server. Settings shows an honest "not available"
  status; `docs/BP10-ACCOUNT-PRIVACY-RECOVERY.md` documents the future secure
  server-side sequence. **Hard release gate.**
- **Final destructive-data hardening.** *Restore* now resets the BP8 sync
  metadata and **verifies it is gone before** replacing `mWalletData` — an
  unverifiable reset aborts with `sync_reset_failed` and the existing wallet
  stays authoritative (no old cloud baseline attached to new contents). Ownership
  after restore **reuses** the already-verified BP4 record rather than rewriting
  it. Post-save experience re-resolution is fail-open. *Erase* deletes the
  primary financial key **last**: owner-bound sidecars → legacy financial keys →
  ownership → `mWalletData`, verifying each; any failure **before** `mWalletData`
  stops with `erase_incomplete` + `walletPreserved: true` and the real wallet is
  kept. The erase flow no longer refreshes the app or re-resolves BP4/BP5 (no
  in-flight wallet recreation). A sign-out failure after a verified erase returns
  a distinct `erased_signout_failed` (`erased: true`) — the UI never implies the
  wallet still exists and `mWalletData` is never recreated to roll back.
- **Privacy section** — truthful local-vs-cloud, **RLS ≠ E2EE**, exported
  backups are plaintext, and (analytics audit **CLEAN**) *"M-Wallet currently
  does not include analytics or advertising trackers."*
- **Settings** — new Account / Security & Recovery / My Data / Privacy sections;
  the old one-tap **Export / Import / Reset** buttons (`#export-data`,
  `#settings-import-*`, `#clear-data`) and the `js/app.js` `exportBudgetData` /
  `resetBudgetData` + `js/settings-ui.js` `handleImportFile` paths are **removed**
  (superseded). `settings-ui.js` `?v=10` → `?v=11`; `app.js` `?v=10` → `?v=11`.
- **Version / cache** — `0.9.0-beta.8` → `0.9.0-beta.9`; `m-wallet-v28` →
  `m-wallet-v29`; `APP_SHELL` adds `css/account.css` +
  `js/account/account-controls.js` + `js/account/account-ui.js`. Cross-origin
  bypass unchanged; Supabase responses never cached.
- **Tests** — `671` → `758`. New: `tests/account-controls.test.js`,
  `tests/account-data-export.test.js`, `tests/account-data-import.test.js`
  (incl. a full export → erase → restore financial round-trip with a per-cent
  check, plus restore failure-order tests: sync-reset-fails-before-save,
  ownership-fails, save-fails-after-reset, re-resolution-fails-after-restore),
  `tests/account-data-erase.test.js` (erase failure-order: each sidecar / legacy
  / ownership / primary removal failure, and sign-out failure after a verified
  erase), `tests/account-ui.test.js` (+ `tests/helpers/account-harness.js`), plus
  BP10 static checks in `tests/auth-architecture.test.js`.
- **Legacy helpers** — `storage.exportData` / `importData` / `clearAllData` are
  documented as deprecated/internal in `storage.js` and a static test confirms no
  current UI reaches them and the BP10 restore path uses `normalizeData` + `save`.
- **Docs** — new `docs/BP10-ACCOUNT-PRIVACY-RECOVERY.md`.
- **Status** — **IMPLEMENTATION COMPLETE — LIVE ACCOUNT / RECOVERY VERIFICATION
  DEFERRED TO BP12.** Not enabled: BP8 sync, BP9 passkeys. Not done: real
  email-change confirmation, real `scope:"global"` sign-out, a restore/erase pass
  on a real browser, and a trusted server-side account-deletion path.

### BP9 — Passkeys / device authentication (`0.9.0-beta.7` → `0.9.0-beta.8`)

The complete passkey / WebAuthn architecture — an **alternative** passwordless
sign-in method — **built but shipped OFF**. Email + password sign-in and
password recovery are unchanged and never removed. Live WebAuthn verification
against a real Supabase project + real devices, and the choice of the permanent
production **RP ID**, are **deferred to BP12** and are a **hard release gate
before BP13 closed beta**.

**The committed build makes zero passkey activity.**
`MWalletPasskeyRelease.isEnabled()` is `false`, so there is no
`registerPasskey` / `signInWithPasskey` / `passkey.list|update|delete` call, no
`navigator.credentials` call, no automatic prompt, and no conditional-UI
request. The "Use a Passkey" control is not shown to normal users.

- **Release gate** — new `js/auth/passkey-release.js`
  (`window.MWalletPasskeyRelease`): ships
  `{ enabled: false, verificationPhase: "BP12", reason: "production_rp_verification_pending" }`.
  **No production enable path** — `setOverride` exists only when a test harness
  set `window.__MWALLET_TEST_ENV__ = true` before the script loaded; no
  query-string / localStorage / Settings / hostname switch. No credentials, **no
  RP ID** in JS. Independent of the BP8 sync gate (which stays `false`).
- **Supabase client opt-in** — `js/auth/auth-client.js` (`?v=3`) adds
  `auth: { experimental: { passkey: true } }` to the **existing** `createClient`
  call (the vendored client is 2.112.4 — new enough). Every original option is
  kept; no second client is created. This only makes the API *callable* — it
  triggers no passkey / WebAuthn activity, and the `MWalletPasskeyRelease` gate
  decides whether M-Wallet ever invokes it.
- **Adapter** — new `js/auth/passkeys.js` (`window.MWalletPasskeys`): a narrow,
  DOM-free wrapper. `initialize / getState / getCapabilities / signIn / register
  / list / rename / remove / diagnostics`. Reuses the one Supabase client via
  `MWalletAuth._getClient()` — never `createClient`, a token, an Authorization
  header, or a direct GoTrue fetch. **Never calls `navigator.credentials`
  itself** — the high-level Supabase methods own the WebAuthn ceremony.
  Capability detection (`PublicKeyCredential` + `navigator.credentials`, secure
  context, client method presence) never treats a missing built-in platform
  authenticator as "no passkeys". Raw browser / Supabase errors map to a fixed
  set of safe codes (`user_cancelled`, `no_passkey_available`, `unsupported`,
  `project_not_enabled`, `network_error`, `auth_failed`, `management_failed`, …);
  a cancelled ceremony is friendly, not fatal. Returns only safe result objects —
  no raw session, token, credential, or challenge. Writes **no** localStorage /
  sessionStorage. Registration requires a **confirmed, non-anonymous, signed-in**
  user and is only ever an explicit action — never automatic after signup.
- **Auth-user shape** — `js/auth/auth.js` (`?v=4`): `getState().user` gains two
  non-sensitive booleans, `confirmed` and `isAnonymous` (from
  `user.email_confirmed_at` / `user.is_anonymous`), which the enrollment guard
  needs. `safeUser` still exposes nothing sensitive.
- **UI** — new `js/auth/passkey-ui.js` (`window.MWalletPasskeyUI`): the
  "Use a Passkey" control in the sign-in view (shown only when passkeys are
  actually available; password + Forgot password? + Create account are never
  removed), the Settings → **Passkeys** section (status, Add, list with
  Rename / Remove, dates), and a **removal-confirmation dialog** ("Remove this
  passkey? … Your email and password sign-in will remain available." — one
  confirmation = one delete; a failed delete keeps the item). Friendly names:
  trimmed, ≤ 120 chars, rendered with `textContent` (XSS-safe), never
  auto-filled with an email / user id / financial data. Credential IDs are never
  displayed or logged. The server passkey list is held **in memory only**,
  fetched once per show + after each change, never polled. Release-disabled:
  Settings says *"Built — activation pending security verification"* with no
  button that can start a ceremony. `auth-ui.js` (`?v=7`) delegates the
  `passkey-signin` action to the passkey UI — no WebAuthn logic in auth-ui.
  `settings-ui.js` (`?v=10`) just calls the render hook. New `css/passkeys.css`
  (44px targets, `prefers-reduced-motion`, dark-mode).
- **Not MFA, not E2EE** — BP9 uses passkey sign-in as a passwordless
  *first-factor* method; no TOTP / phone MFA is added. Passkeys improve
  authentication only — cloud financial payloads are still protected by RLS,
  **not** zero-knowledge, **not** end-to-end encrypted.
- **Biometric privacy** — M-Wallet never receives a fingerprint, face scan, or
  biometric template; the OS / authenticator performs user verification.
  Wording is **"Use a passkey"**, never "Face ID Login".
- **Gate order** — unchanged. A passkey sign-in enters the same chain as a
  password sign-in: `AUTH → BP4 ownership → BP8 bootstrap → BP5 setup → BP6
  walkthrough → APP`. A passkey-authenticated User B still hits BP4
  `owner_mismatch` on User A's device. Password recovery still wins — passkey
  sign-in / enrollment / management are all suppressed during recovery mode.
- **Version / cache** — `0.9.0-beta.7` → `0.9.0-beta.8`; `m-wallet-v27` →
  `m-wallet-v28` (APP_SHELL adds the 3 `js/auth/passkey*.js` + `css/passkeys.css`).
- **Tests** — 74 new (`597` → `671` passing): `passkey-release.test.js` (6 — no
  production override), `passkey-capability.test.js` (10), `passkey-auth.test.js`
  (18 — sign-in + registration, zero calls when disabled/recovery, safe error
  mapping, no token/credential leak, no auto-enrollment),
  `passkey-management.test.js` (12 — list/rename/delete, no optimistic removal,
  last-passkey removable, no persisted list), `passkey-ui.test.js` (19 —
  release-disabled + enabled gateway/Settings, removal confirmation
  Cancel/Confirm/Escape, XSS, accessibility, "recovery wins"), plus BP9 static
  wiring + regression in `auth-architecture.test.js`. New helper
  `tests/helpers/passkey-harness.js`.
- **Docs** — new `docs/BP9-PASSKEYS.md` (passkey vs password, biometric privacy,
  RP-ID importance + "do not enrol real passkeys until the RP ID is final"
  warning, the 24-step BP12 verification procedure, cross-browser matrix);
  README + `tests/README.md` updates.

### BP8 — Local-first sync engine (`0.9.0-beta.6` → `0.9.0-beta.7`)

The complete synchronization engine that connects local `mWalletData` to the
BP7 cloud `wallet_documents` store — **built but shipped OFF**. Live
multi-device / conflict / offline verification is **deferred to BP12** and is a
**hard release gate before BP13 closed beta**.

**The committed build does not sync.** `MWalletSyncRelease.isEnabled()` is
`false`, so the engine makes **zero** cloud requests: no bootstrap check, no
upload, no download, no background timers, no online-event sync. A local save
never depends on the cloud.

- **Release gate** — new `js/sync/sync-release.js` (`window.MWalletSyncRelease`):
  the single source of truth for whether sync is activated. Ships
  `{ enabled: false, verificationPhase: "BP12" }`. Contains no credentials.
  **No production enable path:** `setOverride` is present *only* when a test
  harness set `window.__MWALLET_TEST_ENV__ = true` before the script loaded — a
  normal browser build has no override, and there is no query-string,
  localStorage, Settings, console, or hostname switch. BP12 flips `BASE.enabled`
  itself after live verification.
- **Mid-sync data-loss hardening** — the engine now re-reads and re-encodes the
  current local state (and re-hashes each affected document) immediately before
  applying any remote download / tombstone and before every outbound create /
  update / tombstone. A local edit that lands during a cloud request is never
  overwritten: the remote copy becomes a `local_changed_during_sync` conflict
  and a stale outbound write is skipped (the document stays pending, the
  baseline only ever reflects what was actually written). The bootstrap restore
  is likewise aborted in favour of no-baseline reconciliation if the empty
  workspace became meaningful during the cloud check.
- **Local sync state** — new `js/sync/sync-state.js` (`window.MWalletSyncState`):
  owner-bound metadata in `mwallet.sync.state.v1` — document identities, SHA-256
  content hashes, cloud revisions, pending / conflict identities, timestamps,
  bootstrap status. **Whitelist-validated before every write** (an unexpected
  key or a non-primitive value is rejected), so a bug elsewhere cannot leak a
  balance, transaction, note, or payload into this key. Bound to the Supabase
  user id; a state written by user A is ignored when user B is signed in.
- **Pure planner** — new `js/sync/sync-planner.js` (`window.MWalletSyncPlanner`):
  a pure function that compares BASE × LOCAL × REMOTE per document and returns
  `{ downloads, creates, updates, tombstones, baselineUpdates, conflicts,
  ignored }`. No network, storage, DOM, input mutation, timestamp guessing, or
  array merging. Conservative: same-document concurrent change with no shared
  baseline → conflict; independent documents keep syncing.
- **Sync engine** — new `js/sync/sync-engine.js` (`window.MWalletSync`): dirty
  detection after a successful local save, cloud calls **only** through
  `MWalletCloudFinancial`, optimistic concurrency by `revision`, a single
  atomic remote apply (`storage.load` → `codec.applyDocuments` → one
  `storage.save` → verify → one `BudgetApp.refresh`), bounded exponential
  backoff, single-flight cycles, owner re-checks around every apply, and the
  second-device cloud bootstrap. Never logs a payload / owner id / token;
  `diagnostics()` exposes counts + safe codes only.
- **Sync UI** — new `js/sync/sync-ui.js` (`window.MWalletSyncUI`): the
  `#mw-sync-bootstrap` fresh-device gate (Retry / Continue Offline) and the
  `#mw-sync-conflicts` review overlay ("Keep this device" / "Use cloud
  version" / "Decide later", with human labels like "August 2026 budget" and an
  explicit confirmation — never raw JSON, never an owner id). Both dormant while
  release is off.
- **Codec apply helpers** — `cloud-financial-codec.js` (`?v=2`): new **pure**
  `applyDocument` / `removeDocument` / `applyDocuments` (the inverse of the BP7
  encoding — preserve `version` + `migrations` and every unrelated slice, never
  touch storage or the network), plus `canonicalStringify` /
  `documentFingerprintInput` (order-independent hashing input) and
  `DELETABLE_TYPES` (`month` only — singletons are required).
- **Store** — `cloud-financial-store.js` (`?v=2`): new `duplicate_document`
  error code; `23505` / "duplicate key" now maps to it (a normal first-sync
  create race, not a generic write failure).
- **Canonical save event** — `js/storage.js` (`?v=8`): `save()` now dispatches
  one `mwallet:financial-saved` event (`detail: { source: "local" }`, no
  payload) after a successful write. `load()`'s normalization re-save goes
  through a new `saveSilently()` and does **not** emit. `save()` is unchanged
  otherwise — still synchronous, still returns `true` / `false`.
- **Gate order** — `js/auth/auth-ui.js` (`?v=6`): new fail-open `setBootstrapGuard`
  / `setBootstrapScreenActive` / `bootstrapReleased` / `holdForBootstrap`,
  inserted **between** BP4 ownership and BP5 setup. Holds only on an explicit
  `{ release: false }`; a missing / throwing / never-loaded sync module always
  releases. In the committed build (sync off) it always releases.
- **BP5 coordination** — `js/setup/first-run-setup.js` (`?v=2`): also subscribes
  to `MWalletSync` so a cloud-restored device is re-evaluated immediately and
  recognised as `existing` (reusing BP5's own established-data detection — no
  BP8-specific logic, no fake completion record).
- **Settings** — `js/settings-ui.js` (`?v=9`): a read-only **Cloud Sync** row.
  In the shipped build: *"Built — activation pending pre-beta verification"* /
  *"Your financial data remains local on this device…"*. When release is on it
  shows "Up to date" / "Syncing…" / "Offline — changes saved on this device" /
  "N changes waiting" / "Needs attention — N conflicts" with a **Sync now** and
  a **Review sync conflicts** control. Never says "Backed up".
- **Version / cache** — `0.9.0-beta.6` → `0.9.0-beta.7`; `m-wallet-v26` →
  `m-wallet-v27` (APP_SHELL adds the five `js/sync/` modules + `css/sync.css`).
  New `css/sync.css`.
- **Tests** — 118 new (`479` BP7 baseline → **`597` passing**; the first `+1`
  to an intermediate `480` was a new `bp7-no-auto-sync.test.js` assertion that
  the BP8 engine talks to the cloud only through the store):
  `sync-planner.test.js` (24 — every BASE×LOCAL×REMOTE case + determinism + no
  mutation), `sync-state.test.js` (15 — whitelist / owner-binding / no payload),
  `sync-codec-apply.test.js` (12), `sync-engine.test.js` (15),
  `sync-multidevice.test.js` (12 — two-device A↔B cases A–K + financial
  realism), `sync-bootstrap.test.js` (8), `sync-race.test.js` (5 — the mid-sync
  edit / tombstone / bootstrap / outbound-stale races), `sync-ui.test.js` (17 —
  bootstrap gate, conflict overlay, keep / use-cloud / decide-later,
  confirmation, Escape, accessibility, the Settings row), plus BP8 static
  wiring + no-production-override checks + the updated cloud-boundary checks in
  `auth-architecture.test.js` / `bp7-no-auto-sync.test.js`. New helpers:
  `tests/helpers/fake-cloud.js`, `tests/helpers/sync-device.js`;
  `tests/helpers/dom-stub.js` gained `removeChild` / `replaceChildren` /
  `firstChild`.
- **Docs** — new `docs/BP8-SYNC-ENGINE.md`; README + `tests/README.md` updates.
- **Not E2EE** — BP8 adds synchronization, not encryption. The docs continue to
  state that cloud financial payloads are protected by RLS / access control,
  **not** zero-knowledge, **not** end-to-end encrypted.

### BP7 — Cloud financial data + Row Level Security (`0.9.0-beta.5` → `0.9.0-beta.6`)

The **capability** to store financial data as per-user, row-level-secured
documents in Supabase — **not** synchronization. Local `mWalletData` in the
browser stays the single active source of truth: opening M-Wallet, saving a
budget, or finishing setup never uploads anything. Sync is BP8.

**BP7 implementation is complete.** The migration has **not** been applied to any
real Supabase project, RLS has **not** been live-verified, no cloud sync is
active, and no financial data is backed up. Applying the migration and running
the two-user live RLS check (`npm run bp7:verify-rls`) is **deferred to BP12**
(the pre-beta security audit, after BP8–BP11) and remains a **hard release gate
before BP13 closed beta**.

- **Cloud schema** — new `supabase/migrations/20260831_bp7_wallet_documents.sql`:
  `public.wallet_documents`, one row per independently versioned document
  (`accounts`, `settings`, `categories`, `recurring-income`,
  `recurring-expenses`, `savings`, `cash`, `month/<YYYY-MM>`), keyed
  `UNIQUE (user_id, document_type, document_key)` so two users can each hold
  their own `month/2026-08`. `payload` is bounded `jsonb` constrained to an
  object; `revision` (`> 0`), `client_updated_at`, `deleted_at` (tombstone),
  `created_at` / `updated_at`. The file contains **no** project URL or key and is
  **to be applied manually** in the Supabase SQL Editor (deferred to BP12).
- **Row Level Security** — RLS `ENABLE`d **and** `FORCE`d. Four policies, all
  `TO authenticated`, each gated on `auth.uid() = user_id` (SELECT/DELETE via
  `USING`, INSERT via `WITH CHECK`, UPDATE via both). **No `anon` policy** and
  explicit `REVOKE ALL … FROM anon` / `FROM public`; `GRANT` only to
  `authenticated`. `user_id` is `NOT NULL DEFAULT auth.uid()` and
  `REFERENCES auth.users(id) ON DELETE CASCADE` — **the browser never sends it**.
- **Integrity trigger** — `mwallet_wallet_documents_before_write()` (plain
  `SECURITY INVOKER`): on INSERT fills `user_id` from `auth.uid()`, sets
  `revision = 1` and timestamps; on UPDATE **freezes** `id` / `user_id` /
  `document_type` / `document_key` / `created_at` and sets
  `revision = OLD.revision + 1`, `updated_at = now()`. A document cannot be
  renamed, re-owned, or have its history rewritten by a client.
- **Pure codec** — new `js/cloud/cloud-financial-codec.js`
  (`window.MWalletCloudFinancialCodec`): deterministic local⇄cloud translation.
  Never touches Supabase / network / storage / DOM, never mutates its input,
  preserves every amount / id / date / category / M-Cash denomination exactly.
  `mWalletData.version` and `.migrations` are deliberately **not** encoded, and
  no BP2–BP6 local key is ever included.
- **Cloud repository** — new `js/cloud/cloud-financial-store.js`
  (`window.MWalletCloudFinancial`): the **only** runtime module that queries
  `wallet_documents`. Reuses the existing authenticated client via
  `MWalletAuth._getClient()` — no second client, no token copying. Callers never
  supply ownership. Optimistic concurrency by `revision` (stale →
  `revision_conflict`, never a silent overwrite); tombstone / restore via
  `deleted_at`. Raw Supabase/PostgREST errors are mapped to a fixed set of safe
  codes; payloads, tokens, and owner ids are never logged or returned by
  `diagnostics()`. `initialize()` performs **zero** network I/O.
- **Settings** — a read-only **Cloud Financial Storage** row and an optional,
  user-triggered **Check cloud storage** button (a `SELECT id LIMIT 1`
  reachability probe — uploads nothing). Copy never says "backed up" / "synced":
  *"Cloud sync is not active yet. Your current financial data remains local on
  this device."* (`settings-ui.js` → `?v=8`).
- **Live RLS verifier** — new `scripts/bp7-live-rls-check.mjs` +
  `npm run bp7:verify-rls`. Standalone Node, **not** part of `npm test`. Reads
  `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` / two throwaway account
  credentials from the environment (or a git-ignored `.env`); refuses a
  `service_role` / `sb_secret_` key; never prints a URL, key, token, header, or
  password. Signs in as two users and proves neither can read, update, or delete
  the other's rows, that ownership can't be reassigned, that the same month key
  is isolated, and that stale-revision updates match nothing — then deletes all
  its test rows.
- **Privacy model** — documented that **RLS is not end-to-end encryption**: it
  stops other users and anonymous callers, but the payload is readable `jsonb`
  to anyone with project / `service_role` access. BP7 is **not** described as
  "zero knowledge" or "end-to-end encrypted".
- **Tests** — `tests/cloud-financial-codec.test.js` (14),
  `tests/cloud-financial-store.test.js` (17), `tests/bp7-schema-contract.test.js`
  (19, static assertions over the SQL), `tests/bp7-no-auto-sync.test.js` (7,
  only the store names the table + boot does zero network + real `mWalletData`
  byte-identical after encoding), plus BP7 static wiring in
  `tests/auth-architecture.test.js`. **479 tests pass** (was 418).
- **Docs** — new `docs/BP7-CLOUD-DATA.md` (model, RLS, "apply the migration"
  10-step, "live verification" instructions incl. removing the temp env vars),
  new `.env.example`, README + `tests/README.md` updates.
- **Version / cache** — `0.9.0-beta.5` → `0.9.0-beta.6`; `m-wallet-v25` →
  `m-wallet-v26` (APP_SHELL adds the two `js/cloud/` modules).
- **Release gate** — BP7 code, schema, codec, store, tests, and security
  behaviour are **final**. Live two-user RLS verification against a real Supabase
  project is **deferred to BP12** and is a **hard gate before BP13 closed beta**:
  beta must not open until the migration is applied to a real project and
  `npm run bp7:verify-rls` prints `RESULT: PASS`, both recorded in the BP12
  audit. As of BP7: migration **not applied**, RLS **not live-verified**, cloud
  sync **not active**, financial data **not backed up**.
- **Still pending verification** (unchanged by this deferral): live BP3 Supabase
  signup / email-verification / password-reset round trip; live BP4 real
  multi-account ownership. BP8 (local-first sync) **not started**.

### BP6 — Guided app walkthrough (`0.9.0-beta.4` → `0.9.0-beta.5`)

An **optional, replayable** coach-mark tour that teaches a genuinely new owner
what the major areas of M-Wallet do — shown **only after** BP4 has verified
local ownership and BP5's first-run wizard has been completed. BP6 is education,
not a gate: it **fails open** and never touches financial data.

- **Walkthrough service** — new `js/walkthrough/guided-walkthrough.js`
  (`window.MWalletWalkthrough`): state model
  (`inactive` / `checking` / `active` / `completed` / `skipped` / `error`), an
  8-step registry (Welcome → Home → Budget → Transactions → Savings → M-Cash →
  Reports → Settings), owner-bound resume progress, and the auto-start decision.
  Actions: `initialize`, `getState`, `getStatus`, `subscribe`, `start`,
  `startManual`, `next`, `back`, `goToStep`, `skip`, `complete`, `retry`,
  `bailOut`, `diagnostics`.
- **Auto-start** — the tour opens automatically **only** for: auth configured +
  signed in + not recovery + BP4 `owned`/`fresh_claimed` + **BP5 status exactly
  `complete`** (the fresh-user wizard path — never `existing`/legacy) + no
  completed/skipped record for this owner. A legacy/existing user is **never**
  force-toured; a completed or skipped user is not re-toured. It also
  re-resolves when BP5 broadcasts `complete`, so it opens right after the wizard
  with no reload.
- **Gate priority** — auth → BP4 ownership (fail-closed) → BP5 setup (fail-open)
  → **BP6 walkthrough (fail-open)** → app. Owner mismatch, `needs_claim`, a
  required BP5 wizard, password recovery, signed-out, and unconfigured all keep
  BP6 `inactive`. `js/auth/auth-ui.js` gains `setWalkthroughGuard` /
  `setWalkthroughScreenActive`; it holds the app for the tour **only** on an
  explicit `{ release: false }` from a working guard (no guard / throw /
  malformed → release), and reveals the verified owner's app if the tour service
  says "active" but the overlay isn't actually presenting.
- **Walkthrough UI** — new `js/walkthrough/walkthrough-ui.js`
  (`window.MWalletWalkthroughUI`) + `css/walkthrough.css` + `#mw-walkthrough`
  markup **outside `.app`**: a dimmed backdrop, a spotlight ring on a
  developer-controlled `[data-walkthrough-target]` per page, and a Zevaryn-Grid
  coach-mark card with step progress, Back / Next / Skip / Finish. Positioning is
  a pure, NaN-safe solver (`computePlacement`) recalculated on resize /
  orientation / navigation via a **bounded** settle loop; a missing or
  oversized target degrades to a centred card with no spotlight — it never
  throws. All copy is static and rendered with `textContent`; the overlay is
  `role="dialog"` `aria-modal`, traps focus, is keyboard-operable, Escape ==
  Skip, and respects `prefers-reduced-motion`.
- **Navigation** — the tour drives page changes through the app's canonical
  `BudgetNavigation.showPage` only. It **never** submits a form, clicks an
  Add/Edit/Delete control, transfers savings, changes the month, or touches
  M-Cash. The M-Cash step navigates into the (read-only) M-Cash page.
- **Metadata** (local only, never uploaded) — `mwallet.walkthrough.v1`
  (`{ schemaVersion, ownerUserId, status: "completed"|"skipped", completedAt,
  skippedAt, contentVersion }`) and `mwallet.walkthrough.progress.v1` (first-time
  resume only, cleared on complete/skip). Identity is the **Supabase user id**,
  never the email. A record/progress bound to a different owner is ignored;
  `diagnostics()` exposes only safe booleans/ids-free values. The persisted
  status is the user's **strongest** state — a manual skip never downgrades a
  prior `completed`; a metadata-write failure never traps the owner (the overlay
  still closes, no false "saved" claim, the tour may appear again).
- **Settings → System & Beta** gains a **Guided Tour** row —
  *Completed* / *Skipped* / *Not viewed* — with a **Replay Tour** / **Start
  Tour** button for a signed-in owner. Manual replay works for legacy/existing
  users too, never re-runs BP5, never resets BP4, and never writes financial
  data.
- **Service worker** — `guided-walkthrough.js`, `walkthrough-ui.js`,
  `walkthrough.css` added to `APP_SHELL`; cache `m-wallet-v24` → `m-wallet-v25`.
  Supabase responses are still never cached.
- **Tests** — `tests/guided-walkthrough.test.js` (40 cases: auto-start rules,
  gate priority, step navigation, progress/resume, skip/complete + idempotency +
  write-failure fail-open, manual-replay semantics, sign-out, storage failure,
  and a realistic financial fixture proving `mWalletData` is byte-identical
  before/after with zero `setItem`/`removeItem` on it) and
  `tests/walkthrough-ui.test.js` (19 cases: the pure placement solver — never
  NaN/Infinity, always in-viewport — the DOM layer, missing-target fallback,
  no-double-fire, Escape == Skip, and a real `auth-ui` + service + UI
  integration). `dom-stub` gained `getBoundingClientRect` / `scrollIntoView` +
  a walkthrough DOM builder. Suite: **357 → 418**, all green; every BP2–BP5 and
  fail-closed test stays green.
- The **live BP3 Supabase email-flow verification** and the **live BP4
  real-Supabase multi-account verification** both **remain pending** — not
  completed by BP6.

### BP5 — First-run setup wizard (`0.9.0-beta.3` → `0.9.0-beta.4`)

A short first-run experience for a **genuinely new** authenticated owner, shown
**only after BP4 has positively verified local ownership**. BP4 stays the
security gate; **BP5 is an experience gate that fails _open_** — a
missing/throwing/malformed setup guard, or a setup module that never loads,
never locks a verified owner out of their own app.

- **Setup service** — new `js/setup/first-run-setup.js`
  (`window.MWalletFirstRun`): state model
  (`inactive` / `checking` / `required` / `saving` / `complete` / `existing` /
  `error`), an owner-bound draft, integer-cent money parsing (rejects `NaN` /
  `Infinity` / scientific / >2dp / oversize), and a guarded **Finish**
  transaction. Actions: `initialize`, `getState`, `getStatus`, `getProgress`,
  `getDraftValues`, `subscribe`, `updateDraft`, `validateStep`, `nextStep`,
  `previousStep`, `goToStep`, `finish`, `retry`, `diagnostics`.
- **Wizard UI** — new `js/setup/setup-ui.js` (`window.MWalletSetupUI`) +
  `css/setup.css` + `#mw-setup-gate` markup: **Welcome → Your accounts →
  Basic preferences → Review**, plus a Save-error screen (Retry / Sign Out).
  Every user-entered value is rendered with `textContent` / `value` — **never
  `innerHTML`**. No "restart" / "reset" / "start over" action.
- **Existing users auto-skip** — the wizard is skipped (a `source: "existing"`
  record written, established values never touched) whenever there is **any** BP4
  meaningful signal **or** a non-zero balance on its own: a non-zero checking
  balance, a non-zero savings balance, or a non-zero current-month
  `startingBalance` each count as established data by themselves — no income /
  bills / transactions required. There is no "balance signals don't count"
  exception. A `$2,850` checking balance (and nothing else) opens straight to the
  app, unchanged. A workspace that becomes established mid-wizard is detected
  again at Finish and left intact. If BP5's own `"existing"` metadata write
  fails, the verified owner **still** reaches their wallet — BP5 is a fail-open
  experience layer; BP4 stays the security gate.
- **Finish writes once, narrowly** — through the canonical `storage.js`, to
  **only**: `accounts.checking.name`, `accounts.savings.name` / `.balance`
  (savings is authoritative for display), `settings.firstDayOfWeek`, and the
  **current calendar month's `startingBalance`** — the checking opening balance
  the dashboard and Budget page actually display (the app shows a *derived*
  checking figure, not `accounts.checking.balance`). The starting balance is
  applied via `storage.setStartingBalance(currentMonthKey)` — the current month
  from `storage.getCurrentMonthKey()`, **never** an arbitrary month the Budget
  page happens to have selected — and that API also re-syncs the
  `accounts.checking.balance` cache. *(This narrowly widens the original BP5.x
  field list by one — `months[current].startingBalance` — after verification
  showed a checking balance written only to `accounts.checking.balance` never
  surfaces anywhere in the app.)* No activity is created: the month keeps empty
  `bills` / `paychecks` / `expenses` / `transactions` / `savingsDeposits` arrays
  and blank notes. Everything else in `mWalletData` — income, expenses, savings
  goals/transfers, M-Cash, categories, currency, other months — stays identical.
  BP5 **never** creates income, bills, expenses, transactions, savings
  goals/transfers, M-Cash entries, categories, or recurrence records, and makes
  **zero** network / cloud calls. Draft cents are converted to clean 2-dp dollar
  numbers (no float dust); the save is verified by reload; a failed save ⇒
  *error* with the draft kept for retry (retry is idempotent — the opening
  balance is never applied twice); a metadata-write failure after a good save ⇒
  *error*, and retry writes only the metadata. An interrupted Finish that
  survives a reload resumes (not reclassified as "existing") via an
  `applyStarted` marker on the kept draft.
- **Accurate error copy** — the save-error screen never claims "your data has
  not been changed" (false when a financial write succeeded but the completion
  metadata failed). Its static copy — *"Your M-Wallet data is safe. Retry to
  continue setup from where it stopped."* — is truthful for every error path,
  and each error code carries its own accurate message (`save_failed`,
  `starting_balance_failed` "we saved your account details but couldn't finish",
  `meta_write_failed` "your setup is saved — we just couldn't record that it
  finished", etc.).
- **Metadata keys** (local only, never uploaded) — `mwallet.setup.v1`
  (`{ schemaVersion, ownerUserId, status, completedAt, source }`) and
  `mwallet.setup.draft.v1` (`{ schemaVersion, ownerUserId, step, values,
  updatedAt }`). Identity is the **Supabase user id** (never the email). A draft
  bound to a different owner is ignored; `diagnostics()` exposes no id, no draft
  values, no financial contents.
- **Gate order** — auth configured → initialized → signed in → password
  recovery → **BP4 ownership verified** → **BP5 setup decision** → app revealed.
  `js/auth/auth-ui.js` remains the single owner of the financial app root's
  `inert` / `aria-hidden` state; it holds the app for setup **only** on an
  explicit `{ release: false }` from a working setup guard, and reveals the
  verified owner's app on anything else (no guard / throw / malformed). The
  service also subscribes to `MWalletLocalMigration` so a BP4 transition (a user
  clicking *Keep & Protect My Data*: `needs_claim → owned`) re-resolves BP5
  immediately, without a reload.
- **Settings → System & Beta** gains a **First-Run Setup** row — "complete" —
  for a signed-in owner whose setup is done. It exposes no id and no metadata.
- **Service worker** — `first-run-setup.js`, `setup-ui.js`, `setup.css` added to
  `APP_SHELL`; cache `m-wallet-v23` → `m-wallet-v24`. Supabase responses are
  still never cached.
- **Tests** — `tests/first-run-setup.test.js` (47 cases: fresh detection,
  existing auto-skip incl. balance-only workspaces (checking-only / savings-only /
  startingBalance-only), BP4 `needs_claim → owned` mid-session flip, and
  metadata-failure fail-open, owner-bound draft,
  navigation, the Finish deep-equal + current-month targeting + idempotency +
  storage / partial-apply / interrupted-and-reloaded paths, sign-out mid-wizard,
  BP4 coordination, recovery precedence, diagnostics) and `tests/setup-ui.test.js`
  (20 cases: `decideScreen` / `progressModel`, the DOM layer, XSS-safe rendering,
  submit-vs-click, error-copy-never-false-claim, and a real `auth-ui` +
  `first-run-setup` + `setup-ui` integration proving the two-stage gate, the
  no-double-advance fix and the fail-open behaviour). The dom-stub gained
  descendant / compound / `:checked` selector support. Suite: **288 → 356**, all
  green; every BP2/BP3 auth test and BP4 fail-closed test stays green.
- The **live BP3 Supabase email-flow verification** and the **live BP4
  multi-account ownership verification** both **remain pending** — not completed
  by BP5.

### BP4 — Existing local user migration + local data ownership (`0.9.0-beta.2` → `0.9.0-beta.3`)

A **non-destructive local ownership** step so that adding accounts never
deletes, overwrites, uploads, migrates, or exposes existing on-device financial
data. **BP4 moves nothing to the cloud.**

- **Ownership service** — new `js/migration/local-user-migration.js`
  (`window.MWalletLocalMigration`): a read-only meaningful-data detector
  (income / expenses / bills / transactions / savings / M-Cash / custom
  categories — never generated caches or defaults) and an explicit state model
  (`unconfigured` / `checking` / `needs_claim` / `owned` / `fresh_claimed` /
  `owner_mismatch` / `error`). Actions: `initialize`, `getState`, `subscribe`,
  `detectMeaningfulLocalData`, `getOwnership`, `claimExistingData`,
  `ensureOwnership`, `diagnostics`.
- **Ownership record** — its own key `mwallet.local.owner.v1`, separate from
  `mWalletData`: `{ schemaVersion: 1, ownerUserId, claimedAt, source }`.
  Identity is the **Supabase user id** (never the email). No passwords, tokens,
  keys, sessions, emails, or financial contents are stored, returned, or logged.
- **Migration gateway** — new `js/migration/migration-ui.js` + `css/migration.css`
  + `#mw-migration-gate` markup: *Checking* / *Your existing M-Wallet data is
  here* (→ **Keep & Protect My Data** / Sign Out) / *This M-Wallet data belongs
  to a different account* (→ Sign Out) / *error* (→ Retry / Sign Out). No
  destructive "delete" / "start over" / "replace" option.
- **Gate order (FAIL-CLOSED)** — auth configured → initialized → signed in →
  password recovery → **local ownership verified** → app revealed.
  `js/auth/auth-ui.js` is the single owner of the financial app root's
  `inert` / `aria-hidden` state. For a configured, signed-in user the **default
  is DENY**: the app is revealed **only** when the ownership guard returns
  exactly `{ release: true }`. A missing guard, a throwing guard, an
  `undefined`/`null` result, or any malformed result **keeps the app blocked** —
  authenticated access alone can never reveal the financial application.
  If the migration module or its UI fails to load, `auth-ui.js` shows a
  **built-in fallback** ("Local data protection couldn't be verified" +
  Retry / Sign Out) that does not depend on `migration-ui.js` — never a blank
  screen, never the financial UI.
- **Flows** — existing user with meaningful data claims it explicitly (source
  `legacy`); a fresh device is auto-claimed (source `fresh`) with no extra
  screen; a returning owner opens straight to the app; a **different account is
  blocked** with the data and the ownership marker left untouched (never
  reassigned or cleared).
- **Fails closed** — corrupt `mWalletData`, a malformed ownership record, a
  missing user id, or a `localStorage` failure all land in a safe *error* state
  with Retry / Sign Out; nothing is overwritten, and no replacement data is
  created.
- **Signing out** never deletes `mWalletData`, the ownership marker, categories,
  savings, or M-Cash data.
- **Settings → System & Beta** gains a **Local Data** row — "Protected on this
  device" — for the signed-in owner. It never exposes `ownerUserId` or the
  migration metadata, and never claims the data is backed up or synced.
- **Service worker** — `local-user-migration.js`, `migration-ui.js`,
  `migration.css` added to `APP_SHELL`; cache `m-wallet-v22` → `m-wallet-v23`.
  Supabase responses are still never cached.
- **Tests** — `tests/local-user-migration.test.js` (detector + state machine +
  multi-account matrix + data safety, with realistic `mWalletData` from the real
  `storage.js`), `tests/migration-ui.test.js` (end-to-end gate + screens +
  buttons), and `tests/fail-closed-ownership.test.js` (no guard / throwing /
  undefined / malformed guard / missing module / late registration / recovery
  precedence / unconfigured dev mode — all with the real `auth-ui.js`). The
  migration layer is asserted to make **zero** writes to `mWalletData`; every
  BP2/BP3 auth-safety test stays green.
- **Version / cache unchanged** — still `0.9.0-beta.3` / `m-wallet-v23` (no new
  assets, only edits to existing modules). Changed assets get a `?v=` bump.
- The **live BP3 Supabase email-flow verification remains pending** — not
  completed by BP4.

### BP3 — Authentication UI + session experience (`0.9.0-beta.1` → `0.9.0-beta.2`)

The account experience layered on the BP2 architecture. It appears **only when a
Supabase project is configured**; with no project configured, M-Wallet is the
local-first app exactly as before.

- **Account actions** on `window.MWalletAuth` (replacing the BP2 placeholders):
  `signUp(email, password)`, `signIn(email, password)`, `signOut()`,
  `resetPassword(email)`, `updatePassword(newPassword)`,
  `resendVerification(email)`. Each validates + normalizes input, returns a
  **safe result object** (`{ ok, code?, message?, … }`) — **never a raw session
  or token** — and maps provider errors to a short user-displayable message.
  Passwords and tokens are never logged.
- **Account gateway** — new `js/auth/auth-ui.js` (`window.MWalletAuthUI`) +
  `css/auth.css` + `#mw-auth-gate` markup in `index.html`. Zevaryn Grid dark,
  centered card, violet primary / teal accents, mobile-first. Views: welcome,
  create account, sign in, verify email, forgot password, set new password,
  loading, connection error.
- **App gating** — configured + signed-out shows the gateway and marks the
  financial app `inert` + `aria-hidden`; signed-in hides it; **unconfigured
  never shows it** (developer / local user is never locked out). The financial
  DOM and `localStorage["mWalletData"]` are never removed, cleared, or migrated
  by any auth operation — **signing out keeps all local data**.
- **Sessions** — restored from Supabase's own browser storage on reload
  (`mwallet.auth.session`, separate from `mWalletData`); a brief branded loading
  state avoids a flash of the signed-out screen; `error` shows a retry, never a
  blank screen.
- **Email links** — `PASSWORD_RECOVERY` opens a "set new password" view;
  redirect targets are the **directory of the current page** so the same build
  works at a domain root and under a GitHub Pages `/M-Wallet/` sub-path;
  leftover auth parameters are scrubbed from the visible URL; callback tokens
  are never logged.
- **Settings → System & Beta** — when signed in, shows the account email, the
  provider, a **Sign Out** button, and an optional "send password-reset email".
  Never shows a token, session JSON, key, or un-approved metadata.
- **Accessibility** — labelled fields, `aria-live` error/success regions,
  focus moves to each view's heading, visible focus rings, 44px targets,
  `autocomplete="email" / "new-password" / "current-password"`, paste allowed.
- **Service worker** — `auth-ui.js` + `auth.css` added to `APP_SHELL`; cache
  `m-wallet-v21` → `m-wallet-v22`. Cross-origin (Supabase) responses are still
  never cached.
- **Tests** — `tests/auth-architecture.test.js` extended with the BP3 API +
  UI-decision suites; new `tests/auth-ui.test.js` (DOM-stub gateway wiring) and
  `tests/auth-data-safety.test.js` (auth never touches `mWalletData`). All with
  a stubbed Supabase library — no network.

### BP2 — Authentication architecture (infrastructure only)
- Added a dedicated `js/auth/` subsystem with one public entry point,
  `window.MWalletAuth`:
  - `auth-config.js` — resolves and **validates** browser-safe configuration.
    Accepts a **publishable key** (`sb_publishable_…`, current) or a legacy
    **`anon`** JWT; **refuses** the secret key (`sb_secret_…`), the
    `service_role` JWT, and any unrecognized/privileged key format — a refused
    key leaves auth safely **unconfigured**, never `error`. The key value is
    never logged.
  - `auth-client.js` — lazily injects the vendored Supabase library and builds
    the client (its own storage key, never near financial data).
  - `auth.js` — explicit state model
    (`unconfigured` / `initializing` / `signed_out` / `signed_in` / `error`),
    session restoration, one controlled auth-event listener, an observable
    `subscribe()` API, safe `diagnostics()` (key *family* only), and BP3
    extension points (`signUp` / `signIn` / `resetPassword`).
- **Configuration** is static-PWA friendly with no build step: `window`
  override, **`localStorage["mwallet.auth.config"]`** (the recommended local-dev
  path — set via `MWalletAuthConfigResolved.saveLocalConfig(url, key)` in the
  console, no file or tracked `index.html` edit), or `DEPLOY_CONFIG` in
  `auth-config.js` for the deployed build.
- Auth initializes **detached** on `DOMContentLoaded`; the local financial app
  renders synchronously and never waits on it. With no project configured
  (the current default) the app runs exactly as before in **AUTH UNCONFIGURED**
  mode and the Supabase library is never loaded.
- Defined offline behaviour: restore from the stored session only, never delete
  a session or any data on network failure, and reconcile **once** on reconnect
  (no retry loops).
- Settings → **System & Beta** gains a minimal, read-only **Accounts** row
  ("Not configured" / "Ready" / "Signed in").
- Vendored `js/vendor/supabase-js.min.js` (`@supabase/supabase-js` 2.112.4,
  UMD) and added it plus the `js/auth/` modules to the service-worker
  `APP_SHELL`. The service worker still ignores every cross-origin request, so
  authentication traffic is never cached.
- Added `tests/auth-architecture.test.js` (42 tests, mocked Supabase — no
  network), including browser-key-validation hardening (publishable accepted,
  `sb_secret_` / `service_role` / unknown formats refused, no key value in
  state / diagnostics / errors / logs).
- Service-worker cache `m-wallet-v19` → `m-wallet-v21`.
- No financial logic, schema, or storage changes. No cloud tables. No account
  UI (that is BP3).

**Terminology:** "publishable key" is the current browser key; "anon key" is
the legacy browser-safe equivalent; secret / `service_role` keys are
**server-only** and forbidden in M-Wallet front-end source.

---

## [0.9.0-beta.1] — Beta Preparation start

The project enters **Beta Preparation Mode**: the focus shifts from adding large
finance features to making M-Wallet safe, understandable, recoverable, secure,
testable, and installable for real beta testers.

### BP1 — Beta Engineering Foundation
- Added `js/app-version.js` as the single runtime source of truth for the app
  version; mirrored in `package.json` `version`.
- Added a **System & Beta** section to Settings showing version, channel, data
  schema, and a `BETA` badge with an early‑beta data warning.
- Overhauled `README.md` with real project documentation (features, architecture,
  local dev, testing, PWA, data model, beta status, workflow).
- Added this `CHANGELOG.md`.
- Added GitHub Actions CI (`.github/workflows/tests.yml`) — runs the full test
  suite on pushes and pull requests to `main`.
- Fixed the `npm test` script so `npm test` and
  `node --test tests/*.test.js tests/**/*.test.js` run the same full suite.
- Added `tests/app-version.test.js`.
- Tidied a stale version‑number example in a `service-worker.js` comment.
- Service‑worker cache `m-wallet-v18` → `m-wallet-v19`.

### BP0 — Branding cache completion
- Renamed the icon assets to `m-wallet-icon-192.png`, `m-wallet-icon-512.png`,
  `m-wallet-icon-512-maskable.png`, `m-wallet-apple-touch-icon.png` so browsers
  and installed PWAs stop serving stale artwork from unchanged filenames.
- Updated all references in `index.html`, `manifest.json`, and
  `service-worker.js`; removed the old files.
- Service‑worker cache `m-wallet-v17` → `m-wallet-v18`.

---

## Historical milestones

### Branding & navigation polish
- New Zevaryn violet + teal M‑Wallet app icon and header logo.
- Bottom‑navigation cleanup: icons on one baseline, active state highlights
  without shifting the item, equal spacing and touch targets preserved.

### Zevaryn Grid overhaul (ZG1–ZG10)
- **ZG1** — global design foundation: `--z-*` tokens, `.z-*` primitives, dark
  graphite theme, legacy‑token re‑map.
- **ZG2–ZG8** — page‑by‑page redesign of Dashboard, Budget, Transactions,
  Savings, M‑Cash, Reports, and Settings into modular Zevaryn Grid panels;
  category & subcategory management surfaced in Settings; data Import wired up.
- **ZG9** — responsive + accessibility pass: iOS‑zoom form sizing, touch‑target
  sizing, keyboard focus visibility, contrast, reduced motion, progress‑bar ARIA.
- **ZG10** — full functional regression and release QA. Fixed a pre‑existing
  defect where the M‑Cash wallet was wiped on page reload (because `storage.js`
  self‑initializes before `MCashStorage` loads); added
  `tests/m-cash/cash-persistence.test.js`.

### Recurring bills
- Monthly recurring bill continuation with duplicate protection across month
  navigation and reloads.
- Optional recurring end date.
- Occurrence‑level paid‑state isolation.
- Short‑month due‑day clamping (Jan 31 → Feb 28 → Mar 31 → Apr 30).
- Added `tests/bill-recurrence.test.js`.

### M-Cash
- Denomination inventory data model (13 denominations, integer‑cent totals).
- Local‑first persistence unified with the main storage path.
- Add Cash (increments), Recount (set exact counts), Calculator (greedy exact
  change bounded by inventory), Cash Savings (denomination allocation that never
  changes the M‑Cash total), Dashboard integration.

### Reports + Savings
- Monthly, Yearly, and Date‑to‑Date reporting with category, subcategory, and
  merchant analytics.
- Full Savings management: General Savings, Checking ↔ Savings transfers,
  Savings Goals with allocate / release that conserve total savings.
- Added `tests/savings-accounting.test.js`.

### Categories & subcategories
- Centralized category data model: 21 system categories, 127 system
  subcategories, custom category/subcategory CRUD with system‑delete protection.
- Legacy category‑string resolution to IDs without rewriting stored strings.
- Added `tests/category-model.test.js`.

### Expense & income systems
- Full income management (types, recurring frequencies, monthly/yearly totals,
  edit/delete, Next Income on Dashboard).
- Full expense management (merchant/vendor, category + subcategory, notes,
  recurring occurrences, monthly/yearly totals, edit/delete).
- Storage moved to the `mWalletData` key with one‑way legacy migration.

### Reliability & data safety
- Corrupt‑storage protection and data‑recovery handling.
- Month‑refresh deduplication; hash‑navigation fix; modal keyboard accessibility.
- PWA offline asset + cache versioning.
- Financial testing foundation (`node:test` + `tests/helpers/storage-harness.js`).
