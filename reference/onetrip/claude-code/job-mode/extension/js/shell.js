import * as storage from './storage.js';
import { ensureStructure } from './setup.js';
import { loadAll } from './repo.js';
import { todayISO, shortDate, weekday } from './dates.js';
import {
  sortPipeline, followUpsDue, eventsThisWeek, credentialsExpiring, syncAge, STAGES,
} from './model.js';
import { el, icon, ICONS, flagText, toast, initTheme, themeButton } from './ui.js';
import { STANDARD_FOLDERS } from './templates.js';

const SURFACE = document.body.dataset.surface;
const root = document.getElementById('app');
let state = { screen: 'loading', folderName: '', data: null, error: '' };

function render() {
  const view = {
    loading: () => el('div', { class: 'gate' }, el('p', { class: 'muted' }, 'Opening Career-Vault…')),
    unavailable: renderUnavailable,
    choose: renderChoose,
    reconnect: renderReconnect,
    home: renderHome,
  }[state.screen];
  root.replaceChildren(view());
}

function set(patch) {
  state = { ...state, ...patch };
  render();
}

function topbar(...right) {
  return el('header', { class: 'topbar' },
    el('div', { class: 'brand' }, icon(ICONS.logo, 22), 'Job mode'),
    el('div', { class: 'spacer' }),
    ...right,
    themeButton());
}

// ---------- Gate screens ----------

function renderUnavailable() {
  return el('div', {},
    topbar(),
    el('main', { class: 'gate' },
      el('h1', {}, 'Folder access is turned off'),
      el('p', {}, 'Brave needs one setting turned on before Job Mode can open your Career-Vault folder.'),
      el('ol', {},
        el('li', {}, 'Go to ', el('span', { class: 'mono' }, 'brave://flags/#file-system-access-api'), ' and set it to Enabled.'),
        el('li', {}, 'Quit Brave completely. If a Brave icon stays in the system tray, right-click it and choose Exit.'),
        el('li', {}, 'Reopen Brave and this page.'))));
}

function folderTree() {
  return el('pre', { class: 'tree' }, [
    'Career-Vault/',
    '  vault.md',
    '  searches.md',
    '  last-synced.txt      written by Claude',
    ...STANDARD_FOLDERS.map((f) => `  ${f}/`),
  ].join('\n'));
}

function renderChoose() {
  return el('div', {},
    topbar(),
    el('main', { class: 'gate' },
      el('h1', {}, 'Choose your Career-Vault folder'),
      el('p', {}, 'Job Mode keeps everything in one folder that OneDrive syncs. Pick that folder. Anything missing from the layout below gets created, and existing files are never overwritten.'),
      folderTree(),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'btn primary', onClick: choose }, icon(ICONS.folder), 'Choose folder')),
      state.error ? el('p', { class: 'error' }, state.error) : null));
}

function renderReconnect() {
  return el('div', {},
    topbar(),
    el('main', { class: 'gate' },
      el('h1', {}, 'Reopen Career-Vault'),
      el('p', {}, 'Brave asks again after a restart. One click gives Job Mode access to ',
        el('span', { class: 'mono' }, state.folderName), ' again.'),
      el('div', { class: 'actions' },
        el('button', { type: 'button', class: 'btn primary', onClick: reconnect }, icon(ICONS.folder), 'Reopen Career-Vault'),
        el('button', { type: 'button', class: 'btn link', onClick: choose }, 'Choose a different folder')),
      state.error ? el('p', { class: 'error' }, state.error) : null));
}

// ---------- Connection flow ----------

async function choose() {
  try {
    const name = await storage.connect();
    const looksRight = name.toLowerCase() === 'career-vault' || (await storage.exists('vault.md'));
    if (!looksRight && !confirm(`"${name}" isn't named Career-Vault and has no vault.md.\n\nSet it up as your Career-Vault anyway? The standard folders will be created inside it.`)) {
      await storage.forget();
      set({ screen: 'choose', error: 'Nothing was changed. Pick the Career-Vault folder.' });
      return;
    }
    await openVault(name);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    set({ error: err.message });
  }
}

async function reconnect() {
  try {
    const result = await storage.reconnect();
    if (result === 'granted') await openVault(state.folderName);
    else set({ error: 'Access was not allowed. Click Reopen and choose Allow.' });
  } catch (err) {
    set({ error: err.message });
  }
}

async function openVault(name) {
  const created = await ensureStructure();
  if (created.length) {
    const folders = created.filter((c) => c.endsWith('/')).length;
    const files = created.length - folders;
    toast(created.length <= 3
      ? `Created ${created.join(', ')}`
      : `Set up Career-Vault: created ${folders} folder${folders === 1 ? '' : 's'} and ${files} starter file${files === 1 ? '' : 's'}`);
  }
  await refresh(name);
}

async function refresh(name = state.folderName) {
  try {
    const data = await loadAll(todayISO());
    set({ screen: 'home', folderName: name, data, error: '' });
  } catch (err) {
    const s = await storage.status();
    if (s.state === 'prompt') set({ screen: 'reconnect', folderName: s.name, error: '' });
    else toast(`Couldn't read Career-Vault: ${err.message}`, { error: true });
  }
}

// ---------- Phase 1 home: a read-back of what the data layer found ----------

