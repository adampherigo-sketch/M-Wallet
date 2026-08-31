# M-Wallet Beta — Internal Issue Triage Guide

Internal developer guide for handling closed-beta feedback. Testers never see
this vocabulary.

---

## Severity mapping

User-facing severities (`Blocks me / Major problem / Minor problem / Suggestion`)
map to internal severities, but **you set the real severity from the content**,
not from what the tester picked.

### BLOCKER
- Any **data loss** or suspected data loss.
- Any **account-boundary / isolation / security** failure (one account seeing or
  affecting another's data, an auth bypass, local ownership bypass).
- App **cannot be opened or used** at all.
- **Destructive or corrupting financial calculation** (totals, balances,
  recurrence, paid-state, savings accounting, M-Cash accounting, Reports maths
  producing wrong persisted values).

### MAJOR
- A major feature is **unusable**.
- **Repeatable incorrect financial behaviour** that is not corrupting persisted
  data (wrong display, wrong derived figure).
- An **auth flow significantly impaired** (sign-in / verification / reset works
  only intermittently).

### MINOR
- A **workaround exists** and the impact is limited.
- Cosmetic issues, isolated non-critical functionality, layout glitches.

### SUGGESTION
- Feature requests, UX improvements, wording.

---

## Issue lifecycle

`New → Triaged → Reproduced → In Progress → Fixed → Needs Retest → Closed`

- **New** — received, not yet looked at.
- **Triaged** — severity + area assigned; duplicates linked.
- **Reproduced** — reproduced locally (with **demo / disposable data**), or
  explicitly marked "could not reproduce" with what was tried.
- **In Progress** — being worked on.
- **Fixed** — a fix is merged; note the target build.
- **Needs Retest** — fix shipped in a build; waiting on tester or internal
  confirmation.
- **Closed** — verified fixed, won't-fix (with reason), or not-a-bug (with
  explanation).

Move BLOCKER/MAJOR items forward on every triage pass. A BLOCKER should not sit
in **New** past one triage cycle.

---

## Security / account-isolation / data-loss escalation

If a report involves potential **security, account isolation, or data loss**:

1. **STOP normal beta triage** for that report.
2. Treat it as a **release blocker** regardless of the tester's chosen severity.
3. **Do not** request passwords, passkeys, sign-in tokens, exploit payloads, or
   the tester's real wallet file.
4. Reproduce using **disposable / demo data** only.
5. Record the build version and the sanitised diagnostics that were submitted.
6. Do not discuss specifics in the public known-issues registry; keep the
   detail internal until fixed.

---

## Possible-data-loss response (operational script)

When a tester reports possibly lost or changed financial data:

1. Ask them to **stop making further destructive changes** in M-Wallet for now.
2. Ask whether they have a **local export** (Settings → My Data → Export). If
   yes, ask them to keep it safe; do **not** ask them to send the wallet file.
3. Collect the **app version** and the **sanitised diagnostics** from their
   report (or ask them to submit a new report with diagnostics included).
4. **Do not** ask for passwords, tokens, or account numbers.
5. Reproduce the reported flow with **demo data** and the same build.
6. Treat as **BLOCKER** until the mechanism is understood, even if it turns out
   to be a display-only issue.
7. If confirmed as real data loss: hold the release, write a regression test,
   fix, and add a known-issues entry with a workaround once one exists.

---

## Reproduction environment

- Use a throwaway browser profile and **demo / disposable financial data**.
- Never load a tester's real exported wallet.
- Match the reported **build version** where possible.
- Note OS / browser from the submitted user-agent string.

---

## What lands in the public known-issues registry

- Confirmed, non-sensitive issues with a clear tester-facing title.
- A **workaround** when one exists.
- Status: `open | investigating | workaround | fixed-next-build`.
- **Not** raw security-finding detail, internal severity codes, stack traces, or
  tester-identifying information.
