"use strict";

/* =========================================================
   BP7 — CLOUD SCHEMA / SECURITY CONTRACT

   Reads supabase/migrations/20260831_bp7_wallet_documents.sql
   as text and asserts the security-critical shape is present
   and has not regressed:

     - a per-user wallet_documents table whose user_id is a
       NOT NULL uuid, DEFAULT auth.uid(), FK to auth.users with
       ON DELETE CASCADE
     - one-logical-document-per-owner UNIQUE(user_id, type, key)
     - revision + deleted_at (optimistic concurrency + tombstones)
     - RLS ENABLE *and* FORCE
     - authenticated-only SELECT/INSERT/UPDATE/DELETE policies,
       every one gated on auth.uid() = user_id, INSERT via
       WITH CHECK, UPDATE via BOTH using and with check
     - NO anon policy, and REVOKE ... FROM anon
     - a BEFORE INSERT OR UPDATE trigger that controls the
       revision and freezes id / user_id / type / key / created_at
     - the trigger function is NOT security definer
     - the file carries no project URL / ref / key / credential

   This is a static contract test — it does not connect to
   Supabase. Live two-user isolation is proven separately by
   scripts/bp7-live-rls-check.mjs (npm run bp7:verify-rls).
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SQL_PATH = path.resolve(__dirname, "..", "supabase/migrations/20260831_bp7_wallet_documents.sql");
const SQL_RAW = fs.readFileSync(SQL_PATH, "utf8");

/* strip -- line comments so assertions match real statements, not prose */
const SQL = SQL_RAW.replace(/--[^\n]*/g, "");
const NORM = SQL.replace(/\s+/g, " ").toLowerCase();

function has(re, msg) {
    assert.ok(re.test(NORM), msg || ("expected to find " + re));
}


test("the migration file exists and targets public.wallet_documents", () => {
    assert.ok(SQL_RAW.length > 400);
    has(/create table if not exists public\.wallet_documents/);
});

test("user_id: NOT NULL uuid, DEFAULT auth.uid(), FK auth.users ON DELETE CASCADE", () => {
    has(/user_id\s+uuid\s+not null\s+default auth\.uid\(\)/, "user_id uuid not null default auth.uid()");
    has(/references auth\.users\s*\(\s*id\s*\)\s+on delete cascade/, "FK to auth.users ON DELETE CASCADE");
});

test("the client is never trusted for ownership — user_id has a DB default, and the trigger re-asserts it", () => {
    has(/default auth\.uid\(\)/);
    has(/if new\.user_id is null then\s+new\.user_id\s*:=\s*auth\.uid\(\)/, "trigger fills user_id from the session on insert");
});

test("payload is a bounded jsonb OBJECT", () => {
    has(/payload\s+jsonb\s+not null/);
    has(/jsonb_typeof\s*\(\s*payload\s*\)\s*=\s*'object'/, "payload must be a JSON object");
    has(/pg_column_size\s*\(\s*payload\s*\)\s*<=\s*\d+/, "payload size is bounded");
});

