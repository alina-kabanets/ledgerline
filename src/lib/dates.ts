// Dates are ISO strings (YYYY-MM-DD) so they survive localStorage and compare as text.

const pad = (n: number) => String(n).padStart(2, "0");

export function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function today() {
  return iso(new Date());
}

// Local time to the second. Every timestamp in the app uses this one format.
export function nowStamp() {
  const d = new Date();
  return `${iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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

// "3 hours ago", for the Last action column.
export function ago(stamp: string, now: Date = new Date()) {
  const then = new Date(stamp);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return "just now";
  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
