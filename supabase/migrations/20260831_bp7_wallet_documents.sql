-- =====================================================================
-- M-WALLET — BP7: CLOUD FINANCIAL DATA FOUNDATION + ROW LEVEL SECURITY
--
--   Table:  public.wallet_documents
--   One row = one independently versioned, user-owned financial document
--            (accounts, settings, categories, recurring-income,
--             recurring-expenses, savings, cash, month/<YYYY-MM>).
--
-- BP7 builds the CLOUD CAPABILITY only. Nothing in the app synchronizes
-- automatically — local mWalletData remains the active source of truth.
-- Synchronization (change tracking, upload/download, conflict handling)
-- is BP8.
--
-- Security model:
--   SELECT / INSERT / UPDATE / DELETE : authenticated owner only
--   anon                              : NO financial access at all
--   ownership                         : auth.uid() = user_id
--   user_id                           : database DEFAULT auth.uid()
--   revision                          : database-controlled (trigger)
--   id / user_id / type / key / created_at : immutable after insert
--
-- Apply via the Supabase SQL Editor (see docs/BP7-CLOUD-DATA.md). This
-- file contains NO project URL, id, or credential of any kind.
-- =====================================================================

-- gen_random_uuid()
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------

create table if not exists public.wallet_documents (
    id                uuid        primary key default gen_random_uuid(),

    -- ownership: assigned by the database, never by the client
    user_id           uuid        not null default auth.uid()
                                  references auth.users (id) on delete cascade,

    document_type     text        not null,
    document_key      text        not null,

    schema_version    integer     not null default 1,
    payload           jsonb       not null,

    -- optimistic-concurrency version, incremented ONLY by the trigger
    revision          bigint      not null default 1,

    -- client-supplied "last local change" hint for future BP8 sync
    client_updated_at timestamptz,

    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),

    -- soft delete: tombstone for future multi-device sync
    deleted_at        timestamptz,

    constraint wallet_documents_schema_version_positive
        check (schema_version > 0),

    constraint wallet_documents_revision_positive
        check (revision > 0),

    -- stable, lowercase, machine-readable document type
    constraint wallet_documents_type_format
        check (document_type ~ '^[a-z][a-z0-9-]{0,63}$'),

    -- registry keys ("primary") and month keys ("2026-08")
    constraint wallet_documents_key_format
        check (document_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),

    -- a financial document payload is always a JSON object
    constraint wallet_documents_payload_is_object
        check (jsonb_typeof(payload) = 'object'),

    -- a bounded payload (~512 KiB) — a single document should never be huge
    constraint wallet_documents_payload_size
        check (pg_column_size(payload) <= 524288),

    -- one logical document per owner; User A and User B may each hold
    -- their own "month / 2026-08"
    constraint wallet_documents_owner_type_key_unique
        unique (user_id, document_type, document_key)
);

comment on table public.wallet_documents is
    'BP7: per-user financial documents. RLS-isolated by auth.uid(). BP7 does not sync; local mWalletData is the source of truth.';


-- ---------------------------------------------------------------------
-- 2. INDEXES  (for future BP8 sync — deliberately minimal)
-- ---------------------------------------------------------------------

-- "what changed since <ts>"
create index if not exists wallet_documents_user_updated_idx
    on public.wallet_documents (user_id, updated_at);

-- "what changed in <type> since <ts>"
create index if not exists wallet_documents_user_type_updated_idx
    on public.wallet_documents (user_id, document_type, updated_at);

-- "which documents are tombstoned"
create index if not exists wallet_documents_user_deleted_idx
    on public.wallet_documents (user_id, deleted_at);

-- (user_id, document_type, document_key) is already indexed by the
-- UNIQUE constraint above.


-- ---------------------------------------------------------------------
-- 3. REVISION / INTEGRITY TRIGGER
--
--    The browser is NEVER trusted to set ownership, timestamps, or the
--    revision. This function is plain SECURITY INVOKER (the default) —
--    it needs no elevated rights.
-- ---------------------------------------------------------------------

create or replace function public.mwallet_wallet_documents_before_write()
returns trigger
language plpgsql
as $$
begin
    if (tg_op = 'INSERT') then
        -- ownership always comes from the session, never the payload
        if new.user_id is null then
            new.user_id := auth.uid();
        end if;
        new.revision   := 1;
        new.created_at := now();
        new.updated_at := now();
        return new;
    end if;

    if (tg_op = 'UPDATE') then
        -- immutable identity: reject any attempt to move a document
        -- to another owner, rename its type/key, or rewrite its history
        new.id            := old.id;
        new.user_id       := old.user_id;
        new.document_type := old.document_type;
        new.document_key  := old.document_key;
        new.created_at    := old.created_at;

        -- the database owns the revision + updated_at
        new.revision   := old.revision + 1;
        new.updated_at := now();
        return new;
    end if;

    return new;
end;
$$;

comment on function public.mwallet_wallet_documents_before_write() is
    'BP7: enforces immutable owner/type/key/created_at and database-controlled revision + updated_at on public.wallet_documents.';

drop trigger if exists mwallet_wallet_documents_before_write on public.wallet_documents;
create trigger mwallet_wallet_documents_before_write
    before insert or update on public.wallet_documents
    for each row execute function public.mwallet_wallet_documents_before_write();


-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.wallet_documents enable row level security;
alter table public.wallet_documents force  row level security;

-- SELECT: an authenticated user sees ONLY their own rows
drop policy if exists wallet_documents_select_own on public.wallet_documents;
create policy wallet_documents_select_own
    on public.wallet_documents
    for select
    to authenticated
    using (auth.uid() is not null and auth.uid() = user_id);

-- INSERT: an authenticated user may create ONLY rows they own
-- (user_id defaults to auth.uid(); the client omits it entirely)
drop policy if exists wallet_documents_insert_own on public.wallet_documents;
create policy wallet_documents_insert_own
    on public.wallet_documents
    for insert
    to authenticated
    with check (auth.uid() is not null and auth.uid() = user_id);

-- UPDATE: an authenticated user may update ONLY their own rows, and may
-- not use an update to hand a row to someone else
drop policy if exists wallet_documents_update_own on public.wallet_documents;
create policy wallet_documents_update_own
    on public.wallet_documents
    for update
    to authenticated
    using      (auth.uid() is not null and auth.uid() = user_id)
    with check (auth.uid() is not null and auth.uid() = user_id);

-- DELETE: an authenticated user may hard-delete ONLY their own rows
-- (used for test cleanup + future account purge; normal sync uses
-- tombstones via deleted_at)
drop policy if exists wallet_documents_delete_own on public.wallet_documents;
create policy wallet_documents_delete_own
    on public.wallet_documents
    for delete
    to authenticated
    using (auth.uid() is not null and auth.uid() = user_id);

-- NO anon policy is created — anonymous requests match no policy and are
-- therefore denied for every command.


-- ---------------------------------------------------------------------
-- 5. PRIVILEGES  (authenticated only — never anon)
-- ---------------------------------------------------------------------

revoke all on public.wallet_documents from anon;
revoke all on public.wallet_documents from public;

grant select, insert, update, delete on public.wallet_documents to authenticated;

-- the trigger function must be callable by the authenticated role
revoke all on function public.mwallet_wallet_documents_before_write() from anon;
grant execute on function public.mwallet_wallet_documents_before_write() to authenticated;

-- =====================================================================
-- END 20260831_bp7_wallet_documents.sql
-- =====================================================================
