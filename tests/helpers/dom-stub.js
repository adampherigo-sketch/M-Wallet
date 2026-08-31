"use strict";

/*
 * Minimal DOM stub — just enough surface for js/auth/auth-ui.js.
 * NOT a general-purpose DOM. Supports:
 *   - createElement, getElementById, querySelector(All) on a subtree
 *   - simple selectors: #id  .class  tag  [attr]  [attr="v"]  and
 *     comma-separated unions of those
 *   - classList add/remove/toggle/contains
 *   - hidden, disabled, value, textContent, innerHTML (text only)
 *   - get/set/has/removeAttribute, dataset-free (attributes map)
 *   - addEventListener + a test-only dispatch(type, event)
 *   - closest(selector) walking ancestors
 *   - focus() (records lastFocused on the document)
 */

let uid = 0;

class El {
    constructor(tag, doc) {
        this.tagName = String(tag || "div").toUpperCase();
        this.ownerDocument = doc;
        this._id = ++uid;
        this.childNodes = [];
        this.parentNode = null;
        this.attributes = {};
        this.listeners = {};
        this._classes = new Set();
        this._text = "";
        this.value = "";
        this._hidden = false;
        this.disabled = false;
        this.inert = false;
    }

    /* ---- attributes ---- */
    setAttribute(name, val) {
        this.attributes[name] = String(val);
        if (name === "class") { this._classes = new Set(String(val).split(/\s+/).filter(Boolean)); }
        if (name === "id" && this.ownerDocument) { this.ownerDocument._index.set(String(val), this); }
    }
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
    removeAttribute(name) { delete this.attributes[name]; if (name === "class") { this._classes = new Set(); } }

    get id() { return this.attributes.id || ""; }
    set id(v) { this.setAttribute("id", v); }

    get hidden() { return this._hidden; }
    set hidden(v) { this._hidden = !!v; }

    get className() { return Array.from(this._classes).join(" "); }
    set className(v) { this.setAttribute("class", v); }

    get classList() {
        const self = this;
        return {
            add(...c) { c.forEach((x) => self._classes.add(x)); },
            remove(...c) { c.forEach((x) => self._classes.delete(x)); },
            toggle(c, force) {
                const on = force === undefined ? !self._classes.has(c) : !!force;
                if (on) { self._classes.add(c); } else { self._classes.delete(c); }
                return on;
            },
            contains(c) { return self._classes.has(c); }
        };
    }

    get textContent() { return this._text; }
    set textContent(v) { this._text = String(v == null ? "" : v); this.childNodes = []; }
    get innerHTML() { return this._text; }
    set innerHTML(v) { this._text = String(v == null ? "" : v); }

    /* ---- tree ---- */
    appendChild(node) {
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }
    get children() { return this.childNodes.filter((n) => n instanceof El); }

    _descendants(acc) {
        acc = acc || [];
        for (const c of this.children) { acc.push(c); c._descendants(acc); }
        return acc;
    }

    matches(selector) {
        return splitSelector(selector).some((s) => matchSimple(this, s));
    }

    closest(selector) {
        let node = this;
        while (node) {
            if (node instanceof El && node.matches(selector)) { return node; }
            node = node.parentNode;
        }
        return null;
    }

    querySelector(selector) {
        const all = this._descendants();
        for (const node of all) { if (node.matches(selector)) { return node; } }
        return null;
    }
    querySelectorAll(selector) {
        return this._descendants().filter((node) => node.matches(selector));
    }

    /* ---- events ---- */
    addEventListener(type, fn) {
        (this.listeners[type] = this.listeners[type] || []).push(fn);
    }
    removeEventListener(type, fn) {
        const list = this.listeners[type] || [];
        const i = list.indexOf(fn);
        if (i !== -1) { list.splice(i, 1); }
    }
    /* test helper: fire an event that bubbles to ancestor listeners */
    dispatch(type, event) {
        event = event || {};
        event.type = type;
        event.target = event.target || this;
        event.preventDefault = event.preventDefault || function () { event.defaultPrevented = true; };
        let node = this;
        while (node) {
            (node.listeners[type] || []).slice().forEach((fn) => fn(event));
            node = node.parentNode;
        }
        return event;
    }

    focus() { if (this.ownerDocument) { this.ownerDocument.activeElement = this; } }
}

function splitSelector(sel) {
    return String(sel).split(",").map((s) => s.trim()).filter(Boolean);
}

/* one simple selector: #id | .cls | tag | [attr] | [attr="v"] | [attr='v'] */
function matchSimple(el, sel) {
    if (sel.startsWith("#")) { return el.id === sel.slice(1); }
    if (sel.startsWith(".")) { return el._classes.has(sel.slice(1)); }
    const attr = sel.match(/^\[([a-zA-Z_:-][\w:-]*)(?:\s*=\s*["']([^"']*)["'])?\]$/);
    if (attr) {
        if (!el.hasAttribute(attr[1])) { return false; }
        return attr[2] === undefined || el.getAttribute(attr[1]) === attr[2];
    }
    if (/^[a-zA-Z][\w-]*$/.test(sel)) { return el.tagName === sel.toUpperCase(); }
    return false;
}

class Doc {
    constructor() {
        this._index = new Map();
        this.activeElement = null;
        this.readyState = "complete";
        this.listeners = {};
        this.body = this.createElement("body");
        this.documentElement = this.createElement("html");
    }
    createElement(tag) { return new El(tag, this); }
    getElementById(id) { return this._index.get(String(id)) || null; }
    querySelector(sel) { return this.body.querySelector(sel) || (this.body.matches(sel) ? this.body : null); }
    querySelectorAll(sel) { return this.body.querySelectorAll(sel); }
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
}

