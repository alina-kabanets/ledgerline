// Dates are ISO strings (YYYY-MM-DD) so they survive localStorage and compare as text.

export function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function today() {
  return iso(new Date());
}

function parse(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, days: number) {
  const d = parse(date);
  d.setDate(d.getDate() + days);
  return iso(d);
}

function isWeekend(d: Date) {
  return d.getDay() === 0 || d.getDay() === 6;
}

// Bank holidays are ignored. A real build needs a holiday calendar per currency.
export function addBusinessDays(date: string, days: number) {
  const d = parse(date);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (!isWeekend(d)) left--;
  }
  return iso(d);
}

export function formatDate(date: string) {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function formatLongDate(date: string) {
  if (!date) return "";
  return parse(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
