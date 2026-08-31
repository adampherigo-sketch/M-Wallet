# BP8 — Local-First Sync Engine

**Status:** implementation complete; **sync release gate ships OFF**. Live
multi-device / conflict / offline verification is **deferred to BP12** and is a
**hard release gate before BP13 closed beta**.
**Version:** `0.9.0-beta.7` · **Cache:** `m-wallet-v27`

BP8 connects the two halves BP7 left disconnected:

```
LOCAL (mWalletData, storage.js)  <—— BP8 sync engine ——>  CLOUD (wallet_documents, MWalletCloudFinancial)
```

> **The committed build does not sync.** `MWalletSyncRelease.isEnabled()` is
> `false`, so the engine makes **zero** cloud requests — no bootstrap check, no
> upload, no download, no timers, no online-event sync. BP12 flips the gate on
> after live security verification.

---

## The one rule

**A local save never depends on cloud success.** `storage.save()` is unchanged:
synchronous, returns `true`/`false`, never becomes async, never fails because
sync failed. The engine only ever *reacts* to a save that already succeeded (via
the new `mwallet:financial-saved` event) and does everything else in the
background. If Supabase is offline, slow, missing, or returning conflicts, the
user's M-Wallet keeps working normally.

---

## Components (`js/sync/`)

| File | Global | Responsibility |
| --- | --- | --- |
| `sync-release.js` | `MWalletSyncRelease` | The single source of truth for whether sync is activated. **Ships `enabled: false`.** No credentials. **No production enable path** — `setOverride` only exists when a test harness set `window.__MWALLET_TEST_ENV__ = true` *before* the script loaded; a normal browser has no override, no query-string / localStorage / Settings / hostname switch. BP12 flips `BASE.enabled` itself. |
| `sync-state.js` | `MWalletSyncState` | Owner-bound local metadata in `mwallet.sync.state.v1`: document identities, content hashes, cloud revisions, pending/conflict identities, timestamps. **Whitelist-validated — never stores a financial payload.** |
| `sync-planner.js` | `MWalletSyncPlanner` | **Pure** reconciliation. Given LOCAL + CLOUD + BASELINE it decides, per document, what happens next. No network, no storage, no DOM, no input mutation, no timestamp guessing, no array merging. |
| `sync-engine.js` | `MWalletSync` | Orchestration: dirty detection, cloud calls (through the BP7 store only), atomic remote apply via `storage.js`, offline / retry, conflict handling, the second-device bootstrap. |
| `sync-ui.js` | `MWalletSyncUI` | The `#mw-sync-bootstrap` gate screen and the `#mw-sync-conflicts` review overlay. Dormant while release is off. |

The BP7 codec (`cloud-financial-codec.js`) gained pure apply helpers:
`applyDocument`, `removeDocument`, `applyDocuments`, `canonicalStringify`,
`documentFingerprintInput`, `isDeletableType`. The BP7 store
(`cloud-financial-store.js`) gained the `duplicate_document` error code (a normal
first-sync create race).

---

## How a sync cycle works

1. **Preflight** — release enabled? configured + signed in + not recovery? BP4
   ownership `owned`/`fresh_claimed`? cloud store present? Any "no" → set a safe
   status, **zero cloud calls**.
2. **Offline?** `navigator.onLine === false` → mark dirty documents pending,
   status "Offline — changes saved on this device", **zero cloud calls**.
3. **Encode** the current local state (via the codec) and **SHA-256** each
   document's canonical fingerprint. An unhashable document is left pending —
   never assumed unchanged.
4. **List** the cloud documents (including tombstones) through
   `MWalletCloudFinancial.listDocuments`. A network error keeps everything
   pending and does not touch the baseline; a missing schema pauses sync.
5. **Plan** — the pure planner compares BASE × LOCAL × REMOTE per document.
6. **Execute** — creates / updates (with `expectedRevision`) / tombstones, then
   **one atomic batch** for all safe downloads: load local once → apply every
   remote document to a clone → validate → **one `storage.save()`** → verify by
   reload → re-baseline against the normalized local hash → **one
   `BudgetApp.refresh()`**.
7. **Finish** — conflicts → "Needs attention"; network error → "Offline" +
   bounded backoff; pending remain → "Changes waiting"; otherwise "Up to date"
   and `lastSuccessAt` is stamped.

Single-flight: one cycle per instance; extra triggers coalesce into one
follow-up run. Cross-tab races are caught by the DB's revision + unique
constraint.

---

## Data-loss race hardening

A cloud request takes time. If the user edits a document *during* that request,
the plan (built earlier) is now stale. The engine never acts on a stale plan:

- **Before applying any remote download or tombstone**, the engine re-reads and
  re-encodes the current local state and re-hashes every affected document —
  *twice*: once right after the plan is built, and again in `applyRemoteBatch`
  immediately before the single `storage.save`. If a document's current local
  hash differs from the hash the plan was built on, the remote copy is **not**
  applied — it becomes a conflict (`reason: "local_changed_during_sync"`) and
  the local edit is preserved. Both sides deleting the same month still
  converges cleanly.
