"use client";

import { Sparkles } from "lucide-react";
import { useId, useState } from "react";
import { parseMoney, toInput } from "@/lib/money";
import type { FieldMeta } from "@/lib/types";

const originLabel: Record<FieldMeta["origin"], string> = {
  document: "From document",
  memory: "From history",
  user: "Edited by you",
  missing: "Not found",
};

// Says where a value came from. "From history" carries the reason.
export function OriginBadge({ meta, align = "right" }: { meta?: FieldMeta; align?: "left" | "right" }) {
  const id = useId();
  if (!meta) return null;
  const label = originLabel[meta.origin];
  const tone = meta.origin === "memory" ? "text-[#2f49e0]" : meta.origin === "missing" ? "text-warn" : "text-muted";

  if (!meta.reason) return <span className={`whitespace-nowrap text-[11px] ${tone}`}>{label}</span>;

  return (
    <span className="group relative inline-flex">
      <button type="button" aria-describedby={id} className={`inline-flex items-center gap-1 whitespace-nowrap text-[11px] underline decoration-dotted underline-offset-2 ${tone}`}>
        {meta.origin === "memory" && <Sparkles size={11} />}
        {label}
      </button>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute top-5 z-30 hidden w-64 ${align === "left" ? "left-0" : "right-0"} rounded-[6px] border border-line bg-white p-3 text-left text-[12px] leading-snug text-ink shadow-[0_8px_24px_rgba(16,17,13,0.1)] group-focus-within:block group-hover:block`}
      >
        <span className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
          <Sparkles size={11} /> Why this value
        </span>
        {meta.reason}
      </span>
    </span>
  );
}

// A value the AI was unsure about. It stays flagged until a person edits or confirms it.
export function UncertainNote({ meta, onConfirm }: { meta?: FieldMeta; onConfirm?: () => void }) {
  if (!meta?.uncertain) return null;
  return (
    <div className="mt-1.5 flex items-start justify-between gap-3 rounded-[4px] bg-warn-soft px-2.5 py-2 text-[11.5px]">
      <span>
        <span className="font-medium">Check this. </span>
        {meta.reason}
      </span>
      {onConfirm && (
        <button type="button" onClick={onConfirm} className="shrink-0 underline underline-offset-2">
          Looks right
        </button>
      )}
    </div>
  );
}

// Without a width, for inputs that sit in a row and set their own.
export const inputBase =
  "h-8 rounded-[4px] border border-line bg-white px-2.5 text-[13px] text-ink outline-none focus:border-ink disabled:border-transparent disabled:bg-transparent disabled:px-0 disabled:opacity-100";

export const inputClass = `${inputBase} w-full`;

type FieldProps = {
  label: string;
  meta?: FieldMeta;
  onConfirm?: () => void;
  children: (id: string) => React.ReactNode;
  hint?: string;
};

export function Field({ label, meta, onConfirm, children, hint }: FieldProps) {
  const id = useId();
  return (
    <div className={`border-b border-hairline py-2.5 last:border-b-0 ${meta?.uncertain ? "-mx-3 border-l-2 border-l-warn px-3" : ""}`}>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="w-32 shrink-0 text-[12.5px] text-muted">
          {label}
        </label>
        <div className="min-w-0 flex-1">{children(id)}</div>
        <div className="w-28 shrink-0 text-right">
          <OriginBadge meta={meta} />
        </div>
      </div>
      {hint && <p className="mt-1 pl-[140px] text-[11.5px] text-muted">{hint}</p>}
      <UncertainNote meta={meta} onConfirm={onConfirm} />
    </div>
  );
}

type MoneyInputProps = {
  id?: string;
  value: number;
  onCommit: (minor: number) => void;
  disabled?: boolean;
  onFocus?: () => void;
  label?: string;
  className?: string;
};

// Typed as pounds, stored as pence. The text is only parsed on blur, so a half-typed
// number is never written to the document.
export function MoneyInput({ id, value, onCommit, disabled, onFocus, label, className = "" }: MoneyInputProps) {
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const shown = text ?? toInput(value);

  const commit = () => {
    if (text === null) return;
    const parsed = parseMoney(text);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(null);
    if (parsed !== value) onCommit(parsed);
  };

  return (
    <span className="block">
      <input
        id={id}
        aria-label={label}
        aria-invalid={invalid}
        inputMode="decimal"
        disabled={disabled}
        value={shown}
        onFocus={(e) => {
          // Typing replaces the amount rather than adding to it.
          e.currentTarget.select();
          onFocus?.();
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`${inputClass} tabular text-right ${invalid ? "border-danger" : ""} ${className}`}
      />
      {invalid && (
        <span role="alert" className="mt-1 block text-right text-[11px] text-danger">
          Enter an amount such as 12.40
        </span>
      )}
    </span>
  );
}
