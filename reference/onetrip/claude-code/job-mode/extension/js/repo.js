// Loads the whole vault and performs every write. Each write re-reads the file
// right before changing it (mutate), so an edit Claude or Dan made a moment ago
// is kept instead of being overwritten by a stale copy held in memory.
import * as storage from './storage.js';
import { todayISO } from './dates.js';
import { parseApp, appendLog, setAppFields, newAppText } from './format-app.js';
import { parsePrep, setCheck, setStoryStatus, addPrepItem, prepTemplate } from './format-prep.js';
import { parseVault, credentials } from './format-vault.js';
import { parseSearches } from './format-searches.js';
import { parseLeads, setLeadStatus as setLeadLine, addLead as addLeadLine, parseLastSynced } from './format-leads.js';
import {
  STAGES, decorateApp, effectiveStatus, statusUpdates, applicationFolderName, expiryFromFilename, normalizeUrl,
} from './model.js';
import { DOCUMENT_FOLDERS } from './templates.js';

export const APPS_DIR = '06-Applications';
export const LEADS_PATH = '07-Leads/leads.md';

async function mutate(path, fn) {
  const before = await storage.read(path);
  const after = fn(before);
  if (after !== before) await storage.write(path, after);
  return after;
}

async function loadApp(folder, today) {
  const base = `${APPS_DIR}/${folder}`;
  const [appText, prepText, postingExists] = await Promise.all([
    storage.readIfExists(`${base}/app.md`),
    storage.readIfExists(`${base}/prep.md`),
    storage.exists(`${base}/posting.md`),
  ]);
  if (appText === null) return null;
  const app = parseApp(appText);
  return decorateApp({
    ...app,
    folder,
    path: base,
    prep: prepText === null ? null : parsePrep(prepText),
    hasPosting: postingExists,
  }, today);
}

export async function loadApps(today = todayISO()) {
  if (!(await storage.exists(APPS_DIR))) return [];
  const dirs = (await storage.list(APPS_DIR)).filter((e) => e.kind === 'directory');
  const apps = await Promise.all(dirs.map((d) => loadApp(d.name, today).catch((err) => ({ folder: d.name, error: err.message }))));
  return apps.filter(Boolean);
}

export async function loadDocuments(today = todayISO()) {
  return Promise.all(DOCUMENT_FOLDERS.map(async (folder) => {
    const entries = (await storage.exists(folder)) ? await storage.list(folder) : [];
    const files = entries.filter((e) => e.kind === 'file' && !e.name.startsWith('.') && !e.name.startsWith('~$'));
    return {
      folder,
      files: files.map((f) => ({ name: f.name, path: `${folder}/${f.name}`, expires: expiryFromFilename(f.name) })),
      today,
    };
  }));
}

export async function loadAll(today = todayISO()) {
  const [apps, vaultText, searchesText, leadsText, syncedText, documents] = await Promise.all([
    loadApps(today),
    storage.readIfExists('vault.md'),
    storage.readIfExists('searches.md'),
    storage.readIfExists(LEADS_PATH),
    storage.readIfExists('last-synced.txt'),
    loadDocuments(today),
  ]);
  const vault = parseVault(vaultText ?? '');
  const resumes = documents.find((d) => d.folder === '04-Resumes')?.files ?? [];
  return {
    today,
    apps: apps.filter((a) => !a.error),
    brokenApps: apps.filter((a) => a.error),
    vault,
    credentials: credentials(vault),
    searches: parseSearches(searchesText ?? ''),
    leads: parseLeads(leadsText ?? ''),
    lastSynced: parseLastSynced(syncedText),
    documents,
    resumes,
  };
}

// ---------- Applications ----------

