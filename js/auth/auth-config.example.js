"use strict";

/* =========================================================
   M-WALLET — AUTH CONFIG EXAMPLE   (BP2)

   M-Wallet has NO real Supabase project wired up yet, so it
   runs in "AUTH UNCONFIGURED" mode and the local financial
   app works normally.

   ---------------------------------------------------------
   WHICH KEY

   PREFERRED (current):
     supabaseUrl  https://<project-ref>.supabase.co
     supabaseKey  the PUBLISHABLE key, "sb_publishable_…"
                  (Supabase → Project Settings → API keys)

   LEGACY (older projects, still browser-safe):
     supabaseKey  the "anon" key (a JWT with role "anon")

   NEVER put any of these in the browser or the repo — they
   are server-only and auth-config.js actively refuses them:
     - the SECRET key, "sb_secret_…"
     - the "service_role" key (a JWT with role "service_role")
     - the JWT signing secret / database password
   The publishable / anon key is public by design; real data
   protection is authenticated ownership + Row Level Security
   on every table (BP7).

   ---------------------------------------------------------
   HOW TO CONFIGURE  (pick one — no build step, static-PWA safe)

   1) LOCAL DEV — localStorage override (recommended: no files
      to create, no tracked HTML to edit).
      Open the running app, then in the DevTools console:

        MWalletAuthConfigResolved.saveLocalConfig(
          "https://<project-ref>.supabase.co",
          "sb_publishable_…"
        );
        // reload

      It is stored only in this browser
      (localStorage["mwallet.auth.config"]), never committed,
      never shipped, and kept clear of financial data.
      Undo:  MWalletAuthConfigResolved.clearLocalConfig();

   2) LOCAL DEV — file override (only if you prefer files).
      Copy this file to  js/auth/auth-config.local.js
      (that name is git-ignored), keep the assignment below,
      and add ONE line to index.html just before auth-config.js:

        <script src="./js/auth/auth-config.local.js"></script>

   3) DEPLOYED BUILD — fill DEPLOY_CONFIG in
      js/auth/auth-config.js with the same two PUBLIC values
      and bump CACHE_NAME in service-worker.js.
   ========================================================= */

window.MWalletAuthConfig = {
    supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
    supabaseKey: "sb_publishable_<your-publishable-key>"
};
