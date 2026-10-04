"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, FileText, Receipt as ReceiptIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Menu, type MenuItem } from "@/components/ui/Menu";
import { Money } from "@/components/ui/Money";
import { StatusLabel } from "@/components/ui/StatusLabel";
import { ago, formatDate } from "@/lib/dates";
import { glName } from "@/lib/erp";
import { isEditable, partyOf, type RowStatus } from "@/lib/rules";
import { useStore, type Tab } from "@/lib/store";
import type { Channel, Doc } from "@/lib/types";

const channelLabel: Record<Channel, string> = { upload: "Upload", email: "Email", whatsapp: "WhatsApp", xero: "Xero" };

const th = "whitespace-nowrap px-3 py-2 text-left text-[11.5px] font-normal text-muted";
const td = "px-3 py-2 align-middle";

export type Row = { doc: Doc; status: RowStatus };
export type SortKey = "date" | "due" | "action" | "amount";
export type Sort = { key: SortKey; dir: "asc" | "desc" };

const sortValue = (doc: Doc, key: SortKey): string | number => {
  if (key === "amount") return doc.total;
  if (key === "action") return doc.updatedAt;
  if (key === "due") return doc.type === "invoice" ? doc.dueOn : doc.paidOn;
  return doc.type === "invoice" ? doc.issuedOn : doc.paidOn;
};

export function sortRows(rows: Row[], sort: Sort) {
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = sortValue(a.doc, sort.key);
    const y = sortValue(b.doc, sort.key);
    return (x < y ? -1 : x > y ? 1 : 0) * sign;
  });
}

type Props = {
  tab: Tab;
  rows: Row[];
  hydrated: boolean;
  selected: string[];
  // Only documents that are ready can be paid or submitted in bulk.
  selectable: string[];
  onSelect: (ids: string[]) => void;
  sort: Sort;
  onSort: (key: SortKey) => void;
  empty: string;
};

export function DocTable({ tab, rows, hydrated, selected, selectable, onSelect, sort, onSort, empty }: Props) {
  const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));
  const toggle = (id: string) => onSelect(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const columns = 8;

  const sortable = (key: SortKey, label: string, className: string) => (
    <th className={`${th} ${className}`} aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(key)} className={`inline-flex items-center gap-1 hover:text-ink ${sort.key === key ? "text-ink" : ""}`}>
        {label}
        {sort.key === key ? sort.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} /> : <ChevronsUpDown size={11} className="text-faint" />}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed border-collapse text-[13px]">
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
                {sortable("date", "Date issued", "w-[116px]")}
                <th className={th}>From</th>
                {sortable("due", "Due date", "w-[112px]")}
                {sortable("action", "Last action", "w-[104px]")}
                <th className={`${th} w-[196px]`}>Status</th>
                {sortable("amount", "Amount", "w-[124px] text-right [&>button]:flex-row-reverse")}
              </>
            ) : (
              <>
                {sortable("date", "Date paid", "w-[112px]")}
                <th className={th}>Merchant</th>
                <th className={`${th} w-[132px] min-[1400px]:w-[150px]`}>Sent by</th>
                <th className={`${th} w-[150px] min-[1400px]:w-[170px]`}>Category</th>
                <th className={`${th} w-[196px]`}>Status</th>
                {sortable("amount", "Amount", "w-[116px] text-right [&>button]:flex-row-reverse")}
              </>
            )}
            <th className={`${th} w-[140px] min-[1400px]:w-[212px]`}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {!hydrated &&
            [0, 1, 2, 3, 4].map((i) => (
              <tr key={i} className="border-b border-hairline">
                <td colSpan={columns} className="px-3 py-3.5">
                  <div className="skeleton h-5 w-full" />
                </td>
              </tr>
            ))}
          {hydrated && rows.length === 0 && (
            <tr>
              <td colSpan={columns} className="px-3 py-14 text-center text-muted">
                {empty}
              </td>
            </tr>
          )}
          {hydrated &&
            rows.map((row) => (
              <DocRow key={row.doc.id} row={row} selected={selected.includes(row.doc.id)} canSelect={selectable.includes(row.doc.id)} onToggle={() => toggle(row.doc.id)} />
            ))}
        </tbody>
      </table>
    </div>
  );
}

