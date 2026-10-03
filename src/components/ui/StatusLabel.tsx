import type { RowStatus, Tone } from "@/lib/rules";

const square: Record<Tone, string> = {
  neutral: "border border-faint bg-white",
  dark: "bg-ink text-white",
  warn: "bg-warn text-white",
  danger: "bg-danger text-white",
  ok: "border border-ink bg-accent",
};

// A small square and a word, as in dense finance tables. Tone is never the only signal:
// the label always says what the state is.
export function StatusLabel({ status, onIssuesClick }: { status: RowStatus; onIssuesClick?: () => void }) {
  const mark = status.tone === "dark" || status.tone === "warn" || status.tone === "danger" ? "!" : "";
  return (
    <span className={`inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] ${status.tone === "neutral" ? "text-muted" : "text-ink"}`}>
      <span aria-hidden className={`grid size-[11px] shrink-0 place-items-center rounded-[2px] text-[8px] font-medium leading-none ${square[status.tone]}`}>
        {mark}
      </span>
      {status.count ? (
        <span>
          {onIssuesClick ? (
            <button type="button" onClick={onIssuesClick} className="underline underline-offset-2 hover:text-warn">
              {status.count} {status.count === 1 ? "issue" : "issues"}
            </button>
          ) : (
            <span className="underline underline-offset-2">
              {status.count} {status.count === 1 ? "issue" : "issues"}
            </span>
          )}{" "}
          {status.label}
        </span>
      ) : (
        status.label
      )}
    </span>
  );
}
