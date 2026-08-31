# M-Wallet Beta — Tester Guide

Thank you for helping test M-Wallet. This guide explains what the beta is, how
to report problems, and how to keep your data safe while testing.

---

## What this beta is

M-Wallet is a **local-first personal budgeting Progressive Web App**. Your
financial data lives **in your browser, on your device**. In this build nothing
financial is uploaded — cloud sync and passkeys are built but switched **off**
until a pre-beta security review.

**This is pre-release software.** Please report anything that looks incorrect —
**especially missing or changed financial information**. Beta software may still
contain undiscovered issues. Data loss is not expected, but a beta is exactly
when to be careful.

---

## How to identify your build

Open **Settings → Beta Hub**. It shows:

- **Version** — e.g. `0.9.0-beta.10`
- **Feedback delivery** — whether reports can be sent in-app or must be copied /
  downloaded
- **Known issues** — issues the team has already acknowledged for this build
- **What's new** — a short summary of what changed
- **Current beta limitations** — derived from the live build

Always check your **Version** before reporting, so we know which build you saw
the problem in. Each new beta build updates the version, what's-new, and known
issues.

---

## How to report a problem

You can open the report form from:

- **Settings → Beta Hub → "Report a beta problem"**, or
- the **"Report a beta problem"** link on the sign-in screen (use this if you
  can't get into the app).

Fill in:

1. **Type** — Bug, Data issue, Performance issue, Usability / UX, Feature
   request, or Other.
2. **How much does it affect you?** — Blocks me / Major problem / Minor problem /
   Suggestion.
3. **Short title** and **Description**.
4. Optionally: **Steps to reproduce**, **What you expected**, **What actually
   happened**.

Then choose:

- **Send** — transmits the report (only if a feedback destination is configured
  for this build).
- **Copy report** — copies a plain-text summary you can paste into an email or
  chat.
- **Download report** — saves a `.json` file you can attach to an email.

**Nothing is sent until you press Send.** Copy and Download never use the
network.

### What information helps reproduce a bug

- The exact steps you took, in order.
- What you expected vs. what happened.
- Whether it happens every time or occasionally.
- Your build **version**.
- The screen you were on.
- Optionally, the **technical diagnostics** (see below).

---

## Technical diagnostics (optional)

Tick **"Include technical diagnostics"** to attach:

app version, build channel, the screen you were on, online/offline, whether
M-Wallet is installed as an app, whether offline support is active, your viewport
size, your browser's user-agent string, your language, your sign-in *state*
(signed in / signed out — never your email or account id), and whether cloud
sync / passkeys / feedback delivery are enabled in this build.

Press **"View diagnostics"** to see exactly what will be included before you
send. Diagnostics **never** contain your balances, transactions, bills, savings,
M-Cash, notes, category contents, account email, or any sign-in token.

Tick **"Include my email"** separately if you're happy for the beta team to
follow up. It is off by default and is not stored.

---

## What NOT to put in a report

**Please do not include:**

- passwords or passkeys
- account numbers, card numbers, or bank details
- your account balances or a copy of your full wallet
- sign-in tokens or anything from browser developer tools' storage
- Social Security / national ID numbers

A short written description of the problem is enough. For a **Data issue**, tell
us *what* looks wrong (e.g. "August total is £120 lower than it should be"), not
the underlying numbers.

---

## If you're offline

Send won't be available. Use **Copy report** or **Download report** and send it
to us when you're back online. M-Wallet does **not** queue reports in the
background and will **not** resend automatically.

The report form's text is not saved — if you refresh the page mid-report you'll
lose the draft. This is deliberate, to avoid keeping what you typed on your
device.

---

## Keep an export while testing

M-Wallet can export your wallet as a file: **Settings → My Data → "Export wallet
backup"**. Before testing important financial changes, keep a current export.

The export file is **not encrypted** — it contains your financial data in plain
JSON. Store it somewhere private. It contains no password and no sign-in token.
You can restore it later from **Settings → My Data → "Restore from a backup"**.

---

## Local data warning

Because cloud sync is off, your wallet exists **only** on the device you're using
it on. Clearing your browser's site data, or using **Settings → My Data → "Erase
wallet from this device"**, removes it. An export is your only recovery.

---

## Updating to a new beta build

M-Wallet is a PWA and caches itself for offline use. To get a new build:

1. Close all M-Wallet tabs / windows.
2. Reopen M-Wallet. The service worker fetches the new version in the
   background; a second reopen (or the in-app update prompt) activates it.
3. If it still looks unchanged, reload the page, or (last resort) clear the
   site's cache from your browser settings — **note that also clears your local
   wallet**, so export first.
4. Confirm the new **Version** in Settings → Beta Hub.

Each build's **What's new** and **Known issues** are updated so you can tell what
changed.

---

## Support expectations

This is a small closed beta. We read every report. Response times vary. If a
support email is configured for your build it's shown in **Settings → Beta Hub →
Support**; if not, use the in-app report form (Copy / Download and send it to
whoever invited you).

We will **never** ask you for your password, a passkey, a sign-in token, or your
full wallet file.
