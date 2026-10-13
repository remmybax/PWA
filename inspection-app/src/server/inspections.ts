// Every change to an inspection goes through here, so the rules hold for every screen and API route:
// only the inspector edits their own draft, a certified inspection never changes (except a later
// "repaired" note on a failed item), and nothing is certified while items are missing.

import { randomUUID } from "node:crypto";
import { CHECKLIST_VERSION, ITEM_BY_ID, sectionsFor } from "@/lib/checklist";
import { isValidISODate, todayISO } from "@/lib/dates";
import { defects, judgeDay, missing } from "@/lib/inspection";
import type { Inspection, ItemResult, Overall, PhotoRef, User } from "@/lib/types";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { newToken } from "./seed-data";
import { getStore, PHOTO_KEY, type Store } from "./store";

export const OVERALLS: Overall[] = ["in_service", "needs_repair", "out_of_service"];

export function canInspect(user: User): boolean {
  return user.role !== "viewer";
}

export function canResolve(user: User): boolean {
  return user.role === "manager" || user.role === "mechanic";
}

export function canSee(user: User, insp: Inspection): boolean {
  return user.role !== "driver" || insp.inspectorId === user.id;
}

export async function getVisibleInspection(user: User, id: string, store: Store = getStore()): Promise<Inspection> {
  const insp = await store.getInspection(id);
  if (!insp || !canSee(user, insp)) throw new NotFoundError("Inspection not found");
  return insp;
}

async function ownDraft(user: User, id: string, store: Store): Promise<Inspection> {
  const insp = await store.getInspection(id);
  if (!insp || insp.inspectorId !== user.id) throw new NotFoundError("Inspection not found");
  if (insp.certifiedAt) throw new ForbiddenError("This inspection is signed off and can't be changed");
  return insp;
}

export async function startInspection(
  user: User,
  input: { truckId: string; trailerId: string | null; location: string },
  store: Store = getStore(),
  now = new Date(),
): Promise<Inspection> {
  if (!canInspect(user)) throw new ForbiddenError("View-only access can't start inspections");
  const truck = await store.getVehicle(input.truckId);
  if (!truck || truck.kind !== "truck" || !truck.active) throw new ValidationError("Pick a truck from the list");
  let trailerId: string | null = null;
  if (input.trailerId) {
    const trailer = await store.getVehicle(input.trailerId);
    if (!trailer || trailer.kind !== "trailer" || !trailer.active) throw new ValidationError("Pick a trailer from the list");
    trailerId = trailer.id;
  }
  const location = input.location.trim().slice(0, 80);

  // Picking the same truck again carries on with the draft instead of starting a second one.
  const drafts = await store.listInspections({ truckId: truck.id, inspectorId: user.id, certified: false });
  if (drafts[0]) return drafts[0];

  const at = now.toISOString();
  const insp: Inspection = {
    id: randomUUID(),
    token: newToken(),
    truckId: truck.id,
    trailerId,
    inspectorId: user.id,
    inspectorName: user.name,
    location,
    checklistVersion: CHECKLIST_VERSION,
    startedAt: at,
    updatedAt: at,
    certifiedAt: null,
    overall: null,
    comments: "",
    signature: "",
    results: {},
  };
  await store.createInspection(insp);
  return insp;
}

function cleanPhotos(photos: unknown): PhotoRef[] {
  if (!Array.isArray(photos)) return [];
  const out: PhotoRef[] = [];
  for (const p of photos.slice(0, 6)) {
    const key = String((p as PhotoRef)?.key ?? "");
    const takenAt = String((p as PhotoRef)?.takenAt ?? "");
    if (PHOTO_KEY.test(key) && !Number.isNaN(Date.parse(takenAt))) out.push({ key, takenAt });
  }
  return out;
}

/** Checks and tidies what the phone sent for one item. */
export function cleanResult(itemId: string, raw: Partial<ItemResult>): ItemResult {
  const item = ITEM_BY_ID[itemId];
  if (!item) throw new ValidationError("Unknown checklist item");
  const r: ItemResult = { photos: cleanPhotos(raw.photos) };
  if (raw.verdict === "pass" || raw.verdict === "fail" || raw.verdict === "na") r.verdict = raw.verdict;
  if (typeof raw.value === "string" && raw.value.trim()) {
    const v = raw.value.trim().slice(0, 40);
    if ((item.kind === "reading" || item.kind === "count") && !/^\d+(\.\d+)?$/.test(v)) {
      throw new ValidationError("Numbers only (use a decimal point, no fractions)");
    }
    r.value = v;
  }
  if (typeof raw.date === "string" && raw.date) {
    if (!isValidISODate(raw.date)) throw new ValidationError("That date isn't valid");
    r.date = raw.date;
  }
  if (typeof raw.note === "string" && raw.note.trim()) r.note = raw.note.trim().slice(0, 500);
  return r;
}

