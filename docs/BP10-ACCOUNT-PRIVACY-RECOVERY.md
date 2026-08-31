# BP10 — Account, Privacy & Recovery Controls

**Status: IMPLEMENTATION COMPLETE — LIVE ACCOUNT / RECOVERY VERIFICATION DEFERRED TO BP12**

**Account deletion: NOT IMPLEMENTED — REQUIRES A TRUSTED SERVER-SIDE DELETION PATH**

BP10 turns Settings into a trustworthy account-management centre: change email,
change password, sign out (this device / everywhere), export a wallet backup,
restore from a backup, and erase this device's wallet — plus an honest privacy
statement.

> **Core safety principle**
> *Account management must never silently destroy financial data.* Every
> destructive action is explicit, scoped, confirmed, truthful, and recoverable
> where reasonable. No account action (change email, change password, sign out,
> passkey management) modifies `mWalletData`.

---

## 1. Modules

| File | Global | Responsibility |
|---|---|---|
| `js/account/account-controls.js` | `window.MWalletAccount` | DOM-free account API — summary, change email, sign out, export / inspect / restore / erase, diagnostics |
| `js/account/account-ui.js` | `window.MWalletAccountUI` | Settings sections (Account, Security & Recovery, My Data, Privacy) + the change-email / restore-preview / erase dialogs |
| `css/account.css` | — | Section rows + dialog styling (44px targets, dark mode, reduced motion) |
| `js/auth/auth.js` | `window.MWalletAuth` | **+`updateEmail(newEmail)`**, **`signOut(opts)`** now accepts `{ scope }` |

`account-controls.js` is the only new module that reads or writes localStorage.
`account-ui.js` is DOM-only: it never parses an export, never writes storage, and
turns untrusted import text into DOM via `textContent` only — never HTML.

### `MWalletAccount` API

```
getSummary()                     -> { account, security, data, privacy, accountDeletion }
diagnostics()                    -> booleans only (no email / id / wallet / token)
accountDeletionStatus()          -> { available:false, reason:"requires_trusted_server", note }

changeEmail(newEmail)            -> MWalletAuth.updateEmail  (verification email to the NEW address)
sendPasswordReset()              -> MWalletAuth.resetPassword(current email)   (BP3 flow, reused)
signOut({ scope:"local" })       -> this device
signOutEverywhere()              -> scope:"global"

exportAvailable() / exportWallet()      -> { ok, filename, json, mimeType }
importAvailable() / inspectImport(text) -> { ok, preview }         (no writes)
restoreWallet(text, { confirmed:true }) -> replaces the local wallet
eraseTargets() / eraseLocalWallet({ phrase:"ERASE" })
```

Never exposed by any return value: access token, refresh token, raw Supabase
session, service key, owner user id, raw Supabase error object.

---

## 2. Email & password

* **Change email** → `MWalletAuth.updateEmail(newEmail)` → the ONE existing
  Supabase client's `auth.updateUser({ email }, { emailRedirectTo })`. Supabase
  emails the **new** address a confirmation link; the signed-in session's user
  does not reflect the change until that link is clicked. Guarded against
  recovery mode, signed-out, unconfigured, and "same as current".
* **Change password** → reuses BP3's `resetPassword(email)` (emails a reset
  link). No new password-change implementation, no second client.
* Neither path touches `mWalletData`, the owner record, setup, walkthrough, or
  sync state.

## 3. Sessions / sign out

`auth.js` `signOut(opts)` passes `opts.scope` (`"local" | "global" | "others"`)
straight through to the vendored client's `auth.signOut({ scope })`
(`POST /logout?scope=…`). No scope → the client default.

| Settings action | scope | effect |
|---|---|---|
| Sign out | `local` | ends this browser's session only |
| Sign out of all devices | `global` | revokes every refresh token for the account (confirmed first) |

Local financial data is never changed by either.

## 4. Local storage inventory

| Key | Category | Erased by "Erase wallet from this device"? |
|---|---|---|
| `mWalletData` | **Financial** | ✅ |
| `budgetTrackerData`, `budgetTrackerMoneyEntries`, `mWalletMoneyEntries` | Legacy financial | ✅ |
| `mwallet.local.owner.v1` | BP4 owner record | ✅ |
| `mwallet.setup.v1`, `mwallet.setup.draft.v1` | BP5 first-run | ✅ |
| `mwallet.walkthrough.v1`, `mwallet.walkthrough.progress.v1` | BP6 tour | ✅ |
| `mwallet.sync.state.v1` | BP8 sync metadata (no payloads) | ✅ |
| `mwallet.auth.config` | Local dev Supabase config (NOT owner-bound) | ❌ kept |
| `mwallet.auth.session` | Supabase-managed session | ❌ (cleared via sign-out, not `removeItem`) |

