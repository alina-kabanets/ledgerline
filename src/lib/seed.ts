import { addDays } from "./dates";
import { taxFor, erps } from "./erp";
import { printFrom } from "./printed";
import type { Account, BankDetails, Channel, Contact, Doc, FieldMeta, Invoice, LineItem, Printed, Receipt } from "./types";

// Demo data. One document for each state and each edge case.
// Dates are relative to today so "overdue" and "due tomorrow" stay true.

export const ENTITY = "Northwind Studio Ltd";
export const INBOX_EMAIL = "northwind@inbox.ledgerline.app";
export const INBOX_WHATSAPP = "+1 555 830 5393";
export const CURRENT_USER = "Alina Kabanets";

const DOC: FieldMeta = { origin: "document" };
const memory = (reason: string): FieldMeta => ({ origin: "memory", reason });
const unsure = (reason: string, origin: FieldMeta["origin"] = "document"): FieldMeta => ({ origin, uncertain: true, reason });

const bank = (accountName: string, sortCode: string, accountNumber: string): BankDetails => ({ accountName, sortCode, accountNumber });

export type Seed = { docs: Doc[]; contacts: Contact[]; accounts: Account[] };

export function seed(today: string): Seed {
  let n = 0;
  const lineId = () => `l${++n}`;

  const line = (
    description: string,
    quantity: number,
    unitAmount: number,
    glCode: string | null,
    taxCode: string | null,
    over: Partial<LineItem> = {},
  ): LineItem => {
    const rate = taxFor(erps.xero, taxCode)?.rate ?? 0;
    return {
      id: lineId(),
      description,
      quantity,
      unitAmount,
      tax: Math.round(quantity * unitAmount * rate),
      glCode,
      taxCode,
      glMeta: DOC,
      taxMeta: DOC,
      ...over,
    };
  };

  const sum = (lines: LineItem[]) => lines.reduce((s, l) => s + Math.round(l.quantity * l.unitAmount) + l.tax, 0);
  const at = (daysAgo: number, time = "09:14") => `${addDays(today, -daysAgo)}T${time}:00`;
  const src = (channel: Channel, by: string, daysAgo: number, time?: string) => ({ channel, by, at: at(daysAgo, time) });

  const contacts: Contact[] = [
    { id: "c-fieldwork", name: "Fieldwork Studio", bank: bank("Fieldwork Studio", "20-32-06", "41029385"), paidBefore: 2 },
    { id: "c-stackwise", name: "Stackwise Software Ltd", bank: bank("Stackwise Software Ltd", "03-80-62", "30909742"), paidBefore: 8 },
    { id: "c-harbour", name: "Harbour & Finch", bank: bank("Harbour & Finch", "30-00-69", "22563807"), paidBefore: 6 },
    { id: "c-okoro", name: "Okoro Legal LLP", bank: bank("Okoro Legal LLP", "40-11-62", "70872490"), paidBefore: 3 },
    { id: "c-carver", name: "Carver Interiors", bank: bank("Carver Interiors", "60-83-71", "55779911"), paidBefore: 5 },
    { id: "c-greenbin", name: "Greenbin Waste Ltd", bank: null, paidBefore: 0 },
    { id: "c-talentbridge", name: "Talent Bridge", bank: bank("Talent Bridge", "23-05-80", "18364027"), paidBefore: 2 },
    { id: "c-swift", name: "Swift Couriers", bank: bank("Swift Couriers", "09-01-28", "93746152"), paidBefore: 4 },
    { id: "c-atelier", name: "Atelier Nord GmbH", bank: bank("Atelier Nord GmbH", "DE89 3704", "0044 0532 0130 00"), paidBefore: 1 },
    { id: "c-patel", name: "Patel & Rowe Accountants", bank: bank("Patel & Rowe Accountants", "77-04-05", "60218843"), paidBefore: 7 },
    { id: "c-expo", name: "Expo Stands Ltd", bank: bank("Expo Stands Ltd", "16-22-19", "30417765"), paidBefore: 0 },
    { id: "c-brightline", name: "Brightline IT", bank: bank("Brightline IT", "40-47-84", "12094476"), paidBefore: 9 },
    { id: "c-canal", name: "Canal Street Lettings", bank: bank("Canal Street Lettings", "20-00-00", "53910284"), paidBefore: 3 },
    { id: "c-fibrelink", name: "Fibrelink Telecom", bank: bank("Fibrelink Telecom", "83-06-08", "00716642"), paidBefore: 2 },
  ];
  const bankOf = (id: string) => contacts.find((c) => c.id === id)?.bank ?? null;

  const invoice = (o: Partial<Invoice> & Pick<Invoice, "id" | "supplier" | "number" | "lines" | "contactId">): Invoice => ({
    type: "invoice",
    status: "draft",
    fileName: `${o.number}.pdf`,
    source: src("email", "accounts@" + o.supplier.split(/[ ,]/)[0].toLowerCase() + ".example", 1),
    entity: ENTITY,
    currency: "GBP",
    total: sum(o.lines),
    meta: { supplier: DOC, number: DOC, issuedOn: DOC, dueOn: DOC, total: DOC, bank: DOC },
    extraction: "done",
    typeReason: "Has a due date and an amount owed",
    sync: "not_synced",
    reference: o.number,
    issuedOn: addDays(today, -12),
    dueOn: addDays(today, 18),
    documentBank: bankOf(o.contactId ?? ""),
    ...o,
  });

  const receipt = (o: Partial<Receipt> & Pick<Receipt, "id" | "merchant" | "lines">): Receipt => ({
    type: "receipt",
    status: "draft",
    fileName: `${o.merchant.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.jpg`,
    source: src("whatsapp", "Sam Okafor", 2),
    entity: ENTITY,
    currency: "GBP",
    total: sum(o.lines),
    meta: { merchant: DOC, paidOn: DOC, total: DOC },
    extraction: "done",
    typeReason: "No due date or payment request",
    sync: "not_synced",
    paidOn: addDays(today, -2),
    ...o,
  });

  const stackwiseReason = "You coded this line to 485 — Subscriptions last time. The same code is suggested.";
  const usedBefore = (code: string, name: string, times: number) => memory(`Coded to ${code} — ${name} on the last ${times} invoices from this supplier.`);

  const okoroLines = [
    line("Legal review — supplier contracts", 14, 68000, "441", "INPUT2", { glMeta: usedBefore("441", "Legal Expenses", 3) }),
    line("Disbursements", 1, 186023, "441", "INPUT2"),
  ];

  const invoices: Invoice[] = [
    invoice({
      id: "inv-fieldwork",
      supplier: "Fieldwork Studio",
      number: "FS-2026-118",
      contactId: "c-fieldwork",
      source: src("upload", CURRENT_USER, 0, "08:52"),
      issuedOn: addDays(today, -4),
      dueOn: addDays(today, 26),
      meta: { supplier: DOC, number: DOC, issuedOn: DOC, dueOn: unsure("Two dates on the document. Chose the one labelled “Payment due”."), total: DOC, bank: DOC },
      lines: [
        line("Brand strategy workshop", 1, 520000, "412", "INPUT2", { glMeta: usedBefore("412", "Consulting & Accounting", 2) }),
        line("Workshop materials", 1, 236830, "412", "INPUT2", { glMeta: usedBefore("412", "Consulting & Accounting", 2) }),
      ],
    }),
    invoice({
      id: "inv-stackwise",
      supplier: "Stackwise Software Ltd",
      number: "SW-2026-10-002",
      contactId: "c-stackwise",
      source: src("upload", CURRENT_USER, 0, "08:52"),
      issuedOn: addDays(today, -3),
      dueOn: addDays(today, 27),
      lines: [
        line("Workspace plan — 40 seats", 1, 14900, "485", "INPUT2", { glMeta: memory(stackwiseReason) }),
        line("Automation add-on", 1, 7999, "485", "INPUT2", { glMeta: memory(stackwiseReason) }),
        line("CRM connector", 1, 8500, "485", "INPUT2", { glMeta: memory(stackwiseReason) }),
        line("File storage — 2 TB", 1, 4260, "485", "INPUT2", { glMeta: memory(stackwiseReason) }),
        line("Admin seats — extra", 5, 1800, "485", "INPUT2", { glMeta: unsure("“Seats” matched both 485 — Subscriptions and 463 — IT Software. Chose the one used for this supplier before.", "memory") }),
        line("Test environment", 2, 3125, "485", "INPUT2", { glMeta: memory(stackwiseReason) }),
      ],
    }),
    invoice({
      id: "inv-harbour",
      supplier: "Harbour & Finch",
      number: "HF-2026-0217",
      contactId: "c-harbour",
      issuedOn: addDays(today, -9),
      dueOn: addDays(today, 21),
      // Printed bank details differ from the saved contact.
      documentBank: bank("Harbour & Finch", "04-00-75", "83410296"),
      lines: [
        line("Warehouse racking — install", 1, 310000, "453", "INPUT2", { glMeta: usedBefore("453", "Office Expenses", 6) }),
        line("Site survey", 1, 129655, "412", "INPUT2"),
      ],
    }),
    invoice({
      id: "inv-okoro",
      supplier: "Okoro Legal LLP",
      number: "OKL-2026-0388",
      contactId: "c-okoro",
      issuedOn: addDays(today, -7),
      dueOn: addDays(today, 23),
      lines: okoroLines,
      // The document total is £10.00 more than its lines.
      total: sum(okoroLines) + 1000,
    }),
    invoice({
      id: "inv-carver",
      supplier: "Carver Interiors",
      number: "CI-2026-0091",
      contactId: "c-carver",
      status: "ready_to_pay",
      source: src("email", "billing@carver.example", 6),
      issuedOn: addDays(today, -15),
      dueOn: addDays(today, 15),
      lines: [line("Office fit-out — phase 2", 1, 670460, "453", "INPUT2", { glMeta: usedBefore("453", "Office Expenses", 5) })],
    }),
    invoice({
      id: "inv-carver-dup",
      supplier: "Carver Interiors",
      number: "CI-2026-0091",
      contactId: "c-carver",
      // Same supplier and number as the one above, forwarded again later.
      source: src("email", "billing@carver.example", 1, "16:40"),
      issuedOn: addDays(today, -15),
      dueOn: addDays(today, 15),
      lines: [line("Office fit-out — phase 2", 1, 670460, "453", "INPUT2", { glMeta: usedBefore("453", "Office Expenses", 5) })],
    }),
    invoice({
      id: "inv-greenbin",
      supplier: "Greenbin Waste Ltd",
      number: "GB-2026-0412",
      contactId: "c-greenbin",
      issuedOn: addDays(today, -6),
      dueOn: addDays(today, 24),
      documentBank: null,
      meta: { supplier: DOC, number: DOC, issuedOn: DOC, dueOn: DOC, total: DOC, bank: { origin: "missing", reason: "No bank details on the document." } },
      lines: [line("Waste collection — quarterly", 1, 1247336, "429", "INPUT2")],
    }),
    invoice({
      id: "inv-expo",
      supplier: "Expo Stands Ltd",
      number: "EXP-2026-0063",
      contactId: "c-expo",
      issuedOn: addDays(today, -5),
      dueOn: addDays(today, 12),
      lines: [
        line("Trade stand hire", 1, 380000, "400", "INPUT2"),
        line("Rigging and power", 1, 72275, null, "INPUT2", { glMeta: { origin: "missing", reason: "No earlier invoice from this supplier and no close match in memory." } }),
      ],
    }),
    invoice({
      id: "inv-talentbridge",
      supplier: "Talent Bridge",
      number: "TB-2026-0150",
      contactId: "c-talentbridge",
      status: "ready_to_pay",
      source: src("xero", "Xero", 3),
      issuedOn: addDays(today, -10),
      dueOn: addDays(today, 14),
      lines: [line("Recruitment fee — senior engineer", 1, 1231240, "412", "INPUT2")],
      mock: { failSyncOnce: true },
    }),
    invoice({
      id: "inv-swift",
      supplier: "Swift Couriers",
      number: "SC-2026-0907",
      contactId: "c-swift",
      status: "ready_to_pay",
      issuedOn: addDays(today, -28),
      // Due sooner than money can leave the fund.
      dueOn: addDays(today, 1),
      lines: [line("Courier contract — September", 1, 373255, "425", "INPUT2", { glMeta: usedBefore("425", "Freight & Courier", 4) })],
    }),
    invoice({
      id: "inv-atelier",
      supplier: "Atelier Nord GmbH",
      number: "RE-2026-0418",
      contactId: "c-atelier",
      status: "ready_to_pay",
      currency: "EUR",
      issuedOn: addDays(today, -8),
      dueOn: addDays(today, 10),
      lines: [line("Product photography — autumn range", 1, 530000, "400", "NONE", { taxMeta: { origin: "document", reason: "No VAT shown on the document." } })],
      mock: { failPaymentOnce: true },
    }),
    invoice({
      id: "inv-patel",
      supplier: "Patel & Rowe Accountants",
      number: "PR-2026-0334",
      contactId: "c-patel",
      status: "ready_to_pay",
      issuedOn: addDays(today, -33),
      dueOn: addDays(today, -3),
      lines: [line("Accounting services — Q3", 1, 444175, "412", "INPUT2", { glMeta: usedBefore("412", "Consulting & Accounting", 7) })],
    }),
    invoice({
      id: "inv-brightline",
      supplier: "Brightline IT",
      number: "BIT-2026-0522",
      contactId: "c-brightline",
      status: "paid",
      sync: "synced",
      issuedOn: addDays(today, -30),
      dueOn: addDays(today, -6),
      lines: [line("Managed IT support — September", 1, 1116888, "463", "INPUT2")],
      payment: { state: "paid", accountId: "mmf", payOn: addDays(today, -8) },
    }),
    invoice({
      id: "inv-canal",
      supplier: "Canal Street Lettings",
      number: "CSL-2026-0010",
      contactId: "c-canal",
      status: "paid",
      sync: "failed",
      issuedOn: addDays(today, -26),
      dueOn: addDays(today, -4),
      lines: [line("Office rent — October", 1, 1607250, "469", "INPUT2")],
      payment: { state: "paid", accountId: "mmf", payOn: addDays(today, -5) },
    }),
    invoice({
      id: "inv-fibrelink",
      supplier: "Fibrelink Telecom",
      number: "FL-2026-0733",
      contactId: "c-fibrelink",
      status: "paid",
      issuedOn: addDays(today, -24),
      dueOn: addDays(today, -2),
      lines: [line("Broadband and telephony — Q3", 1, 1380847, "489", "INPUT2")],
      payment: { state: "failed", accountId: "mmf", payOn: addDays(today, -2) },
    }),
  ];

  const figma = (id: string, daysAgo: number, over: Partial<Receipt> = {}) =>
    receipt({
      id,
      merchant: "Figma",
      fileName: "figma-invoice.pdf",
      source: src("email", "Priya Shah", daysAgo),
      paidOn: addDays(today, -daysAgo),
      // Titled "Invoice" but already paid by card, so it is a receipt.
      typeReason: "Titled “Invoice”, but marked “Paid” by card ending 4242",
      lines: [
        line("Figma Professional — 3 editors, monthly", 1, 4500, "485", "NONE", {
          glMeta: memory("Coded to 485 — Subscriptions on the last 5 receipts from this merchant."),
          taxMeta: { origin: "document", reason: "No VAT shown on the document." },
        }),
      ],
      ...over,
    });

  const uber = (id: string, channel: Channel, by: string, time: string) =>
    receipt({
      id,
      merchant: "Uber",
      fileName: channel === "email" ? "uber-receipt.pdf" : "IMG_2291.png",
      source: src(channel, by, 3, time),
      paidOn: addDays(today, -4),
      lines: [
        line("Trip — Shoreditch to Paddington", 1, 2380, "493", "NONE", {
          glMeta: memory("Coded to 493 — Travel - National on the last 12 receipts from this merchant."),
          taxMeta: { origin: "document", reason: "No VAT shown on the document." },
        }),
      ],
    });

  const receipts: Receipt[] = [
    receipt({
      id: "rec-pret",
      merchant: "Pret A Manger",
      source: src("whatsapp", "Sam Okafor", 0, "13:05"),
      fileName: "IMG_4410.jpg",
      paidOn: today,
      meta: { merchant: DOC, paidOn: DOC, total: unsure("The photo is blurred at the total. Read as 12.40; it could be 12.48.") },
      lines: [line("Team lunch", 1, 1033, "420", "INPUT2", { glMeta: memory("Coded to 420 — Entertainment on the last 3 receipts from this merchant.") })],
    }),
    uber("rec-uber", "email", "Priya Shah", "10:02"),
    // The same trip, sent again by another channel.
    uber("rec-uber-dup", "whatsapp", "Priya Shah", "18:30"),
    receipt({
      id: "rec-trainline",
      merchant: "Trainline",
      source: src("email", "Priya Shah", 5),
      fileName: "trainline-booking.pdf",
      paidOn: addDays(today, -5),
      lines: [line("London Euston to Manchester Piccadilly, return", 1, 8640, "493", "ZERORATEDINPUT", { glMeta: memory("Coded to 493 — Travel - National on the last 4 receipts from this merchant.") })],
    }),
    receipt({
      id: "rec-tesco",
      merchant: "Tesco",
      source: src("whatsapp", "Sam Okafor", 1, "17:48"),
      fileName: "IMG_4398.jpg",
      paidOn: addDays(today, -1),
      total: 3175,
      lines: [
        line("Office supplies and snacks", 1, 2933, "453", "INPUT2", {
          tax: 242,
          taxMeta: unsure("The receipt shows two VAT rates: food at 0% and other goods at 20%. Itemise it to split them."),
        }),
      ],
    }),
    receipt({
      id: "rec-dishoom",
      merchant: "Dishoom",
      source: src("upload", CURRENT_USER, 2),
      fileName: "dishoom-bill.pdf",
      paidOn: addDays(today, -3),
      lines: [
        line("Client dinner — food and drink", 1, 11000, "420", "INPUT2"),
        // A service charge carries no VAT.
        line("Service charge 12.5%", 1, 1650, "420", "NONE", { taxMeta: { origin: "document", reason: "Service charge: no VAT shown." } }),
      ],
    }),
    figma("rec-figma-oct", 1),
    receipt({
      id: "rec-slip",
      merchant: "The Wolseley",
      source: src("whatsapp", "Sam Okafor", 2, "22:10"),
      fileName: "IMG_4377.jpg",
      paidOn: addDays(today, -2),
      slipOnly: true,
      lines: [
        line("Card payment", 1, 6400, "420", "NONE", {
          glMeta: unsure("A card slip shows only the total, so the category is a guess from the merchant name.", "memory"),
          taxMeta: { origin: "missing", reason: "No VAT shown. A card slip never shows it." },
        }),
      ],
    }),
    receipt({
      id: "rec-amazon-refund",
      merchant: "Amazon",
      source: src("email", "Priya Shah", 4),
      fileName: "amazon-refund.pdf",
      paidOn: addDays(today, -4),
      // A refund: negative amounts.
      lines: [line("Refund — USB-C hub returned", 1, -3333, "463", "INPUT2")],
    }),
    receipt({
      id: "rec-hotel",
      merchant: "Hotel Adlon Berlin",
      source: src("email", "Priya Shah", 6),
      fileName: "adlon-folio.pdf",
      currency: "EUR",
      paidOn: addDays(today, -7),
      lines: [
        line("2 nights, conference stay", 1, 41200, "494", "NONE", {
          taxMeta: unsure("German VAT is shown on the document. Left as No VAT; check how to treat it."),
        }),
      ],
    }),
    receipt({
      id: "rec-brightline-confirmation",
      merchant: "Brightline IT",
      source: src("email", "accounts@brightline.example", 1),
      fileName: "payment-received-0522.pdf",
      paidOn: addDays(today, -8),
      typeReason: "Marked “Payment received”",
      confirmsInvoiceId: "inv-brightline",
      lines: [line("Payment received — BIT-2026-0522", 1, 1116888, "463", "INPUT2")],
    }),
    figma("rec-figma-sep", 31, { status: "submitted", sync: "synced" }),
    receipt({
      id: "rec-ryman",
      merchant: "Ryman",
      status: "submitted",
      sync: "synced",
      source: src("whatsapp", "Sam Okafor", 9),
      fileName: "IMG_4302.jpg",
      paidOn: addDays(today, -9),
      lines: [line("Printer ink and paper", 1, 1583, "461", "INPUT2")],
    }),
    receipt({
      id: "rec-deliveroo",
      merchant: "Deliveroo",
      status: "submitted",
      sync: "failed",
      source: src("email", "Priya Shah", 8),
      fileName: "deliveroo-order.pdf",
      paidOn: addDays(today, -8),
      lines: [line("Team lunch — sprint review", 1, 4517, "420", "INPUT2")],
    }),
  ];

  const accounts: Account[] = [
    { id: "mmf", name: "Treasury Reserve", currency: "GBP", balance: 4825000, settlementDays: 2 },
    { id: "business", name: "Operating Account", currency: "GBP", balance: 612040, settlementDays: 0 },
  ];

  // How each mock document looks on paper where it differs from the extracted fields.
  const paper: Record<string, Partial<Printed>> = {
    "inv-fieldwork": {
      dates: [
        { key: "issuedOn", label: "Invoice date", value: addDays(today, -4) },
        { key: "other", label: "Delivery date", value: addDays(today, 3) },
        { key: "dueOn", label: "Payment due", value: addDays(today, 26) },
      ],
    },
    "rec-pret": { blurred: ["total"] },
    "rec-tesco": {
      rows: [
        { description: "Sandwich platter", qty: 1, amount: 1100 },
        { description: "Fruit", qty: 1, amount: 623 },
        { description: "AA batteries", qty: 1, amount: 550 },
        { description: "Notebooks x4", qty: 1, amount: 902 },
      ],
      totals: [
        { label: "VAT 0% on 17.23", amount: 0 },
        { label: "VAT 20% on 12.10", amount: 242 },
        { label: "Total", amount: 3175, key: "total" },
      ],
    },
    "rec-figma-oct": { title: "Invoice", number: "FIG-2610-88213", stamps: ["Paid", "Visa ending 4242"] },
    "rec-figma-sep": { title: "Invoice", number: "FIG-2609-80771", stamps: ["Paid", "Visa ending 4242"] },
    "rec-brightline-confirmation": { title: "Payment received", number: "BIT-2026-0522", stamps: ["Payment received"] },
    "rec-slip": { rows: [], totals: [{ label: "SALE", amount: 6400, key: "total" }], stamps: ["Mastercard ending 1187", "Approved"] },
    "rec-amazon-refund": { title: "Refund confirmation", stamps: ["Refunded to card"] },
    "rec-hotel": {
      title: "Rechnung / Invoice",
      totals: [
        { label: "Netto", amount: 38505 },
        { label: "MwSt. 7%", amount: 2695 },
        { label: "Total", amount: 41200, key: "total" },
      ],
      stamps: ["Paid", "Amex ending 3009"],
    },
    "rec-uber": { title: "Trip receipt", stamps: ["Paid", "Visa ending 4242"] },
    "rec-uber-dup": { title: "Trip receipt", layout: "invoice", stamps: ["Paid", "Visa ending 4242"] },
  };

  const docs: Doc[] = [...invoices, ...receipts].map((d) => ({ ...d, printed: printFrom(d, paper[d.id]) }));

  return { docs, contacts, accounts };
}
