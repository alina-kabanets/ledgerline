import { getErp } from "./erp";
import type { RuleContext } from "./rules";
import type { Account, Contact, Doc, Invoice, LineItem, Receipt } from "./types";

// Builders for tests. Not used by the app.

const base = {
  fileName: "x.pdf",
  source: { channel: "upload" as const, by: "Sam", at: "2026-10-01T09:00:00" },
  updatedAt: "2026-10-01T09:00:00",
  entity: "Acme Ltd",
  currency: "GBP" as const,
  meta: {},
  extraction: "done" as const,
  typeReason: "",
  sync: "not_synced" as const,
};

export const TODAY = "2026-10-05"; // a Monday

export const line = (net: number, tax: number, over: Partial<LineItem> = {}): LineItem => ({
  id: "l1",
  description: "Thing",
  quantity: 1,
  unitAmount: net,
  tax,
  glCode: "429",
  taxCode: "INPUT2",
  ...over,
});

export const contact: Contact = {
  id: "c1",
  name: "Carver Interiors",
  bank: { accountName: "Carver Interiors", sortCode: "30-00-69", accountNumber: "22563807" },
  paidBefore: 4,
};

export const invoice = (over: Partial<Invoice> = {}): Invoice => ({
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

export const receipt = (over: Partial<Receipt> = {}): Receipt => ({
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

export const fund: Account = { id: "mmf", name: "Fund", currency: "GBP", balance: 50000, settlementDays: 2 };
export const wallet: Account = { id: "eur", name: "EUR Wallet", currency: "EUR", balance: 50000, settlementDays: 0 };

export const ctx = (docs: Doc[], contacts: Contact[] = [contact]): RuleContext => ({ docs, contacts, erp: getErp("xero"), today: TODAY });