function fact(label, n, flagged = false) {
  return el('div', { class: `fact${flagged ? ' flagged' : ''}` }, el('span', { class: 'k' }, label), el('span', { class: 'n' }, String(n)));
}

function syncLine(lastSynced) {
  const age = syncAge(lastSynced);
  if (!lastSynced) {
    return el('div', { class: 'sync-line' }, icon(ICONS.sync), el('span', { class: 'muted' }, 'Last synced with Claude:'),
      flagText('Never. Ask Claude to run a sync.'));
  }
  const when = lastSynced.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return el('div', { class: 'sync-line' }, icon(ICONS.sync),
    el('span', { class: 'muted' }, 'Last synced with Claude:'),
    el('span', { class: 'mono' }, `${when} (${age.hours} h ago)`),
    age.stale ? flagText('Over a day old. Ask Claude to run a sync.') : null);
}

function renderHome() {
  const d = state.data;
  const today = d.today;
  const { active, closed } = sortPipeline(d.apps);
  const followUps = followUpsDue(d.apps);
  const events = eventsThisWeek(d.apps, today);
  const eventsToday = events.filter((a) => a.event.date === today);
  const creds = credentialsExpiring(d.credentials, today);
  const newLeads = d.leads.filter((l) => l.status === 'new');
  const vaultEntries = d.vault.sections.reduce((n, s) => n + s.entries.length, 0);
  const docCount = d.documents.reduce((n, f) => n + f.files.length, 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const summary = [
    `${plural(eventsToday.length, 'interview')} today, ${events.length} this week`,
    `${plural(followUps.length, 'follow-up')} due`,
    `${plural(creds.length, 'credential')} expiring within 90 days`,
    `${newLeads.length} new ${newLeads.length === 1 ? 'lead' : 'leads'}`,
  ].join(' · ');

  const dateTitle = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return el('div', {},
    topbar(
      SURFACE === 'panel'
        ? el('button', { type: 'button', class: 'btn', onClick: () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') }) }, icon(ICONS.external), 'Open full dashboard')
        : syncLine(d.lastSynced)),
    el('main', { class: 'page' },
      el('div', {},
        el('h1', {}, dateTitle),
        el('p', { class: 'summary' }, summary),
        SURFACE === 'panel' ? el('div', { style: 'margin-top:10px' }, syncLine(d.lastSynced)) : null),

      el('section', {},
        el('h2', {}, 'What Job Mode read from Career-Vault'),
        el('div', { class: 'facts' },
          fact('Active applications', active.length),
          fact('Closed (rejected or ghosted)', closed.length),
          fact('Follow-ups due', followUps.length, followUps.length > 0),
          fact('Interviews this week', events.length),
          fact('New leads', newLeads.length),
          fact('Credentials expiring', creds.length, creds.length > 0),
          fact('Saved searches', d.searches.length),
          fact('Vault entries', vaultEntries),
          fact('Document files', docCount),
          fact('Resumes', d.resumes.length))),

      events.length ? el('section', {},
        el('h2', {}, 'Interviews and assessments this week'),
        el('ul', { class: 'rows' }, events.map((a) => el('li', {},
          el('span', { class: 'when' }, `${weekday(a.event.date)} ${shortDate(a.event.date)} ${a.event.time}`),
          el('strong', {}, a.company), el('span', { class: 'muted' }, `${a.event.kind || STAGES[a.effective].label}`))))) : null,

      followUps.length ? el('section', {},
        el('h2', {}, 'Follow-ups due'),
        el('ul', { class: 'rows' }, followUps.map((a) => el('li', {},
          el('span', { class: 'when' }, `${a.days} days silent`),
          el('strong', {}, a.company), el('span', { class: 'muted' }, a.role))))) : null,

      d.apps.length === 0 ? el('p', { class: 'muted' }, 'No applications yet. Add your first one.') : null,

      d.brokenApps.length ? el('section', {},
        el('h2', {}, 'Folders Job Mode couldn\'t read'),
        el('ul', { class: 'rows' }, d.brokenApps.map((a) => el('li', {}, el('span', { class: 'mono' }, a.folder), el('span', { class: 'error' }, a.error))))) : null,

      el('div', { class: 'gate actions', style: 'margin:0;padding:0;flex-direction:row' },
        el('button', { type: 'button', class: 'btn', onClick: async () => { await refresh(); toast('Reloaded from Career-Vault'); } }, icon(ICONS.sync), 'Reload'),
        el('span', { class: 'faint mono' }, `Connected: ${state.folderName}`),
        el('button', { type: 'button', class: 'btn link', onClick: choose }, 'Change folder')),

      el('p', { class: 'faint' }, 'Phase 1 check screen. The full Today, Pipeline, and other views arrive in Phase 2.')));
}

// ---------- Boot ----------

async function boot() {
  await initTheme(render);
  const s = await storage.status();
  if (s.state === 'unavailable') return set({ screen: 'unavailable' });
  if (s.state === 'none') return set({ screen: 'choose' });
  if (s.state === 'prompt') return set({ screen: 'reconnect', folderName: s.name });
  try {
    await openVault(s.name);
  } catch (err) {
    set({ screen: 'choose', error: err.message });
  }
}

// Claude or the other surface may have written files while this one was hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.screen === 'home') refresh();
});

boot();
