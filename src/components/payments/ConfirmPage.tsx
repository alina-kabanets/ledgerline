"use client";

import { ArrowLeft, Check, Clock, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Money } from "@/components/ui/Money";
import { formatDate, formatLongDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { batchTotal, earliestPayDate, isBlocked } from "@/lib/rules";
import { useStore } from "@/lib/store";
import type { Currency, Invoice } from "@/lib/types";

type Done = { count: number; totals: [Currency, number][]; accountName: string; settlementDays: number };

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

  if (done) return <Initiated done={done} onReturn={back} />;

  // Only invoices that are still ready and unblocked can be paid, whatever was selected.
  const invoices = state.batch
    .map((id) => state.docs.find((d) => d.id === id))
    .filter((d): d is Invoice => d?.type === "invoice" && d.status === "ready_to_pay" && !isBlocked(issues(d)));

  const account = state.accounts.find((a) => a.id === accountId) ?? state.accounts[0];
  const earliest = earliestPayDate(account, today);

  // "On the due date" where possible; never earlier than the money can leave the account.
  const payOn = (inv: Invoice) => {
    const chosen = dates[inv.id];
    if (chosen && chosen >= earliest) return chosen;
    if (mode === "asap") return earliest;
    return inv.dueOn > earliest ? inv.dueOn : earliest;
  };

  const due = batchTotal(invoices, account.currency);
  const shortBy = due - account.balance;
  const otherCurrencies = [...new Set(invoices.filter((i) => i.currency !== account.currency).map((i) => i.currency))];

  const totals = new Map<Currency, number>();
  for (const inv of invoices) totals.set(inv.currency, (totals.get(inv.currency) ?? 0) + inv.total);

  const flags = (inv: Invoice) => {
    const contact = state.contacts.find((c) => c.id === inv.contactId);
    const list: string[] = [];
    if (contact?.paidBefore === 0) list.push("First payment to this supplier");
    if (inv.bankChangeConfirmed) list.push("Bank details changed and confirmed");
    if (inv.dueOn < today) list.push(`Overdue since ${formatDate(inv.dueOn)}`);
    else if (payOn(inv) > inv.dueOn) {
      // Point to an account that could still make the date, if there is one.
      const faster = state.accounts.find((a) => a.id !== account.id && earliestPayDate(a, today) <= inv.dueOn && a.balance >= inv.total);
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
    // Guard against a second click while the first request is in flight.
    if (submitting || shortBy > 0 || invoices.length === 0) return;
    setSubmitting(true);
    const summary: Done = { count: invoices.length, totals: [...totals], accountName: account.name, settlementDays: account.settlementDays };
    await actions.pay(
      invoices.map((i) => i.id),
      account.id,
      Object.fromEntries(invoices.map((i) => [i.id, payOn(i)])),
    );
    setDone(summary);
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
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          Pay
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as "due" | "asap");
              setDates({});
            }}
            className="h-8 rounded-[4px] border border-line bg-white px-2 text-[12.5px] text-ink"
          >
            <option value="due">on each due date</option>
            <option value="asap">as soon as possible</option>
          </select>
        </label>
      </div>

      {invoices.length === 0 ? (
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
              {state.accounts.map((a) => (
                <label key={a.id} className={`flex cursor-pointer items-center gap-3 rounded-[6px] border px-4 py-3.5 ${a.id === account.id ? "border-ink" : "border-line hover:border-faint"}`}>
                  <input type="radio" name="account" className="sr-only" checked={a.id === account.id} onChange={() => setAccountId(a.id)} />
                  <span aria-hidden className={`grid size-4 place-items-center rounded-full border ${a.id === account.id ? "border-ink" : "border-faint"}`}>
                    {a.id === account.id && <span className="size-2 rounded-full bg-ink" />}
                  </span>
                  <span className="flex-1">
                    <span className="block text-[14px]">{a.name}</span>
                    <span className="block text-[11.5px] text-muted">
                      {a.settlementDays === 0 ? "Pays the same day" : `Transfers take ${a.settlementDays === 2 ? "1-2" : a.settlementDays} business days to settle`}
                    </span>
                  </span>
                  <Money amount={a.balance} currency={a.currency} />
                </label>
              ))}
            </div>

            {shortBy > 0 && (
              <p role="alert" className="mt-3 flex items-start gap-2 rounded-[4px] bg-danger-soft px-3 py-2.5 text-[12.5px]">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-danger" />
                <span>
                  This account is {formatMoney(shortBy, account.currency)} short of the {formatMoney(due, account.currency)} due. Choose another account, remove a payment, or top up first.
                </span>
              </p>
            )}

            <Button size="lg" className="mt-4 w-full" disabled={submitting || shortBy > 0} onClick={schedule}>
              {submitting ? "Scheduling…" : `Schedule ${invoices.length} ${invoices.length === 1 ? "Payment" : "Payments"}`}
            </Button>

            <ul className="mt-4 flex flex-col gap-2.5 rounded-[6px] bg-surface p-4 text-[12px] text-ink-2">
              <li className="flex items-start gap-2.5">
                <Clock size={14} className="mt-0.5 shrink-0" />
                Payments are initiated on the date shown, withdrawal times allowing. The earliest this account can pay is {formatLongDate(earliest)}.
              </li>
              {otherCurrencies.length > 0 && (
                <li className="flex items-start gap-2.5">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0" />
                  {otherCurrencies.join(" and ")} payments are converted from {account.currency} on the day and may take up to 5 working days. The balance check above covers {account.currency} invoices only.
                </li>
              )}
            </ul>
          </section>

          <section aria-label="Payments">
            <div className="text-[12px] text-muted">Total</div>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-6">
              {[...totals].map(([currency, amount], i) => (
                <Money key={currency} amount={amount} currency={currency} size={i === 0 ? "hero" : "sub"} />
              ))}
            </div>

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
                        <label className="flex items-center gap-1.5 text-muted">
                          Pay on
                          <input
                            type="date"
                            min={earliest}
                            value={payOn(inv)}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              setDates({ ...dates, [inv.id]: e.target.value });
                              actions.toast("Payment date updated");
                            }}
                            className="h-7 rounded-[4px] border border-line px-1.5 text-[11.5px] text-ink"
                          />
                        </label>
                        <button type="button" onClick={() => remove(inv.id)} className="ml-auto text-muted underline underline-offset-2 hover:text-ink">
                          Remove from batch
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function Initiated({ done, onReturn }: { done: Done; onReturn: () => void }) {
  const steps = [
    done.settlementDays > 0
      ? `Money is moved out of your ${done.accountName}. This takes up to ${done.settlementDays} working days.`
      : `Money leaves your ${done.accountName} today.`,
    "As soon as funds clear, each payment is sent on its date.",
    "Each invoice shows Processing, then Paid, and is synced to your accounting system.",
    "If a payment is rejected, the invoice shows Payment failed with a Retry.",
  ];
  return (
    <div className="grid min-h-screen place-items-center px-8">
      <div className="w-full max-w-[460px] text-center">
        <div className="mx-auto grid size-12 place-items-center bg-ink text-white">
          <Check size={22} />
        </div>
        <h1 className="mt-5 text-[26px] font-light">
          {done.count} {done.count === 1 ? "Payment" : "Payments"} Initiated
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          You&apos;ve initiated payments of{" "}
          {done.totals.map(([currency, amount], i) => (
            <span key={currency}>
              {i > 0 && " and "}
              <Money amount={amount} currency={currency} />
            </span>
          ))}
          .
        </p>
        <Button variant="secondary" className="mt-5" onClick={onReturn}>
          Return to Payments
        </Button>

        <h2 className="mt-10 text-[15px]">What happens next?</h2>
        <ol className="mt-4 flex flex-col gap-3 text-left text-[12.5px]">
          {steps.map((s, i) => (
            <li key={s} className="flex items-start gap-3">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink text-[10px] text-white">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <p className="mt-6 flex items-start gap-2 text-left text-[11.5px] text-muted">
          <Info size={13} className="mt-0.5 shrink-0" /> Internal checks may delay a payment.
        </p>
      </div>
    </div>
  );
}
