import { eolOf, toLines, blankComments } from './frontmatter.js';

const LEAD = /^(\s*[-*]\s+)(\d{4}-\d{2}-\d{2})\s+\[(claude|manual)\]\s+(new|applied|passed)\s*\|\s*(.*)$/i;

function clean(s) {
  return String(s ?? '').replace(/\r?\n/g, ' ').replace(/\s*\|\s*/g, ' / ').trim();
}

export function leadId(lead) {
  return lead.url ? lead.url : `${lead.company}|${lead.role}`.toLowerCase();
}

export function parseLeads(text) {
  const lines = blankComments(toLines(text));
  const leads = [];
  lines.forEach((line, i) => {
    const m = line.match(LEAD);
    if (!m) return;
    const parts = m[5].split('|').map((p) => p.trim());
    const [company = '', role = '', location = '', source = '', url = '', ...rest] = parts;
    const lead = {
      date: m[2], who: m[3].toLowerCase(), status: m[4].toLowerCase(),
      company, role, location, source, url, reason: rest.join(' | '), line: i,
    };
    lead.id = leadId(lead);
    leads.push(lead);
  });
  return leads;
}

export function leadLine(lead) {
  const cols = [lead.company, lead.role, lead.location, lead.source, lead.url].map(clean);
  if (lead.status === 'passed' && lead.reason) cols.push(clean(lead.reason));
  return `- ${lead.date} [${lead.who}] ${lead.status} | ${cols.join(' | ')}`;
}

// Rewrites only the status (and reason) of one line; the date, marker, and columns stay as written.
export function setLeadStatus(text, id, status, reason = '') {
  const lines = toLines(text);
  const lead = parseLeads(text).find((l) => l.id === id);
  if (!lead) throw new Error('That lead is no longer in leads.md');
  const m = lines[lead.line].match(LEAD);
  const parts = m[5].split('|').map((p) => p.trim()).slice(0, 5);
  while (parts.length < 5) parts.push('');
  if (status === 'passed' && reason.trim()) parts.push(clean(reason));
  lines[lead.line] = `${m[1]}${m[2]} [${m[3]}] ${status} | ${parts.join(' | ')}`;
  return lines.join(eolOf(text));
}

// Newest first: a new lead goes above the first existing lead line.
export function addLead(text, lead) {
  const eol = eolOf(text);
  const lines = toLines(text);
  const existing = parseLeads(text);
  const line = leadLine({ status: 'new', who: 'manual', ...lead });
  if (existing.length) {
    lines.splice(existing[0].line, 0, line);
  } else {
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    lines.push('', line, '');
  }
  return lines.join(eol);
}

export function parseLastSynced(text) {
  const s = (text ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
