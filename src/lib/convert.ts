import { INVOICE_FIELDS, RECEIPT_FIELDS } from "./types";
import type { Contact, Doc, Invoice, Meta, Receipt } from "./types";

// Switching a document's type. Shared fields carry over; type-only fields are stashed so
// switching back loses nothing the user typed. Flags for fields the new type does not
// have are stashed too: left in place they would block the document with nothing to click.

function split(meta: Meta, keep: readonly string[]) {
  const kept: Meta = {};
  const rest: Meta = {};
  for (const [key, value] of Object.entries(meta)) {
    (keep.includes(key) ? kept : rest)[key as keyof Meta] = value;
  }
  return { kept, rest };
}

export function toReceipt(invoice: Invoice): Receipt {
  const { supplier, number, reference, issuedOn, dueOn, contactId, documentBank, payment, attachments, status, type, stash, meta, ...shared } = invoice;
  void payment;
  void attachments;
  void status;
  void type;
  // The current values win over anything stashed from an earlier switch.
  const moved: Meta = { ...stash?.meta, ...meta, merchant: meta.supplier ?? stash?.meta?.merchant, paidOn: meta.issuedOn ?? stash?.meta?.paidOn };
  const { kept, rest } = split(moved, RECEIPT_FIELDS);
  return {
    ...shared,
    type: "receipt",
    status: "draft",
    merchant: supplier,
    paidOn: stash?.receipt?.paidOn ?? issuedOn,
    slipOnly: stash?.receipt?.slipOnly,
    typeReason: "Changed to a receipt by you",
    // Warnings that only make sense for an invoice do not follow it.
    overrides: shared.overrides?.filter((o) => o === "duplicate" || o === "counterpart"),
    meta: kept,
    stash: { invoice: { number, reference, issuedOn, dueOn, contactId, documentBank }, meta: rest },
  };
}

export function toInvoice(receipt: Receipt, contacts: Contact[]): Invoice {
  const { merchant, paidOn, slipOnly, status, type, stash, meta, ...shared } = receipt;
  void status;
  void type;
  const contact = contacts.find((c) => c.name.trim().toLowerCase() === merchant.trim().toLowerCase());
  const moved: Meta = { ...stash?.meta, ...meta, supplier: meta.merchant ?? stash?.meta?.supplier, issuedOn: meta.paidOn ?? stash?.meta?.issuedOn };
  const { kept, rest } = split(moved, INVOICE_FIELDS);
  const was = stash?.invoice;
  return {
    ...shared,
    type: "invoice",
    // Always a draft: it has to be checked again as an invoice before it can be paid.
    status: "draft",
    supplier: merchant,
    number: was?.number ?? "",
    reference: was?.reference ?? "",
    issuedOn: was?.issuedOn ?? paidOn,
    dueOn: was?.dueOn ?? "",
    contactId: was?.contactId ?? contact?.id ?? null,
    documentBank: was?.documentBank ?? null,
    typeReason: "Changed to an invoice by you",
    meta: kept,
    stash: { receipt: { paidOn, slipOnly }, meta: rest },
  };
}

export function switchType(doc: Doc, contacts: Contact[]): Doc {
  return doc.type === "invoice" ? toReceipt(doc) : toInvoice(doc, contacts);
}
