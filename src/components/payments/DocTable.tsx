"use client";

import { FileText, Receipt as ReceiptIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { Money } from "@/components/ui/Money";
import { StatusLabel } from "@/components/ui/StatusLabel";
import { formatDate } from "@/lib/dates";
import { glName } from "@/lib/erp";
import { rowStatus } from "@/lib/rules";
import { useStore, type Tab } from "@/lib/store";
import type { Channel, Doc, Invoice, Receipt } from "@/lib/types";

const channelLabel: Record<Channel, string> = { upload: "Upload", email: "Email", whatsapp: "WhatsApp", xero: "Xero" };

const th = "px-3 py-2 text-left text-[11.5px] font-normal text-muted";
const td = "px-3 py-2 align-middle";

type Props = {
  tab: Tab;
  rows: Doc[];
  hydrated: boolean;
  selected: string[];
  onSelect: (ids: string[]) => void;
  empty: string;
};

export function DocTable({ tab, rows, hydrated, selected, onSelect, empty }: Props) {
  const { issues } = useStore();

  // Only documents that are ready can be paid or submitted in bulk.
  const selectable = rows.filter((d) => rowStatus(d, issues(d)).key === "ready").map((d) => d.id);
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));
  const toggle = (id: string) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const sorted = [...rows].sort((a, b) => {
    if (a.type === "invoice" && b.type === "invoice") return a.dueOn.localeCompare(b.dueOn);
    if (a.type === "receipt" && b.type === "receipt") return b.paidOn.localeCompare(a.paidOn);
    return 0;
  });

  return (
    <table className="w-full table-fixed border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-hairline">
          <th className={`${th} w-9`}>
            <input
              type="checkbox"
              aria-label={tab === "invoices" ? "Select all invoices that are ready to pay" : "Select all receipts that are ready to submit"}
              checked={allSelected}
              disabled={selectable.length === 0}
              onChange={() => onSelect(allSelected ? [] : selectable)}
            />
          </th>
          {tab === "invoices" ? (
            <>
              <th className={`${th} w-[104px]`}>Date issued</th>
              <th className={th}>From</th>
              <th className={`${th} w-[124px]`}>Due date</th>
              <th className={`${th} w-[96px]`}>Received</th>
              <th className={`${th} w-[156px]`}>Status</th>
              <th className={`${th} w-[136px] text-right`}>Amount</th>
            </>
          ) : (
            <>
              <th className={`${th} w-[104px]`}>Date paid</th>
              <th className={th}>Merchant</th>
              <th className={`${th} w-[160px]`}>Sent by</th>
              <th className={`${th} w-[176px]`}>Category</th>
              <th className={`${th} w-[156px]`}>Status</th>
              <th className={`${th} w-[136px] text-right`}>Amount</th>
            </>
          )}
          <th className={`${th} w-[212px]`}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {!hydrated &&
          [0, 1, 2, 3, 4].map((i) => (
            <tr key={i} className="border-b border-hairline">
              <td colSpan={8} className="px-3 py-3.5">
                <div className="skeleton h-5 w-full" />
              </td>
            </tr>
          ))}
        {hydrated && sorted.length === 0 && (
          <tr>
            <td colSpan={8} className="px-3 py-14 text-center text-muted">
              {empty}
            </td>
          </tr>
        )}
        {hydrated &&
          sorted.map((doc) =>
            doc.type === "invoice" ? (
              <InvoiceRow key={doc.id} doc={doc} selected={selected.includes(doc.id)} canSelect={selectable.includes(doc.id)} onToggle={() => toggle(doc.id)} />
            ) : (
              <ReceiptRow key={doc.id} doc={doc} selected={selected.includes(doc.id)} canSelect={selectable.includes(doc.id)} onToggle={() => toggle(doc.id)} />
            ),
          )}
      </tbody>
    </table>
  );
}

type RowProps<T> = { doc: T; selected: boolean; canSelect: boolean; onToggle: () => void };

