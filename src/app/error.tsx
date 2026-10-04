"use client";

import { Button } from "@/components/ui/Button";

// Shown if a screen fails to render, for example because saved demo data is damaged.
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-screen place-items-center px-8 text-center">
      <div>
        <h1 className="text-[22px] font-light">Something went wrong on this screen</h1>
        <p className="mt-2 text-muted">Nothing was paid or submitted by this error. Try again, or start from fresh demo data.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
          <Button
            onClick={() => {
              try {
                for (const key of Object.keys(localStorage)) if (key.startsWith("ledgerline-")) localStorage.removeItem(key);
              } catch {
                // Storage unavailable: a reload is still worth trying.
              }
              window.location.reload();
            }}
          >
            Reset demo data
          </Button>
        </div>
      </div>
    </div>
  );
}
