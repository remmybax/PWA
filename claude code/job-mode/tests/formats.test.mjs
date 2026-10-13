import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, setFrontmatter, blankComments } from '../extension/js/frontmatter.js';
import { parseApp, appendLog, newAppText } from '../extension/js/format-app.js';
import { parsePrep, prepStats, setCheck, setStoryStatus, addPrepItem, prepTemplate } from '../extension/js/format-prep.js';
import { parseVault, credentials, fieldLabel, copyAllText } from '../extension/js/format-vault.js';
import { parseSearches } from '../extension/js/format-searches.js';
import { parseLeads, setLeadStatus, addLead, parseLastSynced } from '../extension/js/format-leads.js';
import {
  decorateApp, effectiveStatus, statusUpdates, expiryFromFilename, expiryState, applicationFolderName,
  eventsThisWeek, sourceFromUrl, normalizeUrl,
} from '../extension/js/model.js';
import { VAULT_TEMPLATE, SEARCHES_TEMPLATE, LEADS_TEMPLATE } from '../extension/js/templates.js';
import { weekEnd } from '../extension/js/dates.js';

const APP_MD = `---
company: Example Freight Co
role: Fleet Manager
location: Midland, TX
source: Indeed            # LinkedIn | Indeed | Glassdoor | Handshake | Company site | Referral | Other
date_applied: 2026-09-23
status: applied           # applied | screening | interview | offer | rejected | ghosted
reached: applied          # furthest active stage reached (kept when closed)
keep_active: false        # true = user overrode the 30-day auto-ghost
last_contact: 2026-09-23
posting_url: https://example.com/jobs/1#apply
portal_url: https://...
portal_login: email used for this portal
resume_version: Fleet
contact_name:
contact_email:
next_action: Follow up with recruiter
next_action_date: 2026-10-03
event_date:               # next interview or assessment deadline, YYYY-MM-DD
event_time:               # e.g. 10:00 AM
event_kind:               # e.g. Panel interview, Online assessment due
event_where:              # e.g. Video, link in invite
claude_note: something Claude added that the app doesn't know about
---

## Log
- 2026-09-23 [manual] Applied via company site.
- 2026-09-25 [claude] Confirmation email received from ATS.

## Notes
Dan's own notes. Must survive every write.
`;

const PREP_MD = `---
focus: Online assessment due Sat, Sep 26 at 11:59 PM.
---

## Online assessment [check]
> Two parts, about 90 minutes.
- [x] Read the candidate assessment guide | https://example.com/guide
- [ ] Part 2: Work simulation | ~70 min

## Leadership principles [stories]
> One STAR story per principle, with a number in every result.
- Customer first :: Rerouted 14 loads around a highway closure. Zero missed windows. [practiced]
- Hit the number :: [none]

## Practice interviews [check] [mock]
- [x] Mock behavioral interview with Claude, 30 min | Sep 21

## Questions to ask [list]
1. How is this role measured in the first 90 days?
`;

const LEADS_MD = `- 2026-09-23 [claude] new | Example Freight Co | Fleet Manager | Knoxville, TN | Indeed | https://a.example/1
- 2026-09-22 [manual] passed | Other Co | Terminal Manager | Norfolk, VA | LinkedIn | https://b.example/2 | too far from port
- 2026-09-21 [claude] applied | Third Co | Ops Manager | Paducah, KY | Glassdoor | https://c.example/3
`;

// Every line that isn't in `changed` must come through untouched.
function assertOnlyLinesChanged(before, after, changedCount) {
  const a = before.split('\n');
  const b = after.split('\n');
  const setB = new Map();
  b.forEach((l) => setB.set(l, (setB.get(l) ?? 0) + 1));
  let missing = 0;
  for (const l of a) {
    if (setB.get(l)) setB.set(l, setB.get(l) - 1);
    else missing++;
  }
  assert.equal(missing, changedCount, `expected ${changedCount} changed line(s), got ${missing}`);
}

