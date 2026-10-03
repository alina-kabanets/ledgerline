import { describe, expect, it } from "vitest";
import { getErp } from "./erp";
import { parseMoney } from "./money";
import { arrivesLate, bankChanged, detectType, findDuplicate, issuesFor, rowStatus, totalsMatch } from "./rules";
import type { Account, Contact, Doc, Invoice, Receipt } from "./types";

const base = {
  fileName: "x.pdf",
  source: { channel: "upload" as const, by: "Sam", at: "2026-10-01T09:00:00Z" },
  entity: "Acme Ltd",
  currency: "GBP" as const,
  meta: {},
  extraction: "done" as const,
  typeReason: "",
  sync: "not_synced" as const,
};

const line = (net: number, tax: number) => ({
  id: "l1",
  description: "Thing",
  quantity: 1,
  unitAmount: net,
  tax,
  glCode: "429",
  taxCode: "INPUT2",
});

const contact: Contact = {
  id: "c1",
  name: "Carver Interiors",
  bank: { accountName: "Carver Interiors", sortCode: "30-00-69", accountNumber: "22563807" },
  paidBefore: 4,
};

const invoice = (over: Partial<Invoice> = {}): Invoice => ({
  ...base,
  id: "i1",
  type: "invoice",
  status: "draft",
  supplier: "Carver Interiors",
  number: "INV-1",
  reference: "",
  issuedOn: "2026-09-20",
  dueOn: "2026-10-20",
  contactId: "c1",
  documentBank: contact.bank,
  total: 12000,
  lines: [line(10000, 2000)],
  ...over,
});

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  ...base,
  id: "r1",
  type: "receipt",
  status: "draft",
  merchant: "Figma",
  paidOn: "2026-09-03",
  total: 1200,
  lines: [line(1000, 200)],
  ...over,
});

const ctx = (docs: Doc[]) => ({ docs, contacts: [contact], erp: getErp("xero"), today: "2026-10-03" });

describe("totals", () => {
  it("match when lines add up", () => expect(totalsMatch(invoice())).toBe(true));
  it("do not match when a penny is off", () => expect(totalsMatch(invoice({ total: 12001 }))).toBe(false));
  it("allow a line with no tax, such as a tip", () => {
    const r = receipt({ total: 1700, lines: [line(1000, 200), { ...line(500, 0), id: "l2", taxCode: "NONE" }] });
    expect(totalsMatch(r)).toBe(true);
  });
  it("allow a refund", () => expect(totalsMatch(receipt({ total: -1200, lines: [line(-1000, -200)] }))).toBe(true));
});

describe("duplicates", () => {
  it("flags the later invoice with the same supplier and number", () => {
    const first = invoice();
    const second = invoice({ id: "i2", source: { ...base.source, at: "2026-10-02T09:00:00Z" } });
    expect(findDuplicate(second, [first, second])?.id).toBe("i1");
    expect(findDuplicate(first, [first, second])).toBeUndefined();
  });
  it("does not flag a monthly subscription", () => {
    const september = receipt();
    const october = receipt({ id: "r2", paidOn: "2026-10-03" });
    expect(findDuplicate(october, [september, october])).toBeUndefined();
  });
  it("flags the same receipt sent twice", () => {
    const a = receipt();
    const b = receipt({ id: "r2", source: { ...base.source, channel: "whatsapp", at: "2026-10-02T09:00:00Z" } });
    expect(findDuplicate(b, [a, b])?.id).toBe("r1");
  });
});

describe("bank details", () => {
  const changed = invoice({ documentBank: { accountName: "Carver Interiors", sortCode: "04-00-04", accountNumber: "91827364" } });
  it("detects a change", () => expect(bankChanged(changed, contact)).toBe(true));
  it("blocks until confirmed", () => {
    expect(issuesFor(changed, ctx([changed])).some((i) => i.code === "bank_changed" && i.blocking)).toBe(true);
    const confirmed = { ...changed, bankChangeConfirmed: true };
    expect(issuesFor(confirmed, ctx([confirmed])).some((i) => i.code === "bank_changed")).toBe(false);
  });
});

describe("row status", () => {
  it("is Needs Review for a clean draft invoice", () => {
    const i = invoice();
    expect(rowStatus(i, issuesFor(i, ctx([i]))).label).toBe("Needs Review");
  });
  it("counts problems", () => {
    const i = invoice({ total: 1 });
    expect(rowStatus(i, issuesFor(i, ctx([i]))).count).toBe(1);
  });
  it("is Ready to submit for a clean receipt", () => {
    const r = receipt();
    expect(rowStatus(r, issuesFor(r, ctx([r]))).label).toBe("Ready to submit");
  });
  it("is Needs Review when a value is uncertain", () => {
    const r = receipt({ meta: { total: { origin: "document", uncertain: true } } });
    expect(rowStatus(r, issuesFor(r, ctx([r]))).label).toBe("Needs Review");
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
});

describe("settlement", () => {
  const fund: Account = { id: "a", name: "Fund", currency: "GBP", balance: 0, settlementDays: 2 };
  // 2026-10-03 is a Saturday, so two business days later is Tuesday the 6th.
  it("warns when the due date is sooner than the money can leave", () => {
    expect(arrivesLate("2026-10-05", fund, "2026-10-03")).toBe(true);
    expect(arrivesLate("2026-10-06", fund, "2026-10-03")).toBe(false);
  });
});

describe("money input", () => {
  it("parses pounds to pence", () => {
    expect(parseMoney("1,204.50")).toBe(120450);
    expect(parseMoney("12.4")).toBe(1240);
    expect(parseMoney("-3.00")).toBe(-300);
    expect(parseMoney("abc")).toBeNull();
  });
});
