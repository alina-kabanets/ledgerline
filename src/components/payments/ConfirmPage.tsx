"use client";

import { ArrowLeft, Check, Clock, Info, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateInput } from "@/components/ui/DateInput";
import { Money } from "@/components/ui/Money";
import { Select } from "@/components/ui/Select";
import { formatDate, formatLongDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { available, committed, earliestPayDate, isBlocked } from "@/lib/rules";
import { useStore } from "@/lib/store";
import type { Currency, Invoice } from "@/lib/types";

type Done = { count: number; total: number; currency: Currency; accountName: string; settlementDays: number; refused: string[]; later: number; left: number };

export function ConfirmPage() {
  const { state, actions, issues, today } = useStore();
  const router = useRouter();
  const [accountId, setAccountId] = useState("mmf");
  const [mode, setMode] = useState<"due" | "asap">("due");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

  if (!state.hydrated) return <div className="grid min-h-screen place-items-center text-muted">Loading…</div>;

  const back = () => {
    actions.setTab("invoices");
    router.push("/payments");
  };

  if (done) return <Initiated done={done} onReturn={back} onMore={() => setDone(null)} />;

  const account = state.accounts.find((a) => a.id === accountId) ?? state.accounts[0];
  const earliest = earliestPayDate(account, today);
  const free = available(account, state.docs);
  const promised = committed(account.id, state.docs);

  // Everything in the batch is shown. What cannot be paid from this account is listed
  // with the reason, never dropped without a word.
  const batch = state.batch.map((id) => state.docs.find((d) => d.id === id)).filter((d): d is Invoice => d?.type === "invoice");
  const reasonNot = (inv: Invoice): string | null => {
    if (inv.status !== "ready_to_pay") return "No longer Ready to Pay";
    const found = issues(inv);
    if (isBlocked(found)) return found.find((i) => i.blocking)?.label ?? "Has an open issue";
    if (inv.currency !== account.currency) return `In ${inv.currency}: choose a ${inv.currency} account`;
    return null;
  };
  const invoices = batch.filter((inv) => reasonNot(inv) === null);
  const leftOut = batch.filter((inv) => reasonNot(inv) !== null);

  // "On the due date" where possible; never earlier than the money can leave the account.
  const payOn = (inv: Invoice) => {
    const chosen = dates[inv.id];
    if (chosen && chosen >= earliest) return chosen;
    if (mode === "asap") return earliest;
    return inv.dueOn > earliest ? inv.dueOn : earliest;
  };

  const due = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const shortBy = due - free;

  const flags = (inv: Invoice) => {
    const contact = state.contacts.find((c) => c.id === inv.contactId);
    const list: string[] = [];
    if (contact?.paidBefore === 0) list.push("First payment to this supplier");
    if (inv.overrides?.includes("bank_changed")) list.push("Bank details differ from the document; confirmed");
    if (inv.overrides?.includes("contact_mismatch")) list.push(`Paying ${contact?.name ?? "a contact"} though the invoice is from ${inv.supplier}`);
    if (inv.dueOn < today) list.push(`Overdue since ${formatDate(inv.dueOn)}`);
    else if (payOn(inv) > inv.dueOn) {
      // Point to an account that could still make the date, if there is one.
      const faster = state.accounts.find((a) => a.id !== account.id && a.currency === inv.currency && earliestPayDate(a, today) <= inv.dueOn && available(a, state.docs) >= inv.total);
      list.push(`Arrives after the due date (${formatDate(inv.dueOn)})${faster ? `. ${faster.name} could pay it on time` : ""}`);
    }
    return list;
  };
  const flagged = invoices.map((inv) => ({ inv, list: flags(inv) })).filter((f) => f.list.length > 0);

  const groups = new Map<string, Invoice[]>();
  for (const inv of [...invoices].sort((a, b) => payOn(a).localeCompare(payOn(b)))) {
    const key = payOn(inv);
    groups.set(key, [...(groups.get(key) ?? []), inv]);
  }

  const remove = (id: string) => actions.setBatch(state.batch.filter((x) => x !== id));

  const schedule = async () => {
    // The button is disabled while a request is in flight, and the store refuses any
    // invoice that is no longer Ready to Pay, so a second click or a second tab cannot
    // pay the same invoice twice.
    if (submitting || shortBy > 0 || invoices.length === 0) return;
    setSubmitting(true);
    const chosen = Object.fromEntries(invoices.map((i) => [i.id, payOn(i)]));
    const outcome = await actions.schedule(invoices.map((i) => i.id), account.id, chosen);
    const paidNow = outcome.scheduled.filter((id) => chosen[id] <= earliest).length;
    setSubmitting(false);
    setDone({
      count: outcome.scheduled.length,
      total: invoices.filter((i) => outcome.scheduled.includes(i.id)).reduce((sum, i) => sum + i.total, 0),
      currency: account.currency,
      accountName: account.name,
      settlementDays: account.settlementDays,
      refused: outcome.refused.map((r) => r.reason),
      later: outcome.scheduled.length - paidNow,
      left: leftOut.length,
    });
  };

  return (
    <div className="mx-auto min-h-screen max-w-[1180px] px-8 py-6">
      <div className="flex items-center gap-3">
        <button type="button" onClick={back} aria-label="Back to Payments" className="grid size-9 place-items-center rounded-full border border-line hover:border-ink">
          <ArrowLeft size={16} />
        </button>
        <span className="text-[12px] text-muted">Payments</span>
      </div>

      <div className="mt-5 flex items-center justify-between border-b border-hairline pb-5">
        <h1 className="text-[22px] font-light">Confirm your payments</h1>
        <div className="flex items-center gap-2 text-[12.5px] text-muted">
          Pay
          <Select
            label="When to pay"
            align="right"
            value={mode}
            options={[
              { value: "due", label: "on each due date" },
              { value: "asap", label: "as soon as possible" },
            ]}
            onChange={(next) => {
              setMode(next);
              setDates({});
            }}
          />
        </div>
      </div>

      {batch.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-[15px]">No invoices to pay.</p>
          <p className="mt-1 text-muted">Select invoices that are Ready to Pay on the Payments page.</p>
          <Button variant="secondary" className="mt-5" onClick={back}>
            Back to Payments
          </Button>
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-2 gap-14">
          <section aria-label="Pay from">
            <h2 className="mb-2 text-[12px] text-muted">Where to make the payment from</h2>
            <div role="radiogroup" aria-label="Account" className="flex flex-col gap-2">
              {state.accounts.map((a) => {
                const held = committed(a.id, state.docs);
                return (
                  <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-[6px] border px-4 py-3.5 ${a.id === account.id ? "border-ink" : "border-line hover:border-faint"}`}>
                    <input type="radio" name="account" className="sr-only" checked={a.id === account.id} onChange={() => setAccountId(a.id)} />
                    <span aria-hidden className={`grid size-4 place-items-center rounded-full border ${a.id === account.id ? "border-ink" : "border-faint"}`}>
                      {a.id === account.id && <span className="size-2 rounded-full bg-ink" />}
                    </span>
                    <span className="flex-1">
                      <span className="block text-[14px]">{a.name}</span>
                      <span className="block text-[11.5px] text-muted">
                        {a.settlementDays === 0 ? "Pays the same day" : `Transfers take ${a.settlementDays === 2 ? "1-2" : a.settlementDays} business days to settle`}
                        {held > 0 && ` · ${formatMoney(held, a.currency)} already scheduled`}
                      </span>
                    </span>
                    <Money amount={a.balance} currency={a.currency} />
                  </label>
                );
              })}
            </div>

            {shortBy > 0 && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-[4px] bg-danger-soft px-3 py-2.5 text-[12.5px]">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-danger" />
                <span>
                  This account has {formatMoney(free, account.currency)} free{promised > 0 ? ` after ${formatMoney(promised, account.currency)} already scheduled` : ""}. That is {formatMoney(shortBy, account.currency)} short of the{" "}
                  {formatMoney(due, account.currency)} due. Choose another account, remove a payment, or top up first.
                </span>
              </p>
            )}

            <Button size="lg" className="mt-4 w-full" disabled={submitting || shortBy > 0 || invoices.length === 0} onClick={schedule}>
              {submitting ? "Scheduling…" : invoices.length === 0 ? "Nothing to pay from this account" : `Schedule ${invoices.length} ${invoices.length === 1 ? "Payment" : "Payments"}`}
            </Button>

            <p className="mt-4 flex items-start gap-2.5 rounded-[6px] bg-surface p-4 text-[12px] text-ink-2">
              <Clock size={14} className="mt-0.5 shrink-0" />
              Each payment leaves on the date shown. The earliest this account can pay is {formatLongDate(earliest)}. An invoice is paid from an account in its own currency.
            </p>
          </section>

          <section aria-label="Payments">
            <div className="text-[12px] text-muted">Total from this account</div>
            <div className="mt-1">
              <Money amount={due} currency={account.currency} size="hero" />
            </div>

            {invoices.length > 0 && (
              <div className={`mt-5 rounded-[6px] border p-3.5 text-[12.5px] ${flagged.length ? "border-warn/40 bg-warn-soft" : "border-hairline bg-surface"}`}>
                {flagged.length === 0 ? (
                  <p className="flex items-center gap-2">
                    <Check size={14} className="text-ok" /> Nothing unusual in this batch: known suppliers, unchanged bank details, on time.
                  </p>
                ) : (
                  <>
                    <p className="mb-1.5 flex items-center gap-2 font-medium">
                      <TriangleAlert size={14} className="text-warn" /> Check before paying
                    </p>
                    <ul className="flex flex-col gap-1">
                      {flagged.map(({ inv, list }) => (
                        <li key={inv.id}>
                          <span className="font-medium">{inv.supplier}:</span> {list.join(". ")}.
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {[...groups].map(([date, list]) => (
              <div key={date} className="mt-6">
                <h3 className="mb-1 text-[12px] font-medium">{formatLongDate(date)}</h3>
                <ul>
                  {list.map((inv) => (
                    <li key={inv.id} className="border-b border-hairline py-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px]">{inv.supplier}</div>
                          <div className="text-[11px] text-muted">{inv.number}</div>
                        </div>
                        <Money amount={inv.total} currency={inv.currency} />
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-[11.5px]">
                        <Link href={`/payments/${inv.id}`} className="underline underline-offset-2">
                          Review
                        </Link>
                        <div className="flex items-center gap-1.5 text-muted">
                          Pay on
                          <DateInput
                            size="sm"
                            label={`Pay ${inv.supplier} on`}
                            min={earliest}
                            value={payOn(inv)}
                            onChange={(value) => {
                              if (!value) return;
                              // A date this account cannot make is replaced by the earliest it can, and says so.
                              const tooEarly = value < earliest;
                              setDates({ ...dates, [inv.id]: tooEarly ? earliest : value });
                              if (tooEarly) actions.toast(`${account.name} cannot pay before ${formatDate(earliest)}. Set to that date.`, "danger");
                              else actions.toast("Payment date updated");
                            }}
                          />
                        </div>
                        <button type="button" onClick={() => remove(inv.id)} className="ml-auto text-muted underline underline-offset-2 hover:text-ink">
                          Remove from batch
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {leftOut.length > 0 && (
              <div className="mt-7">
                <h3 className="mb-1 flex items-center gap-2 text-[12px] font-medium">
                  <Info size={13} /> Not included from this account
                </h3>
                <ul>
                  {leftOut.map((inv) => (
                    <li key={inv.id} className="flex items-center gap-3 border-b border-hairline py-2.5 text-[12.5px]">
                      <div className="min-w-0 flex-1">
                        <span>{inv.supplier}</span>
                        <span className="text-muted"> · {reasonNot(inv)}</span>
                      </div>
                      <Money amount={inv.total} currency={inv.currency} />
                      <button type="button" onClick={() => remove(inv.id)} className="text-[11.5px] text-muted underline underline-offset-2 hover:text-ink">
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Initiated({ done, onReturn, onMore }: { done: Done; onReturn: () => void; onMore: () => void }) {
  const steps = [
    done.later > 0
      ? `${done.later === done.count ? "Each payment" : `${done.later} of them`} waits as Scheduled until its date. The money stays in your ${done.accountName} until then, and you can cancel.`
      : `The money leaves your ${done.accountName} now${done.settlementDays > 0 ? `, which takes up to ${done.settlementDays} working days` : ""}.`,
    "On its date an invoice shows Processing, then Paid, and is synced to your accounting system.",
    "If a payment is rejected, the invoice shows Payment failed, the money returns to the account, and you can retry.",
  ];
  return (
    <div className="grid min-h-screen place-items-center px-8">
      <div className="w-full max-w-[480px] text-center">
        <div className="mx-auto grid size-12 place-items-center bg-ink text-white">
          <Check size={22} />
        </div>
        <h1 className="mt-5 text-[26px] font-light">
          {done.count} {done.count === 1 ? "Payment" : "Payments"} Scheduled
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Payments of <Money amount={done.total} currency={done.currency} /> from {done.accountName}.
        </p>

        {done.refused.length > 0 && (
          <div role="alert" className="mt-4 rounded-[6px] bg-danger-soft p-3 text-left text-[12.5px]">
            <p className="font-medium">{done.refused.length === 1 ? "1 payment was not scheduled" : `${done.refused.length} payments were not scheduled`}</p>
            <ul className="mt-1">
              {done.refused.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex justify-center gap-2">
          <Button variant="secondary" onClick={onReturn}>
            Return to Payments
          </Button>
          {done.left > 0 && (
            <Button onClick={onMore}>
              Pay the remaining {done.left}
            </Button>
          )}
        </div>

        <h2 className="mt-10 text-[15px]">What happens next?</h2>
        <ol className="mt-4 flex flex-col gap-3 text-left text-[12.5px]">
          {steps.map((s, i) => (
            <li key={s} className="flex items-start gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[10px] text-white">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
