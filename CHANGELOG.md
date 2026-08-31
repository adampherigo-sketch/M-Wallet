# Changelog

All notable changes to M-Wallet. This project follows semantic versioning with
a pre‑release channel: `0.9.0-beta.1` → `0.9.0-beta.2` → `0.9.1-beta.1` → …

Entries below the first version are historical milestones drawn from the Git
history; they predate formal version tagging and are grouped by the phase name
used in their commits.

---

## [Unreleased]

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
