// What every AI ticket reader is asked for: the same prompt and output schema, so Gemini and
// Claude are interchangeable. Generated from FIELDS in src/lib/fields.ts, so adding a field Craig
// asks for (net barrels, BOL #) means adding it there; nothing here changes.

import { z } from "zod";
import { READ_FIELDS, type FieldKey } from "@/lib/fields";
import type { ReaderResult } from "./types";

const Reading = z.object({ value: z.string(), confidence: z.number() });

export const TicketSchema = z.object({
  is_run_ticket: z.boolean(),
  fields: z.object(Object.fromEntries(READ_FIELDS.map((f) => [f.key, Reading])) as Record<FieldKey, typeof Reading>),
  notes: z.string(),
});

export type TicketExtraction = z.infer<typeof TicketSchema>;

// Kept byte-stable (no dates or per-request text) so it can be cached by the provider.
export const SYSTEM_PROMPT = `You read crude oil run tickets (bills of lading) photographed by truck drivers in the Permian Basin, and copy the printed values into a driver's load log.

Read printed (machine-typed) text only. Ignore anything handwritten: notes, numbers, initials or marks written on the ticket by hand, even if they sit in or next to a field. If a field's printed space is empty, return an empty string for it. If the ticket prints a 0 in a field, return 0.

For each field, return:
- value: exactly what the ticket shows, in the form described. Empty string if the field isn't on the ticket, is blank, or you can't make it out. Never guess or fill in a value from context.
- confidence: 0 to 1. How sure you are that value matches the ticket. Use 0.9 or above only when the characters are clearly legible. Use below 0.85 for anything smudged, partly hidden, cut off, in glare, or where you had to choose between readings. Use 0 for an empty value that should be on the ticket.

A driver checks every field you mark below 0.85 against the paper ticket, so an honest low score is much better than a confident wrong one.

Formatting rules:
- Never write fractions. Convert them to decimals: 3 1/2 becomes 3.5, 1/4 becomes 0.25, 8¾ becomes 8.75.
- Tank gauges: feet and decimal inches in the form 14' 3.5". Inches are under 12.
- Meter loads (G/M is M): the top and bottom gauge fields hold the opening and closing meter readings as plain numbers (e.g. 20418.6), and the tank temperatures are usually empty.
- Temperatures in °F as numbers, no unit.
- Keep leading zeros on seal numbers.
- Date as YYYY-MM-DD. If the year isn't printed, use a four-digit year of 0000 (e.g. 0000-09-24).

Fields:
${READ_FIELDS.map((f) => `- ${f.key} (${f.label}): ${f.readerHint ?? ""}`).join("\n")}

Set is_run_ticket to false if the photo isn't a run ticket. Use notes for anything a dispatcher should know (e.g. "ticket torn at bottom", "two tank numbers written"), otherwise an empty string.`;

export const USER_PROMPT = "Read this run ticket.";

/** Turns a reader's structured answer into the app's reading. */
export function toReaderResult(out: TicketExtraction, reader: ReaderResult["reader"], model: string): ReaderResult {
  const values: ReaderResult["values"] = {};
  const confidence: ReaderResult["confidence"] = {};
  for (const f of READ_FIELDS) {
    const r = out.fields[f.key];
    let v = r?.value?.trim() ?? "";
    // Year not printed: let the app fill it from today's date.
    if (f.key === "date" && v.startsWith("0000-")) v = `${v.slice(5, 7)}/${v.slice(8, 10)}`;
    values[f.key] = v;
    confidence[f.key] = out.is_run_ticket ? Math.max(0, Math.min(1, r?.confidence ?? 0)) : 0;
  }
  const notes = [out.is_run_ticket ? "" : "Doesn't look like a run ticket.", out.notes].filter(Boolean).join(" ");
  return { reader, model, values, confidence, notes: notes || undefined };
}
