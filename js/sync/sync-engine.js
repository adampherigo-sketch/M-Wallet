"use strict";

/* =========================================================
   M-WALLET — LOCAL-FIRST SYNC ENGINE   (BP8)

       window.MWalletSync

   Orchestrates safe background reconciliation between the
   local canonical financial store (mWalletData, via storage.js)
   and the cloud document store (wallet_documents, via
   MWalletCloudFinancial).

   HARD RULES
     - LOCAL SAVE NEVER DEPENDS ON CLOUD SUCCESS. This engine
       only ever reacts to a save that already succeeded.
     - Cloud data is never rendered directly. Remote changes are
       applied to mWalletData through storage.js, then the app
       re-renders from local state.
     - Same-document concurrent change with no shared baseline
       => CONFLICT. Never a silent overwrite. Other documents
       keep syncing.
     - Release gate (BP8): when MWalletSyncRelease.isEnabled()
       is false (the committed default), this engine makes ZERO
       cloud requests of any kind.
     - Talks to the cloud ONLY through MWalletCloudFinancial —
       never .from("wallet_documents"), never a Supabase client,
       never an access token.
     - Never logs a financial payload, balance, note, account
       name, owner id, or token.
   ========================================================= */

(function (global) {

    /* ---- tunables ---- */
    var LOCAL_SAVE_DEBOUNCE_MS = 1200;
    var ONLINE_RESYNC_DELAY_MS = 400;
    var BACKOFF_BASE_MS = 4000;
    var BACKOFF_MAX_MS = 5 * 60 * 1000;

    var STATUS = {
        DISABLED: "disabled",           /* release gate off (BP8 default) */
        UNCONFIGURED: "unconfigured",
        SIGNED_OUT: "signed_out",
        IDLE: "idle",                   /* up to date */
        SYNCING: "syncing",
        OFFLINE: "offline",
        PENDING: "pending",             /* changes waiting to sync */
        CONFLICTS: "conflicts",
        UNSUPPORTED: "unsupported",     /* cloud schema missing / unsupported */
        ERROR: "error"
    };

    var BOOTSTRAP = {
        DISABLED: "disabled",
        IDLE: "idle",
        CHECKING: "checking",
        NEEDS_DECISION: "needs_decision",   /* offline / error — waiting for the user */
        READY: "ready",                     /* local wallet is already established */
        RESTORED: "restored",               /* cloud data pulled onto an empty device */
        EMPTY: "empty",                     /* cloud had nothing */
        DEFERRED: "deferred",               /* user chose "continue offline" */
        SKIP: "skip"                        /* not our path */
    };

    /* ---- dependency resolution (overridable for tests) ---- */

    var deps = null;

    function d() {
        if (deps) { return deps; }
        return {
            release: safeGlobal("MWalletSyncRelease"),
            auth: safeGlobal("MWalletAuth"),
            migration: safeGlobal("MWalletLocalMigration"),
            firstRun: safeGlobal("MWalletFirstRun"),
            store: safeGlobal("MWalletCloudFinancial"),
            codec: safeGlobal("MWalletCloudFinancialCodec"),
            planner: safeGlobal("MWalletSyncPlanner"),
            syncState: safeGlobal("MWalletSyncState"),
            storage: safeGlobal("MWalletStorage") || safeGlobal("BudgetStorage"),
            app: safeGlobal("BudgetApp") || safeGlobal("MWalletApp"),
            hash: defaultHash,
            now: function () { try { return new Date().toISOString(); } catch (e) { return "1970-01-01T00:00:00.000Z"; } },
            isOnline: function () {
                try { return typeof navigator === "undefined" ? true : navigator.onLine !== false; }
                catch (e) { return true; }
            }
        };
    }

    function safeGlobal(name) {
        try { return global[name] || null; } catch (e) { return null; }
    }

    /* A one-shot deterministic test seam. Tests set this (via
       _setRaceHook) to simulate a local edit landing between "plan
       computed" and "apply". Fired at most once, then cleared.
       Only reachable through the test-only API, never in a real build. */
    var testRaceHook = null;
    function fireRaceHook() {
        var cur = testRaceHook;
        if (typeof cur !== "function") { return Promise.resolve(); }
        testRaceHook = null;
        try { return Promise.resolve(cur()); } catch (e) { return Promise.resolve(); }
    }

    /* tests call this to run the ENABLED engine against stubs without
       changing the committed release default */
    function configureForTest(overrides) {
        if (overrides == null) { deps = null; return; }
        var base = d();
        deps = Object.assign({}, base, overrides);
    }


    /* ---- SHA-256 (change detection only, not security) ---- */

    function defaultHash(str) {
        try {
            var subtle = (global.crypto && global.crypto.subtle) ||
                (typeof crypto !== "undefined" && crypto.subtle) || null;
            if (!subtle || typeof TextEncoder === "undefined") {
                return Promise.resolve(null);   /* unhashable -> caller must NOT assume unchanged */
            }
            return subtle.digest("SHA-256", new TextEncoder().encode(String(str))).then(function (buf) {
                var bytes = new Uint8Array(buf);
                var hex = "";
                for (var i = 0; i < bytes.length; i++) {
                    hex += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
                }
                return hex;
            }).catch(function () { return null; });
        } catch (e) {
            return Promise.resolve(null);
        }
    }


    /* ---- runtime state ---- */

    var status = STATUS.DISABLED;
    var bootstrapStatus = BOOTSTRAP.IDLE;
    var lastSummary = { pendingCount: 0, conflictCount: 0, lastAttemptAt: null, lastSuccessAt: null, bootstrapStatus: "unknown" };
    var lastErrorCode = null;
    var subscribers = [];
    var initialized = false;

    var running = false;
    var rerunRequested = false;
    var applyingRemote = false;         /* suppresses our own financial-saved reaction */
    var debounceTimer = null;
    var backoffTimer = null;
    var backoffMs = BACKOFF_BASE_MS;
    var currentOwner = null;

    var bootstrapContext = null;        /* { owner } while NEEDS_DECISION */


    /* ---- helpers ---- */

    function authSnap() {
        var a = d().auth;
        try { return (a && typeof a.getState === "function") ? a.getState() : null; }
        catch (e) { return null; }
    }

    function ownerId() {
        var s = authSnap();
        return (s && s.user && typeof s.user.id === "string" && s.user.id) ? s.user.id : null;
    }

    function ownershipOk() {
        var m = d().migration;
        try {
            if (!m || typeof m.getStatus !== "function") { return false; }
            var st = m.getStatus();
            return st === "owned" || st === "fresh_claimed";
        } catch (e) { return false; }
    }

    /* returns a safe code string when a cloud cycle must NOT run, else null */
    function preflight() {
        var rel = d().release;
        if (!rel || typeof rel.isEnabled !== "function" || rel.isEnabled() !== true) { return "disabled"; }
        var s = authSnap();
        if (!s || s.configured !== true) { return "unconfigured"; }
        if (s.recoveryMode === true) { return "signed_out"; }
        if (s.status !== "signed_in") { return "signed_out"; }
        if (!ownerId()) { return "signed_out"; }
        if (!ownershipOk()) { return "signed_out"; }
        var store = d().store;
        if (!store) { return "unsupported"; }
        return null;
    }

    function idOf(type, key) { return String(type) + "/" + String(key); }

    function notify() {
        var snap = getState();
        subscribers.slice().forEach(function (fn) {
            try { fn(snap); } catch (e) { /* a bad subscriber cannot break sync */ }
        });
    }

    function setStatus(next, errorCode) {
        status = next;
        lastErrorCode = errorCode || null;
        notify();
    }

    function refreshSummary(state) {
        var ss = d().syncState;
        if (ss && typeof ss.summary === "function") {
            lastSummary = ss.summary(state);
        }
    }

    /* ---- local encode + fingerprint ---- */

    function loadLocal() {
        var storage = d().storage;
        if (!storage || typeof storage.load !== "function") { return null; }
        try { return storage.load(); } catch (e) { return null; }
    }

    /* -> { ok, docs:[{documentType,documentKey,schemaVersion,payload,hash}], unhashable:[] } */
    function encodeLocalWithHashes() {
        var codec = d().codec;
        var local = loadLocal();
        if (!codec || !local) { return Promise.resolve({ ok: false, code: "unsupported" }); }
        var enc = codec.encodeFinancialState(local);
        if (!enc || !enc.ok) { return Promise.resolve({ ok: false, code: "invalid_document" }); }

        var hashFn = d().hash;
        var unhashable = [];
        var chain = enc.documents.map(function (doc) {
            var input = codec.documentFingerprintInput(doc);
            if (input == null) { unhashable.push(idOf(doc.documentType, doc.documentKey)); doc.hash = null; return Promise.resolve(); }
            return Promise.resolve(hashFn(input)).then(function (h) {
                if (typeof h === "string" && h) { doc.hash = h; }
                else { doc.hash = null; unhashable.push(idOf(doc.documentType, doc.documentKey)); }
            });
        });
        return Promise.all(chain).then(function () {
            return { ok: true, docs: enc.documents, unhashable: unhashable };
        });
    }

    function fingerprintRemotePayload(type, key, schemaVersion, payload) {
        var codec = d().codec;
        var input = codec.documentFingerprintInput({
            documentType: type, documentKey: key, schemaVersion: schemaVersion, payload: payload
        });
        if (input == null) { return Promise.resolve(null); }
        return Promise.resolve(d().hash(input));
    }


    /* ============================================================
       THE SYNC CYCLE
       ============================================================ */

    function syncNow(opts) {
        opts = opts || {};
        if (running) { rerunRequested = true; return currentRun || Promise.resolve(getState()); }
        var code = preflight();
        if (code) {
            setStatus(mapPreflight(code), code === "disabled" ? null : code);
            return Promise.resolve(getState());
        }
        if (!d().isOnline()) {
            running = true;
            currentRun = queueAllDirtyThenOffline().then(function () {
                running = false;
                currentRun = null;
                return getState();
            });
            return currentRun;
        }
        currentRun = runCycle().then(function (r) {
            currentRun = null;
            if (rerunRequested && !running) {
                rerunRequested = false;
                return syncNow({ chained: true });
            }
            rerunRequested = false;
            return r;
        });
        return currentRun;
    }
    var currentRun = null;

    function mapPreflight(code) {
        if (code === "disabled") { return STATUS.DISABLED; }
        if (code === "unconfigured") { return STATUS.UNCONFIGURED; }
        if (code === "unsupported") { return STATUS.UNSUPPORTED; }
        return STATUS.SIGNED_OUT;
    }

    function loadState(owner) {
        var ss = d().syncState;
        var res = ss.load(owner);
        return res.state;
    }
    function persistState(state) {
        var ss = d().syncState;
        try { return ss.persist(state); } catch (e) { return { ok: false, code: "write_failed" }; }
    }

    /* mark every locally-changed document pending, without any cloud call */
    function queueAllDirtyThenOffline() {
        var owner = ownerId();
        if (!owner) { setStatus(STATUS.SIGNED_OUT); return Promise.resolve(); }
        var ss = d().syncState;
        var state = loadState(owner);
        return encodeLocalWithHashes().then(function (enc) {
            if (enc.ok) {
                enc.docs.forEach(function (doc) {
                    var base = ss.getBaseline(state, doc.documentType, doc.documentKey);
                    var changed = !base || (doc.hash != null && doc.hash !== base.baseHash) || (base.deleted === true);
                    if (changed && doc.hash != null) {
                        ss.queuePending(state, doc.documentType, doc.documentKey, "upsert");
                    }
                });
            }
            persistState(state);
            refreshSummary(state);
            setStatus(state.pending && state.pending.length ? STATUS.OFFLINE : STATUS.OFFLINE);
            scheduleBackoff();
        });
    }

    function runCycle() {
        running = true;
        setStatus(STATUS.SYNCING);
        var ss = d().syncState;
        var planner = d().planner;
        var codec = d().codec;
        var store = d().store;

        var owner = ownerId();
        currentOwner = owner;
        var state = loadState(owner);
        ss.touchAttempt(state);
        persistState(state);

        var hadNetworkError = false;
        var remotePayloads = {};          /* in-memory only, never persisted */

        return encodeLocalWithHashes().then(function (enc) {
            if (!enc.ok) { throw { soft: true, code: enc.code || "unsupported" }; }
            var localList = enc.docs
                .filter(function (doc) { return doc.hash != null; })
                .map(function (doc) {
                    return { documentType: doc.documentType, documentKey: doc.documentKey, hash: doc.hash };
                });
            var localById = {};
            enc.docs.forEach(function (doc) { localById[idOf(doc.documentType, doc.documentKey)] = doc; });

            /* unhashable local docs: leave them pending, don't assume unchanged */
            enc.unhashable.forEach(function (id) {
                var parts = id.split("/");
                ss.queuePending(state, parts[0], parts.slice(1).join("/"), "upsert");
            });

            /* Queue every locally-dirty document as pending UP FRONT — before
               any network call. If listing then fails (offline / down), we
               already know what still needs to sync. A successful cycle
               drops each one again as it confirms the write. */
            enc.docs.forEach(function (doc) {
                if (doc.hash == null) { return; }
                var b = ss.getBaseline(state, doc.documentType, doc.documentKey);
                var dirty = !b || b.deleted === true || b.baseHash !== doc.hash;
                if (dirty) { ss.queuePending(state, doc.documentType, doc.documentKey, "upsert"); }
            });
            persistState(state);

            return Promise.resolve(store.listDocuments({ includeTombstoned: true })).then(function (rr) {
                if (!rr || rr.ok !== true) {
                    var mapped = rr && rr.code ? rr.code : "read_failed";
                    if (mapped === "network_error") { hadNetworkError = true; throw { soft: true, code: "network_error" }; }
                    if (mapped === "schema_missing") { throw { soft: true, code: "schema_missing" }; }
                    if (mapped === "signed_out" || mapped === "forbidden") { throw { soft: true, code: "signed_out" }; }
                    throw { soft: true, code: "read_failed" };
                }

                var rows = Array.isArray(rr.documents) ? rr.documents : [];
                var remoteChain = rows.map(function (row) {
                    var deleted = !!row.deletedAt;
                    remotePayloads[idOf(row.documentType, row.documentKey)] = {
                        payload: row.payload, schemaVersion: row.schemaVersion, revision: row.revision
                    };
                    var vd = codec.validateDocument({
                        documentType: row.documentType, documentKey: row.documentKey,
                        schemaVersion: row.schemaVersion, payload: row.payload
                    });
                    var invalid = !deleted && (!vd || vd.ok !== true);
                    if (deleted || invalid) {
                        return Promise.resolve({
                            documentType: row.documentType, documentKey: row.documentKey,
                            revision: row.revision, deleted: deleted, invalid: invalid,
                            schemaVersion: row.schemaVersion, hash: null
                        });
                    }
                    return fingerprintRemotePayload(row.documentType, row.documentKey, row.schemaVersion, row.payload)
                        .then(function (h) {
                            return {
                                documentType: row.documentType, documentKey: row.documentKey,
                                revision: row.revision, deleted: false, invalid: false,
                                schemaVersion: row.schemaVersion, hash: h
                            };
                        });
                });

                return Promise.all(remoteChain).then(function (remoteList) {
                    var thePlan = planner.plan({
                        local: localList, remote: remoteList, base: state.documents
                    });
                    /* deterministic test seam: simulate a local edit that lands
                       between planning and applying (production never sets it) */
                    return fireRaceHook().then(function () {
                        return executePlan(thePlan, {
                            state: state, localById: localById,
                            remotePayloads: remotePayloads, owner: owner
                        });
                    }).then(function (execResult) {
                        hadNetworkError = hadNetworkError || execResult.hadNetworkError;
                        if (execResult.ownerChanged) {
                            setStatus(STATUS.SIGNED_OUT, "signed_out");
                            return getState();
                        }
                        return finishCycle(state, {
                            hadNetworkError: hadNetworkError,
                            localStorageError: execResult.localStorageError === true
                        });
                    });
                });
            });
        }).catch(function (err) {
            if (err && err.soft) {
                if (err.code === "network_error") {
                    persistState(state); refreshSummary(state);
                    setStatus(STATUS.OFFLINE, "network_error");
                    scheduleBackoff();
                } else if (err.code === "schema_missing") {
                    persistState(state); refreshSummary(state);
                    setStatus(STATUS.UNSUPPORTED, "schema_missing");
                } else if (err.code === "signed_out") {
                    persistState(state); refreshSummary(state);
                    setStatus(STATUS.SIGNED_OUT, "signed_out");
                } else {
                    persistState(state); refreshSummary(state);
                    setStatus(STATUS.ERROR, err.code || "error");
                    scheduleBackoff();
                }
            } else {
                persistState(state); refreshSummary(state);
                setStatus(STATUS.ERROR, "error");
            }
            return getState();
        }).then(function (result) {
            running = false;
            return result;
        });
    }

    /* ---- execute one plan ---- */

    function executePlan(thePlan, ctx) {
        /* FRESHNESS: re-read + re-encode the CURRENT local state now,
           AFTER the plan was built and every cloud fetch returned. Every
           create / update / tombstone / download is checked against this
           snapshot so a local edit that landed mid-cycle is never lost. */
        return encodeLocalWithHashes().then(function (freshEnc) {
            var freshById = {};
            if (freshEnc && freshEnc.ok) {
                freshEnc.docs.forEach(function (dc) { freshById[idOf(dc.documentType, dc.documentKey)] = dc; });
            }
            ctx.freshById = freshById;
            return executePlanInner(thePlan, ctx, freshById, freshEnc && freshEnc.ok);
        });
    }

    /* current local hash of a doc, or the sentinel "__absent__" if the
       document no longer exists locally */
    function freshHash(freshById, type, key) {
        var dc = freshById[idOf(type, key)];
        if (!dc) { return "__absent__"; }
        return dc.hash == null ? "__unhashable__" : dc.hash;
    }

    /* the hash the plan was built from (base for a remote-only change, or
       the local doc's hash at cycle start) */
    function plannedHash(ctx, type, key) {
        var dc = ctx.localById[idOf(type, key)];
        if (!dc) {
            var b = d().syncState.getBaseline(ctx.state, type, key);
            return b && b.deleted ? "__absent__" : (b && b.baseHash) || "__absent__";
        }
        return dc.hash == null ? "__unhashable__" : dc.hash;
    }

    function localChangedDuringSync(ctx, freshById, type, key) {
        return freshHash(freshById, type, key) !== plannedHash(ctx, type, key);
    }

    function executePlanInner(thePlan, ctx, freshById, freshOk) {
        var ss = d().syncState;
        var store = d().store;
        var state = ctx.state;
        var localById = ctx.localById;
        var hadNetworkError = false;

        function raceConflict(type, key, base, remote) {
            ss.addConflict(state, {
                documentType: type, documentKey: key,
                baseRevision: typeof base === "number" ? base : 0,
                remoteRevision: typeof remote === "number" ? remote : 0,
                reason: "local_changed_during_sync"
            });
            ss.queuePending(state, type, key, "upsert");
        }

        /* conflicts + ignored first — they only touch local metadata */
        thePlan.conflicts.forEach(function (c) {
            ss.addConflict(state, {
                documentType: c.documentType, documentKey: c.documentKey,
                baseRevision: c.baseRevision, remoteRevision: c.remoteRevision, reason: c.reason
            });
            ss.dropPending(state, c.documentType, c.documentKey);
        });
        thePlan.baselineUpdates.forEach(function (b) {
            ss.setBaseline(state, b.documentType, b.documentKey, {
                revision: b.revision, baseHash: b.hash, deleted: b.deleted === true
            });
            ss.dropPending(state, b.documentType, b.documentKey);
        });

        var chain = Promise.resolve();

        /* creates */
        thePlan.creates.forEach(function (c) {
            chain = chain.then(function () {
                if (ss.hasConflict(state, c.documentType, c.documentKey)) { return; }
                var doc = localById[idOf(c.documentType, c.documentKey)];
                if (!doc) { return; }
                /* the local doc changed (or vanished) since planning -> do not
                   push the stale payload; leave it pending for the next cycle */
                if (freshOk && localChangedDuringSync(ctx, freshById, c.documentType, c.documentKey)) {
                    ss.queuePending(state, c.documentType, c.documentKey, "upsert");
                    return;
                }
                return Promise.resolve(store.createDocument({
                    documentType: doc.documentType, documentKey: doc.documentKey,
                    schemaVersion: doc.schemaVersion, payload: doc.payload
                })).then(function (res) {
                    if (res && res.ok) {
                        ss.setBaseline(state, doc.documentType, doc.documentKey, {
                            revision: res.document.revision, baseHash: doc.hash, deleted: false
                        });
                        ss.dropPending(state, doc.documentType, doc.documentKey);
                        return;
                    }
                    if (res && res.code === "duplicate_document") {
                        return reconcileAfterCreateRace(state, doc);
                    }
                    if (res && res.code === "network_error") { hadNetworkError = true; }
                    ss.queuePending(state, doc.documentType, doc.documentKey, "upsert");
                    ss.bumpPendingAttempt(state, doc.documentType, doc.documentKey, res && res.code);
                });
            });
        });

        /* updates */
        thePlan.updates.forEach(function (u) {
            chain = chain.then(function () {
                if (ss.hasConflict(state, u.documentType, u.documentKey)) { return; }
                var doc = localById[idOf(u.documentType, u.documentKey)];
                if (!doc) { return; }
                /* a newer local edit landed since planning -> skip the stale
                   write, keep it pending; the next cycle uploads/reconciles the
                   current version. Baseline is never set to the stale payload. */
                if (freshOk && localChangedDuringSync(ctx, freshById, u.documentType, u.documentKey)) {
                    ss.queuePending(state, u.documentType, u.documentKey, "upsert");
                    ss.bumpPendingAttempt(state, u.documentType, u.documentKey, "local_changed_during_sync");
                    return;
                }
                return Promise.resolve(store.updateDocument({
                    documentType: doc.documentType, documentKey: doc.documentKey,
                    schemaVersion: doc.schemaVersion, payload: doc.payload
                }, u.expectedRevision)).then(function (res) {
                    if (res && res.ok) {
                        ss.setBaseline(state, doc.documentType, doc.documentKey, {
                            revision: res.document.revision, baseHash: doc.hash, deleted: false
                        });
                        ss.dropPending(state, doc.documentType, doc.documentKey);
                        return;
                    }
                    if (res && res.code === "revision_conflict") {
                        return reconcileAfterRevisionConflict(state, doc, res.currentRevision);
                    }
                    if (res && res.code === "not_found") {
                        ss.dropBaseline(state, doc.documentType, doc.documentKey);
                        ss.queuePending(state, doc.documentType, doc.documentKey, "upsert");
                        return;
                    }
                    if (res && res.code === "network_error") { hadNetworkError = true; }
                    ss.queuePending(state, doc.documentType, doc.documentKey, "upsert");
                    ss.bumpPendingAttempt(state, doc.documentType, doc.documentKey, res && res.code);
                });
            });
        });

        /* tombstones (local deletion -> cloud) */
        thePlan.tombstones.forEach(function (t) {
            chain = chain.then(function () {
                if (ss.hasConflict(state, t.documentType, t.documentKey)) { return; }
                /* the user re-created / re-populated this document after the
                   plan decided to delete it -> do NOT tombstone; re-queue it
                   as an upsert for the next cycle */
                if (freshOk && freshById[idOf(t.documentType, t.documentKey)]) {
                    ss.queuePending(state, t.documentType, t.documentKey, "upsert");
                    return;
                }
                return Promise.resolve(store.tombstoneDocument(t.documentType, t.documentKey, t.expectedRevision))
                    .then(function (res) {
                        if (res && res.ok) {
                            ss.setBaseline(state, t.documentType, t.documentKey, {
                                revision: res.document.revision, baseHash: null, deleted: true
                            });
                            ss.dropPending(state, t.documentType, t.documentKey);
                            return;
                        }
                        if (res && res.code === "revision_conflict") {
                            return Promise.resolve(store.getDocument(t.documentType, t.documentKey)).then(function (g) {
                                if (g && g.ok && g.document && g.document.deletedAt) {
                                    ss.setBaseline(state, t.documentType, t.documentKey, {
                                        revision: g.document.revision, baseHash: null, deleted: true
                                    });
                                } else {
                                    ss.addConflict(state, {
                                        documentType: t.documentType, documentKey: t.documentKey,
                                        baseRevision: t.expectedRevision,
                                        remoteRevision: (g && g.ok && g.document) ? g.document.revision : res.currentRevision,
                                        reason: "both_changed"
                                    });
                                }
                            });
                        }
                        if (res && res.code === "not_found") {
                            ss.dropBaseline(state, t.documentType, t.documentKey);
                            ss.dropPending(state, t.documentType, t.documentKey);
                            return;
                        }
                        if (res && res.code === "network_error") { hadNetworkError = true; }
                        ss.queuePending(state, t.documentType, t.documentKey, "delete");
                        ss.bumpPendingAttempt(state, t.documentType, t.documentKey, res && res.code);
                    });
            });
        });

        /* atomic remote apply for all downloads */
        var localStorageError = false;
        var ownerChanged = false;
        chain = chain.then(function () {
            var downloads = thePlan.downloads.filter(function (dl) {
                if (ss.hasConflict(state, dl.documentType, dl.documentKey)) { return false; }
                /* FRESHNESS: the plan classified this as "remote changed,
                   local unchanged". If the local doc has changed (or been
                   deleted, or been created) since the plan was built, do NOT
                   blindly apply the remote copy — turn it into a safe conflict. */
                if (freshOk) {
                    var curr = freshHash(freshById, dl.documentType, dl.documentKey);
                    var planned = plannedHash(ctx, dl.documentType, dl.documentKey);
                    if (dl.deleted === true && curr === "__absent__") {
                        return true;   /* both sides deleted -> converged, apply as delete */
                    }
                    if (curr !== planned) {
                        var rp0 = ctx.remotePayloads[idOf(dl.documentType, dl.documentKey)];
                        raceConflict(dl.documentType, dl.documentKey, 0, rp0 ? rp0.revision : 0);
                        return false;
                    }
                }
                return true;
            });
            if (!downloads.length) { return; }
            return applyRemoteBatch(state, downloads, ctx).then(function (r) {
                if (r && r.localStorageError) { localStorageError = true; }
                if (r && r.ownerChanged) { ownerChanged = true; }
            });
        });

        return chain.then(function () {
            return { hadNetworkError: hadNetworkError, localStorageError: localStorageError, ownerChanged: ownerChanged };
        });
    }

    function reconcileAfterCreateRace(state, doc) {
        var ss = d().syncState;
        var store = d().store;
        return Promise.resolve(store.getDocument(doc.documentType, doc.documentKey)).then(function (g) {
            if (!g || g.ok !== true || !g.document) {
                ss.queuePending(state, doc.documentType, doc.documentKey, "upsert");
                return;
            }
            return fingerprintRemotePayload(doc.documentType, doc.documentKey, g.document.schemaVersion, g.document.payload)
                .then(function (remoteHash) {
                    if (remoteHash != null && remoteHash === doc.hash) {
                        ss.setBaseline(state, doc.documentType, doc.documentKey, {
                            revision: g.document.revision, baseHash: doc.hash, deleted: false
                        });
                        ss.dropPending(state, doc.documentType, doc.documentKey);
                    } else {
                        ss.addConflict(state, {
                            documentType: doc.documentType, documentKey: doc.documentKey,
                            baseRevision: 0, remoteRevision: g.document.revision,
                            reason: "both_changed_no_base"
                        });
                        ss.dropPending(state, doc.documentType, doc.documentKey);
                    }
                });
        });
    }

    function reconcileAfterRevisionConflict(state, doc, currentRevision) {
        var ss = d().syncState;
        var store = d().store;
        return Promise.resolve(store.getDocument(doc.documentType, doc.documentKey)).then(function (g) {
            if (!g || g.ok !== true || !g.document) {
                ss.addConflict(state, {
                    documentType: doc.documentType, documentKey: doc.documentKey,
                    baseRevision: 0, remoteRevision: currentRevision || 0, reason: "revision_conflict"
                });
                ss.dropPending(state, doc.documentType, doc.documentKey);
                return;
            }
            if (g.document.deletedAt) {
                ss.addConflict(state, {
                    documentType: doc.documentType, documentKey: doc.documentKey,
                    baseRevision: 0, remoteRevision: g.document.revision, reason: "both_changed"
                });
                ss.dropPending(state, doc.documentType, doc.documentKey);
                return;
            }
            return fingerprintRemotePayload(doc.documentType, doc.documentKey, g.document.schemaVersion, g.document.payload)
                .then(function (remoteHash) {
                    if (remoteHash != null && remoteHash === doc.hash) {
                        ss.setBaseline(state, doc.documentType, doc.documentKey, {
                            revision: g.document.revision, baseHash: doc.hash, deleted: false
                        });
                        ss.dropPending(state, doc.documentType, doc.documentKey);
                    } else {
                        ss.addConflict(state, {
                            documentType: doc.documentType, documentKey: doc.documentKey,
                            baseRevision: 0, remoteRevision: g.document.revision, reason: "revision_conflict"
                        });
                        ss.dropPending(state, doc.documentType, doc.documentKey);
                    }
                });
        });
    }

    /* apply a batch of safe remote downloads to local state in ONE save */
    function applyRemoteBatch(state, downloads, ctx) {
        var ss = d().syncState;
        var codec = d().codec;
        var storage = d().storage;

        /* FINAL FRESHNESS CHECK — re-encode the current local state one more
           time, immediately before building the apply batch. Anything that
           changed locally since the plan (or the outer filter) becomes a
           conflict instead of an overwrite. */
        return encodeLocalWithHashes().then(function (freshEnc) {
            var freshById = {};
            if (freshEnc && freshEnc.ok) {
                freshEnc.docs.forEach(function (dc) { freshById[idOf(dc.documentType, dc.documentKey)] = dc; });
            }
            var freshOk = freshEnc && freshEnc.ok;

            var localData = loadLocal();
            if (!localData) { return { localStorageError: true }; }

            var items = [];
            downloads.forEach(function (dl) {
                var id = idOf(dl.documentType, dl.documentKey);
                if (freshOk) {
                    var curr = freshHash(freshById, dl.documentType, dl.documentKey);
                    var planned = plannedHash(ctx, dl.documentType, dl.documentKey);
                    if (!(dl.deleted === true && curr === "__absent__") && curr !== planned) {
                        var rpX = ctx.remotePayloads[id];
                        ss.addConflict(state, {
                            documentType: dl.documentType, documentKey: dl.documentKey,
                            baseRevision: 0, remoteRevision: rpX ? rpX.revision : 0,
                            reason: "local_changed_during_sync"
                        });
                        ss.queuePending(state, dl.documentType, dl.documentKey, "upsert");
                        return;
                    }
                }
                if (dl.deleted === true) {
                    items.push({ documentType: dl.documentType, documentKey: dl.documentKey, deleted: true });
                    return;
                }
                var rp = ctx.remotePayloads[id];
                if (!rp) { return; }
                var vd = codec.validateDocument({
                    documentType: dl.documentType, documentKey: dl.documentKey,
                    schemaVersion: rp.schemaVersion, payload: rp.payload
                });
                if (!vd || vd.ok !== true) {
                    ss.addConflict(state, {
                        documentType: dl.documentType, documentKey: dl.documentKey,
                        baseRevision: 0, remoteRevision: rp.revision || 0, reason: "invalid_remote_document"
                    });
                    return;
                }
                items.push({
                    documentType: dl.documentType, documentKey: dl.documentKey,
                    schemaVersion: rp.schemaVersion, payload: rp.payload
                });
            });
            if (!items.length) { return {}; }

            return applyRemoteBatchFinal(state, items, ctx, localData);
        });
    }

    function applyRemoteBatchFinal(state, items, ctx, localData) {
        var ss = d().syncState;
        var codec = d().codec;
        var storage = d().storage;

        var applied = codec.applyDocuments(localData, items);
        if (!applied || applied.ok !== true) { return Promise.resolve({ localStorageError: true }); }

        (applied.skipped || []).forEach(function (sk) {
            var parts = String(sk.id).split("/");
            ss.addConflict(state, {
                documentType: parts[0], documentKey: parts.slice(1).join("/"),
                baseRevision: 0, remoteRevision: 0,
                reason: sk.code === "not_deletable" ? "unsupported_remote_delete" : "invalid_remote_document"
            });
        });

        /* owner must not have changed underneath us */
        if (ownerId() !== ctx.owner) { return Promise.resolve({ ownerChanged: true }); }

        applyingRemote = true;
        var saved;
        try { saved = storage.save(applied.state); }
        catch (e) { saved = false; }
        applyingRemote = false;

        if (saved === false) {
            /* local data untouched -> do NOT re-baseline the downloads */
            return Promise.resolve({ localStorageError: true });
        }

        /* re-encode the now-current local state to baseline each applied doc
           against the NORMALIZED local hash */
        return encodeLocalWithHashes().then(function (reEnc) {
            var byId = {};
            if (reEnc.ok) {
                reEnc.docs.forEach(function (doc) { byId[idOf(doc.documentType, doc.documentKey)] = doc; });
            }
            items.forEach(function (it) {
                var id = idOf(it.documentType, it.documentKey);
                var rp = ctx.remotePayloads[id];
                var revision = rp ? rp.revision : 0;
                if (it.deleted === true) {
                    ss.setBaseline(state, it.documentType, it.documentKey, {
                        revision: revision, baseHash: null, deleted: true
                    });
                } else {
                    var localDoc = byId[id];
                    ss.setBaseline(state, it.documentType, it.documentKey, {
                        revision: revision,
                        baseHash: localDoc ? localDoc.hash : null,
                        deleted: false
                    });
                }
                ss.dropPending(state, it.documentType, it.documentKey);
            });
            appRefresh();
            return {};
        });
    }

    function appRefresh() {
        var app = d().app;
        try { if (app && typeof app.refresh === "function") { app.refresh(); } }
        catch (e) { /* ignore */ }
    }

    function finishCycle(state, info) {
        var ss = d().syncState;
        var conflicts = (state.conflicts || []).length;
        var pending = (state.pending || []).length;

        var localStorageError = info.localStorageError === true;

        if (!info.hadNetworkError && !localStorageError && conflicts === 0 && pending === 0) {
            ss.touchSuccess(state);
            backoffMs = BACKOFF_BASE_MS;
        }
        persistState(state);
        refreshSummary(state);

        if (localStorageError) { setStatus(STATUS.ERROR, "local_storage_error"); scheduleBackoff(); }
        else if (conflicts > 0) { setStatus(STATUS.CONFLICTS); }
        else if (info.hadNetworkError) { setStatus(STATUS.OFFLINE, "network_error"); scheduleBackoff(); }
        else if (pending > 0) { setStatus(STATUS.PENDING); scheduleBackoff(); }
        else { setStatus(STATUS.IDLE); }

        return getState();
    }


    /* ============================================================
       SCHEDULING
       ============================================================ */

    function scheduleSync(delayMs) {
        if (preflight()) { return; }
        if (debounceTimer) { try { clearTimeout(debounceTimer); } catch (e) {} }
        debounceTimer = setTimeout(function () {
            debounceTimer = null;
            syncNow();
        }, typeof delayMs === "number" ? delayMs : LOCAL_SAVE_DEBOUNCE_MS);
    }

    function scheduleBackoff() {
        if (backoffTimer) { return; }
        var wait = Math.min(backoffMs, BACKOFF_MAX_MS);
        backoffTimer = setTimeout(function () {
            backoffTimer = null;
            backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
            if (!preflight() && d().isOnline()) { syncNow(); }
        }, wait);
    }

    function clearTimers() {
        [debounceTimer, backoffTimer].forEach(function (t) { if (t) { try { clearTimeout(t); } catch (e) {} } });
        debounceTimer = null;
        backoffTimer = null;
        backoffMs = BACKOFF_BASE_MS;
    }

    function notifyLocalSave(detail) {
        if (applyingRemote) { return; }
        if (detail && detail.source && detail.source !== "local") { return; }
        if (preflight()) { return; }
        scheduleSync(LOCAL_SAVE_DEBOUNCE_MS);
    }


    /* ============================================================
       SECOND-DEVICE BOOTSTRAP
       ============================================================ */

    function bootstrapReleaseState() {
        return { release: !(bootstrapStatus === BOOTSTRAP.CHECKING || bootstrapStatus === BOOTSTRAP.NEEDS_DECISION) };
    }

    function bootstrapGuard(authSnapshot) {
        try {
            var rel = d().release;
            if (!rel || rel.isEnabled() !== true) { return { release: true }; }
            if (!authSnapshot || authSnapshot.configured !== true || authSnapshot.status !== "signed_in") {
                return { release: true };
            }
            return bootstrapReleaseState();
        } catch (e) {
            return { release: true };   /* a bootstrap fault never traps a verified owner */
        }
    }

    function setBootstrap(next) {
        bootstrapStatus = next;
        notify();
        /* nudge auth-ui to re-evaluate the gate (guard result may have
           changed). auth-ui fails open if no sync-ui is presenting. */
        try {
            var ui = global.MWalletAuthUI;
            if (ui && typeof ui.renderState === "function") { ui.renderState(); }
        } catch (e) { /* ignore */ }
    }

    function bootstrapLocalIsMeaningful() {
        var mig = d().migration;
        try {
            if (mig && typeof mig.detectMeaningfulLocalData === "function") {
                var det = mig.detectMeaningfulLocalData();
                return !!(det && det.meaningful === true);
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    function runBootstrap() {
        var rel = d().release;
        if (!rel || rel.isEnabled() !== true) { setBootstrap(BOOTSTRAP.DISABLED); return Promise.resolve({ status: BOOTSTRAP.DISABLED }); }

        var s = authSnap();
        if (!s || s.configured !== true || s.status !== "signed_in" || s.recoveryMode === true || !ownerId() || !ownershipOk()) {
            setBootstrap(BOOTSTRAP.SKIP);
            return Promise.resolve({ status: BOOTSTRAP.SKIP });
        }

        var owner = ownerId();
        var ss = d().syncState;
        var state = loadState(owner);

        if (state.bootstrapStatus === "complete" || state.bootstrapStatus === "deferred") {
            setBootstrap(state.bootstrapStatus === "deferred" ? BOOTSTRAP.DEFERRED : BOOTSTRAP.EMPTY);
            scheduleSync(ONLINE_RESYNC_DELAY_MS);
            return Promise.resolve({ status: "already" });
        }

        var mig = d().migration;
        var detection = null;
        try { detection = mig && typeof mig.detectMeaningfulLocalData === "function" ? mig.detectMeaningfulLocalData() : null; }
        catch (e) { detection = null; }

        if (detection && detection.meaningful === true) {
            /* first device with a real wallet — never held; upload happens async */
            ss.setBootstrapStatus(state, "complete");
            persistState(state);
            setBootstrap(BOOTSTRAP.READY);
            scheduleSync(ONLINE_RESYNC_DELAY_MS);
            return Promise.resolve({ status: BOOTSTRAP.READY });
        }

        /* empty / default local — could be a fresh second device */
        if (!d().isOnline()) {
            bootstrapContext = { owner: owner };
            setBootstrap(BOOTSTRAP.NEEDS_DECISION);
            return Promise.resolve({ status: BOOTSTRAP.NEEDS_DECISION, code: "offline" });
        }

        setBootstrap(BOOTSTRAP.CHECKING);
        var store = d().store;
        return Promise.resolve(store.listDocuments({ includeTombstoned: false })).then(function (rr) {
            if (!rr || rr.ok !== true) {
                bootstrapContext = { owner: owner };
                setBootstrap(BOOTSTRAP.NEEDS_DECISION);
                return { status: BOOTSTRAP.NEEDS_DECISION, code: rr && rr.code ? rr.code : "error" };
            }
            var rows = Array.isArray(rr.documents) ? rr.documents : [];
            /* deterministic test seam: a local edit landing during the cloud check */
            return fireRaceHook().then(function () {
                /* FRESHNESS: the workspace was empty when we started the cloud
                   check. If the user has since created meaningful data, DO NOT
                   overwrite it — release and let a normal sync reconcile local
                   + cloud with the no-baseline rules (identical -> baseline,
                   different same-identity -> conflict). */
                if (bootstrapLocalIsMeaningful()) {
                    ss.setBootstrapStatus(state, "deferred");
                    persistState(state);
                    setBootstrap(BOOTSTRAP.READY);
                    scheduleSync(ONLINE_RESYNC_DELAY_MS);
                    return { status: "reconcile", code: "local_changed_during_bootstrap" };
                }
                if (!rows.length) {
                    ss.setBootstrapStatus(state, "complete");
                    persistState(state);
                    setBootstrap(BOOTSTRAP.EMPTY);
                    return { status: BOOTSTRAP.EMPTY };
                }
                return restoreFromCloud(state, rows, owner);
            });
        }).catch(function () {
            bootstrapContext = { owner: owner };
            setBootstrap(BOOTSTRAP.NEEDS_DECISION);
            return { status: BOOTSTRAP.NEEDS_DECISION, code: "error" };
        });
    }

    function restoreFromCloud(state, rows, owner) {
        var ss = d().syncState;
        var codec = d().codec;
        var storage = d().storage;

        /* FRESHNESS: never bulk-overwrite a workspace that became meaningful
           since the cloud check started — reconcile instead. */
        if (bootstrapLocalIsMeaningful()) {
            ss.setBootstrapStatus(state, "deferred");
            persistState(state);
            setBootstrap(BOOTSTRAP.READY);
            scheduleSync(ONLINE_RESYNC_DELAY_MS);
            return Promise.resolve({ status: "reconcile", code: "local_changed_during_bootstrap" });
        }

        var localData = loadLocal();
        if (!localData) { setBootstrap(BOOTSTRAP.NEEDS_DECISION); return Promise.resolve({ status: BOOTSTRAP.NEEDS_DECISION, code: "local_storage_error" }); }

        var items = [];
        var valid = true;
        rows.forEach(function (row) {
            var vd = codec.validateDocument({
                documentType: row.documentType, documentKey: row.documentKey,
                schemaVersion: row.schemaVersion, payload: row.payload
            });
            if (!vd || vd.ok !== true) { valid = false; return; }
            items.push({
                documentType: row.documentType, documentKey: row.documentKey,
                schemaVersion: row.schemaVersion, payload: row.payload, _revision: row.revision
            });
        });
        if (!valid || !items.length) {
            bootstrapContext = { owner: owner };
            setBootstrap(BOOTSTRAP.NEEDS_DECISION);
            return Promise.resolve({ status: BOOTSTRAP.NEEDS_DECISION, code: "invalid_remote_document" });
        }

        var applied = codec.applyDocuments(localData, items.map(function (it) {
            return { documentType: it.documentType, documentKey: it.documentKey, schemaVersion: it.schemaVersion, payload: it.payload };
        }));
        if (!applied || applied.ok !== true) {
            bootstrapContext = { owner: owner };
            setBootstrap(BOOTSTRAP.NEEDS_DECISION);
            return Promise.resolve({ status: BOOTSTRAP.NEEDS_DECISION, code: "apply_failed" });
        }

        if (ownerId() !== owner) { setBootstrap(BOOTSTRAP.SKIP); return Promise.resolve({ status: BOOTSTRAP.SKIP }); }

        applyingRemote = true;
        var saved;
        try { saved = storage.save(applied.state); } catch (e) { saved = false; }
        applyingRemote = false;

        if (saved === false) {
            bootstrapContext = { owner: owner };
            setBootstrap(BOOTSTRAP.NEEDS_DECISION);
            return Promise.resolve({ status: BOOTSTRAP.NEEDS_DECISION, code: "local_storage_error" });
        }

        return encodeLocalWithHashes().then(function (reEnc) {
            var byId = {};
            if (reEnc.ok) { reEnc.docs.forEach(function (doc) { byId[idOf(doc.documentType, doc.documentKey)] = doc; }); }
            items.forEach(function (it) {
                var localDoc = byId[idOf(it.documentType, it.documentKey)];
                ss.setBaseline(state, it.documentType, it.documentKey, {
                    revision: it._revision, baseHash: localDoc ? localDoc.hash : null, deleted: false
                });
            });
            ss.setBootstrapStatus(state, "complete");
            persistState(state);
            refreshSummary(state);

            /* let BP5 re-decide -> it will see meaningful data -> "existing" */
            try {
                var fr = d().firstRun;
                if (fr && typeof fr._resolve === "function") { fr._resolve(authSnap()); }
            } catch (e) { /* ignore */ }

            appRefresh();
            setBootstrap(BOOTSTRAP.RESTORED);
            return { status: BOOTSTRAP.RESTORED, restored: items.length };
        });
    }

    function bootstrapContinueOffline() {
        var owner = (bootstrapContext && bootstrapContext.owner) || ownerId();
        if (!owner) { setBootstrap(BOOTSTRAP.SKIP); return Promise.resolve({ status: BOOTSTRAP.SKIP }); }
        var ss = d().syncState;
        var state = loadState(owner);
        ss.setBootstrapStatus(state, "deferred");
        persistState(state);
        bootstrapContext = null;
        setBootstrap(BOOTSTRAP.DEFERRED);
        return Promise.resolve({ status: BOOTSTRAP.DEFERRED });
    }

    function bootstrapRetry() {
        bootstrapContext = null;
        return runBootstrap();
    }


    /* ============================================================
       CONFLICT RESOLUTION
       ============================================================ */

    function describeDocument(type, key) {
        if (type === "month") {
            var m = /^(\d{4})-(\d{2})$/.exec(String(key));
            if (m) {
                var months = ["January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"];
                var mi = parseInt(m[2], 10) - 1;
                if (mi >= 0 && mi < 12) { return months[mi] + " " + m[1] + " budget"; }
            }
            return "Monthly budget";
        }
        var labels = {
            accounts: "Accounts", settings: "Settings", categories: "Categories",
            "recurring-income": "Recurring income", "recurring-expenses": "Recurring expenses",
            savings: "Savings goals", cash: "M-Cash"
        };
        return labels[type] || "Financial data";
    }

    function getConflicts() {
        var ss = d().syncState;
        var owner = ownerId();
        if (!owner) { return []; }
        var state = loadState(owner);
        return ss.getConflicts(state).map(function (c) {
            return {
                documentType: c.documentType,
                documentKey: c.documentKey,
                title: describeDocument(c.documentType, c.documentKey),
                reason: c.reason,
                baseRevision: c.baseRevision,
                remoteRevision: c.remoteRevision
            };
        });
    }

    /* choice: "keep-local" | "use-cloud" */
    function resolveConflict(documentType, documentKey, choice) {
        var code = preflight();
        if (code) { return Promise.resolve({ ok: false, code: mapPreflight(code) }); }

        var ss = d().syncState;
        var store = d().store;
        var codec = d().codec;
        var storage = d().storage;
        var owner = ownerId();
        var state = loadState(owner);

        if (!ss.hasConflict(state, documentType, documentKey)) {
            return Promise.resolve({ ok: false, code: "not_found" });
        }

        /* always re-fetch the CURRENT remote before acting on a stale screen */
        return Promise.resolve(store.getDocument(documentType, documentKey)).then(function (g) {
            var remote = (g && g.ok && g.document) ? g.document : null;
            var remoteRevision = remote ? remote.revision : null;
            var remoteDeleted = remote ? !!remote.deletedAt : true;

            if (choice === "keep-local") {
                return encodeLocalWithHashes().then(function (enc) {
                    if (!enc.ok) { return { ok: false, code: "invalid_document" }; }
                    var doc = null;
                    enc.docs.forEach(function (x) {
                        if (x.documentType === documentType && x.documentKey === documentKey) { doc = x; }
                    });
                    if (!doc) {
                        /* local deleted this doc */
                        if (remote == null) {
                            ss.dropConflict(state, documentType, documentKey);
                            ss.dropBaseline(state, documentType, documentKey);
                            persistState(state); refreshSummary(state); afterResolve(state);
                            return { ok: true };
                        }
                        return Promise.resolve(store.tombstoneDocument(documentType, documentKey, remoteRevision)).then(function (res) {
                            if (res && res.ok) {
                                ss.dropConflict(state, documentType, documentKey);
                                ss.setBaseline(state, documentType, documentKey, { revision: res.document.revision, baseHash: null, deleted: true });
                                persistState(state); refreshSummary(state); afterResolve(state);
                                return { ok: true };
                            }
                            return { ok: false, code: res && res.code === "revision_conflict" ? "revision_conflict" : "write_failed" };
                        });
                    }
                    if (remote == null) {
                        return Promise.resolve(store.createDocument({
                            documentType: doc.documentType, documentKey: doc.documentKey,
                            schemaVersion: doc.schemaVersion, payload: doc.payload
                        })).then(function (res) {
                            if (res && res.ok) {
                                ss.dropConflict(state, documentType, documentKey);
                                ss.setBaseline(state, documentType, documentKey, { revision: res.document.revision, baseHash: doc.hash, deleted: false });
                                persistState(state); refreshSummary(state); afterResolve(state);
                                return { ok: true };
                            }
                            return { ok: false, code: "write_failed" };
                        });
                    }
                    return Promise.resolve(store.updateDocument({
                        documentType: doc.documentType, documentKey: doc.documentKey,
                        schemaVersion: doc.schemaVersion, payload: doc.payload
                    }, remoteRevision)).then(function (res) {
                        if (res && res.ok) {
                            ss.dropConflict(state, documentType, documentKey);
                            ss.setBaseline(state, documentType, documentKey, { revision: res.document.revision, baseHash: doc.hash, deleted: false });
                            persistState(state); refreshSummary(state); afterResolve(state);
                            return { ok: true };
                        }
                        /* remote moved again -> stay a conflict */
                        return { ok: false, code: "revision_conflict" };
                    });
                });
            }

            if (choice === "use-cloud") {
                var localData = loadLocal();
                if (!localData) { return { ok: false, code: "local_storage_error" }; }
                var result;
                if (remote == null || remoteDeleted) {
                    result = codec.removeDocument(localData, documentType, documentKey);
                    if (!result.ok && result.code === "not_deletable") {
                        return { ok: false, code: "unsupported_remote_delete" };
                    }
                } else {
                    var vd = codec.validateDocument({
                        documentType: documentType, documentKey: documentKey,
                        schemaVersion: remote.schemaVersion, payload: remote.payload
                    });
                    if (!vd || vd.ok !== true) { return { ok: false, code: "invalid_remote_document" }; }
                    result = codec.applyDocument(localData, {
                        documentType: documentType, documentKey: documentKey,
                        schemaVersion: remote.schemaVersion, payload: remote.payload
                    });
                }
                if (!result || result.ok !== true) { return { ok: false, code: "apply_failed" }; }

                if (ownerId() !== owner) { return { ok: false, code: "signed_out" }; }

                applyingRemote = true;
                var saved;
                try { saved = storage.save(result.state); } catch (e) { saved = false; }
                applyingRemote = false;
                if (saved === false) { return { ok: false, code: "local_storage_error" }; }

                return encodeLocalWithHashes().then(function (reEnc) {
                    var newHash = null;
                    if (reEnc.ok) {
                        reEnc.docs.forEach(function (x) {
                            if (x.documentType === documentType && x.documentKey === documentKey) { newHash = x.hash; }
                        });
                    }
                    ss.dropConflict(state, documentType, documentKey);
                    ss.setBaseline(state, documentType, documentKey, {
                        revision: remoteRevision || 0,
                        baseHash: (remote == null || remoteDeleted) ? null : newHash,
                        deleted: (remote == null || remoteDeleted)
                    });
                    persistState(state); refreshSummary(state);
                    appRefresh();
                    afterResolve(state);
                    return { ok: true };
                });
            }

            return { ok: false, code: "invalid_choice" };
        });
    }

    function afterResolve(state) {
        var conflicts = (state.conflicts || []).length;
        var pending = (state.pending || []).length;
        if (conflicts > 0) { setStatus(STATUS.CONFLICTS); }
        else if (pending > 0) { setStatus(STATUS.PENDING); scheduleSync(ONLINE_RESYNC_DELAY_MS); }
        else { setStatus(STATUS.IDLE); scheduleSync(ONLINE_RESYNC_DELAY_MS); }
    }


    /* ============================================================
       PUBLIC STATE / DIAGNOSTICS
       ============================================================ */

    function releaseEnabled() {
        var rel = d().release;
        try { return !!(rel && rel.isEnabled && rel.isEnabled()); } catch (e) { return false; }
    }

    function getState() {
        return {
            releaseEnabled: releaseEnabled(),
            status: status,
            bootstrapStatus: bootstrapStatus,
            online: d().isOnline(),
            pendingCount: lastSummary.pendingCount || 0,
            conflictCount: lastSummary.conflictCount || 0,
            lastAttemptAt: lastSummary.lastAttemptAt || null,
            lastSuccessAt: lastSummary.lastSuccessAt || null,
            lastErrorCode: lastErrorCode
        };
    }

    /* NO owner id, NO payload, NO token, NO raw cloud error. */
    function diagnostics() {
        return {
            releaseEnabled: releaseEnabled(),
            releasePhase: (function () { try { return d().release.getState().verificationPhase; } catch (e) { return null; } })(),
            status: status,
            bootstrapStatus: bootstrapStatus,
            online: d().isOnline(),
            initialized: initialized,
            running: running,
            pendingCount: lastSummary.pendingCount || 0,
            conflictCount: lastSummary.conflictCount || 0,
            documentCount: lastSummary.documentCount || 0,
            lastAttemptAt: lastSummary.lastAttemptAt || null,
            lastSuccessAt: lastSummary.lastSuccessAt || null,
            lastErrorCode: lastErrorCode,
            syncStateKey: (function () { try { return d().syncState.KEY; } catch (e) { return null; } })()
        };
    }

    function subscribe(fn) {
        if (typeof fn !== "function") { return function () {}; }
        subscribers.push(fn);
        try { fn(getState()); } catch (e) { /* ignore */ }
        return function () {
            var i = subscribers.indexOf(fn);
            if (i !== -1) { subscribers.splice(i, 1); }
        };
    }


    /* ============================================================
       LIFECYCLE
       ============================================================ */

    var authUnsub = null;
    var lastAuthOwner = null;

    function onAuthChange(snap) {
        var code = preflight();
        if (code) {
            /* signed out / recovery / owner mismatch / disabled */
            clearTimers();
            currentOwner = null;
            lastSummary = { pendingCount: 0, conflictCount: 0, lastAttemptAt: null, lastSuccessAt: null, bootstrapStatus: "unknown" };
            if (code === "disabled") { setBootstrap(BOOTSTRAP.DISABLED); setStatus(STATUS.DISABLED); }
            else { setBootstrap(BOOTSTRAP.SKIP); setStatus(mapPreflight(code), code); }
            lastAuthOwner = ownerId();
            return;
        }
        var owner = ownerId();
        if (owner !== lastAuthOwner) {
            lastAuthOwner = owner;
            bootstrapStatus = BOOTSTRAP.IDLE;
            runBootstrap();
        } else if (bootstrapStatus === BOOTSTRAP.READY || bootstrapStatus === BOOTSTRAP.EMPTY ||
                   bootstrapStatus === BOOTSTRAP.RESTORED || bootstrapStatus === BOOTSTRAP.DEFERRED) {
            scheduleSync(ONLINE_RESYNC_DELAY_MS);
        } else if (bootstrapStatus === BOOTSTRAP.IDLE) {
            runBootstrap();
        }
    }

    function onOnline() { if (!preflight()) { scheduleSync(ONLINE_RESYNC_DELAY_MS); } }
    function onOffline() { if (!preflight()) { refreshOfflineStatus(); } }

    function refreshOfflineStatus() {
        var owner = ownerId();
        if (!owner) { return; }
        var state = loadState(owner);
        refreshSummary(state);
        setStatus(STATUS.OFFLINE);
    }

    function onFinancialSaved(evt) {
        notifyLocalSave(evt && evt.detail);
    }

    function initialize() {
        if (initialized) { return Promise.resolve(getState()); }
        initialized = true;

        if (!releaseEnabled()) { setStatus(STATUS.DISABLED); setBootstrap(BOOTSTRAP.DISABLED); }

        try {
            if (typeof document !== "undefined" && document.addEventListener) {
                document.addEventListener("mwallet:financial-saved", onFinancialSaved);
            }
            if (typeof window !== "undefined" && window.addEventListener) {
                window.addEventListener("online", onOnline);
                window.addEventListener("offline", onOffline);
            }
        } catch (e) { /* ignore */ }

        try {
            var a = d().auth;
            if (a && typeof a.subscribe === "function") {
                authUnsub = a.subscribe(onAuthChange);
            }
        } catch (e) { /* ignore */ }

        /* also re-run the bootstrap decision when BP4 ownership settles */
        try {
            var m = d().migration;
            if (m && typeof m.subscribe === "function") {
                m.subscribe(function () { if (!preflight() && bootstrapStatus === BOOTSTRAP.IDLE) { runBootstrap(); } });
            }
        } catch (e) { /* ignore */ }

        return Promise.resolve(getState());
    }

    function teardownForTest() {
        clearTimers();
        subscribers = [];
        initialized = false;
        running = false;
        rerunRequested = false;
        applyingRemote = false;
        currentOwner = null;
        lastAuthOwner = null;
        bootstrapStatus = BOOTSTRAP.IDLE;
        status = STATUS.DISABLED;
        lastErrorCode = null;
        lastSummary = { pendingCount: 0, conflictCount: 0, lastAttemptAt: null, lastSuccessAt: null, bootstrapStatus: "unknown" };
        bootstrapContext = null;
        testRaceHook = null;

        try { if (authUnsub) { authUnsub(); } } catch (e) {}
        authUnsub = null;
    }


    global.MWalletSync = {
        STATUS: STATUS,
        BOOTSTRAP: BOOTSTRAP,

        initialize: initialize,
        getState: getState,
        diagnostics: diagnostics,
        subscribe: subscribe,

        syncNow: syncNow,
        notifyLocalSave: notifyLocalSave,

        runBootstrap: runBootstrap,
        bootstrapGuard: bootstrapGuard,
        bootstrapContinueOffline: bootstrapContinueOffline,
        bootstrapRetry: bootstrapRetry,

        getConflicts: getConflicts,
        resolveConflict: resolveConflict,
        describeDocument: describeDocument,

        /* test-only */
        configureForTest: configureForTest,
        _setRaceHook: function (fn) { testRaceHook = (typeof fn === "function") ? fn : null; },
        _teardownForTest: teardownForTest
    };

    /* register the fail-open bootstrap guard with auth-ui as soon as
       both modules exist (script load order puts auth-ui first) */
    (function registerGuard() {
        try {
            if (global.MWalletAuthUI && typeof global.MWalletAuthUI.setBootstrapGuard === "function") {
                global.MWalletAuthUI.setBootstrapGuard(bootstrapGuard);
            }
        } catch (e) { /* auth-ui absent -> sync is optional, app not blocked */ }
    })();

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { initialize(); });
        } else {
            initialize();
        }
    }

})(typeof window !== "undefined" ? window : this);
