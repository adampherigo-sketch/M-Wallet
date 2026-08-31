# P2.5 Foundation Tests

This directory contains only the P2.5.0-P2.5.2 foundation.

## Frozen fixture

`fixtures/august-october-2026.js` is copied from the approved **M-Wallet Three-Month Realistic Usage Trial** supplied for this work. It is the sole fixture source. Inputs and expected results are separate:

- `inputs` contains the exact paycheck, bill, expense, one-time income, savings deposit, goal allocation, and goal release records.
- `expected` contains the approved monthly totals, starting and ending checking balances, continuity values, savings balances, and selected running-ledger values.

The source report labels these values simulated/calculated rather than runtime verified. Foundation tests verify that the frozen contract is internally consistent; they do not claim that the full financial scenario has been executed.

## Storage harness

`helpers/storage-harness.js` loads the unchanged production file `js/storage.js` through `node:vm`. Each harness has its own in-memory `localStorage` implementation with browser-compatible string conversion, `length`, `key`, and CRUD behavior. No host browser storage is used.

The harness provides:

- deterministic timestamps and IDs;
- preloaded raw storage and corrupt-storage support;
- `failWrites` simulation at `localStorage.setItem`;
- raw storage and parsed data inspection;
- reset and cleanup capability.

The harness exposes the real `window.BudgetStorage` object. It does not reimplement M-Wallet financial calculations.

## Auth tests (BP2 / BP3)

`auth-architecture.test.js`, `auth-ui.test.js`, and `auth-data-safety.test.js`
load the real `js/auth/*.js` modules through `node:vm` with a **stubbed Supabase
library** and, for the UI, a minimal DOM stub (`helpers/dom-stub.js`). There is
**no network and no real Supabase project**. They cover the account state model,
the `signUp` / `signIn` / `resetPassword` / `updatePassword` /
`resendVerification` API (safe result objects, input validation, error mapping,
no token/password logging), the gateway show/hide + view wiring, and that no
auth operation ever reads or writes `localStorage["mWalletData"]`.

## Local data ownership tests (BP4)

`local-user-migration.test.js` and `migration-ui.test.js` load the real
`js/migration/*.js` (and, for the UI test, the auth modules too) through
`node:vm` with a stubbed Supabase library and the DOM stub. Realistic
`mWalletData` blobs are produced by the **real `js/storage.js`** via the storage
harness. They cover the meaningful-data detector (accurate + read-only), the
legacy-claim / fresh-auto-claim / returning-owner / wrong-account flows, the
corrupt-data and storage-failure fail-closed paths, idempotency, the multi-
account matrix, the end-to-end gate coordination with the auth gateway, and —
across every operation — that the migration layer makes **zero** writes to
`mWalletData` and exposes no owner id / token / financial content.

`fail-closed-ownership.test.js` loads the real `js/auth/auth-ui.js` and drives
the auth snapshot directly to prove the ownership gate is **deny-by-default**
for a configured, signed-in user: no guard, a throwing guard, `undefined`/`null`,
a non-object, `{}` , `{ hold: false }` (the old contract), `{ release: "true" }`,
and a missing migration module all keep the financial app `inert` +
`aria-hidden` behind the built-in fallback view — only an exact
`{ release: true }` opens the app. It also checks late guard registration causes
no flash, recovery still takes precedence, and unconfigured still allows local
developer mode.

## First-run setup wizard tests (BP5)

