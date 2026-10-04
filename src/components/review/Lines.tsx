"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Money } from "@/components/ui/Money";
import { Select } from "@/components/ui/Select";
import type { ErpAdapter } from "@/lib/erp";
import { lineGross, newLine, setGross, setNet, setTaxCode } from "@/lib/lines";
import { linesTotal, TAX_TOLERANCE } from "@/lib/rules";
import { track } from "@/lib/track";
import type { Doc, LineItem } from "@/lib/types";
import { inputBase, MoneyInput, OriginBadge, UncertainNote } from "./fields";

type Props = {
  doc: Doc;
  erp: ErpAdapter;
  readOnly: boolean;
  onChange: (lines: LineItem[]) => void;
  onFocus: (key: string | null) => void;
};


export function Lines({ doc, erp, readOnly, onChange, onFocus }: Props) {
  // Receipts are entered as the amount paid; invoices as quantity and unit price.
  const mode = doc.type === "receipt" ? "gross" : "net";
  const remaining = doc.total - linesTotal(doc);
  const slip = doc.type === "receipt" && doc.slipOnly;

  const patch = (id: string, fn: (line: LineItem) => LineItem) => onChange(doc.lines.map((l) => (l.id === id ? fn(l) : l)));

  const setCode = (line: LineItem, key: "glCode" | "taxCode", value: string | null) => {
    const was = (key === "glCode" ? line.glMeta : line.taxMeta)?.origin;
    if (was === "memory" || was === "document") track("ai_suggestion_changed", { doc: doc.id, field: key, from: line[key], to: value });
    patch(line.id, (l) => (key === "taxCode" ? setTaxCode(l, value, erp, mode) : { ...l, glCode: value, glMeta: { origin: "user" } }));
  };

  const confirm = (line: LineItem, metaKey: "glMeta" | "taxMeta") => {
    track("ai_suggestion_accepted", { doc: doc.id, field: metaKey });
    patch(line.id, (l) => ({ ...l, [metaKey]: { ...l[metaKey], uncertain: false } }));
  };

  return (
    <section aria-label="Line items">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px]">Line items</h2>
        {!readOnly && !slip && (
          <button type="button" onClick={() => onChange([...doc.lines, newLine(`${doc.id}-l${Date.now().toString(36)}`)])} className="flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink">
            <Plus size={13} /> {doc.type === "receipt" && doc.lines.length === 1 ? "Itemise" : "Add line"}
          </button>
        )}
      </div>

      {doc.type === "receipt" && doc.lines.length === 1 && !readOnly && (
        <p className="mb-2 text-[11.5px] text-muted">
          {slip ? "A card slip shows only the total, so it stays as one line." : "One line covers most receipts. Itemise when the receipt mixes VAT rates or categories."}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {doc.lines.map((line, index) => {
          const glKnown = !line.glCode || erp.glAccounts.some((a) => a.code === line.glCode);
          const taxKnown = !line.taxCode || erp.taxCodes.some((t) => t.code === line.taxCode);
          const n = index + 1;
          return (
            <li key={line.id} className="rounded-[6px] border border-hairline p-3" onFocus={() => onFocus(`line:${line.id}`)}>
              <div className="flex items-start gap-2">
                <input
                  aria-label={`Line ${n} description`}
                  value={line.description}
                  disabled={readOnly}
                  placeholder="Description (needed)"
                  onChange={(e) => patch(line.id, (l) => ({ ...l, description: e.target.value, amountMeta: { origin: "user" } }))}
                  className={`${inputBase} min-w-0 flex-1 ${line.description.trim() ? "" : "border-warn"}`}
                />
                {mode === "net" ? (
                  <>
                    <QuantityInput label={`Line ${n} quantity`} value={line.quantity} disabled={readOnly} onCommit={(q) => patch(line.id, (l) => setNet(l, q, l.unitAmount, erp))} />
                    <span className="pt-1.5 text-muted">×</span>
                    <div className="w-24">
                      <MoneyInput label={`Line ${n} unit price`} value={line.unitAmount} disabled={readOnly} onCommit={(v) => patch(line.id, (l) => setNet(l, l.quantity, v, erp))} />
                    </div>
                  </>
                ) : (
                  <div className="w-28">
                    <MoneyInput label={`Line ${n} amount, tax included`} value={lineGross(line)} disabled={readOnly} onCommit={(v) => patch(line.id, (l) => setGross(l, v, erp))} />
                  </div>
                )}
                {!readOnly && doc.lines.length > 1 && (
                  <button type="button" aria-label={`Delete line ${n}`} onClick={() => onChange(doc.lines.filter((l) => l.id !== line.id))} className="grid size-8 place-items-center text-muted hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <CodeSelect
                  label="Code"
                  ariaLabel={`Line ${n} GL code`}
                  value={line.glCode}
                  known={glKnown}
                  erpName={erp.name}
                  readOnly={readOnly}
                  options={erp.glAccounts.map((a) => ({ value: a.code, text: `${a.code} · ${a.name}` }))}
                  onChange={(v) => setCode(line, "glCode", v)}
                  meta={line.glMeta}
                />
                <CodeSelect
                  label="Tax"
                  ariaLabel={`Line ${n} tax code`}
                  value={line.taxCode}
                  known={taxKnown}
                  erpName={erp.name}
                  readOnly={readOnly}
                  options={erp.taxCodes.map((t) => ({ value: t.code, text: t.name }))}
                  onChange={(v) => setCode(line, "taxCode", v)}
                  meta={line.taxMeta}
                />
                {erp.extraLineFields.map((field) => (
                  <div key={field.key} className="col-span-2 flex items-center gap-2 text-[12px] text-muted">
                    <span className="w-20 shrink-0">{field.label}</span>
                    <Select
                      variant="field"
                      label={`Line ${n} ${field.label}`}
                      disabled={readOnly}
                      attention={!line.extra?.[field.key]}
                      value={line.extra?.[field.key] ?? ""}
                      options={[{ value: "", label: `Choose ${field.label.toLowerCase()}` }, ...field.options.map((o) => ({ value: o, label: o }))]}
                      onChange={(v) => patch(line.id, (l) => ({ ...l, extra: { ...l.extra, [field.key]: v } }))}
                    />
                  </div>
                ))}
              </div>

              <UncertainNote meta={line.glMeta} onConfirm={readOnly ? undefined : () => confirm(line, "glMeta")} />
              <UncertainNote meta={line.taxMeta} onConfirm={readOnly ? undefined : () => confirm(line, "taxMeta")} />

              <div className="mt-2 flex items-center justify-end gap-4 text-[11.5px] text-muted">
                {/* Where the description and amounts on this line came from. */}
                <span className="mr-auto">
                  <OriginBadge meta={line.amountMeta} align="left" />
                </span>
                {line.tax !== 0 && (
                  <span>
                    of which tax <Money amount={line.tax} currency={doc.currency} />
                  </span>
                )}
                <span className="text-ink">
                  <Money amount={lineGross(line)} currency={doc.currency} />
                </span>
              </div>

              {!readOnly && mode === "gross" && remaining !== 0 && doc.lines.length > 1 && (
                <button type="button" onClick={() => patch(line.id, (l) => setGross(l, lineGross(l) + remaining, erp))} className="mt-1 block w-full text-right text-[11.5px] underline underline-offset-2">
                  Put the remaining amount here
                </button>
              )}
              {/* Suppliers round VAT per line or per invoice, so a penny or two can differ. Anything larger is a real mismatch and is left for a person. */}
              {!readOnly && mode === "net" && remaining !== 0 && Math.abs(remaining) <= TAX_TOLERANCE && (
                <button type="button" onClick={() => patch(line.id, (l) => ({ ...l, tax: l.tax + remaining }))} className="mt-1 block w-full text-right text-[11.5px] underline underline-offset-2">
                  Rounding: adjust this line&apos;s tax by the difference
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Typed as text and only applied when it is a number above zero, so the field can be
// cleared while typing and can never hold a negative quantity.
function QuantityInput({ label, value, disabled, onCommit }: { label: string; value: number; disabled: boolean; onCommit: (quantity: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  return (
    <input
      aria-label={label}
      aria-invalid={invalid}
      inputMode="decimal"
      disabled={disabled}
      value={text ?? String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text === null) return;
        const parsed = /^\d+(\.\d+)?$/.test(text.trim()) ? Number(text) : NaN;
        if (!(parsed > 0)) {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        setText(null);
        if (parsed !== value) onCommit(parsed);
      }}
      className={`${inputBase} tabular w-16 text-right ${invalid ? "border-danger" : ""}`}
    />
  );
}

type CodeSelectProps = {
  label: string;
  ariaLabel: string;
  value: string | null;
  known: boolean;
  erpName: string;
  readOnly: boolean;
  options: { value: string; text: string }[];
  onChange: (value: string | null) => void;
  meta?: LineItem["glMeta"];
};

function CodeSelect({ label, ariaLabel, value, known, erpName, readOnly, options, onChange, meta }: CodeSelectProps) {
  return (
    <div>
      <div className="flex items-center gap-2 text-[12px] text-muted">
        <span className="w-9 shrink-0">{label}</span>
        <Select
          variant="field"
          label={ariaLabel}
          disabled={readOnly}
          attention={!value || !known}
          value={value ?? ""}
          options={[
            { value: "", label: "Choose a code" },
            // A code chosen earlier that the ERP no longer has.
            ...(value && !known ? [{ value, label: `${value} (not in ${erpName})` }] : []),
            ...options.map((o) => ({ value: o.value, label: o.text })),
          ]}
          onChange={(v) => onChange(v || null)}
        />
      </div>
      <div className="mt-1 pl-11">
        <OriginBadge meta={meta} align="left" />
      </div>
    </div>
  );
}
