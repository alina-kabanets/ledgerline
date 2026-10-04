"use client";

import { useEffect, useRef } from "react";
import { Button } from "./Button";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

// For actions that cannot be undone. Uses the browser's own dialog, so focus is trapped
// and Escape closes it without extra code.
export function ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[420px] rounded-[8px] border border-line p-0 backdrop:bg-ink/30">
      <div className="p-6">
        <h2 className="text-[16px]">{title}</h2>
        <p className="mt-2 text-[13px] text-ink-2">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
