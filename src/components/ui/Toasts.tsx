"use client";

import { Check, TriangleAlert, X } from "lucide-react";
import { useStore } from "@/lib/store";

export function Toasts() {
  const { state, actions } = useStore();
  return (
    <div aria-live="polite" className="pointer-events-none fixed left-1/2 top-4 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {state.toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-[6px] border px-4 py-3 text-[13px] shadow-[0_8px_24px_rgba(16,17,13,0.08)] ${
            t.tone === "danger" ? "border-danger/30 bg-danger-soft" : "border-line bg-white"
          }`}
        >
          {t.tone === "danger" ? <TriangleAlert size={15} className="text-danger" /> : <Check size={15} className="text-ok" />}
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                t.action?.run();
                actions.dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => actions.dismissToast(t.id)} className="text-muted hover:text-ink">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
