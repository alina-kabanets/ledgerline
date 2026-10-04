import { taxFor, type ErpAdapter } from "./erp";
import { netOf, taxOn } from "./money";
import { lineNet } from "./rules";
import type { LineItem } from "./types";

// Editing a line. Tax always follows from the tax code, so the two cannot disagree.

const pct = (erp: ErpAdapter, code: string | null) => taxFor(erp, code)?.pct ?? 0;
const BY_USER = { origin: "user" as const };

export function lineGross(line: LineItem) {
  return lineNet(line) + line.tax;
}

// Invoices are entered as quantity and unit price before tax.
export function setNet(line: LineItem, quantity: number, unitAmount: number, erp: ErpAdapter): LineItem {
  const next = { ...line, quantity, unitAmount, amountMeta: BY_USER };
  return { ...next, tax: taxOn(lineNet(next), pct(erp, line.taxCode)) };
}

// Receipts are entered as the amount paid, tax included.
export function setGross(line: LineItem, gross: number, erp: ErpAdapter): LineItem {
  const net = netOf(gross, pct(erp, line.taxCode));
  return { ...line, quantity: 1, unitAmount: net, tax: gross - net, amountMeta: BY_USER };
}

// Changing the code re-works the tax but is not an edit of the amount.
export function setTaxCode(line: LineItem, taxCode: string | null, erp: ErpAdapter, mode: "net" | "gross"): LineItem {
  const next = { ...line, taxCode, taxMeta: BY_USER };
  const rate = pct(erp, taxCode);
  if (mode === "gross") {
    const gross = lineGross(line);
    const net = netOf(gross, rate);
    return { ...next, quantity: 1, unitAmount: net, tax: gross - net };
  }
  return { ...next, tax: taxOn(lineNet(next), rate) };
}

// A new line starts empty. Nothing is copied in, so nothing is labelled as chosen
// when nobody chose it.
export function newLine(id: string): LineItem {
  return { id, description: "", quantity: 1, unitAmount: 0, tax: 0, glCode: null, taxCode: null, amountMeta: BY_USER };
}
