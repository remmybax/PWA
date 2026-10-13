// Reads a run ticket photo into the sheet's ticket fields.
//
// Which reader runs (TICKET_READER overrides):
//   gemini  when GEMINI_API_KEY is set (free tier)
//   claude  when ANTHROPIC_API_KEY is set
//   none    otherwise: the driver types the fields in from the photo
// If a reader fails (no signal, outage, free-tier limit) the driver types the fields in instead.

import { FIELD_BY_KEY, READ_FIELDS, type FieldKey } from "@/lib/fields";
import { normalizeField, stationCode } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import type { ReaderResult } from "./types";

export type { ReaderResult };

export type ReaderName = ReaderResult["reader"];

export function activeReader(): ReaderName {
  const forced = process.env.TICKET_READER;
  if (forced === "none" || forced === "gemini" || forced === "claude") return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "claude";
  return "none";
}

async function rawRead(photo: Buffer, contentType: string): Promise<ReaderResult> {
  const reader = activeReader();
  if (reader === "none" || reader === "sample") return { reader: "none", values: {}, confidence: {} };
  try {
    if (reader === "gemini") {
      const { geminiReadTicket } = await import("./gemini");
      return await geminiReadTicket(photo, contentType);
    }
    const { claudeReadTicket } = await import("./claude");
    return await claudeReadTicket(photo, contentType);
  } catch (e) {
    console.error("Ticket reader failed", e);
    return { reader, values: {}, confidence: {}, notes: "The app couldn't read this photo" };
  }
}

/**
 * Normalizes what the reader returned into stored form. A value that doesn't parse (e.g. a gauge
 * like "14 3") is kept as read but its confidence is dropped so the driver has to check it.
 */
export function normalizeReading(r: ReaderResult, refISO: string): ReaderResult {
  const gmN = normalizeField("gm", r.values.gm ?? "", { gm: "", refISO });
  const gm = gmN.ok ? gmN.value : "";
  const values: ReaderResult["values"] = {};
  const confidence: ReaderResult["confidence"] = {};
  for (const def of READ_FIELDS) {
    const key = def.key as FieldKey;
    const raw = r.values[key] ?? "";
    let conf = r.confidence[key] ?? 0;
    if (gm === "M" && FIELD_BY_KEY[key].gaugeOnly) {
      values[key] = "";
      confidence[key] = 1;
      continue;
    }
    const n = normalizeField(key, key === "station" ? stationCode(raw) : raw, { gm, refISO });
    if (!n.ok) conf = Math.min(conf, 0.3);
    values[key] = n.value;
    confidence[key] = conf;
  }
  return { ...r, values, confidence };
}

export async function readTicket(photo: Buffer, contentType: string, now = new Date()): Promise<ReaderResult> {
  return normalizeReading(await rawRead(photo, contentType), todayISO(now));
}

/** Calls the configured AI reader directly, without the type-it-in fallback (for measuring accuracy). */
export async function aiRead(photo: Buffer, contentType: string): Promise<ReaderResult> {
  const reader = activeReader();
  if (reader === "gemini") return (await import("./gemini")).geminiReadTicket(photo, contentType);
  if (reader === "claude") return (await import("./claude")).claudeReadTicket(photo, contentType);
  throw new Error("No AI reader configured. Set GEMINI_API_KEY (or ANTHROPIC_API_KEY) in .env.local.");
}

export async function activeModel(): Promise<string> {
  const reader = activeReader();
  if (reader === "gemini") return (await import("./gemini")).geminiModel();
  if (reader === "claude") return (await import("./claude")).claudeModel();
  return reader;
}