The erase target list is computed at runtime from each module's own key export
(`MWalletLocalMigration.OWNER_KEY`, `MWalletFirstRun.SETUP_KEY` / `DRAFT_KEY`,
`MWalletWalkthrough.RECORD_KEY` / `PROGRESS_KEY`, `MWalletSyncState.KEY`) so it
cannot drift from the real keys.

**`localStorage.clear()` is never called.** Unrelated site data is never removed.

---

## 5. Export format

```json
{
  "format": "m-wallet-export",
  "formatVersion": 1,
  "createdAt": "2026-08-29T12:00:00.000Z",
  "appVersion": "0.9.0-beta.9",
  "wallet": { "...": "the full mWalletData financial object" }
}
```

* `formatVersion` is the **wrapper** version and is **separate** from
  `wallet.version` (the `mWalletData` schema version, currently 5).
* `exportWallet()` reads the **raw** stored string and `JSON.parse`s it — it does
  **not** call `storage.load()` (which normalises and re-saves). `mWalletData` is
  byte-identical before and after an export.
* **Excluded:** auth session, access/refresh tokens, auth config, Supabase
  URL/key, `ownerUserId`, setup completion/draft, walkthrough state, sync
  metadata, passkey metadata.
* Filename: `m-wallet-export-YYYY-MM-DD.json`.
* Download is a `Blob` + `URL.createObjectURL` + temporary anchor, revoked
  afterwards. **No network.** Nothing is uploaded to any service.

> ⚠️ **The export file is NOT encrypted.** It contains your financial data in
> plain JSON. Store it somewhere private. It contains no account password and no
> sign-in token.

---

## 6. Restore / import safety

**Safe ordering (BP10 final hardening).** Financial data is the last thing
touched, and every metadata step is verified *before* the wallet is replaced:

1. validate the file
2. **security:** BP4 verified owner (or dev mode); `owner_mismatch` blocked;
   recovery mode blocked
3. prepare the normalized restored wallet **in memory** (clone → strip stray
   identity/auth keys → `storage.normalizeData`) — **no write yet**
4. reset the BP8 sync baseline / pending / conflict metadata
5. **verify** the sync-state key is actually gone → if not, **`sync_reset_failed`**
   and **abort** — the existing wallet stays authoritative and no old cloud
   revision metadata is left attached to new contents
6. only now `storage.save(restored wallet)`
7. verify the reload
8. **fail-open** experience re-resolution only (ownership re-check, BP5
   `_resolve`) — a throw here never fails the financial restore
9. refresh the UI

Rejected, with a friendly message, before any write:

| Condition | Code |
|---|---|
| Not valid JSON | `invalid_json` |
| Not the `m-wallet-export` wrapper / not an object / array | `invalid_export` |
| `formatVersion` newer than this app supports | `unsupported_export` |
| No `wallet` | `missing_wallet` |
| `wallet` not an object, or `months` / arrays / `settings` / `cash` malformed | `invalid_wallet` |
| `__proto__` / `prototype` / `constructor` key anywhere | `unsafe_keys` |
| A non-finite number anywhere (e.g. `1e999` → `Infinity`) | `invalid_wallet` |
| `wallet.version` newer than the local schema | `unsupported_schema` |
| Payload larger than `MAX_IMPORT_BYTES` (5 MiB) | `too_large` |
| Sync-state reset cannot be verified | `sync_reset_failed` (**pre-save abort**) |
| `storage.save` fails | `local_storage_error` (previous wallet intact; stale baseline already gone → next repair is no-base) |

**Ownership:** the access guard in step 2 is the ownership check. Step 8
**reuses** the already-verified BP4 owner record — it only calls
`ensureOwnership()` if `getOwnership()` shows the record is somehow absent or no
longer matching. Owner identity is **never** read from the file; stray
`ownerUserId` / `owner` / auth / sync / setup keys in a hand-edited file are
stripped before `normalizeData`.

Restore **replaces** the local wallet — not an additive merge. BP5 first-run
re-resolves → established data → `existing` (no auto-tour).

---

## 7. Erase wallet from this device

Labelled **"Erase wallet from this device"** — never "Delete account".

Two-step dialog:

