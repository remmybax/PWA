import { toLines, blankComments } from './frontmatter.js';

// vault.md is read-only in the app; there is intentionally no writer here.

export const VAULT_SECTIONS = ['Personal contact', 'Employment', 'Credentials', 'Education', 'References', 'Stock answers'];

const FIELD = /^([A-Za-z][A-Za-z0-9_]*)[ \t]*(?:\{(wide|full)\})?[ \t]*:[ \t]?(.*)$/;
const ACRONYMS = new Set(['cdl', 'dot', 'twic', 'tsa', 'osha', 'mvr', 'ssn', 'dl', 'id', 'url', 'ats', 'gpa', 'mba', 'bs', 'ba', 'hr']);

export function fieldLabel(key) {
  const words = key.split('_').filter(Boolean).map((w) => w.toLowerCase());
  return words
    .map((w, i) => {
      if (ACRONYMS.has(w)) return w.toUpperCase();
      if (/^last\d$/.test(w)) return `last ${w.slice(4)}`;
      return i === 0 ? w[0].toUpperCase() + w.slice(1) : w;
    })
    .join(' ');
}

export function sectionId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function parseVault(text) {
  const lines = blankComments(toLines(text));
  const sections = [];
  let section = null;
  let entry = null;
  let lastField = null;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if ((m = line.match(/^##[ \t]+(.+)$/)) && !line.startsWith('###')) {
      section = { id: sectionId(m[1]), name: m[1].trim(), entries: [] };
      sections.push(section);
      entry = null;
      lastField = null;
      continue;
    }
    if ((m = line.match(/^###[ \t]+(.+)$/))) {
      if (!section) continue;
      entry = { title: m[1].trim(), dates: '', fields: [] };
      section.entries.push(entry);
      lastField = null;
      continue;
    }
    if (!entry) continue;
    if (line.trim() === '') { lastField = null; continue; }
    if ((m = line.match(FIELD))) {
      const key = m[1];
      const value = m[3].trim();
      if (key.toLowerCase() === 'dates') { entry.dates = value; lastField = null; continue; }
      lastField = { key, label: fieldLabel(key), span: m[2] || 'normal', value };
      entry.fields.push(lastField);
      continue;
    }
    // A plain line right under a field continues it (long stock answers wrap this way).
    if (lastField) lastField.value = lastField.value ? `${lastField.value}\n${line.trim()}` : line.trim();
  }
  return { sections };
}

export function entryField(entry, key) {
  return entry.fields.find((f) => f.key.toLowerCase() === key.toLowerCase())?.value ?? '';
}

export function copyAllText(entry) {
  const head = entry.dates ? `${entry.title} (${entry.dates})` : entry.title;
  return [head, ...entry.fields.map((f) => `${f.label}: ${f.value}`)].join('\n');
}

export function credentials(vault) {
  const sec = vault.sections.find((s) => s.id === 'credentials');
  if (!sec) return [];
  return sec.entries.map((e) => ({
    name: e.title,
    expires: entryField(e, 'expires'),
    file: entryField(e, 'file'),
    renew: entryField(e, 'renew'),
  }));
}
