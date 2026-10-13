"use client";

// Calls from the phone to the app server. Item answers that can't be sent (no signal) wait in an
// outbox in the phone's storage and go out by themselves when the signal comes back.

import type { ItemResult, PhotoRef } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(body.error ?? "Something went wrong. Try again.", res.status);
  return body as T;
}

export async function uploadPhoto(blob: Blob): Promise<PhotoRef> {
  const form = new FormData();
  form.append("photo", blob, "photo.jpg");
  return json<PhotoRef>(await fetch("/api/photos", { method: "POST", body: form }));
}

export { photoUrl } from "./client-urls";

const OUTBOX = "inspection-outbox";

type Outbox = Record<string, { inspectionId: string; itemId: string; result: ItemResult }>;

function readOutbox(): Outbox {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX) ?? "{}") as Outbox;
  } catch {
    return {};
  }
}

function writeOutbox(o: Outbox) {
  try {
    if (Object.keys(o).length) localStorage.setItem(OUTBOX, JSON.stringify(o));
    else localStorage.removeItem(OUTBOX);
  } catch {
    // storage full or blocked: the answer still shows as "not saved" so the driver can retry
  }
}

export function outboxCount(inspectionId?: string): number {
  return Object.values(readOutbox()).filter((x) => !inspectionId || x.inspectionId === inspectionId).length;
}

async function put(inspectionId: string, itemId: string, result: ItemResult): Promise<ItemResult> {
  const res = await fetch(`/api/inspections/${inspectionId}/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(result),
  });
  return (await json<{ result: ItemResult }>(res)).result;
}

export type SaveOutcome = { saved: true; result: ItemResult } | { saved: false; queued: boolean; error: string };

export async function saveItem(inspectionId: string, itemId: string, result: ItemResult): Promise<SaveOutcome> {
  const key = `${inspectionId}|${itemId}`;
  // This answer is newer than anything queued for the item, so the queued one must never be sent
  // after it. Drop it now; if this send fails, this answer is queued instead.
  const before = readOutbox();
  if (before[key]) {
    delete before[key];
    writeOutbox(before);
  }
  try {
    return { saved: true, result: await put(inspectionId, itemId, result) };
  } catch (e) {
    if (e instanceof ApiError) return { saved: false, queued: false, error: e.message };
    const o = readOutbox();
    o[key] = { inspectionId, itemId, result };
    writeOutbox(o);
    return { saved: false, queued: true, error: "No signal. Saved on the phone, sends when signal is back." };
  }
}

/** Sends whatever is waiting. Returns how many are still waiting. */
export async function flushOutbox(): Promise<number> {
  for (const key of Object.keys(readOutbox())) {
    // Read again each time: a newer answer may have replaced or cleared this one meanwhile.
    const x = readOutbox()[key];
    if (!x) continue;
    try {
      await put(x.inspectionId, x.itemId, x.result);
    } catch (e) {
      if (!(e instanceof ApiError)) break; // still no signal
      // The server refused it; retrying won't help, so drop it.
    }
    const o = readOutbox();
    if (o[key] === undefined || JSON.stringify(o[key]) !== JSON.stringify(x)) continue; // replaced meanwhile
    delete o[key];
    writeOutbox(o);
  }
  return Object.keys(readOutbox()).length;
}
