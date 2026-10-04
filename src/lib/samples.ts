import { addDays, nowStamp } from "./dates";
import { printFrom } from "./printed";
import { detectType, type TypeSignals } from "./rules";
import { CURRENT_USER, ENTITY } from "./seed";
import type { Doc, FieldMeta, Invoice, LineItem, Printed, Receipt } from "./types";

// Scripted results for the upload step. A dropped file cannot really be read in this
// build, so each file is given the next scripted result. This is a shortcut: in
// production the result comes from the extraction service.

const DOC: FieldMeta = { origin: "document" };
const MISSING: FieldMeta = { origin: "missing" };
const memory = (reason: string): FieldMeta => ({ origin: "memory", reason });
const noVat: FieldMeta = { origin: "document", reason: "No VAT shown on the document." };

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/heic", "image/webp"];
const ACCEPTED_EXTENSIONS = /\.(pdf|png|jpe?g|heic|webp)$/i;

// Checks that do not need the file to be read. These are real, not mocked. A file with no
// reported type is judged by its extension rather than waved through.
export function rejectFile(file: { name: string; size: number; type: string }): string | null {
  if (file.size > MAX_FILE_BYTES) return "Over 2MB. Reduce the file size and try again.";
  const accepted = file.type ? ACCEPTED_TYPES.includes(file.type) : ACCEPTED_EXTENSIONS.test(file.name);
  if (!accepted) return "This file type is not supported. Use a PDF or an image.";
  return null;
}

type Ctx = { id: string; today: string; fileName: string; seq: number };

export type Sample = {
  fileName: string;
  // A file that is read but turns out not to be an invoice or receipt. No document is created.
  notADocument?: string;
  build?: (ctx: Ctx) => Doc;
};

const line = (id: string, description: string, quantity: number, unitAmount: number, tax: number, glCode: string | null, taxCode: string | null, over: Partial<LineItem> = {}): LineItem => ({
  id,
  description,
  quantity,
  unitAmount,
  tax,
  glCode,
  taxCode,
  amountMeta: DOC,
  glMeta: DOC,
  taxMeta: DOC,
  ...over,
});

const base = (ctx: Ctx) => {
  const at = nowStamp();
  return {
    id: ctx.id,
    fileName: ctx.fileName,
    source: { channel: "upload" as const, by: CURRENT_USER, at },
    updatedAt: at,
    entity: ENTITY,
    currency: "GBP" as const,
    extraction: "in_progress" as const,
    sync: "not_synced" as const,
  };
};

function finish<T extends Doc>(doc: T, signals: TypeSignals, reason?: string, paper?: Partial<Printed>): T {
  const detected = detectType(signals);
  // The scripted document and the rule must agree, or the demo would contradict itself.
  if (detected.type !== doc.type) throw new Error(`Sample ${doc.fileName} is a ${doc.type} but the rule says ${detected.type}`);
  const withReason = { ...doc, typeReason: reason ?? detected.reason };
  return { ...withReason, printed: printFrom(withReason, paper) };
}

const fieldwork = (ctx: Ctx): Invoice => {
  const number = `FS-2026-12${String.fromCharCode(75 + (ctx.seq % 10))}`;
  return finish(
    {
      ...base(ctx),
      type: "invoice",
      status: "draft",
      supplier: "Fieldwork Studio",
      number,
      reference: number,
      issuedOn: addDays(ctx.today, -1),
      dueOn: addDays(ctx.today, 29),
      contactId: "c-fieldwork",
      documentBank: { accountName: "Fieldwork Studio", sortCode: "20-32-06", accountNumber: "41029385" },
      total: 288000,
      lines: [
        line(`${ctx.id}-1`, "Brand guidelines — final delivery", 1, 240000, 48000, "412", "INPUT2", {
          glMeta: memory("Coded to 412 — Consulting & Accounting on the last 2 invoices from this supplier."),
        }),
      ],
      meta: { supplier: DOC, number: DOC, issuedOn: DOC, dueOn: DOC, total: DOC, currency: DOC, bank: DOC },
      typeReason: "",
    },
    { title: "Invoice", hasBankDetails: true, hasDueDate: true },
  );
};

