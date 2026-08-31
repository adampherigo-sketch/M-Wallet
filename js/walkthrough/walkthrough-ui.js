"use strict";

/* =========================================================
   M-WALLET — GUIDED APP WALKTHROUGH UI   (BP6)

       window.MWalletWalkthroughUI

   The coach-mark / spotlight overlay for
   js/walkthrough/guided-walkthrough.js. It:
     - shows #mw-walkthrough (a fixed overlay OUTSIDE .app) only
       while MWalletWalkthrough status is "active"
     - drives the 8 steps: Welcome / Home / Budget / Transactions
       / Savings / M-Cash / Reports / Settings
     - highlights a developer-controlled [data-walkthrough-target]
       on each page; a missing target degrades to a centred card
       with no spotlight — it NEVER throws or blocks the app
     - positions the card responsively (pure computePlacement),
       recalculating on resize / orientation / navigation
     - traps focus, is keyboard operable, respects reduced motion

   All step copy is static developer text set with textContent —
   user-entered account names / balances are NEVER copied into
   the overlay. BP6 makes ZERO writes to localStorage["mWalletData"]
   and ZERO network calls.

   The financial app root's inert / aria-hidden state stays owned
   by js/auth/auth-ui.js. This module tells it, via
   setWalkthroughScreenActive(bool) + renderState(), when the tour
   is up. BP4 is the security gate; BP6 FAILS OPEN — if this
   module errors, the verified, setup-complete owner keeps their
   app.
   ========================================================= */

