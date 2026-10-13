import type { FieldKey } from "@/lib/fields";

export interface ReaderResult {
  /** none = no reader configured, so the driver types the ticket in; sample = built-in sample rows. */
  reader: "gemini" | "claude" | "none" | "sample";
  model?: string;
  /** Raw values as read; normalized (fractions to decimals etc.) by `readTicket`. */
  values: Partial<Record<FieldKey, string>>;
  /** 0–1 per field. */
  confidence: Partial<Record<FieldKey, number>>;
  notes?: string;
}