const notion = (ctx: Ctx): Receipt =>
  finish(
    {
      ...base(ctx),
      type: "receipt",
      status: "draft",
      merchant: "Notion",
      paidOn: addDays(ctx.today, -ctx.seq),
      total: 5760,
      lines: [
        line(`${ctx.id}-1`, "Notion Plus — 6 members, monthly", 1, 5760, 0, "485", "NONE", {
          glMeta: memory("Coded to 485 — Subscriptions on the last 3 receipts from this merchant."),
          taxMeta: noVat,
        }),
      ],
      meta: { merchant: DOC, paidOn: DOC, total: DOC, currency: DOC },
      typeReason: "",
    },
    { title: "Invoice", paidMarker: "Paid", cardLast4: "4242" },
    "Titled “Invoice”, but marked “Paid” by card ending 4242",
    { title: "Invoice", number: "NTN-88410-26", stamps: ["Paid", "Visa ending 4242"] },
  );

const gails = (ctx: Ctx): Receipt =>
  finish(
    {
      ...base(ctx),
      type: "receipt",
      status: "draft",
      merchant: "Gail's Bakery",
      paidOn: addDays(ctx.today, -ctx.seq),
      total: 1890,
      lines: [
        line(`${ctx.id}-1`, "Team breakfast", 1, 1575, 315, "420", "INPUT2", {
          glMeta: memory("Coded to 420 — Entertainment on the last 6 receipts from cafés."),
        }),
      ],
      meta: { merchant: DOC, paidOn: DOC, total: DOC, currency: DOC },
      typeReason: "",
    },
    { cardLast4: "4242" },
    undefined,
    { layout: "till", stamps: ["Visa ending 4242"] },
  );

// Same supplier and invoice number as one already in the list.
const talentbridgeAgain = (ctx: Ctx): Invoice =>
  finish(
    {
      ...base(ctx),
      type: "invoice",
      status: "draft",
      supplier: "Talent Bridge",
      number: "TB-2026-0150",
      reference: "TB-2026-0150",
      issuedOn: addDays(ctx.today, -10),
      dueOn: addDays(ctx.today, 14),
      contactId: "c-talentbridge",
      documentBank: { accountName: "Talent Bridge", sortCode: "23-05-80", accountNumber: "18364027" },
      total: 1477488,
      lines: [line(`${ctx.id}-1`, "Recruitment fee — senior engineer", 1, 1231240, 246248, "412", "INPUT2")],
      meta: { supplier: DOC, number: DOC, issuedOn: DOC, dueOn: DOC, total: DOC, currency: DOC, bank: DOC },
      typeReason: "",
    },
    { title: "Invoice", hasBankDetails: true, hasDueDate: true },
  );

// What a file becomes before anything has been read from it. If reading fails, this is
// the record that waits for manual entry.
export const blank = (ctx: Ctx): Receipt => ({
  ...base(ctx),
  type: "receipt",
  status: "draft",
  merchant: "",
  paidOn: "",
  total: 0,
  lines: [line(`${ctx.id}-1`, "", 1, 0, 0, null, null, { amountMeta: MISSING, glMeta: MISSING, taxMeta: MISSING })],
  meta: { merchant: MISSING, paidOn: MISSING, total: MISSING, currency: MISSING },
  typeReason: "Could not be read, so the type is a guess",
});

// The prepared batch behind "Add sample files".
export const sampleBatch: Sample[] = [
  { fileName: "fieldwork-FS-2026-12K.pdf", build: fieldwork },
  { fileName: "notion-invoice-october.pdf", build: notion },
  { fileName: "IMG_5521.jpg", build: gails },
  { fileName: "talentbridge-TB-2026-0150.pdf", build: talentbridgeAgain },
  { fileName: "scan-0042.jpg", build: blank },
  { fileName: "q3-bank-statement.pdf", notADocument: "Not an invoice or a receipt. It looks like a bank statement." },
];

// Results handed to real files the user drops, in turn.
export const rotation = [fieldwork, notion, gails];
