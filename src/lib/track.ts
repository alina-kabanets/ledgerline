// Product events, logged to the console. In production this would go to an analytics tool.
// Names are a union so they cannot drift between call sites.

export type TrackEvent =
  | "document_uploaded"
  | "extraction_failed"
  | "document_type_changed"
  | "ai_suggestion_accepted"
  | "ai_suggestion_changed"
  | "field_corrected"
  | "duplicate_flagged"
  | "bank_change_flagged"
  | "bank_change_confirmed"
  | "invoice_ready"
  | "payment_scheduled"
  | "invoice_paid"
  | "payment_failed"
  | "receipt_submitted"
  | "sync_failed"
  | "sync_retried";

export function track(event: TrackEvent, props: Record<string, unknown> = {}) {
  console.info("[track]", event, props);
}
