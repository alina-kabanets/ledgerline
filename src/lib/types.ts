export type Currency = "GBP" | "EUR" | "USD";

// How a document arrived. Only "upload" is real in this build; the rest are mocked.
export type Channel = "upload" | "email" | "whatsapp" | "xero";

export type Source = { channel: Channel; by: string; at: string };

// Where a value came from. Shown next to every extracted field.
export type Origin = "document" | "memory" | "user" | "missing";

export type FieldMeta = {
  origin: Origin;
  // The AI is not sure. The field is flagged until a person confirms or edits it.
  uncertain?: boolean;
  // Shown in the "Why this value" tooltip.
  reason?: string;
};

export type LineItem = {
  id: string;
  description: string;
  quantity: number;
  // Minor units (pence), before tax.
  unitAmount: number;
  // Minor units.
  tax: number;
  glCode: string | null;
  taxCode: string | null;
  glMeta?: FieldMeta;
  taxMeta?: FieldMeta;
  // Extra fields a given ERP requires per line, e.g. NetSuite department.
  extra?: Record<string, string>;
};

export type BankDetails = {
  accountName: string;
  sortCode: string;
  accountNumber: string;
};

export type Contact = {
  id: string;
  name: string;
  bank: BankDetails | null;
  // Number of invoices paid to this contact before. 0 means first-time supplier.
  paidBefore: number;
};

export type PrintedRow = { description: string; qty: number; amount: number };

// What the mock document shows. Keys link a region of the document to a form field, so
// focusing the field can highlight where its value came from.
export type Printed = {
  layout: "invoice" | "till" | "slip";
  title: string;
  from: string;
  to: string;
  number?: string;
  dates: { key: string; label: string; value: string }[];
  rows: PrintedRow[];
  totals: { label: string; amount: number; key?: string }[];
  bank?: BankDetails | null;
  stamps: string[];
  // Field keys that are hard to read on the document.
  blurred: string[];
};

export type SyncState = "not_synced" | "syncing" | "synced" | "failed";

export type Extraction = "in_progress" | "done" | "failed";

type DocumentBase = {
  id: string;
  fileName: string;
  source: Source;
  entity: string;
  currency: Currency;
  // Total printed on the document, minor units. Lines must add up to this.
  total: number;
  lines: LineItem[];
  meta: Record<string, FieldMeta>;
  extraction: Extraction;
  // Why reading the file failed, in words the user can act on.
  extractionError?: string;
  // The document as it was printed. Never changes when fields are edited, so the
  // preview always shows the source.
  printed?: Printed;
  // Why the AI chose this type. Shown at upload and in review.
  typeReason: string;
  // Set when the user has dismissed a duplicate warning.
  duplicateDismissed?: boolean;
  sync: SyncState;
  // Mock switches so the demo can show failures.
  mock?: { failSyncOnce?: boolean; failPaymentOnce?: boolean; unreadable?: boolean };
  // Fields kept when the type is switched, so switching back loses nothing.
  stash?: Record<string, unknown>;
};

export type InvoiceStatus = "draft" | "ready_to_pay" | "paid";

export type Payment = {
  state: "processing" | "paid" | "failed";
  accountId: string;
  payOn: string;
};

export type Invoice = DocumentBase & {
  type: "invoice";
  status: InvoiceStatus;
  supplier: string;
  number: string;
  reference: string;
  issuedOn: string;
  dueOn: string;
  contactId: string | null;
  // Bank details as printed on the document.
  documentBank: BankDetails | null;
  // The user has confirmed a change of bank details for this invoice.
  bankChangeConfirmed?: boolean;
  payment?: Payment;
};

export type ReceiptStatus = "draft" | "submitted";

export type Receipt = DocumentBase & {
  type: "receipt";
  status: ReceiptStatus;
  merchant: string;
  paidOn: string;
  // A card terminal slip: total only, nothing to itemise.
  slipOnly?: boolean;
  // Looks like the payment confirmation for an invoice already paid from here.
  confirmsInvoiceId?: string;
};

export type Doc = Invoice | Receipt;

export type Account = {
  id: string;
  name: string;
  currency: Currency;
  balance: number;
  // Business days before money from this account can be paid out.
  settlementDays: number;
};

export type IssueCode =
  | "missing_contact"
  | "missing_payment_details"
  | "bank_changed"
  | "duplicate"
  | "totals_mismatch"
  | "uncoded"
  | "invalid_code"
  | "missing_erp_field"
  | "uncertain"
  | "missing_field"
  | "overdue"
  | "card_slip"
  | "confirms_invoice"
  | "first_time_supplier";

export type Issue = {
  code: IssueCode;
  label: string;
  // Blocks Ready to Pay or Submit until resolved.
  blocking: boolean;
  // "problem" counts towards "N issues found". "todo" is ordinary review work.
  kind: "problem" | "todo" | "info";
  relatedId?: string;
};
