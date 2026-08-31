# BP7 — Cloud Financial Data + Row Level Security

**Status:** implementation complete. Live two-user RLS verification against a
real Supabase project is **deferred to BP12** (the pre-beta security audit) and
remains a **hard release gate before BP13 closed beta** (see
[Release gate](#release-gate)).
**Version:** `0.9.0-beta.6` · **Cache:** `m-wallet-v26`

> The BP7 migration has **not** been applied to any real Supabase project, RLS
> has **not** been live-verified, no cloud synchronization is active, and no
> financial data is backed up. Local `mWalletData` is the source of truth.

BP7 adds the *capability* to store M-Wallet's financial data as per-user,
row-level-secured documents in Supabase. It does **not** turn synchronization on.

> **Local `mWalletData` in the browser remains the single active source of
> truth.** Opening M-Wallet, saving a budget, or finishing the setup wizard
> never uploads anything. Change tracking, upload/download, and conflict
> resolution are **BP8**.

---

## What BP7 delivers

| Piece | File | Notes |
| --- | --- | --- |
| Cloud schema + RLS + trigger | `supabase/migrations/20260831_bp7_wallet_documents.sql` | Applied manually in the Supabase SQL Editor. Contains no URL/key. |
| Pure local ⇄ cloud codec | `js/cloud/cloud-financial-codec.js` | `window.MWalletCloudFinancialCodec`. No Supabase / network / storage / DOM. Deterministic. Never mutates input. |
| Cloud repository | `js/cloud/cloud-financial-store.js` | `window.MWalletCloudFinancial`. The **only** runtime module that touches `wallet_documents`. |
| Settings status row | `index.html` + `js/settings-ui.js` | Read-only. Optional user-triggered reachability check. Never says "backed up" / "synced". |
| Schema/security contract tests | `tests/bp7-schema-contract.test.js` | Static assertions over the SQL. |
| Codec tests | `tests/cloud-financial-codec.test.js` | Round-trip, determinism, no-mutation, JSON-safety. |
| Store tests | `tests/cloud-financial-store.test.js` | Stubbed client: ownership never sent, reads filter by type/key, optimistic concurrency, safe error mapping. |
| No-auto-sync + integrity tests | `tests/bp7-no-auto-sync.test.js` | Only the store names the table; boot does zero network; real `mWalletData` is byte-identical after encoding. |
| Live two-user RLS verifier | `scripts/bp7-live-rls-check.mjs` | `npm run bp7:verify-rls`. Env-only, publishable key only, throwaway accounts. Not part of `npm test`. |

---

## The cloud document model

One row in `public.wallet_documents` is **one independently versioned
document**. This granularity is what BP8 sync needs — editing one month must not
have to rewrite M-Cash or every other month.

| `document_type` | `document_key` | Payload |
| --- | --- | --- |
| `accounts` | `primary` | `{ checking, savings }` — account names + balances |
| `settings` | `primary` | `{ currency, currencySymbol, firstDayOfWeek }` |
| `categories` | `primary` | `{ version, list }` — the category library |
| `recurring-income` | `primary` | `{ items: [...] }` |
| `recurring-expenses` | `primary` | `{ items: [...] }` |
| `savings` | `primary` | `{ goals, transfers }` |
| `cash` | `primary` | `{ initialized, wallet, savings, history, settings }` |
| `month` | `YYYY-MM` | the month's full state — **one document per month** |

`UNIQUE (user_id, document_type, document_key)` means User A and User B can each
independently own their own `month/2026-08`.

**Deliberately not cloud documents** (device-local / non-financial):
`mWalletData.version` (kept per-document as `schema_version` instead) and
`mWalletData.migrations`. None of the BP2–BP6 local keys (auth config/session,
local owner record, setup metadata/draft, walkthrough record/progress) are ever
encoded.

The codec is pure and deterministic: the same local state always produces the
same document set, in the same order, with every user value (amounts, ids,
dates, categories, M-Cash denominations) preserved exactly — no rounding, no
regeneration.

---

## Security model

### Row Level Security (what BP7 *does* provide)

- `public.wallet_documents` has RLS **`ENABLE`d and `FORCE`d** (so even the
  table owner is subject to policy).
- Four policies, all `TO authenticated`, each gated on `auth.uid() = user_id`:
  - `SELECT` — `USING (auth.uid() = user_id)`
  - `INSERT` — `WITH CHECK (auth.uid() = user_id)`
  - `UPDATE` — `USING` **and** `WITH CHECK (auth.uid() = user_id)`
  - `DELETE` — `USING (auth.uid() = user_id)`
- **No `anon` policy exists** and `REVOKE ALL ... FROM anon` / `FROM public` is
  explicit. Anonymous requests match no policy and are denied for every command.
- `user_id` is `NOT NULL DEFAULT auth.uid()` and `REFERENCES auth.users(id) ON
  DELETE CASCADE`. **The browser never sends `user_id`** — the store omits it
  entirely; the database assigns it from the session.
- A `BEFORE INSERT OR UPDATE` trigger (`SECURITY INVOKER`, no elevated rights):
  - on `INSERT`: fills `user_id` from `auth.uid()` if absent, sets `revision =
    1`, sets `created_at` / `updated_at`.
  - on `UPDATE`: **freezes** `id`, `user_id`, `document_type`, `document_key`,
    `created_at`; sets `revision = OLD.revision + 1` and `updated_at = now()`.
    A user cannot rename a document, rewrite its history, or hand it to another
    user via an update.
- Optimistic concurrency: an update is issued with `revision = eq.<expected>`.
  Zero rows affected → `revision_conflict` (or `not_found`). The store **never**
  performs a silent overwrite.
- Tombstones: `deleted_at` is a normal owner-only `UPDATE` for future
  multi-device delete propagation; `restoreDocument` clears it.

### Privacy model (what BP7 does *not* provide)

**RLS is server-side access control, not end-to-end encryption.** With RLS:

- another *user* (authenticated as themselves) cannot read your rows;
- an *anonymous* caller cannot read anything.

But the payload is stored as readable `jsonb`. Anyone with **database-owner or
`service_role` access to the project** (that means *you*, the operator) can read
it. BP7 is **not** "zero knowledge" and **not** "end-to-end encrypted" — do not
describe it that way to users. Client-side encryption of payloads, if it
happens, is a separate future phase.

### No privileged surface in the app

The store reuses the **existing** authenticated Supabase client via
`MWalletAuth._getClient()`. It never constructs a second client, never copies a
token or session, and exposes no `service_role`, `setUserId`, `overrideOwner`,
`hardDelete`, or admin query. Raw Supabase/PostgREST errors are mapped to a
fixed set of safe codes; payloads, tokens, and owner UUIDs are never logged or
returned by `diagnostics()`.

---

## Expected data flow in BP7

```
open M-Wallet ........... local mWalletData loads. Cloud store initialize()
                         runs — marker only, ZERO network.
edit / save budget ..... writes localStorage only. No cloud call.
finish BP5 / BP6 ....... no cloud call.
Settings ▸ Check cloud   the ONE user-triggered network call: SELECT id LIMIT 1
  storage ..............  through the authenticated client. Uploads nothing.
manual verification .... a developer calling window.MWalletCloudFinancial.*
                         from the console, deliberately.
npm run bp7:verify-rls . the standalone two-user RLS check (below).
```

Nothing subscribes to auth state to auto-pull. No code path uploads
`mWalletData`.

---

## Apply the BP7 migration

> **Scheduling note.** Applying this migration and running the live verifier is
> **deferred to BP12**, where it happens as part of the complete pre-beta
> security audit (after BP8–BP11 are built). The steps below are the procedure
> BP12 will follow — nothing here has been run yet.

The migration is **not** applied automatically and this repo never talks to your
Supabase project. When BP12 runs it, apply it by hand:

1. Open [supabase.com](https://supabase.com) → your project (use a **disposable
   project** for verification, not production data).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `supabase/migrations/20260831_bp7_wallet_documents.sql` from this repo
   and copy its **entire** contents into the editor.
4. Read it. Confirm: it only creates `public.wallet_documents`, its indexes,
   one trigger function + trigger, four RLS policies, and grants/revokes. It
   contains no `DROP TABLE`, no data change, no project URL, no key.
5. Click **Run**. It is idempotent (`create ... if not exists`,
   `create or replace`, `drop policy if exists`) — re-running is safe.
6. Verify in **Table Editor** → `wallet_documents` exists.
7. **Authentication → Policies**: confirm four policies on `wallet_documents`,
   all for role `authenticated`.
8. **Database → Tables → `wallet_documents` → RLS**: confirm RLS is **enabled**.
9. (Optional) In SQL Editor run:
   `select relrowsecurity, relforcerowsecurity from pg_class where relname = 'wallet_documents';`
   — both should be `true`.
10. Now run the live verifier below.

> Record the outcome in the BP12 audit: **MIGRATION STATUS: Applied** (with the
> date) or **Not Applied**. As of BP7 it is **Not Applied**.

---

## Live verification instructions

> **Deferred to BP12.** This has **not** been run. RLS has not been live-verified
> on any real project. The instructions below are what BP12 will execute.

`npm run bp7:verify-rls` signs in as **two throwaway accounts** and proves, on
the real project, that neither can touch the other's data.

### Prepare

- In the same disposable Supabase project, create **two** test users
  (Authentication → Users → Add user, or sign them up). Make sure **both email
  addresses are confirmed** (toggle "Auto Confirm User" or confirm the link).
  Use addresses you don't care about.
- Get the project URL and the **publishable / anon** key from
  Project Settings → API. **Not** the `service_role` key.

### Run

Either export the variables in your shell, or copy `.env.example` to a local
`.env` (git-ignored) and fill it in:

```sh
export SUPABASE_URL="https://YOUR-REF.supabase.co"
export SUPABASE_PUBLISHABLE_KEY="YOUR-PUBLISHABLE-KEY"
export BP7_USER_A_EMAIL="throwaway-a@example.com"
export BP7_USER_A_PASSWORD="…"
export BP7_USER_B_EMAIL="throwaway-b@example.com"
export BP7_USER_B_PASSWORD="…"

npm run bp7:verify-rls
```

The script prints only `PASS` / `FAIL` lines and a final `RESULT: PASS|FAIL`.
It never prints the URL, keys, tokens, headers, or passwords. It creates a
handful of marker documents and **deletes them all** at the end.

Checks: anon read denied/empty · anon insert rejected · A creates + reads own ·
B cannot read / update / delete A's · DB-assigned ownership · DB-set
`revision = 1` · cross-owner insert blocked (RLS `WITH CHECK`) · ownership
cannot be reassigned by update · same `month/2026-08` key isolated per user ·
owner update increments revision · stale-revision update affects 0 rows ·
owner tombstone works · full cleanup.

### Clean up afterwards

```sh
unset SUPABASE_URL SUPABASE_PUBLISHABLE_KEY \
      BP7_USER_A_EMAIL BP7_USER_A_PASSWORD \
      BP7_USER_B_EMAIL BP7_USER_B_PASSWORD
rm -f .env          # if you used one
```

Delete the two throwaway users and, ideally, the disposable project.

---

## Release gate

**BP7 implementation is complete.** The BP7 *code, schema, codec, cloud store,
tests, and security behaviour are final.*

**Live two-user RLS verification is DEFERRED TO BP12** — it will be performed as
part of the complete pre-beta security audit, once BP8–BP11 exist. It remains a
**HARD RELEASE GATE before BP13 (closed beta)**: closed beta must not open until
**both** of these are true and recorded in the BP12 audit —

1. `supabase/migrations/20260831_bp7_wallet_documents.sql` has been applied to a
   real Supabase project.
2. `npm run bp7:verify-rls` printed `RESULT: PASS` against that project with two
   accounts.

As of BP7:

| | |
| --- | --- |
| Migration applied to a real project | **No — deferred to BP12** |
| Live RLS verified (two-user) | **No — deferred to BP12** |
| Cloud synchronization | **Not active** (BP7 builds capability only; sync is BP8) |
| Financial data backed up to the cloud | **No** — local `mWalletData` is the source of truth |

The static contract tests (`npm test`) prove the SQL *says* the right thing; they
cannot prove Postgres *enforces* it on a real project — that is exactly what the
BP12 live check is for.

---

## Verification still pending (tracked to their phases)

- **BP7 — live two-user RLS verification:** apply the migration to a real
  disposable Supabase project and run `npm run bp7:verify-rls` until it prints
  `RESULT: PASS`. **Deferred to BP12; hard release gate before BP13.**
- **BP3 — live Supabase auth flow:** a real signup → email verification →
  sign-in → password-reset round trip has not been executed against a live
  project.
- **BP4 — live multi-account ownership:** real multi-account ownership behaviour
  has not been verified against a live project.
- **BP8 — local-first sync engine:** not started. No financial data synchronizes
  in BP7.
