# Code walkthrough

How Ledgerline fits together, in the order worth reading it. About 6,000 lines; the
logic that matters is in `src/lib/`, about 1,500 lines, and most of it is plain functions.

## 1. The shape of the data: `src/lib/types.ts`

- `Doc = Invoice | Receipt`, a discriminated union on `type`. An invoice has a supplier,
  contact, due date and bank details; a receipt has a merchant and a date paid. TypeScript
  will not let code read `dueOn` from a receipt.
- `InvoiceStatus`: `draft → ready_to_pay → scheduled → processing → paid`, with
  `payment_failed` as a side branch. `ReceiptStatus`: `draft → submitted`.
- Money is an integer number of pence (`total: number` in minor units). Never a float.
- `meta` records where each extracted value came from (`document`, `memory`, `user`,
  `missing`) and whether it is `uncertain`. This drives the "From document" labels and flags.
- `overrides` records warnings a person has looked at and accepted (a duplicate, a changed
  bank account), each separately.

## 2. The rules: `src/lib/rules.ts`

Pure functions: same input, same output, no side effects, easy to test.

- `issuesFor(doc, ctx)` returns everything wrong with a document: missing fields, totals that
  don't add up, tax that doesn't match its code, a duplicate, changed bank details, and so on.
  Each issue says whether it **blocks** the next step.
- `rowStatus(doc, issues)` turns that into what the list shows: "Draft · Needs Review",
  "Ready to Pay", "Scheduled · 08/12/2026".
- `findDuplicate` / `findCounterpart`: the same invoice twice (same supplier and number,
  ignoring spaces), or the same cost recorded as both an invoice and a receipt.
- `bankChanged`: the bank details printed on the invoice differ from the saved contact.
- `detectType`: decides invoice or receipt from evidence of payment, not from the title.
- `earliestPayDate`, `available`: settlement days, and the balance left after payments
  already scheduled.

## 3. The state machine: `src/lib/transitions.ts`

One function, `transition(doc, action, ctx)`, returns either the next document or a refusal
with a reason. **Every** change of state goes through it.

| Action | Allowed from | Refused when |
| --- | --- | --- |
| `edit` | draft, ready to pay | anything later; editing a ready invoice sends it back to draft |
| `mark_ready` | draft invoice | anything blocks it |
| `schedule` | ready to pay | blocked, wrong currency, too early for the account, not enough money |
| `start_processing` | scheduled | |
| `settle` | processing | becomes `paid`, or `payment_failed` with the reason |
| `retry_payment` / `cancel_payment` | payment failed / scheduled | |
| `mark_paid_outside` | ready to pay | anything blocks it |
| `submit` | draft receipt | anything blocks it |

Why it matters: a button can be hidden in one screen and forgotten in another. Here the
rule lives in one place, so a second click, a second browser tab or a stale selection
cannot pay twice or skip a step: the second attempt is refused.

## 4. The store: `src/lib/store.tsx`

React context plus a reducer, saved to `localStorage`. The largest file, because it is
where the mock "backend" meets the UI.

- Screens call `actions.*`. Actions that change state call `move(id, action)`, which runs
  `transition()` and only then saves the result. A refused move shows a toast.
- `current` is a ref kept in step with the reducer, so code running after a delay (a timer,
  an awaited request) reads the latest state, not a stale copy.
- Payments: `schedule` → (on the date) `process` takes the money and calls
  `api.settlePayment` → `paid`, or `payment_failed` and the money goes back.
- On reload, nothing in flight is assumed to have worked: documents being read, synced or
  paid are asked about again (`resume`).
- Two browser tabs stay in step through the `storage` event.

## 5. The mock backend: `src/lib/api.ts`, `seed.ts`, `samples.ts`

- `api.ts`: the four calls a server would answer (read a file, schedule a payment, settle
  it, sync to the ERP), as promises with delays. Some fail once on purpose, so every
  failure path can be shown.
- `seed.ts`: the demo data, one document for each edge case.
- `samples.ts`: the scripted results for "Add sample files" on the upload screen.

## 6. Accounting systems: `src/lib/erp.ts`

An adapter per ERP: GL accounts, tax codes (as whole percentages), the "no tax" code, extra
required fields. Xero and NetSuite are mocked. Nothing in the UI hard-codes a code. Adding
another system means adding an adapter.

## 7. Money and lines: `src/lib/money.ts`, `lines.ts`

- `parseMoney("1,204.50")` reads the digits as text into pence; no `parseFloat`.
- Tax is calculated from the tax code and rounded half away from zero, so a refund mirrors
  its purchase.
- Invoices are typed as quantity × unit price before tax; receipts as the amount paid with
  tax included. Changing a line's tax code re-works the tax but keeps the right amount.

## 8. Screens: `src/components/`

- `payments/PaymentsPage.tsx`: the tabs, filters, search and selection. Rows are worked out
  once (`rowStatus` per document) and shared by the counts, filters and table.
- `payments/DocTable.tsx`: one row component for both types; the main action sits last.
- `payments/UploadPage.tsx`: the batch; it lives in the store so it survives opening a file.
- `review/ReviewPage.tsx`: the largest screen: fields, alerts, checklist, footer per state.
- `review/DocumentPreview.tsx`: the mock document, drawn from data so a field can highlight
  its place on the page.
- `payments/ConfirmPage.tsx`: account choice, balance, dates, exceptions first.
- `ui/`: small components. `Select` and `DateInput` are custom so they match the design and
  stay on screen; positioning is in `anchor.ts`.

## 9. Tests: `src/lib/*.test.ts`

65 tests with Vitest, on the logic only:

- `rules.test.ts`: totals, tax, duplicates, bank details, flags, row status, type detection.
- `transitions.test.ts`: every state change, and every way one is refused.
- `convert.test.ts`: switching a document between invoice and receipt loses nothing.
- `lines.test.ts`: money parsing and line arithmetic.

## Why it’s built this way

- **Why a discriminated union and not one type with optional fields?** Impossible states
  can't be written: a receipt with a due date, an invoice without a supplier field.
- **Why integers for money?** `0.1 + 0.2 !== 0.3` in floating point; with pence, sums are exact.
- **Why one transition function?** One place to read and test what is allowed. It replaced
  rules scattered across screens, which was the source of most defects in the self-review.
- **What runs on a server in a real build?** Everything in `transitions.ts` and `rules.ts`,
  again, with an idempotency key on every payment. The browser copy is for speed.
- **What would you change first?** A real backend; then split `store.tsx` into the
  reducer, the payment flow and persistence; then end-to-end tests of the main flows.