export async function saveItemResult(
  user: User,
  inspectionId: string,
  itemId: string,
  raw: Partial<ItemResult>,
  store: Store = getStore(),
): Promise<ItemResult> {
  const insp = await ownDraft(user, inspectionId, store);
  const applies = sectionsFor(Boolean(insp.trailerId)).some((s) => s.items.some((i) => i.id === itemId));
  if (!applies) throw new ValidationError("That item isn't part of this inspection");
  const result = cleanResult(itemId, raw);
  await store.saveItem(insp.id, itemId, result);
  return result;
}

export async function updateDraft(
  user: User,
  inspectionId: string,
  change: { location?: string; trailerId?: string | null; comments?: string },
  store: Store = getStore(),
): Promise<Inspection> {
  const insp = await ownDraft(user, inspectionId, store);
  const next = { ...insp, updatedAt: new Date().toISOString() };
  if (change.location !== undefined) next.location = change.location.trim().slice(0, 80);
  if (change.comments !== undefined) next.comments = change.comments.trim().slice(0, 2000);
  if (change.trailerId !== undefined) {
    if (change.trailerId) {
      const t = await store.getVehicle(change.trailerId);
      if (!t || t.kind !== "trailer") throw new ValidationError("Pick a trailer from the list");
    }
    next.trailerId = change.trailerId || null;
  }
  await store.saveInspectionHeader(next);
  return next;
}

export async function certify(
  user: User,
  inspectionId: string,
  input: { overall: string; comments: string; signature: string },
  store: Store = getStore(),
  now = new Date(),
): Promise<Inspection> {
  const insp = await ownDraft(user, inspectionId, store);
  const today = todayISO(now);
  const left = missing(insp, today);
  if (left.length) throw new ValidationError(`${left.length} item${left.length === 1 ? " is" : "s are"} not finished`);
  const overall = OVERALLS.find((o) => o === input.overall);
  if (!overall) throw new ValidationError("Choose the truck's overall status");
  if (overall === "in_service" && defects(insp, today).length) {
    throw new ValidationError("There are failed items. Choose Needs repair or Out of service.");
  }
  const signature = input.signature.trim().replace(/\s+/g, " ").slice(0, 80);
  if (signature.length < 2) throw new ValidationError("Type your name to sign");
  const at = now.toISOString();
  const next: Inspection = {
    ...insp,
    overall,
    comments: input.comments.trim().slice(0, 2000),
    signature,
    certifiedAt: at,
    updatedAt: at,
  };
  await store.saveInspectionHeader(next);
  return next;
}

export async function discardDraft(user: User, inspectionId: string, store: Store = getStore()): Promise<void> {
  const insp = await ownDraft(user, inspectionId, store);
  await store.deleteInspection(insp.id);
}

/** A manager or the shop marks a failed item on a signed-off inspection as repaired (or undoes it). */
export async function resolveDefect(
  user: User,
  inspectionId: string,
  itemId: string,
  input: { note: string; photo?: PhotoRef | null; undo?: boolean },
  store: Store = getStore(),
  now = new Date(),
): Promise<void> {
  if (!canResolve(user)) throw new ForbiddenError("Only managers and the shop mark defects repaired");
  const insp = await store.getInspection(inspectionId);
  if (!insp) throw new NotFoundError("Inspection not found");
  if (!insp.certifiedAt) throw new ValidationError("The inspection isn't signed off yet");
  const result = insp.results[itemId];
  const failed = defects(insp, judgeDay(insp, todayISO(now))).some((d) => d.item.id === itemId);
  if (!result || !failed) throw new ValidationError("That item didn't fail");
  if (input.undo) {
    await store.saveItem(insp.id, itemId, { ...result, resolution: null });
    return;
  }
  const note = input.note.trim().slice(0, 500);
  if (!note) throw new ValidationError("Say what was done");
  const photo = input.photo ? cleanPhotos([input.photo])[0] ?? null : null;
  await store.saveItem(insp.id, itemId, {
    ...result,
    resolution: { status: "repaired", byId: user.id, byName: user.name, at: now.toISOString(), note, photo },
  });
}
