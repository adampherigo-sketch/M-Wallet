#!/usr/bin/env node
/* =====================================================================
   M-WALLET — BP7 LIVE ROW-LEVEL-SECURITY VERIFIER
   =====================================================================

   Proves, against a REAL Supabase project, that public.wallet_documents
   isolates every user's financial data:

     - an anonymous request can read / write NOTHING
     - User A can create and read their own documents
     - User B cannot read, update, or delete User A's documents
     - neither user can insert a row owned by someone else
     - neither user can hand a row to someone else via UPDATE
     - the same logical key (month/2026-08) is independent per user
     - the revision counter is database-controlled and rejects a stale
       optimistic-concurrency update
     - a tombstone (deleted_at) is a normal owner-only UPDATE
     - all test rows are removed afterwards

   This script is NOT part of `npm test`. It is a deliberate,
   operator-run check:  npm run bp7:verify-rls

   ---------------------------------------------------------------------
   IT READS EVERYTHING FROM THE ENVIRONMENT. It never takes a flag, never
   writes a file, never creates a .env, and never prints a URL, key,
   token, header, or password. Use THROWAWAY test accounts.

       SUPABASE_URL                 https://<ref>.supabase.co
       SUPABASE_PUBLISHABLE_KEY     the publishable / anon key ONLY
       BP7_USER_A_EMAIL             throwaway verified test account A
       BP7_USER_A_PASSWORD
       BP7_USER_B_EMAIL             throwaway verified test account B
       BP7_USER_B_PASSWORD

   A service_role / secret key is NEVER accepted — if SUPABASE_PUBLISHABLE_KEY
   looks like a secret, the script refuses to run.
   ===================================================================== */

"use strict";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* Optionally hydrate from a local, git-ignored .env (read-only — this
   script never writes one). Shell environment always wins. */
