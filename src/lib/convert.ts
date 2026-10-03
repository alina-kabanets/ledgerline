import type { Contact, Doc, Invoice, Receipt } from "./types";

// Switching a document's type. Shared fields carry over; type-only fields are stashed so
// switching back loses nothing the user typed.

export function toReceipt(invoice: Invoice): Receipt {
  const { supplier, number, reference, issuedOn, dueOn, contactId, documentBank, bankChangeConfirmed, payment, status, type, ...shared } = invoice;
  void payment;
  void status;
  void type;
  const stash = (invoice.stash ?? {}) as Partial<Receipt>;
  return {
    ...shared,
    type: "receipt",
    status: "draft",
    merchant: supplier,
    paidOn: stash.paidOn ?? issuedOn,
    slipOnly: stash.slipOnly,
    confirmsInvoiceId: stash.confirmsInvoiceId,
    typeReason: "Changed to a receipt by you",
    meta: { ...shared.meta, merchant: shared.meta.supplier ?? { origin: "document" }, paidOn: shared.meta.issuedOn ?? { origin: "document" } },
    stash: { number, reference, issuedOn, dueOn, contactId, documentBank, bankChangeConfirmed },
  };
}

export function toInvoice(receipt: Receipt, contacts: Contact[]): Invoice {
  const { merchant, paidOn, slipOnly, confirmsInvoiceId, status, type, ...shared } = receipt;
  void status;
  void type;
  const stash = (receipt.stash ?? {}) as Partial<Invoice>;
  const contact = contacts.find((c) => c.name.toLowerCase() === merchant.toLowerCase());
  return {
    ...shared,
    type: "invoice",
    status: "draft",
    supplier: merchant,
    number: stash.number ?? "",
    reference: stash.reference ?? "",
    issuedOn: stash.issuedOn ?? paidOn,
    dueOn: stash.dueOn ?? "",
    contactId: stash.contactId ?? contact?.id ?? null,
    documentBank: stash.documentBank ?? null,
    bankChangeConfirmed: stash.bankChangeConfirmed,
    typeReason: "Changed to an invoice by you",
    meta: { ...shared.meta, supplier: shared.meta.merchant ?? { origin: "document" }, issuedOn: shared.meta.paidOn ?? { origin: "document" } },
    stash: { paidOn, slipOnly, confirmsInvoiceId },
  };
}

export function switchType(doc: Doc, contacts: Contact[]): Doc {
  return doc.type === "invoice" ? toReceipt(doc) : toInvoice(doc, contacts);
}
