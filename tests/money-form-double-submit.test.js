"use strict";

/* =========================================================
   MONEY FORM — ONE SAVE PER FORM (duplicate-submit guard)

   Regression: after a successful save the money modal stays
   open ~450 ms to show its success message. A double-tap,
   double-click or repeated Enter inside that window used to
   submit the same form again and write the record twice — for
   "Add Money to Savings", the money moved twice.

   Loads the REAL js/money.js into a vm against the shared DOM
   stub. That stub is deliberately minimal, so this file adds
   the few DOM features money.js's form builder relies on
   (dataset, property -> attribute reflection, append / remove,
   a real innerHTML reset, FormData). node --test runs every
   test file in its own process, so these additions never
   reach any other test file.

   No real storage: a recording stub stands in for
   window.MWalletStorage. Timers are captured, so the 450 ms
   success window is under the test's control.
   ========================================================= */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { Doc, El } = require("./helpers/dom-stub.js");

const ROOT = path.resolve(__dirname, "..");
const MONEY_SRC = fs.readFileSync(path.join(ROOT, "js/money.js"), "utf8");


/* ---- DOM features money.js needs beyond the shared stub ---------- */

function extendDomStubForMoneyForm() {
    const proto = El.prototype;
    const define = (name, descriptor) =>
        Object.defineProperty(proto, name, Object.assign({ configurable: true }, descriptor));
    const kebab = (key) => String(key).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());

    define("dataset", {
        get() {
            const el = this;
            return new Proxy({}, {
                get: (target, key) => (typeof key === "string" && el.hasAttribute("data-" + kebab(key)))
                    ? el.getAttribute("data-" + kebab(key))
                    : undefined,
                set: (target, key, value) => {
                    el.setAttribute("data-" + kebab(key), String(value));
                    return true;
                },
                has: (target, key) => el.hasAttribute("data-" + kebab(key))
            });
        }
    });

    /* money.js sets input.name / input.type / ... as properties; a real
       DOM reflects those to attributes, which [name="..."] lookups need */
    [
        ["name", "name"], ["type", "type"], ["placeholder", "placeholder"],
        ["min", "min"], ["max", "max"], ["step", "step"], ["htmlFor", "for"],
        ["rows", "rows"], ["inputMode", "inputmode"], ["autocomplete", "autocomplete"]
    ].forEach(([prop, attr]) => {
        define(prop, {
            get() { const v = this.getAttribute(attr); return v == null ? "" : v; },
            set(value) { this.setAttribute(attr, String(value)); }
        });
    });
    define("required", {
        get() { return this.hasAttribute("required"); },
        set(value) {
            if (value) { this.setAttribute("required", ""); } else { this.removeAttribute("required"); }
        }
    });

    /* innerHTML = "" must really empty the element: money.js clears the
       form body this way before rendering the next form */
    define("innerHTML", {
        get() { return this._text; },
        set(value) {
            this.childNodes.forEach((node) => { node.parentNode = null; });
            this.childNodes = [];
            this._text = String(value == null ? "" : value);
        }
    });
    define("isConnected", {
        get() {
            for (let node = this; node; node = node.parentNode) {
                if (node === this.ownerDocument.body) { return true; }
            }
            return false;
        }
    });
    proto.append = function append(...nodes) {
        nodes.forEach((node) => {
            if (node == null) { return; }
            if (typeof node === "string") {
                const span = this.ownerDocument.createElement("span");
                span.textContent = node;
                this.appendChild(span);
            } else {
                this.appendChild(node);
            }
        });
    };
    proto.remove = function remove() {
        if (this.parentNode) { this.parentNode.removeChild(this); }
    };
}

extendDomStubForMoneyForm();


/* minimal FormData: named, enabled controls; unchecked boxes skipped */
class FormDataStub {
    constructor(form) {
        this._entries = [];
        form.querySelectorAll("input, select, textarea").forEach((el) => {
            const name = el.getAttribute("name");
            if (!name || el.disabled) { return; }
            const type = String(el.getAttribute("type") || "").toLowerCase();
            if ((type === "checkbox" || type === "radio") && !el.checked) { return; }
            this._entries.push([name, String(el.value == null ? "" : el.value)]);
        });
    }
    forEach(fn) { this._entries.forEach(([key, value]) => fn(value, key, this)); }
    get(key) {
        const hit = this._entries.find(([k]) => k === key);
        return hit ? hit[1] : null;
    }
}


/* ---- load the real money.js against the #money-modal markup ------- */

