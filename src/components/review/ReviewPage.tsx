"use client";

import { ArrowLeft, Check, ExternalLink, FileText, Info, Paperclip, Receipt as ReceiptIcon, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Money } from "@/components/ui/Money";
import { Select } from "@/components/ui/Select";
import { StatusLabel } from "@/components/ui/StatusLabel";
import { formatDate, formatLongDate } from "@/lib/dates";
import { isBlocked, isClosed, isEditable, linesNet, linesTax, linesTotal, partyOf, rowStatus } from "@/lib/rules";
import { useStore } from "@/lib/store";
import { track } from "@/lib/track";
import type { BankDetails, Contact, Currency, Doc, FieldKey, Invoice, Issue, IssueCode, Receipt } from "@/lib/types";
import { DocumentPreview } from "./DocumentPreview";
import { Field, inputClass, MoneyInput } from "./fields";
import { Lines } from "./Lines";

const channel = { upload: "upload", email: "email", whatsapp: "WhatsApp", xero: "Xero" } as const;
const currencies: Currency[] = ["GBP", "EUR", "USD"];

export function ReviewPage({ id, from = "list" }: { id: string; from?: "list" | "upload" }) {
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
  const readOnly = !isEditable(doc);
  const title = doc.type === "invoice" ? doc.number || "Invoice" : doc.merchant || "Receipt";

  // Every edit goes through the store, which sends a Ready to Pay invoice back to draft:
  // what was checked is no longer what would be paid.
  const edit = (fn: (d: Doc) => Doc) => actions.edit(id, fn);

  const setField = (key: FieldKey, value: string | number) => {
    track("field_corrected", { doc: id, field: key });
    edit((d) => ({ ...d, [key]: value, meta: { ...d.meta, [key]: { origin: "user" } } }) as Doc);
  };

  const confirmField = (key: FieldKey) => {
    track("ai_suggestion_accepted", { doc: id, field: key });
    edit((d) => ({ ...d, meta: { ...d.meta, [key]: { ...d.meta[key], origin: d.meta[key]?.origin ?? "document", uncertain: false } } }));
  };

  const remove = () => {
    actions.remove(id);
    actions.toast("Deleted", "ok", { label: "Undo", run: () => actions.restore(doc) });
    router.push(from === "upload" ? "/payments/upload" : "/payments");
  };

  // Back goes to where the document was opened from: the upload batch, or the list.
  const backLabel = from === "upload" ? "Back to upload" : "Back to Payments";
  const goBack = () => {
    if (from === "upload") {
      router.push("/payments/upload");
      return;
    }
    actions.setTab(doc.type === "invoice" ? "invoices" : "receipts");
    router.push("/payments");
  };

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-hairline px-5 py-3">
        <button type="button" onClick={goBack} aria-label={backLabel} className="flex h-8 items-center gap-2 rounded-full border border-line px-2.5 text-[12px] hover:border-ink">
          <ArrowLeft size={15} />
          {from === "upload" && <span>Upload</span>}
        </button>
        {doc.type === "invoice" ? <FileText size={16} strokeWidth={1.5} /> : <ReceiptIcon size={16} strokeWidth={1.5} />}
        <h1 className="truncate text-[14px]">{title}</h1>
        <span className="rounded-[3px] bg-ink px-1.5 py-0.5 text-[10.5px] text-white">{doc.type === "invoice" ? "Invoice" : "Receipt"}</span>
        {!readOnly && (
          <button type="button" onClick={() => actions.changeType(id)} className="text-[12px] text-muted underline underline-offset-2 hover:text-ink">
            Change to {doc.type === "invoice" ? "receipt" : "invoice"}
          </button>
        )}
        <span className="ml-auto text-[12px] text-muted">
          Sent by {doc.source.by} via {channel[doc.source.channel]} on {formatLongDate(doc.source.at.slice(0, 10))}
        </span>
        {!readOnly && (
          <Button variant="secondary" size="sm" onClick={remove}>
            Delete
          </Button>
        )}
        <button type="button" onClick={goBack} aria-label={`Close: ${backLabel.toLowerCase()}`} className="grid size-7 place-items-center rounded-[4px] hover:bg-surface-2">
          <X size={16} />
        </button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-2">
        <div className="relative overflow-y-auto bg-surface-2">
          <DocumentPreview doc={doc} focus={focus} />
        </div>

        <div className="flex min-h-0 flex-col border-l border-hairline">
          {/* relative: keeps screen-reader-only text inside this scroll area, so the page itself never scrolls */}
          <div className="relative flex-1 overflow-y-auto px-7 py-5">
            <p className="mb-4 flex items-start gap-2 text-[12px] text-muted">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>
                Read as {doc.type === "invoice" ? "an invoice" : "a receipt"}: {doc.typeReason}.
              </span>
            </p>

            {!readOnly && <Alerts doc={doc} issues={issues} leave={() => router.push(from === "upload" ? "/payments/upload" : "/payments")} />}

            {doc.type === "invoice" ? (
              <InvoiceFields doc={doc} readOnly={readOnly} setField={setField} confirmField={confirmField} edit={edit} onFocus={setFocus} />
            ) : (
              <ReceiptFields doc={doc} readOnly={readOnly} setField={setField} confirmField={confirmField} onFocus={setFocus} />
            )}

            <div className="mt-6">
              <Lines doc={doc} erp={erp} readOnly={readOnly} onChange={(lines) => edit((d) => ({ ...d, lines }))} onFocus={setFocus} />
            </div>

            <Totals doc={doc} issues={issues} readOnly={readOnly} setField={setField} confirmField={confirmField} onFocus={setFocus} />

            {doc.type === "invoice" && doc.attachments && doc.attachments.length > 0 && (
              <section aria-label="Attachments" className="mt-5">
                <h2 className="mb-2 text-[13px]">Attached</h2>
                <ul className="flex flex-col gap-1.5 text-[12.5px]">
                  {doc.attachments.map((a) => (
                    <li key={a.at + a.fileName} className="flex items-center gap-2">
                      <Paperclip size={13} className="text-muted" />
                      {a.fileName}
                      <span className="text-muted">
                        · {a.note}, sent by {a.by}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!readOnly && <Checklist doc={doc} issues={issues} />}
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
  setField: (key: FieldKey, value: string | number) => void;
  confirmField: (key: FieldKey) => void;
  onFocus: (key: string | null) => void;
};

function CurrencyField({ doc, readOnly, setField, confirmField }: Pick<FieldsProps<Doc>, "doc" | "readOnly" | "setField" | "confirmField">) {
  return (
    <Field label="Currency" meta={doc.meta.currency} onConfirm={() => confirmField("currency")}>
      {(fid) => (
        <Select id={fid} variant="field" label="Currency" disabled={readOnly} value={doc.currency} options={currencies.map((c) => ({ value: c, label: c }))} onChange={(c) => setField("currency", c)} />
      )}
    </Field>
  );
}

function InvoiceFields({ doc, readOnly, setField, confirmField, edit, onFocus }: FieldsProps<Invoice> & { edit: (fn: (d: Doc) => Doc) => void }) {
  const { state, actions } = useStore();
  const contact = state.contacts.find((c) => c.id === doc.contactId);

  return (
    <>
      <section aria-label="Contact" onFocus={() => onFocus("contact")}>
        <h2 className="mb-2 text-[15px]">Contact</h2>
        <div className="rounded-[6px] border border-hairline p-3">
          <Select
            id="contact-select"
            variant="field"
            label="Contact to pay"
            disabled={readOnly}
            attention={!doc.contactId}
            value={doc.contactId ?? ""}
            options={[{ value: "", label: "Choose a contact" }, ...state.contacts.map((c) => ({ value: c.id, label: c.name }))]}
            onChange={(v) => actions.setContact(doc.id, v || null)}
          />
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
          {contact && !contact.bank && !readOnly && <BankForm contact={contact} printed={doc.documentBank} />}
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
            {(fid) => <DateInput id={fid} disabled={readOnly} value={doc.issuedOn} onFocus={() => onFocus("issuedOn")} onChange={(v) => setField("issuedOn", v)} />}
          </Field>
          <Field
            label="Due date"
            meta={doc.meta.dueOn}
            onConfirm={() => confirmField("dueOn")}
            hint={doc.dueOn && doc.issuedOn && doc.dueOn < doc.issuedOn ? "The due date is before the date issued. Check both." : undefined}
          >
            {(fid) => <DateInput id={fid} disabled={readOnly} value={doc.dueOn} onFocus={() => onFocus("dueOn")} onChange={(v) => setField("dueOn", v)} />}
          </Field>
          <CurrencyField doc={doc} readOnly={readOnly} setField={setField} confirmField={confirmField} />
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
          {(fid) => <DateInput id={fid} disabled={readOnly} value={doc.paidOn} onFocus={() => onFocus("paidOn")} onChange={(v) => setField("paidOn", v)} />}
        </Field>
        <CurrencyField doc={doc} readOnly={readOnly} setField={setField} confirmField={confirmField} />
        <Field label="Sent by">{() => <span className="text-[13px]">{doc.source.by}</span>}</Field>
      </div>
    </section>
  );
}

// Payment details are typed by a person. What the document shows is put beside the form
// to compare against, and is never copied in.
function BankForm({ contact, printed }: { contact: Contact; printed: BankDetails | null }) {
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
      <p className="text-[12px]">This contact has no payment details. Enter them from a source you trust, such as a call to a number you already have.</p>
      {printed && (
        <p className="tabular mt-1.5 text-[12px] text-ink-2">
          This invoice shows {printed.sortCode} · {printed.accountNumber}. It is here to compare with, not to copy.
        </p>
      )}
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

function Totals({ doc, issues, readOnly, setField, confirmField, onFocus }: FieldsProps<Doc> & { issues: Issue[] }) {
  const total = linesTotal(doc);
  const diff = doc.total - total;
  const warn = "mb-2 flex items-start gap-2 rounded-[4px] bg-warn-soft px-2.5 py-2 text-[12px]";
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
        <p role="alert" className={warn}>
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <span>
            The lines add up to <Money amount={total} currency={doc.currency} />, which is <Money amount={Math.abs(diff)} currency={doc.currency} /> {diff > 0 ? "less" : "more"} than the document total. Change a line or the total until they agree.
          </span>
        </p>
      )}
      {issues.some((i) => i.code === "tax_mismatch") && (
        <p role="alert" className={warn}>
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <span>The tax on a line is not what its tax code gives. Choose the right code, or itemise so each line has one rate.</span>
        </p>
      )}
      {issues.some((i) => i.code === "not_payable") && (
        <p role="alert" className={warn}>
          <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn" />
          <span>There is nothing to pay on this document. If it is a credit note or a refund, it cannot be paid as an invoice.</span>
        </p>
      )}
    </section>
  );
}

function Alerts({ doc, issues, leave }: { doc: Doc; issues: Issue[]; leave: () => void }) {
  const { state, actions } = useStore();
  const has = (code: IssueCode) => issues.find((i) => i.code === code);
  const find = (issue?: Issue) => (issue ? state.docs.find((d) => d.id === issue.relatedId) : undefined);
  const duplicate = find(has("duplicate"));
  const counterpart = find(has("counterpart"));
  const contact = doc.type === "invoice" ? state.contacts.find((c) => c.id === doc.contactId) : undefined;

  const box = "mb-4 rounded-[6px] border border-warn/40 bg-warn-soft p-3.5 text-[12.5px]";
  const heading = "mb-1 flex items-center gap-2 font-medium";
  const describe = (d: Doc) => (d.type === "invoice" ? `${d.supplier} ${d.number}` : `${d.merchant}, ${formatDate(d.paidOn)}`);

  const deleteThis = (message: string) => {
    actions.remove(doc.id);
    actions.toast(message, "ok", { label: "Undo", run: () => actions.restore(doc) });
    leave();
  };

  // A receipt that matches an invoice that has been paid, or is paying, is proof of payment.
  const proofOfPayment = doc.type === "receipt" && counterpart?.type === "invoice" && !isEditable(counterpart);

  return (
    <>
      {duplicate && (
        <div className={box} role="alert">
          <p className={heading}>
            <TriangleAlert size={14} className="text-warn" /> Possible duplicate
          </p>
          <p>
            {describe(duplicate)} is already recorded with the same {duplicate.type === "invoice" ? "supplier and invoice number" : "merchant, amount and date"}.{" "}
            <Link href={`/payments/${duplicate.id}`} className="underline underline-offset-2">
              Open it
            </Link>
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" onClick={() => deleteThis("Duplicate deleted")}>
              Delete this one
            </Button>
            <Button size="sm" variant="secondary" onClick={() => actions.override(doc.id, "duplicate")}>
              Not a duplicate
            </Button>
          </div>
        </div>
      )}

      {counterpart && (
        <div className={box} role="alert">
          <p className={heading}>
            <TriangleAlert size={14} className="text-warn" /> {proofOfPayment ? "This looks like a payment confirmation" : `Already recorded as ${counterpart.type === "invoice" ? "an invoice" : "a receipt"}`}
          </p>
          <p>
            {describe(counterpart)} has the same {partyOf(doc) ? "name" : "party"} and amount
            {counterpart.type === "invoice" && isClosed(counterpart) && counterpart.payment ? `, and was paid on ${formatDate(counterpart.payment.payOn)}` : ""}. Keeping both would record the same cost twice.{" "}
            <Link href={`/payments/${counterpart.id}`} className="underline underline-offset-2">
              Open it
            </Link>
          </p>
          <div className="mt-2.5 flex gap-2">
            {proofOfPayment ? (
              <Button
                size="sm"
                onClick={() => {
                  actions.attachToInvoice(doc.id);
                  leave();
                }}
              >
                Attach to that invoice
              </Button>
            ) : (
              <Button size="sm" onClick={() => deleteThis("Deleted")}>
                Delete this one
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => actions.override(doc.id, "counterpart")}>
              Keep both
            </Button>
          </div>
        </div>
      )}

      {doc.type === "invoice" && has("contact_mismatch") && contact && (
        <div className={box} role="alert">
          <p className={heading}>
            <TriangleAlert size={14} className="text-warn" /> The contact is not the supplier on the invoice
          </p>
          <p>
            The invoice is from “{doc.supplier}”, but the payment would go to “{contact.name}”.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button size="sm" onClick={() => document.getElementById("contact-select")?.focus()}>
              Choose another contact
            </Button>
            <Button size="sm" variant="secondary" onClick={() => actions.override(doc.id, "contact_mismatch")}>
              Pay {contact.name} anyway
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
            <Button size="sm" variant="secondary" onClick={() => actions.useNewBankDetails(doc.id)}>
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
  const lines = { label: doc.type === "invoice" ? "Every line has a description, a GL code and a tax code" : "Every line has a description, a category and a tax code", done: !open("uncoded", "invalid_code", "missing_erp_field", "no_description") };
  const totals = { label: "Lines add up to the total, and tax matches the tax codes", done: !open("totals_mismatch", "tax_mismatch") };
  const flags = { label: "Flagged values checked", done: !open("uncertain") };
  const items =
    doc.type === "invoice"
      ? [
          { label: "Supplier, invoice number, due date and an amount to pay", done: !open("missing_field", "not_payable") },
          { label: "Contact matches the supplier and has payment details", done: !open("missing_contact", "missing_payment_details", "bank_changed", "contact_mismatch") },
          lines,
          totals,
          flags,
          { label: "Not already recorded", done: !open("duplicate", "counterpart") },
        ]
      : [{ label: "Merchant and date", done: !open("missing_field") }, lines, totals, flags, { label: "Not already recorded", done: !open("duplicate", "counterpart") }];

  return (
    <section aria-label="Checklist" className="mt-5 rounded-[6px] bg-surface p-4">
      <h2 className="mb-2 text-[13px]">{doc.type === "invoice" ? "Before this can be paid" : "Before this can be submitted"}</h2>
      <ul className="flex flex-col gap-1.5 text-[12.5px]">
        {items.map((item) => (
          <li key={item.label} className={`flex items-center gap-2 ${item.done ? "text-muted" : "text-ink"}`}>
            <span aria-hidden className={`grid size-4 shrink-0 place-items-center rounded-full ${item.done ? "bg-ink text-white" : "border border-warn"}`}>
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
  const { state, actions, erp } = useStore();
  const router = useRouter();
  const blocked = isBlocked(issues);
  const left = issues.filter((i) => i.blocking).length;
  const hint = blocked ? <span className="mr-2 text-[12px] text-muted">{left === 1 ? "1 thing left" : `${left} things left`}</span> : null;

  const afterClose = (
    <>
      {doc.sync === "failed" && (
        <Button size="sm" variant="secondary" onClick={() => actions.retrySync(doc.id)}>
          Retry sync to {erp.name}
        </Button>
      )}
      {doc.sync === "synced" && (
        <a href={erp.documentUrl(doc.id)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[12.5px] underline underline-offset-2">
          Open in {erp.name} <ExternalLink size={12} />
        </a>
      )}
    </>
  );

  if (doc.type === "receipt") {
    if (doc.status === "submitted") return afterClose;
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

  const account = state.accounts.find((a) => a.id === doc.payment?.accountId);
  switch (doc.status) {
    case "paid":
      return (
        <>
          {doc.payment && <span className="mr-2 text-[12px] text-muted">{doc.payment.accountId === "outside" ? "Paid elsewhere" : `Paid from ${account?.name ?? "the account"}`} on {formatDate(doc.payment.payOn)}</span>}
          {afterClose}
        </>
      );
    case "processing":
      return <span className="text-[12px] text-muted">The payment is with the bank. Nothing to do.</span>;
    case "scheduled":
      return (
        <>
          <span className="mr-2 text-[12px] text-muted">
            From {account?.name ?? "the account"} on {doc.payment ? formatDate(doc.payment.payOn) : ""}
          </span>
          <Button variant="secondary" onClick={() => actions.cancelPayment(doc.id)}>
            Cancel payment
          </Button>
        </>
      );
    case "payment_failed":
      return (
        <>
          <span className="mr-2 text-[12px] text-danger">{doc.payment?.failure}</span>
          <Button variant="secondary" onClick={() => actions.cancelPayment(doc.id)}>
            Back to Ready to Pay
          </Button>
          <Button onClick={() => actions.retryPayment(doc.id)}>Retry payment</Button>
        </>
      );
    case "ready_to_pay":
      if (!blocked) {
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
      return <span className="text-[12px] text-muted">Deal with the {left === 1 ? "issue" : "issues"} above before paying.</span>;
    case "draft":
      return (
        <>
          {hint}
          {/* Two ways on from a checked invoice: leave it Ready to Pay for the next pay run, or
              pay it now. "Pay now" still goes through Ready to Pay; it only saves the trip
              back to the list. */}
          <Button
            variant="secondary"
            disabled={blocked}
            onClick={() => {
              if (actions.markReady(doc.id)) {
                actions.toast(`${doc.supplier} is ready to pay`);
                onDone();
              }
            }}
          >
            Mark as ready to pay
          </Button>
          <Button
            disabled={blocked}
            onClick={() => {
              if (actions.markReady(doc.id)) {
                actions.setBatch([doc.id]);
                router.push("/payments/confirm");
              }
            }}
          >
            Pay now
          </Button>
        </>
      );
  }
}