- **Before every outbound create / update / tombstone**, the engine checks the
  same freshness. A stale write is **skipped**, the document stays **pending**,
  and the baseline is only ever set to what was *actually written* — never to
  the newer local state. The next cycle re-detects the newer edit as dirty and
  uploads it.
- **During the bootstrap cloud check**, if the empty workspace becomes
  meaningful before the restore runs, the cloud wallet is **not** bulk-applied.
  The engine releases and schedules a normal sync, which reconciles local +
  cloud with the no-baseline rules (identical → baseline, different
  same-identity → conflict).

No new local edit is ever lost, duplicated, or silently overwritten.

---

## Conflict philosophy

M-Wallet handles money, so **silent data loss is worse than asking the user to
choose.**

- **Independent documents keep syncing.** Device A editing `month/2026-08` and
  device B editing `settings/primary` (or `month/2026-09`) never conflict.
- **Same document, concurrent change, no shared baseline → CONFLICT.** The
  planner never guesses "newer" from a timestamp and never merges financial
  arrays by index.
- A conflict **pauses that document's** destructive reconciliation and shows in
  Settings ("Needs attention — N conflicts" → Review). It does **not** lock the
  app, block unrelated saves, or block other documents.
- The user keeps editing a conflicted document; **Keep this device** always
  pushes the *current* local version (re-fetching the live remote revision
  first), and **Use cloud version** applies the *current* cloud copy with an
  explicit confirmation.

Conflict metadata stores only identities + revisions + a reason — **never a
payload**.

### Deletions

Only `month/<YYYY-MM>` documents are deletable (the local engine can actually
remove `months[key]`). Every singleton is required — an empty list is
`payload {items:[]}`, never a tombstone. A remote tombstone of a required
singleton is a conflict needing attention, never a silent erase of core state.

### Unknown / future documents

A cloud document type this build doesn't understand, or a `schema_version`
newer than this app, is **ignored** — never applied, never deleted, never
crashed on. This lets a newer M-Wallet coexist.

---

## Gate order (when sync is eventually enabled)

```
AUTH  →  BP4 OWNERSHIP  →  BP8 CLOUD BOOTSTRAP  →  BP5 SETUP  →  BP6 WALKTHROUGH  →  APP
```

BP4 remains first and authoritative — an owner mismatch stops everything, with
no cloud restore and no sync. The BP8 bootstrap layer is **fail-open**: a
missing / broken / slow sync module never permanently locks out a verified
owner.

### Second-device bootstrap

When release is on and a **fresh** device (empty local wallet) signs in:

- **Cloud has documents** → validate, apply atomically, then ask BP5 to
  re-decide. BP5 sees established data → status `existing`, no balance wizard;
  BP6 does not auto-start. The user's returning wallet is restored *before* they
  could create a competing starting balance.
- **Cloud is empty** → release, BP5 runs normally, no fake "synced" metadata.
- **Cloud can't be reached** → "Couldn't check your cloud wallet" with
  **Retry** / **Continue Offline**. Continue Offline marks the bootstrap
  *deferred*, releases to the local app, and never blind-overwrites the cloud
  later (the first reconciliation uses the no-baseline conflict rules).

A device with a **meaningful local wallet** is never held — it uploads in the
background.

---

## Security & privacy

- The engine talks to the cloud **only** through `MWalletCloudFinancial` — never
  `.from("wallet_documents")`, never a Supabase client, never an access/refresh
  token, never `service_role` / `sb_secret_`.
- `mwallet.sync.state.v1` is bound to the Supabase **user id** (never the
  email). State written by user A is ignored when user B is signed in.
- Sync state, diagnostics, and the Settings row never expose an owner id, a
  payload, or a token. Nothing logs a balance / note / account name.
- **RLS is still the cloud security boundary** (BP7). The BP8 release gate is a
  *data-transfer* switch, not a security control. The engine's local owner check
  is defense-in-depth.
- **BP8 adds synchronization, not end-to-end encryption.** Cloud financial
  payloads are protected by RLS / access control — **not** zero-knowledge, **not**
  end-to-end encrypted. The Settings row never says "Backed up".

---

## Release gate

**BP8 implementation is complete.** The engine, planner, state, codec apply
helpers, bootstrap, and conflict UI are final and covered by automated tests
that simulate two devices, revisions, tombstones, offline/online, conflicts,
sign-out, and storage failures with deterministic stubs.

**Automated tests cannot replace live verification.** Before `MWalletSyncRelease`
is switched on for BP13 closed beta, **BP12** will:

1. apply the BP7 `wallet_documents` migration to a real Supabase project;
2. live-verify RLS isolation (two-user attack test);
3. live-verify BP8 sync across multiple real devices;
4. attack-test conflicts, account boundaries, and offline behaviour;
5. only then flip the gate on.

Until then the committed default stays `enabled: false`.

---

## Still pending (tracked to their phases)

- **BP8 — live multi-device verification** → BP12; hard gate before BP13.
- **BP7 — migration application + two-user RLS attack test** → BP12.
- **BP3 — live Supabase signup / verification / password-reset round trip.**
- **BP4 — live multi-account ownership verification.**
