// Stand-in for the backend. Every call is a promise with a delay, and some fail on
// purpose so the UI's failure paths can be seen. These four calls are the ones a real
// build would send to a server; the rest of the mock (seed data, saved state) lives in
// seed.ts and store.tsx.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type Result = { ok: true } | { ok: false; reason: string; retryable: boolean };

// Scripted failures. Each fails once per page load, so a retry succeeds.
const failPaymentOnce = new Set(["inv-atelier"]);
const failSyncOnce = new Set(["inv-talentbridge"]);
const unreadable = /^scan-/i;

// Reads a file and returns whether anything could be extracted. The extracted fields
// themselves are scripted in samples.ts.
export async function readFile(fileName: string, delay = 1500): Promise<Result> {
  await sleep(delay);
  // A blurred photo does not get clearer on a second attempt, so this is not retryable.
  if (unreadable.test(fileName)) return { ok: false, reason: "Could not read this file. The photo is too blurred.", retryable: false };
  return { ok: true };
}

// Hands a payment to the payment rail. "ok" means accepted, not settled.
export async function schedulePayment(invoiceId: string): Promise<Result> {
  await sleep(700);
  void invoiceId;
  return { ok: true };
}

// The rail's later answer: settled or rejected.
export async function settlePayment(invoiceId: string): Promise<Result> {
  await sleep(4000);
  if (failPaymentOnce.delete(invoiceId)) return { ok: false, reason: "The recipient bank rejected the payment", retryable: true };
  return { ok: true };
}

export async function syncToErp(docId: string, erpName: string): Promise<Result> {
  await sleep(2500);
  if (failSyncOnce.delete(docId)) return { ok: false, reason: `${erpName} did not accept the document`, retryable: true };
  return { ok: true };
}
