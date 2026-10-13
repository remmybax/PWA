const SURFACE = document.body.dataset.surface;
const $ = (id) => document.getElementById(id);

// ---------- IndexedDB: one store, one key, holding the directory handle ----------
function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('jobmode-spike', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('handles').objectStore('handles').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------- Shared log in chrome.storage.local so both surfaces and restarts see it ----------
async function getLog() {
  return (await chrome.storage.local.get('log')).log || [];
}
async function log(step, ok, detail) {
  const entries = await getLog();
  entries.push({ at: new Date().toISOString(), surface: SURFACE, step, ok, detail });
  await chrome.storage.local.set({ log: entries });
}
async function renderLog() {
  const entries = await getLog();
  const ol = $('log');
  ol.replaceChildren(
    ...entries.map((e) => {
      const li = document.createElement('li');
      li.className = e.ok ? 'pass' : 'fail';
      li.textContent = `${e.ok ? 'PASS' : 'FAIL'}  ${e.step}  [${e.surface}]  ${e.at}\n${e.detail}`;
      return li;
    })
  );
}
chrome.storage.onChanged.addListener((changes) => {
  if (changes.log) renderLog();
});

// ---------- Environment ----------
let envText = '';
async function describeEnv() {
  const lines = [];
  lines.push(`Page: ${SURFACE}`);
  lines.push(`Brave detected: ${navigator.brave ? 'yes' : 'no'}`);
  try {
    const hi = await navigator.userAgentData.getHighEntropyValues(['fullVersionList', 'platformVersion']);
    lines.push(`Browser: ${hi.fullVersionList.map((b) => `${b.brand} ${b.version}`).join(', ')}`);
    lines.push(`Platform: ${navigator.userAgentData.platform} ${hi.platformVersion}`);
  } catch {
    lines.push(`User agent: ${navigator.userAgent}`);
  }
  lines.push(`showDirectoryPicker available: ${'showDirectoryPicker' in window ? 'yes' : 'NO - turn on brave://flags/#file-system-access-api'}`);
  envText = lines.join('\n');
  $('env').textContent = envText;
}

async function showStatus() {
  const handle = await idbGet('vault').catch(() => null);
  if (!handle) {
    $('status').textContent = 'No folder saved yet.';
    return;
  }
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  $('status').textContent = `Saved folder: "${handle.name}". Permission right now: ${perm}.`;
}

async function needHandle() {
  const handle = await idbGet('vault');
  if (!handle) throw new Error('No folder saved. Click "Choose test folder" first.');
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error(`Permission is "${perm}". Click "Reconnect folder" first.`);
  return handle;
}

// ---------- Tests ----------
async function pick() {
  try {
    if (!('showDirectoryPicker' in window)) throw new Error('showDirectoryPicker does not exist. Flag is off.');
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'career-vault' });
    await idbPut('vault', handle);
    await log('2+3. Choose folder and save it', true, `Picked "${handle.name}" and stored it in IndexedDB.`);
  } catch (err) {
    await log('2+3. Choose folder and save it', false, `${err.name}: ${err.message}`);
  }
  showStatus();
}

async function reconnect() {
  try {
    const handle = await idbGet('vault');
    if (!handle) throw new Error('No saved folder found in IndexedDB.');
    const before = await handle.queryPermission({ mode: 'readwrite' });
    const after = await handle.requestPermission({ mode: 'readwrite' });
    await log('4a. Restore saved folder and reconnect', after === 'granted',
      `Restored "${handle.name}" from IndexedDB. Permission before click: ${before}. After: ${after}.`);
  } catch (err) {
    await log('4a. Restore saved folder and reconnect', false, `${err.name}: ${err.message}`);
  }
  showStatus();
}

async function readVault() {
  try {
    const handle = await needHandle();
    const file = await (await handle.getFileHandle('vault.md')).getFile();
    const text = await file.text();
    await log('4b. Read vault.md', true, `${file.size} bytes. Starts with: ${text.slice(0, 120).replace(/\n/g, ' / ')}`);
  } catch (err) {
    await log('4b. Read vault.md', false, `${err.name}: ${err.message}`);
  }
}

async function writeTest() {
  try {
    const handle = await needHandle();
    const fh = await handle.getFileHandle('test.txt', { create: true });
    const existing = await (await fh.getFile()).text();
    const line = `${new Date().toISOString()}  written from the ${SURFACE}\n`;
    const w = await fh.createWritable();
    await w.write(existing + line);
    await w.close();
    const back = await (await fh.getFile()).text();
    const ok = back.endsWith(line);
    await log('4c. Write test.txt', ok, ok
      ? `Appended and read back a line. test.txt now has ${back.trim().split('\n').length} line(s).`
      : 'Write returned but the new line was not found on read-back.');
  } catch (err) {
    await log('4c. Write test.txt', false, `${err.name}: ${err.message}`);
  }
}

async function copyReport() {
  const entries = await getLog();
  const body = entries
    .map((e) => `${e.ok ? 'PASS' : 'FAIL'} | ${e.step} | ${e.surface} | ${e.at} | ${e.detail}`)
    .join('\n');
  const text = `JOB MODE PHASE 0 REPORT\n${envText}\n\n${body || '(log is empty)'}`;
  try {
    await navigator.clipboard.writeText(text);
    $('copy').textContent = 'Copied';
    setTimeout(() => { $('copy').textContent = 'Copy report'; }, 1500);
  } catch (err) {
    alert(`Clipboard blocked (${err.message}). Report:\n\n${text}`);
  }
}

$('pick').addEventListener('click', pick);
$('reconnect').addEventListener('click', reconnect);
$('read').addEventListener('click', readVault);
$('write').addEventListener('click', writeTest);
$('copy').addEventListener('click', copyReport);
$('clear').addEventListener('click', async () => {
  await chrome.storage.local.set({ log: [] });
});
$('open-tab')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('tab.html') });
});

describeEnv();
showStatus();
renderLog();
