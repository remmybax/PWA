// Storage behind one small interface. Two implementations:
// - SupabaseStore (src/server/supabase-store.ts) when SUPABASE_URL is set: the real thing
// - JsonFileStore below otherwise: a local file for development, tests and offline demos

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ChangeEntry, Load, Role, TicketReading, User } from "@/lib/types";
import { SEED_USERS, seedLoads } from "./seed-data";
import { supabaseConfigured } from "./supabase";
import { SupabaseStore } from "./supabase-store";

export interface LoadQuery {
  driverId?: string;
  /** Inclusive ISO date on the ticket. */
  from?: string;
  to?: string;
}

export class DuplicateTicketError extends Error {
  constructor(public ticket: string) {
    super(`Ticket ${ticket} is already logged`);
  }
}

export interface NewPerson {
  name: string;
  role: Role;
  /** Sign-in for the Supabase build: phone number and PIN. Ignored by the local demo store. */
  phone?: string;
  pin?: string;
}

export class DuplicatePhoneError extends Error {
  constructor() {
    super("Someone already has that phone number");
  }
}

export interface Store {
  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | null>;
  createUser(person: NewPerson): Promise<User>;
  /** Changes role / active. */
  saveUser(user: User): Promise<void>;
  setPin(userId: string, pin: string): Promise<void>;

  listLoads(q?: LoadQuery): Promise<Load[]>;
  getLoad(id: string): Promise<Load | null>;
  /** Throws DuplicateTicketError if the ticket number is already logged. */
  insertLoad(load: Load): Promise<void>;
  /** Saves an edited load; `changes` are the new history entries (already on load.history). */
  updateLoad(load: Load, changes: ChangeEntry[]): Promise<void>;

  /** A ticket read but not logged yet. Held server-side so the client can't alter the reading. */
  putPendingReading(p: PendingReading): Promise<void>;
  getPendingReading(photoKey: string): Promise<PendingReading | null>;

  putPhoto(bytes: Buffer, contentType: string): Promise<string>;
  getPhoto(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

export interface PendingReading {
  photoKey: string;
  driverId: string;
  reading: TicketReading;
}

interface DbFile {
  version: 1;
  users: User[];
  loads: Load[];
  pending?: PendingReading[];
}

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export class JsonFileStore implements Store {
  private dbPath: string;
  private photoDir: string;
  // Serializes writes within this process; the local store is for a single dev/demo server.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private dir: string) {
    this.dbPath = path.join(/*turbopackIgnore: true*/ dir, "db.json");
    this.photoDir = path.join(/*turbopackIgnore: true*/ dir, "photos");
  }

  private async read(): Promise<DbFile> {
    try {
      return JSON.parse(await fs.readFile(this.dbPath, "utf8")) as DbFile;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      const fresh: DbFile = { version: 1, users: structuredClone(SEED_USERS), loads: seedLoads() };
      await this.write(fresh);
      return fresh;
    }
  }

  private async write(db: DbFile): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.dbPath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.rename(tmp, this.dbPath);
  }

  private mutate<T>(fn: (db: DbFile) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const db = await this.read();
      const result = await fn(db);
      await this.write(db);
      return result;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  async listUsers() {
    return (await this.read()).users;
  }

  async getUser(id: string) {
    return (await this.read()).users.find((u) => u.id === id) ?? null;
  }

  async createUser(person: NewPerson) {
    const user: User = { id: randomUUID(), name: person.name, role: person.role, active: true, createdAt: new Date().toISOString() };
    if (person.phone) user.phone = person.phone;
    await this.mutate((db) => {
      if (user.phone && db.users.some((u) => u.phone === user.phone)) throw new DuplicatePhoneError();
      db.users.push(user);
    });
    return user;
  }

  async setPin() {
    // The local demo store uses pick-your-name sign-in; there is no PIN to store.
  }

  saveUser(user: User) {
    return this.mutate((db) => {
      const i = db.users.findIndex((u) => u.id === user.id);
      if (i >= 0) db.users[i] = user;
      else db.users.push(user);
    });
  }

  async listLoads(q: LoadQuery = {}) {
    const { loads } = await this.read();
    return loads
      .filter((l) => !q.driverId || l.driverId === q.driverId)
      .filter((l) => !q.from || l.fields.date >= q.from)
      .filter((l) => !q.to || l.fields.date <= q.to)
      .sort((a, b) => a.fields.date.localeCompare(b.fields.date) || a.loggedAt.localeCompare(b.loggedAt));
  }

  async getLoad(id: string) {
    return (await this.read()).loads.find((l) => l.id === id) ?? null;
  }

  insertLoad(load: Load) {
    return this.mutate((db) => {
      if (db.loads.some((l) => l.fields.ticket === load.fields.ticket)) {
        throw new DuplicateTicketError(load.fields.ticket);
      }
      db.loads.push(load);
      db.pending = (db.pending ?? []).filter((p) => p.photoKey !== load.photoKey);
    });
  }

  updateLoad(load: Load) {
    return this.mutate((db) => {
      if (db.loads.some((l) => l.id !== load.id && l.fields.ticket === load.fields.ticket)) {
        throw new DuplicateTicketError(load.fields.ticket);
      }
      const i = db.loads.findIndex((l) => l.id === load.id);
      if (i < 0) throw new Error(`Load ${load.id} not found`);
      db.loads[i] = load;
    });
  }

  putPendingReading(p: PendingReading) {
    return this.mutate((db) => {
      // Readings nobody logged are dropped after a day.
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      db.pending = (db.pending ?? []).filter((x) => x.reading.readAt > cutoff && x.photoKey !== p.photoKey);
      db.pending.push(p);
    });
  }

  async getPendingReading(photoKey: string) {
    return (await this.read()).pending?.find((p) => p.photoKey === photoKey) ?? null;
  }

  async putPhoto(bytes: Buffer, contentType: string) {
    const ext = PHOTO_TYPES[contentType];
    if (!ext) throw new Error(`Unsupported photo type ${contentType}`);
    await fs.mkdir(this.photoDir, { recursive: true });
    const key = `${randomUUID()}.${ext}`;
    await fs.writeFile(path.join(/*turbopackIgnore: true*/ this.photoDir, key), bytes);
    return key;
  }

  async getPhoto(key: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp|heic)$/.test(key)) return null;
    try {
      const bytes = await fs.readFile(path.join(/*turbopackIgnore: true*/ this.photoDir, key));
      const ext = key.split(".").pop()!;
      const contentType = Object.entries(PHOTO_TYPES).find(([, e]) => e === ext)![0];
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
}

const g = globalThis as unknown as { __indecaStore?: Store };

export function getStore(): Store {
  if (supabaseConfigured()) return new SupabaseStore();
  if (!g.__indecaStore) {
    g.__indecaStore = new JsonFileStore(process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data"));
  }
  return g.__indecaStore;
}
