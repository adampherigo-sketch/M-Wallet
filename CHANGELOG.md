# Changelog

All notable changes to M-Wallet. This project follows semantic versioning with
a pre‑release channel: `0.9.0-beta.1` → `0.9.0-beta.2` → `0.9.1-beta.1` → …

Entries below the first version are historical milestones drawn from the Git
history; they predate formal version tagging and are grouped by the phase name
used in their commits.

---

## [Unreleased]

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
