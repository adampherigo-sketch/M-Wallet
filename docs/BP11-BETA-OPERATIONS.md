# BP11 — Beta Operations & Feedback

**Status: IMPLEMENTATION COMPLETE — LIVE FEEDBACK-ENDPOINT VERIFICATION DEFERRED TO BP12**

BP11 prepares M-Wallet to be run as a professional closed beta: a Beta Hub in
Settings, a structured **user-initiated** feedback / bug-report flow with
optional privacy-safe diagnostics, a known-issues registry, curated release
notes, and the tester + triage documentation.

> **BP11 is not telemetry.** M-Wallet has no analytics or advertising trackers
> and BP11 keeps it that way. Feedback is sent **only** when the tester presses
> Send, and only when a feedback destination is configured. There is no
> background beacon, no automatic crash reporting, no `sendBeacon`, no tracking
> pixel, no automatic transmission of app opens / page visits / errors / device
> or user identifiers / financial values.

---

## 1. Architecture

| File | Global | Role |
|---|---|---|
| `js/beta/beta-config.js` | `MWalletBetaConfig` | PUBLIC deploy config — feedback endpoint, support email, program name. No secret. Committed defaults are `null`. |
| `js/beta/beta-known-issues.js` | `MWalletBetaKnownIssues` | Developer-curated static issue registry. Safe text only. Empty for `0.9.0-beta.10`. |
| `js/beta/beta-ops.js` | `MWalletBetaOps` | No DOM. Build summary, **sanitised diagnostics**, live-derived beta limitations, report-id generator, curated release notes. |
| `js/beta/beta-feedback.js` | `MWalletBetaFeedback` | No DOM. Validation, versioned payload, and the **single** network boundary (`submit`). |
| `js/beta/beta-ui.js` | `MWalletBetaUI` | Beta Hub + feedback / known-issues / what's-new dialogs. Fails open. |
| `css/beta.css` | — | Hub rows + dialog styling (44px, dark mode, reduced motion). |

**Fail-open.** If any beta module is missing or throws, the financial app and the
auth gateway keep working; the "Report a beta problem" control simply becomes
unavailable. Authentication never depends on feedback code.

**The only new outbound network boundary** in the whole app is
`MWalletBetaFeedback.submit()` — a single `POST`, only after an explicit Send,
only to a configured HTTPS endpoint. `js/beta/*` contains no `XMLHttpRequest`,
`WebSocket`, `EventSource`, or `sendBeacon`.

---

## 2. Report schema

```json
{
  "format": "m-wallet-beta-feedback",
  "formatVersion": 1,
  "reportId": "MWB-<uuid>",
  "createdAt": "<ISO>",
  "appVersion": "0.9.0-beta.10",
  "channel": "beta",
  "category": "bug | data | performance | usability | feature | other",
  "severity": "blocker | major | minor | suggestion",
  "title": "<=120 chars",
  "description": "<=5000 chars",
  "stepsToReproduce": "<=3000 chars",
  "expectedBehavior": "<=3000 chars",
  "actualBehavior": "<=3000 chars",
  "contactEmail": null,
  "diagnostics": null
}
```

* `formatVersion` is **independent** of the app version, the wallet schema, and
  the BP10 export format.
* User-facing severities are *"Blocks me / Major problem / Minor problem /
  Suggestion"* — testers never see P0/P1.
* **Field limits:** title 120, description 5000, steps/expected/actual 3000
  each, contact email 254. **Whole serialized report:** `MAX_REPORT_BYTES =
  48 KiB` — an oversized report is rejected with `invalid_report` / `too_large`.
* Text is trimmed, CRLF→LF normalised, and stripped of null bytes / C0 control
  characters. It is **never** executed as HTML — the UI renders every field with
  `textContent`.
* There is **no** financial object, wallet export, raw session, or token.

---

## 3. Safe diagnostics (opt-in only)

`MWalletBetaOps.safeDiagnostics()` is built **only** for a report the tester is
composing, and only attached when the *"Include technical diagnostics"* box is
checked (unchecked by default). The tester can preview it with *"View
diagnostics"*.

