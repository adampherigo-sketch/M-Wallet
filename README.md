# M-Wallet

A local‑first personal budgeting **Progressive Web App** by Zevaryn Systems.

> **Status: Beta Preparation — `0.9.0-beta.2`.** M-Wallet is a pre‑release build.
> It is **not production‑ready**. Accounts and sign-in now exist (when a Supabase
> project is configured); cloud backup, sync, and recovery of financial data are
> still being built. See [Early Beta data warning](#early-beta-data-warning).

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
│   └── auth.css            BP3 — account gateway (scoped .mw-auth-*)
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
│   │   └── auth-config.example.js   config template + how-to (3 routes)
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
`tests/auth-data-safety.test.js` — all with a stubbed Supabase library and a
small DOM stub (`tests/helpers/dom-stub.js`); **no network, no real project**.
See `tests/README.md`.

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

**The local-first boundary is unchanged.** Signing in, signing up, signing out,
and resetting a password **never** read, write, clear, or migrate financial
data. All financial data stays in `localStorage["mWalletData"]`; the auth
session lives in a separate key (`mwallet.auth.session`). **BP3 does not sync,
upload, or move any financial data** — that is a later phase (BP7+).

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
  financial app `inert`); signed-in hides it; **unconfigured never shows it**.
  The financial DOM and data are never removed — only covered.
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

**Not yet:** cloud financial tables, data migration, financial sync, and
passkeys — each is its own later phase (BP4, BP7, BP8, BP9). A production domain
must be chosen before the passkey phase; GitHub Pages may serve the app under a
repo sub-path (e.g. `/M-Wallet/`) rather than a domain root.

---

## Beta Preparation Status

M-Wallet has completed its core financial foundation and the Zevaryn Grid visual
overhaul, and is now in **Beta Preparation** — a sequence of phases (BP0–BP13)
focused on making it safe, understandable, recoverable, secure, testable, and
multi‑device before real testers use it. Done so far: a versioned beta build
(BP1), the authentication architecture (BP2), and the account UI + session
experience (BP3). Still planned: existing-local-user migration, a first‑run
setup wizard, a guided walkthrough, row‑level‑secured cloud data, a local‑first
sync engine, passkeys, account/privacy/recovery controls, and a beta feedback
system.

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
