"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import * as api from "./api";
import { nowStamp, today as todayIso } from "./dates";
import { getErp, type ErpAdapter } from "./erp";
import { earliestPayDate, findCounterpart, findDuplicate, issuesFor, type RuleContext } from "./rules";
import { seed } from "./seed";
import { track } from "./track";
import { transition, type Action as Move } from "./transitions";
import type { Account, BankDetails, Contact, Doc, Issue, Override } from "./types";

// App state. Screens call the actions below; every change of a document's state goes
// through transition() in transitions.ts, which is the only place that decides whether
// a move is allowed. State is saved to localStorage and shared between browser tabs.

const STORAGE_KEY = "ledgerline-v3";
const VERSION = 3;

export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; message: string; tone: "ok" | "danger"; action?: ToastAction };
export type Tab = "invoices" | "receipts";
// One row per file added on the upload screen: it became a document, or was turned away.
export type UploadItem = { key: string; fileName: string; docId?: string; rejected?: string };

type Saved = { docs: Doc[]; contacts: Contact[]; accounts: Account[]; erpId: string; batch: string[] };

type State = Saved & {
  hydrated: boolean;
  toasts: Toast[];
  // Which tab the payments page is on. Kept here so it survives a visit to another screen.
  tab: Tab;
  // The current upload batch. Kept here so opening a file for review and coming back
  // does not lose the list. Cleared when the user finishes with the upload screen.
  uploads: UploadItem[];
};

type Action =
  | { type: "load"; saved: Saved }
  | { type: "set"; doc: Doc }
  | { type: "add"; docs: Doc[] }
  | { type: "remove"; id: string }
  | { type: "contact"; id: string; fn: (c: Contact) => Contact }
  | { type: "addContact"; contact: Contact }
  | { type: "balance"; accountId: string; delta: number }
  | { type: "erp"; id: string }
  | { type: "batch"; ids: string[] }
  | { type: "tab"; tab: Tab }
  | { type: "uploads"; items: UploadItem[] }
  | { type: "toast"; toast: Toast }
  | { type: "untoast"; id: number };

const initial: State = { hydrated: false, docs: [], contacts: [], accounts: [], erpId: "xero", batch: [], toasts: [], tab: "invoices", uploads: [] };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return { ...state, ...action.saved, hydrated: true };
    case "set":
      return { ...state, docs: state.docs.map((d) => (d.id === action.doc.id ? action.doc : d)) };
    case "add":
      return { ...state, docs: [...action.docs, ...state.docs] };
    case "remove":
      return { ...state, docs: state.docs.filter((d) => d.id !== action.id), batch: state.batch.filter((id) => id !== action.id) };
    case "contact":
      return { ...state, contacts: state.contacts.map((c) => (c.id === action.id ? action.fn(c) : c)) };
    case "addContact":
      return { ...state, contacts: [...state.contacts, action.contact] };
    case "balance":
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.accountId ? { ...a, balance: a.balance + action.delta } : a)) };
    case "erp":
      return { ...state, erpId: action.id };
    case "batch":
      return { ...state, batch: action.ids };
    case "tab":
      return { ...state, tab: action.tab };
    case "uploads":
      return { ...state, uploads: action.items };
    case "toast":
      return { ...state, toasts: [...state.toasts, action.toast] };
    case "untoast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

// Saved state is only trusted if it has the shape this version writes.
function parseSaved(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data?.version !== VERSION || !Array.isArray(data.docs) || !Array.isArray(data.contacts) || !Array.isArray(data.accounts)) return null;
    return { docs: data.docs, contacts: data.contacts, accounts: data.accounts, erpId: String(data.erpId ?? "xero"), batch: Array.isArray(data.batch) ? data.batch : [] };
  } catch {
    return null;
  }
}

export type ScheduleOutcome = { scheduled: string[]; refused: { id: string; reason: string }[] };

