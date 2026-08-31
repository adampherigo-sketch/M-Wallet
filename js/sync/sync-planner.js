"use strict";

/* =========================================================
   M-WALLET — SYNC RECONCILIATION PLANNER   (BP8)

       window.MWalletSyncPlanner

   A PURE function. Given the current LOCAL document set, the
   current CLOUD document set, and the last known synchronized
   BASELINE, it decides — per document, independently — what
   should happen next.

   It NEVER:
     - calls Supabase / the cloud store
     - calls localStorage or storage.save
     - touches the DOM
     - mutates its inputs
     - guesses "newer" from a timestamp
     - merges financial arrays

   Conflict philosophy (money app): silent data loss is worse
   than asking the user to choose. Same-document concurrent
   change with no shared baseline => CONFLICT. Independent
   documents keep syncing.

   ---- input ----
   {
     local:  [ { documentType, documentKey, hash } ],
     remote: [ { documentType, documentKey, revision, hash, deleted,
                 schemaVersion? } ],
     base:   { "type/key": { revision, baseHash, deleted } }
   }

   ---- output ----
   {
     downloads:       [ { documentType, documentKey, deleted } ],
     creates:         [ { documentType, documentKey } ],
     updates:         [ { documentType, documentKey, expectedRevision } ],
     tombstones:      [ { documentType, documentKey, expectedRevision } ],
     baselineUpdates: [ { documentType, documentKey, revision, hash, deleted } ],
     conflicts:       [ { documentType, documentKey, baseRevision,
                          remoteRevision, reason } ],
     ignored:         [ { documentType, documentKey, reason } ]
   }
   ========================================================= */

