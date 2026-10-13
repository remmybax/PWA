import { TICKET_FIELDS, type FieldKey, type LoadFields } from "./fields";

/**
 * - driver: captures their own loads, views them, can't edit once logged
 * - dispatch: views, edits and exports every load; manages people
 * - viewer: access granted by dispatch to see (and export) every load, no editing
 */
export type Role = "driver" | "dispatch" | "viewer";

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Access switched off by dispatch. Kept (not deleted) so old loads still show who logged them. */
  active: boolean;
  createdAt: string;
  /** Digits only. Used to sign in (with a PIN) in the Supabase build. */
  phone?: string;
}

/**
 * - read: the app read it from the ticket with good confidence
 * - confirmed: the app flagged it and the driver confirmed or corrected it
 * - driver: entered by the driver (Reject, Station #, Wait Time, Comments)
 * - edited: changed by dispatch after logging (see history)
 */
export type FieldStatus = "read" | "confirmed" | "driver" | "edited";

export interface ChangeEntry {
  at: string;
  byUserId: string;
  byName: string;
  field: FieldKey;
  from: string;
  to: string;
  note?: string;
}

/** What the ticket reader returned, kept forever so the original reading is never lost. */
export interface TicketReading {
  reader: "gemini" | "claude" | "none" | "sample";
  model?: string;
  readAt: string;
  values: Partial<Record<FieldKey, string>>;
  confidence: Partial<Record<FieldKey, number>>;
  /** Fields the driver had to confirm before logging. */
  flagged: FieldKey[];
  notes?: string;
}

export interface Load {
  id: string;
  driverId: string;
  loggedAt: string;
  /** Storage key of the ticket photo; null for sample rows entered without a photo. */
  photoKey: string | null;
  fields: LoadFields;
  status: Record<FieldKey, FieldStatus>;
  reading: TicketReading | null;
  history: ChangeEntry[];
}

export type LoadSummaryStatus = "ok" | "typed" | "confirmed" | "edited";

/** True when the reader got nothing (no reader set up, or it failed): the driver typed the ticket in. */
export function nothingWasRead(reading: Pick<TicketReading, "values"> | null): boolean {
  // Only the ticket's own fields count: Reject/Station/Comments suggestions alone don't make a reading.
  return Boolean(reading) && !TICKET_FIELDS.some((f) => reading!.values[f.key]);
}

export function summaryStatus(load: Pick<Load, "status" | "reading">): LoadSummaryStatus {
  const values = Object.values(load.status);
  if (values.includes("edited")) return "edited";
  if (values.includes("confirmed")) return "confirmed";
  return nothingWasRead(load.reading) ? "typed" : "ok";
}
