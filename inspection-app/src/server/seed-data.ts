// Demo data for the local store: a small fleet with a spread of situations, so every screen has
// something to show. Dates are relative to "now" so the demo always has something due, overdue
// and expiring soon, whenever it's run. Real data never comes from here (the Supabase build starts empty).

import path from "node:path";
import { randomBytes } from "node:crypto";
import { CHECKLIST_VERSION, sectionsFor, type ChecklistItem } from "@/lib/checklist";
import { addDays, addMonths, isoInZone } from "@/lib/dates";
import type { Inspection, ItemResult, Overall, User, Vehicle } from "@/lib/types";

export const SEED_PHOTO_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "seed-photos");

export function newToken(): string {
  return randomBytes(18).toString("base64url");
}

const T0 = "2026-01-05T15:00:00.000Z";

export const SEED_USERS: User[] = [
  { id: "u-dan", name: "Dan V.", role: "manager", active: true, createdAt: T0 },
  { id: "u-kevin", name: "Kevin (Safety)", role: "manager", active: true, createdAt: T0 },
  { id: "u-mike", name: "Mike Reyes", role: "driver", active: true, createdAt: T0 },
  { id: "u-jose", name: "Jose Garza", role: "driver", active: true, createdAt: T0 },
  { id: "u-travis", name: "Travis Webb", role: "driver", active: true, createdAt: T0 },
  { id: "u-luis", name: "Luis Ortega", role: "driver", active: true, createdAt: T0 },
  { id: "u-ray", name: "Ray (Shop)", role: "mechanic", active: true, createdAt: T0 },
  { id: "u-office", name: "Office", role: "viewer", active: true, createdAt: T0 },
];

function truck(unit: string, year: string, make: string, model: string, vin: string, plate: string, trailer: string | null): Vehicle {
  return { id: `v-${unit}`, kind: "truck", unit, vin, year, make, model, plate, defaultTrailerId: trailer, notes: "", active: true, createdAt: T0 };
}
function trailer(unit: string, year: string, make: string, model: string, vin: string, plate: string): Vehicle {
  return { id: `v-${unit.toLowerCase()}`, kind: "trailer", unit, vin, year, make, model, plate, notes: "", active: true, createdAt: T0 };
}

export const SEED_VEHICLES: Vehicle[] = [
  truck("101", "2021", "Mack", "Pinnacle", "1M1AN4GY5MM014101", "R12-4471", "v-t-201"),
  truck("102", "2020", "Peterbilt", "579", "1XPBD49X8LD620102", "R12-4472", "v-t-202"),
  truck("103", "2022", "Kenworth", "T880", "1NKZX4TX2NJ310103", "R12-4473", "v-t-203"),
  truck("104", "2019", "Mack", "Anthem", "1M1AN4GY3KM004104", "R12-4474", "v-t-204"),
  truck("105", "2021", "Freightliner", "Cascadia", "3AKJHHDR7MSM20105", "R12-4475", null),
  truck("106", "2018", "Peterbilt", "389", "1XPXD49X6JD440106", "R12-4476", "v-t-205"),
  trailer("T-201", "2020", "Heil", "Crude tanker 180 bbl", "5HTAB4321L7H00201", "TR-88201"),
  trailer("T-202", "2019", "Heil", "Crude tanker 180 bbl", "5HTAB4320K7H00202", "TR-88202"),
  trailer("T-203", "2022", "Polar", "Crude tanker 200 bbl", "1PMS44529N1000203", "TR-88203"),
  trailer("T-204", "2018", "Heil", "Crude tanker 180 bbl", "5HTAB4329J7H00204", "TR-88204"),
  trailer("T-205", "2021", "Polar", "Crude tanker 200 bbl", "1PMS44527M1000205", "TR-88205"),
];

