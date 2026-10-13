// Store backed by Supabase. Every query runs as the signed-in person, so row-level security
// (supabase/migrations/0001_init.sql) decides what they can see and change. People management
// uses the admin client after src/server/people.ts has checked the caller is dispatch.

import { randomUUID } from "node:crypto";
import { FIELD_KEYS, type FieldKey, type LoadFields } from "@/lib/fields";
import type { ChangeEntry, FieldStatus, Load, TicketReading, User } from "@/lib/types";
import { adminClient, loginEmail, userClient } from "./supabase";
import { pinPassword } from "./pin";
import {
  DuplicatePhoneError,
  DuplicateTicketError,
  type LoadQuery,
  type NewPerson,
  type PendingReading,
  type Store,
} from "./store";

const BUCKET = "tickets";

/** App field key -> loads column. */
const COLUMN: Record<FieldKey, string> = {
  date: "ticket_date",
  lease: "lease",
  ticket: "ticket",
  tank: "tank",
  reject: "reject",
  gm: "gm",
  tTemp: "t_temp",
  topGauge: "top_gauge",
  bTemp: "b_temp",
  bottomGauge: "bottom_gauge",
  obGrav: "ob_grav",
  obTemp: "ob_temp",
  sw: "sw",
  sealOn: "seal_on",
  sealOff: "seal_off",
  station: "station",
  waitTime: "wait_time",
  comments: "comments",
};

interface ProfileRow {
  id: string;
  name: string;
  phone: string | null;
  role: User["role"];
  active: boolean;
  created_at: string;
}

interface ChangeRow {
  changed_at: string;
  changed_by: string;
  changed_by_name: string;
  field: string;
  old_value: string;
  new_value: string;
  note: string | null;
}

type LoadRow = Record<string, unknown> & {
  id: string;
  driver_id: string;
  logged_at: string;
  photo_key: string | null;
  field_status: Record<FieldKey, FieldStatus>;
  reading: TicketReading | null;
  load_changes?: ChangeRow[];
};

const LOAD_SELECT = "*, load_changes(changed_at, changed_by, changed_by_name, field, old_value, new_value, note)";

function toUser(r: ProfileRow): User {
  const u: User = { id: r.id, name: r.name, role: r.role, active: r.active, createdAt: r.created_at };
  if (r.phone) u.phone = r.phone;
  return u;
}

function toLoad(r: LoadRow): Load {
  const fields = Object.fromEntries(FIELD_KEYS.map((k) => [k, String(r[COLUMN[k]] ?? "")])) as LoadFields;
  const history: ChangeEntry[] = (r.load_changes ?? [])
    .map((c) => ({
      at: new Date(c.changed_at).toISOString(),
      byUserId: c.changed_by,
      byName: c.changed_by_name,
      field: c.field as FieldKey,
      from: c.old_value,
      to: c.new_value,
      ...(c.note ? { note: c.note } : {}),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));
  return {
    id: r.id,
    driverId: r.driver_id,
    loggedAt: new Date(r.logged_at).toISOString(),
    photoKey: r.photo_key,
    fields,
    status: r.field_status,
    reading: r.reading,
    history,
  };
}

function columnsOf(fields: Partial<LoadFields>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [COLUMN[k as FieldKey], v]));
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

export class SupabaseStore implements Store {
  // ---------- People ----------

  async listUsers() {
    const db = await userClient();
    const { data, error } = await db.from("profiles").select("*").order("name");
    if (error) fail("Loading people", error);
    return (data as ProfileRow[]).map(toUser);
  }