`first-run-setup.test.js` loads the real `js/setup/first-run-setup.js` through
`node:vm` with a stubbed `MWalletAuth`, a stubbed `MWalletLocalMigration` (BP4),
the **real `js/storage.js`** (via the storage harness) as `MWalletStorage`, and
an instrumented `localStorage`. It covers fresh-owner detection, existing-owner
auto-skip — including **balance-only** workspaces (a non-zero checking balance,
savings balance, or current-month `startingBalance` on its own → wizard skipped,
data untouched) and the case where the `"existing"` metadata write fails (owner
still reaches the app; BP4 stays authoritative) — the owner-bound draft (resume,
foreign-owner rejection, malformed-JSON safety), money parsing, step navigation,
and the **Finish** transaction — asserting that it changes **only** the account
names, the savings balance, `settings.firstDayOfWeek`, and the **current
calendar month's** `startingBalance` (via `storage.setStartingBalance`, never a
selected historical month), while income / expenses / savings goals / M-Cash /
other months / categories / currency stay deep-equal and the month carries no
created activity — plus idempotency (opening balance never applied twice),
save-failure / partial-apply / interrupted-then-reloaded paths, sign-out
mid-wizard, BP4 coordination, recovery precedence, and that `diagnostics()` /
state / the console leak no id, draft value, or financial content.

`setup-ui.test.js` unit-tests the pure `decideScreen` / `progressModel`, then the
DOM layer against `#mw-setup-gate` (gate visibility per status, step switching,
progress cells, XSS-safe rendering of a hostile account name, the action
buttons), and finally a real `auth-ui.js` + `first-run-setup.js` + `setup-ui.js`
**integration**: a fresh verified owner is held behind the wizard (app root
inert), Finish releases the app and hides the wizard, and a setup module that
never initialises still **fails open** (the verified owner reaches their app).
The DOM stub was extended with descendant / compound / `:checked` selector
support for this suite.

## Guided walkthrough tests (BP6)

`guided-walkthrough.test.js` loads the real `js/walkthrough/guided-walkthrough.js`
through `node:vm` with stubbed `MWalletAuth` / `MWalletLocalMigration` (BP4) /
`MWalletFirstRun` (BP5) / `BudgetNavigation`, the **real `js/storage.js`** as
`MWalletStorage`, and an instrumented `localStorage`. It covers the auto-start
decision (only a fresh, BP4-verified, BP5-`complete` owner with no record —
never a legacy `existing` user, a `completed`/`skipped` user, owner mismatch,
`needs_claim`, a required BP5 wizard, recovery, signed-out, or unconfigured),
step navigation (one Next = one step, unknown step → Welcome), first-time
progress + resume (owner-bound, foreign progress ignored), skip / complete
(idempotent, and a write failure closes the tour without a false "saved" claim
and without trapping the owner), manual-replay semantics (works for legacy users,
never re-runs BP5, a manual skip never downgrades a prior `completed`), sign-out
(progress kept for the same owner to resume), storage read/write failure
(fails open), and a realistic financial fixture proving `mWalletData` is
byte-for-byte identical before/after a full run with **zero** `setItem` /
`removeItem` targeting it.

`walkthrough-ui.test.js` unit-tests the pure placement solver
(`computePlacement` never returns NaN / Infinity, always keeps the card inside
the viewport, degrades to a centred card for a missing / oversized / off-screen
target) plus `progressModel` / `stepModel`, then the DOM layer against
`#mw-walkthrough` (overlay visibility per status, step copy via `textContent`,
progress cells, Back/Next/Finish labels, the missing-target fallback, no
double-fire, Escape == Skip), and finally a real `auth-ui.js` + service + UI
**integration**: a fresh wizard-complete owner is held behind the tour (app
inert), Finish releases the app, and a tour UI that never mounts still **fails
open**. The DOM stub gained `getBoundingClientRect` / `scrollIntoView` and a
`buildWalkthroughDom` helper.

## Cloud financial data tests (BP7)

BP7 adds the **capability** to store financial data as per-user,
row-level-secured Supabase documents — **not** synchronization. These suites run
entirely offline (`node:vm`, stubbed client, SQL read as text); **no network, no
real Supabase project**.

