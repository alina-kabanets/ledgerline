"use client";

import { CalendarClock, ListFilter, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { Select } from "@/components/ui/Select";
import { formatDate } from "@/lib/dates";
import { isClosed, needsAction, partyOf, rowStatus, type StatusKey } from "@/lib/rules";
import { useStore, type Tab } from "@/lib/store";
import type { Currency, Doc } from "@/lib/types";
import { DocTable, sortRows, type Row, type Sort, type SortKey } from "./DocTable";
import { ForwardCard } from "./ForwardCard";
import { Hero } from "./Hero";
import { SelectionBar } from "./SelectionBar";

type Bucket = "open" | "closed";

const statusName: Record<StatusKey, string> = {
  in_progress: "In Progress",
  unreadable: "Could not read",
  needs_review: "Needs Review",
  issues: "Issues found",
  ready: "Ready",
  scheduled: "Scheduled",
  processing: "Processing",
  payment_failed: "Payment failed",
  sync_failed: "Sync failed",
  syncing: "Syncing",
  done: "Complete",
};

function matches(doc: Doc, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const number = doc.type === "invoice" ? `${doc.number} ${doc.reference}` : "";
  return `${partyOf(doc)} ${number} ${doc.lines.map((l) => l.description).join(" ")} ${doc.source.by} ${doc.fileName}`.toLowerCase().includes(q);
}

const defaultSort: Record<Tab, Sort> = { invoices: { key: "due", dir: "asc" }, receipts: { key: "date", dir: "desc" } };

export function PaymentsPage() {
  const { state, actions, issues } = useStore();
  const tab = state.tab;
  const [bucket, setBucket] = useState<Record<Tab, Bucket>>({ invoices: "open", receipts: "open" });
  const [statusFilter, setStatusFilter] = useState<StatusKey | "all">("all");
  const [sort, setSort] = useState(defaultSort);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // /payments#receipts opens on the Receipts tab, so the tab can be linked to.
  useEffect(() => {
    if (window.location.hash === "#receipts") actions.setTab("receipts");
  }, [actions]);

  // Every row with its status, worked out once and shared by the filters, counts and table.
  const all = useMemo<(Row & { blockers: string[] })[]>(
    () =>
      state.docs.map((doc) => {
        const found = issues(doc);
        return { doc, status: rowStatus(doc, found), blockers: found.map((i) => i.code) };
      }),
    [state.docs, issues],
  );

  const ofTab = (t: Tab) => all.filter((r) => (t === "invoices" ? r.doc.type === "invoice" : r.doc.type === "receipt"));
  const mine = ofTab(tab);
  const theirs = ofTab(tab === "invoices" ? "receipts" : "invoices");
  const counts = { invoices: ofTab("invoices").filter((r) => needsAction(r.doc)).length, receipts: ofTab("receipts").filter((r) => needsAction(r.doc)).length };

  const open = mine.filter((r) => !isClosed(r.doc));
  const closed = mine.filter((r) => isClosed(r.doc));
  const inBucket = bucket[tab] === "open" ? open : closed;
  const searching = query.trim().length > 0;

  // A search looks through the whole tab, paid and unpaid, so nothing is hidden by a filter.
  const visible = searching ? mine.filter((r) => matches(r.doc, query)) : inBucket.filter((r) => statusFilter === "all" || r.status.key === statusFilter);
  const rows = sortRows(visible, sort[tab]);
  const otherMatches = searching ? theirs.filter((r) => matches(r.doc, query)).length : 0;

  // Selection is cut back to what is selectable right now. A document that stops being
  // ready (an edit, a new duplicate, a changed code list) drops out of the selection.
  const selectable = rows.filter((r) => r.status.key === "ready").map((r) => r.doc.id);
  const selection = selected.filter((id) => selectable.includes(id));

  const statusOptions = [...new Set(inBucket.map((r) => r.status.key))];

  // Not counted in the headline: unread files and anything that looks like a second copy.
  const counted = open.filter((r) => r.status.key !== "in_progress" && r.status.key !== "unreadable" && !r.blockers.includes("duplicate") && !r.blockers.includes("counterpart")).map((r) => r.doc);

  // The pay run belongs to the page, not to one tab: it stays put when the tab changes,
  // so the tabs and the table do not jump.
  const scheduled = ofTab("invoices").filter((r) => r.status.key === "scheduled");
  const showScheduled = () => {
    actions.setTab("invoices");
    setBucket({ ...bucket, invoices: "open" });
    setStatusFilter("scheduled");
    setSelected([]);
    setQuery("");
  };
  const scheduledTotals = new Map<Currency, number>();
  for (const r of scheduled) scheduledTotals.set(r.doc.currency, (scheduledTotals.get(r.doc.currency) ?? 0) + r.doc.total);
  const nextPayment = scheduled.map((r) => (r.doc.type === "invoice" ? (r.doc.payment?.payOn ?? "") : "")).sort()[0];

  const reset = () => {
    setSelected([]);
    setStatusFilter("all");
  };
  const switchTab = (next: Tab) => {
    actions.setTab(next);
    reset();
  };
  const onSort = (key: SortKey) => {
    const now = sort[tab];
    setSort({ ...sort, [tab]: { key, dir: now.key === key && now.dir === "asc" ? "desc" : "asc" } });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "invoices", label: "Invoices" },
    { id: "receipts", label: "Receipts" },
  ];
  const buckets: { id: Bucket; label: string; count: number }[] =
    tab === "invoices"
      ? [
          { id: "open", label: "Unpaid", count: open.length },
          { id: "closed", label: "Paid", count: closed.length },
        ]
      : [
          { id: "open", label: "To submit", count: open.length },
          { id: "closed", label: "Submitted", count: closed.length },
        ];

  return (
    <div className={`px-6 pt-5 min-[1400px]:px-8 ${selection.length ? "pb-28" : "pb-10"}`}>
      <header className="flex items-center justify-between">
        <h1 className="text-[17px] font-medium">Payments</h1>
        <ButtonLink href="/payments/upload" size="md">
          <Plus size={14} /> Upload
        </ButtonLink>
      </header>

      <div className="mt-6 flex items-start justify-between gap-8">
        <Hero tab={tab} docs={counted} hydrated={state.hydrated} />
        <ForwardCard />
      </div>

      {scheduled.length > 0 && (
        <section aria-label="Pay run" className="mt-6 flex items-center gap-3 rounded-[6px] border border-hairline px-4 py-3 text-[13px]">
          <CalendarClock size={17} strokeWidth={1.5} />
          <span>
            Pay run for{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={showScheduled}
            >
              {scheduled.length} {scheduled.length === 1 ? "payment" : "payments"}
            </button>
            <span className="text-muted"> · next on {formatDate(nextPayment)}</span>
          </span>
          <span className="ml-auto flex gap-4">
            {[...scheduledTotals].map(([currency, amount]) => (
              <Money key={currency} amount={amount} currency={currency} />
            ))}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={showScheduled}
          >
            View
          </Button>
        </section>
      )}

      <div role="tablist" aria-label="Document type" className="mt-7 flex gap-7 border-b border-hairline">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="documents"
            onClick={() => switchTab(t.id)}
            className={`-mb-px flex items-center gap-2 border-b pb-2.5 pt-1 text-[14px] ${tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            {t.label}
            {state.hydrated && (
              <span className={`rounded-[3px] px-1.5 text-[11px] ${tab === t.id ? "bg-ink text-white" : "bg-surface-2 text-muted"}`} aria-label={`${counts[t.id]} need action`}>
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className={`flex gap-1 rounded-[4px] bg-surface-2 p-0.5 ${searching ? "opacity-50" : ""}`} role="group" aria-label="Show">
          {buckets.map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={!searching && bucket[tab] === b.id}
              onClick={() => {
                setBucket({ ...bucket, [tab]: b.id });
                setQuery("");
                reset();
              }}
              className={`rounded-[3px] px-3 py-1 text-[12.5px] ${!searching && bucket[tab] === b.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {b.label} <span className="text-faint">{state.hydrated ? b.count : ""}</span>
            </button>
          ))}
        </div>

        <label className="flex h-8 w-72 items-center gap-2 rounded-[4px] border border-line px-2.5 text-[12.5px] focus-within:border-ink">
          <Search size={14} className="text-faint" />
          <span className="sr-only">Search invoices and receipts</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "invoices" ? "Search by supplier or invoice number" : "Search by merchant or sender"}
            className="w-full bg-transparent outline-none placeholder:text-faint"
          />
        </label>

        <Select
          label="Filter by status"
          icon={<ListFilter size={14} className="text-muted" />}
          value={statusFilter}
          disabled={searching}
          options={[{ value: "all", label: "All statuses" }, ...statusOptions.map((key) => ({ value: key, label: key === "ready" ? (tab === "invoices" ? "Ready to Pay" : "Ready to submit") : key === "done" ? (tab === "invoices" ? "Paid" : "Submitted") : statusName[key] }))]}
          onChange={(next) => {
            setStatusFilter(next);
            setSelected([]);
          }}
        />

        {searching && (
          <span className="text-[12.5px] text-muted">
            Searching all {tab === "invoices" ? "invoices, paid and unpaid" : "receipts, submitted or not"}
            {otherMatches > 0 && (
              <>
                {" · "}
                <button type="button" onClick={() => switchTab(tab === "invoices" ? "receipts" : "invoices")} className="underline underline-offset-2 hover:text-ink">
                  {otherMatches} more in {tab === "invoices" ? "Receipts" : "Invoices"}
                </button>
              </>
            )}
          </span>
        )}
      </div>

      <div id="documents" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-3">
        <DocTable
          tab={tab}
          rows={rows}
          hydrated={state.hydrated}
          selected={selection}
          selectable={selectable}
          onSelect={setSelected}
          sort={sort[tab]}
          onSort={onSort}
          empty={searching ? `Nothing in ${tab === "invoices" ? "Invoices" : "Receipts"} matches “${query.trim()}”.` : statusFilter !== "all" ? "Nothing with that status." : emptyText(tab, bucket[tab])}
        />
      </div>

      <SelectionBar tab={tab} ids={selection} onClear={() => setSelected([])} />
    </div>
  );
}

function emptyText(tab: Tab, bucket: Bucket) {
  if (tab === "invoices") return bucket === "open" ? "No invoices waiting. Upload one, or forward it to the address above." : "No paid invoices yet.";
  return bucket === "open" ? "No receipts waiting. Upload one, or send it by email or WhatsApp." : "No submitted receipts yet.";
}
