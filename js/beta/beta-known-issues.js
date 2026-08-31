"use strict";

/* =========================================================
   M-WALLET — BETA KNOWN ISSUES REGISTRY   (BP11)

       window.MWalletBetaKnownIssues

   A small developer-maintained registry of publicly
   acknowledged beta issues. Static, safe text only — it is
   rendered with textContent, never as HTML, and it never
   contains raw internal security-finding detail.

   To publish an issue: add an entry to REGISTRY below and
   ship a new build. Statuses: open | investigating |
   workaround | fixed-next-build.
   ========================================================= */

(function (global) {

    var STATUSES = ["open", "investigating", "workaround", "fixed-next-build"];

    /* -------------------------------------------------------
       REGISTRY — developer-curated. Empty for 0.9.0-beta.10.
       Example shape:
         {
           id: "MW-BETA-001",
           title: "Short human summary",
           status: "workaround",
           affectedVersions: ["0.9.0-beta.10"],
           workaround: "What the tester can do meanwhile."
         }
       ------------------------------------------------------- */
    var REGISTRY = [];

    var overrides = null;   /* test-only */

    function str(v) { return typeof v === "string" ? v : ""; }

    function normalizeVersions(v) {
        if (!Array.isArray(v)) { return []; }
        var out = [];
        v.forEach(function (x) {
            var s = str(x).trim();
            if (s && out.indexOf(s) === -1) { out.push(s); }
        });
        return out;
    }

    function normalizeItem(item) {
        if (!item || typeof item !== "object") { return null; }
        var id = str(item.id).trim();
        var title = str(item.title).trim();
        if (!id || !title) { return null; }
        var status = STATUSES.indexOf(item.status) !== -1 ? item.status : "open";
        return {
            id: id,
            title: title,
            status: status,
            affectedVersions: normalizeVersions(item.affectedVersions),
            workaround: str(item.workaround).trim() || null
        };
    }

    function list() {
        var raw = overrides || REGISTRY;
        var seen = {};
        var out = [];
        (Array.isArray(raw) ? raw : []).forEach(function (item) {
            var norm = normalizeItem(item);
            if (!norm) { return; }
            if (seen[norm.id]) { return; }   /* unique ids only */
            seen[norm.id] = true;
            out.push(norm);
        });
        return out;
    }

    function count() { return list().length; }

    function isEmpty() { return count() === 0; }

    /* the exact strings the UI shows for the empty state — never
       "there are no bugs" */
    var EMPTY_PRIMARY = "No published known issues for this build.";
    var EMPTY_SECONDARY = "Beta software may still contain undiscovered issues.";

    function configureForTest(next) {
        overrides = (next == null) ? null : (Array.isArray(next) ? next.slice() : []);
    }

    global.MWalletBetaKnownIssues = {
        STATUSES: STATUSES.slice(),
        EMPTY_PRIMARY: EMPTY_PRIMARY,
        EMPTY_SECONDARY: EMPTY_SECONDARY,
        list: list,
        count: count,
        isEmpty: isEmpty,
        configureForTest: configureForTest
    };

})(typeof window !== "undefined" ? window : this);
