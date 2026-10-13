import * as storage from './storage.js';
import { STANDARD_FOLDERS, STARTER_FILES } from './templates.js';

// Creates whatever standard folders and starter files are missing. Never
// overwrites: an existing file is left exactly as it is. Returns what it created.
export async function ensureStructure() {
  const created = [];
  for (const folder of STANDARD_FOLDERS) {
    if (!(await storage.exists(folder))) {
      await storage.mkdir(folder);
      created.push(`${folder}/`);
    }
  }
  for (const { path, text } of STARTER_FILES) {
    if (!(await storage.exists(path))) {
      await storage.write(path, text);
      created.push(path);
    }
  }
  return created;
}
