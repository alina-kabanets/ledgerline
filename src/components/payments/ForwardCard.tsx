"use client";

import { Check, Copy, Download, Mail, MessageCircle } from "lucide-react";
import { useState } from "react";
import { INBOX_EMAIL, INBOX_WHATSAPP } from "@/lib/seed";

function CopyRow({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the value is still visible and selectable.
    }
  };
  return (
    <div className="flex items-center gap-2.5">
      {icon}
      <span className="min-w-0 flex-1 truncate rounded-[4px] bg-surface-2 px-2.5 py-1.5 text-[11.5px]" title={value}>
        {value}
      </span>
      <button type="button" onClick={copy} aria-label={copied ? `${label} copied` : `Copy ${label}`} className="grid size-6 place-items-center text-muted hover:text-ink">
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

// The other ways documents arrive. Both are mocked here: documents in the demo data
// carry the channel they "came in" by.
export function ForwardCard() {
  return (
    <section aria-label="Forward documents" className="w-[330px] shrink-0 rounded-[6px] border border-hairline p-4">
      <div className="mb-3 flex items-start gap-2.5 text-[12.5px]">
        <Download size={16} strokeWidth={1.5} className="mt-0.5 shrink-0" />
        <span>Forward invoices and receipts by email or WhatsApp</span>
      </div>
      <div className="flex flex-col gap-2.5">
        <CopyRow icon={<Mail size={15} strokeWidth={1.5} />} value={INBOX_EMAIL} label="email address" />
        <CopyRow icon={<MessageCircle size={15} strokeWidth={1.5} className="text-ok" />} value={INBOX_WHATSAPP} label="WhatsApp number" />
      </div>
    </section>
  );
}
