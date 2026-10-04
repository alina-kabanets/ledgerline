import { Money } from "@/components/ui/Money";
import type { Tab } from "@/lib/store";
import type { Currency, Doc } from "@/lib/types";

// The headline figure. Currencies are listed separately rather than added together:
// this build has no exchange rates, and a made-up total would be wrong. Documents that
// look like duplicates are left out, so the same cost is not counted twice.
export function Hero({ tab, docs, hydrated }: { tab: Tab; docs: Doc[]; hydrated: boolean }) {
  const byCurrency = new Map<Currency, number>();
  for (const doc of docs) byCurrency.set(doc.currency, (byCurrency.get(doc.currency) ?? 0) + doc.total);
  const [main, ...rest] = (["GBP", "EUR", "USD"] as Currency[]).filter((c) => byCurrency.has(c));

  return (
    <section aria-label={tab === "invoices" ? "Upcoming invoices" : "Receipts to submit"} className="pl-4">
      <div className="text-[11.5px] text-muted">{tab === "invoices" ? "Upcoming invoices" : `Receipts to submit${hydrated ? ` · ${docs.length}` : ""}`}</div>
      <div className="mt-2 min-h-[46px]">
        {!hydrated ? <div className="skeleton h-[44px] w-64" /> : <Money amount={byCurrency.get(main ?? "GBP") ?? 0} currency={main ?? "GBP"} size="hero" />}
      </div>
      <div className="mt-2 flex min-h-5 gap-5">{hydrated && rest.map((c) => <Money key={c} amount={byCurrency.get(c) ?? 0} currency={c} size="sub" />)}</div>
    </section>
  );
}