`cloud-financial-codec.test.js` loads the real `js/cloud/cloud-financial-codec.js`
and proves the local⇄cloud codec is **pure** (source-level: no Supabase /
network / storage / DOM / ambient time), **deterministic** (same input → same
document set and order), and **non-mutating** (a deep-frozen realistic
`mWalletData` v5 fixture is unchanged after encoding). It checks the document
registry matches the audited schema, that every amount / id / date / category /
M-Cash denomination round-trips deep-equal to the syncable slice, that
`version` / `migrations` and all BP2–BP6 local keys are excluded, that a
tombstoned document decodes as absent, and that NaN / Infinity / function /
cycle / oversized payloads and malformed month keys are rejected.

`cloud-financial-store.test.js` loads the real `js/cloud/cloud-financial-store.js`
with a stub Supabase query builder and a stub `MWalletAuth`. It proves status
(`unconfigured` / `signed_out` / `ready`) is derived **without a network call**,
`initialize()` makes **zero** client calls, the existing authenticated client is
reused (never a second one, no token copying), `createDocument` **omits
`user_id`** and ignores any caller-supplied owner id, reads filter by
type/key — **never** by `user_id` — updates carry the expected-`revision`
filter (stale → `revision_conflict`, missing → `not_found`, never a silent
overwrite), tombstone uses `UPDATE (deleted_at)` with no hard-delete on the
public API, raw Supabase errors map to safe codes only, and `diagnostics()`
leaks no owner id / payload / token.

`bp7-schema-contract.test.js` reads
`supabase/migrations/20260831_bp7_wallet_documents.sql` as text and asserts the
security-critical shape: a per-user `wallet_documents` table (`user_id` NOT NULL
`uuid` `DEFAULT auth.uid()`, FK `auth.users` `ON DELETE CASCADE`),
`UNIQUE (user_id, document_type, document_key)`, `revision` + `deleted_at`, RLS
`ENABLE` **and** `FORCE`, four `authenticated`-only policies each on
`auth.uid() = user_id` (INSERT `WITH CHECK`, UPDATE both), **no `anon` policy**,
`REVOKE … FROM anon`, the `BEFORE INSERT OR UPDATE` trigger that controls
`revision` and freezes id / owner / type / key / `created_at`, that the trigger
function is **not** `SECURITY DEFINER`, and that the file carries no project URL
or credential.

`bp7-no-auto-sync.test.js` proves BP7 builds capability, not sync: **only**
`cloud-financial-store.js` names `wallet_documents`, only the store + the
Settings check reference `window.MWalletCloudFinancial`, nothing subscribes to
auth changes to auto-pull, `js/storage.js` has zero knowledge of the cloud, the
store's boot (`initialize` + `DOMContentLoaded`) makes **zero** network calls,
and running the codec over **real `mWalletData`** (built with the real
`js/storage.js`) leaves the stored string byte-identical while the documents
round-trip back to the same syncable slice.

BP7 static wiring (load order, `./js/cloud/…` sub-path-safe URLs, `?v=`
bumps, `m-wallet-v26`, `0.9.0-beta.6`, no credential in the cloud files, the
`.env` / `.env.*` ignore) lives in `auth-architecture.test.js`.

**Not run by `npm test`, and deferred to BP12:** `scripts/bp7-live-rls-check.mjs`
(`npm run bp7:verify-rls`) is a standalone, operator-run two-user Row Level
Security proof against a **real** Supabase project. It has **not** been run — the
BP7 migration is not applied to any real project and RLS is not live-verified.
This check is **deferred to BP12** (the pre-beta security audit) and is a **hard
release gate before BP13 closed beta** — see
[`../docs/BP7-CLOUD-DATA.md`](../docs/BP7-CLOUD-DATA.md). It reads Supabase URL +
publishable key + two throwaway account credentials from the environment (or a
git-ignored `.env`), refuses a `service_role` key, and never prints a URL, key,
token, or password.

## Local-first sync tests (BP8)

