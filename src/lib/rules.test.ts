import { describe, expect, it } from "vitest";
import { getErp } from "./erp";
import { available, bankChanged, detectType, earliestPayDate, findCounterpart, findDuplicate, issuesFor, rowStatus, taxMismatch, totalsMatch } from "./rules";
import { contact, ctx, fund, invoice, line, receipt, TODAY } from "./testing";
import type { Doc } from "./types";

const codes = (doc: Doc, docs: Doc[] = [doc], contacts = [contact]) => issuesFor(doc, ctx(docs, contacts)).map((i) => i.code);
const later = { channel: "email" as const, by: "Sam", at: "2026-10-02T09:00:00" };

describe("totals", () => {
  it("match when lines add up", () => expect(totalsMatch(invoice())).toBe(true));
  it("do not match when a penny is off", () => expect(totalsMatch(invoice({ total: 12001 }))).toBe(false));
  it("allow a line with no tax, such as a tip", () => {
    expect(totalsMatch(receipt({ total: 1700, lines: [line(1000, 200), line(500, 0, { id: "l2", taxCode: "NONE" })] }))).toBe(true);
  });
  it("allow a refund", () => expect(totalsMatch(receipt({ total: -1200, lines: [line(-1000, -200)] }))).toBe(true));
});

describe("tax must follow the tax code", () => {
  const erp = getErp("xero");
  it("accepts tax worked out from the code", () => expect(taxMismatch(invoice(), erp)).toBe(false));
  it("accepts a few pence of rounding", () => expect(taxMismatch(invoice({ lines: [line(10000, 2003)] }), erp)).toBe(false));
  it("rejects 2.42 of tax under a 20% code on 29.33", () => {
    const tesco = receipt({ total: 3175, lines: [line(2933, 242)] });
    expect(taxMismatch(tesco, erp)).toBe(true);
    expect(codes(tesco)).toContain("tax_mismatch");
  });
});

describe("duplicates", () => {
  it("flags the later invoice with the same supplier and number", () => {
    const first = invoice();
    const second = invoice({ id: "i2", source: later });
    expect(findDuplicate(second, [first, second])?.id).toBe("i1");
    expect(findDuplicate(first, [first, second])).toBeUndefined();
  });
  it("ignores spaces and punctuation in the number", () => {
    const first = invoice({ number: "INV-2026-123" });
    const second = invoice({ id: "i2", number: "inv 2026 123", source: later });
    expect(findDuplicate(second, [first, second])?.id).toBe("i1");
  });
  it("does not flag a monthly subscription", () => {
    const september = receipt();
    const october = receipt({ id: "r2", paidOn: "2026-10-03", source: later });
    expect(findDuplicate(october, [september, october])).toBeUndefined();
  });
  it("flags the same receipt sent twice", () => {
    const a = receipt();
    const b = receipt({ id: "r2", source: later });
    expect(findDuplicate(b, [a, b])?.id).toBe("r1");
  });
});

describe("the same cost as an invoice and a receipt", () => {
  const paid = invoice({ status: "paid", payment: { accountId: "mmf", payOn: "2026-09-25" } });
  const confirmation = receipt({ merchant: "Carver Interiors", total: 12000, lines: [line(10000, 2000)], source: later });
  it("is found by party and amount, not by a flag", () => {
    expect(findCounterpart(confirmation, [paid, confirmation])?.id).toBe("i1");
    expect(codes(confirmation, [paid, confirmation])).toContain("counterpart");
  });
  it("can be overridden without silencing a duplicate warning", () => {
    const twin = receipt({ id: "r0", merchant: "Carver Interiors", total: 12000, lines: [line(10000, 2000)], paidOn: confirmation.paidOn });
    const kept = { ...confirmation, overrides: ["counterpart" as const] };
    const found = codes(kept, [paid, twin, kept]);
    expect(found).not.toContain("counterpart");
    expect(found).toContain("duplicate");
  });
});

