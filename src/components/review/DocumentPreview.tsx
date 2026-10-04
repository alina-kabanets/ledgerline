"use client";

import { useEffect, useRef } from "react";
import { formatLongDate } from "@/lib/dates";
import { moneyParts } from "@/lib/money";
import type { Currency, Doc } from "@/lib/types";

const symbol: Record<Currency, string> = { GBP: "£", EUR: "€", USD: "$" };

function amount(minor: number, currency: Currency) {
  const { sign, int, dec } = moneyParts(minor);
  return `${sign}${symbol[currency]}${int}.${dec}`;
}

// Which region of the document a form field points at.
export function regionFor(field: string | null) {
  if (!field) return null;
  if (field === "supplier" || field === "merchant") return "party";
  if (field === "contact" || field === "bank") return "bank";
  if (field.startsWith("line")) return "rows";
  return field;
}

// The uploaded document. Mock documents are drawn from data rather than shown as a PDF,
// so the region a value came from can be highlighted. That is a shortcut for this build.
export function DocumentPreview({ doc, focus }: { doc: Doc; focus: string | null }) {
  const region = regionFor(focus);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!region) return;
    root.current?.querySelector(`[data-region="${region}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [region]);

  const p = doc.printed;
  if (!p) {
    return (
      <div className="grid h-full place-items-center p-10 text-center text-[13px] text-muted">
        <div>
          <p className="text-ink">{doc.fileName}</p>
          <p className="mt-1">This file could not be read, so there is no preview. Enter the details from your copy.</p>
        </div>
      </div>
    );
  }

  const mark = (key: string, extra = "") =>
    `${extra} rounded-[3px] transition-shadow ${region === key ? "bg-accent-soft text-ink shadow-[0_0_0_3px_var(--color-accent)]" : ""} ${p.blurred.includes(key) ? "blur-[1.5px]" : ""}`;

  if (p.layout !== "invoice") {
    // A till receipt or a card slip: narrow paper, monospaced.
    return (
      <div ref={root} className="flex min-h-full justify-center p-8">
        <div className="h-fit w-[300px] -rotate-1 bg-white px-6 py-7 font-mono text-[12px] leading-relaxed shadow-[0_2px_12px_rgba(16,17,13,0.12)]">
          <div data-region="party" className={mark("party", "text-center text-[14px] font-medium uppercase")}>
            {p.from}
          </div>
          {p.dates.map((d) => (
            <div key={d.key} data-region={d.key} className={mark(d.key, "mt-2 text-center")}>
              {formatLongDate(d.value)}
            </div>
          ))}
          <div className="my-3 border-t border-dashed border-faint" />
          <div data-region="rows" className={mark("rows")}>
            {p.rows.map((r, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span>{r.description}</span>
                <span>{amount(r.amount, doc.currency)}</span>
              </div>
            ))}
          </div>
          {p.rows.length > 0 && <div className="my-3 border-t border-dashed border-faint" />}
          {p.totals.map((t) => (
            <div key={t.label} data-region={t.key} className={mark(t.key ?? "", `flex justify-between gap-3 ${t.key === "total" ? "text-[14px] font-medium" : ""}`)}>
              <span>{t.label}</span>
              <span>{amount(t.amount, doc.currency)}</span>
            </div>
          ))}
          <div className="my-3 border-t border-dashed border-faint" />
          {p.stamps.map((s) => (
            <div key={s} className="text-center uppercase">
              {s}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className="flex min-h-full justify-center p-8">
      <div className="relative h-fit w-full max-w-[560px] bg-white text-[12px] shadow-[0_2px_12px_rgba(16,17,13,0.12)]">
        <div className="flex items-center justify-between bg-[#1f3a4d] px-7 py-5 text-white">
          <span className="text-[19px] font-medium uppercase tracking-wide">{p.title}</span>
          {p.number && (
            <span data-region="number" className={mark("number", "px-1 text-[11px]")}>
              No. {p.number}
            </span>
          )}
        </div>

        <div className="px-7 py-6">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-muted">From</div>
              <div data-region="party" className={mark("party", "mt-1 -mx-1 px-1 text-[13px] font-medium")}>
                {p.from}
              </div>
            </div>
            <div>
              <div className="text-[9.5px] uppercase tracking-wider text-muted">To</div>
              <div className="mt-1 text-[13px]">{p.to}</div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2">
            {p.dates.map((d) => (
              <div key={d.key + d.label} data-region={d.key} className={mark(d.key, "-mx-1 px-1")}>
                <div className="text-[9.5px] uppercase tracking-wider text-muted">{d.label}</div>
                <div>{formatLongDate(d.value)}</div>
              </div>
            ))}
          </div>

          <table data-region="rows" className={mark("rows", "mt-6 w-full border-collapse")}>
            <thead>
              <tr className="bg-[#1f3a4d] text-left text-[10px] text-white">
                <th className="px-2 py-1.5 font-normal">Description</th>
                <th className="w-10 px-2 py-1.5 text-right font-normal">Qty</th>
                <th className="w-24 px-2 py-1.5 text-right font-normal">Amount</th>
              </tr>
            </thead>
            <tbody>
              {p.rows.map((r, i) => (
                <tr key={i} className="border-b border-hairline">
                  <td className="px-2 py-1.5">{r.description}</td>
                  <td className="px-2 py-1.5 text-right">{r.qty}</td>
                  <td className="tabular px-2 py-1.5 text-right">{amount(r.amount, doc.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="ml-auto mt-4 w-56">
            {p.totals.map((t) => (
              <div key={t.label} data-region={t.key} className={mark(t.key ?? "", `tabular flex justify-between px-2 py-1 ${t.key === "total" ? "text-[13px] font-medium" : ""}`)}>
                <span>{t.label}</span>
                <span>{amount(t.amount, doc.currency)}</span>
              </div>
            ))}
          </div>

          {p.bank && (
            <div data-region="bank" className={mark("bank", "mt-6 -mx-1 px-1 py-1")}>
              <div className="text-[11px] font-medium">Bank details</div>
              <div className="mt-1 leading-relaxed text-ink-2">
                Account name: {p.bank.accountName}
                <br />
                Sort code: {p.bank.sortCode}
                <br />
                Account number: {p.bank.accountNumber}
              </div>
            </div>
          )}
        </div>

        {p.stamps.length > 0 && (
          <div className="absolute right-7 top-24 rotate-[-8deg] rounded-[4px] border-2 border-ok px-3 py-1 text-center text-[13px] font-medium uppercase tracking-wider text-ok">
            {p.stamps.map((s) => (
              <div key={s}>{s}</div>
            ))}
          </div>
        )}

        <div className="bg-[#1f3a4d] px-7 py-2.5 text-center text-[9.5px] text-white">All amounts in {doc.currency}. VAT shown where applicable.</div>
      </div>
    </div>
  );
}
