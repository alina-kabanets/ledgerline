"use client";

import { ArrowLeft, ArrowRight, Calendar } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { addDays, formatDate, iso, today as todayIso } from "@/lib/dates";
import { anchoredPanel, anchorPanel } from "./anchor";

type Props = {
  id?: string;
  label?: string;
  // ISO date (YYYY-MM-DD), or "" when empty.
  value: string;
  onChange: (value: string) => void;
  // Earliest date that can be picked.
  min?: string;
  disabled?: boolean;
  onFocus?: () => void;
  size?: "md" | "sm";
};

const weekdays = ["M", "T", "W", "T", "F", "S", "S"];
const monthName = (year: number, month: number) => new Date(year, month, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

// "1/9/2026" or "01/09/26" typed by a person, to an ISO date. Null if it is not a real date.
function parseTyped(text: string): string | null {
  const match = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{2}|\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, month - 1, day);
  // Rejects 31/02: the Date would have rolled over into March.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return iso(date);
}

// The six weeks shown for a month, starting on a Monday.
function weeksOf(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(iso(first), -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// A date field type the date, or pick it from the calendar.
export function DateInput({ id, label, value, onChange, min, disabled, onFocus, size = "md" }: Props) {
  const today = todayIso();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  // The day the keyboard is on while the calendar is open.
  const [cursor, setCursor] = useState(value || today);
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Under the field, or above it when there is no room below.
  useLayoutEffect(() => {
    if (open && field.current && panel.current) return anchorPanel(field.current, panel.current, { maxHeight: 400 });
  }, [open]);

  const [year, month] = [Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)) - 1];
  const days = weeksOf(year, month);
  const allowed = (day: string) => !min || day >= min;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep keyboard focus on the day the cursor is on.
  useEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${cursor}"]`)?.focus();
  }, [open, cursor]);

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  const pick = (day: string) => {
    if (!allowed(day)) return;
    setText(null);
    setInvalid(false);
    if (day !== value) onChange(day);
    close();
  };
  const shiftMonth = (by: number) => {
    const d = new Date(year, month + by, 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    setCursor(iso(new Date(d.getFullYear(), d.getMonth(), Math.min(Number(cursor.slice(8, 10)), last))));
  };

  const commitText = () => {
    if (text === null) return;
    if (text.trim() === "") {
      setInvalid(false);
      setText(null);
      if (value) onChange("");
      return;
    }
    const parsed = parseTyped(text);
    if (!parsed) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(null);
    if (parsed !== value) onChange(parsed);
  };

  const small = size === "sm";
  const box = `flex items-center rounded-[4px] border bg-white ${small ? "h-7 text-[11.5px]" : "h-8 text-[13px]"} ${
    disabled ? "border-transparent" : invalid ? "border-danger" : open ? "border-ink" : "border-line focus-within:border-ink"
  }`;

  return (
    <div ref={root} className={`relative ${small ? "inline-block" : "block"}`}>
      <div ref={field} className={box}>
        <input
          id={id}
          aria-label={label}
          aria-invalid={invalid}
          disabled={disabled}
          inputMode="numeric"
          placeholder="dd/mm/yyyy"
          value={text ?? formatDate(value)}
          onFocus={(e) => {
            // Typing replaces the date rather than adding to it.
            e.currentTarget.select();
            onFocus?.();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor(value || today);
              setOpen(true);
            }
          }}
          className={`tabular min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-faint ${small ? "w-[86px] px-1.5" : "px-2.5"} ${disabled ? "px-0" : ""}`}
        />
        {!disabled && (
          <button
            ref={toggle}
            type="button"
            aria-label={`${label ?? "Date"}: open calendar`}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => {
              setCursor(value || (min && min > today ? min : today));
              setOpen((v) => !v);
            }}
            className={`grid shrink-0 place-items-center text-muted hover:text-ink ${small ? "size-7" : "size-8"}`}
          >
            <Calendar size={small ? 13 : 14} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {invalid && (
        <span role="alert" className="mt-1 block text-[11px] text-danger">
          Enter a date such as 01/09/2026
        </span>
      )}

      {open && (
        <div
          ref={panel}
          id={panelId}
          role="dialog"
          aria-label={`Choose ${label?.toLowerCase() ?? "a date"}`}
          className={`${anchoredPanel} w-[268px] overflow-y-auto rounded-[6px] border border-line bg-white p-3 text-ink shadow-[0_8px_24px_rgba(16,17,13,0.1)]`}
          onKeyDown={(e) => {
            const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
            if (e.key in step) {
              e.preventDefault();
              setCursor(addDays(cursor, step[e.key]));
            } else if (e.key === "PageUp") {
              e.preventDefault();
              shiftMonth(-1);
            } else if (e.key === "PageDown") {
              e.preventDefault();
              shiftMonth(1);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              close();
            }
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="pl-1 text-[13px]" aria-live="polite">
              {monthName(year, month)}
            </span>
            <span className="flex gap-1">
              <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="grid size-7 place-items-center rounded-[4px] hover:bg-surface-2">
                <ArrowLeft size={14} />
              </button>
              <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className="grid size-7 place-items-center rounded-[4px] hover:bg-surface-2">
                <ArrowRight size={14} />
              </button>
            </span>
          </div>

          <div className="grid grid-cols-7 text-center text-[11px] text-muted" aria-hidden>
            {weekdays.map((d, i) => (
              <span key={i} className="py-1">
                {d}
              </span>
            ))}
          </div>

          <div ref={grid} className="grid grid-cols-7 gap-y-0.5">
            {days.map((day) => {
              const inMonth = Number(day.slice(5, 7)) - 1 === month;
              const selected = day === value;
              const ok = allowed(day);
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  tabIndex={day === cursor ? 0 : -1}
                  disabled={!ok}
                  aria-pressed={selected}
                  aria-label={`${formatDate(day)}${day === today ? ", today" : ""}`}
                  onClick={() => pick(day)}
                  className={`tabular mx-auto grid size-8 place-items-center rounded-[4px] text-[12.5px] outline-none focus-visible:ring-1 focus-visible:ring-ink ${
                    selected
                      ? "bg-ink text-white"
                      : !ok
                        ? "text-faint line-through decoration-faint/60"
                        : `${inMonth ? "text-ink" : "text-faint"} hover:bg-surface-2 ${day === today ? "border border-line bg-accent-faint" : ""}`
                  }`}
                >
                  {Number(day.slice(8, 10))}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-[12px]">
            <span className="text-muted">{min ? `Earliest ${formatDate(min)}` : ""}</span>
            <button type="button" disabled={!allowed(today)} onClick={() => pick(today)} className="underline underline-offset-2 disabled:text-faint disabled:no-underline">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
