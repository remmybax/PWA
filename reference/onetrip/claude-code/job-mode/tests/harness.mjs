// Seeds a sample Career-Vault in the browser's private file system (OPFS),
// registers it as the saved handle, then boots the real shell.js.
// ?surface=panel renders the side panel layout; ?fresh=1 starts from an empty folder.
import { addDays, todayISO } from '../extension/js/dates.js';
import { newAppText } from '../extension/js/format-app.js';
import { prepTemplate } from '../extension/js/format-prep.js';

const params = new URLSearchParams(location.search);
if (params.get('surface')) document.body.dataset.surface = params.get('surface');

const T = todayISO();

async function writeFile(dir, path, text) {
  const parts = path.split('/');
  let d = dir;
  for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
  const fh = await d.getFileHandle(parts.at(-1), { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

function app(company, role, status, lastContact, extra = {}) {
  return newAppText({
    company, role, location: 'Knoxville, TN', source: 'Indeed', date_applied: addDays(T, -35),
    status, reached: status, keep_active: false, last_contact: lastContact, ...extra,
  }, { date: addDays(T, -35), who: 'manual', text: 'Applied.' });
}

async function seed(rootDir) {
  const base = '06-Applications';
  await writeFile(rootDir, `${base}/A_Caprock_FleetManager/app.md`, app('Caprock Freight Lines', 'Fleet Manager', 'interview', addDays(T, -2), {
    event_date: addDays(T, 1), event_time: '10:00 AM', event_kind: 'Panel interview', event_where: 'Video',
  }));
  await writeFile(rootDir, `${base}/A_Caprock_FleetManager/prep.md`, prepTemplate());
  await writeFile(rootDir, `${base}/B_Ridgeline_TerminalManager/app.md`, app('Ridgeline Logistics', 'Terminal Manager', 'screening', addDays(T, -14)));
  await writeFile(rootDir, `${base}/C_Old_OpsManager/app.md`, app('Old Silent Co', 'Ops Manager', 'applied', addDays(T, -40)));
  await writeFile(rootDir, `${base}/D_Nope_FleetManager/app.md`, app('Nope Carriers', 'Fleet Manager', 'rejected', addDays(T, -5)));
  await writeFile(rootDir, '07-Leads/leads.md', `# Leads\n\n- ${T} [claude] new | Lead One | Fleet Manager | Knoxville, TN | Indeed | https://x.example/1\n- ${T} [manual] passed | Lead Two | Ops | Norfolk, VA | LinkedIn | https://x.example/2 | too far\n`);
  await writeFile(rootDir, 'vault.md', `## Credentials\n### DOT medical card\nexpires: ${addDays(T, 50)}\nfile: 02-Credentials/DOT_exp2026-11.pdf\n\n## Employment\n### Sample Co\ndates: 2020 – present\ntitle: Driver\n`);
  await writeFile(rootDir, '04-Resumes/Resume_Fleet_v4.pdf', 'x');
  await writeFile(rootDir, 'last-synced.txt', new Date(Date.now() - 30 * 36e5).toISOString());
}

async function saveHandle(handle) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('jobmode', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(handle, 'career-vault');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

const opfs = await navigator.storage.getDirectory();
for await (const [name] of opfs.entries()) await opfs.removeEntry(name, { recursive: true });
const vault = await opfs.getDirectoryHandle('Career-Vault', { create: true });
if (!params.get('fresh')) await seed(vault);
await saveHandle(vault);
window.__vault = vault;

await import('../extension/js/shell.js');