  async getUser(id: string) {
    const db = await userClient();
    const { data, error } = await db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) fail("Loading person", error);
    return data ? toUser(data as ProfileRow) : null;
  }

  /** Called by people.ts only after it has checked the caller is dispatch. */
  async createUser(person: NewPerson) {
    if (!person.phone || !person.pin) throw new Error("Phone number and PIN are required");
    const admin = adminClient();
    const { data: existing } = await admin.from("profiles").select("id").eq("phone", person.phone).maybeSingle();
    if (existing) throw new DuplicatePhoneError();

    const { data: auth, error: authError } = await admin.auth.admin.createUser({
      email: loginEmail(person.phone),
      password: pinPassword(person.phone, person.pin),
      email_confirm: true,
      user_metadata: { name: person.name },
    });
    if (authError || !auth.user) fail("Creating sign-in", authError);

    const row = { id: auth.user.id, name: person.name, phone: person.phone, role: person.role, active: true };
    const { data, error } = await admin.from("profiles").insert(row).select("*").single();
    if (error) {
      await admin.auth.admin.deleteUser(auth.user.id);
      fail("Saving person", error);
    }
    return toUser(data as ProfileRow);
  }

  async saveUser(user: User) {
    const { error } = await adminClient().from("profiles").update({ name: user.name, role: user.role, active: user.active }).eq("id", user.id);
    if (error) fail("Saving person", error);
  }

  async setPin(userId: string, pin: string) {
    const { data: person } = await adminClient().from("profiles").select("phone").eq("id", userId).maybeSingle();
    if (!person?.phone) throw new Error("This person has no mobile number on file");
    const { error } = await adminClient().auth.admin.updateUserById(userId, { password: pinPassword(person.phone, pin) });
    // Setting a PIN also unlocks the number if they'd been locked out by wrong tries.
    if (!error) await adminClient().from("sign_in_failures").delete().eq("phone", person.phone);
    if (error) fail("Setting PIN", error);
  }

  // ---------- Loads ----------

  async listLoads(q: LoadQuery = {}) {
    const db = await userClient();
    let query = db.from("loads").select(LOAD_SELECT);
    if (q.driverId) query = query.eq("driver_id", q.driverId);
    if (q.from) query = query.gte("ticket_date", q.from);
    if (q.to) query = query.lte("ticket_date", q.to);
    const { data, error } = await query.order("ticket_date").order("logged_at");
    if (error) fail("Loading loads", error);
    return (data as LoadRow[]).map(toLoad);
  }

  async getLoad(id: string) {
    const db = await userClient();
    const { data, error } = await db.from("loads").select(LOAD_SELECT).eq("id", id).maybeSingle();
    if (error) fail("Loading load", error);
    return data ? toLoad(data as LoadRow) : null;
  }

  async insertLoad(load: Load) {
    const db = await userClient();
    const { error } = await db.from("loads").insert({
      id: load.id,
      driver_id: load.driverId,
      logged_at: load.loggedAt,
      photo_key: load.photoKey,
      ...columnsOf(load.fields),
      field_status: load.status,
      reading: load.reading,
    });
    if (error?.code === "23505") throw new DuplicateTicketError(load.fields.ticket);
    if (error) fail("Logging load", error);
    if (load.photoKey) await db.from("pending_readings").delete().eq("photo_key", load.photoKey);
  }

  async updateLoad(load: Load, changes: ChangeEntry[]) {
    const db = await userClient();
    const { error } = await db.rpc("edit_load", {
      p_id: load.id,
      p_columns: columnsOf(load.fields),
      p_status: load.status,
      p_changes: changes,
    });
    if (error?.code === "23505") throw new DuplicateTicketError(load.fields.ticket);
    if (error) fail("Saving edit", error);
  }

  // ---------- Pending readings and photos ----------

  async putPendingReading(p: PendingReading) {
    const db = await userClient();
    // Readings nobody logged are dropped after a day.
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await db.from("pending_readings").delete().eq("driver_id", p.driverId).lt("created_at", cutoff);
    const { error } = await db.from("pending_readings").upsert({ photo_key: p.photoKey, driver_id: p.driverId, reading: p.reading });
    if (error) fail("Saving reading", error);
  }

  async getPendingReading(photoKey: string) {
    const db = await userClient();
    const { data, error } = await db.from("pending_readings").select("*").eq("photo_key", photoKey).maybeSingle();
    if (error) fail("Loading reading", error);
    return data ? { photoKey: data.photo_key as string, driverId: data.driver_id as string, reading: data.reading as TicketReading } : null;
  }

  async putPhoto(bytes: Buffer, contentType: string) {
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[contentType];
    if (!ext) throw new Error(`Unsupported photo type ${contentType}`);
    const key = `${randomUUID()}.${ext}`;
    const db = await userClient();
    const { error } = await db.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: false });
    if (error) fail("Saving photo", error);
    return key;
  }

  async getPhoto(key: string) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(key)) return null;
    const db = await userClient();
    const { data, error } = await db.storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
  }
}
