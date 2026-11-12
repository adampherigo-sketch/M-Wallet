# BP13 — Founding Tester Welcome + launch countdown (build spec)

**Status:** spec for review. Nothing in this document is built yet.
**Approved design:** <https://claude.ai/artifact/GHrkXHmxp5FBwa9gp2p4hN> (owner-only link)
**Builds on:** PR #15, the one-time "Welcome, beta tester" screen
(`js/beta/beta-welcome.js`, `#mw-beta-welcome`, `css/beta-welcome.css`).

---

## 1. What we are building

After a Founding Tester creates an account and verifies their email, they
land on the **Founding Tester Welcome** screen instead of the app. It covers
the program's mission, rewards and expectations, and gives a short tour of
what M-Wallet does.

Where the bottom nav bar normally sits, a **countdown bar** counts down to
the beta launch. Until launch the tester **cannot enter the app**. At launch
the bar changes to **"Beta testing is open → Start using M-Wallet"**. Tapping
it starts the existing first-run setup (BP5), then the guided tour (BP6),
then the app.

### Approved program facts

| Item | Value |
|---|---|
| Program | M-Wallet Founding Beta Tester Program |
| Company | Zevaryn Systems |
| Testers | 5 |
| Launch | **1 January 2027, 12:00 AM Eastern** = `2027-01-01T05:00:00Z` |
| Testing window | 1 January 2027 to 30 June 2027 (6 months) |
| Window ends | 30 June 2027, 11:59 PM Eastern = `2027-07-01T03:59:59Z` |
| Platforms | iPhone, Android, Windows (browser / installed PWA) |
| Support | `beta@zevarynsystems.com` and Settings → Beta Hub |

### What qualifies a tester for the rewards

Both of these are required:

1. Use M-Wallet during the beta.
2. Submit at least one report in their own words covering how the app worked
   for them, any issues they ran into, and their suggestions.

### Rewards

1. One year of Premium, free, after public release.
2. A lifetime 50% discount on annual Premium after the free year.
3. A permanent Founding Beta Tester badge.
4. A custom app icon.
5. Early access to selected future features.

Planned Premium features (context only, not shown on this screen): M-Cash,
and tracking multiple checking, savings and credit card accounts.

---

## 2. Where it sits in the sign-in flow

Unchanged steps are plain; new or changed steps are **bold**.

```
invite email → set password / verify
  → BP4 ownership   (fail-closed; a fresh device auto-claims, no screen)
  → BP8 bootstrap   (fail-open)
  → **Founding Tester Welcome**   (the #15 slot: betaWelcomeGuard)
        before launch: HOLD, countdown bar, no way into the app
        at/after launch: "Start using M-Wallet" → acknowledge
  → BP5 first-run setup   (opening balances)
  → BP6 guided tour
  → app
```

`js/auth/auth-ui.js` already calls `betaWelcomeReleased()` between the
bootstrap and setup guards, and `setup-ui.js` / `walkthrough-ui.js` already
wait while `MWalletBetaWelcome.isPresenting()` is true. **No change to
the gate chain is needed**; only the guard's decision changes.

---

## 3. Behaviour

### 3.1 Who sees the screen

The screen shows when every one of these is true:

- auth is configured, the user is signed in, and recovery mode is off;
- BP4 ownership is verified (`owned` / `fresh_claimed`);
- the user is **not** staff (see 3.4);
- **either** the beta has not launched yet (always shown; it cannot be
  dismissed) **or** it has launched and this account has not acknowledged
  the welcome on this device.

### 3.2 Before launch (locked)

- The full welcome content is shown and scrolls.
- The countdown bar is pinned to the bottom. It shows DAYS · HOURS · MIN ·
  SEC and "January 1, 2027 · 12:00 AM Eastern".
- The screen has no Start or Get Started button and no close button. Escape
  does nothing.
- **Sign out** stays reachable through a small text link in the header, so a
  tester on a shared device is never trapped.
- **Report a beta problem** stays reachable (the existing BP11 dialog).
- When the countdown reaches zero while the screen is open, the bar switches
  to the open state **without a reload**.

### 3.3 At and after launch

- The bar shows "● BETA TESTING IS OPEN" and a **Start using M-Wallet**
  button.