function useRowMenu(doc: Doc): MenuItem[] {
  const { actions } = useStore();
  const router = useRouter();
  const closed = doc.type === "invoice" ? doc.status === "paid" : doc.status === "submitted";
  if (doc.extraction === "in_progress") return [];
  const items: MenuItem[] = [];
  if (!closed) {
    items.push({ label: "Edit", onSelect: () => router.push(`/payments/${doc.id}`) });
    if (doc.type === "invoice") items.push({ label: "Mark as Paid", onSelect: () => actions.markPaid(doc.id) });
    items.push({
      label: doc.type === "invoice" ? "Change to receipt" : "Change to invoice",
      onSelect: () => {
        actions.changeType(doc.id);
        actions.toast(doc.type === "invoice" ? "Moved to Receipts" : "Moved to Invoices", "ok", { label: "Undo", run: () => actions.changeType(doc.id) });
      },
    });
    items.push({
      label: "Delete",
      danger: true,
      onSelect: () => {
        actions.remove(doc.id);
        actions.toast("Deleted", "ok", { label: "Undo", run: () => actions.restore(doc) });
      },
    });
  }
  return items;
}

function InvoiceRow({ doc, selected, canSelect, onToggle }: RowProps<Invoice>) {
  const { issues, actions, today } = useStore();
  const router = useRouter();
  const status = rowStatus(doc, issues(doc));
  const menu = useRowMenu(doc);
  const overdue = doc.status !== "paid" && doc.dueOn && doc.dueOn < today;
  const busy = doc.extraction === "in_progress";

  return (
    <tr className={`border-b border-hairline ${selected ? "bg-accent-faint" : "hover:bg-surface"}`}>
      <td className={td}>
        <input type="checkbox" aria-label={`Select ${doc.supplier} ${doc.number}`} checked={selected} disabled={!canSelect} onChange={onToggle} />
      </td>
      <td className={`${td} tabular text-ink-2`}>{busy ? <div className="skeleton h-4 w-20" /> : formatDate(doc.issuedOn)}</td>
      <td className={td}>
        <div className="flex items-center gap-3">
          <FileText size={16} strokeWidth={1.25} className="shrink-0 text-muted" />
          {busy ? (
            <div className="text-muted">{doc.fileName}</div>
          ) : (
            <Link href={`/payments/${doc.id}`} className="min-w-0 hover:underline">
              <div className="truncate">{doc.supplier || "Unknown supplier"}</div>
              <div className="truncate text-[11px] text-muted">{doc.number || "No invoice number"}</div>
            </Link>
          )}
        </div>
      </td>
      <td className={`${td} tabular ${overdue ? "text-warn" : "text-ink-2"}`}>
        {busy ? <div className="skeleton h-4 w-20" /> : formatDate(doc.dueOn)}
        {overdue && <span className="sr-only"> overdue</span>}
        {overdue && <span aria-hidden className="ml-1.5 rounded-[2px] bg-warn-soft px-1 text-[10px]">!</span>}
      </td>
      <td className={`${td} text-[12px] text-muted`}>{channelLabel[doc.source.channel]}</td>
      <td className={td}>
        <StatusLabel status={status} onIssuesClick={() => router.push(`/payments/${doc.id}`)} />
      </td>
      <td className={`${td} text-right`}>{busy ? <div className="skeleton ml-auto h-4 w-24" /> : <Money amount={doc.total} currency={doc.currency} />}</td>
      <td className={`${td} text-right`}>
        <div className="flex items-center justify-end gap-2">
          {status.key === "ready" && (
            <Button
              size="sm"
              className="w-20"
              onClick={() => {
                actions.setBatch([doc.id]);
                router.push("/payments/confirm");
              }}
            >
              Pay
            </Button>
          )}
          {status.key === "payment_failed" && (
            <Button size="sm" variant="secondary" onClick={() => actions.retryPayment(doc.id)}>
              Retry
            </Button>
          )}
          {status.key === "sync_failed" && (
            <Button size="sm" variant="secondary" onClick={() => actions.retrySync(doc.id)}>
              Retry sync
            </Button>
          )}
          {(status.key === "needs_review" || status.key === "issues") && (
            <ButtonLink href={`/payments/${doc.id}`} size="sm" variant="secondary" className="w-20">
              Review
            </ButtonLink>
          )}
          {!busy && status.key !== "needs_review" && status.key !== "issues" && (
            <ButtonLink href={`/payments/${doc.id}`} size="sm" variant={status.key === "ready" ? "ghost" : "secondary"}>
              View
            </ButtonLink>
          )}
          <Menu label={`More actions for ${doc.supplier} ${doc.number}`} items={menu} />
        </div>
      </td>
    </tr>
  );
}

