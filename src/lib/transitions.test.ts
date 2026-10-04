import { describe, expect, it } from "vitest";
import { contact, ctx, fund, invoice, line, receipt, wallet } from "./testing";
import { transition, type Action } from "./transitions";
import type { Doc, Invoice } from "./types";

const run = (doc: Doc, action: Action, docs: Doc[] = [doc]) => transition(doc, action, ctx(docs));
const ready = (over: Partial<Invoice> = {}) => invoice({ status: "ready_to_pay", ...over });
const schedule: Action = { type: "schedule", account: fund, payOn: "2026-10-20" };
const changedBank = { accountName: "Carver Interiors", sortCode: "04-00-04", accountNumber: "91827364" };

describe("an invoice cannot skip a state", () => {
  it("cannot be scheduled from draft", () => expect(run(invoice(), schedule).ok).toBe(false));
  it("cannot be marked paid from draft", () => expect(run(invoice(), { type: "mark_paid_outside", on: "2026-10-05" }).ok).toBe(false));
  it("cannot be marked ready while something blocks it", () => {
    expect(run(invoice({ documentBank: changedBank }), { type: "mark_ready" }).ok).toBe(false);
    expect(run(invoice({ total: 1 }), { type: "mark_ready" }).ok).toBe(false);
  });
  it("cannot be marked paid elsewhere with changed bank details", () => {
    expect(run(ready({ documentBank: changedBank }), { type: "mark_paid_outside", on: "2026-10-05" }).ok).toBe(false);
  });
  it("goes draft, ready, scheduled, processing, paid", () => {
    let doc: Doc = invoice();
    for (const action of [{ type: "mark_ready" }, schedule, { type: "start_processing" }, { type: "settle", ok: true }] as Action[]) {
      const result = run(doc, action);
      if (!result.ok) throw new Error(result.reason);
      doc = result.doc;
    }
    expect(doc).toMatchObject({ status: "paid", payment: { accountId: "mmf", payOn: "2026-10-20" } });
  });
});

describe("scheduling", () => {
  it("is refused the second time", () => {
    const first = run(ready(), schedule);
    expect(first.ok).toBe(true);
    if (first.ok) expect(run(first.doc, schedule).ok).toBe(false);
  });
  it("is refused when something blocks the invoice after it was marked ready", () => {
    expect(run(ready({ documentBank: changedBank }), schedule).ok).toBe(false);
  });
  it("is refused from an account in another currency", () => {
    expect(run(ready({ currency: "EUR" }), schedule).ok).toBe(false);
    expect(run(ready({ currency: "EUR" }), { type: "schedule", account: wallet, payOn: "2026-10-20" }).ok).toBe(true);
  });
  it("is refused before the account can pay", () => {
    expect(run(ready(), { ...schedule, payOn: "2026-10-06" }).ok).toBe(false);
  });
  it("is refused when the account is short, counting what is already scheduled", () => {
    const promised = invoice({ id: "i0", number: "INV-0", status: "scheduled", total: 45000, payment: { accountId: "mmf", payOn: "2026-10-18" } });
    const doc = ready();
    expect(run(doc, schedule, [promised, doc]).ok).toBe(false);
  });
});

describe("after scheduling", () => {
  const scheduled = ready({ status: "scheduled", payment: { accountId: "mmf", payOn: "2026-10-20" } });
  it("is not Paid until the bank says so", () => {
    const processing = run(scheduled, { type: "start_processing" });
    expect(processing.ok && processing.doc.status).toBe("processing");
    if (!processing.ok) return;
    const failed = run(processing.doc, { type: "settle", ok: false, reason: "Rejected" });
    expect(failed.ok && failed.doc).toMatchObject({ status: "payment_failed", payment: { failure: "Rejected" } });
  });
  it("cannot be settled twice", () => {
    const paid = { ...scheduled, status: "paid" as const };
    expect(run(paid, { type: "settle", ok: false }).ok).toBe(false);
  });
  it("can be cancelled back to Ready to Pay", () => {
    const result = run(scheduled, { type: "cancel_payment" });
    expect(result.ok && result.doc).toMatchObject({ status: "ready_to_pay", payment: undefined });
  });
  it("cannot be edited", () => expect(run(scheduled, { type: "edit", fn: (d) => d }).ok).toBe(false));
});

describe("editing", () => {
  it("sends a Ready to Pay invoice back to draft", () => {
    const result = run(ready(), { type: "edit", fn: (d) => ({ ...d, total: 12000 }) });
    expect(result.ok && result.doc.type === "invoice" && result.doc.status).toBe("draft");
  });
});

describe("receipts", () => {
  it("can be submitted when nothing blocks them", () => {
    const result = run(receipt(), { type: "submit" });
    expect(result.ok && result.doc.type === "receipt" && result.doc.status).toBe("submitted");
  });
  it("cannot be submitted while blocked", () => {
    expect(run(receipt({ lines: [line(1000, 200, { glCode: null })] }), { type: "submit" }).ok).toBe(false);
    expect(run(receipt({ total: 3175, lines: [line(2933, 242)] }), { type: "submit" }).ok).toBe(false);
  });
  it("cannot be submitted twice", () => {
    expect(run(receipt({ status: "submitted" }), { type: "submit" }).ok).toBe(false);
  });
  it("cannot be paid", () => expect(run(receipt(), schedule).ok).toBe(false));
});

describe("contacts used above", () => {
  it("exist", () => expect(contact.bank).not.toBeNull());
});