export async function createApplication(input, today = todayISO()) {
  const company = input.company.trim();
  const role = input.role.trim();
  if (!company || !role) throw new Error('Company and role are required.');
  const base = applicationFolderName(today, company, role);
  let folder = base;
  for (let n = 2; await storage.exists(`${APPS_DIR}/${folder}`); n++) folder = `${base}-${n}`;
  const fields = {
    company,
    role,
    location: input.location ?? '',
    source: input.source ?? 'Other',
    date_applied: today,
    status: 'applied',
    reached: 'applied',
    keep_active: false,
    last_contact: today,
    posting_url: input.postingUrl ?? '',
    portal_url: input.portalUrl ?? '',
    portal_login: input.portalLogin ?? '',
    resume_version: input.resumeVersion ?? '',
    contact_name: '',
    contact_email: '',
    next_action: 'Confirm the application landed in the portal.',
    next_action_date: '',
  };
  const path = `${APPS_DIR}/${folder}`;
  await storage.mkdir(path);
  await storage.write(`${path}/app.md`, newAppText(fields, { date: today, who: 'manual', text: input.logText ?? 'Application added.' }));
  if (input.postingMarkdown) await storage.write(`${path}/posting.md`, input.postingMarkdown);
  return { folder, path: `${path}/` };
}

export async function setStatus(folder, next, today = todayISO()) {
  if (!STAGES[next]) throw new Error(`Unknown stage: ${next}`);
  let message = '';
  await mutate(`${APPS_DIR}/${folder}/app.md`, (text) => {
    const app = parseApp(text);
    const prev = effectiveStatus(app, today).status;
    if (prev === next && app.status === next) return text;
    message = `Moved from ${STAGES[prev].label} to ${STAGES[next].label}.`;
    return appendLog(setAppFields(text, statusUpdates(app, next)), { date: today, who: 'manual', text: message });
  });
  return message;
}

export async function keepActive(folder, today = todayISO()) {
  await mutate(`${APPS_DIR}/${folder}/app.md`, (text) => appendLog(
    setAppFields(text, { keep_active: true }),
    { date: today, who: 'manual', text: 'Kept active after the 30-day auto-move to Ghosted.' },
  ));
}

// Manual log entries reset the silence clock (last_contact), per the brief.
export async function addManualLog(folder, entryText, today = todayISO()) {
  const t = entryText.trim();
  if (!t) return;
  await mutate(`${APPS_DIR}/${folder}/app.md`, (text) => appendLog(
    setAppFields(text, { last_contact: today }),
    { date: today, who: 'manual', text: t },
  ));
}

export async function logFollowUp(folder, today = todayISO()) {
  await addManualLog(folder, 'Follow-up sent.', today);
}

export async function updateAppFields(folder, updates) {
  await mutate(`${APPS_DIR}/${folder}/app.md`, (text) => setAppFields(text, updates));
}

// ---------- Prep ----------

export async function startPrep(folder, focus) {
  const path = `${APPS_DIR}/${folder}/prep.md`;
  if (await storage.exists(path)) throw new Error('prep.md already exists.');
  await storage.write(path, prepTemplate(focus));
}

export async function togglePrepCheck(folder, section, itemText, done) {
  await mutate(`${APPS_DIR}/${folder}/prep.md`, (text) => setCheck(text, section, itemText, done));
}

export async function setPrepStoryStatus(folder, section, principle, status) {
  await mutate(`${APPS_DIR}/${folder}/prep.md`, (text) => setStoryStatus(text, section, principle, status));
}

export async function addPrepEntry(folder, section, itemText) {
  await mutate(`${APPS_DIR}/${folder}/prep.md`, (text) => addPrepItem(text, section, itemText));
}

// ---------- Leads ----------

export async function setLeadStatus(id, status, reason = '') {
  await mutate(LEADS_PATH, (text) => setLeadLine(text, id, status, reason));
}

export async function addLead(lead, today = todayISO()) {
  if (!(await storage.exists(LEADS_PATH))) await storage.write(LEADS_PATH, '# Leads\n');
  await mutate(LEADS_PATH, (text) => addLeadLine(text, { date: today, who: 'manual', status: 'new', ...lead }));
}

// ---------- Duplicate check for the side panel ----------

export function findSaved(url, data) {
  const key = normalizeUrl(url);
  if (!key) return null;
  const app = data.apps.find((a) => a.postingUrl && normalizeUrl(a.postingUrl) === key);
  if (app) return { kind: 'app', app };
  const lead = data.leads.find((l) => l.url && normalizeUrl(l.url) === key);
  if (lead) return { kind: 'lead', lead };
  return null;
}
