import { addBusinessDays } from "./dates";
import type { ErpAdapter } from "./erp";
import type { Account, Contact, Doc, Invoice, Issue, LineItem } from "./types";

// Pure rules. Everything that decides whether money can move lives here, so it can be
// tested and read in one place.

export function lineNet(line: LineItem) {
  return Math.round(line.quantity * line.unitAmount);
}

export function linesNet(doc: Doc) {
  return doc.lines.reduce((sum, l) => sum + lineNet(l), 0);
}

export function linesTax(doc: Doc) {
  return doc.lines.reduce((sum, l) => sum + l.tax, 0);
}

export function linesTotal(doc: Doc) {
  return linesNet(doc) + linesTax(doc);
}

export function totalsMatch(doc: Doc) {
  return linesTotal(doc) === doc.total;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

// A duplicate is the same supplier and invoice number, or the same merchant, amount and
// date. Amount alone is not enough: a monthly subscription repeats it every month.
// Only the later document is flagged, so the original stays clean.
export function findDuplicate(doc: Doc, docs: Doc[]): Doc | undefined {
  return docs.find((other) => {
    if (other.id === doc.id || other.type !== doc.type) return false;
    if (other.source.at > doc.source.at) return false;
    if (other.source.at === doc.source.at && other.id > doc.id) return false;
    if (doc.type === "invoice" && other.type === "invoice") {
      return !!doc.number && norm(doc.number) === norm(other.number) && norm(doc.supplier) === norm(other.supplier);
    }
    if (doc.type === "receipt" && other.type === "receipt") {
      return (
        !!doc.merchant &&
        norm(doc.merchant) === norm(other.merchant) &&
        doc.total === other.total &&
        doc.currency === other.currency &&
        doc.paidOn === other.paidOn
      );
    }
    return false;
  });
}

// Bank details on the document differ from the saved contact. The classic invoice fraud.
export function bankChanged(invoice: Invoice, contact: Contact | undefined) {
  const printed = invoice.documentBank;
  const saved = contact?.bank;
  if (!printed || !saved) return false;
  return printed.sortCode !== saved.sortCode || printed.accountNumber !== saved.accountNumber;
}

export type RuleContext = {
  docs: Doc[];
  contacts: Contact[];
  erp: ErpAdapter;
  today: string;
};

function uncertainCount(doc: Doc) {
  const fields = Object.values(doc.meta).filter((m) => m.uncertain).length;
  const lines = doc.lines.reduce((n, l) => n + (l.glMeta?.uncertain ? 1 : 0) + (l.taxMeta?.uncertain ? 1 : 0), 0);
  return fields + lines;
}

export function issuesFor(doc: Doc, ctx: RuleContext): Issue[] {
  const closed = doc.type === "invoice" ? doc.status === "paid" : doc.status === "submitted";
  if (closed || doc.extraction !== "done") return [];

  const issues: Issue[] = [];
  const { erp } = ctx;

  if (doc.type === "invoice") {
    const contact = ctx.contacts.find((c) => c.id === doc.contactId);
    if (!doc.supplier || !doc.number || !doc.dueOn) {
      issues.push({ code: "missing_field", label: "Supplier, invoice number and due date are needed", blocking: true, kind: "todo" });
    }
    if (!contact) {
      issues.push({ code: "missing_contact", label: "No contact chosen", blocking: true, kind: "todo" });
    } else if (!contact.bank) {
      issues.push({ code: "missing_payment_details", label: "Contact has no payment details", blocking: true, kind: "problem" });
    } else if (bankChanged(doc, contact) && !doc.bankChangeConfirmed) {
      issues.push({ code: "bank_changed", label: "Bank details differ from the saved contact", blocking: true, kind: "problem" });
    }
    if (contact && contact.paidBefore === 0) {
      issues.push({ code: "first_time_supplier", label: "First payment to this supplier", blocking: false, kind: "info" });
    }
    if (doc.dueOn && doc.dueOn < ctx.today) {
      issues.push({ code: "overdue", label: "Overdue", blocking: false, kind: "info" });
    }
  } else {
    if (!doc.merchant || !doc.paidOn) {
      issues.push({ code: "missing_field", label: "Merchant and date are needed", blocking: true, kind: "todo" });
    }
    if (doc.slipOnly) {
      issues.push({ code: "card_slip", label: "Looks like a card slip; the itemised receipt is better evidence", blocking: false, kind: "info" });
    }
    if (doc.confirmsInvoiceId && !doc.duplicateDismissed) {
      issues.push({
        code: "confirms_invoice",
        label: "Looks like the payment confirmation for an invoice already paid",
        blocking: true,
        kind: "problem",
        relatedId: doc.confirmsInvoiceId,
      });
    }
  }

  const duplicate = findDuplicate(doc, ctx.docs);
  if (duplicate && !doc.duplicateDismissed) {
    issues.push({ code: "duplicate", label: "Possible duplicate", blocking: true, kind: "problem", relatedId: duplicate.id });
  }

  if (!totalsMatch(doc)) {
    issues.push({ code: "totals_mismatch", label: "Lines do not add up to the document total", blocking: true, kind: "problem" });
  }

  const uncoded = doc.lines.filter((l) => !l.glCode || !l.taxCode).length;
  if (uncoded > 0) {
    issues.push({ code: "uncoded", label: uncoded === 1 ? "1 line needs a code" : `${uncoded} lines need a code`, blocking: true, kind: "todo" });
  }

  // A code chosen earlier may no longer exist in the ERP.
  const invalid = doc.lines.some(
    (l) =>
      (l.glCode && !erp.glAccounts.some((a) => a.code === l.glCode)) ||
      (l.taxCode && !erp.taxCodes.some((t) => t.code === l.taxCode)),
  );
  if (invalid) {
    issues.push({ code: "invalid_code", label: `A code is not in ${erp.name}`, blocking: true, kind: "problem" });
  }

  for (const field of erp.extraLineFields) {
    if (doc.lines.some((l) => !l.extra?.[field.key])) {
      issues.push({ code: "missing_erp_field", label: `${erp.name} needs a ${field.label.toLowerCase()} on every line`, blocking: true, kind: "todo" });
    }
  }

  const uncertain = uncertainCount(doc);
  if (uncertain > 0) {
    issues.push({ code: "uncertain", label: uncertain === 1 ? "1 value to check" : `${uncertain} values to check`, blocking: true, kind: "todo" });
  }

  return issues;
}

export function isBlocked(issues: Issue[]) {
  return issues.some((i) => i.blocking);
}

export type Tone = "neutral" | "dark" | "warn" | "danger" | "ok";
export type RowStatus = { key: string; label: string; tone: Tone; count?: number };

// The brief's states (Draft, Ready to Pay, Paid; Draft, Submitted) shown in the words
// short, familiar words.
export function rowStatus(doc: Doc, issues: Issue[]): RowStatus {
  if (doc.extraction === "in_progress") return { key: "in_progress", label: "In Progress", tone: "neutral" };
  if (doc.extraction === "failed") return { key: "unreadable", label: "Could not read", tone: "danger" };

  const problems = issues.filter((i) => i.kind === "problem").length;

  if (doc.type === "invoice") {
    if (doc.status === "paid") {
      if (doc.payment?.state === "processing") return { key: "processing", label: "Processing", tone: "neutral" };
      if (doc.payment?.state === "failed") return { key: "payment_failed", label: "Payment failed", tone: "danger" };
      if (doc.sync === "failed") return { key: "sync_failed", label: "Paid · Sync failed", tone: "danger" };
      if (doc.sync === "syncing") return { key: "syncing", label: "Paid · Syncing", tone: "neutral" };
      return { key: "paid", label: "Paid", tone: "ok" };
    }
    if (problems > 0) return { key: "issues", label: "found", tone: "warn", count: problems };
    if (doc.status === "ready_to_pay") return { key: "ready", label: "Ready to Pay", tone: "ok" };
    return { key: "needs_review", label: "Needs Review", tone: "dark" };
  }

  if (doc.status === "submitted") {
    if (doc.sync === "failed") return { key: "sync_failed", label: "Sync failed", tone: "danger" };
    if (doc.sync === "syncing") return { key: "syncing", label: "Submitted · Syncing", tone: "neutral" };
    return { key: "submitted", label: "Submitted", tone: "ok" };
  }
  if (problems > 0) return { key: "issues", label: "found", tone: "warn", count: problems };
  if (isBlocked(issues)) return { key: "needs_review", label: "Needs Review", tone: "dark" };
  return { key: "ready", label: "Ready to submit", tone: "ok" };
}

// Does this document still need the user? Drives the count on each tab.
export function needsAction(doc: Doc) {
  if (doc.extraction === "failed") return true;
  if (doc.type === "invoice") {
    return doc.status !== "paid" || doc.payment?.state === "failed" || doc.sync === "failed";
  }
  return doc.status === "draft" || doc.sync === "failed";
}

// What the upload step looks at to decide the type. A document titled "Invoice" that is
// already paid is a receipt: paying it again would be a duplicate payment.
export type TypeSignals = {
  title?: string;
  paidMarker?: string;
  balanceDue?: number;
  cardLast4?: string;
  hasBankDetails?: boolean;
  hasDueDate?: boolean;
};

export function detectType(s: TypeSignals): { type: "invoice" | "receipt"; reason: string } {
  if (s.paidMarker) return { type: "receipt", reason: `Marked "${s.paidMarker}"` };
  if (s.cardLast4) return { type: "receipt", reason: `Paid by card ending ${s.cardLast4}` };
  if (s.balanceDue === 0) return { type: "receipt", reason: "Balance due is 0.00" };
  if (s.hasBankDetails || s.hasDueDate) {
    return { type: "invoice", reason: s.hasDueDate ? "Has a due date and an amount owed" : "Asks for payment to a bank account" };
  }
  if (s.title && /invoice/i.test(s.title)) return { type: "invoice", reason: 'Titled "Invoice", no sign of payment' };
  return { type: "receipt", reason: "No due date or payment request" };
}

// Money in a fund is not available straight away. The earliest date a payment can leave.
export function earliestPayDate(account: Account, today: string) {
  return addBusinessDays(today, account.settlementDays);
}

export function arrivesLate(dueOn: string, account: Account, today: string) {
  return !!dueOn && earliestPayDate(account, today) > dueOn;
}

// Total to pay in the account's currency. Other currencies are left out of the balance
// check: FX is not modelled in this build.
export function batchTotal(invoices: Invoice[], currency: string) {
  return invoices.filter((i) => i.currency === currency).reduce((sum, i) => sum + i.total, 0);
}
