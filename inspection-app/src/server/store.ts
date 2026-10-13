// Storage behind one small interface. Two implementations:
// - SupabaseStore (src/server/supabase-store.ts) when SUPABASE_URL is set: the real thing
// - JsonFileStore below otherwise: a local file for development, tests and demos

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Inspection, ItemResult, Role, User, Vehicle } from "@/lib/types";
import { buildSeed, SEED_PHOTO_DIR } from "./seed-data";
import { supabaseConfigured } from "./supabase";
import { SupabaseStore } from "./supabase-store";

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

export class DuplicateUnitError extends Error {
  constructor(unit: string) {
    super(`Unit ${unit} is already on the list`);
  }
}

export interface InspectionQuery {
  truckId?: string;
  /** Matches the truck or the trailer. */
  vehicleId?: string;
  inspectorId?: string;
  certified?: boolean;
}

export interface Store {
  listUsers(): Promise<User[]>;
  getUser(id: string): Promise<User | null>;
  createUser(person: NewPerson): Promise<User>;
  saveUser(user: User): Promise<void>;
  setPin(userId: string, pin: string): Promise<void>;

  listVehicles(): Promise<Vehicle[]>;
  getVehicle(id: string): Promise<Vehicle | null>;
  /** Insert or update. Throws DuplicateUnitError if another unit of that kind has the number. */
  saveVehicle(v: Vehicle): Promise<void>;

  /** Newest first. */
  listInspections(q?: InspectionQuery): Promise<Inspection[]>;
  getInspection(id: string): Promise<Inspection | null>;
  getInspectionByToken(token: string): Promise<Inspection | null>;
  createInspection(insp: Inspection): Promise<void>;
  /** Saves everything except `results`. */
  saveInspectionHeader(insp: Inspection): Promise<void>;
  /** Saves one item's result, so two quick saves on different items can't overwrite each other. */
  saveItem(inspectionId: string, itemId: string, result: ItemResult): Promise<void>;
  /** Drafts only. */
  deleteInspection(id: string): Promise<void>;

  putPhoto(bytes: Buffer, contentType: string): Promise<string>;
  getPhoto(key: string): Promise<{ bytes: Buffer; contentType: string } | null>;
}

interface DbFile {
  version: 1;
  users: User[];
  vehicles: Vehicle[];
  inspections: Inspection[];
}

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const PHOTO_KEY = /^(seed-[a-z0-9-]+|[0-9a-f-]{36})\.(jpg|png|webp)$/;

export function byNewest(a: Inspection, b: Inspection): number {
  return (b.certifiedAt ?? b.startedAt).localeCompare(a.certifiedAt ?? a.startedAt);
}

export function matches(i: Inspection, q: InspectionQuery): boolean {
  if (q.truckId && i.truckId !== q.truckId) return false;
  if (q.vehicleId && i.truckId !== q.vehicleId && i.trailerId !== q.vehicleId) return false;
  if (q.inspectorId && i.inspectorId !== q.inspectorId) return false;
  if (q.certified !== undefined && Boolean(i.certifiedAt) !== q.certified) return false;
  return true;
}

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
      const fresh: DbFile = { version: 1, ...buildSeed() };
      await this.copySeedPhotos();
      await this.write(fresh);
      return fresh;
    }
  }

  private async copySeedPhotos() {
    await fs.mkdir(this.photoDir, { recursive: true });
    let names: string[] = [];
    try {
      names = await fs.readdir(SEED_PHOTO_DIR);
    } catch {
      return; // no demo photos shipped; inspections still work, the seed photos just won't show
    }
    for (const name of names) {
      if (name.endsWith(".jpg")) {
        await fs.copyFile(path.join(/*turbopackIgnore: true*/ SEED_PHOTO_DIR, name), path.join(/*turbopackIgnore: true*/ this.photoDir, `seed-${name}`));
      }
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

  async listVehicles() {
    return (await this.read()).vehicles;
  }

  async getVehicle(id: string) {
    return (await this.read()).vehicles.find((v) => v.id === id) ?? null;
  }

  saveVehicle(v: Vehicle) {
    return this.mutate((db) => {
      const unit = v.unit.trim().toLowerCase();
      if (db.vehicles.some((x) => x.id !== v.id && x.kind === v.kind && x.unit.trim().toLowerCase() === unit)) {
        throw new DuplicateUnitError(v.unit);
      }
      const i = db.vehicles.findIndex((x) => x.id === v.id);
      if (i >= 0) db.vehicles[i] = v;
      else db.vehicles.push(v);
    });
  }

  async listInspections(q: InspectionQuery = {}) {
    return (await this.read()).inspections.filter((i) => matches(i, q)).sort(byNewest);
  }

  async getInspection(id: string) {
    return (await this.read()).inspections.find((i) => i.id === id) ?? null;
  }

  async getInspectionByToken(token: string) {
    return (await this.read()).inspections.find((i) => i.token === token) ?? null;
  }

  createInspection(insp: Inspection) {
    return this.mutate((db) => {
      db.inspections.push(insp);
    });
  }

  saveInspectionHeader(insp: Inspection) {
    return this.mutate((db) => {
      const i = db.inspections.findIndex((x) => x.id === insp.id);
      if (i < 0) throw new Error(`Inspection ${insp.id} not found`);
      db.inspections[i] = { ...insp, results: db.inspections[i].results };
    });
  }

  saveItem(inspectionId: string, itemId: string, result: ItemResult) {
    return this.mutate((db) => {
      const insp = db.inspections.find((x) => x.id === inspectionId);
      if (!insp) throw new Error(`Inspection ${inspectionId} not found`);
      insp.results[itemId] = result;
      insp.updatedAt = new Date().toISOString();
    });
  }

  deleteInspection(id: string) {
    return this.mutate((db) => {
      db.inspections = db.inspections.filter((x) => x.id !== id);
    });
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
    if (!PHOTO_KEY.test(key)) return null;
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

const g = globalThis as unknown as { __inspectionStore?: Store; __supabaseStore?: Store };

export function dataDir(): string {
  return process.env.DATA_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), ".data");
}

export function getStore(): Store {
  if (supabaseConfigured()) {
    g.__supabaseStore ??= new SupabaseStore();
    return g.__supabaseStore;
  }
  g.__inspectionStore ??= new JsonFileStore(dataDir());
  return g.__inspectionStore;
}