1. Strong warning: *cloud sync is off, so this may destroy your only copy* —
   with an **"Export a backup first"** button.
2. Type `ERASE` to enable the final button.

**Removal order (BP10 final hardening) — the real wallet is deleted LAST:**

| Phase | Keys | On failure |
|---|---|---|
| A | setup (`mwallet.setup.v1`, `.setup.draft.v1`), walkthrough (`.walkthrough.v1`, `.walkthrough.progress.v1`), sync (`mwallet.sync.state.v1`) | **STOP — `mWalletData` untouched**, `erase_incomplete` with `walletPreserved: true` |
| B | legacy financial keys (`budgetTrackerData`, `budgetTrackerMoneyEntries`, `mWalletMoneyEntries`) | same — **STOP before `mWalletData`** |
| C | ownership (`mwallet.local.owner.v1`) | same — **STOP before `mWalletData`** |
| D | **`mWalletData` — LAST** | `erase_incomplete` |

Each removal is followed by `getItem(key) === null`. If **any** removal in A/B/C
fails, the flow stops **before** deleting `mWalletData` — an erase failure
preferentially **keeps the financial wallet** rather than deleting it and
discovering cleanup failed. After `mWalletData` is removed, **all** target keys
are verified again; only then is financial-erase success reported.

On verified success the user is signed out (`scope: "local"`) so the
still-authenticated session cannot auto-reclaim. The erase flow **does not**
refresh the app or re-resolve BP4/BP5 — that would recreate a wallet.

**Sign-out failure after a verified erase** returns a distinct truthful state —
`{ ok: false, code: "erased_signout_failed", erased: true }`. The UI closes the
dialog and says *"Your wallet was erased from this device, but sign-out didn't
finish. Use 'Sign out' again to finish."* — it never implies the wallet still
exists, and `mWalletData` is **never recreated to roll back** an intentional
erase.

---

## 8. Account deletion — why it is not implemented

Supabase Auth user deletion requires `auth.admin.deleteUser`, which needs the
`service_role` key. **Putting an administrator credential in the browser would be
insecure** — any visitor could read it and delete or enumerate accounts. This
static PWA has no trusted server-side component, so there is no safe place to
perform the deletion.

Settings shows a **"Delete account"** row with the honest status *"Secure account
deletion needs a trusted server-side operation and is intentionally not built
into this app yet."* — plus pointers to "Erase wallet from this device" (local
data) and "Sign out of all devices" (all sessions).

### Future secure deletion sequence (design only — not built in BP10)

1. Authenticated user requests deletion in the app.
2. App calls a **trusted server endpoint / Edge Function** (holds `service_role`
   server-side, never shipped to the browser).
3. Server reauthenticates the request (fresh token / recent sign-in).
4. Server deletes the account's cloud financial rows (`wallet_documents`).
5. Server deletes the auth user via trusted credentials.
6. App clears all local M-Wallet data and signs out.

This is a **hard release gate** item, tracked for BP12/BP13.

---

## 9. Privacy inventory

