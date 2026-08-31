# P2.5 Foundation Tests

This directory contains only the P2.5.0-P2.5.2 foundation.

## Frozen fixture

`fixtures/august-october-2026.js` is copied from the approved **M-Wallet Three-Month Realistic Usage Trial** supplied for this work. It is the sole fixture source. Inputs and expected results are separate:

- `inputs` contains the exact paycheck, bill, expense, one-time income, savings deposit, goal allocation, and goal release records.
- `expected` contains the approved monthly totals, starting and ending checking balances, continuity values, savings balances, and selected running-ledger values.

The source report labels these values simulated/calculated rather than runtime verified. Foundation tests verify that the frozen contract is internally consistent; they do not claim that the full financial scenario has been executed.

## Storage harness

`helpers/storage-harness.js` loads the unchanged production file `js/storage.js` through `node:vm`. Each harness has its own in-memory `localStorage` implementation with browser-compatible string conversion, `length`, `key`, and CRUD behavior. No host browser storage is used.

The harness provides:

- deterministic timestamps and IDs;
- preloaded raw storage and corrupt-storage support;
- `failWrites` simulation at `localStorage.setItem`;
- raw storage and parsed data inspection;
- reset and cleanup capability.

The harness exposes the real `window.BudgetStorage` object. It does not reimplement M-Wallet financial calculations.

## Auth tests (BP2 / BP3)

`auth-architecture.test.js`, `auth-ui.test.js`, and `auth-data-safety.test.js`
load the real `js/auth/*.js` modules through `node:vm` with a **stubbed Supabase
library** and, for the UI, a minimal DOM stub (`helpers/dom-stub.js`). There is
**no network and no real Supabase project**. They cover the account state model,
the `signUp` / `signIn` / `resetPassword` / `updatePassword` /
`resendVerification` API (safe result objects, input validation, error mapping,
no token/password logging), the gateway show/hide + view wiring, and that no
auth operation ever reads or writes `localStorage["mWalletData"]`.

## Running

Node.js is required. From the repository root:

```text
npm test
```

The runner uses only `node:test` and `node:assert/strict`; no external testing packages are required.

## Scope boundary

These tests stop at P2.5.2. They do not seed or execute the complete August-to-October financial scenario through production storage. That regression work begins at P2.5.3 and is intentionally paused.