function loadDotEnv() {
    const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env");
    let raw;
    try { raw = readFileSync(envPath, "utf8"); } catch { return; }
    for (const line of raw.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) { continue; }
        const key = m[1];
        let val = m[2].trim().replace(/^["']|["']$/g, "");
        if (process.env[key] === undefined || process.env[key] === "") { process.env[key] = val; }
    }
}
loadDotEnv();

const ENV = process.env;

const CONFIG = {
    url: (ENV.SUPABASE_URL || "").trim().replace(/\/+$/, ""),
    key: (ENV.SUPABASE_PUBLISHABLE_KEY || "").trim(),
    aEmail: (ENV.BP7_USER_A_EMAIL || "").trim(),
    aPass: ENV.BP7_USER_A_PASSWORD || "",
    bEmail: (ENV.BP7_USER_B_EMAIL || "").trim(),
    bPass: ENV.BP7_USER_B_PASSWORD || ""
};

const TABLE = "wallet_documents";
const REST = () => `${CONFIG.url}/rest/v1/${TABLE}`;
const AUTH = () => `${CONFIG.url}/auth/v1/token?grant_type=password`;

let passed = 0;
let failed = 0;
const failures = [];

function ok(name) { passed++; console.log(`  PASS  ${name}`); }
function bad(name, detail) {
    failed++;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`);
}
function check(name, condition, detail) { condition ? ok(name) : bad(name, detail); }

/* ---- preconditions -------------------------------------------------- */

function refuseIfMisconfigured() {
    const missing = [];
    if (!CONFIG.url) { missing.push("SUPABASE_URL"); }
    if (!CONFIG.key) { missing.push("SUPABASE_PUBLISHABLE_KEY"); }
    if (!CONFIG.aEmail) { missing.push("BP7_USER_A_EMAIL"); }
    if (!CONFIG.aPass) { missing.push("BP7_USER_A_PASSWORD"); }
    if (!CONFIG.bEmail) { missing.push("BP7_USER_B_EMAIL"); }
    if (!CONFIG.bPass) { missing.push("BP7_USER_B_PASSWORD"); }
    if (missing.length) {
        console.error("Missing required environment variables: " + missing.join(", "));
        console.error("See docs/BP7-CLOUD-DATA.md -> LIVE VERIFICATION INSTRUCTIONS.");
        process.exit(2);
    }
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(CONFIG.url) && !/^https:\/\//i.test(CONFIG.url)) {
        console.error("SUPABASE_URL does not look like a Supabase project URL.");
        process.exit(2);
    }
    if (/^sb_secret_/i.test(CONFIG.key) || /service_role/i.test(CONFIG.key)) {
        console.error("SUPABASE_PUBLISHABLE_KEY looks like a SECRET / service_role key.");
        console.error("This verifier must run with the PUBLISHABLE (anon) key only. Refusing to run.");
        process.exit(2);
    }
    if (CONFIG.aEmail.toLowerCase() === CONFIG.bEmail.toLowerCase()) {
        console.error("BP7_USER_A_EMAIL and BP7_USER_B_EMAIL must be two different accounts.");
        process.exit(2);
    }
}

/* ---- tiny REST client (no dependencies) ---------------------------- */

async function rest(method, { token, query = "", body, prefer } = {}) {
    const headers = { apikey: CONFIG.key, "Content-Type": "application/json" };
    if (token) { headers.Authorization = `Bearer ${token}`; }
    if (prefer) { headers.Prefer = prefer; }
    const res = await fetch(REST() + (query ? `?${query}` : ""), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    let json = null;
    const text = await res.text();
    if (text) { try { json = JSON.parse(text); } catch { json = null; } }
    return { status: res.status, ok: res.ok, body: json };
}

async function signIn(email, password) {
    const res = await fetch(AUTH(), {
        method: "POST",
        headers: { apikey: CONFIG.key, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || !json.access_token) {
        console.error("Could not sign in a test account (check the address is verified and the password is correct).");
        process.exit(2);
    }
    return { token: json.access_token, userId: json.user && json.user.id };
}

/* a document payload is always a JSON object */
function payload(tag) { return { marker: "bp7-live-rls", tag, at: new Date().toISOString() }; }

const RUN = `rls-${Date.now().toString(36)}`;          /* unique per run, cleaned up at the end */
const KEY_A = `${RUN}-a`;
const KEY_B = `${RUN}-b`;
const SHARED_KEY = "2026-08";                          /* month/<same key> for both users */

/* ---- the checks --------------------------------------------------- */

async function main() {
    refuseIfMisconfigured();

    console.log("BP7 live RLS verification — real Supabase, two accounts, publishable key only.\n");

    const A = await signIn(CONFIG.aEmail, CONFIG.aPass);
    const B = await signIn(CONFIG.bEmail, CONFIG.bPass);
    check("two distinct authenticated users", !!A.userId && !!B.userId && A.userId !== B.userId);

    /* 1 — anonymous read returns no rows */
    {
        const r = await rest("GET", { query: "select=id&limit=1" });
        check("anon SELECT is denied or empty", r.status === 401 || r.status === 403 || (Array.isArray(r.body) && r.body.length === 0),
            `status ${r.status}`);
    }

    /* 2 — anonymous insert is rejected */
    {
        const r = await rest("POST", {
            query: "", body: { document_type: "cash", document_key: KEY_A, payload: payload("anon") },
            prefer: "return=representation"
        });
        check("anon INSERT is rejected", r.status === 401 || r.status === 403, `status ${r.status}`);
    }

    /* 3 — User A creates a document (no user_id sent) */
    let docA = null;
    {
        const r = await rest("POST", {
            token: A.token,
            body: { document_type: "cash", document_key: KEY_A, schema_version: 5, payload: payload("A-owns") },
            prefer: "return=representation"
        });
        docA = Array.isArray(r.body) ? r.body[0] : r.body;
        check("User A can create a document", r.status === 201 && docA && docA.id, `status ${r.status}`);
        check("the database assigned ownership to User A", docA && docA.user_id === A.userId);
        check("the database set revision = 1 on insert", docA && Number(docA.revision) === 1);
    }

    /* 4 — User A reads it back */
    {
        const r = await rest("GET", { token: A.token, query: `select=*&document_key=eq.${KEY_A}` });
        check("User A can read their own document", Array.isArray(r.body) && r.body.length === 1);
    }

    /* 5 — User B cannot see it */
    {
        const r = await rest("GET", { token: B.token, query: `select=*&document_key=eq.${KEY_A}` });
        check("User B cannot read User A's document", Array.isArray(r.body) && r.body.length === 0, `got ${r.body && r.body.length} row(s)`);
    }

    /* 6 — User B cannot update it (0 rows affected, row unchanged) */
    {
        const r = await rest("PATCH", {
            token: B.token, query: `document_key=eq.${KEY_A}`,
            body: { payload: payload("B-tampered") }, prefer: "return=representation"
        });
        const rows = Array.isArray(r.body) ? r.body : [];
        check("User B cannot update User A's document", rows.length === 0, `${rows.length} row(s) affected`);
        const after = await rest("GET", { token: A.token, query: `select=payload&document_key=eq.${KEY_A}` });
        check("User A's document is untouched after B's update attempt",
            after.body && after.body[0] && after.body[0].payload && after.body[0].payload.tag === "A-owns");
    }

    /* 7 — User B cannot delete it */
    {
        const r = await rest("DELETE", { token: B.token, query: `document_key=eq.${KEY_A}`, prefer: "return=representation" });
        const rows = Array.isArray(r.body) ? r.body : [];
        check("User B cannot delete User A's document", rows.length === 0, `${rows.length} row(s) deleted`);
        const still = await rest("GET", { token: A.token, query: `select=id&document_key=eq.${KEY_A}` });
        check("User A's document still exists after B's delete attempt", Array.isArray(still.body) && still.body.length === 1);
    }

    /* 8 — User B cannot insert a row owned by User A (RLS WITH CHECK) */
    {
        const r = await rest("POST", {
            token: B.token,
            body: { user_id: A.userId, document_type: "cash", document_key: `${RUN}-steal`, payload: payload("B-steals") },
            prefer: "return=representation"
        });
        check("cross-owner INSERT is blocked by RLS WITH CHECK", r.status === 403 || r.status === 401, `status ${r.status}`);
    }

    /* 9 — User A cannot hand their row to User B via UPDATE (trigger freezes user_id) */
    {
        const r = await rest("PATCH", {
            token: A.token, query: `document_key=eq.${KEY_A}`,
            body: { user_id: B.userId, payload: payload("A-owns") }, prefer: "return=representation"
        });
        const row = Array.isArray(r.body) ? r.body[0] : r.body;
        /* either the request is refused, or it succeeds but ownership is unchanged */
        check("ownership cannot be reassigned by an UPDATE",
            r.status === 403 || (row && row.user_id === A.userId), `status ${r.status}`);
        const seenByB = await rest("GET", { token: B.token, query: `select=id&document_key=eq.${KEY_A}` });
        check("User B still cannot see User A's row after the reassignment attempt",
            Array.isArray(seenByB.body) && seenByB.body.length === 0);
    }

    /* 10 — the same logical key is independent per user */
    let monthA = null;
    {
        const ra = await rest("POST", {
            token: A.token,
            body: { document_type: "month", document_key: SHARED_KEY, schema_version: 5, payload: payload("A-aug") },
            prefer: "return=representation"
        });
        const rb = await rest("POST", {
            token: B.token,
            body: { document_type: "month", document_key: SHARED_KEY, schema_version: 5, payload: payload("B-aug") },
            prefer: "return=representation"
        });
        monthA = Array.isArray(ra.body) ? ra.body[0] : ra.body;
        check("both users can hold their own month/2026-08", ra.status === 201 && rb.status === 201,
            `A ${ra.status} / B ${rb.status}`);
        const aSees = await rest("GET", { token: A.token, query: `select=payload&document_type=eq.month&document_key=eq.${SHARED_KEY}` });
        check("each user sees only their own month/2026-08",
            aSees.body && aSees.body.length === 1 && aSees.body[0].payload.tag === "A-aug");
    }

    /* 11 — the revision counter is database-controlled */
    {
        const r = await rest("PATCH", {
            token: A.token, query: `document_type=eq.month&document_key=eq.${SHARED_KEY}`,
            body: { payload: payload("A-aug-v2") }, prefer: "return=representation"
        });
        const row = Array.isArray(r.body) ? r.body[0] : r.body;
        check("an owner UPDATE increments the revision to 2", row && Number(row.revision) === 2, `revision ${row && row.revision}`);
    }

    /* 12 — a stale optimistic-concurrency update matches nothing */
    {
        const r = await rest("PATCH", {
            token: A.token,
            query: `document_type=eq.month&document_key=eq.${SHARED_KEY}&revision=eq.1`,
            body: { payload: payload("A-aug-stale") }, prefer: "return=representation"
        });
        const rows = Array.isArray(r.body) ? r.body : [];
        check("a stale-revision UPDATE affects 0 rows", rows.length === 0, `${rows.length} row(s)`);
    }

    /* 13 — a tombstone is a normal owner-only UPDATE.
       KEY_A has already taken at least one earlier legitimate owner UPDATE
       (check 9's ownership-reassignment attempt: the trigger freezes
       user_id, but the UPDATE still succeeds and the database bumps the
       revision). So the tombstone must advance the revision by exactly 1
       relative to whatever it is now — not to a hard-coded value. */
    {
        const before = await rest("GET", { token: A.token, query: `select=revision&document_key=eq.${KEY_A}` });
        const beforeRevision = Number(
            before.body && before.body[0] ? before.body[0].revision : NaN
        );
        const r = await rest("PATCH", {
            token: A.token, query: `document_key=eq.${KEY_A}`,
            body: { deleted_at: new Date().toISOString() }, prefer: "return=representation"
        });
        const row = Array.isArray(r.body) ? r.body[0] : r.body;
        check("an owner can tombstone their own document", row && row.deleted_at, `status ${r.status}`);
        check("the tombstone UPDATE also bumped the revision",
            Number.isFinite(beforeRevision) && row && Number(row.revision) === beforeRevision + 1,
            `before ${beforeRevision} / after ${row && row.revision}`);
    }

    /* 14 — cleanup: each user deletes their own rows */
    {
        const da = await rest("DELETE", { token: A.token, query: `document_key=like.${RUN}*`, prefer: "return=representation" });
        const da2 = await rest("DELETE", { token: A.token, query: `document_type=eq.month&document_key=eq.${SHARED_KEY}`, prefer: "return=representation" });
        const db = await rest("DELETE", { token: B.token, query: `document_key=like.${RUN}*`, prefer: "return=representation" });
        const db2 = await rest("DELETE", { token: B.token, query: `document_type=eq.month&document_key=eq.${SHARED_KEY}`, prefer: "return=representation" });
        const leftA = await rest("GET", { token: A.token, query: `select=id&or=(document_key.like.${RUN}*,and(document_type.eq.month,document_key.eq.${SHARED_KEY}))` });
        const leftB = await rest("GET", { token: B.token, query: `select=id&or=(document_key.like.${RUN}*,and(document_type.eq.month,document_key.eq.${SHARED_KEY}))` });
        void da; void da2; void db; void db2;
        check("all test rows were cleaned up",
            Array.isArray(leftA.body) && leftA.body.length === 0 && Array.isArray(leftB.body) && leftB.body.length === 0,
            `A ${leftA.body && leftA.body.length} / B ${leftB.body && leftB.body.length} left`);
    }

    console.log(`\n${failed === 0 ? "RESULT: PASS" : "RESULT: FAIL"} — ${passed} passed, ${failed} failed.`);
    if (failed) {
        console.log("Failed checks: " + failures.join("; "));
        console.log("RLS is NOT correctly isolating users. Do not release BP7.");
        process.exit(1);
    }
    console.log("Row Level Security is isolating every financial document by owner.");
    process.exit(0);
}

main().catch((err) => {
    /* never print the error object verbatim — redact anything URL / token shaped */
    const safe = (err && err.message ? String(err.message).split("\n")[0] : "unknown error")
        .replace(/https?:\/\/\S+/gi, "<url>")
        .replace(/eyJ[A-Za-z0-9_.-]+/g, "<token>")
        .replace(/sb_[a-z]+_[A-Za-z0-9]+/g, "<key>");
    console.error("The verifier could not complete: " + safe);
    process.exit(3);
});