(function (global) {

    var FALLBACK_KNOWN_TYPES = [
        "accounts", "settings", "categories", "recurring-income",
        "recurring-expenses", "savings", "cash", "month"
    ];
    var FALLBACK_DELETABLE_TYPES = ["month"];
    var FALLBACK_MAX_SCHEMA = 5;

    function codec() {
        try { return global.MWalletCloudFinancialCodec || null; } catch (e) { return null; }
    }

    function resolveOptions(options) {
        options = options || {};
        var c = codec();
        return {
            knownTypes: Array.isArray(options.knownTypes) ? options.knownTypes
                : (c && Array.isArray(c.ALL_TYPES) ? c.ALL_TYPES : FALLBACK_KNOWN_TYPES),
            deletableTypes: Array.isArray(options.deletableTypes) ? options.deletableTypes
                : (c && Array.isArray(c.DELETABLE_TYPES) ? c.DELETABLE_TYPES : FALLBACK_DELETABLE_TYPES),
            maxSchemaVersion: typeof options.maxSchemaVersion === "number" ? options.maxSchemaVersion
                : (c && typeof c.DEFAULT_SCHEMA_VERSION === "number" ? c.DEFAULT_SCHEMA_VERSION : FALLBACK_MAX_SCHEMA)
        };
    }

    function idOf(type, key) { return String(type) + "/" + String(key); }

    function indexByeId(list) {
        var map = {};
        (Array.isArray(list) ? list : []).forEach(function (entry) {
            if (!entry || typeof entry !== "object") { return; }
            map[idOf(entry.documentType, entry.documentKey)] = entry;
        });
        return map;
    }

    function emptyPlan() {
        return {
            downloads: [], creates: [], updates: [], tombstones: [],
            baselineUpdates: [], conflicts: [], ignored: []
        };
    }

    function plan(input, options) {
        var opts = resolveOptions(options);
        var out = emptyPlan();

        input = input || {};
        var localMap = indexByeId(input.local);
        var remoteMap = indexByeId(input.remote);
        var base = (input.base && typeof input.base === "object") ? input.base : {};

        /* stable, deterministic id ordering */
        var ids = {};
        Object.keys(localMap).forEach(function (id) { ids[id] = true; });
        Object.keys(remoteMap).forEach(function (id) { ids[id] = true; });
        Object.keys(base).forEach(function (id) { ids[id] = true; });
        var allIds = Object.keys(ids).sort();

        allIds.forEach(function (id) {
            var L = localMap[id] || null;
            var R = remoteMap[id] || null;
            var B = (base[id] && typeof base[id] === "object") ? base[id] : null;

            var type = (L && L.documentType) || (R && R.documentType) || id.split("/")[0];
            var key = (L && L.documentKey) || (R && R.documentKey) || id.split("/").slice(1).join("/");

            var deletable = opts.deletableTypes.indexOf(type) !== -1;

            /* ---- guard: a cloud document this build cannot handle ---- */
            if (R) {
                if (opts.knownTypes.indexOf(type) === -1) {
                    out.ignored.push({ documentType: type, documentKey: key, reason: "unknown_type" });
                    return;
                }
                if (typeof R.schemaVersion === "number" && R.schemaVersion > opts.maxSchemaVersion) {
                    out.ignored.push({ documentType: type, documentKey: key, reason: "unsupported_schema" });
                    return;
                }
                if (R.invalid === true) {
                    out.ignored.push({ documentType: type, documentKey: key, reason: "invalid_remote_document" });
                    return;
                }
            }

            var localPresent = !!L;
            var localHash = L ? L.hash : null;
            var remotePresent = !!R;
            var remoteDeleted = R ? R.deleted === true : false;
            var remoteRevision = R ? Number(R.revision) : null;
            var remoteHash = (R && !remoteDeleted) ? R.hash : null;

            /* =========================================================
               NO PRIOR BASE
               ========================================================= */
            if (!B) {
                if (localPresent && !remotePresent) {
                    out.creates.push({ documentType: type, documentKey: key });
                    return;
                }
                if (!localPresent && remotePresent && !remoteDeleted) {
                    out.downloads.push({ documentType: type, documentKey: key, deleted: false });
                    return;
                }
                if (!localPresent && remotePresent && remoteDeleted) {
                    /* both effectively absent — record a deleted baseline so we
                       stop re-evaluating it */
                    out.baselineUpdates.push({
                        documentType: type, documentKey: key,
                        revision: remoteRevision || 0, hash: null, deleted: true
                    });
                    return;
                }
                if (localPresent && remotePresent) {
                    if (!remoteDeleted && localHash != null && localHash === remoteHash) {
                        out.baselineUpdates.push({
                            documentType: type, documentKey: key,
                            revision: remoteRevision || 0, hash: localHash, deleted: false
                        });
                        return;
                    }
                    /* different content, or remote tombstoned while local still
                       has it, and NO shared history to reason from */
                    out.conflicts.push({
                        documentType: type, documentKey: key,
                        baseRevision: 0, remoteRevision: remoteRevision || 0,
                        reason: "both_changed_no_base"
                    });
                    return;
                }
                /* neither present (defensive) */
                return;
            }

            /* =========================================================
               PRIOR BASE EXISTS
               ========================================================= */
            var baseRevision = Number(B.revision) || 0;
            var baseHash = typeof B.baseHash === "string" ? B.baseHash : null;
            var baseDeleted = B.deleted === true;

            /* a base row that has been hard-removed from the cloud behaves
               like a remote tombstone at the base revision */
            if (!remotePresent) {
                remoteDeleted = true;
                remoteRevision = baseRevision;
                remoteHash = null;
            }

            var localChanged = localPresent
                ? (localHash !== baseHash)
                : !baseDeleted; /* local doc gone: a change only if the base wasn't already a tombstone */
            var remoteChanged = (remoteRevision !== baseRevision) || (remoteDeleted !== baseDeleted);

            /* 1. neither changed */
            if (!localChanged && !remoteChanged) {
                return;
            }

            /* 2. local only changed */
            if (localChanged && !remoteChanged) {
                if (!localPresent) {
                    if (deletable) {
                        out.tombstones.push({
                            documentType: type, documentKey: key,
                            expectedRevision: baseRevision
                        });
                    } else {
                        /* a required singleton vanished locally — never push a
                           delete for core state; leave the cloud copy intact */
                        out.ignored.push({
                            documentType: type, documentKey: key,
                            reason: "local_singleton_missing"
                        });
                    }
                    return;
                }
                out.updates.push({
                    documentType: type, documentKey: key,
                    expectedRevision: baseRevision
                });
                return;
            }

            /* 3. remote only changed */
            if (!localChanged && remoteChanged) {
                if (remoteDeleted) {
                    if (deletable) {
                        out.downloads.push({ documentType: type, documentKey: key, deleted: true });
                    } else {
                        out.conflicts.push({
                            documentType: type, documentKey: key,
                            baseRevision: baseRevision, remoteRevision: remoteRevision,
                            reason: "unsupported_remote_delete"
                        });
                    }
                    return;
                }
                /* remote changed to exactly our local content -> just re-baseline */
                if (localPresent && localHash != null && localHash === remoteHash) {
                    out.baselineUpdates.push({
                        documentType: type, documentKey: key,
                        revision: remoteRevision, hash: localHash, deleted: false
                    });
                    return;
                }
                out.downloads.push({ documentType: type, documentKey: key, deleted: false });
                return;
            }

            /* 4. both changed */
            if (localChanged && remoteChanged) {
                /* converged to identical content */
                if (localPresent && !remoteDeleted && localHash != null && localHash === remoteHash) {
                    out.baselineUpdates.push({
                        documentType: type, documentKey: key,
                        revision: remoteRevision, hash: localHash, deleted: false
                    });
                    return;
                }
                /* converged to a deletion */
                if (!localPresent && remoteDeleted) {
                    out.baselineUpdates.push({
                        documentType: type, documentKey: key,
                        revision: remoteRevision, hash: null, deleted: true
                    });
                    return;
                }
                out.conflicts.push({
                    documentType: type, documentKey: key,
                    baseRevision: baseRevision, remoteRevision: remoteRevision,
                    reason: "both_changed"
                });
                return;
            }
        });

        return out;
    }

    global.MWalletSyncPlanner = {
        plan: plan,
        _idOf: idOf
    };

})(typeof window !== "undefined" ? window : this);
