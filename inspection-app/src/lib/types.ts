/**
 * - driver: does inspections, sees their own
 * - manager: everything: dashboard, fleet, people, marks defects repaired
 * - mechanic: sees the dashboard and marks defects repaired; no fleet or people changes
 * - viewer: sees the dashboard, changes nothing
 */
export type Role = "driver" | "manager" | "mechanic" | "viewer";

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Switched off by a manager. Kept so old inspections still show who did them. */
  active: boolean;
  createdAt: string;
  /** Digits only. Used to sign in (with a PIN) in the Supabase build. */
  phone?: string;
}

export type VehicleKind = "truck" | "trailer";

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  /** Unit number painted on the truck, e.g. "104" or "T-212". Unique per kind. */
  unit: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  plate: string;
  /** Usual trailer for a truck (pre-selected at setup). */
  defaultTrailerId?: string | null;
  notes: string;
  active: boolean;
  createdAt: string;
}

export type Verdict = "pass" | "fail" | "na";

export interface PhotoRef {
  key: string;
  takenAt: string;
}

export interface Resolution {
  status: "repaired";
  byId: string;
  byName: string;
  at: string;
  note: string;
  photo?: PhotoRef | null;
}

export interface ItemResult {
  /** What the inspector tapped. Readings and counts with a limit work this out themselves. */
  verdict?: Verdict;
  /** Number for readings/counts, text for text items. */
  value?: string;
  /** ISO date for documents with an expiration or due date. */
  date?: string;
  note?: string;
  photos: PhotoRef[];
  /** Set by a manager or mechanic after the inspection, when a failed item is fixed. */
  resolution?: Resolution | null;
}

export type Overall = "in_service" | "needs_repair" | "out_of_service";

export interface Inspection {
  id: string;
  /** Long random string in the QR link. Whoever holds it can view this report, read-only. */
  token: string;
  truckId: string;
  trailerId: string | null;
  inspectorId: string;
  inspectorName: string;
  location: string;
  checklistVersion: string;
  startedAt: string;
  updatedAt: string;
  certifiedAt: string | null;
  overall: Overall | null;
  comments: string;
  /** Name typed at sign-off. */
  signature: string;
  results: Record<string, ItemResult>;
}

export const OVERALL_LABEL: Record<Overall, string> = {
  in_service: "In service",
  needs_repair: "Needs repair (can run)",
  out_of_service: "Out of service",
};

export const ROLE_LABEL: Record<Role, string> = {
  driver: "Driver",
  manager: "Manager",
  mechanic: "Mechanic / shop",
  viewer: "View only",
};
