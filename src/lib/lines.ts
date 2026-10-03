import { taxFor, type ErpAdapter } from "./erp";
import { lineNet } from "./rules";
import type { LineItem } from "./types";

// Editing a line. Tax always follows from the tax code, so the two cannot disagree.

const rate = (erp: ErpAdapter, code: string | null) => taxFor(erp, code)?.rate ?? 0;

export function lineGross(line: LineItem) {
  return lineNet(line) + line.tax;
}

// Invoices are entered as quantity and unit price before tax.
export function setNet(line: LineItem, quantity: number, unitAmount: number, erp: ErpAdapter): LineItem {
  const net = Math.round(quantity * unitAmount);
  return { ...line, quantity, unitAmount, tax: Math.round(net * rate(erp, line.taxCode)) };
}

// Receipts are entered as the amount paid, tax included.
export function setGross(line: LineItem, gross: number, erp: ErpAdapter): LineItem {
  const net = Math.round(gross / (1 + rate(erp, line.taxCode)));
  return { ...line, quantity: 1, unitAmount: net, tax: gross - net };
}

export function setTaxCode(line: LineItem, taxCode: string | null, erp: ErpAdapter, mode: "net" | "gross"): LineItem {
  const next = { ...line, taxCode, taxMeta: { origin: "user" as const } };
  return mode === "gross" ? setGross(next, lineGross(line), erp) : setNet(next, line.quantity, line.unitAmount, erp);
}

export function newLine(id: string): LineItem {
  return { id, description: "", quantity: 1, unitAmount: 0, tax: 0, glCode: null, taxCode: null, glMeta: { origin: "user" }, taxMeta: { origin: "user" } };
}
