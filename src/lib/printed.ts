import { lineNet, linesNet, linesTax } from "./rules";
import type { Doc, Printed } from "./types";

// Builds the mock document from a freshly extracted record. In a real system this is the
// PDF or photo itself; here it is data, so the preview can highlight regions.
export function printFrom(doc: Doc, over: Partial<Printed> = {}): Printed {
  const tax = linesTax(doc);
  const base: Printed =
    doc.type === "invoice"
      ? {
          layout: "invoice",
          title: "Invoice",
          from: doc.supplier,
          to: doc.entity,
          number: doc.number,
          dates: [
            { key: "issuedOn", label: "Invoice date", value: doc.issuedOn },
            { key: "dueOn", label: "Payment due", value: doc.dueOn },
          ],
          rows: doc.lines.map((l) => ({ description: l.description, qty: l.quantity, amount: lineNet(l) })),
          totals: [
            { label: "Subtotal", amount: linesNet(doc) },
            ...(tax !== 0 ? [{ label: "VAT (20%)", amount: tax }] : []),
            { label: "Total", amount: doc.total, key: "total" },
          ],
          bank: doc.documentBank,
          stamps: [],
          blurred: [],
        }
      : {
          layout: doc.slipOnly ? "slip" : doc.source.channel === "whatsapp" ? "till" : "invoice",
          title: "Receipt",
          from: doc.merchant,
          to: doc.entity,
          dates: [{ key: "paidOn", label: "Date", value: doc.paidOn }],
          rows: doc.lines.map((l) => ({ description: l.description, qty: l.quantity, amount: lineNet(l) })),
          totals: [
            ...(tax !== 0 ? [{ label: "Subtotal", amount: linesNet(doc) }, { label: "VAT", amount: tax }] : []),
            { label: "Total", amount: doc.total, key: "total" },
          ],
          bank: null,
          stamps: ["Paid"],
          blurred: [],
        };
  return { ...base, ...over };
}
