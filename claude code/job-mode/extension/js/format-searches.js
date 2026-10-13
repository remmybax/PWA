import { toLines, blankComments } from './frontmatter.js';

export const SITES = ['linkedin', 'indeed', 'glassdoor', 'handshake'];

export function parseSearches(text) {
  const lines = blankComments(toLines(text));
  const searches = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if ((m = raw.match(/^##[ \t]+(.+)$/)) && !raw.startsWith('###')) {
      cur = { label: m[1].trim(), keywords: '', location: '', radius: '', recencyDays: '', sites: [...SITES] };
      searches.push(cur);
      continue;
    }
    if (!cur || !(m = line.match(/^([a-z_]+)\s*:\s*(.*)$/i))) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'keywords') cur.keywords = value;
    else if (key === 'location') cur.location = value;
    else if (key === 'radius') cur.radius = value;
    else if (key === 'recency_days') cur.recencyDays = value;
    else if (key === 'sites') {
      cur.sites = value.split(/[,\s]+/).map((s) => s.toLowerCase()).filter((s) => SITES.includes(s));
    }
  }
  return searches;
}