// Which demo photo stands in for each item's photo.
const PHOTO_FOR: Record<string, string> = {
  odometer: "dash",
  "truck-vin": "zone1",
  "trailer-vin": "zone7",
  "truck-registration": "doc-registration",
  "trailer-registration": "doc-registration",
  insurance: "doc-insurance",
  ifta: "doc-generic",
  "truck-annual": "doc-annual",
  "trailer-annual": "doc-annual",
  "tank-vk": "doc-annual",
  "tank-ip": "doc-annual",
  "hazmat-registration": "doc-generic",
  "eld-docs": "doc-generic",
  "extinguisher-tag": "doc-tag",
  "h2s-calibration": "doc-tag",
  permits: "doc-generic",
  extinguisher: "zone3",
  triangles: "zone4",
  "spill-kit": "zone6",
  "gauging-kit": "zone6",
  "front-lights": "zone3",
  "steer-tread-left": "zone3",
  "steer-tread-right": "zone3",
  "drive-tread-left": "zone4",
  "drive-tread-right": "zone6",
  brakes: "zone4",
  "fifth-wheel": "zone5",
  "body-driver": "zone4",
  "body-passenger": "zone6",
  leaks: "zone5",
  "engine-bay": "zone1",
  "tank-driver": "zone7",
  "tank-passenger": "zone9",
  domes: "zone7",
  outlets: "zone8",
  placards: "zone8",
  "trailer-tread-left": "zone7",
  "trailer-tread-right": "zone9",
  "trailer-lights": "zone8",
  "dash-lights": "dash",
  "cab-clean": "zone2",
};

function photo(itemId: string, takenAt: string) {
  return { key: `seed-${PHOTO_FOR[itemId] ?? "zone2"}.jpg`, takenAt };
}

/** Months from the inspection day until each dated document expires, for an all-good truck. */
const DOC_MONTHS: Record<string, number> = {
  "truck-registration": 7,
  "trailer-registration": 7,
  insurance: 5,
  ifta: 3,
  "truck-annual": 8,
  "trailer-annual": 9,
  "tank-vk": 6,
  "tank-ip": 30,
  "hazmat-registration": 9,
  "extinguisher-tag": 10,
  "h2s-calibration": 4,
  permits: 11,
};

let seq = 0;
function n(min: number, max: number): number {
  seq = (seq * 9301 + 49297) % 233280;
  return min + Math.floor((seq / 233280) * (max - min + 1));
}

function passResult(item: ChecklistItem, day: string, at: string, truckV: Vehicle, trailerV: Vehicle | null): ItemResult {
  const r: ItemResult = { photos: item.photo === "required" ? [photo(item.id, at)] : [] };
  switch (item.kind) {
    case "reading":
      if (item.id === "odometer") r.value = String(380_000 + n(0, 60_000));
      else if (item.id === "engine-hours") r.value = String(16_000 + n(0, 4_000));
      else r.value = String(item.min !== undefined ? item.min + n(5, 10) : n(1, 100));
      break;
    case "count":
      r.value = String(item.expected ?? 1);
      break;
    case "text":
      r.value = (item.unit_of === "trailer" ? trailerV?.vin : truckV.vin)?.slice(-6) ?? "";
      break;
    case "doc":
      r.verdict = "pass";
      if (item.date) r.date = addMonths(day, DOC_MONTHS[item.id] ?? 6);
      break;
    default:
      r.verdict = "pass";
  }
  return r;
}

interface Plan {
  truck: string;
  trailer: string | null;
  inspector: string;
  daysAgo: number;
  location: string;
  overall: Overall | null;
  comments?: string;
  /** Per-item changes on top of an all-pass inspection. */
  changes?: (r: Record<string, ItemResult>, day: string, at: string) => void;
  /** Items left unanswered (drafts). */
  stopAfterSection?: number;
}

