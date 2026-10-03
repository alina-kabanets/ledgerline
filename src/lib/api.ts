import type { Doc, Invoice } from "./types";

// Stand-in for the backend. Every call is a promise with a delay, and some fail on
// purpose so the UI's failure paths can be seen. Swapping this file for real requests
// is the only change the rest of the app would need.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Result = { ok: true } | { ok: false; reason: string };

// Hands the payment to the payment rail. "ok" means accepted, not settled.
export async function schedulePayment(invoice: Invoice): Promise<Result> {
  await sleep(700);
  void invoice;
  return { ok: true };
}

// The rail's later answer: settled or rejected.
export async function settlePayment(invoice: Invoice): Promise<Result> {
  await sleep(4000);
  if (invoice.mock?.failPaymentOnce) return { ok: false, reason: "The recipient bank rejected the payment" };
  return { ok: true };
}

export async function syncToErp(doc: Doc, erpName: string): Promise<Result> {
  await sleep(2500);
  if (doc.mock?.failSyncOnce) return { ok: false, reason: `${erpName} did not accept the document` };
  return { ok: true };
}