function DocRow({ row, selected, canSelect, onToggle }: { row: Row; selected: boolean; canSelect: boolean; onToggle: () => void }) {
  const { doc, status } = row;
  const { actions, erp, today } = useStore();
  const router = useRouter();
  const [confirmPaid, setConfirmPaid] = useState(false);

  const name = partyOf(doc);
  const href = `/payments/${doc.id}`;
  const busy = status.key === "in_progress";
  const noLink = busy || status.key === "unreadable";
  const overdue = doc.type === "invoice" && (doc.status === "draft" || doc.status === "ready_to_pay") && !!doc.dueOn && doc.dueOn < today;

  const menu: MenuItem[] = [];
  if (isEditable(doc)) {
    menu.push({ label: "Edit", onSelect: () => router.push(href) });
    // Offered only once the invoice has been checked: the same bar as paying from here.
    if (doc.type === "invoice" && status.key === "ready") menu.push({ label: "Mark as paid elsewhere…", onSelect: () => setConfirmPaid(true) });
    menu.push({
      label: doc.type === "invoice" ? "Change to receipt" : "Change to invoice",
      onSelect: () => {
        if (actions.changeType(doc.id)) {
          actions.toast(doc.type === "invoice" ? "Moved to Receipts" : "Moved to Invoices", "ok", { label: "Undo", run: () => actions.changeType(doc.id) });
        }
      },
    });
  }
  if (doc.type === "invoice" && (doc.status === "scheduled" || doc.status === "payment_failed")) {
    menu.push({ label: "Cancel payment", onSelect: () => actions.cancelPayment(doc.id) });
  }
  if (isEditable(doc) || status.key === "unreadable") {
    menu.push({
      label: "Delete",
      danger: true,
      onSelect: () => {
        actions.remove(doc.id);
        actions.toast("Deleted", "ok", { label: "Undo", run: () => actions.restore(doc) });
      },
    });
  }

  const review = status.key === "needs_review" || status.key === "issues";
  // Rows with a main action of their own. The rest have only View.
  const primary = ["ready", "payment_failed", "sync_failed"].includes(status.key);
  const codes = [...new Set(doc.lines.map((l) => l.glCode))];
  const category =
    doc.lines.length > 1 && codes.length > 1 ? `${doc.lines.length} lines` : codes[0] ? `${codes[0]} · ${glName(erp, codes[0]) ?? "Not in " + erp.name}` : "Not coded";

  return (
    <tr className={`border-b border-hairline ${selected ? "bg-accent-faint" : "hover:bg-surface"}`}>
      <td className={td}>
        <input type="checkbox" aria-label={`Select ${name || doc.fileName}`} checked={selected} disabled={!canSelect} onChange={onToggle} />
      </td>

      <td className={`${td} tabular text-ink-2`}>{noLink ? <span className="text-faint">—</span> : formatDate(doc.type === "invoice" ? doc.issuedOn : doc.paidOn)}</td>

      <td className={td}>
        <div className="flex items-center gap-3">
          {doc.type === "invoice" ? <FileText size={16} strokeWidth={1.25} className="shrink-0 text-muted" /> : <ReceiptIcon size={16} strokeWidth={1.25} className="shrink-0 text-muted" />}
          {noLink ? (
            <div className="truncate text-muted">{doc.fileName}</div>
          ) : (
            <Link href={href} className="min-w-0 hover:underline">
              <div className="truncate">{name || (doc.type === "invoice" ? "Unknown supplier" : "Unknown merchant")}</div>
              <div className="truncate text-[11px] text-muted">
                {doc.type === "invoice" ? `${doc.number || "No invoice number"} · ${channelLabel[doc.source.channel]}` : doc.lines[0]?.description || "No description"}
              </div>
            </Link>
          )}
        </div>
      </td>

      {doc.type === "invoice" ? (
        <>
          <td className={`${td} tabular ${overdue ? "text-warn" : "text-ink-2"}`}>
            {noLink ? <span className="text-faint">—</span> : formatDate(doc.dueOn)}
            {overdue && <span className="sr-only"> overdue</span>}
            {overdue && (
              <span aria-hidden className="ml-1.5 rounded-[2px] bg-warn-soft px-1 text-[10px]">
                !
              </span>
            )}
          </td>
          <td className={`${td} text-[12px] text-muted`}>{ago(doc.updatedAt)}</td>
        </>
      ) : (
        <>
          <td className={td}>
            <div className="truncate">{doc.source.by}</div>
            <div className="text-[11px] text-muted">via {channelLabel[doc.source.channel]}</div>
          </td>
          <td className={`${td} text-ink-2`}>
            {noLink ? (
              <span className="text-faint">—</span>
            ) : (
              <div className="truncate" title={category}>
                {category}
              </div>
            )}
          </td>
        </>
      )}

      <td className={td}>
        <StatusLabel status={status} onIssuesClick={() => router.push(href)} />
      </td>

      <td className={`${td} text-right`}>{noLink ? <span className="text-faint">—</span> : <Money amount={doc.total} currency={doc.currency} />}</td>

      <td className={`${td} text-right`}>
        <div className="flex items-center justify-end gap-2">
          {/* View comes first and the main action last, so the main action is in the same
              place on every row. Where a row has a main action, View is dropped on narrower
              screens: the name is already a link to the same place. */}
          {!busy && !review && status.key !== "unreadable" && (
            // The wrapper does the hiding: the button's own display class would win over "hidden".
            <span className={primary ? "hidden min-[1400px]:inline" : ""}>
              <ButtonLink href={href} size="sm" variant={primary ? "ghost" : "secondary"} className={primary ? "" : "w-[84px]"}>
                View
              </ButtonLink>
            </span>
          )}
          {status.key === "ready" && doc.type === "invoice" && (
            <Button
              size="sm"
              className="w-[84px]"
              onClick={() => {
                actions.setBatch([doc.id]);
                router.push("/payments/confirm");
              }}
            >
              Pay
            </Button>
          )}
          {status.key === "ready" && doc.type === "receipt" && (
            <Button size="sm" className="w-[84px]" onClick={() => actions.submit([doc.id])}>
              Submit
            </Button>
          )}
          {status.key === "payment_failed" && (
            <Button size="sm" variant="secondary" className="w-[84px]" onClick={() => actions.retryPayment(doc.id)}>
              Retry
            </Button>
          )}
          {status.key === "sync_failed" && (
            <Button size="sm" variant="secondary" className="w-[84px] px-0" onClick={() => actions.retrySync(doc.id)}>
              Retry sync
            </Button>
          )}
          {status.key === "unreadable" && (
            <>
              {doc.extractionRetryable && (
                <span className="hidden min-[1400px]:inline">
                  <Button size="sm" variant="secondary" onClick={() => actions.retryExtraction(doc.id)}>
                    Retry
                  </Button>
                </span>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  actions.enterManually(doc.id);
                  router.push(href);
                }}
              >
                Enter manually
              </Button>
            </>
          )}
          {review && (
            <ButtonLink href={href} size="sm" variant="secondary" className="w-[84px]">
              Review
            </ButtonLink>
          )}
          <Menu label={`More actions for ${name || doc.fileName}`} items={menu} />
        </div>
        {doc.type === "invoice" && (
          <ConfirmDialog
            open={confirmPaid}
            title="Mark as paid elsewhere?"
            body={`${doc.supplier} ${doc.number} will be recorded as paid and sent to ${erp.name}. No money moves from here. This cannot be undone here.`}
            confirmLabel="Mark as paid"
            onConfirm={() => actions.markPaidOutside(doc.id)}
            onClose={() => setConfirmPaid(false)}
          />
        )}
      </td>
    </tr>
  );
}
