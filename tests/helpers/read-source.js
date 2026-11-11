"use strict";

/*
   Read a js/ source file for loading into a node:vm sandbox.

   js/auth/auth-config.js ships the deployed Beta project's PUBLIC
   Supabase URL + publishable key in DEPLOY_CONFIG. The auth / migration
   suites model specific auth states (unconfigured, window config,
   localStorage config), so by default their sandboxes load the file with
   DEPLOY_CONFIG blanked — the committed deploy values must never leak
   into a scenario that did not ask for them. Pass { keepDeployConfig: true }
   to load the file exactly as shipped.
*/

const fs = require("fs");
const path = require("path");

const DEPLOY_CONFIG_RE = /var DEPLOY_CONFIG = \{[\s\S]*?\};/;

function readSource(root, file, opts) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    if (path.basename(file) !== "auth-config.js" || (opts && opts.keepDeployConfig)) {
        return src;
    }
    if (!DEPLOY_CONFIG_RE.test(src)) {
        throw new Error("read-source: DEPLOY_CONFIG block not found in " + file);
    }
    return src.replace(DEPLOY_CONFIG_RE,
        'var DEPLOY_CONFIG = { supabaseUrl: "", supabaseKey: "" };');
}

module.exports = { readSource };
