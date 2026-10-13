// Store backed by Supabase. The app server checks every permission before calling this (see
// src/server/inspections.ts, fleet.ts, people.ts), so it uses the secret key; row-level security
// is on with no policies, so nobody can reach the tables with the public key.

import { randomUUID } from "node:crypto";
import type { Inspection, ItemResult, User, Vehicle } from "@/lib/types";
import { adminClient, loginEmail } from "./supabase";
import { pinPassword } from "./pin";
import { DuplicatePhoneError, DuplicateUnitError, PHOTO_KEY, type InspectionQuery, type NewPerson, type Store } from "./store";

const BUCKET = "inspection-photos";

interface ProfileRow {
  id: string;
  name: string;
  phone: string | null;
  role: User["role"];
  active: boolean;
  created_at: string;
}

interface VehicleRow {
  id: string;
  kind: Vehicle["kind"];
  unit: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  plate: string;
  default_trailer_id: string | null;
  notes: string;
  active: boolean;
  created_at: string;
}

interface InspectionRow {
  id: string;
  token: string;
  truck_id: string;
  trailer_id: string | null;
  inspector_id: string;
  inspector_name: string;
  location: string;
  checklist_version: string;
  started_at: string;
  updated_at: string;
  certified_at: string | null;
  overall: Inspection["overall"];
  comments: string;
  signature: string;
  inspection_items?: { item_id: string; result: ItemResult }[];
}

const INSPECTION_SELECT = "*, inspection_items(item_id, result)";

function toUser(r: ProfileRow): User {
  const u: User = { id: r.id, name: r.name, role: r.role, active: r.active, createdAt: r.created_at };
  if (r.phone) u.phone = r.phone;
  return u;
}

function toVehicle(r: VehicleRow): Vehicle {
  return {
    id: r.id,
    kind: r.kind,
    unit: r.unit,
    vin: r.vin,
    year: r.year,
    make: r.make,
    model: r.model,
    plate: r.plate,
    defaultTrailerId: r.default_trailer_id,
    notes: r.notes,
    active: r.active,
    createdAt: r.created_at,
  };
}

function iso(ts: string | null): string | null {
  return ts ? new Date(ts).toISOString() : null;
}

function toInspection(r: InspectionRow): Inspection {
  return {
    id: r.id,
    token: r.token,
    truckId: r.truck_id,
    trailerId: r.trailer_id,
    inspectorId: r.inspector_id,
    inspectorName: r.inspector_name,
    location: r.location,
    checklistVersion: r.checklist_version,
    startedAt: iso(r.started_at)!,
    updatedAt: iso(r.updated_at)!,
    certifiedAt: iso(r.certified_at),
    overall: r.overall,
    comments: r.comments,
    signature: r.signature,
    results: Object.fromEntries((r.inspection_items ?? []).map((x) => [x.item_id, x.result])),
  };
}

function headerRow(i: Inspection) {
  return {
    id: i.id,
    token: i.token,
    truck_id: i.truckId,
    trailer_id: i.trailerId,
    inspector_id: i.inspectorId,
    inspector_name: i.inspectorName,
    location: i.location,
    checklist_version: i.checklistVersion,
    started_at: i.startedAt,
    updated_at: i.updatedAt,
    certified_at: i.certifiedAt,
    overall: i.overall,
    comments: i.comments,
    signature: i.signature,
  };
}

