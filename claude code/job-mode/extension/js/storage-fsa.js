// File System Access backend. Proven in the Phase 0 spike on Brave 1.94 with
// brave://flags/#file-system-access-api enabled. The directory handle lives in
// IndexedDB; after a browser restart its permission drops to "prompt" and one
// click on Reconnect (a user gesture) grants it again.

const DB_NAME = 'jobmode';
const STORE = 'handles';
const KEY = 'career-vault';

let root = null;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idb(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function storedHandle() {
  if (!root) root = (await idb('readonly', (s) => s.get(KEY))) ?? null;
  return root;
}

export function available() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

// 'unavailable' | 'none' | 'prompt' | 'granted'
export async function status() {
  if (!available()) return { state: 'unavailable', name: '' };
  const h = await storedHandle();
  if (!h) return { state: 'none', name: '' };
  const perm = await h.queryPermission({ mode: 'readwrite' });
  return { state: perm === 'granted' ? 'granted' : 'prompt', name: h.name };
}

export async function connect() {
  const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'career-vault', startIn: 'documents' });
  const perm = await h.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('Edit access was not granted.');
  await idb('readwrite', (s) => s.put(h, KEY));
  root = h;
  return h.name;
}

export async function reconnect() {
  const h = await storedHandle();
  if (!h) return 'none';
  return h.requestPermission({ mode: 'readwrite' });
}

export async function forget() {
  await idb('readwrite', (s) => s.delete(KEY));
  root = null;
}

function needRoot() {
  if (!root) throw new Error('Career-Vault is not connected.');
  return root;
}

async function dirAt(segs, create) {
  let d = needRoot();
  for (const s of segs) d = await d.getDirectoryHandle(s, { create });
  return d;
}

async function fileHandle(segs, create = false) {
  if (!segs.length) throw new Error('A file path is required.');
  const dir = await dirAt(segs.slice(0, -1), create);
  return dir.getFileHandle(segs[segs.length - 1], { create });
}

export async function list(segs) {
  const dir = await dirAt(segs, false);
  const out = [];
  for await (const [name, h] of dir.entries()) out.push({ name, kind: h.kind });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readFile(segs) {
  return (await fileHandle(segs)).getFile();
}

export async function read(segs) {
  return (await readFile(segs)).text();
}

// createWritable writes to a temp swap file and only replaces the real file on
// close(), so a crash mid-write can't leave a half-written app.md in OneDrive.
export async function write(segs, text) {
  const fh = await fileHandle(segs, true);
  const w = await fh.createWritable();
  try {
    await w.write(text);
    await w.close();
  } catch (err) {
    await w.abort().catch(() => {});
    throw err;
  }
}

export async function mkdir(segs) {
  await dirAt(segs, true);
}

export async function exists(segs) {
  if (!segs.length) return true;
  const parent = await dirAt(segs.slice(0, -1), false).catch(() => null);
  if (!parent) return false;
  const name = segs[segs.length - 1];
  try { await parent.getFileHandle(name); return true; } catch { /* not a file */ }
  try { await parent.getDirectoryHandle(name); return true; } catch { return false; }
}