function inspectionFrom(p: Plan, now: Date, idx: number): Inspection {
  const truckV = SEED_VEHICLES.find((v) => v.id === p.truck)!;
  const trailerV = p.trailer ? SEED_VEHICLES.find((v) => v.id === p.trailer)! : null;
  const inspector = SEED_USERS.find((u) => u.id === p.inspector)!;
  const started = new Date(now.getTime() - p.daysAgo * 86_400_000 - 3 * 3600_000);
  const certified = p.overall ? new Date(started.getTime() + 52 * 60_000) : null;
  const day = isoInZone(started);
  const at = new Date(started.getTime() + 20 * 60_000).toISOString();
  const results: Record<string, ItemResult> = {};
  sectionsFor(Boolean(trailerV)).forEach((s, si) => {
    if (p.stopAfterSection !== undefined && si > p.stopAfterSection) return;
    for (const item of s.items) results[item.id] = passResult(item, day, at, truckV, trailerV);
  });
  p.changes?.(results, day, at);
  return {
    id: `i-demo-${idx}`,
    token: newToken(),
    truckId: truckV.id,
    trailerId: trailerV?.id ?? null,
    inspectorId: inspector.id,
    inspectorName: inspector.name,
    location: p.location,
    checklistVersion: CHECKLIST_VERSION,
    startedAt: started.toISOString(),
    updatedAt: (certified ?? started).toISOString(),
    certifiedAt: certified?.toISOString() ?? null,
    overall: p.overall,
    comments: p.comments ?? "",
    signature: certified ? inspector.name : "",
    results,
  };
}

export function buildSeed(now = new Date()): { users: User[]; vehicles: Vehicle[]; inspections: Inspection[] } {
  seq = 7;
  const today = isoInZone(now);
  const plans: Plan[] = [
    {
      truck: "v-101",
      trailer: "v-t-201",
      inspector: "u-mike",
      daysAgo: 38,
      location: "Odessa yard",
      overall: "in_service",
    },
    {
      truck: "v-101",
      trailer: "v-t-201",
      inspector: "u-mike",
      daysAgo: 8,
      location: "Odessa yard",
      overall: "in_service",
      comments: "Insurance card is the old one; new card should be in the mail.",
      changes: (r) => {
        r.insurance.date = addDays(today, 19);
      },
    },
    {
      truck: "v-102",
      trailer: "v-t-202",
      inspector: "u-jose",
      daysAgo: 12,
      location: "Midland yard",
      overall: "needs_repair",
      comments: "Steer tire is close to the limit, shop is ordering one.",
      changes: (r, _day, at) => {
        r["steer-tread-left"] = { value: "3", note: "Outside edge worn down, 3/32 at the shoulder.", photos: [photo("steer-tread-left", at)] };
        r.triangles = {
          value: "2",
          note: "Only 2 triangles in the box.",
          photos: [photo("triangles", at)],
          resolution: { status: "repaired", byId: "u-ray", byName: "Ray (Shop)", at: new Date(now.getTime() - 10 * 86_400_000).toISOString(), note: "Added a third triangle from the shop stock." },
        };
        r["truck-annual"].date = addDays(today, 16);
      },
    },
    {
      truck: "v-103",
      trailer: "v-t-203",
      inspector: "u-travis",
      daysAgo: 3,
      location: "Pecos lease road",
      overall: "out_of_service",
      comments: "Air leak at the rear drive axle chamber. Parked at the yard until the shop looks at it.",
      changes: (r, _day, at) => {
        r.brakes = { verdict: "fail", note: "Audible air leak at the rear drive axle brake chamber, driver side.", photos: [photo("brakes", at)] };
        r["air-test"] = { verdict: "fail", note: "Leak-down 6 psi in a minute with brakes applied.", photos: [photo("dash-lights", at)] };
        r.placards = { verdict: "fail", note: "Rear placard faded and peeling.", photos: [photo("placards", at)] };
        r["h2s-calibration"].date = addDays(today, 9);
      },
    },
    {
      truck: "v-104",
      trailer: "v-t-204",
      inspector: "u-luis",
      daysAgo: 44,
      location: "Odessa yard",
      overall: "in_service",
      changes: (r) => {
        r["tank-vk"].date = addDays(today, -6);
        r.ifta.date = addDays(today, 25);
      },
    },
    {
      truck: "v-105",
      trailer: null,
      inspector: "u-mike",
      daysAgo: 20,
      location: "Odessa yard",
      overall: "in_service",
      comments: "Bobtail, trailer at the wash.",
    },
    {
      truck: "v-104",
      trailer: "v-t-204",
      inspector: "u-jose",
      daysAgo: 0,
      location: "Odessa yard",
      overall: null,
      stopAfterSection: 1,
    },
  ];
  return {
    users: structuredClone(SEED_USERS),
    vehicles: structuredClone(SEED_VEHICLES),
    inspections: plans.map((p, i) => inspectionFrom(p, now, i + 1)),
  };
}
