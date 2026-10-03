"use client";

import { Eye, File as FileIcon, Loader, PoundSterling, ShieldAlert, TriangleAlert, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { formatMoney } from "@/lib/money";
import { findDuplicate } from "@/lib/rules";
import { rejectFile, rotation, sampleBatch, type Sample } from "@/lib/samples";
import { useStore } from "@/lib/store";

// One row per file dropped. A file either becomes a document or is turned away with a reason.
type Item = { key: string; fileName: string; docId?: string; rejected?: string };

const tips = [
  { icon: PoundSterling, text: "GBP, EUR and USD invoices and receipts are supported" },
  { icon: Zap, text: "We'll pull in the details and work out whether each file is an invoice or a receipt" },
  { icon: Eye, text: "Always double check the extracted information" },
  { icon: ShieldAlert, text: "Each file must be under 2MB" },
];

export function UploadPage() {
  const { state, actions, today, doc } = useStore();
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const nextId = () => `up-${Date.now().toString(36)}-${++seq.current}`;

  const addSamples = (samples: Sample[]) => {
    const added: Item[] = [];
    const docs = [];
    for (const sample of samples) {
      const id = nextId();
      if (sample.notADocument || !sample.build) {
        added.push({ key: id, fileName: sample.fileName, rejected: sample.notADocument });
      } else {
        docs.push(sample.build({ id, today, fileName: sample.fileName, seq: seq.current }));
        added.push({ key: id, fileName: sample.fileName, docId: id });
      }
    }
    setItems((prev) => [...prev, ...added]);
    if (docs.length) actions.ingest(docs);
  };

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Item[] = [];
    const docs = [];
    for (const file of Array.from(files)) {
      const id = nextId();
      const rejected = rejectFile(file);
      if (rejected) {
        added.push({ key: id, fileName: file.name, rejected });
      } else {
        // Shortcut: a real file is given the next scripted result. See lib/samples.ts.
        const build = rotation[seq.current % rotation.length];
        docs.push(build({ id, today, fileName: file.name, seq: seq.current }));
        added.push({ key: id, fileName: file.name, docId: id });
      }
    }
    setItems((prev) => [...prev, ...added]);
    if (docs.length) actions.ingest(docs);
  };

  const rows = items.map((item) => ({ item, doc: item.docId ? doc(item.docId) : undefined }));
  const reading = rows.filter((r) => r.doc?.extraction === "in_progress").length;
  const invoices = rows.filter((r) => r.doc?.extraction === "done" && r.doc.type === "invoice").length;
  const receipts = rows.filter((r) => r.doc?.extraction === "done" && r.doc.type === "receipt").length;
  const failed = rows.filter((r) => r.item.rejected || r.doc?.extraction === "failed").length;

  const summary = [
    invoices && `${invoices} ${invoices === 1 ? "invoice" : "invoices"}`,
    receipts && `${receipts} ${receipts === 1 ? "receipt" : "receipts"}`,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="grid h-screen grid-cols-[1fr_minmax(420px,560px)]">
      <div className="p-5">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`grid h-full min-h-[420px] place-items-center rounded-[6px] border border-dashed ${dragging ? "border-ink bg-accent-faint" : "border-faint"}`}
        >
          <div className="text-center">
            <FileIcon size={26} strokeWidth={1.25} className="mx-auto" />
            <p className="mt-3 text-[14px]">Drop invoices and receipts here</p>
            <p className="mt-1 text-[12px] text-muted">Several at once is fine. PDF or image.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
                Select files
              </Button>
              <Button variant="secondary" size="sm" onClick={() => addSamples(sampleBatch)}>
                Add sample files
              </Button>
            </div>
            <input
              ref={input}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="sr-only"
              aria-label="Select files to upload"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <aside className="flex min-h-0 flex-col border-l border-hairline">
        <header className="flex items-center justify-between px-6 py-4">
          <h1 className="text-[15px] font-medium">Upload</h1>
          <Link href="/payments" aria-label="Close" className="grid size-7 place-items-center rounded-[4px] hover:bg-surface-2">
            <X size={16} />
          </Link>
        </header>

        <ul className="flex flex-col gap-3 px-6 pb-5 text-[13px]">
          {tips.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <Icon size={15} strokeWidth={1.5} className="mt-0.5 shrink-0" />
              {text}
            </li>
          ))}
        </ul>

        <div className="flex-1 overflow-y-auto border-t border-hairline px-6 py-4" aria-live="polite">
          {items.length === 0 ? (
            <p className="py-10 text-center text-[12.5px] text-muted">Files you add appear here, with what was found in each.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map(({ item, doc: d }) => (
                <li key={item.key} className="rounded-[6px] border border-hairline p-3">
                  <div className="flex items-center gap-2.5">
                    <FileIcon size={14} strokeWidth={1.5} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px]" title={item.fileName}>
                      {item.fileName}
                    </span>
                    {d?.extraction === "in_progress" && (
                      <span className="flex items-center gap-1.5 text-[11.5px] text-muted">
                        <Loader size={12} className="animate-spin" /> Reading
                      </span>
                    )}
                  </div>

                  {item.rejected && <Failure reason={item.rejected} onRemove={() => setItems((prev) => prev.filter((i) => i.key !== item.key))} />}

                  {d?.extraction === "failed" && (
                    <Failure
                      reason={d.extractionError ?? "Could not read this file."}
                      onRetry={() => actions.retryExtraction(d.id)}
                      onManual={() => {
                        actions.enterManually(d.id);
                        router.push(`/payments/${d.id}`);
                      }}
                    />
                  )}

                  {d?.extraction === "done" && (
                    <div className="mt-2.5 pl-6">
                      <div className="flex items-center gap-2">
                        <span className="rounded-[3px] bg-ink px-1.5 py-0.5 text-[10.5px] text-white">{d.type === "invoice" ? "Invoice" : "Receipt"}</span>
                        <span className="truncate text-[13px]">{d.type === "invoice" ? d.supplier : d.merchant}</span>
                        <span className="tabular ml-auto text-[12.5px]">{formatMoney(d.total, d.currency)}</span>
                      </div>
                      <p className="mt-1.5 text-[11.5px] text-muted">{d.typeReason}</p>
                      {(() => {
                        const dup = !d.duplicateDismissed && findDuplicate(d, state.docs);
                        return dup ? (
                          <p className="mt-2 flex items-start gap-1.5 rounded-[4px] bg-warn-soft px-2 py-1.5 text-[11.5px]">
                            <TriangleAlert size={13} className="mt-px shrink-0 text-warn" />
                            <span>
                              Looks the same as{" "}
                              <Link href={`/payments/${dup.id}`} className="underline underline-offset-2">
                                {dup.type === "invoice" ? dup.number : dup.merchant}
                              </Link>
                              , already recorded.
                            </span>
                          </p>
                        ) : null;
                      })()}
                      <div className="mt-2.5 flex gap-4 text-[11.5px]">
                        <Link href={`/payments/${d.id}`} className="underline underline-offset-2">
                          Review
                        </Link>
                        <button type="button" onClick={() => actions.changeType(d.id)} className="text-muted underline underline-offset-2 hover:text-ink">
                          Change to {d.type === "invoice" ? "receipt" : "invoice"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-4 border-t border-hairline px-6 py-4">
          <p className="text-[12.5px] text-muted">
            {items.length === 0
              ? "Nothing added yet"
              : reading > 0
                ? `Reading ${reading} ${reading === 1 ? "file" : "files"}…`
                : `${summary || "Nothing"} added${failed ? `, ${failed} not added` : ""}`}
          </p>
          <ButtonLink
            href="/payments"
            variant={items.length ? "primary" : "secondary"}
            onClick={() => {
              // Land on the tab that received documents.
              if (invoices === 0 && receipts > 0) actions.setTab("receipts");
              else if (invoices > 0) actions.setTab("invoices");
            }}
          >
            Done
          </ButtonLink>
        </footer>
      </aside>
    </div>
  );
}

function Failure({ reason, onRetry, onManual, onRemove }: { reason: string; onRetry?: () => void; onManual?: () => void; onRemove?: () => void }) {
  return (
    <div className="mt-2.5 pl-6">
      <p className="flex items-start gap-1.5 rounded-[4px] bg-danger-soft px-2 py-1.5 text-[11.5px]" role="alert">
        <TriangleAlert size={13} className="mt-px shrink-0 text-danger" />
        {reason}
      </p>
      <div className="mt-2 flex gap-4 text-[11.5px]">
        {onRetry && (
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            Retry
          </button>
        )}
        {onManual && (
          <button type="button" onClick={onManual} className="underline underline-offset-2">
            Enter manually
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted underline underline-offset-2 hover:text-ink">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
