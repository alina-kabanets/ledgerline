"use client";

import { Plus, Trash2 } from "lucide-react";
import { Money } from "@/components/ui/Money";
import type { ErpAdapter } from "@/lib/erp";
import { lineGross, newLine, setGross, setNet, setTaxCode } from "@/lib/lines";
import { linesTotal } from "@/lib/rules";
import { track } from "@/lib/track";
import type { Doc, LineItem } from "@/lib/types";
import { inputBase, inputClass, MoneyInput, OriginBadge, UncertainNote } from "./fields";

type Props = {
  doc: Doc;
  erp: ErpAdapter;
  readOnly: boolean;
  onChange: (lines: LineItem[]) => void;
  onFocus: (key: string | null) => void;
};

const selectClass = `${inputClass} appearance-none pr-6`;

export function Lines({ doc, erp, readOnly, onChange, onFocus }: Props) {
  // Receipts are entered as the amount paid; invoices as quantity and unit price.
  const mode = doc.type === "receipt" ? "gross" : "net";
  const remaining = doc.total - linesTotal(doc);
  const slip = doc.type === "receipt" && doc.slipOnly;

  const patch = (id: string, fn: (line: LineItem) => LineItem) => onChange(doc.lines.map((l) => (l.id === id ? fn(l) : l)));

  const setCode = (line: LineItem, key: "glCode" | "taxCode", value: string | null) => {
    const metaKey = key === "glCode" ? "glMeta" : "taxMeta";
    const was = line[metaKey]?.origin;
    if (was === "memory" || was === "document") track("ai_suggestion_changed", { doc: doc.id, field: key, from: line[key], to: value });
    patch(line.id, (l) => (key === "taxCode" ? setTaxCode(l, value, erp, mode) : { ...l, glCode: value, glMeta: { origin: "user" } }));
  };

  const confirm = (line: LineItem, metaKey: "glMeta" | "taxMeta") => {
    track("ai_suggestion_accepted", { doc: doc.id, field: metaKey });
    patch(line.id, (l) => ({ ...l, [metaKey]: { ...l[metaKey], uncertain: false } }));
  };

  const add = () => {
    const line = newLine(`${doc.id}-l${Date.now().toString(36)}`);
    // Start a new line from the first one's codes: on a receipt the split is usually by tax rate.
    onChange([...doc.lines, { ...line, glCode: doc.lines[0]?.glCode ?? null, glMeta: { origin: "user" } }]);
  };

  return (
    <section aria-label="Line items">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px]">Line items</h2>
        {!readOnly && !slip && (
          <button type="button" onClick={add} className="flex items-center gap-1 text-[12px] text-ink-2 hover:text-ink">
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
                  placeholder="Description"
                  onChange={(e) => patch(line.id, (l) => ({ ...l, description: e.target.value }))}
                  className={`${inputBase} min-w-0 flex-1`}
                />
                {mode === "net" ? (
                  <>
                    <input
                      aria-label={`Line ${n} quantity`}
                      type="number"
                      min={0}
                      step="any"
                      value={line.quantity}
                      disabled={readOnly}
                      onChange={(e) => patch(line.id, (l) => setNet(l, Number(e.target.value) || 0, l.unitAmount, erp))}
                      className={`${inputBase} tabular w-16 text-right`}
                    />
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
                  <label key={field.key} className="flex items-center gap-2 text-[12px] text-muted">
                    <span className="w-9 shrink-0">{field.label.slice(0, 4)}.</span>
                    <select
                      aria-label={`Line ${n} ${field.label}`}
                      disabled={readOnly}
                      value={line.extra?.[field.key] ?? ""}
                      onChange={(e) => patch(line.id, (l) => ({ ...l, extra: { ...l.extra, [field.key]: e.target.value } }))}
                      className={`${selectClass} ${line.extra?.[field.key] ? "" : "border-warn"}`}
                    >
                      <option value="">Choose {field.label.toLowerCase()}</option>
                      {field.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              <UncertainNote meta={line.glMeta} onConfirm={readOnly ? undefined : () => confirm(line, "glMeta")} />
              <UncertainNote meta={line.taxMeta} onConfirm={readOnly ? undefined : () => confirm(line, "taxMeta")} />

              <div className="mt-2 flex justify-end gap-4 text-[11.5px] text-muted">
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
              {!readOnly && mode === "net" && remaining !== 0 && Math.abs(remaining) <= 5 && (
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
        <select
          aria-label={ariaLabel}
          disabled={readOnly}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={`${selectClass} ${!value || !known ? "border-warn" : ""}`}
        >
          <option value="">Choose a code</option>
          {/* A code chosen earlier that the ERP no longer has. */}
          {value && !known && <option value={value}>{value} (not in {erpName})</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.text}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-1 pl-11">
        <OriginBadge meta={meta} align="left" />
      </div>
    </div>
  );
}
