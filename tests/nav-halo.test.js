"use strict";

/* Halo navigation + Activity-on-Home (design pass after beta.11).
   Locks the 7-button order, the logo Home orb, the Activity
   section on Home, and the routing that retires the old
   Transactions page without breaking old links. */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

const html = read("index.html");
const navSrc = read("js/nav.js");
const appSrc = read("js/app.js");
const sw = read("service-worker.js");
const css = read("css/nav-halo.css");

function navMarkup() {
    const start = html.indexOf('class="bottom-nav nav-halo"');
    assert.ok(start > 0, "the nav carries the nav-halo class");
    return html.slice(start, html.indexOf("</nav>", start));
}

test("bottom nav: 7 buttons in the order Budget · Savings · M-Cash · Home · Add · Reports · Settings", () => {
    const nav = navMarkup();
    const order = [];
    const re = /<button[\s\S]*?(data-page="([a-z-]+)"|data-quick-add-toggle)/g;
    let m;
    while ((m = re.exec(nav))) {
        order.push(m[2] || "add");
    }
    assert.deepEqual(order, ["budget", "savings", "m-cash", "home", "add", "reports", "settings"]);
});

test("bottom nav: Activity is not a tab, and no button is hidden on phones", () => {
    const nav = navMarkup();
    assert.ok(!/data-page="transactions"/.test(nav), "no Activity tab");
    assert.ok(!/nav-button--extra/.test(nav), "M-Cash + Settings are visible on the bar");
});

test("Home is the logo orb, with a readable label and a house icon for the sidebar", () => {
    const nav = navMarkup();
    const home = nav.slice(nav.indexOf('data-page="home"') - 120, nav.indexOf("Add money"));
    assert.ok(/nav-button--home/.test(home));
    assert.ok(/<img class="nav-home-logo" src="\.\/icons\/m-wallet-icon-192\.png" alt=""/.test(home), "logo image, decorative");
    assert.ok(/nav-home-house/.test(home), "house icon for the sidebar");
    assert.ok(/<span class="nav-label">Home<\/span>/.test(home), "accessible name stays 'Home'");
    assert.ok(/aria-current="page"/.test(home), "Home starts as the current page");
});

test("nav-halo.css: linked after zg9.css, precached, and draws the notch without data: images", () => {
    const zg9 = html.indexOf('href="./css/zg9.css');
    const halo = html.indexOf('href="./css/nav-halo.css');
    assert.ok(zg9 > 0 && halo > zg9, "nav-halo.css loads after zg9.css");
    assert.ok(sw.includes('"./css/nav-halo.css"'), "precached for offline use");
    assert.ok(sw.includes('"./icons/m-wallet-icon-192.png"'), "logo precached");
    assert.ok(!/url\(\s*["']?data:/.test(css), "no data: URIs (CSP img-src 'self')");
    assert.ok(/mask:\s*radial-gradient/.test(css), "notch is a CSS mask");
    assert.ok(/repeat\(3, minmax\(0, 1fr\)\)\s*calc\(var\(--halo-notch-r\) \* 2\)\s*repeat\(3, minmax\(0, 1fr\)\)/.test(css),
        "3 + notch + 3 columns");
});

test("Activity lives on Home: the Transactions page is gone and its controls moved intact", () => {
    assert.ok(!/data-page-content="transactions"/.test(html), "no Transactions page");
    assert.ok(!/id="transactions-page"/.test(html));
    const homeStart = html.indexOf('data-page-content="home"');
    const homeEnd = html.indexOf('data-page-content="m-cash"');
    const home = html.slice(homeStart, homeEnd);
    for (const id of ["home-activity", "tx-search", "tx-category-filter", "tx-results-count", "transaction-list", "tx-show-more"]) {
        assert.ok(home.includes('id="' + id + '"'), id + " is inside Home");
    }
    assert.ok(/data-tx-filter="all"[\s\S]*data-tx-filter="income"[\s\S]*data-tx-filter="expense"/.test(home), "type chips");
    assert.ok(/data-walkthrough-target="transactions-overview"/.test(home), "tour target moved with it");
    assert.ok(!/id="dashboard-recent-transactions"/.test(html), "Recent Transactions card replaced by Activity");
});

test("routing: Transactions is no longer a page; old links land on Home's Activity section", () => {
    const valid = navSrc.slice(navSrc.indexOf("const validPages = ["), navSrc.indexOf("];", navSrc.indexOf("const validPages = [")));
    assert.ok(!/"transactions"/.test(valid), "transactions removed from validPages");
    assert.ok(/transactions:\s*"home"/.test(navSrc), "#transactions → home");
    assert.ok(/activity:\s*"home"/.test(navSrc), "#activity → home");
    assert.ok(/getElementById\("home-activity"\)[\s\S]{0,200}scrollIntoView/.test(navSrc), "scrolls to the section");
});

test("Activity preview: newest 8, then Show all / Show less", () => {
    assert.ok(/ACTIVITY_PREVIEW:\s*8/.test(appSrc));
    assert.ok(/filtered\.slice\(0, limit\)/.test(appSrc), "ledger is capped until expanded");
    assert.ok(/`Show all \$\{matching\}`/.test(appSrc) && /"Show less"/.test(appSrc));
    assert.ok(/id="tx-show-more"[\s\S]{0,200}\bhidden\b/.test(html), "button starts hidden");
});
