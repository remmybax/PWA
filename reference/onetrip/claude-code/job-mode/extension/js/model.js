import { daysBetween, isISODate, lastDayOfMonth, weekEnd } from './dates.js';

export const STAGES = {
  applied: { id: 'applied', label: 'Applied', active: true, order: 0 },
  screening: { id: 'screening', label: 'Screening', active: true, order: 1 },
  interview: { id: 'interview', label: 'Interview', active: true, order: 2 },
  offer: { id: 'offer', label: 'Offer', active: true, order: 3 },
  rejected: { id: 'rejected', label: 'Rejected', active: false, order: 4 },
  ghosted: { id: 'ghosted', label: 'Ghosted', active: false, order: 5 },
};
export const STAGE_ORDER = Object.keys(STAGES);

export const FOLLOW_UP_DAYS = 10;
export const AUTO_GHOST_DAYS = 30;
export const EXPIRY_WINDOW_DAYS = 90;
export const STALE_SYNC_HOURS = 24;

export function stageOf(status) {
  return STAGES[status] ?? STAGES.applied;
}

export function daysSilent(app, today) {
  const since = isISODate(app.lastContact) ? app.lastContact : app.dateApplied;
  return isISODate(since) ? Math.max(0, daysBetween(since, today)) : null;
}

// Auto-ghost is computed at display time and never written to app.md.
export function effectiveStatus(app, today) {
  const stage = stageOf(app.status);
  const days = daysSilent(app, today);
  if (stage.active && days !== null && days >= AUTO_GHOST_DAYS && !app.keepActive) {
    return { status: 'ghosted', auto: true };
  }
  return { status: stage.id, auto: false };
}

export function decorateApp(app, today) {
  const eff = effectiveStatus(app, today);
  const days = daysSilent(app, today);
  const active = STAGES[eff.status].active;
  return {
    ...app,
    effective: eff.status,
    autoGhosted: eff.auto,
    days,
    active,
    followUpDue: active && days !== null && days >= FOLLOW_UP_DAYS,
    nextOverdue: isISODate(app.nextActionDate) && app.nextActionDate < today,
  };
}

// Active: furthest stage first, then most silent. Closed apps go in their own list below.
export function sortPipeline(apps) {
  const active = apps.filter((a) => a.active)
    .sort((x, y) => STAGES[y.effective].order - STAGES[x.effective].order || (y.days ?? 0) - (x.days ?? 0));
  const closed = apps.filter((a) => !a.active)
    .sort((x, y) => (x.days ?? 0) - (y.days ?? 0));
  return { active, closed };
}

export function followUpsDue(apps) {
  return apps.filter((a) => a.followUpDue).sort((x, y) => y.days - x.days);
}

export function eventsThisWeek(apps, today) {
  const end = weekEnd(today);
  return apps
    .filter((a) => a.active && isISODate(a.event.date) && a.event.date >= today && a.event.date <= end)
    .sort((x, y) => (x.event.date + timeKey(x.event.time)).localeCompare(y.event.date + timeKey(y.event.time)));
}

function timeKey(t) {
  const m = (t || '').match(/(\d{1,2})(?::(\d{2}))?\s*([ap])?/i);
  if (!m) return '99:99';
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
}

// Moving to an active stage also sets keep_active, so an old app pulled back
// into play doesn't get auto-ghosted again on the very next render.
export function statusUpdates(app, next) {
  const updates = { status: next };
  if (STAGES[next].active) {
    updates.keep_active = true;
    const reached = STAGES[app.reached] ? app.reached : 'applied';
    if (STAGES[next].order > STAGES[reached].order) updates.reached = next;
  }
  return updates;
}

// "_exp2028-03" in a filename means valid through the end of March 2028.
export function expiryFromFilename(name) {
  const m = name.match(/_exp(\d{4})-(\d{2})(?:-(\d{2}))?/i);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : lastDayOfMonth(y, mo);
}

export function expiryState(expiresISO, today) {
  if (!isISODate(expiresISO)) return null;
  const days = daysBetween(today, expiresISO);
  if (days < 0) return { days, label: 'Expired', flag: true };
  if (days <= EXPIRY_WINDOW_DAYS) return { days, label: `${days} days`, flag: true };
  return { days, label: '', flag: false };
}

export function credentialsExpiring(creds, today) {
  return creds
    .map((c) => ({ ...c, state: expiryState(c.expires, today) }))
    .filter((c) => c.state && c.state.days <= EXPIRY_WINDOW_DAYS)
    .sort((x, y) => x.state.days - y.state.days);
}

export function syncAge(lastSynced, now = new Date()) {
  if (!lastSynced) return { hours: null, stale: true };
  const hours = Math.floor((now - lastSynced) / 36e5);
  return { hours, stale: hours >= STALE_SYNC_HOURS };
}

export function slug(s) {
  return (s || '').replace(/[^A-Za-z0-9]+/g, '');
}

export function applicationFolderName(date, company, role) {
  return `${date}_${slug(company) || 'Company'}_${slug(role) || 'Role'}`;
}

export function sourceFromUrl(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return 'Other'; }
  if (host.endsWith('linkedin.com')) return 'LinkedIn';
  if (host.endsWith('indeed.com')) return 'Indeed';
  if (host.endsWith('glassdoor.com')) return 'Glassdoor';
  if (host.endsWith('joinhandshake.com')) return 'Handshake';
  return 'Company site';
}

export function normalizeUrl(url) {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'refId', 'trackingId', 'trk', 'from'].forEach((p) => u.searchParams.delete(p));
    return `${u.origin}${u.pathname.replace(/\/$/, '')}${u.search}`.toLowerCase();
  } catch {
    return (url || '').trim().toLowerCase();
  }
}