/*
 * Build a DOM containing the #mw-auth-gate structure auth-ui.js needs,
 * plus a .app element. Returns { document, gate, app, el(id) }.
 */
function buildAuthDom() {
    const doc = new Doc();

    const app = doc.createElement("div");
    app.setAttribute("class", "app");
    doc.body.appendChild(app);

    const gate = doc.createElement("div");
    gate.setAttribute("id", "mw-auth-gate");
    gate.setAttribute("class", "mw-auth-gate");
    gate.hidden = true;
    doc.body.appendChild(gate);

    const views = ["loading", "welcome", "signup", "signin", "verify", "forgot", "recovery", "ownership-hold"];
    views.forEach((name) => {
        const section = doc.createElement("section");
        section.setAttribute("data-auth-view", name);
        section.hidden = true;
        gate.appendChild(section);

        const h1 = doc.createElement("h1");
        h1.textContent = name;
        section.appendChild(h1);

        const msg = doc.createElement("div");
        msg.setAttribute("data-auth-msg", name);
        msg.hidden = true;
        section.appendChild(msg);

        if (name === "ownership-hold") {
            ["ownership-retry", "ownership-signout"].forEach((action) => {
                const b = doc.createElement("button");
                b.setAttribute("data-auth-action", action);
                b.textContent = action;
                section.appendChild(b);
            });
        }

        if (name === "verify") {
            const email = doc.createElement("strong");
            email.setAttribute("data-auth-email", "");
            section.appendChild(email);
            const resend = doc.createElement("button");
            resend.setAttribute("data-auth-action", "resend");
            section.appendChild(resend);
        }

        if (["signup", "signin", "forgot", "recovery"].indexOf(name) !== -1) {
            const form = doc.createElement("form");
            form.setAttribute("data-auth-form", name);
            section.appendChild(form);

            const fields = name === "signup" ? ["email", "password", "confirm"]
                : name === "signin" ? ["email", "password"]
                    : name === "forgot" ? ["email"]
                        : ["password", "confirm"];
            fields.forEach((f) => {
                const input = doc.createElement("input");
                input.setAttribute("name", f);
                form.appendChild(input);
            });
            const submit = doc.createElement("button");
            submit.setAttribute("data-auth-submit", "");
            submit.textContent = "Go";
            form.appendChild(submit);
        }

        // navigation buttons
        ["go-signup", "go-signin", "go-forgot", "go-welcome"].forEach((action) => {
            const b = doc.createElement("button");
            b.setAttribute("data-auth-action", action);
            section.appendChild(b);
        });
    });

    /* BP4 — the #mw-migration-gate lives alongside #mw-auth-gate */
    const migrationGate = buildMigrationGateInto(doc);

    return {
        document: doc,
        gate,
        app,
        migrationGate,
        view(name) { return gate.querySelector('[data-auth-view="' + name + '"]'); },
        msg(name) { return gate.querySelector('[data-auth-msg="' + name + '"]'); },
        form(name) { return gate.querySelector('[data-auth-form="' + name + '"]'); },
        input(formName, field) {
            return gate.querySelector('[data-auth-form="' + formName + '"]').querySelector('[name="' + field + '"]');
        },
        migrationScreen(name) {
            return migrationGate.querySelector('[data-migration-screen="' + name + '"]');
        },
        migrationAction(name) {
            return migrationGate.querySelector('[data-migration-action="' + name + '"]');
        }
    };
}

const MIGRATION_SCREENS = ["checking", "needs_claim", "owner_mismatch", "error"];

function buildMigrationGateInto(doc) {
    const gate = doc.createElement("div");
    gate.setAttribute("id", "mw-migration-gate");
    gate.setAttribute("class", "mw-auth-gate");
    gate.hidden = true;
    doc.body.appendChild(gate);

    MIGRATION_SCREENS.forEach((name) => {
        const section = doc.createElement("section");
        section.setAttribute("data-migration-screen", name);
        section.hidden = true;
        gate.appendChild(section);

        const h1 = doc.createElement("h1");
        h1.textContent = name;
        section.appendChild(h1);

        const msg = doc.createElement("div");
        msg.setAttribute("data-migration-msg", "");
        msg.hidden = true;
        section.appendChild(msg);

        const actions =
            name === "needs_claim" ? ["claim", "sign-out"]
                : name === "owner_mismatch" ? ["sign-out"]
                    : name === "error" ? ["retry", "sign-out"]
                        : [];
        actions.forEach((action) => {
            const button = doc.createElement("button");
            button.setAttribute("data-migration-action", action);
            button.textContent = action;
            section.appendChild(button);
        });
    });

    return gate;
}

/* migration-only DOM (has .app + #mw-migration-gate, no auth gate) */
function buildMigrationDom() {
    const doc = new Doc();
    const app = doc.createElement("div");
    app.setAttribute("class", "app");
    doc.body.appendChild(app);
    const migrationGate = buildMigrationGateInto(doc);
    return {
        document: doc,
        app,
        migrationGate,
        screen(name) { return migrationGate.querySelector('[data-migration-screen="' + name + '"]'); },
        action(name) { return migrationGate.querySelector('[data-migration-action="' + name + '"]'); }
    };
}

module.exports = { Doc, El, buildAuthDom, buildMigrationDom };
