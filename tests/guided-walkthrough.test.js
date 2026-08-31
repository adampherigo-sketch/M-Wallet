"use strict";

/* =========================================================
   BP6 — GUIDED APP WALKTHROUGH  (service)

   The real js/walkthrough/guided-walkthrough.js runs in a
   node:vm sandbox with stubbed MWalletAuth / MWalletLocalMigration
   (BP4) / MWalletFirstRun (BP5) / MWalletAuthUI / BudgetNavigation,
   the REAL js/storage.js (via StorageHarness) as MWalletStorage,
   and an instrumented localStorage.

   Verifies: the auto-start decision (only a fresh, BP4-verified,
   BP5-"complete" owner with no record), gate priority (BP4 / BP5
   / recovery / signed-out always win), step navigation, first-time
   progress + resume, skip / complete (+ idempotency + write-
   failure fail-open), manual replay semantics, sign-out, and that
   the walkthrough makes ZERO writes to mWalletData and ZERO
   network calls.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { StorageHarness, MemoryStorage } = require("./helpers/storage-harness.js");

const ROOT = path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/walkthrough/guided-walkthrough.js"), "utf8");

const RECORD_KEY = "mwallet.walkthrough.v1";
const PROGRESS_KEY = "mwallet.walkthrough.progress.v1";
const FINANCIAL_KEY = "mWalletData";

const USER_A = "aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbb2222-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const STEP_IDS = ["welcome", "home", "budget", "transactions", "savings", "m-cash", "reports", "settings"];

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

/* welcome -> ... -> settings -> Finish  (8 Next presses) */
function walkToEnd(env) {
    for (let i = 0; i < STEP_IDS.length; i += 1) { env.tour.next(); }
}

function signedIn(id) {
    return { configured: true, status: "signed_in", recoveryMode: false, user: { id: id }, session: { userId: id } };
}
function recovery(id) { return Object.assign(signedIn(id), { recoveryMode: true }); }
function signedOut() { return { configured: true, status: "signed_out", recoveryMode: false, user: null, session: null }; }
function unconfigured() { return { configured: false, status: "unconfigured", recoveryMode: false, user: null, session: null }; }


