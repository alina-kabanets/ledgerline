import { switchType } from "./convert";
import { available, earliestPayDate, isBlocked, isEditable, issuesFor, type RuleContext } from "./rules";
import type { Account, Doc, Invoice } from "./types";

// Every change of state goes through here. A screen can hide a button, but only this
// file decides whether a move is allowed, so no screen can skip a state.

export type Action =
  | { type: "edit"; fn: (doc: Doc) => Doc }
  | { type: "change_type" }
  | { type: "mark_ready" }
  | { type: "back_to_draft" }
  | { type: "schedule"; account: Account; payOn: string }
  | { type: "cancel_payment" }
  | { type: "start_processing" }
  | { type: "retry_payment" }
  | { type: "settle"; ok: boolean; reason?: string }
  | { type: "mark_paid_outside"; on: string }
  | { type: "submit" };

export type Result = { ok: true; doc: Doc } | { ok: false; reason: string };

const refuse = (reason: string): Result => ({ ok: false, reason });
const name = (doc: Doc) => (doc.type === "invoice" ? doc.supplier || doc.fileName : doc.merchant || doc.fileName);

function firstBlocker(doc: Doc, ctx: RuleContext) {
  const issues = issuesFor(doc, ctx);
  return isBlocked(issues) ? issues.find((i) => i.blocking)?.label : undefined;
}

export function transition(doc: Doc, action: Action, ctx: RuleContext): Result {
  switch (action.type) {
    case "edit": {
      if (!isEditable(doc)) return refuse(`${name(doc)} can no longer be edited`);
      const next = action.fn(doc);
      // What was checked is no longer what would be paid, so it goes back to draft.
      return { ok: true, doc: next.type === "invoice" && next.status === "ready_to_pay" ? { ...next, status: "draft" } : next };
    }

    case "change_type":
      if (!isEditable(doc)) return refuse(`${name(doc)} can no longer change type`);
      return { ok: true, doc: switchType(doc, ctx.contacts) };

    case "submit": {
      if (doc.type !== "receipt") return refuse("Only a receipt can be submitted");
      if (doc.status !== "draft" || doc.extraction !== "done") return refuse(`${name(doc)} is not a draft`);
      const blocker = firstBlocker(doc, ctx);
      if (blocker) return refuse(`${name(doc)}: ${blocker}`);
      return { ok: true, doc: { ...doc, status: "submitted" } };
    }
  }

  if (doc.type !== "invoice") return refuse("Only an invoice can be paid");
  const invoice: Invoice = doc;

  switch (action.type) {
    case "mark_ready": {
      if (invoice.status !== "draft" || invoice.extraction !== "done") return refuse(`${name(doc)} is not a draft`);
      const blocker = firstBlocker(invoice, ctx);
      if (blocker) return refuse(`${name(doc)}: ${blocker}`);
      return { ok: true, doc: { ...invoice, status: "ready_to_pay" } };
    }

    case "back_to_draft":
      if (invoice.status !== "ready_to_pay") return refuse(`${name(doc)} is not Ready to Pay`);
      return { ok: true, doc: { ...invoice, status: "draft" } };

    case "schedule": {
      if (invoice.status !== "ready_to_pay") return refuse(`${name(doc)} is not Ready to Pay`);
      const blocker = firstBlocker(invoice, ctx);
      if (blocker) return refuse(`${name(doc)}: ${blocker}`);
      // No exchange rates in this build, so an invoice is paid from an account in its own currency.
      if (invoice.currency !== action.account.currency) return refuse(`${name(doc)} is in ${invoice.currency}; choose a ${invoice.currency} account`);
      if (action.payOn < earliestPayDate(action.account, ctx.today)) return refuse(`${name(doc)}: ${action.account.name} cannot pay that early`);
      if (invoice.total > available(action.account, ctx.docs)) return refuse(`${name(doc)}: not enough in ${action.account.name}`);
      return { ok: true, doc: { ...invoice, status: "scheduled", payment: { accountId: action.account.id, payOn: action.payOn } } };
    }

    case "cancel_payment":
      if (invoice.status !== "scheduled" && invoice.status !== "payment_failed") return refuse(`${name(doc)} has no payment to cancel`);
      return { ok: true, doc: { ...invoice, status: "ready_to_pay", payment: undefined } };

    case "start_processing":
      if (invoice.status !== "scheduled" || !invoice.payment) return refuse(`${name(doc)} is not scheduled`);
      return { ok: true, doc: { ...invoice, status: "processing" } };

    case "retry_payment":
      if (invoice.status !== "payment_failed" || !invoice.payment) return refuse(`${name(doc)} has no failed payment`);
      return { ok: true, doc: { ...invoice, status: "scheduled", payment: { ...invoice.payment, failure: undefined } } };

    case "settle":
      if (invoice.status !== "processing" || !invoice.payment) return refuse(`${name(doc)} is not being paid`);
      return action.ok
        ? { ok: true, doc: { ...invoice, status: "paid" } }
        : { ok: true, doc: { ...invoice, status: "payment_failed", payment: { ...invoice.payment, failure: action.reason } } };

    case "mark_paid_outside": {
      // Same bar as paying from here: checked, and nothing blocking.
      if (invoice.status !== "ready_to_pay") return refuse(`${name(doc)} must be Ready to Pay first`);
      const blocker = firstBlocker(invoice, ctx);
      if (blocker) return refuse(`${name(doc)}: ${blocker}`);
      return { ok: true, doc: { ...invoice, status: "paid", payment: { accountId: "outside", payOn: action.on } } };
    }
  }
}