**Included:** `appVersion`, `betaChannel`, `reportCreatedAt`, `currentPage`
(one of `home/budget/transactions/savings/reports/settings/m-cash`), `online`,
`standalone`, `serviceWorkerControlled`, `viewportWidth/Height`, `userAgent`
(a plain UA string, capped at 512 chars — never a high-entropy fingerprint API),
`language`, `authState` (a label only: `signed_in / signed_out / unconfigured /
initializing / error / recovery`), `syncReleaseEnabled`, `passkeyReleaseEnabled`,
`feedbackEndpointConfigured`. `contactEmail` is added **only** when the tester
opts in and supplies an address.

**Never included:** `mWalletData`, balances, transactions, bills, expenses,
income, notes, merchant names, category contents, M-Cash counts, savings data,
cloud payloads, **any aggregate financial count** (`transactionCount`,
`billCount`, `monthCount`, …), the user UUID, the owner id, the account email
(unless opted in), an access/refresh token, a Supabase session, passkey ids,
sync document ids, a localStorage dump, or cookies.

The user agent is transmitted **only** inside an explicitly user-submitted
report — never automatically.

---

## 4. Feedback endpoint setup

The committed build ships `feedbackEndpoint: null`. The app is fully usable
without one — a report can always be **copied** or **downloaded**.

To configure a destination, edit `DEPLOY.feedbackEndpoint` in
`js/beta/beta-config.js` at deploy time. Requirements:

* **HTTPS** (enforced — `http:` / `javascript:` / `data:` / `file:` / `ftp:` /
  `ws:` are rejected and resolve to `null`).
* Accepts a browser `POST` of `application/json`.
* **No secret key in the front end.** If the provider requires an API key in the
  browser, **do not use it** — use a public form endpoint or a trusted
  server-side endpoint instead.
* Appropriate CORS for the beta origin.
* Abuse / rate-limit handling on the provider or server side.
* Stores only the report fields intentionally submitted; requires no financial
  data.

`submit()` sends `credentials: "omit"`, `cache: "no-store"`, a
`~15 s` `AbortController` timeout, and **never retries**. The server response is
never rendered — only a short plain `reference` string (`^[\w.\- ]{1,120}$`) is
accepted, otherwise the locally generated `reportId` is shown.

### Endpoint privacy note (must stay precise)

When remote feedback delivery is configured, pressing Send transmits the report
contents and any diagnostics you included to the configured support service.
That service, as part of normal HTTP operation, may also receive standard network
metadata such as your IP address. HTTPS encrypts the report in transit to that
endpoint; storage and security at the destination depend on that provider.
M-Wallet does not claim the report is end-to-end encrypted and does not promise
what the provider does or does not retain.

---

## 5. Manual copy / download workflow

* **Copy report** — plain-text summary to the clipboard (Clipboard API, with a
  clear "Copied" confirmation). No network.
* **Download report** — `m-wallet-feedback-<reportId>.json` via `Blob` +
  `URL.createObjectURL` + a temporary anchor, revoked afterwards. No network.
  The UI warns the file contains exactly what the tester typed.
* **Offline** — Send is unavailable and returns `offline`; Copy / Download still
  work. There is **no** persistent outbound queue and **no** automatic resend on
  reconnect. Draft text lives only in memory — a refresh loses it (by design,
  for privacy). Nothing the tester typed is written to `localStorage`.

---

## 6. Failure semantics

`submit` result codes (raw server bodies and fetch exceptions are never shown):
`disabled`, `not_configured`, `invalid_report`, `invalid_endpoint`, `offline`,
`sending`, `timeout`, `network_error`, `server_error` (4xx **and** 5xx),
`cancelled`, `copy_failed`, `download_failed`, `unknown_error`.

*"Feedback sent"* is shown **only** after a genuine `2xx` response. With no
endpoint the UI says to copy / download instead — never "sent". A failed send
keeps the form contents and offers Retry / Copy / Download.

Double-clicking Send produces **one** request (the button disables while
sending).

---

## 7. Known-issues workflow

Add an entry to `REGISTRY` in `js/beta/beta-known-issues.js` and ship a build:

```js
{ id: "MW-BETA-001", title: "Short summary", status: "workaround",
  affectedVersions: ["0.9.0-beta.10"], workaround: "What the tester can do." }
```

Statuses: `open | investigating | workaround | fixed-next-build`. IDs must be
unique. When the registry is empty the Hub shows *"No published known issues for
this build."* plus *"Beta software may still contain undiscovered issues."* — it
never says "there are no bugs". Do not publish raw internal security-finding
detail here.

---

## 8. Release-note workflow

