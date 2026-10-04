import { addBusinessDays, formatDate } from "./dates";
import { taxFor, type ErpAdapter } from "./erp";
import { roundHalfAway, taxOn } from "./money";
import { INVOICE_FIELDS, RECEIPT_FIELDS } from "./types";
import type { Account, Contact, Doc, Invoice, Issue, LineItem, Override } from "./types";

// Pure rules. Everything that decides whether money can move lives here and in
// transitions.ts, so it can be tested and read in one place.

export function lineNet(line: LineItem) {
  return roundHalfAway(line.quantity * line.unitAmount);
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

// A penny or two of rounding is normal between a supplier's sums and ours.
export const TAX_TOLERANCE = 5;

// The tax on a line must follow from its tax code. Otherwise a value can be "confirmed"
// that the ERP would reject or, worse, accept.
export function taxMismatch(doc: Doc, erp: ErpAdapter) {
  return doc.lines.some((l) => {
    const code = taxFor(erp, l.taxCode);
    return code ? Math.abs(l.tax - taxOn(lineNet(l), code.pct)) > TAX_TOLERANCE : false;
  });
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
// Invoice numbers are compared without spaces or punctuation: "INV 2026-12" is "inv202612".
const normNumber = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export const partyOf = (doc: Doc) => (doc.type === "invoice" ? doc.supplier : doc.merchant);

// Only the later of two matching documents is flagged, so the original stays clean.
function arrivedBefore(other: Doc, doc: Doc) {
  if (other.source.at !== doc.source.at) return other.source.at < doc.source.at;
  return other.id < doc.id;
}

// A duplicate is the same supplier and invoice number, or the same merchant, amount and
// date. Amount alone is not enough: a monthly subscription repeats it every month.
export function findDuplicate(doc: Doc, docs: Doc[]): Doc | undefined {
  return docs.find((other) => {
    if (other.id === doc.id || other.type !== doc.type || other.extraction !== "done" || !arrivedBefore(other, doc)) return false;
    if (doc.type === "invoice" && other.type === "invoice") {
      return !!normNumber(doc.number) && normNumber(doc.number) === normNumber(other.number) && norm(doc.supplier) === norm(other.supplier);
    }
    if (doc.type === "receipt" && other.type === "receipt") {
      return !!doc.merchant && norm(doc.merchant) === norm(other.merchant) && doc.total === other.total && doc.currency === other.currency && doc.paidOn === other.paidOn;
    }
    return false;
  });
}

// The same cost recorded as both an invoice and a receipt: same party, same amount.
// The usual cause is a payment confirmation for an invoice already paid.
export function findCounterpart(doc: Doc, docs: Doc[]): Doc | undefined {
  const party = norm(partyOf(doc));
  if (!party || doc.total === 0) return undefined;
  return docs.find(
    (other) =>
      other.type !== doc.type &&
      other.extraction === "done" &&
      arrivedBefore(other, doc) &&
      other.currency === doc.currency &&
      other.total === doc.total &&
      norm(partyOf(other)) === party,
  );
}

// Bank details on the document differ from the saved contact. The classic invoice fraud.
// Formatting is ignored: "30-00-69" and "300069" are the same sort code.
export function bankChanged(invoice: Invoice, contact: Contact | undefined) {
  const printed = invoice.documentBank;
  const saved = contact?.bank;
  if (!printed || !saved) return false;
  const digits = (s: string) => s.replace(/[^0-9a-z]/gi, "").toLowerCase();
  return digits(printed.sortCode) !== digits(saved.sortCode) || digits(printed.accountNumber) !== digits(saved.accountNumber);
}

// The contact being paid is not the supplier named on the invoice.
export function contactMismatch(invoice: Invoice, contact: Contact | undefined) {
  return !!contact && !!invoice.supplier && norm(contact.name) !== norm(invoice.supplier);
}

export type RuleContext = {
  docs: Doc[];
  contacts: Contact[];
  erp: ErpAdapter;
  today: string;
};

export function isEditable(doc: Doc) {
  if (doc.extraction !== "done") return false;
  return doc.type === "invoice" ? doc.status === "draft" || doc.status === "ready_to_pay" : doc.status === "draft";
}

// Money has gone, or the receipt is filed. Nothing more happens to the document.
export function isClosed(doc: Doc) {
  return doc.type === "invoice" ? doc.status === "paid" : doc.status === "submitted";
}

// Flags are counted only for fields this type actually shows, so a flag left over from
// another type can never block a document with nothing to click.
function uncertainCount(doc: Doc) {
  const keys: readonly string[] = doc.type === "invoice" ? INVOICE_FIELDS : RECEIPT_FIELDS;
  const fields = Object.entries(doc.meta).filter(([key, m]) => keys.includes(key) && m?.uncertain).length;
  const lines = doc.lines.reduce((n, l) => n + (l.glMeta?.uncertain ? 1 : 0) + (l.taxMeta?.uncertain ? 1 : 0) + (l.amountMeta?.uncertain ? 1 : 0), 0);
  return fields + lines;
}

const overridden = (doc: Doc, code: Override) => doc.overrides?.includes(code) ?? false;

export function issuesFor(doc: Doc, ctx: RuleContext): Issue[] {
  if (!isEditable(doc)) return [];

  const issues: Issue[] = [];
  const { erp } = ctx;

  if (doc.type === "invoice") {
    const contact = ctx.contacts.find((c) => c.id === doc.contactId);
    if (!doc.supplier || !doc.number || !doc.dueOn) {
      issues.push({ code: "missing_field", label: "Supplier, invoice number and due date are needed", blocking: true, kind: "todo" });
    }
    if (doc.total <= 0) {
      issues.push({ code: "not_payable", label: "Nothing to pay: the total is zero or a credit", blocking: true, kind: "problem" });
    }
    if (!contact) {
      issues.push({ code: "missing_contact", label: "No contact chosen", blocking: true, kind: "todo" });
    } else {
      if (!contact.bank) {
        issues.push({ code: "missing_payment_details", label: "Contact has no payment details", blocking: true, kind: "problem" });
      } else if (bankChanged(doc, contact) && !overridden(doc, "bank_changed")) {
        issues.push({ code: "bank_changed", label: "Bank details differ from the saved contact", blocking: true, kind: "problem" });
      }
      if (contactMismatch(doc, contact) && !overridden(doc, "contact_mismatch")) {
        issues.push({ code: "contact_mismatch", label: "The contact is not the supplier named on the invoice", blocking: true, kind: "problem" });
      }
      if (contact.paidBefore === 0) {
        issues.push({ code: "first_time_supplier", label: "First payment to this supplier", blocking: false, kind: "info" });
      }
    }
    if (doc.dueOn && doc.dueOn < ctx.today) {
      issues.push({ code: "overdue", label: `Overdue since ${formatDate(doc.dueOn)}`, blocking: false, kind: "info" });
    }
  } else {
    if (!doc.merchant || !doc.paidOn) {
      issues.push({ code: "missing_field", label: "Merchant and date are needed", blocking: true, kind: "todo" });
    }
    if (doc.slipOnly) {
      issues.push({ code: "card_slip", label: "Looks like a card slip; the itemised receipt is better evidence", blocking: false, kind: "info" });
    }
  }

  const duplicate = findDuplicate(doc, ctx.docs);
  if (duplicate && !overridden(doc, "duplicate")) {
    issues.push({ code: "duplicate", label: "Possible duplicate", blocking: true, kind: "problem", relatedId: duplicate.id });
  }

  const counterpart = findCounterpart(doc, ctx.docs);
  if (counterpart && !overridden(doc, "counterpart")) {
    issues.push({
      code: "counterpart",
      label: counterpart.type === "invoice" ? "Already recorded as an invoice" : "Already recorded as a receipt",
      blocking: true,
      kind: "problem",
      relatedId: counterpart.id,
    });
  }

  if (!totalsMatch(doc)) {
    issues.push({ code: "totals_mismatch", label: "Lines do not add up to the document total", blocking: true, kind: "problem" });
  }

  if (taxMismatch(doc, erp)) {
    issues.push({ code: "tax_mismatch", label: "Tax on a line does not match its tax code", blocking: true, kind: "problem" });
  }

  const uncoded = doc.lines.filter((l) => !l.glCode || !l.taxCode).length;
  if (uncoded > 0) {
    issues.push({ code: "uncoded", label: uncoded === 1 ? "1 line needs a code" : `${uncoded} lines need a code`, blocking: true, kind: "todo" });
  }

  // A code chosen earlier may no longer exist in the ERP.
  const invalid = doc.lines.some(
    (l) => (l.glCode && !erp.glAccounts.some((a) => a.code === l.glCode)) || (l.taxCode && !erp.taxCodes.some((t) => t.code === l.taxCode)),
  );
  if (invalid) {
    issues.push({ code: "invalid_code", label: `A code is not in ${erp.name}`, blocking: true, kind: "problem" });
  }

  for (const field of erp.extraLineFields) {
    if (doc.lines.some((l) => !l.extra?.[field.key])) {
      issues.push({ code: "missing_erp_field", label: `${erp.name} needs a ${field.label.toLowerCase()} on every line`, blocking: true, kind: "todo" });
    }
  }

  if (doc.lines.some((l) => !l.description.trim())) {
    issues.push({ code: "no_description", label: "A line has no description", blocking: true, kind: "todo" });
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

export type StatusKey =
  | "in_progress"
  | "unreadable"
  | "needs_review"
  | "issues"
  | "ready"
  | "scheduled"
  | "processing"
  | "payment_failed"
  | "sync_failed"
  | "syncing"
  | "done";

// `state` is the brief's word for where the document is (Draft, Ready to Pay, Paid;
// Draft, Submitted). `detail` says why, in short, familiar words.
export type RowStatus = { key: StatusKey; state: string; detail?: string; count?: number; tone: Tone };

export function rowStatus(doc: Doc, issues: Issue[]): RowStatus {
  if (doc.extraction === "in_progress") return { key: "in_progress", state: "In Progress", tone: "neutral" };
  if (doc.extraction === "failed") return { key: "unreadable", state: "Could not read", tone: "danger" };

  const problems = issues.filter((i) => i.kind === "problem").length;
  const syncDetail = (state: string): RowStatus =>
    doc.sync === "failed"
      ? { key: "sync_failed", state, detail: "Sync failed", tone: "danger" }
      : doc.sync === "syncing"
        ? { key: "syncing", state, detail: "Syncing", tone: "neutral" }
        : { key: "done", state, tone: "ok" };

  if (doc.type === "invoice") {
    switch (doc.status) {
      case "paid":
        return syncDetail("Paid");
      case "processing":
        return { key: "processing", state: "Processing", tone: "neutral" };
      case "scheduled":
        return { key: "scheduled", state: "Scheduled", detail: doc.payment ? formatDate(doc.payment.payOn) : undefined, tone: "neutral" };
      case "payment_failed":
        return { key: "payment_failed", state: "Payment failed", tone: "danger" };
      case "ready_to_pay":
        // Something changed after it was marked ready. It stays Ready to Pay in the
        // data, but cannot be paid until the issue is dealt with.
        if (isBlocked(issues)) return { key: "issues", state: "Ready to Pay", detail: "found", count: Math.max(problems, 1), tone: "warn" };
        return { key: "ready", state: "Ready to Pay", tone: "ok" };
      case "draft":
        if (problems > 0) return { key: "issues", state: "Draft", detail: "found", count: problems, tone: "warn" };
        return { key: "needs_review", state: "Draft", detail: "Needs Review", tone: "dark" };
    }
  }

  if (doc.status === "submitted") return syncDetail("Submitted");
  if (problems > 0) return { key: "issues", state: "Draft", detail: "found", count: problems, tone: "warn" };
  if (isBlocked(issues)) return { key: "needs_review", state: "Draft", detail: "Needs Review", tone: "dark" };
  return { key: "ready", state: "Draft", detail: "Ready to submit", tone: "ok" };
}

// Does this document still need the user? Drives the count on each tab.
export function needsAction(doc: Doc) {
  if (doc.extraction === "failed") return true;
  if (doc.sync === "failed") return true;
  if (doc.type === "invoice") return ["draft", "ready_to_pay", "payment_failed"].includes(doc.status);
  return doc.status === "draft";
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
  // Money still owed wins over any sign of payment: a part-paid invoice is still an invoice.
  if (s.balanceDue !== undefined && s.balanceDue > 0) return { type: "invoice", reason: "A balance is still due" };
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

// Money already promised from an account: payments scheduled but not yet taken.
export function committed(accountId: string, docs: Doc[]) {
  return docs.reduce((sum, d) => (d.type === "invoice" && d.status === "scheduled" && d.payment?.accountId === accountId ? sum + d.total : sum), 0);
}

export function available(account: Account, docs: Doc[]) {
  return account.balance - committed(account.id, docs);
}