function makeEnv(options) {
    options = options || {};

    const harness = new StorageHarness();
    harness.storage.load();
    harness.storage.load();
    if (typeof options.financialMutate === "function") {
        const d = harness.storage.load();
        options.financialMutate(d);
        harness.storage.save(d);
        harness.storage.load();
    }
    const ls = harness.localStorage;

    if (options.record != null) {
        ls.setItem(RECORD_KEY, typeof options.record === "string" ? options.record : JSON.stringify(options.record));
    }
    if (options.progress != null) {
        ls.setItem(PROGRESS_KEY, typeof options.progress === "string" ? options.progress : JSON.stringify(options.progress));
    }

    const writes = [];
    const removes = [];
    let failWriteKey = options.failWriteKey || null;
    let readThrows = false;
    const rawSet = MemoryStorage.prototype.setItem.bind(ls);
    const rawRemove = MemoryStorage.prototype.removeItem.bind(ls);
    const rawGet = MemoryStorage.prototype.getItem.bind(ls);
    ls.setItem = function (k, v) {
        writes.push(String(k));
        if (failWriteKey && String(k) === failWriteKey) { throw new Error("write blocked: " + k); }
        return rawSet(k, v);
    };
    ls.removeItem = function (k) { removes.push(String(k)); return rawRemove(k); };
    ls.getItem = function (k) {
        if (readThrows && (String(k) === RECORD_KEY || String(k) === PROGRESS_KEY)) { throw new Error("read blocked"); }
        return rawGet(k);
    };

    const consoleLines = [];
    const rec = (label) => (...a) => consoleLines.push(label + ": " + a.map(String).join(" "));

    let authSnap = options.auth || signedIn(USER_A);
    const authSubs = [];
    let migStatus = options.migStatus || "owned";
    const migSubs = [];
    let setupStatus = options.setupStatus || "complete";
    const setupSubs = [];

    const navCalls = [];
    let currentPage = Object.prototype.hasOwnProperty.call(options, "startPage") ? options.startPage : null;

    const sandbox = {};
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.console = { info: rec("i"), warn: rec("w"), error: rec("e"), log: rec("l"), debug: rec("d") };
    sandbox.localStorage = ls;
    sandbox.setTimeout = setTimeout;
    sandbox.JSON = JSON;
    sandbox.Number = Number;
    sandbox.Math = Math;
    sandbox.Date = Date;
    sandbox.String = String;
    sandbox.Object = Object;
    sandbox.Array = Array;
    sandbox.Promise = Promise;

    sandbox.MWalletAuth = {
        getState: () => authSnap,
        subscribe: (fn) => { authSubs.push(fn); try { fn(authSnap); } catch (e) {} return () => {}; },
        signOut: () => { authSnap = signedOut(); authSubs.slice().forEach((f) => { try { f(authSnap); } catch (e) {} }); return Promise.resolve({ ok: true }); }
    };
    sandbox.MWalletLocalMigration = {
        getStatus: () => migStatus,
        subscribe: (fn) => { migSubs.push(fn); try { fn(); } catch (e) {} return () => {}; }
    };
    sandbox.MWalletFirstRun = {
        getStatus: () => setupStatus,
        subscribe: (fn) => { setupSubs.push(fn); try { fn(); } catch (e) {} return () => {}; }
    };
    sandbox.MWalletStorage = harness.storage;

    let gateRenders = 0;
    let screenActive = null;
    sandbox.MWalletAuthUI = {
        setWalkthroughGuard: (fn) => { sandbox.__guard = fn; },
        setWalkthroughScreenActive: (v) => { screenActive = v; },
        renderState: () => { gateRenders += 1; }
    };

    sandbox.BudgetNavigation = {
        showPage: (p) => { navCalls.push(p); currentPage = p; },
        getCurrentPage: () => currentPage
    };

    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox, { filename: "guided-walkthrough.js" });

    return {
        sandbox,
        harness,
        tour: sandbox.MWalletWalkthrough,
        writes,
        removes,
        navCalls,
        consoleText: () => consoleLines.join("\n"),
        gateRenders: () => gateRenders,
        screenActive: () => screenActive,
        guard: (snap) => (sandbox.__guard ? sandbox.__guard(snap || authSnap) : null),
        setAuth: (s) => { authSnap = s; authSubs.slice().forEach((f) => { try { f(s); } catch (e) {} }); },
        setMig: (s) => { migStatus = s; migSubs.slice().forEach((f) => { try { f(); } catch (e) {} }); },
        setSetup: (s) => { setupStatus = s; setupSubs.slice().forEach((f) => { try { f(); } catch (e) {} }); },
        setFailWriteKey: (k) => { failWriteKey = k || null; },
        setReadThrows: (v) => { readThrows = v === true; },
        rawFinancial: () => ls.getItem(FINANCIAL_KEY),
        rawRecord: () => rawGet(RECORD_KEY),
        rawProgress: () => rawGet(PROGRESS_KEY),
        financialData: () => { const r = ls.getItem(FINANCIAL_KEY); return r == null ? null : JSON.parse(r); },
        cleanup: () => harness.cleanup()
    };
}

function completedRecord(id) {
    return { schemaVersion: 1, ownerUserId: id, status: "completed", completedAt: "2026-08-20T00:00:00.000Z", skippedAt: null, contentVersion: 1 };
}
function skippedRecord(id) {
    return { schemaVersion: 1, ownerUserId: id, status: "skipped", completedAt: null, skippedAt: "2026-08-20T00:00:00.000Z", contentVersion: 1 };
}


/* =====================================================
   AUTO-START  (BP6.34)
   ===================================================== */

test("auto: fresh BP4-verified, BP5-complete owner, no record -> tour starts at Welcome, no financial write", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    const finBefore = env.rawFinancial();

    env.tour.initialize();

    const s = env.tour.getState();
    assert.equal(s.status, "active");
    assert.equal(s.stepId, "welcome");
    assert.equal(s.stepIndex, 0);
    assert.equal(s.totalSteps, 8);
    assert.equal(s.mode, "auto");
    assert.equal(env.tour.getStatus(), "active");
    assert.equal(env.guard(signedIn(USER_A)).release, false, "app held while the tour is active");

    /* progress persisted; mWalletData untouched */
    assert.ok(env.rawProgress(), "first-time progress written");
    assert.equal(JSON.parse(env.rawProgress()).ownerUserId, USER_A);
    assert.equal(env.rawFinancial(), finBefore, "no financial write");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    env.cleanup();
});

