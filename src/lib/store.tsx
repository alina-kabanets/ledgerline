"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import * as api from "./api";
import { switchType } from "./convert";
import { today as todayIso } from "./dates";
import { getErp, type ErpAdapter } from "./erp";
import { findDuplicate, issuesFor, type RuleContext } from "./rules";
import { UNREADABLE_REASON } from "./samples";
import { seed } from "./seed";
import { track } from "./track";
import type { Account, BankDetails, Contact, Doc, Invoice, Issue } from "./types";

// App state: one reducer, saved to localStorage so a refresh keeps the demo where it was.

const STORAGE_KEY = "ledgerline-v2";

export type ToastAction = { label: string; run: () => void };
export type Toast = { id: number; message: string; tone: "ok" | "danger"; action?: ToastAction };

export type Tab = "invoices" | "receipts";

type State = {
  hydrated: boolean;
  docs: Doc[];
  contacts: Contact[];
  accounts: Account[];
  erpId: string;
  // Invoices chosen for the next payment batch.
  batch: string[];
  toasts: Toast[];
  // Which tab the payments page is on. Kept here so it survives a visit to another screen.
  tab: Tab;
};

type Action =
  | { type: "load"; state: Pick<State, "docs" | "contacts" | "accounts" | "erpId" | "batch"> }
  | { type: "patch"; id: string; fn: (doc: Doc) => Doc }
  | { type: "add"; docs: Doc[] }
  | { type: "remove"; id: string }
  | { type: "contact"; id: string; fn: (c: Contact) => Contact }
  | { type: "addContact"; contact: Contact }
  | { type: "debit"; accountId: string; amount: number }
  | { type: "erp"; id: string }
  | { type: "batch"; ids: string[] }
  | { type: "tab"; tab: Tab }
  | { type: "toast"; toast: Toast }
  | { type: "untoast"; id: number };

