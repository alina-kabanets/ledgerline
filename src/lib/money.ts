import type { Currency } from "./types";

// Money is held in minor units (pence, cents) so sums never drift.

export function moneyParts(minor: number) {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const int = Math.floor(abs / 100).toLocaleString("en-GB");
  const dec = String(abs % 100).padStart(2, "0");
  return { sign, int, dec };
}

export function formatMoney(minor: number, currency: Currency) {
  const { sign, int, dec } = moneyParts(minor);
  return `${sign}${currency} ${int}.${dec}`;
}

// "12.40" or "1,204.5" typed by a person, to minor units. Null if it is not a number.
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[,\s£€$]/g, "");
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function toInput(minor: number) {
  return (minor / 100).toFixed(2);
}