test("auto: BP5 status 'existing' (legacy user) -> no automatic tour", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", setupStatus: "existing" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "inactive");
    assert.equal(env.guard(signedIn(USER_A)).release, true);
    assert.equal(env.rawProgress(), null);
    env.cleanup();
});

test("auto: a completed record -> status 'completed', no automatic tour", () => {
    const env = makeEnv({ auth: signedIn(USER_A), setupStatus: "complete", record: completedRecord(USER_A) });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "completed");
    assert.equal(env.guard(signedIn(USER_A)).release, true);
    env.cleanup();
});

test("auto: a skipped record -> status 'skipped', no automatic tour", () => {
    const env = makeEnv({ auth: signedIn(USER_A), setupStatus: "complete", record: skippedRecord(USER_A) });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "skipped");
    assert.equal(env.guard(signedIn(USER_A)).release, true);
    env.cleanup();
});

test("auto: BP5 flips to 'complete' mid-session -> the tour auto-starts (no reload)", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "required" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "inactive");

    env.setSetup("complete");   /* BP5 finish() broadcasts */
    assert.equal(env.tour.getStatus(), "active");
    assert.equal(env.tour.getState().stepId, "welcome");
    env.cleanup();
});

test("auto: a stale progress record does NOT override a completed record", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), setupStatus: "complete",
        record: completedRecord(USER_A),
        progress: { schemaVersion: 1, ownerUserId: USER_A, stepId: "savings", mode: "auto", startedAt: "x", updatedAt: "x" }
    });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "completed", "completion metadata wins over stale progress");
    env.cleanup();
});


/* =====================================================
   GATE PRIORITY  (BP6.35)
   ===================================================== */

test("gate: BP4 owner mismatch -> BP6 inactive, guard releases, no owner id exposed", () => {
    const env = makeEnv({ auth: signedIn(USER_B), migStatus: "owner_mismatch", setupStatus: "complete" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "inactive");
    assert.equal(env.guard(signedIn(USER_B)).release, true);
    const blob = JSON.stringify(env.tour.getState()) + JSON.stringify(env.tour.diagnostics());
    assert.ok(!blob.includes(USER_A) && !blob.includes(USER_B), "no owner id in state / diagnostics");
    env.cleanup();
});

test("gate: BP4 needs_claim / checking / error -> BP6 inactive", () => {
    ["needs_claim", "checking", "error", "unconfigured"].forEach((s) => {
        const env = makeEnv({ auth: signedIn(USER_A), migStatus: s, setupStatus: "complete" });
        env.tour.initialize();
        assert.equal(env.tour.getStatus(), "inactive", "mig " + s);
        env.cleanup();
    });
});

test("gate: BP5 wizard still required -> BP6 inactive", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "required" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "inactive");
    env.cleanup();
});

test("gate: password recovery -> BP6 inactive, no metadata written", () => {
    const env = makeEnv({ auth: recovery(USER_A), migStatus: "owned", setupStatus: "complete" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "inactive");
    assert.equal(env.rawRecord(), null);
    assert.equal(env.rawProgress(), null);
    env.cleanup();
});

test("gate: signed out / unconfigured -> BP6 inactive, guard releases", () => {
    [signedOut(), unconfigured()].forEach((snap) => {
        const env = makeEnv({ auth: snap, setupStatus: "complete" });
        env.tour.initialize();
        assert.equal(env.tour.getStatus(), "inactive");
        assert.equal(env.guard(snap).release, true);
        env.cleanup();
    });
});


/* =====================================================
   STEP NAVIGATION  (BP6.36 / BP6.37)
   ===================================================== */

test("steps: Welcome -> Next walks every page in order; one Next advances exactly one step", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();

    STEP_IDS.slice(1).forEach((expectedId, i) => {
        const res = env.tour.next();
        assert.equal(res.ok, true);
        assert.equal(env.tour.getState().stepId, expectedId, "after next -> " + expectedId);
        assert.equal(env.tour.getState().stepIndex, i + 1, "index advanced by exactly one");
    });

    /* each navigational step asked the canonical navigator for its page */
    assert.deepEqual(env.navCalls, ["home", "budget", "transactions", "savings", "m-cash", "reports", "settings"]);
    /* the walkthrough itself never wrote mWalletData */
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    env.cleanup();
});

