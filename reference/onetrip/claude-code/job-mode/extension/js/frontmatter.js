// Line-based frontmatter and section editing. Deliberately not a YAML library:
// a YAML round-trip would drop the inline "# applied | screening" comments and
// reorder keys that Dan and Claude edit by hand. Every edit here touches only the
// lines it has to and leaves everything else byte-for-byte.

const FENCE = /^---\s*$/;
const KEY_LINE = /^([A-Za-z0-9_]+)[ \t]*:(.*)$/;

export function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export function toLines(text) {
  return text.split(/\r?\n/);
}

function fenceRange(lines) {
  if (!FENCE.test(lines[0] ?? '')) return null;
  for (let i = 1; i < lines.length; i++) if (FENCE.test(lines[i])) return { start: 0, end: i };
  return null;
}

// Splits "value   # comment" the way YAML does: a # only starts a comment after whitespace.
function splitComment(rest) {
  const lead = rest.length - rest.trimStart().length;
  const q = rest[lead];
  if (q === '"' || q === "'") {
    let i = lead + 1;
    while (i < rest.length && !(rest[i] === q && rest[i - 1] !== '\\')) i++;
    const after = rest.slice(i + 1);
    const m = after.match(/[ \t]#/);
    if (!m) return { value: rest.trim(), comment: null, commentCol: -1 };
    const at = i + 1 + m.index + 1;
    return { value: rest.slice(0, at).trim(), comment: rest.slice(at), commentCol: at };
  }
  const m = rest.match(/(^|[ \t])#/);
  if (!m) return { value: rest.trim(), comment: null, commentCol: -1 };
  const at = m.index + m[1].length;
  return { value: rest.slice(0, at).trim(), comment: rest.slice(at), commentCol: at };
}

function unquote(v) {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

export function formatValue(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\r?\n/g, ' ').trim();
  if (s === '') return '';
  if (/^[\s"'[\]{}&*!|>%@`#]|: |[ \t]#/.test(s)) return JSON.stringify(s);
  return s;
}

export function parseFrontmatter(text) {
  const lines = toLines(text);
  const range = fenceRange(lines);
  const data = {};
  if (!range) return { data, body: text, bodyStartLine: 0 };
  for (let i = range.start + 1; i < range.end; i++) {
    const m = lines[i].match(KEY_LINE);
    if (!m) continue;
    data[m[1]] = unquote(splitComment(m[2]).value);
  }
  return { data, body: lines.slice(range.end + 1).join('\n'), bodyStartLine: range.end + 1 };
}

// Sets keys in place, keeping each line's inline comment at its original column.
// Keys that don't exist yet are added just before the closing fence.
export function setFrontmatter(text, updates) {
  const eol = eolOf(text);
  const lines = toLines(text);
  let range = fenceRange(lines);
  if (!range) {
    lines.unshift('---', '---');
    range = { start: 0, end: 1 };
  }
  for (const [key, raw] of Object.entries(updates)) {
    const value = formatValue(raw);
    let found = false;
    for (let i = range.start + 1; i < range.end; i++) {
      const m = lines[i].match(KEY_LINE);
      if (!m || m[1] !== key) continue;
      const { comment, commentCol } = splitComment(m[2]);
      let line = value === '' ? `${key}:` : `${key}: ${value}`;
      if (comment) {
        const col = key.length + 1 + commentCol;
        line = line.padEnd(Math.max(col, line.length + 2)) + comment;
      }
      lines[i] = line;
      found = true;
      break;
    }
    if (!found) {
      lines.splice(range.end, 0, value === '' ? `${key}:` : `${key}: ${value}`);
      range.end++;
    }
  }
  return lines.join(eol);
}

// Finds "## Title" sections. Matching ignores case and any [tags] after the title.
export function headingTitle(line) {
  const m = line.match(/^##[ \t]+(.*?)[ \t]*$/);
  if (!m || line.startsWith('###')) return null;
  return m[1];
}

export function stripTags(title) {
  return title.replace(/\s*\[[^\]]*\]/g, '').trim();
}

export function findSection(lines, title) {
  const want = title.trim().toLowerCase();
  for (let i = 0; i < lines.length; i++) {
    const h = headingTitle(lines[i]);
    if (h === null || stripTags(h).toLowerCase() !== want) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (headingTitle(lines[j]) !== null || /^#[ \t]/.test(lines[j])) { end = j; break; }
    }
    return { start: i, end };
  }
  return null;
}

// Index just past the last non-blank line of a section, so new lines hug the
// existing list instead of landing after trailing blank lines.
export function sectionInsertIndex(lines, section) {
  let at = section.start + 1;
  for (let i = section.start + 1; i < section.end; i++) if (lines[i].trim() !== '') at = i + 1;
  return at;
}

// Removes <!-- --> comments while keeping line numbers stable (each comment
// line becomes an empty line), so parsed line indexes still match the file.
export function blankComments(lines) {
  const out = [];
  let inComment = false;
  for (const line of lines) {
    let rest = line;
    let kept = '';
    while (rest.length) {
      if (inComment) {
        const close = rest.indexOf('-->');
        if (close < 0) { rest = ''; break; }
        rest = rest.slice(close + 3);
        inComment = false;
      } else {
        const open = rest.indexOf('<!--');
        if (open < 0) { kept += rest; break; }
        kept += rest.slice(0, open);
        rest = rest.slice(open + 4);
        inComment = true;
      }
    }
    out.push(kept);
  }
  return out;
}