test('frontmatter: parses values, strips inline comments, keeps # inside URLs', () => {
  const { data } = parseFrontmatter(APP_MD);
  assert.equal(data.source, 'Indeed');
  assert.equal(data.status, 'applied');
  assert.equal(data.posting_url, 'https://example.com/jobs/1#apply');
  assert.equal(data.event_date, '');
  assert.equal(data.claude_note, "something Claude added that the app doesn't know about");
});

test('frontmatter: setting keys keeps comments aligned and every other line identical', () => {
  const out = setFrontmatter(APP_MD, { status: 'interview', reached: 'interview' });
  assert.match(out, /^status: interview {9}# applied \| screening/m);
  assert.match(out, /^reached: interview {8}# furthest active stage/m);
  assertOnlyLinesChanged(APP_MD, out, 2);
  assert.equal(parseFrontmatter(out).data.status, 'interview');
});

test('frontmatter: new keys go before the closing fence; values needing quotes are quoted', () => {
  const out = setFrontmatter(APP_MD, { new_key: 'Note: has a colon # and hash' });
  const { data } = parseFrontmatter(out);
  assert.equal(data.new_key, 'Note: has a colon # and hash');
  assertOnlyLinesChanged(APP_MD, out, 0);
  assert.equal(parseFrontmatter('---\nk: "a # b"   # trailing comment\n---\n').data.k, 'a # b');
  const kept = setFrontmatter('---\nk: "a # b"   # trailing comment\n---\n', { k: 'plain' });
  assert.match(kept, /^k: plain {5}# trailing comment$/m);
});

test('frontmatter: CRLF files stay CRLF', () => {
  const crlf = APP_MD.replace(/\n/g, '\r\n');
  const out = setFrontmatter(crlf, { status: 'offer' });
  assert.ok(!/[^\r]\n/.test(out), 'found a bare LF');
});

test('app.md: parses fields and log', () => {
  const app = parseApp(APP_MD);
  assert.equal(app.company, 'Example Freight Co');
  assert.equal(app.keepActive, false);
  assert.equal(app.log.length, 2);
  assert.deepEqual(app.log.map((l) => l.who), ['manual', 'claude']);
});

test('app.md: appendLog adds to the end of ## Log, not after ## Notes', () => {
  const out = appendLog(APP_MD, { date: '2026-09-26', who: 'manual', text: 'Follow-up sent.' });
  const lines = out.split('\n');
  const logAt = lines.indexOf('- 2026-09-26 [manual] Follow-up sent.');
  assert.equal(lines[logAt - 1], '- 2026-09-25 [claude] Confirmation email received from ATS.');
  assert.ok(logAt < lines.indexOf('## Notes'));
  assertOnlyLinesChanged(APP_MD, out, 0);
  assert.equal(parseApp(out).log.length, 3);
});

test('app.md: appendLog creates ## Log when missing', () => {
  const out = appendLog('---\ncompany: X\n---\n', { date: '2026-09-26', who: 'manual', text: 'hi' });
  assert.equal(parseApp(out).log.length, 1);
});

test('app.md: newAppText round-trips', () => {
  const text = newAppText({ company: 'Acme, Inc.', role: 'Terminal Manager', status: 'applied', keep_active: false }, { date: '2026-09-23', who: 'manual', text: 'Application added.' });
  const app = parseApp(text);
  assert.equal(app.company, 'Acme, Inc.');
  assert.equal(app.role, 'Terminal Manager');
  assert.equal(app.log[0].text, 'Application added.');
});

test('prep.md: parses sections, notes, links, meta, stories, list', () => {
  const p = parsePrep(PREP_MD);
  assert.equal(p.focus, 'Online assessment due Sat, Sep 26 at 11:59 PM.');
  assert.deepEqual(p.sections.map((s) => s.kind), ['check', 'stories', 'check', 'list']);
  assert.equal(p.sections[0].note, 'Two parts, about 90 minutes.');
  assert.equal(p.sections[0].items[0].link, 'https://example.com/guide');
  assert.equal(p.sections[0].items[1].meta, '~70 min');
  assert.equal(p.sections[1].items[0].status, 'practiced');
  assert.equal(p.sections[1].items[1].status, 'none');
  assert.equal(p.sections[1].items[1].story, '');
  assert.equal(p.sections[2].mock, true);
  assert.equal(p.sections[3].items[0].text, 'How is this role measured in the first 90 days?');
});

test('prep.md: readiness counts checks + practiced stories, not lists', () => {
  const s = prepStats(parsePrep(PREP_MD));
  assert.equal(s.done, 3);
  assert.equal(s.total, 5);
});

test('prep.md: toggling a check changes only that line', () => {
  const out = setCheck(PREP_MD, 'Online assessment', 'Part 2: Work simulation', true);
  assert.match(out, /- \[x\] Part 2: Work simulation \| ~70 min/);
  assertOnlyLinesChanged(PREP_MD, out, 1);
});

test('prep.md: story status and add item', () => {
  let out = setStoryStatus(PREP_MD, 'Leadership principles', 'Customer first', 'drafted');
  assert.match(out, /- Customer first :: Rerouted 14 loads .* \[drafted\]/);
  assertOnlyLinesChanged(PREP_MD, out, 1);
  out = addPrepItem(PREP_MD, 'Questions to ask', 'What does a normal week look like?');
  assert.match(out, /^2\. What does a normal week look like\?$/m);
  out = addPrepItem(out, 'Leadership principles', 'Ownership');
  assert.equal(parsePrep(out).sections[1].items[2].principle, 'Ownership');
  out = addPrepItem(out, 'Online assessment', 'Block 90 minutes');
  assert.equal(parsePrep(out).sections[0].items.length, 3);
});

test('prep.md: default template parses to the brief sections', () => {
  const p = parsePrep(prepTemplate());
  assert.deepEqual(p.sections.map((s) => `${s.title}:${s.kind}`), [
    'Assessment:check', 'Company values:stories', 'Practice interviews:check', 'Research:check', 'Questions to ask:list',
  ]);
  assert.equal(p.sections[2].mock, true);
  assert.equal(prepStats(p).total, 9);
});

test('vault.md: template has six sections and the commented examples are ignored', () => {
  const v = parseVault(VAULT_TEMPLATE);
  assert.deepEqual(v.sections.map((s) => s.name), ['Personal contact', 'Employment', 'Credentials', 'Education', 'References', 'Stock answers']);
  assert.ok(v.sections.every((s) => s.entries.length === 0));
});

test('vault.md: entries, spans, dates, credentials, continuation lines', () => {
  const v = parseVault(`## Employment
### Example Crude Transport LLC
dates: 03/2026 – present
legal_name {wide}: Example Crude Transport LLC
phone: (432) 555-0190
reason_for_leaving {full}: Currently employed.

## Credentials
### DOT medical card
expires: 2026-11-14
file: 02-Credentials/DOT-Medical-Card_exp2026-11.pdf

## Stock answers
### Why are you looking?
answer {full}: First line.
Second line of the same answer.
`);
  const e = v.sections[0].entries[0];
  assert.equal(e.dates, '03/2026 – present');
  assert.equal(e.fields[0].span, 'wide');
  assert.equal(e.fields[0].label, 'Legal name');
  assert.equal(e.fields[2].span, 'full');
  assert.equal(credentials(v)[0].expires, '2026-11-14');
  assert.equal(v.sections[2].entries[0].fields[0].value, 'First line.\nSecond line of the same answer.');
  assert.match(copyAllText(e), /^Example Crude Transport LLC \(03\/2026 – present\)\nLegal name: Example Crude Transport LLC/);
  assert.equal(fieldLabel('cdl_last4'), 'CDL last 4');
});

test('searches.md: seeded file parses to four searches', () => {
  const s = parseSearches(SEARCHES_TEMPLATE);
  assert.equal(s.length, 4);
  assert.equal(s[0].label, 'Fleet Manager · Knoxville');
  assert.equal(s[0].radius, '50');
  assert.deepEqual(s[0].sites, ['linkedin', 'indeed', 'glassdoor', 'handshake']);
  assert.equal(s[3].radius, '');
});

test('leads.md: parse, status change touches one line, add goes on top', () => {
  const leads = parseLeads(LEADS_MD);
  assert.equal(leads.length, 3);
  assert.equal(leads[1].reason, 'too far from port');
  let out = setLeadStatus(LEADS_MD, leads[0].id, 'passed', 'pay too low');
  assert.match(out.split('\n')[0], /^- 2026-09-23 \[claude\] passed \| Example Freight Co .* \| pay too low$/);
  assertOnlyLinesChanged(LEADS_MD, out, 1);
  out = addLead(LEADS_MD, { date: '2026-09-24', company: 'New Co', role: 'Fleet Manager', location: 'Knoxville, TN', source: 'LinkedIn', url: 'https://d.example/4' });
  assert.equal(parseLeads(out)[0].company, 'New Co');
  assert.equal(parseLeads(LEADS_TEMPLATE).length, 0);
  assert.equal(parseLeads(addLead(LEADS_TEMPLATE, { date: '2026-09-24', company: 'A', role: 'B' })).length, 1);
});

test('last-synced.txt', () => {
  assert.equal(parseLastSynced('2026-09-23T14:00:00-05:00\n').toISOString(), '2026-09-23T19:00:00.000Z');
  assert.equal(parseLastSynced(''), null);
  assert.equal(parseLastSynced('garbage'), null);
});

test('model: auto-ghost at 30 days unless keep_active; follow-up at 10', () => {
  const base = parseApp(APP_MD);
  const at = (last, keep = false) => decorateApp({ ...base, lastContact: last, keepActive: keep, status: 'screening' }, '2026-10-30');
  assert.equal(at('2026-10-25').followUpDue, false);
  assert.equal(at('2026-10-20').followUpDue, true);
  assert.equal(at('2026-09-30').effective, 'ghosted');
  assert.equal(at('2026-09-30').autoGhosted, true);
  assert.equal(at('2026-09-30', true).effective, 'screening');
  assert.equal(effectiveStatus({ ...base, status: 'rejected', lastContact: '2026-01-01' }, '2026-10-30').auto, false);
});

test('model: status updates keep reached as the furthest stage', () => {
  assert.deepEqual(statusUpdates({ reached: 'screening' }, 'interview'), { status: 'interview', keep_active: true, reached: 'interview' });
  assert.deepEqual(statusUpdates({ reached: 'interview' }, 'screening'), { status: 'screening', keep_active: true });
  assert.deepEqual(statusUpdates({ reached: 'interview' }, 'rejected'), { status: 'rejected' });
});

test('model: expiry from filename, folder names, week end, sources, url matching', () => {
  assert.equal(expiryFromFilename('CDL_front_exp2028-03.pdf'), '2028-03-31');
  assert.equal(expiryFromFilename('OSHA-30-Card.pdf'), null);
  assert.equal(expiryState('2026-11-14', '2026-09-23').flag, true);
  assert.equal(expiryState('2026-09-01', '2026-09-23').label, 'Expired');
  assert.equal(applicationFolderName('2026-09-23', 'Example Freight Co', 'Fleet Manager'), '2026-09-23_ExampleFreightCo_FleetManager');
  assert.equal(weekEnd('2026-09-23'), '2026-09-27');
  assert.equal(weekEnd('2026-09-27'), '2026-09-27');
  assert.equal(sourceFromUrl('https://www.linkedin.com/jobs/view/123'), 'LinkedIn');
  assert.equal(normalizeUrl('https://www.Indeed.com/viewjob?jk=1&from=serp#x'), normalizeUrl('https://www.indeed.com/viewjob?jk=1'));
});

test('model: events this week sorted by date then time', () => {
  const mk = (date, time) => ({ active: true, event: { date, time } });
  const out = eventsThisWeek([mk('2026-09-24', '1:00 PM'), mk('2026-09-24', '10:00 AM'), mk('2026-09-30', '9:00 AM'), mk('2026-09-23', '12:00 PM')], '2026-09-23');
  assert.deepEqual(out.map((a) => `${a.event.date} ${a.event.time}`), ['2026-09-23 12:00 PM', '2026-09-24 10:00 AM', '2026-09-24 1:00 PM']);
});

test('blankComments keeps line count', () => {
  const lines = ['a', '<!-- x', 'y', '-->b', 'c <!-- d --> e'];
  assert.deepEqual(blankComments(lines), ['a', '', '', 'b', 'c  e']);
});