type Store = {
  state: State;
  erp: ErpAdapter;
  today: string;
  rules: RuleContext;
  issues: (doc: Doc) => Issue[];
  doc: (id: string) => Doc | undefined;
  actions: {
    reset: () => void;
    edit: (id: string, fn: (doc: Doc) => Doc) => boolean;
    ingest: (docs: Doc[]) => void;
    remove: (id: string) => void;
    restore: (doc: Doc) => void;
    retryExtraction: (id: string) => void;
    enterManually: (id: string) => void;
    changeType: (id: string) => boolean;
    override: (id: string, code: Override) => void;
    setContact: (id: string, contactId: string | null) => void;
    createContact: (docId: string) => void;
    setContactBank: (contactId: string, bank: BankDetails) => void;
    useNewBankDetails: (id: string) => void;
    keepSavedBank: (id: string) => void;
    attachToInvoice: (receiptId: string) => void;
    markReady: (id: string) => boolean;
    markPaidOutside: (id: string) => boolean;
    setBatch: (ids: string[]) => void;
    schedule: (ids: string[], accountId: string, dates: Record<string, string>) => Promise<ScheduleOutcome>;
    cancelPayment: (id: string) => void;
    retryPayment: (id: string) => void;
    runScheduled: () => void;
    submit: (ids: string[]) => void;
    retrySync: (id: string) => void;
    setErp: (id: string) => void;
    setTab: (tab: Tab) => void;
    setUploads: (fn: (items: UploadItem[]) => UploadItem[]) => void;
    toast: (message: string, tone?: Toast["tone"], action?: ToastAction) => void;
    dismissToast: (id: number) => void;
  };
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const toastId = useRef(0);

  // The same reducer is applied to a ref as each action is sent, so code that runs
  // between renders (timers, awaited calls, two quick clicks) always reads the latest
  // state and never acts on a stale copy.
  const current = useRef(initial);
  const apply = useCallback((action: Action) => {
    current.current = reducer(current.current, action);
    dispatch(action);
  }, []);

  const { actions, resume } = useMemo<{ actions: Store["actions"]; resume: () => void }>(() => {
    const find = (id: string) => current.current.docs.find((d) => d.id === id);
    const context = (): RuleContext => {
      const s = current.current;
      return { docs: s.docs, contacts: s.contacts, erp: getErp(s.erpId), today: todayIso() };
    };

    const toast = (message: string, tone: Toast["tone"] = "ok", action?: ToastAction) => {
      const id = ++toastId.current;
      apply({ type: "toast", toast: { id, message, tone, action } });
      setTimeout(() => apply({ type: "untoast", id }), 6000);
    };

    // The one way a document changes state. A refused move is reported, never applied.
    const move = (id: string, action: Move, quiet = false): boolean => {
      const doc = find(id);
      if (!doc) return false;
      const result = transition(doc, action, context());
      if (!result.ok) {
        if (!quiet) toast(result.reason, "danger");
        return false;
      }
      apply({ type: "set", doc: { ...result.doc, updatedAt: nowStamp() } });
      return true;
    };

    // For fields that are not part of the state machine: sync, file reading, attachments.
    const patch = (id: string, fn: (doc: Doc) => Doc) => {
      const doc = find(id);
      if (doc) apply({ type: "set", doc: { ...fn(doc), updatedAt: nowStamp() } });
    };

    const sync = async (id: string) => {
      const doc = find(id);
      if (!doc || doc.sync === "syncing") return;
      const erpName = getErp(current.current.erpId).name;
      patch(id, (d) => ({ ...d, sync: "syncing" }));
      const result = await api.syncToErp(id, erpName);
      if (result.ok) {
        patch(id, (d) => ({ ...d, sync: "synced" }));
      } else {
        patch(id, (d) => ({ ...d, sync: "failed" }));
        track("sync_failed", { id, reason: result.reason });
        toast(`${result.reason}. You can retry from the list.`, "danger");
      }
    };

    const read = async (id: string, delay?: number) => {
      const doc = find(id);
      if (!doc) return;
      const result = await api.readFile(doc.fileName, delay);
      if (!find(id)) return;
      if (!result.ok) {
        patch(id, (d) => ({ ...d, extraction: "failed", extractionError: result.reason, extractionRetryable: result.retryable }));
        track("extraction_failed", { id, fileName: doc.fileName });
        return;
      }
      patch(id, (d) => ({ ...d, extraction: "done", extractionError: undefined }));
      const done = find(id);
      if (!done) return;
      track("document_uploaded", { id, type: done.type, channel: done.source.channel });
      if (findDuplicate(done, current.current.docs) || findCounterpart(done, current.current.docs)) track("duplicate_flagged", { id });
    };

    // Waits for the payment rail's answer. Money has already left the account by now,
    // so a rejection puts it back.
    const awaitSettlement = async (id: string) => {
      const invoice = find(id);
      if (!invoice || invoice.type !== "invoice" || invoice.status !== "processing" || !invoice.payment) return;
      const { accountId } = invoice.payment;
      const result = await api.settlePayment(id);
      if (!move(id, { type: "settle", ok: result.ok, reason: result.ok ? undefined : result.reason }, true)) return;
      if (result.ok) {
        if (invoice.contactId) apply({ type: "contact", id: invoice.contactId, fn: (c) => ({ ...c, paidBefore: c.paidBefore + 1 }) });
        track("invoice_paid", { id, amount: invoice.total, currency: invoice.currency });
        void sync(id);
      } else {
        apply({ type: "balance", accountId, delta: invoice.total });
        track("payment_failed", { id, reason: result.reason });
        toast(`${invoice.supplier}: ${result.reason}. The money is back in the account.`, "danger");
      }
    };

    // Takes the money and hands the payment to the rail. The balance is checked again
    // here, because it may have changed since the payment was scheduled.
    const process = (id: string) => {
      const invoice = find(id);
      if (!invoice || invoice.type !== "invoice" || invoice.status !== "scheduled" || !invoice.payment) return;
      const account = current.current.accounts.find((a) => a.id === invoice.payment?.accountId);
      if (!move(id, { type: "start_processing" }, true)) return;
      if (!account || account.balance < invoice.total) {
        move(id, { type: "settle", ok: false, reason: `Not enough in ${account?.name ?? "the account"} on the day` }, true);
        toast(`${invoice.supplier}: not enough in ${account?.name ?? "the account"}.`, "danger");
        return;
      }
      apply({ type: "balance", accountId: account.id, delta: -invoice.total });
      void awaitSettlement(id);
    };

    // In this mock, a payment whose date is the earliest its account allows is treated
    // as due now. Later dates stay Scheduled until "Run scheduled payments" is pressed.
    const runDue = (all = false) => {
      const s = current.current;
      const today = todayIso();
      for (const doc of s.docs) {
        if (doc.type !== "invoice" || doc.status !== "scheduled" || !doc.payment) continue;
        const account = s.accounts.find((a) => a.id === doc.payment?.accountId);
        if (all || !account || doc.payment.payOn <= earliestPayDate(account, today)) process(doc.id);
      }
    };

    const load = (saved: Saved) => apply({ type: "load", saved });

    // A refresh loses the timers that were waiting for answers. Nothing is assumed to
    // have succeeded: each waiting document is asked about again.
    const resume = () => {
      for (const doc of current.current.docs) {
        if (doc.extraction === "in_progress") void read(doc.id);
        if (doc.sync === "syncing") {
          patch(doc.id, (d) => ({ ...d, sync: "not_synced" }));
          void sync(doc.id);
        }
        if (doc.type === "invoice" && doc.status === "processing") void awaitSettlement(doc.id);
      }
      runDue();
    };

    const actions: Store["actions"] = {
      reset: () => {
        load({ ...seed(todayIso()), erpId: "xero", batch: [] });
        toast("Demo data reset");
      },
      edit: (id, fn) => move(id, { type: "edit", fn }),
      ingest: (docs) => {
        apply({ type: "add", docs });
        docs.forEach((d, i) => void read(d.id, 1400 + i * 650));
      },
      remove: (id) => apply({ type: "remove", id }),
      restore: (doc) => apply({ type: "add", docs: [doc] }),
      retryExtraction: (id) => {
        patch(id, (d) => ({ ...d, extraction: "in_progress", extractionError: undefined }));
        void read(id);
      },
      enterManually: (id) => patch(id, (d) => ({ ...d, extraction: "done", extractionError: undefined, typeReason: "Entered by hand" })),
      changeType: (id) => {
        const before = find(id);
        const ok = move(id, { type: "change_type" });
        if (ok && before) track("document_type_changed", { id, from: before.type });
        return ok;
      },
      override: (id, code) => {
        move(id, { type: "edit", fn: (d) => ({ ...d, overrides: [...(d.overrides ?? []).filter((o) => o !== code), code] }) });
        track(code === "bank_changed" ? "bank_change_confirmed" : "field_corrected", { id, override: code });
      },
      setContact: (id, contactId) =>
        // A warning that was overridden for one contact says nothing about another.
        void move(id, {
          type: "edit",
          fn: (d) => (d.type === "invoice" ? { ...d, contactId, overrides: d.overrides?.filter((o) => o !== "bank_changed" && o !== "contact_mismatch") } : d),
        }),
      createContact: (docId) => {
        const doc = find(docId);
        if (!doc || doc.type !== "invoice" || !doc.supplier) return;
        // Payment details are never taken from the document: a new contact starts
        // without them, and a person has to enter them.
        const contact: Contact = { id: `c-${Date.now().toString(36)}`, name: doc.supplier, bank: null, paidBefore: 0 };
        apply({ type: "addContact", contact });
        move(docId, { type: "edit", fn: (d) => (d.type === "invoice" ? { ...d, contactId: contact.id } : d) });
      },
      setContactBank: (contactId, bank) => apply({ type: "contact", id: contactId, fn: (c) => ({ ...c, bank }) }),
      useNewBankDetails: (id) => {
        const doc = find(id);
        if (!doc || doc.type !== "invoice" || !doc.documentBank || !doc.contactId) return;
        const bank = doc.documentBank;
        apply({ type: "contact", id: doc.contactId, fn: (c) => ({ ...c, bank }) });
        // Touch the invoice so that, if it was Ready to Pay, it is checked again.
        move(id, { type: "edit", fn: (d) => d });
        track("bank_change_confirmed", { id });
      },
      keepSavedBank: (id) => {
        const doc = find(id);
        if (!doc || doc.type !== "invoice") return;
        const saved = current.current.contacts.find((c) => c.id === doc.contactId)?.bank ?? null;
        move(id, { type: "edit", fn: (d) => (d.type === "invoice" ? { ...d, documentBank: saved } : d) });
      },
      attachToInvoice: (receiptId) => {
        const receipt = find(receiptId);
        if (!receipt || receipt.type !== "receipt") return;
        const invoice = findCounterpart(receipt, current.current.docs);
        if (!invoice || invoice.type !== "invoice") return;
        const attachment = { fileName: receipt.fileName, by: receipt.source.by, at: nowStamp(), note: "Proof of payment" };
        patch(invoice.id, (d) => (d.type === "invoice" ? { ...d, attachments: [...(d.attachments ?? []), attachment] } : d));
        apply({ type: "remove", id: receiptId });
        toast(`Attached to ${invoice.number} as proof of payment`, "ok", {
          label: "Undo",
          run: () => {
            patch(invoice.id, (d) => (d.type === "invoice" ? { ...d, attachments: d.attachments?.filter((a) => a !== attachment && a.at !== attachment.at) } : d));
            apply({ type: "add", docs: [receipt] });
          },
        });
      },
      markReady: (id) => {
        const ok = move(id, { type: "mark_ready" });
        if (ok) track("invoice_ready", { id });
        return ok;
      },
      markPaidOutside: (id) => {
        const ok = move(id, { type: "mark_paid_outside", on: todayIso() });
        if (ok) void sync(id);
        return ok;
      },
      setBatch: (ids) => apply({ type: "batch", ids }),
      schedule: async (ids, accountId, dates) => {
        const outcome: ScheduleOutcome = { scheduled: [], refused: [] };
        const account = current.current.accounts.find((a) => a.id === accountId);
        if (!account) return outcome;
        // One at a time: each accepted payment reduces what is left for the next.
        for (const id of ids) {
          const doc = find(id);
          if (!doc) continue;
          const result = transition(doc, { type: "schedule", account, payOn: dates[id] ?? earliestPayDate(account, todayIso()) }, context());
          if (result.ok) {
            apply({ type: "set", doc: { ...result.doc, updatedAt: nowStamp() } });
            outcome.scheduled.push(id);
            track("payment_scheduled", { id, amount: doc.total, currency: doc.currency, accountId });
          } else {
            outcome.refused.push({ id, reason: result.reason });
          }
        }
        apply({ type: "batch", ids: current.current.batch.filter((id) => !outcome.scheduled.includes(id)) });
        await Promise.all(outcome.scheduled.map((id) => api.schedulePayment(id)));
        runDue();
        return outcome;
      },
      cancelPayment: (id) => {
        if (move(id, { type: "cancel_payment" })) toast("Payment cancelled. The invoice is Ready to Pay again.");
      },
      retryPayment: (id) => {
        if (move(id, { type: "retry_payment" })) process(id);
      },
      runScheduled: () => runDue(true),
      submit: (ids) => {
        const done = ids.filter((id) => move(id, { type: "submit" }));
        for (const id of done) {
          track("receipt_submitted", { id });
          void sync(id);
        }
        if (done.length) toast(done.length === 1 ? "Receipt submitted" : `${done.length} receipts submitted`);
      },
      retrySync: (id) => {
        if (find(id)?.sync !== "failed") return;
        track("sync_retried", { id });
        void sync(id);
      },
      setErp: (id) => apply({ type: "erp", id }),
      setTab: (tab) => apply({ type: "tab", tab }),
      setUploads: (fn) => apply({ type: "uploads", items: fn(current.current.uploads) }),
      toast,
      dismissToast: (id) => apply({ type: "untoast", id }),
    };

    return { actions, resume };
  }, [apply]);

  useEffect(() => {
    let saved: Saved | null = null;
    try {
      saved = parseSaved(localStorage.getItem(STORAGE_KEY));
    } catch {
      // Storage unavailable: fall through to fresh demo data.
    }
    apply({ type: "load", saved: saved ?? { ...seed(todayIso()), erpId: "xero", batch: [] } });
    resume();

    // Another tab changed something: take its state, so the two cannot disagree about
    // which invoices are still payable.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const other = parseSaved(e.newValue);
      if (other) apply({ type: "load", saved: other });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [apply, resume]);

  useEffect(() => {
    if (!state.hydrated) return;
    const { docs, contacts, accounts, erpId, batch } = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, docs, contacts, accounts, erpId, batch }));
    } catch {
      // Storage full or blocked. The app still works for this session.
    }
  }, [state]);

  const erp = getErp(state.erpId);
  const today = todayIso();
  const rules = useMemo<RuleContext>(() => ({ docs: state.docs, contacts: state.contacts, erp, today }), [state.docs, state.contacts, erp, today]);
  const issues = useCallback((doc: Doc) => issuesFor(doc, rules), [rules]);
  const doc = useCallback((id: string) => state.docs.find((d) => d.id === id), [state.docs]);

  const store = useMemo<Store>(() => ({ state, erp, today, rules, issues, doc, actions }), [state, erp, today, rules, issues, doc, actions]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