function ReceiptRow({ doc, selected, canSelect, onToggle }: RowProps<Receipt>) {
  const { issues, actions, erp } = useStore();
  const router = useRouter();
  const status = rowStatus(doc, issues(doc));
  const menu = useRowMenu(doc);
  const busy = doc.extraction === "in_progress";

  const codes = [...new Set(doc.lines.map((l) => l.glCode))];
  const category =
    doc.lines.length > 1 && codes.length > 1
      ? `${doc.lines.length} lines`
      : codes[0]
        ? `${codes[0]} · ${glName(erp, codes[0]) ?? "Not in " + erp.name}`
        : "Not coded";

  return (
    <tr className={`border-b border-hairline ${selected ? "bg-accent-faint" : "hover:bg-surface"}`}>
      <td className={td}>
        <input type="checkbox" aria-label={`Select ${doc.merchant}`} checked={selected} disabled={!canSelect} onChange={onToggle} />
      </td>
      <td className={`${td} tabular text-ink-2`}>{busy ? <div className="skeleton h-4 w-20" /> : formatDate(doc.paidOn)}</td>
      <td className={td}>
        <div className="flex items-center gap-3">
          <ReceiptIcon size={16} strokeWidth={1.25} className="shrink-0 text-muted" />
          {busy ? (
            <div className="text-muted">{doc.fileName}</div>
          ) : (
            <Link href={`/payments/${doc.id}`} className="min-w-0 hover:underline">
              <div className="truncate">{doc.merchant || "Unknown merchant"}</div>
              <div className="truncate text-[11px] text-muted">{doc.lines[0]?.description}</div>
            </Link>
          )}
        </div>
      </td>
      <td className={td}>
        <div className="truncate">{doc.source.by}</div>
        <div className="text-[11px] text-muted">via {channelLabel[doc.source.channel]}</div>
      </td>
      <td className={`${td} text-ink-2`}>{busy ? <div className="skeleton h-4 w-32" /> : <div className="truncate" title={category}>{category}</div>}</td>
      <td className={td}>
        <StatusLabel status={status} onIssuesClick={() => router.push(`/payments/${doc.id}`)} />
      </td>
      <td className={`${td} text-right`}>{busy ? <div className="skeleton ml-auto h-4 w-24" /> : <Money amount={doc.total} currency={doc.currency} />}</td>
      <td className={`${td} text-right`}>
        <div className="flex items-center justify-end gap-2">
          {status.key === "ready" && (
            <Button size="sm" className="w-20" onClick={() => actions.submit([doc.id])}>
              Submit
            </Button>
          )}
          {status.key === "sync_failed" && (
            <Button size="sm" variant="secondary" onClick={() => actions.retrySync(doc.id)}>
              Retry sync
            </Button>
          )}
          {(status.key === "needs_review" || status.key === "issues") && (
            <ButtonLink href={`/payments/${doc.id}`} size="sm" variant="secondary" className="w-20">
              Review
            </ButtonLink>
          )}
          {!busy && status.key !== "needs_review" && status.key !== "issues" && (
            <ButtonLink href={`/payments/${doc.id}`} size="sm" variant={status.key === "ready" ? "ghost" : "secondary"}>
              View
            </ButtonLink>
          )}
          <Menu label={`More actions for ${doc.merchant}`} items={menu} />
        </div>
      </td>
    </tr>
  );
}
