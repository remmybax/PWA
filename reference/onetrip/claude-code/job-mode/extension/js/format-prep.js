import {
  eolOf, toLines, parseFrontmatter, headingTitle, stripTags, findSection, sectionInsertIndex,
} from './frontmatter.js';

const CHECK = /^(\s*[-*]\s+\[)([ xX])(\]\s+)(.*)$/;
const STORY = /^\s*[-*]\s+(.*?)\s*::\s*(.*)$/;
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const STATUS_TAG = /\s*\[(none|drafted|practiced)\]\s*$/i;

function splitMeta(rest) {
  const at = rest.indexOf(' | ');
  if (at < 0) return { text: rest.trim(), link: '', meta: '' };
  const tail = rest.slice(at + 3).trim();
  const isLink = /^https?:\/\//i.test(tail);
  return { text: rest.slice(0, at).trim(), link: isLink ? tail : '', meta: isLink ? '' : tail };
}

function parseStory(line) {
  const m = line.match(STORY);
  if (!m) return null;
  let rest = m[2];
  const tag = rest.match(STATUS_TAG);
  let status = tag ? tag[1].toLowerCase() : null;
  if (tag) rest = rest.slice(0, tag.index);
  const story = rest.trim();
  if (!story) status = 'none';
  else if (!status || status === 'none') status = 'drafted';
  return { principle: m[1].trim(), story, status };
}

export function parsePrep(text) {
  const { data } = parseFrontmatter(text);
  const lines = toLines(text);
  const sections = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const h = headingTitle(lines[i]);
    if (h !== null) {
      const tags = [...h.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase());
      const kind = tags.find((t) => ['check', 'stories', 'list'].includes(t)) || 'other';
      cur = { title: stripTags(h), kind, mock: tags.includes('mock'), note: '', items: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    const line = lines[i];
    if (/^\s*>/.test(line)) {
      const note = line.replace(/^\s*>\s?/, '').trim();
      cur.note = cur.note ? `${cur.note} ${note}` : note;
      continue;
    }
    if (cur.kind === 'check') {
      const m = line.match(CHECK);
      if (m) cur.items.push({ done: m[2].toLowerCase() === 'x', ...splitMeta(m[4]), line: i });
    } else if (cur.kind === 'stories') {
      const s = parseStory(line);
      if (s) cur.items.push({ ...s, line: i });
    } else if (cur.kind === 'list') {
      const m = line.match(NUMBERED) || line.match(BULLET);
      if (m) cur.items.push({ text: (m[2] ?? m[1]).trim(), line: i });
    }
  }
  return { focus: (data.focus ?? '').toString().trim(), sections };
}

// Readiness: checked items plus practiced stories, out of all check items plus stories.
export function prepStats(prep) {
  let done = 0;
  let total = 0;
  const groups = [];
  for (const s of prep?.sections ?? []) {
    if (s.kind !== 'check' && s.kind !== 'stories') continue;
    const d = s.items.filter((it) => (s.kind === 'stories' ? it.status === 'practiced' : it.done)).length;
    done += d;
    total += s.items.length;
    groups.push({ title: s.title, kind: s.kind, done: d, total: s.items.length });
  }
  return { done, total, groups };
}

// Writers find their target by section title and item text in the *current*
// file, not by a remembered line number, because Claude may have edited it since.
function locate(text, sectionTitle, match) {
  const lines = toLines(text);
  const section = findSection(lines, sectionTitle);
  if (!section) throw new Error(`Section "${sectionTitle}" not found in prep.md`);
  const parsed = parsePrep(text).sections.find((s) => s.title.toLowerCase() === sectionTitle.trim().toLowerCase());
  const item = parsed?.items.find(match);
  if (!item) throw new Error(`Item not found in "${sectionTitle}"`);
  return { lines, item, section, parsed };
}

export function setCheck(text, sectionTitle, itemText, done) {
  const { lines, item } = locate(text, sectionTitle, (it) => it.text === itemText);
  lines[item.line] = lines[item.line].replace(CHECK, (_, a, _x, b, rest) => `${a}${done ? 'x' : ' '}${b}${rest}`);
  return lines.join(eolOf(text));
}

export function setStoryStatus(text, sectionTitle, principle, status) {
  const { lines, item } = locate(text, sectionTitle, (it) => it.principle === principle);
  const m = lines[item.line].match(/^(\s*[-*]\s+)/);
  lines[item.line] = `${m[1]}${item.principle} :: ${item.story ? `${item.story} ` : ''}[${status}]`;
  return lines.join(eolOf(text));
}

export function addPrepItem(text, sectionTitle, itemText) {
  const eol = eolOf(text);
  const lines = toLines(text);
  const section = findSection(lines, sectionTitle);
  if (!section) throw new Error(`Section "${sectionTitle}" not found in prep.md`);
  const parsed = parsePrep(text).sections.find((s) => s.title.toLowerCase() === sectionTitle.trim().toLowerCase());
  const t = itemText.replace(/\r?\n/g, ' ').trim();
  let line;
  if (parsed.kind === 'stories') line = `- ${t} :: [none]`;
  else if (parsed.kind === 'list') line = `${parsed.items.length + 1}. ${t}`;
  else line = `- [ ] ${t}`;
  lines.splice(sectionInsertIndex(lines, section), 0, line);
  return lines.join(eol);
}

export function prepTemplate(focus = 'Set the date of your next step, then work down each list.') {
  return [
    '---',
    `focus: ${focus}`,
    '---',
    '',
    '## Assessment [check]',
    '> Check the invite or portal for an online assessment.',
    '- [ ] Find out if there is an online assessment and its deadline',
    '- [ ] Read the candidate or assessment guide',
    '- [ ] Take a practice version if one exists',
    '',
    '## Company values [stories]',
    '> Add each value from their careers site, then a STAR story for it.',
    '',
    '## Practice interviews [check] [mock]',
    '- [ ] Mock behavioral interview with Claude, 30 min',
    '- [ ] Say each story out loud in under 2 minutes',
    '- [ ] Numbers drill: cost per mile, on-time %, turnover, safety rate',
    '',
    '## Research [check]',
    '- [ ] Site or terminal facts: volume, fleet size, shifts',
    '- [ ] Recent company news',
    '- [ ] Reviews from drivers and managers',
    '',
    '## Questions to ask [list]',
    '1. How is this role measured in the first 90 days?',
    '',
  ].join('\n');
}
