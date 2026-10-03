"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { useStore, type Tab } from "@/lib/store";
import type { Currency } from "@/lib/types";

// A dark bar shown when rows are selected. One action per tab.
export function SelectionBar({ tab, ids, onClear }: { tab: Tab; ids: string[]; onClear: () => void }) {
  const { state, actions } = useStore();
  const router = useRouter();
  if (ids.length === 0) return null;

  const docs = state.docs.filter((d) => ids.includes(d.id));
  const totals = new Map<Currency, number>();
  for (const d of docs) totals.set(d.currency, (totals.get(d.currency) ?? 0) + d.total);
  const total = [...totals].map(([currency, amount]) => formatMoney(amount, currency)).join(" + ");
  const noun = tab === "invoices" ? (ids.length === 1 ? "invoice" : "invoices") : ids.length === 1 ? "receipt" : "receipts";

  return (
    <div role="region" aria-label="Selection" className="fixed bottom-6 left-1/2 z-30 flex w-[640px] max-w-[calc(100vw-220px)] -translate-x-1/2 items-center gap-4 rounded-[6px] bg-ink px-5 py-3 text-[13px] text-white shadow-[0_12px_32px_rgba(16,17,13,0.25)]">
      <span>
        {ids.length} {noun} selected
      </span>
      <span className="tabular ml-auto text-white/70">
        Total <span className="text-white">{total}</span>
      </span>
      {tab === "invoices" ? (
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            actions.setBatch(ids);
            router.push("/payments/confirm");
          }}
        >
          Pay {noun}
        </Button>
      ) : (
        <Button
          variant="accent"
          size="sm"
          onClick={() => {
            actions.submit(ids);
            onClear();
          }}
        >
          Submit {noun}
        </Button>
      )}
      <button type="button" aria-label="Clear selection" onClick={onClear} className="text-white/60 hover:text-white">
        <X size={15} />
      </button>
    </div>
  );
}
