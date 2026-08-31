# M-Wallet

A local‑first personal budgeting **Progressive Web App** by Zevaryn Systems.

> **Status: Beta Preparation — `0.9.0-beta.8`.** M-Wallet is a pre‑release build.
> It is **not production‑ready**. Accounts, sign-in, non-destructive local
> data ownership, a first‑run setup wizard, an optional guided walkthrough,
> a row-level-secured cloud data schema, a complete local‑first **sync engine**,
> and a complete **passkey** sign-in system now exist (when a Supabase project
> is configured). Both the sync engine and passkeys are **shipped OFF** — their
> release gates stay disabled until a pre-beta security pass (BP12). Email +
> password sign-in and password reset are unchanged. **Local data remains the
> source of truth** and nothing synchronizes automatically. See
> [Early Beta data warning](#early-beta-data-warning).

---

## Overview

M-Wallet helps one person keep track of their money in a single place:

- what's in **Checking** and **Savings**,
- how much **physical cash** is on hand (**M-Cash**),
- **income**, **bills**, and **expenses** for each month,
- progress toward **savings goals**,
- and monthly / yearly / custom‑range **reports**.

It runs entirely in the browser. All financial data currently lives **on the
device**, in `localStorage`. It installs as an app and works offline.

The interface is the **Zevaryn Grid** design system: near‑black graphite,
a violet primary accent, a teal secondary accent, glass panels, and
`tabular-nums` for every figure.

---

## Current Features

Only features that exist today are listed.

| Area | What it does |
|---|---|
| **Dashboard** | Total Balance (Checking + Savings + M-Cash), account cards, monthly budget gauge, bills due, recent transactions, this‑month totals, savings snapshot |
| **Budget** | Monthly overview, spending by category/subcategory, bills list, expenses ledger, income ledger |
| **Income** | Add / edit / delete; types; recurring (weekly, biweekly, twice‑monthly, monthly, custom); monthly & yearly totals |
| **Expenses** | Add / edit / delete; merchant, category, subcategory, notes; recurring occurrences generated across months |
| **Bills** | Add / edit / delete; due date, category, merchant; **Mark Paid / Mark Unpaid** |
| **Monthly recurring bills** | A monthly bill carries forward to future months automatically, with no duplicate occurrences when navigating between months or reloading |
| **Optional recurring end date** | A recurring bill can stop on a chosen date; later months show no occurrence |
| **Paid‑state isolation** | Marking one month's occurrence paid does not affect any other month |
| **Transactions** | Derived activity feed; text search (description / merchant / category / notes); All / Income / Expenses filters; category filter; date grouping |
| **Categories & subcategories** | 21 system categories, 127 system subcategories; add / rename / enable‑disable / delete custom ones (system categories can be renamed and disabled but not deleted); legacy category strings resolve to IDs without being rewritten |
| **Savings** | General Savings balance; Checking ↔ Savings transfers |
| **Savings Goals** | Create / edit / delete; **allocate** and **release** funds within Savings without creating or destroying money |
| **M-Cash** | Denomination inventory (13 denominations, integer‑cent), Add Cash (increments, never replaces), Recount (set exact counts), Calculator (greedy exact‑change suggestion bounded by inventory), Cash Savings (move denominations aside without changing the M-Cash total) |
| **Reports** | Monthly, Yearly, and Date‑to‑Date; income / spending / bills / expenses / net; spending trend chart; income‑vs‑spending; top categories; top merchants; detailed category + subcategory breakdown |
| **Settings** | General (currency display), category & subcategory management, M-Cash shortcuts, Export / Import, local‑storage read‑out, System & Beta info, Danger Zone (Reset) |
| **PWA installation** | Installable to Home Screen / desktop; offline‑capable app shell; iOS add‑to‑Home‑Screen guidance |

---

## Architecture

Static HTML / CSS / JavaScript. **No framework, no bundler, no build step.**
Open `index.html` and it runs.

```
M-Wallet/
├── index.html              single-page shell + all page markup
├── manifest.json           PWA manifest (name, icons, theme, start_url)
├── service-worker.js        offline app-shell cache (CACHE_NAME + APP_SHELL)
├── package.json            test script + npm-side version mirror
├── CHANGELOG.md
│
├── css/
│   ├── style.css           legacy base theme + nav + forms + shell
│   ├── zevaryn-grid.css    ZG1 — design tokens (--z-*), .z-* primitives, legacy re-map
│   ├── dashboard.css       ZG2   (scoped #home-page)
│   ├── budget.css          ZG3   (scoped #budget-page)
│   ├── transactions.css    ZG4   (scoped #transactions-page)
│   ├── savings.css         ZG5   (scoped #savings-page)
│   ├── m-cash.css          ZG6   (scoped #m-cash-page)
│   ├── reports.css         ZG7   (scoped #reports-page)
│   ├── settings.css        ZG8   (scoped #settings-page)
│   ├── zg9.css             ZG9 — loaded last; responsive + a11y overrides
│   ├── auth.css            BP3 — account gateway (scoped .mw-auth-*)
│   ├── migration.css       BP4 — local data ownership gateway
│   ├── setup.css           BP5 — first-run setup wizard
│   ├── walkthrough.css     BP6 — guided app walkthrough (#mw-walkthrough)
│   │                       (BP7 adds no CSS — one reused Settings row)
│   ├── sync.css            BP8 — #mw-sync-bootstrap gate + #mw-sync-conflicts overlay
│   └── passkeys.css        BP9 — "Use a Passkey" + Settings passkeys + removal dialog
│
├── js/
│   ├── app-version.js      single runtime source of truth for the app version
│   ├── storage.js          MWalletStorage — the financial engine + localStorage
│   ├── nav.js              hash routing, header, quick-add menu
│   ├── app.js              BudgetApp — renders every page from a month snapshot
│   ├── money.js            MoneyManager — the add/edit money modal + savings actions
│   ├── reports-analytics.js  ReportAnalytics — pure chart/aggregation helpers
│   ├── settings-ui.js      SettingsUI — category manager, import, system panel
│   ├── pwa.js              service-worker registration + install prompt
│   ├── auth/               MWalletAuth / MWalletAuthUI — accounts + sessions
│   │   ├── auth-config.js       resolves + validates browser-safe auth config
│   │   ├── auth-client.js       lazy Supabase library loader + client factory
│   │   ├── auth.js              state model, session restore, account actions
│   │   ├── auth-ui.js           the account gateway UI + app gating (BP3)
│   │   ├── auth-config.example.js   config template + how-to (3 routes)
│   │   ├── passkey-release.js   MWalletPasskeyRelease — the passkey gate (enabled:false, BP9)
│   │   ├── passkeys.js          MWalletPasskeys — Supabase passkey adapter (no DOM)
│   │   └── passkey-ui.js        MWalletPasskeyUI — "Use a Passkey" + Settings management
│   ├── migration/          MWalletLocalMigration — local data ownership (BP4)
│   │   ├── local-user-migration.js  ownership state + meaningful-data detector
│   │   └── migration-ui.js          the #mw-migration-gate screens
│   ├── setup/              MWalletFirstRun — first-run setup wizard (BP5)
│   │   ├── first-run-setup.js       setup state + draft + the Finish transaction
│   │   └── setup-ui.js              the #mw-setup-gate wizard screens
│   ├── walkthrough/        MWalletWalkthrough — guided app walkthrough (BP6)
│   │   ├── guided-walkthrough.js    tour state + owner-bound record/progress
│   │   └── walkthrough-ui.js        the #mw-walkthrough coach-mark overlay
│   ├── cloud/              cloud financial data capability (BP7 — NOT sync)
│   │   ├── cloud-financial-codec.js   MWalletCloudFinancialCodec — pure local⇄cloud codec (+ BP8 apply helpers)
│   │   └── cloud-financial-store.js   MWalletCloudFinancial — the only wallet_documents client
│   ├── sync/               local-first sync engine (BP8 — shipped OFF)
│   │   ├── sync-release.js   MWalletSyncRelease — the release gate (enabled:false)
│   │   ├── sync-state.js     MWalletSyncState — owner-bound metadata, no payloads
│   │   ├── sync-planner.js   MWalletSyncPlanner — pure BASE×LOCAL×REMOTE reconciliation
│   │   ├── sync-engine.js    MWalletSync — orchestration, bootstrap, conflicts
│   │   └── sync-ui.js        MWalletSyncUI — bootstrap gate + conflict overlay
│   ├── vendor/
│   │   └── supabase-js.min.js   vendored @supabase/supabase-js (UMD, pinned)
│   └── m-cash/
│       ├── cash-storage.js    MCashStorage — denominations, integer-cent totals
│       ├── cash-calculator.js MCashCalculator — greedy exact-change
│       ├── cash-savings.js    MCashSavings — denomination allocation
│       ├── cash-ui.js         MCashUI — the M-Cash screen + views
│       └── cash.js            M-Cash bootstrap
│
├── icons/                  m-wallet-icon-192 / -512 / -512-maskable / apple-touch
├── supabase/migrations/    BP7 cloud schema + RLS (applied manually — see docs/BP7-CLOUD-DATA.md)
├── scripts/                bp7-live-rls-check.mjs — standalone two-user RLS verifier
├── docs/BP7-CLOUD-DATA.md  cloud data model, RLS, migration + live-verification steps
├── docs/BP8-SYNC-ENGINE.md local-first sync engine, conflict model, release gate
├── docs/BP9-PASSKEYS.md    passkeys, biometric privacy, RP ID, BP12 verification
├── docs/design/            Zevaryn Grid concept reference (not used at runtime)
├── docs/archive/           superseded phase reports, kept for history
├── .github/workflows/      CI (runs the test suite on push / PR to main)
└── tests/                  node:test suites (see Testing)
```

**Financial engine.** `js/storage.js` (`window.MWalletStorage`) owns all money
math and persistence. It normalizes data on every load, materializes recurring
bill/expense occurrences on read, and is the single source of truth for Total
Balance, budget totals, recurrence, paid‑state, savings accounting, and report
inputs. UI modules only read snapshots and call its methods — they never do
money math of their own.

---

## Local Development

No install step for the app itself — it's static files. You just need a static
web server so the service worker and `fetch()` work (open `file://` and the PWA
parts won't run).

**VS Code Live Server** (recommended for editing):

1. Install the *Live Server* extension.
2. Right‑click `index.html` → **Open with Live Server** → `http://127.0.0.1:5500/`.

**Python** (no extension):

```sh
cd M-Wallet
python3 -m http.server 4178
# open http://127.0.0.1:4178/
```

**Node** (`npx`):

```sh
npx serve .
```

Node is only required to run the automated tests (see below).

---

## Testing

Tests use the built‑in Node test runner (`node:test`) — **no test framework
dependency**. Node 20+ is required (developed on Node 24).

```sh
npm test
# equivalently:
node --test tests/*.test.js tests/**/*.test.js
```

Both commands run the same full suite. Every push and pull request to `main`
also runs it in GitHub Actions (`.github/workflows/tests.yml`); CI fails when
any test fails.

The suites live in `tests/` (unit + storage‑harness) and `tests/m-cash/`, plus
`tests/helpers/storage-harness.js` which loads the real `storage.js` in a
`node:vm` sandbox with a fixed clock and deterministic IDs. Authentication is
covered by `tests/auth-architecture.test.js`, `tests/auth-ui.test.js`, and
`tests/auth-data-safety.test.js`; local data ownership (BP4) by
`tests/local-user-migration.test.js`, `tests/migration-ui.test.js`, and
`tests/fail-closed-ownership.test.js`; the first-run setup wizard (BP5) by
`tests/first-run-setup.test.js` and `tests/setup-ui.test.js`; the guided
walkthrough (BP6) by `tests/guided-walkthrough.test.js` and
`tests/walkthrough-ui.test.js` — all with a stubbed Supabase library and a small
DOM stub (`tests/helpers/dom-stub.js`); **no network, no real project**.
The migration tests build realistic `mWalletData` with the real `storage.js` and
assert the migration layer makes **zero** writes to it; the fail-closed suite
proves the financial app stays blocked when the ownership guard is missing,
throws, or returns a malformed result. The setup tests run Finish against the
real `storage.js` and assert **only** the five allowed fields change (everything
else deep-equal), that an existing owner is never re-asked for balances, and
that a fresh owner is held for setup while a broken setup module fails **open**.
The walkthrough tests prove it auto-starts only for a fresh BP5-completed owner,
never writes `mWalletData`, resumes safely, and — like BP5 — fails **open** when
the tour UI can't render. The cloud data capability (BP7) is covered by
`tests/cloud-financial-codec.test.js` (pure round-trip / determinism /
no-mutation), `tests/cloud-financial-store.test.js` (stubbed client: ownership
never sent, reads filter by type/key, optimistic concurrency, safe error
mapping), `tests/bp7-schema-contract.test.js` (static assertions over the SQL
migration — RLS enabled + forced, authenticated-only policies on
`auth.uid() = user_id`, no anon access, revision/immutability trigger), and
`tests/bp7-no-auto-sync.test.js` (only the store names `wallet_documents`, boot
does zero network, real `mWalletData` is byte-identical after encoding). The
local-first sync engine (BP8) is covered by `tests/sync-planner.test.js` (every
BASE×LOCAL×REMOTE reconciliation case + determinism + no mutation),
`tests/sync-state.test.js` (whitelist validation, owner-binding, no payload),
`tests/sync-codec-apply.test.js`, `tests/sync-engine.test.js`,
`tests/sync-multidevice.test.js` (a deterministic two-device A↔B simulation:
first upload, pull, independent edits, conflict, both resolutions, offline,
stale revision, remote tombstone, account switch, financial realism),
`tests/sync-race.test.js` (mid-sync local edit / tombstone / bootstrap /
outbound-stale races — no new edit is ever lost),
`tests/sync-bootstrap.test.js`, and `tests/sync-ui.test.js` (the bootstrap gate,
the conflict overlay, and the Settings row) — all with a FakeCloud + the real
`js/storage.js`; **no network, no real Supabase project**. Passkeys (BP9) are
covered by `tests/passkey-release.test.js` (no production enable path),
`tests/passkey-capability.test.js`, `tests/passkey-auth.test.js` (sign-in +
registration — zero calls when the gate is off / in recovery, safe error
mapping, no token or credential leak, no automatic enrollment),
`tests/passkey-management.test.js` (list / rename / delete — no optimistic
removal, no persisted list), and `tests/passkey-ui.test.js` (the gateway
control, the Settings section, the removal confirmation, XSS, accessibility) —
all with a stubbed Supabase client + a DOM stub; **no real
`navigator.credentials`, no network**. See `tests/README.md`.

**Live Supabase / device checks not covered by `npm test`:**

- **BP9 — live WebAuthn / passkey verification + the final RP ID decision** is
  **deferred to BP12** and is a **hard release gate before BP13 closed beta**.
  The passkey release gate ships OFF. See
  [`docs/BP9-PASSKEYS.md`](docs/BP9-PASSKEYS.md).
- **BP8 — live multi-device / conflict / offline verification** is **deferred to
  BP12** and is a **hard release gate before BP13 closed beta**. The engine
  ships with its release gate OFF. See
  [`docs/BP8-SYNC-ENGINE.md`](docs/BP8-SYNC-ENGINE.md).
- **BP7 — applying the migration + `npm run bp7:verify-rls`** (the two-user Row
  Level Security proof) is **deferred to BP12**, the pre-beta security audit. It
  has **not** been run: the migration is not applied to any real project and RLS
  is not live-verified. It remains a **hard release gate before BP13 closed
  beta**. See [`docs/BP7-CLOUD-DATA.md`](docs/BP7-CLOUD-DATA.md).
- **BP3** — a live signup / email-verification / password-reset round trip.
- **BP4** — live multi-account ownership verification.

---

## PWA

- **`manifest.json`** — `name`/`short_name` "M-Wallet", `display: standalone`,
  `start_url: "./"`, dark theme/background colors, and the three
  `m-wallet-icon-*` icons including a `maskable` 512.
- **`service-worker.js`** — precaches the app shell (`APP_SHELL`) under a
  versioned `CACHE_NAME`. Navigations and scripts/styles are network‑first with
  a cache fallback; images are cache‑first. `ignoreSearch` lets versioned
  (`?v=N`) asset URLs resolve to the precached clean URLs offline.
- **Installability** — Chromium browsers show an install prompt (surfaced in
  Settings → System & Beta); iOS Safari uses Add to Home Screen with in‑app
  guidance.
- **Offline** — once the shell is cached, the app opens and all existing local
  data is usable with no network.

Bumping `CACHE_NAME` on each asset change forces installed PWAs to pick up new
files on their next launch.

---

## Data Architecture

**Today, M-Wallet is local‑only.** All financial data is stored in the browser's
`localStorage` under the key `mWalletData` (with one‑way migration from the
legacy `budgetTrackerData` key). There is **no account system and no cloud sync
yet** — those are the subject of upcoming Beta Preparation phases.

Consequences of the current model:

- Data lives on **one device, in one browser profile**. It does not follow you
  to another device or browser.
- Clearing site data, using a private window, or uninstalling removes it.
- **Export** (Settings → Data & Storage) produces a full JSON backup; **Import**
  replaces all current data with a backup file.

---

## Authentication

M-Wallet has a full account experience (`js/auth/`) that appears **only when a
Supabase project is configured**. With no project configured, every build ships
in **AUTH UNCONFIGURED** mode and the local financial app is the whole app —
exactly as before.

**What a beta user can do** (auth configured):

- **Create an account** with email + password, then complete Supabase's email
  verification.
- **Sign in** / **sign out**.
- **Reset a forgotten password** by email, and **set a new password** when they
  return from the reset link.
- **Reload and stay signed in** — the session is restored from Supabase's own
  browser storage.
- See their **account email** and a **Sign Out** control in
  Settings → System & Beta.

> The end-to-end email round-trips (verification link, password-reset callback)
> are covered by tests with a stubbed provider; **live verification against a
> real Supabase project is still pending**.

**The local-first boundary is unchanged.** Signing in, signing up, signing out,
and resetting a password **never** read, write, clear, or migrate financial
data. All financial data stays in `localStorage["mWalletData"]`; the auth
session lives in a separate key (`mwallet.auth.session`). **Authentication does
not sync, upload, or move any financial data.** Neither does BP7's cloud
capability — see [Cloud financial data (BP7)](#cloud-financial-data-bp7).

### Local data ownership (BP4)

M-Wallet existed as a local-first app before accounts. Adding an account is a
**non-destructive local ownership** step, not a data move:

- When you sign in and this device already holds **meaningful** M-Wallet data
  with **no owner yet**, you see **"Your existing M-Wallet data is here"** and
  one action: **Keep & Protect My Data**. Nothing is deleted, nothing is
  uploaded — the data stays on the device and the local workspace is linked to
  your account.
- A **fresh** device (no meaningful data) is claimed automatically with no
  extra screen.
- Reloading as the **same account** opens straight to the app.
- If the data on this device belongs to a **different account**, M-Wallet shows
  **"This M-Wallet data belongs to a different account"** and keeps the
  financial app inaccessible. It never displays the other account's email or id,
  never shows balances/transactions, and **never reassigns or clears** the
  ownership marker or the data. Sign in with the owning account to continue.
- **Signing out never deletes** `mWalletData`, the ownership marker, categories,
  savings, or M-Cash data.

Ownership is recorded in its **own** key, `mwallet.local.owner.v1` — separate
from `mWalletData` — as `{ schemaVersion, ownerUserId, claimedAt, source }`.
Identity is the **Supabase user id** (never the email, which can change). No
passwords, tokens, keys, sessions, emails, or financial contents are ever
stored, returned, or logged by the migration layer. **BP4 does not upload,
back up, or synchronize any financial data** — it stays on the device.

`js/migration/local-user-migration.js` (`window.MWalletLocalMigration`) is the
service; `js/migration/migration-ui.js` + `css/migration.css` render the
`#mw-migration-gate` screens.

### First-run setup wizard (BP5)

After BP4 has **positively verified** local ownership, a genuinely **new**
owner (no meaningful data, no completion record) sees a short four-step wizard —
Welcome → account balances → basic preferences → Review — before the app opens.
On **Finish** it writes, once, through the canonical `storage.js` and only to
`accounts.checking.name`, `accounts.savings.name` / `.balance`,
`settings.firstDayOfWeek`, and the **current calendar month's starting balance**
— the checking opening balance the dashboard and Budget page actually show (the
app displays a derived checking figure, not `accounts.checking.balance`; the
starting balance is set via `storage.setStartingBalance(currentMonthKey)`, which
re-syncs that cache, and always targets `storage.getCurrentMonthKey()` — never a
month the Budget page happens to have selected). It **never** creates income,
bills, transactions, savings goals, M-Cash entries, or any month activity, and
**makes no network calls**. The save-error screen never claims data is
unchanged — its wording ("Your M-Wallet data is safe. Retry to continue setup
from where it stopped.") is truthful whether nothing was written or the accounts
saved and only the completion record failed; retry is idempotent.

An **existing** owner **auto-skips**: any BP4 meaningful signal *or* a non-zero
balance on its own — a checking balance, a savings balance, or a current-month
starting balance — counts as established data, no income/bills/transactions
required. The wizard never asks anyone to re-enter balances and never overwrites
established values (a `$2,850` checking balance is never reset to `$0` by a
missing setup record). If BP5's own convenience metadata can't be written, the
verified owner still reaches their wallet. Wizard progress is kept in an
owner-bound local draft (`mwallet.setup.draft.v1`); completion is recorded in
`mwallet.setup.v1` as `{ schemaVersion, ownerUserId, status, completedAt,
source }` — the Supabase user id, never the email; no financial values.

**BP4 stays the security gate; BP5 is an experience gate that fails *open*.** A
missing, throwing, or malformed setup guard, or a setup module that never loads,
never locks a verified owner out of their own app. `js/setup/first-run-setup.js`
(`window.MWalletFirstRun`) is the service; `js/setup/setup-ui.js` +
`css/setup.css` render the `#mw-setup-gate` screens.

### Guided app walkthrough (BP6)

After BP5's wizard has been **completed** (status exactly `complete` — the
fresh-user path, never `existing`/legacy), a genuinely new owner is shown an
**optional** 8-step coach-mark tour of the main areas: Welcome → Home → Budget →
Transactions → Savings → M-Cash → Reports → Settings. Each step navigates the
real page (via `BudgetNavigation.showPage`) and spotlights a developer-controlled
`[data-walkthrough-target]`; the tour **never** submits a form, clicks an
Add/Edit/Delete control, changes the month, touches M-Cash, or writes
`mWalletData`, and it makes **no network calls**.

The user can **Skip** at any step (Escape does the same), and **replay** the tour
later from **Settings → System & Beta → Guided Tour** (*Completed* / *Skipped* /
*Not viewed*). A legacy/existing user is **never** auto-toured — they get the
Settings replay only. Completion / skip is recorded per owner in
`mwallet.walkthrough.v1` (`{ schemaVersion, ownerUserId, status, completedAt,
skippedAt, contentVersion }` — the Supabase user id, never the email); first-time
resume progress lives in `mwallet.walkthrough.progress.v1` and is cleared once
the tour ends. The persisted status is the user's strongest state (a manual skip
never downgrades a prior *Completed*), and a metadata-write failure never traps
the owner.

**BP6 is education, not a gate — it fails *open* completely.** `js/auth/auth-ui.js`
gains `setWalkthroughGuard` / `setWalkthroughScreenActive`; it holds the app for
the tour **only** while the overlay is genuinely presenting, and reveals the
verified owner's app on anything else (no guard / throw / malformed / a tour that
never renders). `js/walkthrough/guided-walkthrough.js` (`window.MWalletWalkthrough`)
is the service; `js/walkthrough/walkthrough-ui.js` + `css/walkthrough.css` render
the `#mw-walkthrough` overlay, which lives **outside `.app`** so its controls
stay usable while the financial UI is inert.

**Fail-closed.** The financial app root's `inert` / `aria-hidden` state has a
single owner, `js/auth/auth-ui.js`. For a configured, signed-in user the
**default is DENY** — the app is revealed **only** when the ownership guard the
migration service registers returns exactly `{ release: true }` (i.e. `owned` or
`fresh_claimed`). A missing guard, a throwing guard, an `undefined`/`null`
result, or any malformed result keeps the app blocked. If the migration module
or its UI never loads, `auth-ui.js` shows a **built-in fallback** ("Local data
protection couldn't be verified" + Retry / Sign Out) — never a blank screen,
never the financial UI. Authenticated access alone can never reveal the local
financial application.

### Cloud financial data (BP7)

BP7 adds the **capability** to store financial data as per-user,
row-level-secured documents in Supabase. It does **not** enable synchronization.
**Local `mWalletData` remains the active source of truth** — opening M-Wallet,
saving, or finishing setup never uploads anything. Sync (change tracking,
upload/download, conflict resolution) is BP8.

**BP7 implementation is complete.** The migration has **not** been applied to any
real Supabase project, RLS has **not** been live-verified, no cloud sync is
active, and no financial data is backed up. Applying the migration and running
the two-user live RLS check is **deferred to BP12** (the pre-beta security audit)
and is a **hard release gate before BP13 closed beta** — see *Release gate* below.

- **Schema** — `public.wallet_documents`, one row per independently versioned
  document (`accounts`, `settings`, `categories`, `recurring-income`,
  `recurring-expenses`, `savings`, `cash`, `month/<YYYY-MM>`), keyed
  `UNIQUE (user_id, document_type, document_key)`. To be applied **manually** via
  the Supabase SQL Editor from
  `supabase/migrations/20260831_bp7_wallet_documents.sql` (the file contains no
  URL or key).
- **Row Level Security** — RLS `ENABLE`d **and** `FORCE`d; four
  `authenticated`-only policies, each `auth.uid() = user_id` (INSERT via
  `WITH CHECK`, UPDATE via both). **No `anon` policy**; `REVOKE ALL … FROM anon`.
  `user_id` is `NOT NULL DEFAULT auth.uid()` with `ON DELETE CASCADE` — the
  browser never sends it. A `BEFORE INSERT OR UPDATE` trigger (no `SECURITY
  DEFINER`) owns `revision` and freezes `id` / `user_id` / type / key /
  `created_at`, so a document can't be renamed or handed to another user.
- **Codec** — `js/cloud/cloud-financial-codec.js` (`MWalletCloudFinancialCodec`):
  a **pure**, deterministic local⇄cloud translation. No Supabase, network,
  storage, or DOM; never mutates input; preserves every value exactly.
- **Store** — `js/cloud/cloud-financial-store.js` (`MWalletCloudFinancial`): the
  **only** runtime module that queries `wallet_documents`. Reuses the existing
  authenticated client via `MWalletAuth._getClient()` (no second client, no
  token copying); optimistic concurrency by `revision`; tombstones via
  `deleted_at`; raw errors mapped to safe codes. `initialize()` does **zero**
  network — nothing auto-syncs.
- **Settings** — a read-only *Cloud Financial Storage* row plus an optional
  user-triggered *Check cloud storage* button (a `SELECT id LIMIT 1`
  reachability probe — uploads nothing). It never says "backed up" or "synced".
- **RLS ≠ E2EE.** RLS stops other *users* and anonymous callers. The payload is
  readable `jsonb` to anyone with project/`service_role` access (i.e. the
  operator). BP7 is **not** "zero knowledge" or "end-to-end encrypted".
- **Release gate** — the BP7 code, schema, codec, store, tests, and security
  behaviour are final. Live two-user RLS verification is **deferred to BP12** and
  is a **hard gate before BP13 closed beta**: beta must not open until the
  migration is applied to a real project **and** `npm run bp7:verify-rls` prints
  `RESULT: PASS` with two accounts, both recorded in the BP12 audit. Full
  details, migration steps, and verification instructions:
  [`docs/BP7-CLOUD-DATA.md`](docs/BP7-CLOUD-DATA.md).

### Local-first sync (BP8)

BP8 is the complete synchronization engine that connects local `mWalletData` to
the BP7 cloud store — **built and shipped OFF**. `MWalletSyncRelease.isEnabled()`
is `false`, so the engine makes **zero** cloud requests: no bootstrap check, no
upload, no download, no timers, no online-event sync. **Local data is the source
of truth** and nothing synchronizes automatically.

- **The one rule** — a local save never depends on cloud success. `storage.save()`
  is unchanged (synchronous, returns `true`/`false`, never async). It now
  dispatches one `mwallet:financial-saved` event (no payload) that the engine
  reacts to *after* the save has already succeeded; a cloud failure there never
  affects local data.
- **Pure planner** (`js/sync/sync-planner.js`) — compares BASE × LOCAL × REMOTE
  per document. No network, storage, DOM, input mutation, timestamp guessing, or
  array merging. **Conservative:** same-document concurrent change with no
  shared baseline → conflict; independent documents (a different month, or
  settings vs a month) keep syncing.
- **Conflicts are never silent.** A conflict pauses that one document, surfaces
  in Settings ("Needs attention — N conflicts" → Review), and never locks the
  app or blocks other documents. "Keep this device" pushes the *current* local
  version (re-fetching the live remote first); "Use cloud version" applies the
  *current* cloud copy behind an explicit confirmation.
- **Atomic remote apply** — downloads are applied in one pass: `storage.load` →
  `codec.applyDocuments` on a clone → one `storage.save` → verify by reload →
  one `BudgetApp.refresh`. `version` + `migrations` and every unrelated slice
  are preserved.
- **Second-device bootstrap** — when release is on and a fresh device signs in,
  the engine restores an existing cloud wallet *before* BP5 runs, so a returning
  user never creates a competing starting balance. Fail-open: a broken sync
  module never traps a verified owner. Gate order becomes
  `AUTH → BP4 ownership → BP8 bootstrap → BP5 setup → BP6 walkthrough → APP`.
- **Owner-bound state** — `mwallet.sync.state.v1` holds only document
  identities, content hashes, cloud revisions, and pending/conflict identities —
  **whitelist-validated, never a financial payload**. Bound to the Supabase user
  id; user A's state is ignored when user B signs in.
- **No new local edit is ever lost.** The engine re-reads and re-hashes the
  current local state immediately before applying any remote change and before
  every outbound write; an edit that lands mid-cycle turns the remote copy into
  a safe conflict, and a stale outbound write is skipped and re-queued.
- **No production enable path.** `MWalletSyncRelease` has no `setOverride` in a
  normal browser build (it appears only under a pre-load test opt-in), and there
  is no query-string, localStorage, Settings, console, or hostname switch. BP12
  flips the committed default itself.
- **Cloud boundary** — the engine talks to Supabase **only** through
  `MWalletCloudFinancial`; never `.from("wallet_documents")`, a client, a token,
  or a `service_role` key. **BP8 adds sync, not encryption** — still RLS, still
  not zero-knowledge / not E2EE. The Settings row never says "Backed up".
- **Release gate** — the engine is final and test-covered (two-device
  simulation, revisions, tombstones, offline/online, conflicts, races,
  sign-out, storage failures). Live multi-device / conflict / offline
  verification is **deferred to BP12** and is a **hard gate before BP13 closed
  beta**. Full details: [`docs/BP8-SYNC-ENGINE.md`](docs/BP8-SYNC-ENGINE.md).

### Passkeys (BP9)

BP9 adds a complete **passkey** (WebAuthn) sign-in system as an *alternative*
passwordless method — **built and shipped OFF**. `MWalletPasskeyRelease.isEnabled()`
is `false`, so M-Wallet makes **zero** passkey / `navigator.credentials` calls,
shows no "Use a Passkey" control to normal users, and runs no automatic prompt.
Email + password sign-in and password reset are unchanged.

- **A passkey ≠ biometric data.** M-Wallet never receives a fingerprint, a face
  scan, or a biometric template — the OS / authenticator performs verification
  (Face ID, Touch ID, Windows Hello, a device PIN, or a security key). The
  feature is worded **"Use a passkey"**, never "Face ID Login".
- **Additive, not a replacement.** Passkeys never delete the password, disable
  email/password sign-in, or clear recovery. During this beta, password + email
  reset is the recovery path.
- **One client, one boundary.** `js/auth/auth-client.js` adds
  `experimental: { passkey: true }` to the *existing* Supabase client (2.112.4
  already ships the API). The adapter `js/auth/passkeys.js` reuses
  `MWalletAuth._getClient()` and the official high-level methods
  (`signInWithPasskey`, `registerPasskey`, `passkey.list/update/delete`) — it
  never builds a client, never calls `navigator.credentials` itself, never
  touches a token, and stores nothing (no credential IDs, no list, no keys).
- **Same gate chain.** A passkey sign-in enters `AUTH → BP4 ownership → BP8
  bootstrap → BP5 → BP6 → APP` exactly like a password sign-in — a
  passkey-authenticated User B still hits BP4 `owner_mismatch` on User A's
  device. Password recovery still wins.
- **Not MFA, not E2EE.** Passkey sign-in is a passwordless *first factor*, not a
  second factor (no TOTP added). It improves authentication only — cloud
  financial payloads are still RLS-protected, **not** zero-knowledge / E2EE.
- **RP ID matters.** The WebAuthn relying-party ID is **not** in M-Wallet JS — it
  is Supabase project configuration. The permanent production host must be chosen
  before any real passkey is enrolled, because changing the RP ID later makes
  existing passkeys unusable.
- **Release gate** — the passkey code is final and test-covered (release gate,
  capability detection, sign-in / registration / management, safe errors, XSS,
  accessibility). Live WebAuthn / device verification + the RP ID decision are
  **deferred to BP12** and are a **hard gate before BP13 closed beta**. Full
  details: [`docs/BP9-PASSKEYS.md`](docs/BP9-PASSKEYS.md).

### Architecture

- **One entry point** — `window.MWalletAuth`. The rest of the app never talks
  to Supabase directly.
  - Observation: `initialize()` (idempotent, detached on `DOMContentLoaded`),
    `whenReady()`, `getState()`, `getUser()`, `getSession()` (safe summary — no
    tokens), `isAuthenticated()`, `subscribe(fn)`, `diagnostics()`.
  - Actions: `signUp(email, password)`, `signIn(email, password)`, `signOut()`,
    `resetPassword(email)`, `updatePassword(newPassword)`,
    `resendVerification(email)`. Each **validates + normalizes input**, returns a
    **predictable safe result object** (`{ ok, code?, message?, … }`), maps
    provider errors to a user-displayable string, and **never returns a raw
    Supabase session or token**, logs a password, or logs a token.
- **Account UI** — `js/auth/auth-ui.js` + `css/auth.css` render the gateway
  (`#mw-auth-gate` in `index.html`): welcome / create account / sign in / verify
  email / forgot password / set new password / loading / connection error.
  It **gates the app**: configured + signed-out shows the gateway (and marks the
  financial app `inert`); signed-in hands off to the BP4 ownership check (see
  *Local data ownership*) before the app opens; **unconfigured never shows it**.
  The financial DOM and data are never removed — only covered.
- **Gate order** — auth configured? → auth initialized? → signed in? → password
  recovery? → **local ownership positively verified?** (BP4, *fail-closed*) →
  **first-run setup decision** (BP5, *fail-open*) → **guided-walkthrough decision**
  (BP6, *fail-open*) → only then is the financial app fully revealed. A valid
  login alone never bypasses an owner mismatch, and a missing/broken ownership
  check never defaults to allowing access; a missing/broken setup or walkthrough
  check, by contrast, never keeps a verified owner out (see *Local data ownership
  → Fail-closed*, *First-run setup wizard*, and *Guided app walkthrough*).
- **Explicit state model** — `unconfigured` → `initializing` →
  `signed_out` / `signed_in` / `error` (+ a `recoveryMode` flag for the
  password-reset return). Only `signed_in` means authenticated. A refused
  browser key also lands in `unconfigured` (with a safe `configIssue` reason),
  never `error` — the local app is never blocked.
- **Browser key validation** — `auth-config.js` accepts only browser-safe keys:
  - **Publishable key** (`sb_publishable_…`) — the preferred, current key.
  - **Legacy `anon` key** (a JWT whose role is `anon`) — the older browser-safe
    equivalent, still accepted.
  - **Refused:** the **secret key** (`sb_secret_…`), the **`service_role`** key
    (a JWT whose role is `service_role`), and any other unrecognized/privileged
    key format. Secret and service-role keys are **server-only** and must never
    appear in M-Wallet front-end source or the repo. The key value is never
    logged, and `diagnostics()` reports only the key *family*
    (`publishable` / `legacy_anon`), never the key.
  - A publishable/anon key is public by design; real data protection is
    authenticated ownership + Row Level Security on every table (BP7).
- **Configuration (static-PWA friendly, no build step, first match wins):**
  1. `window.MWalletAuthConfig` — an object set by an inline script.
  2. `localStorage["mwallet.auth.config"]` — **the recommended local-dev path.**
     From the running app's DevTools console:
     `MWalletAuthConfigResolved.saveLocalConfig("https://<ref>.supabase.co", "sb_publishable_…")`
     then reload. Stored only in that browser, never committed, never shipped,
     kept clear of `mWalletData`; undo with `clearLocalConfig()`. **No file to
     create and no tracked `index.html` edit.**
  3. `DEPLOY_CONFIG` in `auth-config.js` — the deployed GitHub Pages build (fill
     with the public values, bump `CACHE_NAME`).
  - A file override (`js/auth/auth-config.local.js`, git-ignored) is still
    supported for anyone who prefers files, but is no longer required.
- **Non-blocking boot** — the financial UI renders synchronously; the gateway
  shows a brief branded loading state while auth settles, then the right view.
  No blank screen, no flash of a signed-out screen, no race.
- **Redirects** — email links come back to the **directory of the current
  page**, so the same code works at a domain root
  (`http://127.0.0.1:4178/`) and under a repo sub-path
  (`https://<user>.github.io/M-Wallet/`). Supabase (PKCE +
  `detectSessionInUrl`) consumes the `?code=` parameter and M-Wallet scrubs any
  leftover auth parameters from the visible URL. Callback tokens are never
  logged. The project's **Redirect URLs** must list every origin used.
- **Offline** — restores from the stored session only, never deletes a session
  or any data on a network failure, and reconciles once on reconnect (no retry
  loops).
- **Provider library** — `@supabase/supabase-js` is vendored
  (`js/vendor/supabase-js.min.js`, pinned) and injected lazily by
  `auth-client.js` **only when a project is configured**. It is precached by the
  service worker but never executed in unconfigured mode.
- **Service worker** — unchanged policy: every cross-origin request is ignored,
  so Supabase token/session endpoints are never cached. Auth static assets
  (`auth-ui.js`, `auth.css`) are part of the precached app shell.
- **Diagnostics** — console output is silent unless `MWalletAuth.debug === true`
  (a single actionable warning is the one exception: a refused browser key logs
  one line, with a fixed safe reason and never the key). Otherwise only
  non-sensitive strings are ever logged — never keys, tokens, sessions,
  passwords, or financial data.

### Browser key validation

`auth-config.js` accepts only browser-safe keys:

- **Publishable key** (`sb_publishable_…`) — the preferred, current key.
- **Legacy `anon` key** (a JWT whose role is `anon`) — the older browser-safe
  equivalent, still accepted.
- **Refused:** the **secret key** (`sb_secret_…`), the **`service_role`** key,
  and any other unrecognized/privileged key format. Secret and service-role keys
  are **server-only** and must never appear in M-Wallet front-end source or the
  repo. The key value is never logged, and `diagnostics()` reports only the key
  *family* (`publishable` / `legacy_anon`), never the key.

### Configuration (static-PWA friendly, no build step, first match wins)

1. `window.MWalletAuthConfig` — an object set by an inline script.
2. `localStorage["mwallet.auth.config"]` — **the recommended local-dev path.**
   From the running app's DevTools console:
   `MWalletAuthConfigResolved.saveLocalConfig("https://<ref>.supabase.co", "sb_publishable_…")`
   then reload. Stored only in that browser, never committed, never shipped,
   kept clear of `mWalletData`; undo with `clearLocalConfig()`. **No file to
   create and no tracked `index.html` edit.**
3. `DEPLOY_CONFIG` in `auth-config.js` — the deployed GitHub Pages build (fill
   with the public values, bump `CACHE_NAME`).

A file override (`js/auth/auth-config.local.js`, git-ignored) is still supported
for anyone who prefers files, but is no longer required. See
`js/auth/auth-config.example.js`.

**Not yet:** account/privacy/recovery controls and a beta feedback system — each
is its own later phase (BP10–BP11). BP7 + BP8 build the row-level-secured cloud
schema and a complete sync engine, and BP9 builds passkey sign-in, but the sync
**and** passkey **release gates ship OFF**: no financial data leaves the device
automatically, and no passkey / WebAuthn call is made. A permanent production
domain must be chosen (it becomes the WebAuthn RP ID) before real passkeys are
enrolled; GitHub Pages may serve the app under a repo sub-path (e.g.
`/M-Wallet/`) rather than a domain root.

---

## Beta Preparation Status

M-Wallet has completed its core financial foundation and the Zevaryn Grid visual
overhaul, and is now in **Beta Preparation** — a sequence of phases (BP0–BP13)
focused on making it safe, understandable, recoverable, secure, testable, and
multi‑device before real testers use it. Done so far: a versioned beta build
(BP1), the authentication architecture (BP2), the account UI + session
experience (BP3), non-destructive local existing-user data ownership (BP4),
a first‑run setup wizard for genuinely new owners (BP5), an optional guided
app walkthrough (BP6), a row‑level‑secured cloud financial data schema (BP7 —
schema, RLS, and a pure codec + repository client), a complete local‑first
**sync engine** (BP8 — planner, engine, conflict UI, second‑device bootstrap),
and a complete **passkey** sign-in system (BP9 — release gate, capability
detection, sign-in / registration / management, confirmation dialogs). The BP8
sync **and** BP9 passkey **release gates ship OFF**; live two‑user RLS
verification, live multi‑device sync verification, and live WebAuthn / passkey
verification (with the final RP ID) are all **deferred to BP12** and are hard
gates before BP13. Still planned: account/privacy/recovery controls (BP10) and a
beta feedback system (BP11).

It is **not production‑ready** and should not be treated as a finished product.

---

## Early Beta data warning

During early Beta, **do not enter financial information you cannot afford to
lose.** Until the account, cloud‑backup, sync, and recovery phases are complete:

- data can only be recovered from a manual **Export**,
- there is no way to restore it on a new device or after clearing site data,
- schema changes during development could require a reset.

Use demo / sample figures for testing. Real budgeting data is safe to enter only
once the recovery story is finished (a later phase will say so explicitly).

---

## Development Workflow

- **`main`** is the stable Beta‑candidate branch. It should always be
  installable and green in CI.
- Non‑trivial work should happen on a **feature branch** and merge to `main`
  once tests pass.
- **Run `npm test` before every merge or push.** CI enforces this on `main` and
  on pull requests, but running it locally first keeps `main` clean.
- Bump the version in **`js/app-version.js`** *and* **`package.json`**
  (identical strings) for each release; update **`CHANGELOG.md`**.
- Bump `CACHE_NAME` in `service-worker.js` whenever a cached asset changes.

---

© Zevaryn Systems. Beta software.