const initial: State = { hydrated: false, docs: [], contacts: [], accounts: [], erpId: "xero", batch: [], toasts: [], tab: "invoices" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return { ...state, ...action.state, hydrated: true };
    case "patch":
      return { ...state, docs: state.docs.map((d) => (d.id === action.id ? action.fn(d) : d)) };
    case "add":
      return { ...state, docs: [...action.docs, ...state.docs] };
    case "remove":
      return { ...state, docs: state.docs.filter((d) => d.id !== action.id), batch: state.batch.filter((id) => id !== action.id) };
    case "contact":
      return { ...state, contacts: state.contacts.map((c) => (c.id === action.id ? action.fn(c) : c)) };
    case "addContact":
      return { ...state, contacts: [...state.contacts, action.contact] };
    case "debit":
      return { ...state, accounts: state.accounts.map((a) => (a.id === action.accountId ? { ...a, balance: a.balance - action.amount } : a)) };
    case "erp":
      return { ...state, erpId: action.id };
    case "batch":
      return { ...state, batch: action.ids };
    case "tab":
      return { ...state, tab: action.tab };
    case "toast":
      return { ...state, toasts: [...state.toasts, action.toast] };
    case "untoast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

// A refresh mid-request would leave documents stuck in a waiting state, because the
// timers that finish them are gone. Settle them on load.
function settle(docs: Doc[]): Doc[] {
  return docs.map((d) => {
    let doc = d;
    if (doc.extraction === "in_progress") doc = { ...doc, extraction: "done" };
    if (doc.sync === "syncing") doc = { ...doc, sync: "synced" };
    if (doc.type === "invoice" && doc.payment?.state === "processing") {
      doc = { ...doc, payment: { ...doc.payment, state: "paid" }, sync: "synced" };
    }
    return doc;
  });
}

type Store = {
  state: State;
  erp: ErpAdapter;
  today: string;
  rules: RuleContext;
  issues: (doc: Doc) => Issue[];
  doc: (id: string) => Doc | undefined;
  actions: {
    reset: () => void;
    update: (id: string, fn: (doc: Doc) => Doc) => void;
    add: (docs: Doc[]) => void;
    remove: (id: string) => void;
    changeType: (id: string) => void;
    markReady: (id: string) => void;
    backToDraft: (id: string) => void;
    markPaid: (id: string) => void;
    confirmBankChange: (id: string) => void;
    keepSavedBank: (id: string) => void;
    dismissDuplicate: (id: string) => void;
    setBatch: (ids: string[]) => void;
    pay: (ids: string[], accountId: string, dates: Record<string, string>) => Promise<void>;
    retryPayment: (id: string) => void;
    submit: (ids: string[]) => void;
    retrySync: (id: string) => void;
    setErp: (id: string) => void;
    setTab: (tab: Tab) => void;
    restore: (doc: Doc) => void;
    ingest: (docs: Doc[]) => void;
    retryExtraction: (id: string) => void;
    enterManually: (id: string) => void;
    attachToInvoice: (id: string) => void;
    createContact: (docId: string) => void;
    setContactBank: (contactId: string, bank: BankDetails) => void;
    toast: (message: string, tone?: Toast["tone"], action?: ToastAction) => void;
    dismissToast: (id: number) => void;
  };
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const today = useMemo(() => todayIso(), []);
  const toastId = useRef(0);
  // Latest state for callbacks that run after a delay.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });

  useEffect(() => {
    let loaded: Action | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        loaded = { type: "load", state: { ...saved, docs: settle(saved.docs) } };
      }
    } catch {
      // Corrupt or unavailable storage: fall through to fresh demo data.
    }
    dispatch(loaded ?? { type: "load", state: { ...seed(today), erpId: "xero", batch: [] } });
  }, [today]);

  useEffect(() => {
    if (!state.hydrated) return;
    const { docs, contacts, accounts, erpId, batch } = state;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ docs, contacts, accounts, erpId, batch }));
    } catch {
      // Storage full or blocked. The app still works for this session.
    }
  }, [state]);

  const erp = getErp(state.erpId);
  const rules = useMemo<RuleContext>(() => ({ docs: state.docs, contacts: state.contacts, erp, today }), [state.docs, state.contacts, erp, today]);
  const issues = useCallback((doc: Doc) => issuesFor(doc, rules), [rules]);
  const doc = useCallback((id: string) => state.docs.find((d) => d.id === id), [state.docs]);

  const actions = useMemo<Store["actions"]>(() => {
    const update = (id: string, fn: (doc: Doc) => Doc) => dispatch({ type: "patch", id, fn });
    const find = (id: string) => latest.current.docs.find((d) => d.id === id);

    const toast = (message: string, tone: Toast["tone"] = "ok", action?: ToastAction) => {
      const id = ++toastId.current;
      dispatch({ type: "toast", toast: { id, message, tone, action } });
      setTimeout(() => dispatch({ type: "untoast", id }), 5000);
    };

    const sync = async (id: string) => {
      const target = find(id);
      if (!target) return;
      const erpName = getErp(latest.current.erpId).name;
      update(id, (d) => ({ ...d, sync: "syncing" }));
      const result = await api.syncToErp(target, erpName);
      if (result.ok) {
        update(id, (d) => ({ ...d, sync: "synced" }));
      } else {
        // The mock fails once, so a retry succeeds.
        update(id, (d) => ({ ...d, sync: "failed", mock: { ...d.mock, failSyncOnce: false } }));
        track("sync_failed", { id, reason: result.reason });
        toast(`${result.reason}. You can retry from the list.`, "danger");
      }
    };

    // Reading a file takes a moment and can fail. The timer lives here, not in the upload
    // screen, so leaving that screen does not strand a document "In Progress".
    const read = (id: string, delay: number) => {
      setTimeout(() => {
        const target = find(id);
        if (!target) return;
        if (target.mock?.unreadable) {
          update(id, (d) => ({ ...d, extraction: "failed", extractionError: UNREADABLE_REASON }));
          track("extraction_failed", { id, fileName: target.fileName });
          return;
        }
        update(id, (d) => ({ ...d, extraction: "done" }));
        track("document_uploaded", { id, type: target.type, channel: target.source.channel });
        const done = find(id);
        if (done && findDuplicate({ ...done, extraction: "done" }, latest.current.docs)) track("duplicate_flagged", { id });
      }, delay);
    };

    const settlePayment = async (id: string) => {
      const target = find(id);
      if (!target || target.type !== "invoice") return;
      const result = await api.settlePayment(target);
      if (result.ok) {
        update(id, (d) => (d.type === "invoice" && d.payment ? { ...d, payment: { ...d.payment, state: "paid" } } : d));
        track("invoice_paid", { id, amount: target.total, currency: target.currency });
        void sync(id);
      } else {
        update(id, (d) =>
          d.type === "invoice" && d.payment ? { ...d, payment: { ...d.payment, state: "failed" }, mock: { ...d.mock, failPaymentOnce: false } } : d,
        );
        track("payment_failed", { id, reason: result.reason });
        toast(`${target.supplier}: ${result.reason}.`, "danger");
      }
    };

    return {
      reset: () => {
        dispatch({ type: "load", state: { ...seed(todayIso()), erpId: "xero", batch: [] } });
        toast("Demo data reset");
      },
      update,
      add: (docs) => dispatch({ type: "add", docs }),
      remove: (id) => dispatch({ type: "remove", id }),
      changeType: (id) => {
        const target = find(id);
        if (!target) return;
        update(id, (d) => switchType(d, latest.current.contacts));
        track("document_type_changed", { id, from: target.type });
      },
      markReady: (id) => {
        update(id, (d) => (d.type === "invoice" ? { ...d, status: "ready_to_pay" } : d));
        track("invoice_ready", { id });
      },
      backToDraft: (id) => update(id, (d) => (d.type === "invoice" && d.status === "ready_to_pay" ? { ...d, status: "draft" } : d)),
      markPaid: (id) => {
        // Paid elsewhere. No money moves here; the books still need to know.
        update(id, (d) =>
          d.type === "invoice" ? { ...d, status: "paid", payment: { state: "paid", accountId: "outside", payOn: todayIso() } } : d,
        );
        void sync(id);
      },
      confirmBankChange: (id) => {
        const target = find(id);
        if (!target || target.type !== "invoice" || !target.documentBank || !target.contactId) return;
        const newBank = target.documentBank;
        dispatch({ type: "contact", id: target.contactId, fn: (c) => ({ ...c, bank: newBank }) });
        update(id, (d) => ({ ...d, bankChangeConfirmed: true }));
        track("bank_change_confirmed", { id });
      },
      keepSavedBank: (id) => {
        const target = find(id);
        if (!target || target.type !== "invoice") return;
        const saved = latest.current.contacts.find((c) => c.id === target.contactId)?.bank ?? null;
        update(id, (d) => (d.type === "invoice" ? { ...d, documentBank: saved } : d));
      },
      dismissDuplicate: (id) => update(id, (d) => ({ ...d, duplicateDismissed: true })),
      setBatch: (ids) => dispatch({ type: "batch", ids }),
      pay: async (ids, accountId, dates) => {
        const invoices = ids.map(find).filter((d): d is Invoice => d?.type === "invoice" && d.status === "ready_to_pay");
        const account = latest.current.accounts.find((a) => a.id === accountId);
        await Promise.all(invoices.map((i) => api.schedulePayment(i)));
        for (const invoice of invoices) {
          update(invoice.id, (d) =>
            d.type === "invoice" ? { ...d, status: "paid", payment: { state: "processing", accountId, payOn: dates[invoice.id] ?? todayIso() } } : d,
          );
          if (account && invoice.currency === account.currency) dispatch({ type: "debit", accountId, amount: invoice.total });
          track("payment_scheduled", { id: invoice.id, amount: invoice.total, currency: invoice.currency, accountId });
          void settlePayment(invoice.id);
        }
        dispatch({ type: "batch", ids: [] });
      },
      retryPayment: (id) => {
        update(id, (d) => (d.type === "invoice" && d.payment ? { ...d, payment: { ...d.payment, state: "processing" } } : d));
        void settlePayment(id);
      },
      submit: (ids) => {
        for (const id of ids) {
          update(id, (d) => (d.type === "receipt" ? { ...d, status: "submitted" } : d));
          track("receipt_submitted", { id });
          void sync(id);
        }
        toast(ids.length === 1 ? "Receipt submitted" : `${ids.length} receipts submitted`);
      },
      retrySync: (id) => {
        track("sync_retried", { id });
        void sync(id);
      },
      createContact: (docId) => {
        const target = find(docId);
        if (!target || target.type !== "invoice" || !target.supplier) return;
        const contact: Contact = { id: `c-${Date.now().toString(36)}`, name: target.supplier, bank: target.documentBank, paidBefore: 0 };
        dispatch({ type: "addContact", contact });
        update(docId, (d) => (d.type === "invoice" ? { ...d, contactId: contact.id } : d));
      },
      setContactBank: (contactId, bank) => dispatch({ type: "contact", id: contactId, fn: (c) => ({ ...c, bank }) }),
      setErp: (id) => dispatch({ type: "erp", id }),
      setTab: (tab) => dispatch({ type: "tab", tab }),
      restore: (doc) => dispatch({ type: "add", docs: [doc] }),
      ingest: (docs) => {
        dispatch({ type: "add", docs });
        docs.forEach((d, i) => read(d.id, 1400 + i * 650));
      },
      retryExtraction: (id) => {
        update(id, (d) => ({ ...d, extraction: "in_progress", extractionError: undefined }));
        read(id, 1800);
      },
      enterManually: (id) => update(id, (d) => ({ ...d, extraction: "done", extractionError: undefined, mock: { ...d.mock, unreadable: false }, typeReason: "Entered by hand" })),
      attachToInvoice: (id) => {
        const target = find(id);
        if (!target || target.type !== "receipt" || !target.confirmsInvoiceId) return;
        const invoice = find(target.confirmsInvoiceId);
        dispatch({ type: "remove", id });
        toast(`Attached to ${invoice?.type === "invoice" ? invoice.number : "the invoice"} as proof of payment`, "ok", {
          label: "Undo",
          run: () => dispatch({ type: "add", docs: [target] }),
        });
      },
      toast,
      dismissToast: (id) => dispatch({ type: "untoast", id }),
    };
  }, []);

  const store = useMemo<Store>(() => ({ state, erp, today, rules, issues, doc, actions }), [state, erp, today, rules, issues, doc, actions]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside StoreProvider");
  return store;
}