test("document identity is validated by format checks", () => {
    has(/document_type\s+text\s+not null/);
    has(/document_key\s+text\s+not null/);
    has(/check \(document_type ~ '\^\[a-z\]/, "document_type format check");
    has(/check \(document_key ~ '\^\[a-z0-9\]/, "document_key format check");
});

test("one logical document per owner: UNIQUE(user_id, document_type, document_key)", () => {
    has(/unique\s*\(\s*user_id\s*,\s*document_type\s*,\s*document_key\s*\)/);
});

test("optimistic concurrency + tombstones: revision (>0) and deleted_at exist", () => {
    has(/revision\s+bigint\s+not null\s+default 1/);
    has(/check \(revision > 0\)/);
    has(/deleted_at\s+timestamptz/);
    has(/created_at\s+timestamptz not null default now\(\)/);
    has(/updated_at\s+timestamptz not null default now\(\)/);
});

test("RLS is ENABLED and FORCED on the table", () => {
    has(/alter table public\.wallet_documents enable row level security/);
    has(/alter table public\.wallet_documents force\s+row level security/,
        "FORCE row level security (so even the table owner is subject to RLS)");
});

test("SELECT policy: authenticated, own rows only", () => {
    const m = SQL.match(/create policy wallet_documents_select_own[\s\S]*?;/i);
    assert.ok(m, "select policy present");
    const p = m[0].replace(/\s+/g, " ").toLowerCase();
    assert.ok(/for select/.test(p));
    assert.ok(/to authenticated/.test(p));
    assert.ok(/using\s*\([\s\S]*?auth\.uid\(\)\s*=\s*user_id/.test(p), "USING auth.uid() = user_id");
});

test("INSERT policy: authenticated, WITH CHECK auth.uid() = user_id", () => {
    const m = SQL.match(/create policy wallet_documents_insert_own[\s\S]*?;/i);
    assert.ok(m, "insert policy present");
    const p = m[0].replace(/\s+/g, " ").toLowerCase();
    assert.ok(/for insert/.test(p));
    assert.ok(/to authenticated/.test(p));
    assert.ok(/with check\s*\([\s\S]*?auth\.uid\(\)\s*=\s*user_id/.test(p), "WITH CHECK auth.uid() = user_id");
});

test("UPDATE policy: authenticated, BOTH using and with check on auth.uid() = user_id", () => {
    const m = SQL.match(/create policy wallet_documents_update_own[\s\S]*?;/i);
    assert.ok(m, "update policy present");
    const p = m[0].replace(/\s+/g, " ").toLowerCase();
    assert.ok(/for update/.test(p));
    assert.ok(/to authenticated/.test(p));
    assert.ok(/using\s*\([\s\S]*?auth\.uid\(\)\s*=\s*user_id/.test(p), "USING (prevents reading/updating others' rows)");
    assert.ok(/with check\s*\([\s\S]*?auth\.uid\(\)\s*=\s*user_id/.test(p), "WITH CHECK (prevents handing a row to another user)");
});

test("DELETE policy: authenticated, own rows only", () => {
    const m = SQL.match(/create policy wallet_documents_delete_own[\s\S]*?;/i);
    assert.ok(m, "delete policy present");
    const p = m[0].replace(/\s+/g, " ").toLowerCase();
    assert.ok(/for delete/.test(p));
    assert.ok(/to authenticated/.test(p));
    assert.ok(/using\s*\([\s\S]*?auth\.uid\(\)\s*=\s*user_id/.test(p));
});

test("NO anon / public financial policy exists", () => {
    assert.ok(!/to\s+anon\b/.test(NORM), "no policy is granted TO anon");
    assert.ok(!/create policy[^;]*\bto public\b/.test(NORM), "no policy is granted TO public");
    /* every policy in the file is authenticated-only */
    const policyTargets = SQL.match(/create policy[\s\S]*?to\s+(\w+)/gi) || [];
    assert.equal(policyTargets.length, 4, "exactly four policies");
    policyTargets.forEach((p) => assert.ok(/to\s+authenticated/i.test(p)));
});

test("privileges: REVOKE ALL from anon + public, GRANT only to authenticated", () => {
    has(/revoke all on public\.wallet_documents from anon/);
    has(/revoke all on public\.wallet_documents from public/);
    has(/grant select, insert, update, delete on public\.wallet_documents to authenticated/);
    assert.ok(!/grant[^;]*wallet_documents[^;]*to anon/i.test(SQL), "nothing is granted on the table to anon");
});

test("revision + identity trigger: BEFORE INSERT OR UPDATE, database-controlled revision", () => {
    has(/before insert or update on public\.wallet_documents/);
    has(/for each row execute function public\.mwallet_wallet_documents_before_write\(\)/);
    /* insert -> revision 1 ; update -> old.revision + 1 */
    has(/new\.revision\s*:=\s*1/);
    has(/new\.revision\s*:=\s*old\.revision \+ 1/);
    has(/new\.updated_at\s*:=\s*now\(\)/);
});

test("trigger freezes owner / type / key / created_at on UPDATE", () => {
    has(/new\.id\s*:=\s*old\.id/);
    has(/new\.user_id\s*:=\s*old\.user_id/, "owner cannot be reassigned by an update");
    has(/new\.document_type\s*:=\s*old\.document_type/);
    has(/new\.document_key\s*:=\s*old\.document_key/);
    has(/new\.created_at\s*:=\s*old\.created_at/);
});

test("the trigger function is NOT security definer (no privilege escalation surface)", () => {
    assert.ok(!/security\s+definer/i.test(SQL), "the function must run as SECURITY INVOKER (the default)");
});

test("the migration contains NO project URL, ref, or credential", () => {
    assert.ok(!/supabase\.co/i.test(SQL_RAW), "no *.supabase.co project URL");
    assert.ok(!/\beyJ[A-Za-z0-9_-]{10,}/.test(SQL_RAW), "no JWT-shaped anon/service key");
    assert.ok(!/\bsb_secret_/.test(SQL_RAW), "no sb_secret_ key");
    assert.ok(!/\bsb_publishable_/.test(SQL_RAW), "no publishable key literal");
    assert.ok(!/service_role\s*[:=]/.test(SQL_RAW), "no service_role credential");
    assert.ok(!/postgres:\/\/|postgresql:\/\//i.test(SQL_RAW), "no connection string");
});

test("every document type the codec can emit satisfies the SQL type-format check", () => {
    const vm = require("node:vm");
    const codecSrc = fs.readFileSync(path.resolve(__dirname, "..", "js/cloud/cloud-financial-codec.js"), "utf8");
    const sandbox = { window: {} };
    vm.createContext(sandbox);
    vm.runInContext(codecSrc, sandbox, { filename: "cloud-financial-codec.js" });
    const codec = sandbox.window.MWalletCloudFinancialCodec;

    const typeRe = /^[a-z][a-z0-9-]{0,63}$/;   /* mirrors wallet_documents_type_format */
    codec.ALL_TYPES.forEach((t) => assert.ok(typeRe.test(t), t + " must satisfy the DB type-format check"));

    /* singleton key "primary" and a month key both satisfy the key-format check */
    const keyRe = /^[a-z0-9][a-z0-9-]{0,63}$/;  /* mirrors wallet_documents_key_format */
    assert.ok(keyRe.test("primary"));
    assert.ok(keyRe.test("2026-08"));
});
