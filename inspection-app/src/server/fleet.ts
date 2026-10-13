// The fleet list (trucks and trailers) and the status board built from it: when each truck was
// last inspected, when it's due, open defects, and every document date that's coming up.

import { randomUUID } from "node:crypto";
import { todayISO } from "@/lib/dates";
import { dateStatus, datedDocs, defects, judgeDay, nextDue, type DateStatus, type Defect } from "@/lib/inspection";
import type { Inspection, Overall, User, Vehicle, VehicleKind } from "@/lib/types";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { getStore, type Store } from "./store";

export interface VehicleInput {
  kind: VehicleKind;
  unit: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  plate: string;
  defaultTrailerId?: string | null;
  notes: string;
}

function clean(input: VehicleInput): VehicleInput {
  const t = (s: string, max: number) => (s ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const out: VehicleInput = {
    kind: input.kind === "trailer" ? "trailer" : "truck",
    unit: t(input.unit, 20),
    vin: t(input.vin, 17).toUpperCase(),
    year: t(input.year, 4),
    make: t(input.make, 30),
    model: t(input.model, 40),
    plate: t(input.plate, 15).toUpperCase(),
    defaultTrailerId: input.defaultTrailerId || null,
    notes: t(input.notes, 300),
  };
  if (!out.unit) throw new ValidationError("Enter the unit number");
  if (out.year && !/^\d{4}$/.test(out.year)) throw new ValidationError("Year is 4 digits");
  return out;
}

function requireManager(user: User) {
  if (user.role !== "manager") throw new ForbiddenError("Only managers change the fleet list");
}

export async function addVehicle(user: User, input: VehicleInput, store: Store = getStore()): Promise<Vehicle> {
  requireManager(user);
  const v: Vehicle = { id: randomUUID(), ...clean(input), active: true, createdAt: new Date().toISOString() };
  if (v.kind === "trailer") v.defaultTrailerId = null;
  await store.saveVehicle(v);
  return v;
}

export async function updateVehicle(user: User, id: string, input: VehicleInput & { active?: boolean }, store: Store = getStore()): Promise<Vehicle> {
  requireManager(user);
  const old = await store.getVehicle(id);
  if (!old) throw new NotFoundError("Unit not found");
  const v: Vehicle = { ...old, ...clean({ ...input, kind: old.kind }), active: input.active ?? old.active };
  if (v.kind === "trailer") v.defaultTrailerId = null;
  await store.saveVehicle(v);
  return v;
}

export type DueStatus = "never" | DateStatus;

export interface TruckStatus {
  truck: Vehicle;
  trailer: Vehicle | null;
  last: Inspection | null;
  draft: Inspection | null;
  due: string | null;
  dueStatus: DueStatus;
  dueDays: number | null;
  overall: Overall | null;
  openDefects: Defect[];
  docsSoon: number;
  docsOverdue: number;
}

export interface DocRow {
  vehicle: Vehicle;
  label: string;
  itemId: string;
  date: string;
  status: DateStatus;
  days: number;
  inspectionId: string;
}

export interface FleetBoard {
  today: string;
  trucks: TruckStatus[];
  docs: DocRow[];
  defects: { inspection: Inspection; truck: Vehicle; defect: Defect }[];
  recent: Inspection[];
  vehicles: Vehicle[];
}

/** Open (unrepaired) defects of the latest signed-off inspection of each truck. */
export async function fleetBoard(store: Store = getStore(), today = todayISO()): Promise<FleetBoard> {
  const [vehicles, all] = await Promise.all([store.listVehicles(), store.listInspections()]);
  const byId = new Map(vehicles.map((v) => [v.id, v]));
  const certified = all.filter((i) => i.certifiedAt);

  const trucks: TruckStatus[] = vehicles
    .filter((v) => v.kind === "truck" && v.active)
    .map((truck): TruckStatus => {
      const last = certified.find((i) => i.truckId === truck.id) ?? null;
      const draft = all.find((i) => !i.certifiedAt && i.truckId === truck.id) ?? null;
      const due = last ? nextDue(last.certifiedAt!) : null;
      const ds = due ? dateStatus(due, today) : null;
      const openDefects = last ? defects(last, judgeDay(last, today)).filter((d) => !d.resolved) : [];
      return {
        truck,
        trailer: last?.trailerId ? byId.get(last.trailerId) ?? null : truck.defaultTrailerId ? byId.get(truck.defaultTrailerId) ?? null : null,
        last,
        draft,
        due,
        dueStatus: ds ? ds.status : "never",
        dueDays: ds ? ds.days : null,
        overall: last?.overall ?? null,
        openDefects,
        docsSoon: 0,
        docsOverdue: 0,
      };
    })
    .sort((a, b) => a.truck.unit.localeCompare(b.truck.unit, undefined, { numeric: true }));

  // Latest recorded date of each document for each unit.
  const latestDoc = new Map<string, DocRow>();
  for (const insp of certified) {
    for (const d of datedDocs(insp)) {
      const key = `${d.vehicleId}|${d.item.id}`;
      if (latestDoc.has(key)) continue; // `certified` is newest first
      const vehicle = byId.get(d.vehicleId);
      if (!vehicle || !vehicle.active) continue;
      const s = dateStatus(d.date, today);
      latestDoc.set(key, { vehicle, label: d.item.label, itemId: d.item.id, date: d.date, status: s.status, days: s.days, inspectionId: insp.id });
    }
  }
  const docs = [...latestDoc.values()].sort((a, b) => a.date.localeCompare(b.date));

  for (const t of trucks) {
    const mine = docs.filter((d) => d.vehicle.id === t.truck.id || (t.trailer && d.vehicle.id === t.trailer.id));
    t.docsSoon = mine.filter((d) => d.status === "soon").length;
    t.docsOverdue = mine.filter((d) => d.status === "overdue").length;
  }

  const defectRows = trucks.flatMap((t) => t.openDefects.map((defect) => ({ inspection: t.last!, truck: t.truck, defect })));

  return { today, trucks, docs, defects: defectRows, recent: all.slice(0, 12), vehicles };
}