describe("contact and bank details", () => {
  const changed = invoice({ documentBank: { accountName: "Carver Interiors", sortCode: "04-00-04", accountNumber: "91827364" } });
  it("detects changed details", () => expect(bankChanged(changed, contact)).toBe(true));
  it("ignores formatting", () => {
    expect(bankChanged(invoice({ documentBank: { accountName: "Mills", sortCode: "300069", accountNumber: "2256 3807" } }), contact)).toBe(false);
  });
  it("blocks until overridden", () => {
    expect(codes(changed)).toContain("bank_changed");
    expect(codes({ ...changed, overrides: ["bank_changed"] })).not.toContain("bank_changed");
  });
  it("blocks when the contact is not the supplier on the invoice", () => {
    expect(codes(invoice({ supplier: "Harbour & Finch" }))).toContain("contact_mismatch");
  });
  it("blocks a contact with no payment details", () => {
    expect(codes(invoice(), undefined, [{ ...contact, bank: null }])).toContain("missing_payment_details");
  });
});

describe("what can be paid", () => {
  it("refuses a zero or negative invoice", () => {
    expect(codes(invoice({ total: -12000, lines: [line(-10000, -2000)] }))).toContain("not_payable");
  });
  it("needs a description on every line", () => {
    expect(codes(invoice({ lines: [line(10000, 2000, { description: " " })] }))).toContain("no_description");
  });
});

describe("flags", () => {
  it("block while a value is uncertain", () => {
    expect(codes(receipt({ meta: { total: { origin: "document", uncertain: true } } }))).toContain("uncertain");
  });
  it("are ignored for a field this type does not have", () => {
    expect(codes(receipt({ meta: { dueOn: { origin: "document", uncertain: true } } }))).not.toContain("uncertain");
  });
});

describe("row status", () => {
  const status = (doc: Doc) => rowStatus(doc, issuesFor(doc, ctx([doc])));
  it("says Draft for a draft", () => {
    expect(status(invoice())).toMatchObject({ state: "Draft", detail: "Needs Review" });
    expect(status(receipt())).toMatchObject({ state: "Draft", detail: "Ready to submit", key: "ready" });
  });
  it("counts problems", () => expect(status(invoice({ total: 1 })).count).toBe(1));
  it("says Scheduled with the date, not Paid, before money moves", () => {
    expect(status(invoice({ status: "scheduled", payment: { accountId: "mmf", payOn: "2026-10-18" } }))).toMatchObject({ state: "Scheduled", detail: "18/10/2026" });
  });
  it("keeps a Ready to Pay invoice out of the ready group once it has an issue", () => {
    expect(status(invoice({ status: "ready_to_pay", total: 1 })).key).toBe("issues");
  });
});

describe("type detection", () => {
  it("treats a paid invoice as a receipt", () => {
    expect(detectType({ title: "Invoice", paidMarker: "PAID" }).type).toBe("receipt");
    expect(detectType({ title: "Invoice", cardLast4: "4242" }).type).toBe("receipt");
  });
  it("treats a payment request as an invoice", () => {
    expect(detectType({ title: "Invoice", hasBankDetails: true, hasDueDate: true }).type).toBe("invoice");
  });
  it("treats a part-paid invoice as an invoice", () => {
    expect(detectType({ title: "Invoice", cardLast4: "4242", paidMarker: "Deposit paid", balanceDue: 5000 }).type).toBe("invoice");
  });
});

describe("accounts", () => {
  it("cannot pay before the money has settled", () => {
    expect(earliestPayDate(fund, TODAY)).toBe("2026-10-07");
    expect(earliestPayDate(fund, "2026-10-03")).toBe("2026-10-06"); // from a Saturday
  });
  it("count scheduled payments against the balance", () => {
    const promised = invoice({ status: "scheduled", total: 30000, payment: { accountId: "mmf", payOn: "2026-10-18" } });
    expect(available(fund, [promised])).toBe(20000);
  });
});
