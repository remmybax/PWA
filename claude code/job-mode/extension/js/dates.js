// All dates in the vault are plain YYYY-MM-DD strings in Dan's local time.
// Day math is done on UTC day numbers so DST changes never shift a count by one.

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isISODate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

export function dayNumber(iso) {
  const [y, m, d] = iso.trim().split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d || 1) / 864e5);
}

export function daysBetween(fromISO, toISO) {
  return dayNumber(toISO) - dayNumber(fromISO);
}

export function addDays(iso, n) {
  return new Date((dayNumber(iso) + n) * 864e5).toISOString().slice(0, 10);
}

export function lastDayOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// Sunday that ends the current week (today itself if today is Sunday).
export function weekEnd(todayIso) {
  const dow = new Date(dayNumber(todayIso) * 864e5).getUTCDay();
  return addDays(todayIso, (7 - dow) % 7);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${MON[m - 1]} ${d}`;
}

export function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MON[m - 1]} ${d}, ${y}`;
}

export function weekday(iso) {
  return DOW[new Date(dayNumber(iso) * 864e5).getUTCDay()];
}
