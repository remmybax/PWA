// Reads a run ticket photo with Claude (vision + structured output). Used when ANTHROPIC_API_KEY
// is set and Gemini isn't. Prompt and schema are shared with the Gemini reader (prompt.ts).

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ReaderResult } from "./types";
import { SYSTEM_PROMPT, TicketSchema, USER_PROMPT, toReaderResult } from "./prompt";

export const DEFAULT_MODEL = "claude-opus-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export function claudeModel(): string {
  return process.env.CLAUDE_MODEL || process.env.TICKET_READER_MODEL || DEFAULT_MODEL;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export async function claudeReadTicket(photo: Buffer, contentType: string): Promise<ReaderResult> {
  const model = claudeModel();
  const effort = (process.env.TICKET_READER_EFFORT as Effort | undefined) || "medium";
  const media_type = contentType as "image/jpeg" | "image/png" | "image/webp";

  const response = await getClient().messages.parse(
    {
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort, format: zodOutputFormat(TicketSchema) },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type, data: photo.toString("base64") } },
            { type: "text", text: USER_PROMPT },
          ],
        },
      ],
    },
    // A driver is waiting on the review screen.
    { timeout: 90_000, maxRetries: 1 },
  );

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    // Nothing usable came back: the driver types the fields in.
    return { reader: "claude", model, values: {}, confidence: {}, notes: `No reading (${response.stop_reason})` };
  }
  return toReaderResult(response.parsed_output, "claude", model);
}
