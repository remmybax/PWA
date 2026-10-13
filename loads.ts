// Business rules for loads. Every read and write goes through here with the signed-in user, so
// the permission table in CLAUDE.md is enforced in one place (and mirrored by row-level security
// once the data lives in Supabase).

import { randomUUID } from "node:crypto";
import { ALWAYS_CHECK, FIELD_BY_KEY, TICKET_FIELDS, FIELD_KEYS, requiredTicketFields, type FieldKey, type LoadFields } from "@/lib/fields";
import { validateLoad, type FieldProblem } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { nothingWasRead, type ChangeEntry, type FieldStatus, type Load, type TicketReading, type User } from "@/lib/types";
import { getStore, DuplicateTicketError, type LoadQuery, type Store } from "./store";

export class ForbiddenError extends Error {}
export class NotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public problems: FieldProblem[]) {
    super("Some fields need attention");
  }
}
export { DuplicateTicketError };

export function canSeeAllLoads(user: User): boolean {
  return user.role === "dispatch" || user.role === "viewer";
}

export function canEditLoads(user: User): boolean {
  return user.role === "dispatch";
}

export async function listLoadsFor(user: User, q: LoadQuery = {}, store: Store = getStore()): Promise<Load[]> {
  if (canSeeAllLoads(user)) return store.listLoads(q);
  // Drivers only ever see their own loads, whatever filter they ask for.
  return store.listLoads({ ...q, driverId: user.id });
}

export async function getLoadFor(user: User, id: string, store: Store = getStore()): Promise<Load> {
  const load = await store.getLoad(id);
  if (!load || (!canSeeAllLoads(user) && load.driverId !== user.id)) throw new NotFoundError("Load not found");
  return load;
}

/** Confidence below this and the driver must confirm the field before logging. */
export const CONFIDENCE_THRESHOLD = 0.85;


/** Which ticket fields the driver has to check: low confidence, or missing but required. */
export function flaggedFields(values: Partial<LoadFields>, confidence: Partial<Record<FieldKey, number>>): FieldKey[] {
  const required = new Set(requiredTicketFields(values.gm ?? ""));
  const nothingRead = TICKET_FIELDS.every((f) => !values[f.key]);
  return FIELD_KEYS.filter((k) => {
    if (FIELD_BY_KEY[k].source !== "ticket") return false;
    // Reader failed or it wasn't a ticket: the driver types every field in.
    if (nothingRead) return true;
    const empty = !values[k];
    if (empty) return required.has(k);
    return (confidence[k] ?? 0) < CONFIDENCE_THRESHOLD;
  });
}

export async function recordReading(
  driver: User,
  photoKey: string,
  reading: Omit<TicketReading, "flagged">,
  store: Store = getStore(),
): Promise<TicketReading> {
  if (driver.role !== "driver") throw new ForbiddenError("Only drivers log loads");
  const full: TicketReading = { ...reading, flagged: flaggedFields(reading.values, reading.confidence) };
  await store.putPendingReading({ photoKey, driverId: driver.id, reading: full });
  return full;
}

export interface LogLoadInput {
  photoKey: string;
  /** All 18 values as the driver submits them (ticket fields possibly corrected). */
  fields: Partial<LoadFields>;
  /** Fields the driver ticked "Matches the ticket" for, or corrected. */
  confirmed: FieldKey[];
}

export async function logLoad(driver: User, input: LogLoadInput, store: Store = getStore(), now = new Date()): Promise<Load> {
  if (driver.role !== "driver") throw new ForbiddenError("Only drivers log loads");
  const pending = await store.getPendingReading(input.photoKey);
  if (!pending || pending.driverId !== driver.id) throw new NotFoundError("That ticket photo has expired. Scan it again.");
  const { reading } = pending;

  const submitted: Partial<LoadFields> = { ...input.fields };
  if (!submitted.reject) submitted.reject = "N";
  if (!submitted.waitTime) submitted.waitTime = "0";

  const { fields, problems } = validateLoad(submitted, {
    refISO: todayISO(now),
    required: [...requiredTicketFields(submitted.gm ?? ""), "reject", "station"],
  });

  const confirmed = new Set(input.confirmed);
  const mustCheck = nothingWasRead(reading) ? reading.flagged : [...new Set([...reading.flagged, ...ALWAYS_CHECK])];
  const unconfirmed = mustCheck.filter((k) => !confirmed.has(k));
  for (const key of unconfirmed) {
    if (!problems.some((p) => p.key === key)) problems.push({ key, error: "Check this against the ticket" });
  }
  if (problems.length) throw new ValidationError(problems);

  // Typed in from the photo (no reading): every field is the driver's, not a flagged confirmation.
  const typed = nothingWasRead(reading);
  const status = {} as Record<FieldKey, FieldStatus>;
  for (const key of FIELD_KEYS) {
    if (FIELD_BY_KEY[key].source === "driver" || typed) status[key] = "driver";
    else if (reading.flagged.includes(key) || (reading.values[key] ?? "") !== fields[key]) status[key] = "confirmed";
    else status[key] = "read";
  }

  const load: Load = {
    id: randomUUID(),
    driverId: driver.id,
    loggedAt: now.toISOString(),
    photoKey: input.photoKey,
    fields,
    status,
    reading,
    history: [],
  };
  await store.insertLoad(load);
  return load;
}

export async function editLoad(
  user: User,
  id: string,
  changes: Partial<LoadFields>,
  note: string | undefined,
  store: Store = getStore(),
  now = new Date(),
): Promise<Load> {
  if (!canEditLoads(user)) throw new ForbiddenError("Only dispatch can edit a logged load");
  const load = await store.getLoad(id);
  if (!load) throw new NotFoundError("Load not found");

  const merged = { ...load.fields, ...changes };
  const { fields, problems } = validateLoad(merged, {
    refISO: load.fields.date || todayISO(now),
    required: [...requiredTicketFields(merged.gm ?? ""), "reject"],
  });
  // Only complain about fields dispatch touched (or that the edit made invalid).
  const relevant = problems.filter((p) => p.key in changes || fields[p.key] !== load.fields[p.key]);
  if (relevant.length) throw new ValidationError(relevant);

  const at = now.toISOString();
  const history: ChangeEntry[] = [];
  const status = { ...load.status };
  for (const key of FIELD_KEYS) {
    if (fields[key] === load.fields[key]) continue;
    history.push({ at, byUserId: user.id, byName: user.name, field: key, from: load.fields[key], to: fields[key], note: note || undefined });
    status[key] = "edited";
  }
  if (!history.length) return load;

  const updated: Load = { ...load, fields, status, history: [...load.history, ...history] };
  await store.updateLoad(updated, history);
  return updated;
}

