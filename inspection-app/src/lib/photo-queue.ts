"use client";

// Photos taken with no signal wait here (IndexedDB, on the phone) and upload by themselves once
// there's signal. An uploaded photo is attached to its item the next time that item is on screen
// (straight away if it already is), then removed from the queue.

import { ApiError, uploadPhoto } from "./client-api";
import type { PhotoRef } from "./types";

export interface QueuedPhoto {
  id: string;
  inspectionId: string;
  itemId: string;
  blob: Blob;
  queuedAt: string;
  /** Set once uploaded; waiting to be attached to the item. */
  ref?: PhotoRef;
}

export const PHOTO_UPLOADED = "queued-photo-uploaded";

const DB = "inspection-photo-queue";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

export async function enqueuePhoto(inspectionId: string, itemId: string, blob: Blob): Promise<QueuedPhoto> {
  const entry: QueuedPhoto = { id: crypto.randomUUID(), inspectionId, itemId, blob, queuedAt: new Date().toISOString() };
  await tx("readwrite", (s) => s.put(entry));
  return entry;
}

export async function queuedPhotos(inspectionId?: string, itemId?: string): Promise<QueuedPhoto[]> {
  try {
    const all = ((await tx("readonly", (s) => s.getAll())) ?? []) as QueuedPhoto[];
    return all.filter((p) => (!inspectionId || p.inspectionId === inspectionId) && (!itemId || p.itemId === itemId));
  } catch {
    return [];
  }
}

export async function removeQueued(id: string): Promise<void> {
  await tx("readwrite", (s) => s.delete(id));
}

let flushing: Promise<number> | null = null;

/** Uploads what's waiting. Returns how many are still not uploaded. */
export function flushPhotos(): Promise<number> {
  flushing ??= (async () => {
    try {
      for (const p of await queuedPhotos()) {
        if (p.ref) continue;
        try {
          const ref = await uploadPhoto(p.blob);
          const done = { ...p, ref };
          await tx("readwrite", (s) => s.put(done));
          window.dispatchEvent(new CustomEvent(PHOTO_UPLOADED, { detail: done }));
        } catch (e) {
          if (e instanceof ApiError) await removeQueued(p.id); // refused by the server; retrying won't help
          else break; // still no signal
        }
      }
      return (await queuedPhotos()).filter((p) => !p.ref).length;
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}
