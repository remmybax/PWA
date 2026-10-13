// Calendar helpers. Dates are ISO "YYYY-MM-DD" strings and all arithmetic is done in UTC so the
// server's own time zone never shifts a day. "Today" is Odessa, TX time.

export const APP_TIME_ZONE = "America/Chicago";

export function todayISO(now: Date = new Date()): string {
  return isoInZone(now);
}

export function isoInZone(d: Date, timeZone = APP_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** "1:38 PM" in Odessa time. */
export function timeInZone(d: Date, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d);
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(iso: string, days: number): string {
  const dt = toUTC(iso);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Same day next month, clamped to the month's last day (Jan 31 -> Feb 28). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(y, m - 1 + months, Math.min(d, last)));
  return dt.toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

export function isValidISODate(s: string | undefined | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toUTC(s).toISOString().slice(0, 10) === s;
}

/** "10/13/2026" */
export function usDate(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
}

/** "10/13/2026 1:38 PM" from a timestamp. */
export function usDateTime(ts: string): string {
  const d = new Date(ts);
  return `${usDate(isoInZone(d))} ${timeInZone(d)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 13, 2026" */
export function longDate(iso: string): string {
  if (!isValidISODate(iso)) return iso;
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
}

/** "in 12 days", "today", "3 days ago" */
export function relativeDays(fromToday: number): string {
  if (fromToday === 0) return "today";
  if (fromToday === 1) return "tomorrow";
  if (fromToday === -1) return "yesterday";
  return fromToday > 0 ? `in ${fromToday} days` : `${-fromToday} days ago`;
}