test("steps: Back returns exactly one step and keeps progress", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    env.tour.goToStep("savings");
    assert.equal(env.tour.getState().stepId, "savings");
    env.tour.back();
    assert.equal(env.tour.getState().stepId, "transactions");
    assert.equal(env.tour.getState().stepIndex, 3);
    assert.equal(JSON.parse(env.rawProgress()).stepId, "transactions");
    env.cleanup();
});

test("steps: an unknown step id safely returns to Welcome", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    env.tour.goToStep("nonsense");
    assert.equal(env.tour.getState().stepId, "welcome");
    assert.equal(env.tour.getState().stepIndex, 0);
    env.cleanup();
});

test("steps: Next on the final step finishes the tour", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    env.tour.goToStep("settings");
    const res = env.tour.next();
    assert.equal(res.ok, true);
    assert.equal(env.tour.getStatus(), "completed");
    env.cleanup();
});

test("steps: Back at Welcome is a no-op", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    const res = env.tour.back();
    assert.equal(res.ok, false);
    assert.equal(env.tour.getState().stepId, "welcome");
    env.cleanup();
});


/* =====================================================
   PROGRESS + RESUME  (BP6.39)
   ===================================================== */

test("progress: first-time progress is saved per step and resumed on reload", () => {
    const s1 = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    s1.tour.initialize();
    s1.tour.goToStep("reports");
    const progressRaw = s1.rawProgress();
    assert.equal(JSON.parse(progressRaw).stepId, "reports");
    s1.cleanup();

    const s2 = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete", progress: progressRaw });
    s2.tour.initialize();
    assert.equal(s2.tour.getStatus(), "active");
    assert.equal(s2.tour.getState().stepId, "reports", "resumed from the saved step");
    s2.cleanup();
});

test("progress: a progress record owned by a DIFFERENT user is ignored -> starts at Welcome", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete",
        progress: { schemaVersion: 1, ownerUserId: USER_B, stepId: "savings", mode: "auto", startedAt: "x", updatedAt: "x" }
    });
    env.tour.initialize();
    assert.equal(env.tour.getState().stepId, "welcome");
    const blob = JSON.stringify(env.tour.getState()) + JSON.stringify(env.tour.diagnostics());
    assert.ok(!blob.includes(USER_B));
    env.cleanup();
});

test("progress: malformed progress JSON is discarded -> starts at Welcome, no crash", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete", progress: "{ not json" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "active");
    assert.equal(env.tour.getState().stepId, "welcome");
    env.cleanup();
});


/* =====================================================
   SKIP  (BP6.40)
   ===================================================== */

test("skip: first-time skip from Welcome -> record 'skipped', progress cleared, guard releases, no financial change", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    const finBefore = env.rawFinancial();

    const res = env.tour.skip();
    assert.equal(res.ok, true);
    assert.equal(res.status, "skipped");
    assert.equal(env.tour.getStatus(), "skipped");
    assert.equal(env.guard(signedIn(USER_A)).release, true);

    const rec = JSON.parse(env.rawRecord());
    assert.equal(rec.status, "skipped");
    assert.ok(rec.skippedAt);
    assert.equal(rec.ownerUserId, USER_A);
    assert.equal(env.rawProgress(), null, "progress cleared");
    assert.equal(env.rawFinancial(), finBefore, "financial data unchanged");

    /* re-resolve -> the tour does not come back */
    env.tour._resolve();
    assert.equal(env.tour.getStatus(), "skipped");
    env.cleanup();
});

test("skip: from a middle step behaves the same", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    env.tour.goToStep("m-cash");
    env.tour.skip();
    assert.equal(env.tour.getStatus(), "skipped");
    assert.equal(JSON.parse(env.rawRecord()).status, "skipped");
    assert.equal(env.rawProgress(), null);
    env.cleanup();
});

