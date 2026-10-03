"use client";

import { ArrowLeft, Check, ExternalLink, FileText, Info, Receipt as ReceiptIcon, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { StatusLabel } from "@/components/ui/StatusLabel";
import { formatDate, formatLongDate } from "@/lib/dates";
import { isBlocked, linesNet, linesTax, linesTotal, rowStatus } from "@/lib/rules";
import { useStore } from "@/lib/store";
import { track } from "@/lib/track";
import type { BankDetails, Contact, Doc, Invoice, Issue, IssueCode, Receipt } from "@/lib/types";
import { DocumentPreview } from "./DocumentPreview";
import { Field, inputClass, MoneyInput } from "./fields";
import { Lines } from "./Lines";

const channel = { upload: "upload", email: "email", whatsapp: "WhatsApp", xero: "Xero" } as const;

export function ReviewPage({ id }: { id: string }) {
  const store = useStore();
  const { state, actions, erp } = store;
  const router = useRouter();
  const [focus, setFocus] = useState<string | null>(null);
  const doc = store.doc(id);

  if (!state.hydrated) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>;
  if (!doc || doc.extraction !== "done") {
    return (
      <div className="grid min-h-screen place-items-center text-center">
        <div>
          <p className="text-[15px]">{doc ? "This file has not been read yet." : "This document no longer exists."}</p>
          <ButtonLink href="/payments" variant="secondary" className="mt-4">
            Back to Payments
          </ButtonLink>
        </div>
      </div>
    );
  }

  const issues = store.issues(doc);
  const status = rowStatus(doc, issues);
  const closed = doc.type === "invoice" ? doc.status === "paid" : doc.status === "submitted";
  const title = doc.type === "invoice" ? doc.number || "Invoice" : doc.merchant || "Receipt";

  // Editing an invoice that was ready to pay sends it back to draft: what was checked
  // is no longer what would be paid.
  const edit = (fn: (d: Doc) => Doc) =>
    actions.update(id, (d) => {
      const next = fn(d);
      return next.type === "invoice" && next.status === "ready_to_pay" ? { ...next, status: "draft" } : next;
    });

  const setField = (key: string, value: string | number) => {
    track("field_corrected", { doc: id, field: key });
    edit((d) => ({ ...d, [key]: value, meta: { ...d.meta, [key]: { origin: "user" } } }) as Doc);
  };

  const confirmField = (key: string) => {
    track("ai_suggestion_accepted", { doc: id, field: key });
    actions.update(id, (d) => ({ ...d, meta: { ...d.meta, [key]: { ...d.meta[key], uncertain: false } } }));
  };

  const remove = () => {
    actions.remove(id);
    actions.toast("Deleted", "ok", { label: "Undo", run: () => actions.restore(doc) });
    router.push("/payments");
  };

  const goBack = () => {
    actions.setTab(doc.type === "invoice" ? "invoices" : "receipts");
    router.push("/payments");
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-hairline px-5 py-3">
        <button type="button" onClick={goBack} aria-label="Back to Payments" className="grid size-8 place-items-center rounded-full border border-line hover:border-ink">
          <ArrowLeft size={15} />
        </button>
        {doc.type === "invoice" ? <FileText size={16} strokeWidth={1.5} /> : <ReceiptIcon size={16} strokeWidth={1.5} />}
        <h1 className="truncate text-[14px]">{title}</h1>
        <span className="rounded-[3px] bg-ink px-1.5 py-0.5 text-[10.5px] text-white">{doc.type === "invoice" ? "Invoice" : "Receipt"}</span>
        {!closed && (
          <button type="button" onClick={() => actions.changeType(id)} className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
            Change to {doc.type === "invoice" ? "receipt" : "invoice"}
          </button>
        )}
        <span className="ml-auto text-[12px] text-muted">
          Sent by {doc.source.by} via {channel[doc.source.channel]} on {formatLongDate(doc.source.at.slice(0, 10))}
        </span>
        {!closed && (
          <Button variant="secondary" size="sm" onClick={remove}>
            Delete
          </Button>
        )}
        <button type="button" onClick={goBack} aria-label="Close" className="grid size-7 place-items-center rounded-[4px] hover:bg-surface-2">
          <X size={16} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="overflow-y-auto bg-surface-2">
          <DocumentPreview doc={doc} focus={focus} />
        </div>

        <div className="flex min-h-0 flex-col border-l border-hairline">
          <div className="flex-1 overflow-y-auto px-7 py-5">
            <p className="mb-4 flex items-start gap-2 text-[12px] text-muted">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Read as {doc.type === "invoice" ? "an invoice" : "a receipt"}: {doc.typeReason}.
              </span>
            </p>

            {!closed && <Alerts doc={doc} issues={issues} />}

            {doc.type === "invoice" ? (
              <InvoiceFields doc={doc} readOnly={closed} setField={setField} confirmField={confirmField} edit={edit} onFocus={setFocus} />
            ) : (
              <ReceiptFields doc={doc} readOnly={closed} setField={setField} confirmField={confirmField} onFocus={setFocus} />
            )}

            <div className="mt-6">
              <Lines doc={doc} erp={erp} readOnly={closed} onChange={(lines) => edit((d) => ({ ...d, lines }))} onFocus={setFocus} />
            </div>

            <Totals doc={doc} readOnly={closed} setField={setField} confirmField={confirmField} onFocus={setFocus} />

            {!closed && <Checklist doc={doc} issues={issues} />}
          </div>

          <footer className="flex items-center gap-4 border-t border-hairline px-7 py-3.5">
            <StatusLabel status={status} />
            <div className="ml-auto flex items-center gap-2">
              <Footer doc={doc} issues={issues} onDone={goBack} />
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

type FieldsProps<T> = {
  doc: T;
  readOnly: boolean;
  setField: (key: string, value: string | number) => void;
  confirmField: (key: string) => void;
  onFocus: (key: string | null) => void;
};

function InvoiceFields({ doc, readOnly, setField, confirmField, edit, onFocus }: FieldsProps<Invoice> & { edit: (fn: (d: Doc) => Doc) => void }) {
  const { state, actions } = useStore();
  const contact = state.contacts.find((c) => c.id === doc.contactId);

  return (
    <>
      <section aria-label="Contact" onFocus={() => onFocus("contact")}>
        <h2 className="mb-2 text-[15px]">Contact</h2>
        <div className="rounded-[6px] border border-hairline p-3">
          <select
            aria-label="Contact to pay"
            disabled={readOnly}
            value={doc.contactId ?? ""}
            onChange={(e) => edit((d) => (d.type === "invoice" ? { ...d, contactId: e.target.value || null, bankChangeConfirmed: false } : d))}
            className={`${inputClass} ${doc.contactId ? "" : "border-warn"}`}
          >
            <option value="">Choose a contact</option>
            {state.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {contact?.bank && (
            <p className="tabular mt-2 text-[12px] text-muted">
              Pays to {contact.bank.sortCode} · {contact.bank.accountNumber} ({contact.bank.accountName})
              {contact.paidBefore > 0 ? ` · paid ${contact.paidBefore} times before` : " · first payment to this supplier"}
            </p>
          )}
          {!contact && !readOnly && doc.supplier && (
            <button type="button" onClick={() => actions.createContact(doc.id)} className="mt-2 text-[12px] underline underline-offset-2">
              Add “{doc.supplier}” as a new contact
            </button>
          )}
          {contact && !contact.bank && !readOnly && <BankForm contact={contact} />}
        </div>
      </section>

      <section aria-label="Invoice details" className="mt-6">
        <h2 className="mb-1 text-[15px]">Invoice details</h2>
        <div className="rounded-[6px] border border-hairline px-3">
          <Field label="Supplier" meta={doc.meta.supplier} onConfirm={() => confirmField("supplier")}>
            {(fid) => <input id={fid} disabled={readOnly} value={doc.supplier} onFocus={() => onFocus("supplier")} onChange={(e) => setField("supplier", e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Invoice number" meta={doc.meta.number} onConfirm={() => confirmField("number")}>
            {(fid) => <input id={fid} disabled={readOnly} value={doc.number} onFocus={() => onFocus("number")} onChange={(e) => setField("number", e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Date issued" meta={doc.meta.issuedOn} onConfirm={() => confirmField("issuedOn")}>
            {(fid) => <input id={fid} type="date" disabled={readOnly} value={doc.issuedOn} onFocus={() => onFocus("issuedOn")} onChange={(e) => setField("issuedOn", e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Due date" meta={doc.meta.dueOn} onConfirm={() => confirmField("dueOn")}>
            {(fid) => <input id={fid} type="date" disabled={readOnly} value={doc.dueOn} onFocus={() => onFocus("dueOn")} onChange={(e) => setField("dueOn", e.target.value)} className={inputClass} />}
          </Field>
          <Field label="Reference" hint="Shown on the supplier's bank statement.">
            {(fid) => <input id={fid} disabled={readOnly} value={doc.reference} maxLength={18} onChange={(e) => edit((d) => (d.type === "invoice" ? { ...d, reference: e.target.value } : d))} className={inputClass} />}
          </Field>
        </div>
      </section>
    </>
  );
}

function ReceiptFields({ doc, readOnly, setField, confirmField, onFocus }: FieldsProps<Receipt>) {
  return (
    <section aria-label="Receipt details">
      <h2 className="mb-1 text-[15px]">Receipt details</h2>
      <div className="rounded-[6px] border border-hairline px-3">
        <Field label="Merchant" meta={doc.meta.merchant} onConfirm={() => confirmField("merchant")}>
          {(fid) => <input id={fid} disabled={readOnly} value={doc.merchant} onFocus={() => onFocus("merchant")} onChange={(e) => setField("merchant", e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Date paid" meta={doc.meta.paidOn} onConfirm={() => confirmField("paidOn")}>
          {(fid) => <input id={fid} type="date" disabled={readOnly} value={doc.paidOn} onFocus={() => onFocus("paidOn")} onChange={(e) => setField("paidOn", e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Sent by">{() => <span className="text-[13px]">{doc.source.by}</span>}</Field>
      </div>
    </section>
  );
}

// Payment details are typed by a person. They are never taken from the document alone.
function BankForm({ contact }: { contact: Contact }) {
  const { actions } = useStore();
  const [sortCode, setSortCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const valid = /^\d{2}-?\d{2}-?\d{2}$/.test(sortCode.trim()) && /^\d{8}$/.test(accountNumber.trim());
  return (
    <form
      className="mt-3 rounded-[4px] bg-warn-soft p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const digits = sortCode.replace(/-/g, "");
        actions.setContactBank(contact.id, { accountName: contact.name, sortCode: `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`, accountNumber: accountNumber.trim() });
      }}
    >
      <p className="text-[12px]">This contact has no payment details. Enter them from a source you trust, not only from this invoice.</p>
      <div className="mt-2 flex items-end gap-2">
        <label className="text-[11.5px] text-muted">
          Sort code
          <input value={sortCode} onChange={(e) => setSortCode(e.target.value)} placeholder="00-00-00" inputMode="numeric" className={`${inputClass} tabular mt-1 w-28`} />
        </label>
        <label className="text-[11.5px] text-muted">
          Account number
          <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="8 digits" inputMode="numeric" className={`${inputClass} tabular mt-1 w-32`} />
        </label>
        <Button type="submit" size="sm" disabled={!valid} className="mb-0.5">
          Save
        </Button>
      </div>
    </form>
  );
}

function Totals({ doc, readOnly, setField, confirmField, onFocus }: FieldsProps<Doc>) {
  const total = linesTotal(doc);
  const diff = doc.total - total;
  return (
    <section aria-label="Totals" className="mt-4 rounded-[6px] border border-hairline px-3 py-1">
      <div className="flex justify-between border-b border-hairline py-2 text-[12.5px] text-muted">
        <span>Lines before tax</span>
        <Money amount={linesNet(doc)} currency={doc.currency} />
      </div>
      <div className="flex justify-between border-b border-hairline py-2 text-[12.5px] text-muted">
        <span>Tax</span>
        <Money amount={linesTax(doc)} currency={doc.currency} />
      </div>
      <Field label="Document total" meta={doc.meta.total} onConfirm={() => confirmField("total")}>
        {(fid) => <MoneyInput id={fid} value={doc.total} disabled={readOnly} onFocus={() => onFocus("total")} onCommit={(v) => setField("total", v)} />}
      </Field>
      {diff !== 0 && (
        <p role="alert" className="mb-2 flex items-start gap-2 rounded-[4px] bg-warn-soft px-2.5 py-2 text-[12px]">
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <span>
            The lines add up to <Money amount={total} currency={doc.currency} />, which is <Money amount={Math.abs(diff)} currency={doc.currency} /> {diff > 0 ? "less" : "more"} than the document total. Change a line or the total until they agree.
          </span>
        </p>
      )}
    </section>
  );
}

function Alerts({ doc, issues }: { doc: Doc; issues: Issue[] }) {
  const { state, actions } = useStore();
  const router = useRouter();
  const has = (code: IssueCode) => issues.find((i) => i.code === code);
  const duplicate = has("duplicate");
  const confirms = has("confirms_invoice");
  const dupDoc = duplicate && state.docs.find((d) => d.id === duplicate.relatedId);
  const paidInvoice = confirms && state.docs.find((d) => d.id === confirms.relatedId);
  const contact = doc.type === "invoice" ? state.contacts.find((c) => c.id === doc.contactId) : undefined;

  const box = "mb-4 rounded-[6px] border border-warn/40 bg-warn-soft p-3.5 text-[12.5px]";
  const heading = "mb-1 flex items-center gap-2 font-medium";

  return (
    <>
      {dupDoc && (
        <div className={box} role="alert">
          <p className={heading}>
            <TriangleAlert size={14} className="text-warn" /> Possible duplicate
          </p>
          <p>
            {dupDoc.type === "invoice" ? `${dupDoc.supplier} ${dupDoc.number}` : `${dupDoc.merchant}, ${formatDate(dupDoc.paidOn)}`} is already recorded with the same{" "}
            {dupDoc.type === "invoice" ? "supplier and invoice number" : "merchant, amount and date"}.{" "}
            <Link href={`/payments/${dupDoc.id}`} className="underline underline-offset-2">
              Open it
            </Link>
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                actions.remove(doc.id);
                actions.toast("Duplicate deleted", "ok", { label: "Undo", run: () => actions.restore(doc) });
                router.push("/payments");
              }}
            >
              Delete this one
            </Button>
            <Button size="sm" variant="secondary" onClick={() => actions.dismissDuplicate(doc.id)}>
              Not a duplicate
            </Button>
          </div>
        </div>
      )}

      {paidInvoice?.type === "invoice" && (
        <div className={box} role="alert">
          <p className={heading}>
            <TriangleAlert size={14} className="text-warn" /> This looks like a payment confirmation
          </p>
          <p>
            {paidInvoice.supplier} {paidInvoice.number} was paid from here{paidInvoice.payment ? ` on ${formatDate(paidInvoice.payment.payOn)}` : ""}. Submitting this as a receipt would record the same cost twice.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                actions.attachToInvoice(doc.id);
                router.push("/payments");
              }}
            >
              Attach to that invoice
            </Button>
            <Button size="sm" variant="secondary" onClick={() => actions.dismissDuplicate(doc.id)}>
              Keep as a receipt
            </Button>
          </div>
        </div>
      )}

      {doc.type === "invoice" && has("bank_changed") && contact?.bank && doc.documentBank && (
        <div className={box} role="alert">
          <p className={heading}>
            <TriangleAlert size={14} className="text-warn" /> Bank details differ from the saved contact
          </p>
          <p>Changed bank details on an invoice are a common fraud. Call the supplier on a number you already have before paying to a new account.</p>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <BankCard title={`Saved · paid ${contact.paidBefore} times`} bank={contact.bank} />
            <BankCard title="On this invoice" bank={doc.documentBank} changed />
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" onClick={() => actions.keepSavedBank(doc.id)}>
              Pay to the saved details
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                track("bank_change_confirmed", { doc: doc.id });
                actions.confirmBankChange(doc.id);
              }}
            >
              I have checked: use the new details
            </Button>
          </div>
        </div>
      )}

      {issues
        .filter((i) => i.kind === "info")
        .map((i) => (
          <p key={i.code} className="mb-3 flex items-start gap-2 text-[12px] text-ink-2">
            <Info size={13} className="mt-0.5 shrink-0" /> {i.label}
          </p>
        ))}
    </>
  );
}

function BankCard({ title, bank, changed }: { title: string; bank: BankDetails; changed?: boolean }) {
  return (
    <div className={`rounded-[4px] border bg-white p-2.5 ${changed ? "border-warn" : "border-line"}`}>
      <div className="text-[11px] text-muted">{title}</div>
      <div className="tabular mt-1 text-[13px]">{bank.sortCode}</div>
      <div className="tabular text-[13px]">{bank.accountNumber}</div>
    </div>
  );
}

// What still stands between this document and its next state, in plain words.
function Checklist({ doc, issues }: { doc: Doc; issues: Issue[] }) {
  const open = (...codes: IssueCode[]) => issues.some((i) => codes.includes(i.code));
  const items =
    doc.type === "invoice"
      ? [
          { label: "Supplier, invoice number and due date", done: !open("missing_field") },
          { label: "Contact with payment details", done: !open("missing_contact", "missing_payment_details", "bank_changed") },
          { label: "Every line has a GL code and a tax code", done: !open("uncoded", "invalid_code", "missing_erp_field") },
          { label: "Lines add up to the document total", done: !open("totals_mismatch") },
          { label: "Flagged values checked", done: !open("uncertain") },
          { label: "Not a duplicate", done: !open("duplicate") },
        ]
      : [
          { label: "Merchant and date", done: !open("missing_field") },
          { label: "Every line has a category and a tax code", done: !open("uncoded", "invalid_code", "missing_erp_field") },
          { label: "Lines add up to the receipt total", done: !open("totals_mismatch") },
          { label: "Flagged values checked", done: !open("uncertain") },
          { label: "Not already recorded", done: !open("duplicate", "confirms_invoice") },
        ];

  return (
    <section aria-label="Checklist" className="mt-5 rounded-[6px] bg-surface p-4">
      <h2 className="mb-2 text-[13px]">{doc.type === "invoice" ? "Before this can be paid" : "Before this can be submitted"}</h2>
      <ul className="flex flex-col gap-1.5 text-[12.5px]">
        {items.map((item) => (
          <li key={item.label} className={`flex items-center gap-2 ${item.done ? "text-muted" : "text-ink"}`}>
            <span aria-hidden className={`grid size-4 place-items-center rounded-full ${item.done ? "bg-ink text-white" : "border border-warn"}`}>
              {item.done && <Check size={10} strokeWidth={3} />}
            </span>
            {item.label}
            <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Footer({ doc, issues, onDone }: { doc: Doc; issues: Issue[]; onDone: () => void }) {
  const { actions, erp } = useStore();
  const router = useRouter();
  const blocked = isBlocked(issues);
  const left = issues.filter((i) => i.blocking).length;
  const hint = blocked ? <span className="mr-2 text-[12px] text-muted">{left === 1 ? "1 thing left" : `${left} things left`}</span> : null;

  const synced = doc.sync === "synced" && (
    <a href={erp.documentUrl(doc.id)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] underline underline-offset-2">
      Open in {erp.name} <ExternalLink size={12} />
    </a>
  );
  const retry = doc.sync === "failed" && (
    <Button size="sm" variant="secondary" onClick={() => actions.retrySync(doc.id)}>
      Retry sync to {erp.name}
    </Button>
  );

  if (doc.type === "invoice") {
    if (doc.status === "paid") {
      return (
        <>
          {doc.payment?.state === "failed" && (
            <Button size="sm" onClick={() => actions.retryPayment(doc.id)}>
              Retry payment
            </Button>
          )}
          {retry}
          {synced}
        </>
      );
    }
    if (doc.status === "ready_to_pay" && !blocked) {
      return (
        <>
          <Button variant="secondary" onClick={onDone}>
            Back to list
          </Button>
          <Button
            onClick={() => {
              actions.setBatch([doc.id]);
              router.push("/payments/confirm");
            }}
          >
            Pay
          </Button>
        </>
      );
    }
    return (
      <>
        {hint}
        <Button
          disabled={blocked}
          onClick={() => {
            actions.markReady(doc.id);
            actions.toast(`${doc.supplier} is ready to pay`);
            onDone();
          }}
        >
          Mark as ready to pay
        </Button>
      </>
    );
  }

  if (doc.status === "submitted") {
    return (
      <>
        {retry}
        {synced}
      </>
    );
  }
  return (
    <>
      {hint}
      <Button
        disabled={blocked}
        onClick={() => {
          actions.submit([doc.id]);
          onDone();
        }}
      >
        Submit
      </Button>
    </>
  );
}