(function (global) {

    var GATE_ID = "mw-walkthrough";

    /* Step registry — id + page + target attribute + static copy.
       Order matches MWalletWalkthrough.STEP_IDS. */
    var STEPS = [
        {
            id: "welcome", page: null, target: null, placement: "center",
            title: "Here’s your M-Wallet",
            body: "This quick tour shows you the main areas of M-Wallet. Nothing you see here changes your data, and you can skip at any time — it only takes a moment."
        },
        {
            id: "home", page: "home", target: "home-overview", placement: "bottom",
            title: "Your money at a glance",
            body: "The Home dashboard gives you a quick view of your checking and savings balances, this month’s activity, upcoming bills, and recent transactions."
        },
        {
            id: "budget", page: "budget", target: "budget-overview", placement: "bottom",
            title: "Plan your month",
            body: "Budget is where you add and manage income, bills, and expenses, move between months, and track what’s left to spend."
        },
        {
            id: "transactions", page: "transactions", target: "transactions-overview", placement: "bottom",
            title: "See where your money went",
            body: "Transactions is your spending history — every recorded payment, with merchant and category details where you’ve added them."
        },
        {
            id: "savings", page: "savings", target: "savings-overview", placement: "bottom",
            title: "Build toward your goals",
            body: "Savings tracks your savings balance and goals. You can allocate money toward a goal or release it back whenever you need to."
        },
        {
            id: "m-cash", page: "m-cash", target: "m-cash-overview", placement: "bottom",
            title: "Track the cash in your wallet",
            body: "M-Cash keeps count of the physical bills and coins you’re holding. Add cash, use the change calculator, and set some aside as Cash Savings."
        },
        {
            id: "reports", page: "reports", target: "reports-overview", placement: "bottom",
            title: "Understand the bigger picture",
            body: "Reports summarise your money over time — choose a Monthly, Yearly, or Date-to-Date view to spot trends."
        },
        {
            id: "settings", page: "settings", target: "settings-overview", placement: "top",
            title: "You’re in control",
            body: "Settings holds your account information, local data and setup status, preferences, and beta and system details. You’re ready to use M-Wallet."
        }
    ];
    var TOTAL_STEPS = STEPS.length;


    /* =====================================================
       PURE LOGIC  (unit-tested, no DOM)
       ===================================================== */

    function num(v, d) {
        var n = Number(v);
        return isFinite(n) ? n : d;
    }

    function clamp(v, lo, hi) {
        var n = Number(v);
        if (!isFinite(n)) { n = lo; }
        if (hi < lo) { hi = lo; }
        return Math.max(lo, Math.min(hi, n));
    }

    function sanitizeRect(r) {
        if (!r || typeof r !== "object") { return null; }
        var top = Number(r.top);
        var left = Number(r.left);
        var width = Number(r.width);
        var height = Number(r.height);
        if (!isFinite(width) && isFinite(Number(r.right)) && isFinite(left)) { width = Number(r.right) - left; }
        if (!isFinite(height) && isFinite(Number(r.bottom)) && isFinite(top)) { height = Number(r.bottom) - top; }
        if (![top, left, width, height].every(isFinite)) { return null; }
        if (width <= 0 && height <= 0) { return null; }
        width = Math.max(0, width);
        height = Math.max(0, height);
        return {
            top: top, left: left, width: width, height: height,
            right: left + width, bottom: top + height,
            cx: left + width / 2, cy: top + height / 2
        };
    }

    function placementOrder(preferred) {
        var all = ["bottom", "top", "right", "left"];
        var out = [];
        if (all.indexOf(preferred) !== -1) { out.push(preferred); }
        all.forEach(function (p) { if (out.indexOf(p) === -1) { out.push(p); } });
        return out;
    }

    function spotlightFor(rect, vw, vh, pad) {
        var x = clamp(rect.left - pad, 0, Math.max(0, vw));
        var y = clamp(rect.top - pad, 0, Math.max(0, vh));
        var w = clamp(rect.width + pad * 2, 0, Math.max(0, vw - x));
        var h = clamp(rect.height + pad * 2, 0, Math.max(0, vh - y));
        return { x: x, y: y, w: w, h: h };
    }

    function tryPlacement(side, rect, cardW, cardH, gap, sT, sB, sL, sR) {
        var x, y;
        if (side === "bottom") {
            y = rect.bottom + gap;
            x = clamp(rect.cx - cardW / 2, sL, Math.max(sL, sR - cardW));
        } else if (side === "top") {
            y = rect.top - gap - cardH;
            x = clamp(rect.cx - cardW / 2, sL, Math.max(sL, sR - cardW));
        } else if (side === "right") {
            x = rect.right + gap;
            y = clamp(rect.cy - cardH / 2, sT, Math.max(sT, sB - cardH));
        } else if (side === "left") {
            x = rect.left - gap - cardW;
            y = clamp(rect.cy - cardH / 2, sT, Math.max(sT, sB - cardH));
        } else {
            return null;
        }
        /* the card must sit FULLY inside the safe area on both axes */
        var tol = 0.5;
        if (y < sT - tol || y + cardH > sB + tol || x < sL - tol || x + cardW > sR + tol) {
            return null;
        }
        return { placement: side, x: x, y: y };
    }

    /* Pure placement solver. Always returns finite x / y and a
       placement string; spotlight is null when there is no usable
       target. */
    function computePlacement(opts) {
        opts = opts || {};
        var vw = num(opts.viewportW, 0);
        var vh = num(opts.viewportH, 0);
        var cardW = Math.max(0, num(opts.cardW, 0));
        var cardH = Math.max(0, num(opts.cardH, 0));
        var margin = Math.max(0, num(opts.margin, 16));
        var gap = Math.max(0, num(opts.gap, 12));
        var bottomInset = Math.max(0, num(opts.bottomInset, 0));
        var topInset = Math.max(0, num(opts.topInset, 0));
        var preferred = opts.preferred || "bottom";
        var rect = sanitizeRect(opts.targetRect);

        var sT = margin + topInset;
        var sB = vh - margin - bottomInset;
        var sL = margin;
        var sR = vw - margin;

        function centered(reason) {
            return {
                placement: "center",
                x: clamp((vw - cardW) / 2, sL, Math.max(sL, sR - cardW)),
                y: clamp((vh - cardH) / 2, sT, Math.max(sT, sB - cardH)),
                spotlight: null,
                reason: reason
            };
        }

        if (vw <= 0 || vh <= 0) {
            return { placement: "center", x: 0, y: 0, spotlight: null, reason: "no-viewport" };
        }
        if (!rect) { return centered("no-target"); }

        /* target scrolled entirely out of view -> centre the card and
           don't draw a spotlight on something the user can't see */
        if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw) {
            return centered("target-offscreen");
        }

        /* a target that fills most of the viewport isn't a useful
           "spotlight" — centre the card, skip the highlight ring */
        if (rect.height >= vh * 0.72 || rect.width >= vw * 0.98) {
            return centered("target-too-large");
        }

        var spotlight = spotlightFor(rect, vw, vh, Math.max(0, num(opts.spotlightPad, 8)));
        var order = placementOrder(preferred);
        for (var i = 0; i < order.length; i++) {
            var p = tryPlacement(order[i], rect, cardW, cardH, gap, sT, sB, sL, sR);
            if (p) { p.spotlight = spotlight; p.reason = "fit"; return p; }
        }
        /* nothing fits beside the target -> centre horizontally, but bias
           the card into the LARGER clear band so it overlaps the
           spotlight as little as possible */
        var c = centered("no-fit");
        c.spotlight = spotlight;
        var gapAbove = rect.top - sT;
        var gapBelow = sB - rect.bottom;
        if (gapAbove >= gapBelow && gapAbove > 0) {
            c.y = clamp(rect.top - gap - cardH, sT, Math.max(sT, sB - cardH));
        } else if (gapBelow > 0) {
            c.y = clamp(rect.bottom + gap, sT, Math.max(sT, sB - cardH));
        }
        return c;
    }

    function progressModel(stepIndex) {
        var idx = Number(stepIndex);
        if (!isFinite(idx) || idx < 0) { idx = 0; }
        if (idx > TOTAL_STEPS - 1) { idx = TOTAL_STEPS - 1; }
        var cells = [];
        for (var i = 0; i < TOTAL_STEPS; i++) {
            cells.push(i < idx ? "done" : (i === idx ? "current" : "todo"));
        }
        return { step: idx + 1, total: TOTAL_STEPS, cells: cells, label: "Step " + (idx + 1) + " of " + TOTAL_STEPS };
    }

    function stepModel(stepIndex) {
        var idx = Number(stepIndex);
        if (!isFinite(idx) || idx < 0 || idx > TOTAL_STEPS - 1) { idx = 0; }
        var step = STEPS[idx];
        return {
            id: step.id,
            title: step.title,
            body: step.body,
            page: step.page,
            target: step.target,
            placement: step.placement,
            isFirst: idx === 0,
            isLast: idx === TOTAL_STEPS - 1,
            nextLabel: idx === 0 ? "Start Tour" : (idx === TOTAL_STEPS - 1 ? "Finish Tour" : "Next"),
            progress: progressModel(idx)
        };
    }


    /* =====================================================
       DOM LAYER
       ===================================================== */

    var doc = null;
    var win = null;
    var gateEl = null;
    var wired = false;
    var lastFocus = null;
    var repositionQueued = false;
    var motionOk = true;
    var settleTimer = null;
    var settleTicks = 0;

    function walkthrough() { return global.MWalletWalkthrough || null; }
    function nav() { return global.BudgetNavigation || global.MWalletNavigation || null; }

    function q(sel) { return gateEl ? gateEl.querySelector(sel) : null; }
    function qa(sel) { return gateEl ? Array.prototype.slice.call(gateEl.querySelectorAll(sel)) : []; }

    function reducedMotion() {
        try {
            return !!(win && typeof win.matchMedia === "function" &&
                win.matchMedia("(prefers-reduced-motion: reduce)").matches);
        } catch (e) { return false; }
    }

    function readInset(name, fallback) {
        try {
            if (!win || typeof win.getComputedStyle !== "function" || !doc || !doc.documentElement) { return fallback; }
            var v = win.getComputedStyle(doc.documentElement).getPropertyValue(name);
            var n = parseFloat(v);
            return isFinite(n) ? n : fallback;
        } catch (e) { return fallback; }
    }

    function bottomNavInset() {
        var navEl = doc && doc.querySelector ? doc.querySelector(".bottom-nav, .nav-bottom, [data-bottom-nav]") : null;
        var h = 64;
        try {
            if (navEl && typeof navEl.getBoundingClientRect === "function") {
                var r = navEl.getBoundingClientRect();
                if (isFinite(r.height) && r.height > 0) { h = r.height; }
            }
        } catch (e) { /* keep default */ }
        return h + readInset("--sat-bottom", 0) + 8;
    }

    function topInsetPx() { return readInset("--sat-top", 0) + 8; }

    function findTargetEl(name) {
        if (!name || !doc || typeof doc.querySelector !== "function") { return null; }
        try { return doc.querySelector('[data-walkthrough-target="' + name + '"]'); }
        catch (e) { return null; }
    }

    function setVisible(visible) {
        if (!gateEl) { return; }
        gateEl.hidden = !visible;
        gateEl.setAttribute("aria-hidden", visible ? "false" : "true");
        if (doc && doc.body && doc.body.classList) {
            doc.body.classList.toggle("mw-wt-open", visible);
        }
    }

    /* tell auth-ui the tour is (not) presenting, then let it re-run
       its fail-closed / fail-open gate decision */
    function syncAuthUi(active) {
        try {
            var ui = global.MWalletAuthUI;
            if (ui && typeof ui.setWalkthroughScreenActive === "function") {
                ui.setWalkthroughScreenActive(active);
            }
            if (ui && typeof ui.renderState === "function") {
                ui.renderState();
            }
        } catch (e) { /* never throw for a gate sync */ }
    }

    function bail(code) {
        try { setVisible(false); } catch (e) { /* ignore */ }
        try { syncAuthUi(false); } catch (e) { /* ignore */ }
        var svc = walkthrough();
        if (svc && typeof svc.bailOut === "function") {
            try { svc.bailOut(code || "ui_error"); } catch (e) { /* ignore */ }
        }
    }

    function focusables() {
        return qa("button, [href], [tabindex]").filter(function (el) {
            return !el.disabled && el.getAttribute("tabindex") !== "-1" && el.hidden !== true;
        });
    }

    function trapFocus(event) {
        if (event.key !== "Tab") { return; }
        var list = focusables();
        if (!list.length) { return; }
        var first = list[0];
        var last = list[list.length - 1];
        var activeEl = doc ? doc.activeElement : null;
        if (event.shiftKey && activeEl === first) {
            event.preventDefault();
            try { last.focus(); } catch (e) { /* ignore */ }
        } else if (!event.shiftKey && activeEl === last) {
            event.preventDefault();
            try { first.focus(); } catch (e) { /* ignore */ }
        }
    }

    function scrollTargetIntoView(step) {
        if (!step || !step.target) { return; }
        var el = findTargetEl(step.target);
        if (!el || typeof el.scrollIntoView !== "function") { return; }
        try {
            /* instant: a guided tour must land its spotlight predictably,
               and an animated page scroll racing the coach-mark is worse
               UX than a snap. The CARD still eases into place via CSS
               (which honours prefers-reduced-motion). */
            el.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
        } catch (e) {
            try { el.scrollIntoView(); } catch (e2) { /* ignore */ }
        }
    }

    function position() {
        if (!gateEl || gateEl.hidden) { return; }
        var svc = walkthrough();
        var snap = svc ? svc.getState() : null;
        if (!snap || snap.status !== "active") { return; }
        var model = stepModel(snap.stepIndex);

        var card = q("[data-wt-card]");
        var spot = q("[data-wt-spotlight]");
        if (!card) { return; }

        var targetEl = model.target ? findTargetEl(model.target) : null;
        var rect = null;
        try {
            if (targetEl && typeof targetEl.getBoundingClientRect === "function") {
                var r = targetEl.getBoundingClientRect();
                if (r && (Number(r.width) > 0 || Number(r.height) > 0)) { rect = r; }
            }
        } catch (e) { rect = null; }

        var cardRect = { width: 0, height: 0 };
        try { cardRect = card.getBoundingClientRect() || cardRect; } catch (e) { /* keep zeros */ }

        var placement = computePlacement({
            targetRect: rect,
            cardW: cardRect.width, cardH: cardRect.height,
            viewportW: win ? win.innerWidth : 0,
            viewportH: win ? win.innerHeight : 0,
            bottomInset: bottomNavInset(),
            topInset: topInsetPx(),
            preferred: model.placement
        });

        try {
            card.style.left = Math.round(num(placement.x, 0)) + "px";
            card.style.top = Math.round(num(placement.y, 0)) + "px";
        } catch (e) { /* ignore */ }
        gateEl.setAttribute("data-wt-placement", placement.placement);
        gateEl.setAttribute("data-wt-has-target", placement.spotlight ? "true" : "false");

        if (spot) {
            if (placement.spotlight) {
                spot.hidden = false;
                try {
                    spot.style.left = Math.round(num(placement.spotlight.x, 0)) + "px";
                    spot.style.top = Math.round(num(placement.spotlight.y, 0)) + "px";
                    spot.style.width = Math.round(num(placement.spotlight.w, 0)) + "px";
                    spot.style.height = Math.round(num(placement.spotlight.h, 0)) + "px";
                } catch (e) { /* ignore */ }
            } else {
                spot.hidden = true;
            }
        }
    }

    function queueReposition() {
        if (repositionQueued) { return; }
        repositionQueued = true;
        var run = function () {
            repositionQueued = false;
            try { position(); } catch (e) { bail("position_error"); }
        };
        if (win && typeof win.requestAnimationFrame === "function") { win.requestAnimationFrame(run); }
        else { setTimeout(run, 16); }
    }

    /* A BOUNDED settle loop: after a step change the target's page is
       still transitioning / the app is still rendering. Re-place a
       fixed number of times over ~2s, then stop — never an open-ended
       observer. */
    function startSettleLoop() {
        stopSettleLoop();
        settleTicks = 15;
        var tick = function () {
            settleTimer = null;
            if (!gateEl || gateEl.hidden) { return; }
            queueReposition();
            settleTicks -= 1;
            if (settleTicks > 0) { settleTimer = setTimeout(tick, 130); }
        };
        settleTimer = setTimeout(tick, 60);
    }

    function stopSettleLoop() {
        if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
        settleTicks = 0;
    }

    function showStep(stepIndex) {
        var model = stepModel(stepIndex);

        var count = q("[data-wt-step-count]");
        if (count) { count.textContent = model.progress.label; }

        var progress = q("[data-wt-progress]");
        if (progress) {
            progress.setAttribute("aria-label", model.progress.label);
            var cells = Array.prototype.slice.call(progress.querySelectorAll("li"));
            cells.forEach(function (li, i) { li.setAttribute("data-state", model.progress.cells[i] || "todo"); });
        }

        var titleEl = q("[data-wt-title]");
        if (titleEl) { titleEl.textContent = model.title; }
        var bodyEl = q("[data-wt-body]");
        if (bodyEl) { bodyEl.textContent = model.body; }

        var backBtn = q('[data-wt-action="back"]');
        if (backBtn) { backBtn.hidden = model.isFirst; }
        var nextBtn = q('[data-wt-action="next"]');
        if (nextBtn) { nextBtn.textContent = model.nextLabel; }

        /* place now, next frame, then run the bounded settle loop while
           the page transition + app render finish */
        scrollTargetIntoView(model);
        queueReposition();
        if (win && typeof win.requestAnimationFrame === "function") {
            win.requestAnimationFrame(function () { queueReposition(); });
        }
        startSettleLoop();

        /* focus the step heading for AT + keyboard */
        if (titleEl && typeof titleEl.focus === "function") {
            try { titleEl.focus(); } catch (e) { /* ignore */ }
        }
    }

    function restoreFocus() {
        if (lastFocus && typeof lastFocus.focus === "function") {
            try { lastFocus.focus(); } catch (e) { /* ignore */ }
        }
        lastFocus = null;
    }

    function render() {
        if (!gateEl) { return; }
        var svc = walkthrough();
        var snap = svc ? svc.getState() : null;

        if (!snap || snap.status !== "active") {
            var wasOpen = gateEl.hidden === false;
            stopSettleLoop();
            setVisible(false);
            syncAuthUi(false);
            if (wasOpen) { restoreFocus(); }
            return;
        }

        try {
            if (gateEl.hidden !== false) {
                lastFocus = (doc && doc.activeElement) || null;
            }
            setVisible(true);
            showStep(snap.stepIndex);
            syncAuthUi(true);
        } catch (e) {
            bail("render_error");
        }
    }


    /* ---- actions --------------------------------------- */

    function onClick(event) {
        var trigger = event.target && event.target.closest
            ? event.target.closest("[data-wt-action]")
            : null;
        if (!trigger) { return; }
        var svc = walkthrough();
        if (!svc) { return; }
        var action = trigger.getAttribute("data-wt-action");
        try {
            if (action === "skip") { svc.skip(); }
            else if (action === "back") { svc.back(); }
            else if (action === "next") { svc.next(); }
        } catch (e) { bail("action_error"); }
    }

    function onKeydown(event) {
        if (!gateEl || gateEl.hidden) { return; }
        var svc = walkthrough();
        if (!svc) { return; }
        if (event.key === "Escape") {
            event.preventDefault();
            try { svc.skip(); } catch (e) { bail("escape_error"); }
            return;
        }
        if (event.key === "Tab") { trapFocus(event); return; }
        if (event.key === "ArrowRight") { try { svc.next(); } catch (e) { bail("key_error"); } return; }
        if (event.key === "ArrowLeft") { try { svc.back(); } catch (e) { bail("key_error"); } }
    }

    function onViewportChange() {
        if (!gateEl || gateEl.hidden) { return; }
        queueReposition();
    }


    function init(injectedDoc) {
        doc = injectedDoc || (typeof document !== "undefined" ? document : null);
        win = (typeof window !== "undefined") ? window : (doc && doc.defaultView) || null;
        if (!doc || typeof doc.getElementById !== "function") { return false; }

        gateEl = doc.getElementById(GATE_ID);
        if (!gateEl) { return false; }
        motionOk = !reducedMotion();

        if (!wired) {
            wired = true;
            gateEl.addEventListener("click", onClick);
            doc.addEventListener("keydown", onKeydown, true);
            if (win && typeof win.addEventListener === "function") {
                win.addEventListener("resize", onViewportChange);
                win.addEventListener("orientationchange", onViewportChange);
                win.addEventListener("scroll", onViewportChange, true);
            }
            /* re-place after the app finishes a page render / refresh */
            doc.addEventListener("mwallet:page-changed", function () { queueReposition(); });
            doc.addEventListener("mwallet:app-refreshed", function () { queueReposition(); });

            var svc = walkthrough();
            if (svc && typeof svc.subscribe === "function") {
                svc.subscribe(function () { render(); });
            } else {
                render();
            }
        } else {
            render();
        }
        return true;
    }


    global.MWalletWalkthroughUI = {
        STEPS: STEPS.map(function (s) { return { id: s.id, page: s.page, target: s.target, placement: s.placement }; }),
        TOTAL_STEPS: TOTAL_STEPS,

        /* pure */
        computePlacement: computePlacement,
        progressModel: progressModel,
        stepModel: stepModel,

        /* dom */
        init: init,
        render: render,
        position: position
    };

    if (typeof document !== "undefined") {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", function () { init(document); });
        } else {
            init(document);
        }
    }

})(typeof window !== "undefined" ? window : this);