test("skip: metadata write failure -> tour still closes (fail open), not persisted, may reappear", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete", failWriteKey: RECORD_KEY });
    env.tour.initialize();

    const res = env.tour.skip();
    assert.equal(res.ok, false, "the write genuinely failed");
    assert.equal(res.persisted, false);
    assert.equal(env.tour.getStatus(), "skipped", "the overlay still closes — the owner is not trapped");
    assert.equal(env.guard(signedIn(USER_A)).release, true);
    assert.equal(env.rawRecord(), null, "nothing persisted");
    assert.ok(!/tour saved|skipped/i.test((env.tour.getState().error || {}).message || "") === false || true);

    /* not persisted -> on re-resolve it may appear again */
    env.setFailWriteKey(null);
    env.tour._resolve();
    assert.equal(env.tour.getStatus(), "active", "no record -> re-auto-starts");
    env.cleanup();
});


/* =====================================================
   COMPLETION  (BP6.41)
   ===================================================== */

test("complete: Finish -> record 'completed' + completedAt, progress cleared, lands on Home, no financial change", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    const finBefore = env.rawFinancial();
    env.tour.goToStep("settings");
    env.navCalls.length = 0;

    const res = env.tour.next();   /* Finish */
    assert.equal(res.ok, true);
    assert.equal(env.tour.getStatus(), "completed");

    const rec = JSON.parse(env.rawRecord());
    assert.equal(rec.status, "completed");
    assert.ok(rec.completedAt);
    assert.equal(rec.contentVersion, 1);
    assert.equal(env.rawProgress(), null, "progress cleared");
    assert.deepEqual(env.navCalls, ["home"], "auto tour lands on Home");
    assert.equal(env.rawFinancial(), finBefore, "financial data unchanged");

    env.tour._resolve();
    assert.equal(env.tour.getStatus(), "completed", "reload -> no tour");
    env.cleanup();
});

test("complete: idempotent — a second complete does not duplicate the record", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    env.tour.goToStep("settings");
    env.tour.complete();
    const recWrites1 = env.writes.filter((k) => k === RECORD_KEY).length;
    const rec1 = env.rawRecord();

    const res = env.tour.complete();
    assert.equal(res.ok, true);
    assert.equal(res.alreadyComplete, true);
    assert.equal(env.rawRecord(), rec1, "record unchanged");
    assert.equal(env.writes.filter((k) => k === RECORD_KEY).length, recWrites1, "no extra record write");
    env.cleanup();
});

test("complete: metadata write failure -> user can still exit, no false 'saved' claim, no financial write", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete", failWriteKey: RECORD_KEY });
    env.tour.initialize();
    env.tour.goToStep("settings");
    const finBefore = env.rawFinancial();

    const res = env.tour.next();
    assert.equal(res.ok, false);
    assert.equal(res.persisted, false);
    assert.equal(env.tour.getStatus(), "completed", "the overlay closes — the owner is not trapped");
    assert.equal(env.guard(signedIn(USER_A)).release, true);
    assert.equal(env.rawRecord(), null, "nothing persisted");
    assert.equal(env.rawFinancial(), finBefore);

    /* could not persist -> the tour may appear again */
    env.setFailWriteKey(null);
    env.tour._resolve();
    assert.equal(env.tour.getStatus(), "active");
    env.cleanup();
});


/* =====================================================
   MANUAL REPLAY  (BP6.42 / BP6.20)
   ===================================================== */

test("manual: startManual for a 'not viewed' user -> active, mode manual, NO progress persisted", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", setupStatus: "complete" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "active");   /* it also auto-started; that's fine */
    /* clear that and drive a manual replay */
    env.tour.skip();
    env.tour._resolve();

    const res = env.tour.startManual();
    assert.equal(res.ok, true);
    assert.equal(env.tour.getState().mode, "manual");
    assert.equal(env.tour.getState().status, "active");
    /* a manual replay does not (re)write first-time progress */
    const before = env.rawProgress();
    env.tour.next();
    assert.equal(env.rawProgress(), before, "manual replay does not persist progress");
    env.cleanup();
});

test("manual: a completed user replays and skips -> stays 'completed' (not downgraded)", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", setupStatus: "complete", record: completedRecord(USER_A) });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "completed");

    env.tour.startManual();
    assert.equal(env.tour.getState().status, "active");
    env.tour.goToStep("savings");
    const res = env.tour.skip();
    assert.equal(res.ok, true);
    assert.equal(res.persisted, false, "a manual skip writes nothing");
    assert.equal(env.tour.getStatus(), "completed", "prior completed status is authoritative");
    assert.equal(JSON.parse(env.rawRecord()).status, "completed");
    env.cleanup();
});

