import type { RowStatus, Tone } from "@/lib/rules";

const square: Record<Tone, string> = {
  neutral: "border border-faint bg-white",
  dark: "bg-ink text-white",
  warn: "bg-warn text-white",
  danger: "bg-danger text-white",
  ok: "border border-ink bg-accent",
};

// A small square, the state, and why. The state is always in words (Draft, Ready to Pay,
// Paid, Submitted), so colour is never the only signal.
export function StatusLabel({ status, onIssuesClick }: { status: RowStatus; onIssuesClick?: () => void }) {
  const mark = status.tone === "dark" || status.tone === "warn" || status.tone === "danger" ? "!" : "";
  const issues = status.count ? `${status.count} ${status.count === 1 ? "issue" : "issues"}` : null;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[12.5px]">
      <span aria-hidden className={`grid size-[11px] shrink-0 place-items-center rounded-[2px] text-[8px] font-medium leading-none ${square[status.tone]}`}>
        {mark}
      </span>
      <span>
        <span className={status.tone === "neutral" ? "text-ink-2" : "text-ink"}>{status.state}</span>
        {(issues || status.detail) && <span className="text-muted"> · </span>}
        {issues &&
          (onIssuesClick ? (
            <button type="button" onClick={onIssuesClick} className="underline underline-offset-2 hover:text-warn">
              {issues}
            </button>
          ) : (
            <span className="underline underline-offset-2">{issues}</span>
          ))}
        {status.detail && <span className={status.tone === "danger" ? "text-danger" : "text-ink-2"}>{issues ? " " : ""}{status.detail}</span>}
      </span>
    </span>
  );
}