BP8 adds the sync engine that connects local `mWalletData` to the BP7 cloud
store — **shipped with its release gate OFF**. These suites run entirely offline
(`node:vm`, a deterministic `FakeCloud`, the real `js/storage.js` via
`StorageHarness`); **no network, no real Supabase project**. Tests toggle the
release gate per case via `MWalletSync.configureForTest` — the committed default
(`enabled: false`) never changes.

`sync-planner.test.js` drives the **pure** planner through every
BASE × LOCAL × REMOTE combination: no-base create / download / baseline /
conflict; steady-state no-op / local-update / remote-download / both-changed;
deletions and tombstones (deletable month vs required singleton); unknown type
and newer schema → ignored; determinism; no input mutation; and that different
months / settings / M-Cash reconcile independently.

`sync-state.test.js` proves `mwallet.sync.state.v1` is **whitelist-validated**
(an unexpected key or a non-primitive leaf — i.e. a leaked payload — is
rejected), owner-bound (user A's state is ignored for user B), resets safely on
malformed JSON, de-dupes pending / conflict identities, and its summary /
diagnostics never contain the owner id.

`sync-codec-apply.test.js` covers the pure `applyDocument` / `removeDocument` /
`applyDocuments` helpers: a month apply touches only that month, `settings` keeps
the local category library, `version` + `migrations` + unrelated slices survive,
an invalid item is skipped not applied, a newer schema is rejected, and a full
encode → apply onto an empty default state reconstructs the same wallet.

`sync-engine.test.js` uses the real engine + codec + planner + state + storage +
a `FakeCloud`: release-off / unconfigured / signed-out / recovery /
owner-mismatch → **zero cloud calls**; first-device upload at revision 1 with
local data byte-identical; a local edit → one `expectedRevision` update;
second-device restore; network failure keeps pending and never resets the
baseline; schema-missing pauses sync; single-flight; a state-write failure after
a cloud write does not duplicate the change; a local-save failure during a
remote apply leaves local data authoritative; diagnostics leak nothing.

`sync-multidevice.test.js` runs two `SyncDevice` sandboxes for one owner sharing
one `FakeCloud` table (unique constraint, revisions, tombstones,
`expectedRevision`) through cases **A–K**: first upload → restore; add
transaction → pull; independent August / September edits → both survive;
same-month concurrent edit → conflict, neither overwrites; **Keep this device**
pushes the *current* local; **Use cloud version** applies the *current* cloud;
offline edit then online sync; offline edit of a different document merges
cleanly; stale revision → conflict, no clobber; remote tombstone → local
deletion; account switch → no wrong-owner apply; and a realistic seeded wallet
round-trips A → B with no lost cents / ids / categories / M-Cash quantities.

`sync-bootstrap.test.js` covers the fresh-device bootstrap decision and its
fail-open auth-ui guard: release-off → always releases; enabled + checking →
holds, then releases after Continue Offline; meaningful local + empty cloud →
READY (uploads async, local untouched); empty local + cloud data → RESTORED
(BP5 re-decides → `existing`, no wizard); empty + empty → EMPTY (no fake
"synced" metadata); empty + offline → NEEDS_DECISION (never assumes cloud
empty) → deferred; a sync fault never traps a verified owner.

`sync-race.test.js` proves no local edit is lost to a mid-cycle race: a local
edit during a remote download → the remote copy becomes a
`local_changed_during_sync` conflict, not an overwrite; a local edit during a
remote tombstone → the deletion is blocked; local data becoming meaningful
during the bootstrap check → the cloud restore is skipped in favour of
no-baseline reconciliation; a newer local save before an outbound upload
executes → the stale write is skipped, the document stays pending, the baseline
reflects only what was written, and the next cycle uploads the current version.

`sync-ui.test.js` drives `sync-ui.js` against a DOM stub: the `#mw-sync-bootstrap`
gate (checking copy, Retry / Continue Offline wired to the engine, auth-ui
coordination, never syncs on its own) and the `#mw-sync-conflicts` overlay
(human labels — "August 2026 budget", "M-Cash", "Settings" — no raw JSON / owner
id / payload; **Keep this device** = one explicit click → one `keep-local` call;
**Use cloud version** = requires a confirmation whose text says the local copy
is replaced, cancel does nothing, confirm → one `use-cloud` call; **Decide
later** and **Close** and **Escape** change no data; dialog role / aria-modal /
aria-labelledby / aria-describedby / focus-into-dialog / real `<button>`
controls). It also loads `settings-ui.js` and checks the **Cloud Sync** row:
release-off → "activation pending" text, Sync Now + Review hidden, `onSyncNow`
runs no cycle; release-on → "Up to date" / "Syncing…" / "Offline — changes
saved…" / "N changes waiting" / "Needs attention — N conflicts", never "Backed
up".

BP8 static wiring lives in `auth-architecture.test.js`: release gate ships
`enabled:false`; **a normal browser build has no `setOverride` and no
query-string / localStorage / Settings / hostname switch — only a pre-load
`window.__MWALLET_TEST_ENV__ = true` reveals the test-only override**; load
order; sub-path-safe URLs; `m-wallet-v27`; `0.9.0-beta.7`; the `storage.js`
save-event contract (one `mwallet:financial-saved`, still synchronous
true/false); the `ownership → bootstrap → setup → walkthrough` gate order; no
credential in any `js/sync/` file.

New helpers: `helpers/fake-cloud.js` (the in-memory `wallet_documents` stand-in)
and `helpers/sync-device.js` (a simulated device — its own engine sandbox, an
injected release stub, a `setRaceHook` seam, its own sync-state storage, the
real `js/storage.js`).

**Not run by `npm test`, and deferred to BP12:** live multi-device / conflict /
offline verification of BP8 against a real Supabase project — a hard release
gate before BP13. The engine ships with its release gate OFF. See
[`../docs/BP8-SYNC-ENGINE.md`](../docs/BP8-SYNC-ENGINE.md).

## Passkey tests (BP9)

BP9 adds passkey / WebAuthn sign-in — **shipped with its release gate OFF**.
These suites use a stubbed Supabase passkey client and a DOM stub; **no real
`navigator.credentials`, no network**. Tests exercise the enabled adapter by
injecting a release dependency (or, for the sync-ui-style tests, by setting
`window.__MWALLET_TEST_ENV__ = true` before `passkey-release.js` loads) — the
committed default (`enabled: false`) never changes. Helper:
`helpers/passkey-harness.js` (a Supabase-auth passkey stub + a `MWalletAuth`
stub loaded around the real `passkey-release.js` + `passkeys.js`).

`passkey-release.test.js` — the gate ships disabled (phase BP12); a normal
browser build exposes **no** `setOverride` and there is no query-string /
localStorage / hostname / Settings switch; setting the flag *after* load is too
late; the BP8 sync gate is a separate switch that stays false; no `js/` file
turns passkeys on itself.

`passkey-capability.test.js` — `getCapabilities()` reflects
`PublicKeyCredential` + `navigator.credentials` + secure context + Supabase
method presence, makes **zero** network / WebAuthn calls, and **never** treats a
missing built-in platform authenticator as "no passkeys" (a security key or a
synced passkey still counts). Diagnostics leak no email / user id / token.

`passkey-auth.test.js` — sign-in + registration through the real adapter:
release-disabled / unconfigured / recovery / auth-error / unsupported →
**zero** passkey API calls; signed-out **is** a valid sign-in path; `signIn`
reuses the one client, calls `signInWithPasskey` once, never asks for an email,
never creates a session itself, returns a safe result (no raw credential /
session / token); a cancelled ceremony → `user_cancelled` (not a scary error);
raw Supabase / browser errors map to safe codes only; a duplicate click while
busy is suppressed. Registration: signed-out / unconfirmed / anonymous /
recovery / disabled / unsupported cannot register; success calls
`registerPasskey` once and refreshes the list; a failure leaves the
session / account / local data intact; **no automatic enrollment** exists
(source-level); the adapter **never** calls `navigator.credentials` itself.

`passkey-management.test.js` — list requires signed-in; the list is normalized
safely (a credential id is never a user-facing string) and **never persisted**;
rename validates the name (trim, non-empty, ≤ 120) and doesn't show the new name
as final until the server confirms; delete requires an exact ref and one call; a
**failed delete keeps the item** (no optimistic removal); the **last** passkey
can be removed after confirmation (password remains the fallback); raw errors
never leak.

`passkey-ui.test.js` — release-disabled: the "Use a Passkey" control stays
hidden, Settings says *"activation pending verification"*, no button can start a
ceremony, and a forced click on any hidden control is a no-op. Password recovery
wins (no gateway control, no Settings panel). Enabled test mode: the control
appears (password + Forgot + Create still there), one click → one `signIn`, a
cancelled result reads friendly; unverified email → *"Verify your email
first"*, no Add button; one Add click → one `register`. Settings list: friendly
names + dates render as **text** (a hostile `<img onerror>` name is inert; the
module never assigns `innerHTML`), no credential id / raw JSON / token. Removal:
Cancel = **zero** delete calls; Confirm = **exactly one** for that passkey;
Escape closes non-destructively; the dialog carries
`role`/`aria-modal`/`aria-labelledby`/`aria-describedby`, moves focus in, and
uses real `<button>` controls. Rename: swaps to an edit field; Save → one
`rename` call. Loading + `initialize()` make **zero** Supabase calls.

BP9 static wiring lives in `auth-architecture.test.js`: the ONE Supabase client
gains `experimental.passkey` (every original option kept, exactly one
`lib.createClient` call site, no second client); the passkey adapter never
calls `navigator.credentials` / a token / an Authorization header / a direct
GoTrue fetch and embeds no RP ID or credential; passkey modules load after
auth-ui and before the financial engine, sub-path safe; the auth gateway keeps
email + password + Forgot + Create with the passkey control hidden; the gate
order (BP4 → BP8 → BP5 → BP6) is unchanged and the `passkey-signin` handler only
delegates; the passkey files touch no financial data and never reference the
BP8 sync engine; `docs/BP9-PASSKEYS.md` keeps the RLS ≠ E2EE line, the
biometric-privacy statement, and the RP-ID-change warning.

**Not run by `npm test`, and deferred to BP12:** live WebAuthn / passkey
verification against a real Supabase project + real browsers / devices, and the
choice of the permanent production RP ID — a hard release gate before BP13. The
passkey release gate ships OFF. See
[`../docs/BP9-PASSKEYS.md`](../docs/BP9-PASSKEYS.md).

## Account / privacy / recovery tests (BP10)

BP10 turns Settings into an account-management centre. `helpers/account-harness.js`
loads the real `js/account/account-controls.js` around the real `js/storage.js`
engine with deterministic stand-ins for `MWalletAuth`, the BP4 owner record, BP5
first-run, BP6 walkthrough, and BP8 sync state — **no network, no real Supabase
client**.

`account-controls.test.js` — `getSummary` / `diagnostics` expose booleans + the
user-facing email only (never a user id, token, or `service_role`);
`accountDeletionStatus` is honestly `available:false`; `changeEmail` delegates to
`MWalletAuth.updateEmail` and never writes the wallet; `signOut` sends
`scope:"local"`, `signOutEverywhere` sends `"global"`; the erase target list is
computed from each module's own key export and excludes `mwallet.auth.config` /
`.session`.

`account-data-export.test.js` — the versioned wrapper (`formatVersion` separate
from the wallet schema); `mWalletData` is **byte-identical** before and after;
every auth / token / config / owner / setup / sync artifact is excluded; no
`localStorage` write; JSON round-trips with no precision loss.

`account-data-import.test.js` — `inspectImport` returns a counts-only preview and
writes nothing; rejects bad JSON, wrong wrapper, future export version, missing /
malformed wallet, `__proto__` keys, non-finite numbers, and `> 5 MiB`;
`restoreWallet` needs `{ confirmed:true }`, replaces the wallet, never reads owner
identity from the file, refuses on `owner_mismatch`; **a full export → erase →
restore round-trip is deep-equal with a per-cent total check**. Failure-order
tests: the BP8 sync metadata is reset **and verified gone before** the financial
save (`sync_reset_failed` aborts with the old wallet byte-identical); an
ownership-verification failure writes nothing at all; a `storage.save` failure
after the sync reset leaves the old wallet authoritative with the stale baseline
gone; a BP5 / UI re-resolution throw after a verified restore still returns
`ok: true`; a matching verified BP4 owner record is reused, not rewritten.

`account-data-erase.test.js` — the exact phrase is required (case/space
tolerant); the wallet + every owner-bound sidecar is removed **and verified**;
`localStorage.clear()` is never called; `mwallet.auth.config` and unrelated keys
survive; the user is signed out once; the erase flow never refreshes the app or
re-resolves BP4/BP5. Failure-order tests: a removal failure for the setup /
walkthrough / sync / legacy-financial / ownership key each aborts with
`erase_incomplete` + `walletPreserved: true` and **`mWalletData` intact**; a
primary-key removal failure reports `erase_incomplete` without a success claim; a
sign-out failure after a verified erase returns `erased_signout_failed`
(`erased: true`) with the wallet still gone and **not recreated**.

`account-ui.test.js` — the pure row/preview/erase-arm helpers; the change-email /
restore-preview / erase dialogs; the restore preview is built with `textContent`
(no HTML injection); Escape cancels non-destructively; the UI file references no
financial storage, no Supabase client, and assigns no `innerHTML`.

BP10 static wiring lives in `auth-architecture.test.js`: account files create no
second Supabase client and use no `auth.admin` / `service_role` / `deleteUser`;
`account-controls` changes email through `MWalletAuth.updateEmail`; `auth.js`
gained `updateEmail` + scoped `signOut` with the sole `lib.createClient` still in
`auth-client.js`; `index.html` loads the account bundle + `account.css` and drops
the old `#export-data` / `#settings-import-*` / `#clear-data` buttons; the three
dialogs are `role="dialog"` + `aria-modal`; `service-worker.js` precaches the
bundle at `m-wallet-v29`; version is `0.9.0-beta.9`. Hardening statics: restore
resets **and verifies** the sync metadata before the save; erase orders the
primary financial key last, aborts before it on any failure, and never refreshes
the app; the legacy `storage.exportData` / `importData` / `clearAllData` helpers
are unreachable from `app.js`, `settings-ui.js`, and `account-ui.js`, and
`storage.js` marks them deprecated.

**Not run by `npm test`, and deferred to BP12:** a real email-change
confirmation, a real `scope:"global"` sign-out, and a restore/erase pass on a
real browser. Secure **account deletion** needs a trusted server-side path and is
**not built** — a hard release gate before BP13. See
[`../docs/BP10-ACCOUNT-PRIVACY-RECOVERY.md`](../docs/BP10-ACCOUNT-PRIVACY-RECOVERY.md).

## Beta operations + feedback tests (BP11)

`helpers/beta-harness.js` loads the real `js/beta/*` modules in a `node:vm`
sandbox with deterministic stand-ins for the version API, auth, navigation, and
the BP8/BP9 release gates. `fetch` is **never** provided by default — a test must
inject a recording transport. No real network.

`beta-config.test.js` — the committed defaults ship `feedbackEndpoint: null` /
`supportEmail: null`; an HTTPS endpoint is accepted; `http:` / `javascript:` /
`data:` / `file:` / `ftp:` / `ws:` and malformed URLs all resolve to `null`;
support-email shape is validated; the source file has no token / provider secret
and no `localStorage`.

`beta-ops.test.js` — the build summary uses the central version API;
`safeDiagnostics()` contains only technical fields (asserted: **no** user id,
account email, token, session, owner, or financial word); the auth state is a
label only; a contact email appears **only** with an explicit opt-in **and** a
supplied address; `currentLimitations()` is derived from the live release gates;
`generateReportId()` is `MWB-`-prefixed and injectable; release notes are curated
and match the build; the developer `diagnostics()` object is safe operational
counts only.

`beta-feedback.test.js` — validation (required title/description, whitelisted
category/severity, trim + CRLF→LF + null-byte strip + length caps); `buildReport`
wraps a versioned payload with **no wallet / session / token**; diagnostics
attach only with opt-in; an oversized report is rejected; `serialize` /
`toPlainText` never contain wallet data. Transport: no-endpoint → `not_configured`
with no call; offline → `offline` with no call; a configured HTTPS endpoint → one
`POST` of JSON returning the report id; non-HTTPS → `invalid_endpoint`; a hung
request → `timeout`; a throw → `network_error` (internal host never surfaced);
4xx **and** 5xx → `server_error` with no raw body; a safe `reference` string is
normalised, anything else dropped; **one submit = one request, ever**.

`beta-known-issues.test.js` — empty registry ships with an honest empty state
("No published known issues…" + "…undiscovered issues", never "no bugs"); unique
ids; whitelisted statuses; version-list normalisation; entries are plain strings.

`beta-ui.test.js` — the Beta Hub renders version / delivery status / limitations
/ known-issue count / support; the feedback dialog opens from Settings **and**
the auth gateway; Review requires title + description; the review list and
known-issues list are built with `textContent` (hostile HTML strings render as
text); **Send is unavailable without an endpoint** while Copy / Download still
work; with an endpoint one Send = one submit and a double-click is suppressed; a
failed send keeps the review step and the form contents; diagnostics + contact
email default **off**; closing with typed content asks to discard while an
untouched form closes immediately; Escape closes non-destructively.

`beta-integrity.test.js` — a full lifecycle (build → serialize → plain-text →
filename → failed send → mocked send) makes **zero** global-`fetch` calls and
**zero** `localStorage` writes with no endpoint; with an endpoint, nothing is
sent until `submit()` (then exactly one `POST`); building a report while signed
out / owner-mismatch makes **no** state-mutating call on auth / migration /
first-run / walkthrough / sync and leaks no owner / user id; a repo-wide
analytics / tracking scan (beta code included) stays clean; no beta module
installs a global `error` / `unhandledrejection` handler.

BP11 static wiring lives in `auth-architecture.test.js`: the only outbound
network boundary is `beta-feedback.js` `submit()`; no beta file reads financial
data, uses `localStorage`, needs an auth token, or contains analytics / a global
crash handler / an unsafe HTML sink / a front-end access allowlist; `index.html`
loads the beta bundle + `beta.css`, has the Beta Hub and the auth-gate report
control, and three `role="dialog"` + `aria-modal` dialogs; the SW precaches the
bundle at `m-wallet-v30` and returns early for the non-GET feedback `POST`;
version is `0.9.0-beta.10`; the docs stay precise (no false E2EE claim, an
honest IP-address note).

**Not run by `npm test`, and deferred to BP12:** configuring + verifying a real
feedback destination. No test sends real feedback; there is no live endpoint
verification yet. The committed build ships with no endpoint. See
[`../docs/BP11-BETA-OPERATIONS.md`](../docs/BP11-BETA-OPERATIONS.md).

## Running

Node.js is required. From the repository root:

```text
npm test
```

The runner uses only `node:test` and `node:assert/strict`; no external testing packages are required.

## Scope boundary

These tests stop at P2.5.2. They do not seed or execute the complete August-to-October financial scenario through production storage. That regression work begins at P2.5.3 and is intentionally paused.