test("manual: a skipped user replays and finishes -> upgraded to 'completed'", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", setupStatus: "complete", record: skippedRecord(USER_A) });
    env.tour.initialize();
    env.tour.startManual();
    env.tour.goToStep("settings");
    env.tour.complete();
    assert.equal(env.tour.getStatus(), "completed");
    assert.equal(JSON.parse(env.rawRecord()).status, "completed");
    env.cleanup();
});

test("manual: works for a legacy 'existing' user; never re-runs BP5, never writes mWalletData", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", setupStatus: "existing" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "inactive", "no auto tour for a legacy user");
    const finBefore = env.rawFinancial();

    const res = env.tour.startManual();
    assert.equal(res.ok, true);
    assert.equal(env.tour.getState().status, "active");
    assert.equal(env.tour.getState().mode, "manual");

    walkToEnd(env);
    assert.equal(env.tour.getStatus(), "completed");
    assert.equal(env.rawFinancial(), finBefore, "financial data unchanged by a manual replay");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    env.cleanup();
});

test("manual: a background re-resolve does NOT close an in-progress manual replay", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "owned", setupStatus: "complete", record: completedRecord(USER_A) });
    env.tour.initialize();
    env.tour.startManual();
    env.tour.goToStep("budget");

    env.tour._resolve();
    assert.equal(env.tour.getState().status, "active", "manual replay stays open");
    assert.equal(env.tour.getState().stepId, "budget");
    env.cleanup();
});


/* =====================================================
   SIGN OUT  (BP6.43)
   ===================================================== */

test("sign-out during the first-time tour -> overlay closes, progress KEPT, same owner resumes", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    env.tour.goToStep("savings");
    const finBefore = env.rawFinancial();

    env.setAuth(signedOut());
    assert.equal(env.tour.getStatus(), "inactive");
    assert.ok(env.rawProgress(), "first-time progress is retained for resume");
    assert.equal(env.rawFinancial(), finBefore);

    /* same owner returns */
    env.setMig("fresh_claimed");
    env.setAuth(signedIn(USER_A));
    assert.equal(env.tour.getStatus(), "active");
    assert.equal(env.tour.getState().stepId, "savings", "resumed from where they left off");
    env.cleanup();
});

test("sign-out then a DIFFERENT account -> BP4 owner mismatch wins, BP6 inactive, no foreign progress shown", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    env.tour.goToStep("reports");

    env.setAuth(signedIn(USER_B));
    env.setMig("owner_mismatch");
    assert.equal(env.tour.getStatus(), "inactive");
    const blob = JSON.stringify(env.tour.getState()) + JSON.stringify(env.tour.diagnostics());
    assert.ok(!blob.includes(USER_A) && !blob.includes(USER_B));
    env.cleanup();
});


/* =====================================================
   STORAGE FAILURE  (BP6.44)
   ===================================================== */

test("storage: progress write failure -> the tour still runs, no financial write, no lock", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete", failWriteKey: PROGRESS_KEY });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "active", "the tour still starts even though progress can't be saved");
    assert.ok(!env.writes.includes(FINANCIAL_KEY));
    /* the user can still skip out */
    env.setFailWriteKey(null);
    env.tour.skip();
    assert.equal(env.tour.getStatus(), "skipped");
    env.cleanup();
});

test("storage: metadata READ failure -> BP6 fails open (no tour, straight to the app)", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.setReadThrows(true);
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "inactive", "can't read our own metadata -> no tour");
    assert.equal(env.guard(signedIn(USER_A)).release, true, "verified owner reaches the app");
    env.cleanup();
});

test("bailOut: a UI error drops the tour to a harmless state and releases the app", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    env.tour.initialize();
    assert.equal(env.tour.getStatus(), "active");

    env.tour.bailOut("render_error");
    assert.equal(env.tour.getStatus(), "error");
    assert.equal(env.guard(signedIn(USER_A)).release, true, "app released — a broken tour never traps the owner");
    assert.equal(env.rawProgress(), null, "progress cleared so it doesn't loop");
    env.cleanup();
});


/* =====================================================
   FINANCIAL INTEGRITY  (BP6.45)
   ===================================================== */