- Tapping the button records the acknowledgement (per account, per device,
  as #15 already does), closes the screen, and lets BP5 setup run.
- A tester who joins after launch sees the screen once, already in the open
  state.
- From Settings → Beta Hub, **Founding Tester welcome** reopens the screen in
  "manual" mode. In that mode the bar shows a **Close** button instead of the
  countdown or Start.
- After the window ends (`2027-07-01T03:59:59Z`) the screen no longer
  auto-shows. The Beta Hub row stays available.

### 3.4 Staff bypass (your account)

Staff accounts never see the lock and can use the app before launch. The
bypass is decided **server-side** (see 4.2) by checking the signed-in user
id against a staff table. No email, user id or allowlist is ever written into
front-end code.

### 3.5 Where the time comes from

- The launch time and the **current time** come from Supabase through one
  RPC, `beta_program_status()` (4.2). The device clock is never trusted while
  online.
- On load, the client stores `offset = serverNow − Date.now()` and ticks the
  countdown locally once a second using `Date.now() + offset`.
- It re-fetches when the app comes back online, when the tab becomes visible,
  and every 15 minutes while the screen is open.
- **Offline or if the RPC fails:** fall back to the committed constant
  `LAUNCH_AT = "2027-01-01T05:00:00Z"` and the device clock. This is an
  experience gate, not a security boundary, because a tester's financial data
  is their own local data, so a clock-changing tester gains nothing harmful.
- **The RPC returns `bypass: true`:** the screen never holds.

### 3.6 Failure behaviour

The screen keeps #15's **fail-open** rule. If `beta-welcome.js` is missing or
throws, sign-in, setup and the app keep working. Only an explicit
`{ release: false }` from a working guard holds the app.

---

## 4. Supabase

New migration `supabase/migrations/20261112_bp13_beta_program.sql`, applied
manually in the SQL Editor (the same process as BP7).

### 4.1 Tables

```sql
-- One row: the program's schedule. Readable only through the RPC.
create table public.beta_program (
  id          smallint primary key default 1 check (id = 1),
  launch_at   timestamptz not null,
  ends_at     timestamptz not null,
  updated_at  timestamptz not null default now()
);
insert into public.beta_program (launch_at, ends_at)
values ('2027-01-01T05:00:00Z', '2027-07-01T03:59:59Z');

-- Staff who bypass the countdown (your account). Managed in the dashboard.
create table public.beta_staff (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.beta_program enable row level security;
alter table public.beta_staff   enable row level security;
-- No policies: neither table is readable or writable from the browser.
-- The RPC below is the only way in.
```

### 4.2 RPC

```sql
create or replace function public.beta_program_status()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'launch_at', p.launch_at,
    'ends_at',   p.ends_at,
    'now',       now(),
    'is_open',   now() >= p.launch_at,
    'bypass',    exists (select 1 from public.beta_staff s where s.user_id = auth.uid())
  )
  from public.beta_program p
  where p.id = 1;
$$;

revoke all on function public.beta_program_status() from public, anon;
grant execute on function public.beta_program_status() to authenticated;
```

- `security definer` lets the RPC read the locked tables. It only ever
  reports on the **caller's own** `auth.uid()`.
- To move the launch date, update the `beta_program` row. **No app release is
  needed.**
- To add your account, insert your user id from Authentication → Users into
  `beta_staff`.

### 4.3 Optional: founding tester tracking (decision D3)

An admin-only table for checking off who qualifies. It has no browser access
and is managed in the dashboard.

```sql
create table public.founding_testers (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  invited_at        timestamptz,
  report_received   boolean not null default false,
  report_received_at timestamptz,
  qualified         boolean not null default false,
  notes             text
);
alter table public.founding_testers enable row level security;
-- No policies: dashboard / service role only.
```

### 4.4 Supabase dashboard settings (already planned)

- Public sign-ups **off**; testers are invited from Authentication → Users.
- Site URL `https://mwallet.zevarynsystems.com/`; Redirect URLs include
  `https://mwallet.zevarynsystems.com/**`.

---

## 5. Front-end changes

### 5.1 `js/beta/beta-welcome.js` (rework #15's module)

- Rename the screen and its copy to the Founding Tester Welcome (section 6).
- Replace `RETIRE_ON` with a schedule object: the RPC result or the committed
  fallback `{ launchAt, endsAt }`, plus the server `offset` and `bypass`.
- New pure function, unit-tested:
  `decide({ auth, ownershipVerified, acknowledged, schedule, now, bypass })`
  → `{ show, phase: "locked" | "open" | "manual" | null, reason }`.
  - `bypass` → `show: false`, reason `staff`.
  - `now < launchAt` → `show: true`, phase `locked` (ignores `acknowledged`).
  - `now ≥ endsAt` → `show: false`, reason `ended`.
  - otherwise → `show: !acknowledged`, phase `open`.
- New pure function `countdown(msLeft)` → `{ days, hours, mins, secs }`, with
  hours, minutes and seconds zero-padded.
- The guard returns `{ release: false }` for `locked`, and for `open` until
  acknowledged.
- Fetch status through the **one existing Supabase client**
  (`MWalletAuth._getClient()`), with `rpc("beta_program_status")`. No second
  client.
- One `setInterval` (1 s) runs only while the screen is visible, and is
  cleared on hide.
- Storage key bump: `mwallet.betaWelcome.v1` → **`v2`**, so anyone who
  dismissed #15's screen still sees the new one. It stores metadata only and
  never touches `mWalletData`.
- Keep the fail-open shape, the `textContent`-only rendering, and the
  `mwallet:beta-welcome-changed` event.

### 5.2 `index.html` → `#mw-beta-welcome`

- Replace the inner content with the approved sections (section 6). Keep the
  existing `role="dialog"`, `aria-modal`, `aria-labelledby` and hidden
  attributes.
- Add the pinned bar `<footer class="mw-bw-bar">` with three states:
  - `[data-bw-phase="locked"]`: the four countdown cells plus the date line.
  - `[data-bw-phase="open"]`: the open indicator plus a **Start using
    M-Wallet** button.
  - `[data-bw-phase="manual"]`: a **Close** button.
- Header: the logo, "M-WALLET / ZEVARYN SYSTEMS", a "PRIVATE BETA" pill, and
  a **Sign out** text button.
- Rename the Beta Hub row label to **Founding Tester welcome**.
- Remove #15's "I understand this is pre-release software" checkbox. If you
  want to keep it, it moves into the open state above the Start button
  (decision D2).

### 5.3 `css/beta-welcome.css`

- Full-screen layout at phone width. Content scrolls inside the screen.
- The bar is `position: sticky; bottom: 0`, with padding that includes
  `env(safe-area-inset-bottom)`.
- Use the existing Zevaryn Grid tokens: `--z-bg`, `--z-panel`, `--z-border`,
  `--z-text`, `--z-text-secondary`, `--z-violet`, `--z-violet-bright`,
  `--z-violet-strong` (white button text, 4.7:1), `--z-teal`, plus the radii
  tokens.
- Inline SVG icons, the same stroke style as the app (`stroke-width: 1.9`).
  No emoji.
- Desktop (1024 px and wider): content column max 640 px, centered. The bar
  spans that column.
- `prefers-reduced-motion`: no animation on the seconds cell.

### 5.4 Other files

- `js/beta/beta-ops.js` Beta Hub limitations: add "Beta testing opens January
  1, 2027" while locked. Update What's New for this build.
- `js/app-version.js` + `package.json`: `0.9.0-beta.11` → **`0.9.0-beta.12`**.
- `service-worker.js`: `CACHE_NAME` → **`m-wallet-v33`**.
- `index.html`: bump `?v=` for `beta-welcome.js`, `beta-welcome.css`,
  `beta-ops.js`, `app-version.js`.
- CSP: no change. The RPC goes to `*.supabase.co`, which is already allowed.
- `CHANGELOG.md`, `README.md`: add a BP13 entry.

---

## 6. Approved copy (verbatim)

**Header:** M-WALLET · ZEVARYN SYSTEMS · `PRIVATE BETA` · Sign out

**Hero**
- Chip: ✓ Account verified
- Eyebrow: FOUNDING BETA TESTER PROGRAM
- Title: **Welcome, Founding Tester.**
- Body: You're one of five people getting M-Wallet before anyone else. Over
  the next six months you'll help shape it, and you'll be recognized as part
  of where it all began.

**OUR MISSION**
- Zevaryn Systems builds private, dependable tools that help people see and
  take control of their money.
- **Collaboration.** You help shape the product through real-world use and
  honest feedback.
- **Improvement.** Every issue and suggestion you send makes M-Wallet more
  reliable and easier to use.
- **Recognition.** Founding testers receive lasting benefits as thanks for
  their time.

**THE PROGRAM AT A GLANCE**
- Founding testers: **5**
- Testing window: **6 months**
- Beta opens: **Jan 1, 2027**
- Beta closes: **Jun 30, 2027**
- Works on: **iPhone · Android · Windows**

**WHAT YOU GET**
1. **1 year of Premium, free.** A full year of Premium at no cost after
   M-Wallet's public release.
2. **50% off Premium, for life.** After your free year, a permanent 50%
   discount on the annual Premium plan.
3. **Founding Beta Tester badge.** A permanent badge on your account marking
   you as an original contributor.
4. **Your own custom app icon.** A personalized M-Wallet logo made just for
   you.
5. **Early access to new features.** Try selected features before they're
   released to everyone.

Box: **To earn your rewards**
- ✓ Use M-Wallet during the beta.
- ✓ Submit at least one report in your own words: how the app worked for
  you, any issues you ran into, and your suggestions.

**WHAT WE ASK OF YOU**
- **Use it for real.** Track your actual money in everyday situations.
- **Explore everything.** Try every feature and flag anything confusing.
- **Report what breaks.** Crashes, wrong totals, saving or display problems.
- **Tell us what you think.** Honest feedback on what works and what doesn't.
- Footer: Report problems from **Settings → Beta Hub**, or email
  beta@zevarynsystems.com. Include the steps that led to the problem when you
  can.

**WHAT M-WALLET DOES**
- **Total balance.** Checking, savings and cash in one number.
- **Budget & bills.** Income, bills and spending, month by month.
- **Savings goals.** Set aside money and watch goals fill up.
- **M-Cash.** Count the physical cash you have on hand.
- **Reports.** Monthly, yearly and custom-range insights.
- **Sync everywhere.** Your wallet, up to date on every device.
- Note: Private by design: no ads, no trackers, and it works offline.

**Closing**
- **Thank you for being part of the beginning.**
- Built by Zevaryn Systems. Improved together.

**Countdown bar**
- Locked: BETA TESTING OPENS IN · `DAYS` `HOURS` `MIN` `SEC` · January 1,
  2027 · 12:00 AM Eastern
- Open: ● BETA TESTING IS OPEN · [Start using M-Wallet]
- Manual (from the Beta Hub): [Close]

---

## 7. Accessibility

- The screen keeps `role="dialog"` + `aria-modal="true"`. Focus moves to the
  title on open, and focus is trapped inside (#15 already does both).
- The countdown is `role="timer"` with `aria-live="off"`, so screen readers
  don't announce every second. A visually hidden `aria-live="polite"` line
  updates **once a minute** ("Beta testing opens in 49 days, 3 hours").
- The phase change to open is announced politely once: "Beta testing is
  open."
- All touch targets are at least 44 px. Text contrast is at least 4.5:1 using
  the token colors listed in 5.3.
- Real `<button>` elements are used for Sign out, Start, Close and Report.

---

## 8. Tests (`tests/beta-welcome.test.js`, extended)

Pure logic:
- `decide()`: locked before launch even when acknowledged; open after launch
  until acknowledged; hidden after acknowledgement; hidden after `endsAt`;
  hidden for staff (`bypass`); hidden when signed out, unconfigured, in
  recovery, or with ownership pending.
- `countdown()`: zero-padding, day rollover, 0 at or after launch, never
  negative.
- Clock source: uses the server offset when present; falls back to
  `LAUNCH_AT` plus the device clock when the RPC fails or the device is
  offline.

Integration (DOM stub):
- A locked tester is held: `auth-ui` keeps the app gated and setup and the
  tour don't render.
- No Start or Close in the locked phase, and Escape doesn't close it.
- Crossing launch while open flips to the open phase without reload.
- Start → acknowledgement written to `mwallet.betaWelcome.v2` → setup gate
  appears.
- Staff bypass goes straight to setup and the app.
- Fail-open: the module missing, throwing, or the RPC rejecting never traps
  a verified owner past launch.
- Zero writes to `mWalletData`.

Static:
- No Supabase key, user id or email allowlist in `beta-welcome.js`.
- The RPC is called through the shared client only.
- `LAUNCH_AT` fallback equals `2027-01-01T05:00:00Z`.
- Version, `?v=` and `CACHE_NAME` bumps are present.

SQL (live, after the migration):
- An anonymous call is denied.
- An authenticated tester gets `bypass: false`.
- A staff account gets `bypass: true`.
- Direct selects on `beta_program`, `beta_staff` and `founding_testers` are
  denied.

---

## 9. Rollout checklist

1. Approve this spec (and decisions D1–D3 below).
2. Build on a branch, with `npm test` green. Open a PR.
3. Run the migration in the Supabase SQL Editor. Insert your user id into
   `beta_staff`.
4. Merge, then on a real phone check: a tester account is locked with a live
   countdown, and your account goes straight in.
5. **Rehearse launch:** temporarily set `launch_at` to five minutes from now
   on a test account's project. Watch the flip, tap Start, go through setup
   and the tour, then set it back to `2027-01-01T05:00:00Z`.
6. Invite testers (public sign-ups off).

---

## 10. Decisions still needed

| # | Question | Recommendation |
|---|---|---|
| D1 | Can a tester still open Settings → My Data → Export, or Report a problem, while locked? | Report: yes (as specified). Export: not needed, since nobody has data before launch. |
| D2 | Keep #15's "I understand this is pre-release software" checkbox above Start? | Keep it. It's cheap, and it records consent before real use. |
| D3 | Add the `founding_testers` tracking table now? | Yes. It's dashboard-only, and it gives you one place to mark who qualifies. |
