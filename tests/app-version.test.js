"use strict";

/*
 * BP1 — application version single source of truth.
 *
 * js/app-version.js is the only place the app version string lives at
 * runtime (package.json "version" mirrors it for tooling). These tests
 * pin the shape of window.MWalletVersion and that it stays in sync
 * with package.json.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function loadVersionModule() {
	const sandbox = { window: {} };
	vm.runInNewContext(
		fs.readFileSync(path.join(ROOT, "js/app-version.js"), "utf8"),
		sandbox
	);
	return sandbox.window.MWalletVersion;
}

const SEMVER_BETA = /^\d+\.\d+\.\d+-(beta|alpha|rc)\.\d+$/;


test("app-version.js exposes a well-formed MWalletVersion", () => {
	const v = loadVersionModule();

	assert.ok(v, "window.MWalletVersion is defined");
	assert.equal(typeof v.version, "string");
	assert.match(v.version, SEMVER_BETA, "version is semver + pre-release, e.g. 0.9.0-beta.1");
	assert.equal(typeof v.channel, "string");
	assert.ok(v.channel.length > 0);
	assert.equal(v.isBeta, v.channel === "beta");
	assert.equal(v.label, "M-Wallet " + v.version);
});


test("package.json version matches js/app-version.js (single source of truth)", () => {
	const v = loadVersionModule();
	const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

	assert.equal(
		pkg.version,
		v.version,
		"package.json \"version\" must equal APP_VERSION in js/app-version.js"
	);
});


test("no other tracked source file hard-codes a competing version string", () => {
	// The app version must not be sprinkled around. Only app-version.js and
	// package.json may contain the literal current version.
	const v = loadVersionModule();
	const needle = v.version;

	const files = [
		"index.html",
		"js/app.js",
		"js/settings-ui.js",
		"js/storage.js",
		"service-worker.js"
	];

	for (const rel of files) {
		const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
		assert.ok(
			!text.includes(needle),
			`${rel} should not hard-code the version string "${needle}" — read it from window.MWalletVersion`
		);
	}
});
