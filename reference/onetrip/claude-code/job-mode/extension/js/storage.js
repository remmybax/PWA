// The only door to the Career-Vault folder. Views and repo code call these
// functions with vault-relative paths and never touch file APIs directly, so a
// different backend (e.g. the local helper from the brief) can be swapped in here.
import * as fsa from './storage-fsa.js';

const backend = fsa;

export function segments(path) {
  const p = String(path ?? '').replace(/\\/g, '/');
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) throw new Error(`Absolute paths are not allowed: ${path}`);
  const segs = p.split('/').filter((s) => s !== '' && s !== '.');
  if (segs.includes('..')) throw new Error(`".." is not allowed in paths: ${path}`);
  return segs;
}

export const available = () => backend.available();
export const status = () => backend.status();
export const connect = () => backend.connect();
export const reconnect = () => backend.reconnect();
export const forget = () => backend.forget();

export const list = (dir = '') => backend.list(segments(dir));
export const read = (path) => backend.read(segments(path));
export const readFile = (path) => backend.readFile(segments(path));
export const write = (path, text) => backend.write(segments(path), text);
export const mkdir = (path) => backend.mkdir(segments(path));
export const exists = (path) => backend.exists(segments(path));

export async function readIfExists(path) {
  try {
    return await read(path);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export function isNotFound(err) {
  return err?.name === 'NotFoundError' || err?.name === 'TypeMismatchError';
}
