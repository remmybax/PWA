import {
  eolOf, toLines, parseFrontmatter, setFrontmatter, findSection, sectionInsertIndex, formatValue,
} from './frontmatter.js';

// Order used only when the dashboard creates a new app.md. Existing files keep their own order.
export const APP_KEYS = [
  'company', 'role', 'location', 'source', 'date_applied', 'status', 'reached', 'keep_active',
  'last_contact', 'posting_url', 'portal_url', 'portal_login', 'resume_version', 'contact_name',
  'contact_email', 'next_action', 'next_action_date', 'event_date', 'event_time', 'event_kind', 'event_where',
];

const LOG_LINE = /^\s*[-*]\s+(\d{4}-\d{2}-\d{2})\s+(?:\[(claude|manual)\]\s+)?(.*)$/i;

export function parseApp(text) {
  const { data } = parseFrontmatter(text);
  const lines = toLines(text);
  const section = findSection(lines, 'Log');
  const log = [];
  if (section) {
    for (let i = section.start + 1; i < section.end; i++) {
      const m = lines[i].match(LOG_LINE);
      if (m) log.push({ date: m[1], who: m[2] ? m[2].toLowerCase() : null, text: m[3].trim(), line: i });
    }
  }
  const s = (k) => (data[k] ?? '').toString().trim();
  return {
    fields: data,
    company: s('company'),
    role: s('role'),
    location: s('location'),
    source: s('source'),
    dateApplied: s('date_applied'),
    status: s('status').toLowerCase() || 'applied',
    reached: s('reached').toLowerCase(),
    keepActive: s('keep_active').toLowerCase() === 'true',
    lastContact: s('last_contact'),
    postingUrl: s('posting_url'),
    portalUrl: s('portal_url'),
    portalLogin: s('portal_login'),
    resumeVersion: s('resume_version'),
    contactName: s('contact_name'),
    contactEmail: s('contact_email'),
    nextAction: s('next_action'),
    nextActionDate: s('next_action_date'),
    event: {
      date: s('event_date'), time: s('event_time'), kind: s('event_kind'), where: s('event_where'),
    },
    log,
  };
}

export function logLine({ date, who, text }) {
  return `- ${date} [${who}] ${String(text).replace(/\r?\n/g, ' ').trim()}`;
}

// Log is kept oldest-first in the file (Claude appends); the UI reverses it for display.
export function appendLog(text, entry) {
  const eol = eolOf(text);
  const lines = toLines(text);
  const section = findSection(lines, 'Log');
  const line = logLine(entry);
  if (section) {
    lines.splice(sectionInsertIndex(lines, section), 0, line);
  } else {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', '## Log', line);
  }
  let out = lines.join(eol);
  if (!out.endsWith(eol)) out += eol;
  return out;
}

export function setAppFields(text, updates) {
  return setFrontmatter(text, updates);
}

export function newAppText(fields, firstLog) {
  const keys = [...APP_KEYS, ...Object.keys(fields).filter((k) => !APP_KEYS.includes(k))];
  const fm = keys.map((k) => {
    const v = formatValue(fields[k]);
    return v === '' ? `${k}:` : `${k}: ${v}`;
  });
  return ['---', ...fm, '---', '', '## Log', logLine(firstLog), ''].join('\n');
}