function fail(what: string, error: { message: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "unknown error"}`);
}

export class SupabaseStore implements Store {
  private db = adminClient();

  // ---------- People ----------

  async listUsers() {
    const { data, error } = await this.db.from("profiles").select("*").order("name");
    if (error) fail("Loading people", error);
    return (data as ProfileRow[]).map(toUser);
  }

  async getUser(id: string) {
    const { data, error } = await this.db.from("profiles").select("*").eq("id", id).maybeSingle();
    if (error) fail("Loading person", error);
    return data ? toUser(data as ProfileRow) : null;
  }

  /** Called by people.ts only after it has checked the caller is a manager. */
  async createUser(person: NewPerson) {
    if (!person.phone || !person.pin) throw new Error("Phone number and PIN are required");
    const { data: existing } = await this.db.from("profiles").select("id").eq("phone", person.phone).maybeSingle();
    if (existing) throw new DuplicatePhoneError();

    const { data: auth, error: authError } = await this.db.auth.admin.createUser({
      email: loginEmail(person.phone),
      password: pinPassword(person.phone, person.pin),
      email_confirm: true,
      user_metadata: { name: person.name },
    });
    if (authError || !auth.user) fail("Creating sign-in", authError);

    const row = { id: auth.user.id, name: person.name, phone: person.phone, role: person.role, active: true };
    const { data, error } = await this.db.from("profiles").insert(row).select("*").single();
    if (error) {
      await this.db.auth.admin.deleteUser(auth.user.id);
      fail("Saving person", error);
    }
    return toUser(data as ProfileRow);
  }

  async saveUser(user: User) {
    const { error } = await this.db.from("profiles").update({ name: user.name, role: user.role, active: user.active }).eq("id", user.id);
    if (error) fail("Saving person", error);
  }

  async setPin(userId: string, pin: string) {
    const { data: person } = await this.db.from("profiles").select("phone").eq("id", userId).maybeSingle();
    if (!person?.phone) throw new Error("This person has no mobile number on file");
    const { error } = await this.db.auth.admin.updateUserById(userId, { password: pinPassword(person.phone, pin) });
    if (error) fail("Setting PIN", error);
    // Setting a PIN also unlocks the number if they'd been locked out by wrong tries.
    await this.db.from("sign_in_failures").delete().eq("phone", person.phone);
  }

  // ---------- Fleet ----------

  async listVehicles() {
    const { data, error } = await this.db.from("vehicles").select("*").order("unit");
    if (error) fail("Loading fleet", error);
    return (data as VehicleRow[]).map(toVehicle);
  }

  async getVehicle(id: string) {
    const { data, error } = await this.db.from("vehicles").select("*").eq("id", id).maybeSingle();
    if (error) fail("Loading unit", error);
    return data ? toVehicle(data as VehicleRow) : null;
  }

  async saveVehicle(v: Vehicle) {
    const { error } = await this.db.from("vehicles").upsert({
      id: v.id,
      kind: v.kind,
      unit: v.unit,
      vin: v.vin,
      year: v.year,
      make: v.make,
      model: v.model,
      plate: v.plate,
      default_trailer_id: v.defaultTrailerId ?? null,
      notes: v.notes,
      active: v.active,
      created_at: v.createdAt,
    });
    if (error?.code === "23505") throw new DuplicateUnitError(v.unit);
    if (error) fail("Saving unit", error);
  }

  // ---------- Inspections ----------

  async listInspections(q: InspectionQuery = {}) {
    let query = this.db.from("inspections").select(INSPECTION_SELECT);
    if (q.truckId) query = query.eq("truck_id", q.truckId);
    if (q.vehicleId) query = query.or(`truck_id.eq.${q.vehicleId},trailer_id.eq.${q.vehicleId}`);
    if (q.inspectorId) query = query.eq("inspector_id", q.inspectorId);
    if (q.certified === true) query = query.not("certified_at", "is", null);
    if (q.certified === false) query = query.is("certified_at", null);
    const { data, error } = await query.order("started_at", { ascending: false }).limit(500);
    if (error) fail("Loading inspections", error);
    const out = (data as InspectionRow[]).map(toInspection);
    return out.sort((a, b) => (b.certifiedAt ?? b.startedAt).localeCompare(a.certifiedAt ?? a.startedAt));
  }

  async getInspection(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) return null;
    const { data, error } = await this.db.from("inspections").select(INSPECTION_SELECT).eq("id", id).maybeSingle();
    if (error) fail("Loading inspection", error);
    return data ? toInspection(data as InspectionRow) : null;
  }

  async getInspectionByToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const { data, error } = await this.db.from("inspections").select(INSPECTION_SELECT).eq("token", token).maybeSingle();
    if (error) fail("Loading report", error);
    return data ? toInspection(data as InspectionRow) : null;
  }

  async createInspection(insp: Inspection) {
    const { error } = await this.db.from("inspections").insert(headerRow(insp));
    if (error) fail("Starting inspection", error);
    const items = Object.entries(insp.results).map(([item_id, result]) => ({ inspection_id: insp.id, item_id, result }));
    if (items.length) {
      const r = await this.db.from("inspection_items").insert(items);
      if (r.error) fail("Saving items", r.error);
    }
  }

  async saveInspectionHeader(insp: Inspection) {
    const { id, ...rest } = headerRow(insp);
    const { error } = await this.db.from("inspections").update(rest).eq("id", id);
    if (error) fail("Saving inspection", error);
  }

  async saveItem(inspectionId: string, itemId: string, result: ItemResult) {
    const { error } = await this.db
      .from("inspection_items")
      .upsert({ inspection_id: inspectionId, item_id: itemId, result, updated_at: new Date().toISOString() });
    if (error) fail("Saving item", error);
  }

  async deleteInspection(id: string) {
    const { error } = await this.db.from("inspections").delete().eq("id", id);
    if (error) fail("Discarding inspection", error);
  }

  // ---------- Photos ----------

  async putPhoto(bytes: Buffer, contentType: string) {
    const ext = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[contentType];
    if (!ext) throw new Error(`Unsupported photo type ${contentType}`);
    const key = `${randomUUID()}.${ext}`;
    const { error } = await this.db.storage.from(BUCKET).upload(key, bytes, { contentType, upsert: false });
    if (error) fail("Saving photo", error);
    return key;
  }

  async getPhoto(key: string) {
    if (!PHOTO_KEY.test(key)) return null;
    const { data, error } = await this.db.storage.from(BUCKET).download(key);
    if (error || !data) return null;
    return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || "image/jpeg" };
  }
}
