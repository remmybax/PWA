// Reads a run ticket photo with Google Gemini (vision + JSON-schema output). Used when
// GEMINI_API_KEY is set. Free tier from https://aistudio.google.com: note that on the free tier
// Google may use what's sent to improve its products.

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ReaderResult } from "./types";
import { SYSTEM_PROMPT, TicketSchema, USER_PROMPT, toReaderResult } from "./prompt";

/**
 * Google's alias for its current Flash-Lite model. On the free tier (checked 10/2026) Flash-Lite
 * allows 500 requests a day; regular Flash only 20, too few for a crew of drivers.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
}

/** JSON Schema for Gemini's responseJsonSchema (it doesn't accept the $schema keyword). */
export function geminiSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(TicketSchema) as Record<string, unknown>;
  return schema;
}

export async function geminiReadTicket(photo: Buffer, contentType: string): Promise<ReaderResult> {
  const model = geminiModel();
  const response = await getClient().models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ inlineData: { mimeType: contentType, data: photo.toString("base64") } }, { text: USER_PROMPT }],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: "application/json",
      responseJsonSchema: geminiSchema(),
      temperature: 0,
      // A driver is waiting on the review screen.
      abortSignal: AbortSignal.timeout(60_000),
    },
  });

  const parsed = TicketSchema.safeParse(JSON.parse(response.text ?? "null"));
  if (!parsed.success) {
    return { reader: "gemini", model, values: {}, confidence: {}, notes: "No usable reading" };
  }
  return toReaderResult(parsed.data, "gemini", model);
}
