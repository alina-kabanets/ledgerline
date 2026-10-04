"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { anchoredPanel, anchorPanel } from "./anchor";

export type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  // Read out by screen readers; not shown.
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  id?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  align?: "left" | "right";
  // "filter" is a compact button for toolbars. "field" fills its row, like a text input.
  variant?: "filter" | "field" | "small";
  // Draws attention to a field that still needs a choice.
  attention?: boolean;
  onFocus?: () => void;
};

// The one dropdown used across the app, in the app's style. The list opens under the field,
// stays on screen, scrolls when long, and typing a few letters jumps to a match.
export function Select<T extends string>({ label, value, options, onChange, id, icon, disabled, align = "left", variant = "filter", attention, onFocus }: Props<T>) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();
  const current = options.find((o) => o.value === value);

  // Under the field, kept on screen, before the browser paints.
  useLayoutEffect(() => {
    if (open && button.current && list.current) return anchorPanel(button.current, list.current, { align, matchWidth: true });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the highlighted option in view in a long list.
  useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const show = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const choose = (option: Option<T> | undefined) => {
    if (!option) return;
    if (option.value !== value) onChange(option.value);
    close();
  };

  // Typing letters jumps to the first option that starts with them, or has a word that does.
  const jumpTo = (key: string, now: number) => {
    typed.current = { text: now - typed.current.at > 700 ? key : typed.current.text + key, at: now };
    const needle = typed.current.text.toLowerCase();
    const index = options.findIndex((o) => o.label.toLowerCase().split(/[\s·]+/).some((word, i, words) => words.slice(i).join(" ").startsWith(needle)));
    if (index >= 0) setActive(index);
  };

  if (disabled && variant === "field") {
    // Read-only: shown as plain text, like the other fields on a closed document.
    return <span className="block h-8 truncate text-[13px] leading-8 text-ink">{current?.label ?? "—"}</span>;
  }

  const shape = {
    filter: "h-8 gap-2 pl-3 pr-2.5 text-[12.5px]",
    field: "h-8 w-full gap-2 px-2.5 text-[13px]",
    small: "h-6 w-full gap-1 px-1.5 text-[11px]",
  }[variant];

  return (
    <div ref={root} className={variant === "filter" ? "relative inline-block" : "relative block w-full min-w-0"}>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={`${label}: ${current?.label ?? "none chosen"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={onFocus}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
        className={`flex items-center rounded-[4px] border bg-white text-left text-ink disabled:opacity-50 ${shape} ${open ? "border-ink" : attention ? "border-warn" : "border-line hover:border-faint"}`}
      >
        {icon}
        <span className={`min-w-0 flex-1 truncate ${current && current.value !== "" ? "" : "text-muted"}`}>{current?.label ?? "Choose"}</span>
        <ChevronDown size={variant === "small" ? 12 : 14} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          ref={list}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(options.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Home") {
              e.preventDefault();
              setActive(0);
            } else if (e.key === "End") {
              e.preventDefault();
              setActive(options.length - 1);
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              choose(options[active]);
            } else if (e.key === "Escape" || e.key === "Tab") {
              close();
            } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
              jumpTo(e.key, e.timeStamp);
            }
          }}
          className={`${anchoredPanel} overflow-y-auto rounded-[6px] border border-line bg-white py-1.5 shadow-[0_8px_24px_rgba(16,17,13,0.1)] outline-none`}
        >
          {options.map((option, i) => (
            <div
              key={option.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(option)}
              className={`flex cursor-pointer items-center gap-2.5 whitespace-nowrap pl-3 pr-6 text-ink ${variant === "small" ? "py-1.5 text-[12px]" : "py-2 text-[13px]"} ${i === active ? "bg-surface-2" : ""}`}
            >
              <span className="grid w-3.5 shrink-0 place-items-center">{option.value === value && <Check size={13} />}</span>
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
