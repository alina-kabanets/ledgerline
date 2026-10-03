"use client";

import { MoreVertical } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type MenuItem = { label: string; onSelect: () => void; danger?: boolean };

// Row overflow menu. Closes on outside click, Escape, or after a choice.
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return <span className="inline-block w-7" />;

  return (
    <div ref={root} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="grid size-7 place-items-center rounded-[4px] text-ink hover:bg-surface-2"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div id={id} role="menu" className="absolute right-0 top-8 z-20 min-w-44 rounded-[6px] border border-line bg-white py-1.5 shadow-[0_8px_24px_rgba(16,17,13,0.08)]">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-4 py-2 text-left text-[13px] hover:bg-surface-2 ${item.danger ? "text-danger" : "text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