function loadMoneyForm(options = {}) {
    const doc = new Doc();
    const add = (tag, id, parent, attrs = {}) => {
        const el = doc.createElement(tag);
        if (id) { el.setAttribute("id", id); }
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        (parent || doc.body).appendChild(el);
        return el;
    };

    /* mirrors index.html: #money-modal > form > body, status, Undo, Save */
    const modal = add("div", "money-modal");
    add("h3", "money-modal-title", modal);
    const form = add("form", "money-modal-form", modal);
    add("div", "money-modal-body", form);
    const status = add("p", "money-modal-status", form);
    add("button", "money-modal-undo", form, { type: "button" });
    const save = add("button", "money-modal-save", form, { type: "submit" });

    form.reportValidity = () => true;     /* the stub has no constraint validation */
    doc.dispatchEvent = () => true;       /* money-change events are not under test here */

    const writes = [];
    let failuresLeft = options.failFirstWrites || 0;
    const storage = {
        load: () => ({ settings: { currency: "USD" } }),
        getSavingsBalance: () => 0,
        getCheckingAccountBalance: () => 1000,
        getSelectedMonthKey: () => "2026-08",
        saveMoneyEntry(record) {
            if (failuresLeft > 0) {
                failuresLeft -= 1;
                return null;              /* what storage returns when a save fails */
            }
            writes.push(record);
            return Object.assign({ id: "entry-" + writes.length }, record);
        }
    };

    const timers = [];
    const fakeSetTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
    const window = {
        MWalletStorage: storage,
        setTimeout: fakeSetTimeout,
        clearTimeout() {}
    };
    const sandbox = {
        window,
        document: doc,
        FormData: FormDataStub,
        CustomEvent: class CustomEvent {
            constructor(type, init) { this.type = type; this.detail = init && init.detail; }
        },
        setTimeout: fakeSetTimeout,
        clearTimeout() {},
        requestAnimationFrame: (fn) => fn(),
        console: { log() {}, info() {}, warn() {}, error() {} }
    };
    window.window = window;
    window.document = doc;
    vm.createContext(sandbox);
    vm.runInContext(MONEY_SRC, sandbox, { filename: "money.js" });

    return {
        MoneyManager: window.MoneyManager,
        modal, form, save, status, writes, timers,
        field: (name) => form.querySelector(`[name="${name}"]`),
        submit: () => form.dispatch("submit", {}),
        /* let the ~450 ms success window elapse */
        runPendingTimers() {
            const due = timers.splice(0, timers.length);
            due.forEach((t) => t.fn());
            return due.length;
        }
    };
}

function openSavingsDeposit(env, amount) {
    env.MoneyManager.open("savings-deposit");
    const amountField = env.field("amount");
    assert.ok(amountField, "the real money.js rendered the Amount field");
    amountField.value = String(amount);
}


/* ================================================================ */

test("a double submit on 'Add Money to Savings' moves the money ONCE", () => {
    const env = loadMoneyForm();
    openSavingsDeposit(env, 50);
    const timersBefore = env.timers.length;

    env.submit();
    env.submit();      /* second tap inside the ~450 ms success window */

    assert.equal(env.writes.length, 1, "exactly one transfer is written");
    assert.equal(env.writes[0].type, "savings-deposit");
    assert.equal(Number(env.writes[0].amount), 50);
    assert.equal(env.save.disabled, true, "Save is disabled while the success message shows");
    assert.equal(env.timers.length - timersBefore, 1, "only one close is scheduled");

    /* the flag, not the button, is the guard: an Enter-key or
       programmatic submit is ignored even if the button were enabled */
    env.save.disabled = false;
    env.submit();
    assert.equal(env.writes.length, 1, "still exactly one transfer");
});

test("after the modal closes, the next form saves normally", () => {
    const env = loadMoneyForm();
    openSavingsDeposit(env, 50);
    env.submit();

    env.runPendingTimers();     /* the success window ends -> modal closes */
    assert.equal(env.modal.classList.contains("active"), false, "the modal closed");
    assert.equal(env.save.disabled, false, "Save is available again");

    openSavingsDeposit(env, 25);
    env.submit();
    assert.equal(env.writes.length, 2, "a new form's save goes through");
    assert.equal(Number(env.writes[1].amount), 25);
});

test("closing the modal another way (X / Escape) also releases the guard", () => {
    const env = loadMoneyForm();
    openSavingsDeposit(env, 50);
    env.submit();
    assert.equal(env.save.disabled, true);

    env.MoneyManager.close();
    assert.equal(env.save.disabled, false, "Save is available again");

    openSavingsDeposit(env, 10);
    env.submit();
    assert.equal(env.writes.length, 2);
});

test("a failed save releases the guard so the user can retry", () => {
    const env = loadMoneyForm({ failFirstWrites: 1 });
    openSavingsDeposit(env, 50);
    const timersBefore = env.timers.length;

    env.submit();               /* storage refuses the write */
    assert.equal(env.writes.length, 0);
    assert.match(env.status.textContent, /could not be saved/i, "the error is shown");
    assert.equal(env.save.disabled, false, "Save is available to retry");
    assert.equal(env.timers.length, timersBefore, "a failed save does not close the modal");

    env.submit();               /* the retry succeeds */
    assert.equal(env.writes.length, 1, "the retry is written exactly once");
});