`MWalletBetaOps.RELEASE_NOTES` holds a small curated record for the current
build (`version` + `highlights`). **CHANGELOG.md remains the canonical developer
history**; the beta record is a short tester-facing summary and is not parsed
from CHANGELOG at runtime. There is **no** runtime GitHub fetch and **no**
token. Update `RELEASE_NOTES.version` + `highlights` with each beta build so a
tester can confirm which build they are running before reporting.

---

## 9. Support channel

If `supportEmail` is configured (public, validated shape) the Hub shows it.
Otherwise it shows *"Direct support contact has not been configured for this
build."* — no address is invented. A configured support email is public data; it
carries no secret, and any future `mailto` must not auto-populate financial data.

---

## 10. Security escalation (see docs/BETA-ISSUE-TRIAGE.md)

Any report touching **account isolation, security, or data loss** stops normal
beta triage and is treated as a **release blocker**. Do not request sensitive
financial data or exploit credentials from the tester; reproduce with disposable
/ demo data.

---

## 11. Closed-beta signup / access requirements (BP12/BP13)

**Access restriction for the closed beta MUST be enforced by the actual
authentication / deployment system — never by a front-end JavaScript allowlist**
(a client-side email allowlist is not a security control and none exists in
`js/beta/*`). BP12/BP13 must review:

- [ ] Whether public signup is enabled in Supabase Auth.
- [ ] How beta-tester accounts are created / invited.
- [ ] Whether unauthorised new registrations are blocked.
- [ ] Custom SMTP readiness (verification / reset emails).
- [ ] Redirect URL configuration for the beta origin.
- [ ] The beta URL / domain decision (also the passkey RP ID — still deferred).

BP11 does **not** change any Supabase Auth setting.

---

## 12. BP12 feedback live-verification plan

1. Configure a real HTTPS beta feedback destination in `beta-config.js`.
2. Open a BP12 verification build.
3. Send a test bug report.
4. Verify the exact sanitised payload received.
5. Confirm **no** wallet contents.
6. Confirm **no** user UUID / owner id.
7. Confirm the email is **absent** without opt-in.
8. Confirm the email is present **only** with opt-in.
9. Confirm diagnostics are **absent** without opt-in.
10. Confirm **only** the safe diagnostics fields when selected.
11. Test offline (Send unavailable; Copy / Download still work).
12. Test the `~15 s` timeout.
13. Test endpoint `4xx` / `5xx` → `server_error`, no raw body shown.
14. Test a double Send click → one request.
15. Test the auth-gateway report control while signed out.
16. Test an owner-mismatch report → no wallet / owner details.
17. Test the copy / download fallback output.
18. Inspect the browser Network panel — no feedback traffic before Send.
19. Inspect Cache Storage — no feedback response cached (it is a cross-origin
    `POST`; the service worker returns early for both).
20. Reload the app repeatedly — zero automatic feedback traffic.

### BP12 closed-beta operations checklist

- [ ] Feedback endpoint / support route configured and verified
- [ ] Support email set (if desired)
- [ ] Public-signup policy reviewed
- [ ] Tester account creation / invite method decided
- [ ] Custom SMTP verified
- [ ] Redirect URLs verified
- [ ] Beta URL / domain decided
- [ ] Beta tester guide finalised (`docs/BETA-TESTER-GUIDE.md`)
- [ ] Known issues reviewed for the release build
- [ ] Release notes updated for the release build
- [ ] Test / demo-data guidance prepared
- [ ] Escalation path ready
- [ ] Feedback triage workflow ready (`docs/BETA-ISSUE-TRIAGE.md`)

---

## 13. What BP11 does NOT do

* Does **not** commit, push, merge, or edit `main`; does not start BP12/BP13.
* Does **not** enable BP8 cloud sync or BP9 passkeys; does not apply a Supabase
  migration; uses no `service_role` / `sb_secret_`; creates no second Supabase
  client.
* Does **not** add analytics, telemetry, advertising trackers, automatic crash
  uploads, automatic screenshots, or automatic DOM capture.
* Does **not** monkey-patch `console` or install a global error handler.
* Does **not** capture financial data in diagnostics or expose user UUIDs.
* Does **not** build a front-end beta access allowlist.
* Feedback operations never call `storage.save()`, change `mWalletData`, clear
  wallet data, trigger BP8 sync, or modify categories / reports / setup /
  walkthrough state.
