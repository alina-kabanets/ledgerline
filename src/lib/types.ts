export type Currency = "GBP" | "EUR" | "USD";

// How a document arrived. Only "upload" is real in this build; the rest are mocked.
export type Channel = "upload" | "email" | "whatsapp" | "xero";

// `at` is local time, YYYY-MM-DDTHH:MM:SS, so stamps from every source compare as text.
export type Source = { channel: Channel; by: string; at: string };

// Where a value came from. Shown next to every extracted value.
export type Origin = "document" | "memory" | "user" | "missing";

export type FieldMeta = {
  origin: Origin;
  // The AI is not sure. The value is flagged until a person confirms or edits it.
  uncertain?: boolean;
  // Shown in the "Why this value" tooltip.
  reason?: string;
};

// The fields each type has. Flags are only ever kept for fields the type actually shows.
export const INVOICE_FIELDS = ["supplier", "number", "issuedOn", "dueOn", "total", "currency", "bank"] as const;
export const RECEIPT_FIELDS = ["merchant", "paidOn", "total", "currency"] as const;
export type InvoiceField = (typeof INVOICE_FIELDS)[number];
export type ReceiptField = (typeof RECEIPT_FIELDS)[number];
export type FieldKey = InvoiceField | ReceiptField;
export type Meta = Partial<Record<FieldKey, FieldMeta>>;

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
  // Origin of the description, quantity and amounts as a group.
  amountMeta?: FieldMeta;
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

// Warnings a person has looked at and chosen to override. Each is recorded separately,
// so overriding one never silences another.
export type Override = "duplicate" | "counterpart" | "bank_changed" | "contact_mismatch";

// Fields kept when the type is switched, so switching back loses nothing.
export type Stash = {
  invoice?: Pick<Invoice, "number" | "reference" | "issuedOn" | "dueOn" | "contactId" | "documentBank">;
  receipt?: Pick<Receipt, "paidOn" | "slipOnly">;
  meta?: Meta;
};

type DocumentBase = {
  id: string;
  fileName: string;
  source: Source;
  // When the document last changed. Shown as "Last action".
  updatedAt: string;
  entity: string;
  currency: Currency;
  // Total printed on the document, minor units. Lines must add up to this.
  total: number;
  lines: LineItem[];
  meta: Meta;
  extraction: Extraction;
  // Why reading the file failed, in words the user can act on.
  extractionError?: string;
  // False when trying again cannot help, such as a blurred photo.
  extractionRetryable?: boolean;
  // The document as it was printed. Never changes when fields are edited, so the
  // preview always shows the source.
  printed?: Printed;
  // Why the AI chose this type. Shown at upload and in review.
  typeReason: string;
  overrides?: Override[];
  sync: SyncState;
  stash?: Stash;
};

// One field says where an invoice is. "paid" means the money has gone.
export type InvoiceStatus = "draft" | "ready_to_pay" | "scheduled" | "processing" | "payment_failed" | "paid";

export type Payment = {
  // "outside" when the invoice was paid somewhere else.
  accountId: string;
  payOn: string;
  failure?: string;
};

export type Attachment = { fileName: string; by: string; at: string; note: string };

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
  payment?: Payment;
  attachments?: Attachment[];
};

export type ReceiptStatus = "draft" | "submitted";

export type Receipt = DocumentBase & {
  type: "receipt";
  status: ReceiptStatus;
  merchant: string;
  paidOn: string;
  // A card terminal slip: total only, nothing to itemise.
  slipOnly?: boolean;
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
  | "missing_field"
  | "not_payable"
  | "missing_contact"
  | "missing_payment_details"
  | "contact_mismatch"
  | "bank_changed"
  | "duplicate"
  | "counterpart"
  | "totals_mismatch"
  | "tax_mismatch"
  | "uncoded"
  | "invalid_code"
  | "missing_erp_field"
  | "no_description"
  | "uncertain"
  | "overdue"
  | "card_slip"
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
