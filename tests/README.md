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

## Running

Node.js is required. From the repository root:

```text
npm test
```

The runner uses only `node:test` and `node:assert/strict`; no external testing packages are required.

## Scope boundary

These tests stop at P2.5.2. They do not seed or execute the complete August-to-October financial scenario through production storage. That regression work begins at P2.5.3 and is intentionally paused.
