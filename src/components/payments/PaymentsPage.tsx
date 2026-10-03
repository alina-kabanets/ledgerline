"use client";

import { Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { needsAction } from "@/lib/rules";
import { useStore, type Tab } from "@/lib/store";
import type { Doc, Invoice, Receipt } from "@/lib/types";
import { DocTable } from "./DocTable";
import { ForwardCard } from "./ForwardCard";
import { Hero } from "./Hero";
import { SelectionBar } from "./SelectionBar";

type Filter = "open" | "closed";

const isOpen = (doc: Doc) =>
  doc.type === "invoice" ? doc.status !== "paid" || doc.payment?.state === "failed" : doc.status === "draft";

function matches(doc: Doc, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const name = doc.type === "invoice" ? `${doc.supplier} ${doc.number} ${doc.reference}` : doc.merchant;
  const text = `${name} ${doc.lines.map((l) => l.description).join(" ")} ${doc.source.by}`.toLowerCase();
  return text.includes(q);
}

export function PaymentsPage() {
  const { state, actions } = useStore();
  const tab = state.tab;
  const [filter, setFilter] = useState<Record<Tab, Filter>>({ invoices: "open", receipts: "open" });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  // /payments#receipts opens on the Receipts tab, so the tab can be linked to.
  useEffect(() => {
    if (window.location.hash === "#receipts") actions.setTab("receipts");
  }, [actions]);

  const invoices = useMemo(() => state.docs.filter((d): d is Invoice => d.type === "invoice"), [state.docs]);
  const receipts = useMemo(() => state.docs.filter((d): d is Receipt => d.type === "receipt"), [state.docs]);
  const current: Doc[] = tab === "invoices" ? invoices : receipts;
  const other: Doc[] = tab === "invoices" ? receipts : invoices;

  const counts = { invoices: invoices.filter(needsAction).length, receipts: receipts.filter(needsAction).length };
  const open = current.filter(isOpen);
  const closed = current.filter((d) => !isOpen(d));
  const rows = (filter[tab] === "open" ? open : closed).filter((d) => matches(d, query));
  const otherMatches = query.trim() ? other.filter((d) => matches(d, query)).length : 0;
  // Selection can outlive the rows it pointed at (a tab switch, a deletion).
  const selection = selected.filter((id) => rows.some((d) => d.id === id));

  const switchTab = (next: Tab) => {
    actions.setTab(next);
    setSelected([]);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "invoices", label: "Invoices" },
    { id: "receipts", label: "Receipts" },
  ];
  const filters: { id: Filter; label: string; count: number }[] =
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
    <div className="px-8 pb-28 pt-5">
      <header className="flex items-center justify-between">
        <h1 className="text-[17px] font-medium">Payments</h1>
        <ButtonLink href="/payments/upload" size="md">
          <Plus size={14} /> Upload
        </ButtonLink>
      </header>

      <div className="mt-6 flex items-start justify-between gap-8">
        <Hero tab={tab} docs={open} hydrated={state.hydrated} />
        <ForwardCard />
      </div>

      <div role="tablist" aria-label="Document type" className="mt-8 flex gap-7 border-b border-hairline">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="documents"
            onClick={() => switchTab(t.id)}
            className={`-mb-px flex items-center gap-2 border-b pb-2.5 pt-1 text-[14px] ${
              tab === t.id ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {state.hydrated && (
              <span
                className={`rounded-[3px] px-1.5 text-[11px] ${tab === t.id ? "bg-ink text-white" : "bg-surface-2 text-muted"}`}
                aria-label={`${counts[t.id]} need action`}
              >
                {counts[t.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-1 rounded-[4px] bg-surface-2 p-0.5" role="group" aria-label="Show">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter[tab] === f.id}
              onClick={() => {
                setFilter({ ...filter, [tab]: f.id });
                setSelected([]);
              }}
              className={`rounded-[3px] px-3 py-1 text-[12.5px] ${filter[tab] === f.id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {f.label} <span className="text-faint">{state.hydrated ? f.count : ""}</span>
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

        {otherMatches > 0 && (
          <button type="button" onClick={() => switchTab(tab === "invoices" ? "receipts" : "invoices")} className="text-[12.5px] text-muted underline underline-offset-2 hover:text-ink">
            {otherMatches} more in {tab === "invoices" ? "Receipts" : "Invoices"}
          </button>
        )}
      </div>

      <div id="documents" role="tabpanel" aria-labelledby={`tab-${tab}`} className="mt-3">
        <DocTable
          tab={tab}
          rows={rows}
          hydrated={state.hydrated}
          selected={selection}
          onSelect={setSelected}
          empty={query.trim() ? `Nothing matches “${query.trim()}” here.` : emptyText(tab, filter[tab])}
        />
      </div>

      <SelectionBar tab={tab} ids={selection} onClear={() => setSelected([])} />
    </div>
  );
}

function emptyText(tab: Tab, filter: Filter) {
  if (tab === "invoices") return filter === "open" ? "No invoices waiting. Upload one, or forward it to the address above." : "No paid invoices yet.";
  return filter === "open" ? "No receipts waiting. Upload one, or send it by email or WhatsApp." : "No submitted receipts yet.";
}