| Question | Answer (this build) |
|---|---|
| Where does financial data live? | Locally, in this browser's `localStorage`. Nothing financial is uploaded. |
| Is cloud sync active? | No. BP8 built it; the release gate ships **disabled** and stays off until BP12 live security verification. |
| Is stored data end-to-end encrypted? | **No.** When cloud sync is enabled later, data is protected in transit + by database row-level security (one account cannot read another's rows). RLS **≠ E2EE** — the hosting provider can technically access stored rows. |
| Are exported backups encrypted? | **No.** Treat them as plaintext. |
| Analytics / advertising trackers? | **None.** See §10. |
| What does an account do? | Signs you in only. In this build it never changes or uploads your financial data. |

## 10. Analytics audit — CLEAN

No `google-analytics` / `gtag` / `mixpanel` / `amplitude` / `segment` /
`posthog` / `sentry` / `hotjar` / `fullstory` / `telemetry` / `fbq` /
`plausible` / `clarity` / `sendBeacon` anywhere in tracked source.

* `reports-analytics.js` / "Report Analytics" is the **local Reports feature** —
  pure on-device chart aggregation from your own data, never transmitted.
* The one `"plausible"` string match is a word in a dom-stub test comment.

Privacy copy is therefore allowed to state: *"M-Wallet currently does not include
analytics or advertising trackers."*

---

## 11. Recovery model

* **Forgot password** → BP3 reset-email link (Settings "Change password", or the
  Forgot-password link on the sign-in screen).
* **Lost device / cleared browser** → restore from an exported backup. Because
  cloud sync is off, **an export is the only recovery path for local data** —
  the Privacy section says so plainly.
* **Passkeys** (BP9) are built but the release gate is **off**; when active they
  are an *additional* sign-in method and never replace email/password recovery.

## 12. Accessibility

* Dialogs: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`,
  `aria-describedby`; titles are `tabindex="-1"` and receive focus on open.
* Escape always cancels **non-destructively**; focus returns to the opener.
* Backdrop click cancels.
* 44px minimum control height; visible focus ring; status messages via
  `role="status"` / `role="alert"` with `aria-live`.
* Warnings are not colour-only (icon-free but explicit text + a left border).
* `prefers-reduced-motion` disables dialog transitions.
* `prefers-color-scheme: dark` fully themed.

## 13. Service worker

`CACHE_NAME` `m-wallet-v28` → **`m-wallet-v29`**. `APP_SHELL` adds
`./css/account.css`, `./js/account/account-controls.js`,
`./js/account/account-ui.js`. The cross-origin bypass is unchanged; Supabase API
responses are never cached.

## 13a. Legacy storage helpers — deprecated, unreachable from the UI

`js/storage.js` still exposes `exportData()`, `importData()`, and
`clearAllData()`. As of BP10 they are **deprecated for UI use** and documented as
such in `storage.js` — raw, one-shot helpers with no wrapper, no schema
validation, no size limit, no prototype-pollution guard, no confirmation
(`exportData` also mutates `mWalletData` via `load()`). They are **not wired to
any control in `index.html`**: the old `#export-data` / `#settings-import-*` /
`#clear-data` buttons and the `js/app.js` `exportBudgetData` / `resetBudgetData`
and `js/settings-ui.js` `handleImportFile` paths were removed. A static test
(`auth-architecture.test.js` — *"legacy storage.exportData / importData /
clearAllData are unreachable from any current UI"*) asserts that `app.js`,
`settings-ui.js`, and `account-ui.js` never call them, and that
`account-controls.js` routes restore through `normalizeData` + `save` rather than
`importData` / `clearAllData`. They are kept only for backward compatibility /
tooling and can be removed in a later cleanup.

## 14. What BP10 does NOT claim / do

* Does **not** commit, push, merge, or edit `main`.
* Does **not** enable BP8 sync or BP9 passkeys.
* Does **not** apply a Supabase migration or use `service_role` / `sb_secret_`.
* Does **not** introduce a second Supabase client.
* Does **not** build a browser-side account-delete endpoint or call
  `auth.admin.deleteUser`.
* Does **not** add analytics or tracking.
* Does **not** call `localStorage.clear()` or remove unrelated site data.
* Does **not** silently clear or overwrite financial data.

## 15. BP12 live-verification requirements (unchanged, still pending)

* BP3 — real signup / email-verification / password-reset against live Supabase.
* BP4 — real multi-account ownership behaviour.
* BP7 — apply the `wallet_documents` migration + live two-user RLS attack test.
* BP8 — live multi-device sync.
* BP9 — live WebAuthn / passkey on real devices + final production RP ID/domain.
* **BP10 — real email-change confirmation, real `scope:"global"` sign-out, and a
  restore/erase pass on a real browser.**
* Account deletion — a trusted server-side deletion path (hard release gate).

### Manual disabled-release checklist (BP10)

- [ ] With Supabase **unconfigured**: Settings › Account shows "Not configured";
      every account action is a safe no-op; the app is the local-first app
      exactly as before.
- [ ] Export produces a file; `mWalletData` is unchanged (check DevTools ›
      Application › Local Storage before/after).
- [ ] Restore shows a counts-only preview; Cancel changes nothing; Confirm
      replaces the wallet and the app refreshes.
- [ ] Feeding restore a truncated file, a `{}`, and a 6 MB file each show a
      friendly error and write nothing.
- [ ] After a restore, `mwallet.sync.state.v1` is gone (DevTools › Application ›
      Local Storage) — no stale cloud baseline attached to the new wallet.
- [ ] Erase requires typing `ERASE`; afterwards `mWalletData` + all sidecars are
      gone and you are signed out; `mwallet.auth.config` and unrelated keys
      remain.
- [ ] (Optional stress) In DevTools, break `localStorage.removeItem` for one
      sidecar key, then Erase — the error says the wallet was **kept**, and
      `mWalletData` is still present.
- [ ] "Delete account" row shows the honest not-available status.