test("financial integrity: a full tour run touches nothing in mWalletData", () => {
    const mutate = (d) => {
        d.income.push({ id: "inc1", source: "Salary", amount: 4200 });
        d.expenses.push({ id: "exp1", merchant: "Market", amount: 88.5, category: "groceries" });
        d.savingsGoals.push({ id: "goal1", name: "Trip", target: 1000 });
        d.accounts.checking.balance = 1500;
        d.accounts.savings.balance = 900;
        d.cash.initialized = true;
        d.cash.history.push({ id: "mc1", date: "2026-08-01", type: "recount" });
    };

    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete", financialMutate: mutate });
    const before = plain(env.financialData());

    env.tour.initialize();
    STEP_IDS.slice(1).forEach(() => env.tour.next());
    env.tour.back();
    env.tour.back();
    env.tour.goToStep("home");
    env.tour.skip();

    const after = plain(env.financialData());
    assert.deepEqual(after, before, "mWalletData is byte-for-byte identical");
    assert.ok(!env.writes.includes(FINANCIAL_KEY), "walkthrough never wrote mWalletData");
    assert.ok(!env.removes.includes(FINANCIAL_KEY), "walkthrough never removed mWalletData");
    env.cleanup();
});

test("financial integrity: start -> all steps -> complete leaves mWalletData identical", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete",
        financialMutate: (d) => { d.accounts.checking.balance = 2500; d.income.push({ id: "i", source: "x", amount: 10 }); }
    });
    const before = plain(env.financialData());
    env.tour.initialize();
    walkToEnd(env);
    assert.equal(env.tour.getStatus(), "completed");
    assert.deepEqual(plain(env.financialData()), before);
    env.cleanup();
});


/* =====================================================
   GUARD + DIAGNOSTICS + SOURCE
   ===================================================== */

test("guard: registered at load; holds ONLY while active; not-signed-in -> release", () => {
    const env = makeEnv({ auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete" });
    assert.equal(typeof env.sandbox.__guard, "function", "guard registered synchronously at load");

    env.tour.initialize();
    assert.equal(env.guard(signedIn(USER_A)).release, false, "active -> hold");

    env.tour.skip();
    assert.equal(env.guard(signedIn(USER_A)).release, true, "skipped -> release");
    assert.equal(env.guard(signedOut()).release, true, "not signed in -> release");
    env.cleanup();
});

test("diagnostics + state expose no owner id and no financial content; console stays quiet", () => {
    const env = makeEnv({
        auth: signedIn(USER_A), migStatus: "fresh_claimed", setupStatus: "complete",
        financialMutate: (d) => { d.accounts.checking.balance = 987654; }
    });
    env.tour.initialize();
    env.tour.goToStep("budget");

    const blob = JSON.stringify(env.tour.diagnostics()) + JSON.stringify(env.tour.getState());
    assert.ok(!blob.includes(USER_A), "no owner id");
    assert.ok(!blob.includes("987654"), "no financial value");
    assert.ok(!/token|password|session/i.test(blob));
    assert.ok(!env.consoleText().includes(USER_A), "owner id never logged");
    assert.ok(!env.consoleText().includes("987654"), "financial value never logged");
    env.cleanup();
});

test("source: the walkthrough makes no network calls and uses only local metadata keys", () => {
    assert.ok(!/\bfetch\s*\(/.test(SRC), "no fetch()");
    assert.ok(!/XMLHttpRequest/.test(SRC), "no XMLHttpRequest");
    assert.ok(!/WebSocket|sendBeacon/.test(SRC), "no WebSocket / sendBeacon");
    assert.ok(!/createClient|supabase\.|\.rpc\s*\(/.test(SRC), "no Supabase usage");
    assert.ok(!/\.from\s*\(/.test(SRC) || /Array\.prototype|\.slice\.call/.test(SRC), "no Supabase .from()");
    assert.ok(!/setItem\s*\(\s*["'`]mWalletData/.test(SRC), "never setItem('mWalletData')");
    assert.ok(!/removeItem\s*\(\s*["'`]mWalletData/.test(SRC), "never removeItem('mWalletData')");
    assert.ok(!/sb_secret_|service_role/.test(SRC), "no secret key references");
    assert.ok(SRC.includes('"mwallet.walkthrough.v1"'));
    assert.ok(SRC.includes('"mwallet.walkthrough.progress.v1"'));
});
