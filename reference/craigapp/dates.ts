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

/** "13:38" in Odessa time. */
export function timeInZone(d: Date, timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
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

/** The paper log's week runs Sunday through Saturday (e.g. 09/20 – 09/26). */
export function weekStart(iso: string): string {
  return addDays(iso, -toUTC(iso).getUTCDay());
}

/** day/week/month step with arrows; "range" is any from–to stretch (e.g. a pay period); "all" is all time. */
export type RangeMode = "day" | "week" | "month" | "range" | "all";
export const RANGE_MODES: RangeMode[] = ["day", "week", "month", "range", "all"];

export interface DateRange {
  mode: RangeMode;
  /** Inclusive. Empty for "all". */
  from: string;
  /** Inclusive. Empty for "all". */
  to: string;
}

/** `end` is only used by "range"; the two dates can come in either order. */
export function rangeFor(mode: RangeMode, anchor: string, end?: string): DateRange {
  if (mode === "all") return { mode, from: "", to: "" };
  if (mode === "range") {
    const other = end && isValidISODate(end) ? end : anchor;
    return anchor <= other ? { mode, from: anchor, to: other } : { mode, from: other, to: anchor };
  }
  if (mode === "day") return { mode, from: anchor, to: anchor };
  if (mode === "week") {
    const from = weekStart(anchor);
    return { mode, from, to: addDays(from, 6) };
  }
  const from = anchor.slice(0, 8) + "01";
  const [y, m] = from.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { mode, from, to: `${from.slice(0, 8)}${String(last).padStart(2, "0")}` };
}

/** Anchor date of the previous/next range. */
export function shiftRange(r: DateRange, dir: -1 | 1): string {
  if (r.mode === "range" || r.mode === "all") return r.from;
  if (r.mode === "day") return addDays(r.from, dir);
  if (r.mode === "week") return addDays(r.from, 7 * dir);
  const [y, m] = r.from.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + dir, 1));
  return dt.toISOString().slice(0, 10);
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function mmdd(iso: string): string {
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

export function rangeLabel(r: DateRange): string {
  if (r.mode === "all") return "All time";
  if (r.mode === "range") return `${mmdd(r.from)}/${r.from.slice(0, 4)} – ${mmdd(r.to)}/${r.to.slice(0, 4)}`;
  if (r.mode === "day") return `${DOW[toUTC(r.from).getUTCDay()]}, ${mmdd(r.from)}/${r.from.slice(0, 4)}`;
  if (r.mode === "week") return `${mmdd(r.from)} – ${mmdd(r.to)}`;
  return `${MONTHS[Number(r.from.slice(5, 7)) - 1]} ${r.from.slice(0, 4)}`;
}

export function dayLabel(iso: string): string {
  return `${DOW[toUTC(iso).getUTCDay()]}, ${mmdd(iso)}`;
}

export function isValidISODate(s: string | undefined | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toUTC(s).toISOString().slice(0, 10) === s;
}

/**
 * Reads the dashboard/export range from URL parameters: range=day|week|month (+ date),
 * range=range (+ from, to) or range=all. Falls back to today.
 */
export function rangeFromParams(get: (key: string) => string | null | undefined, today: string): DateRange {
  const raw = get("range");
  const mode = RANGE_MODES.find((m) => m === raw) ?? "day";
  if (mode === "range") {
    const from = get("from");
    const to = get("to");
    return rangeFor("range", isValidISODate(from) ? from : today, isValidISODate(to) ? to : today);
  }
  const date = get("date");
  return rangeFor(mode, isValidISODate(date) ? date : today);
}
