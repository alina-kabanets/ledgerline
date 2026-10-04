import type { Currency } from "./types";

// Money is held in whole minor units (pence, cents). Nothing here uses fractions of a
// penny, and nothing multiplies a decimal by 100.

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

// "12.40" or "1,204.5" typed by a person, to minor units. Read as text, digit by digit.
// Null if it is not an amount.
export function parseMoney(input: string): number | null {
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(input.replace(/[,\s£€$]/g, ""));
  if (!match) return null;
  const [, minus, whole, fraction = ""] = match;
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) return null;
  return minus && minor !== 0 ? -minor : minor;
}

export function toInput(minor: number) {
  const { sign, dec } = moneyParts(minor);
  return `${sign}${Math.floor(Math.abs(minor) / 100)}.${dec}`;
}

// Halves round away from zero, so a refund is the exact mirror of its purchase.
export function roundHalfAway(value: number) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

// Tax on a net amount. `pct` is a whole percentage (20 means 20%).
export function taxOn(net: number, pct: number) {
  return roundHalfAway((net * pct) / 100);
}

// The net part of an amount that includes tax.
export function netOf(gross: number, pct: number) {
  return roundHalfAway((gross * 100) / (100 + pct));
}
