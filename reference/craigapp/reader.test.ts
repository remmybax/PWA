import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { READ_FIELDS, TICKET_FIELDS } from "@/lib/fields";
import { parseCsv, csvCell } from "@/lib/csv";
import { flaggedFields } from "../loads";
import { activeReader, normalizeReading } from ".";
import { SYSTEM_PROMPT, TicketSchema } from "./prompt";
import { geminiSchema } from "./gemini";

describe("ticket reader schema and prompt", () => {
  it("asks for every ticket field", () => {
    const format = zodOutputFormat(TicketSchema) as unknown as { schema: { properties: { fields: { properties: object } } } };
    expect(Object.keys(format.schema.properties.fields.properties).sort()).toEqual(READ_FIELDS.map((f) => f.key).sort());
    expect(READ_FIELDS.map((f) => f.key)).toContain("station");
    for (const f of READ_FIELDS) expect(SYSTEM_PROMPT).toContain(`- ${f.key} (`);
  });

  it("gives Gemini a plain JSON schema with every field required", () => {
    const schema = geminiSchema() as { $schema?: string; required: string[]; properties: { fields: { required: string[] } } };
    expect(schema.$schema).toBeUndefined();
    expect(schema.required).toEqual(["is_run_ticket", "fields", "notes"]);
    expect([...schema.properties.fields.required].sort()).toEqual(READ_FIELDS.map((f) => f.key).sort());
  });
});

describe("which reader runs", () => {
  const keys = ["TICKET_READER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const run = (env: Partial<Record<(typeof keys)[number], string>>) => {
    for (const k of keys) delete process.env[k];
    Object.assign(process.env, env);
    const r = activeReader();
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    return r;
  };

  it("prefers Gemini, then Claude, else typing it in; TICKET_READER forces one", () => {
    expect(run({})).toBe("none");
    expect(run({ ANTHROPIC_API_KEY: "x" })).toBe("claude");
    expect(run({ GEMINI_API_KEY: "x", ANTHROPIC_API_KEY: "x" })).toBe("gemini");
    expect(run({ TICKET_READER: "none", GEMINI_API_KEY: "x" })).toBe("none");
  });
});

describe("normalizeReading", () => {
  it("converts fractions and flags values that don't parse", () => {
    const r = normalizeReading(
      {
        reader: "claude",
        values: { gm: "G", topGauge: "14' 3 1/2\"", bottomGauge: "4 13", date: "09/24" },
        confidence: { gm: 0.99, topGauge: 0.95, bottomGauge: 0.95, date: 0.99 },
      },
      "2026-09-25",
    );
    expect(r.values.topGauge).toBe(`14' 3.5"`);
    expect(r.values.date).toBe("2026-09-24");
    expect(r.confidence.bottomGauge).toBeLessThan(0.85);
    expect(flaggedFields(r.values, r.confidence)).toContain("bottomGauge");
  });

  it("clears tank temps on meter loads", () => {
    const r = normalizeReading({ reader: "claude", values: { gm: "M", tTemp: "70" }, confidence: { gm: 0.99, tTemp: 0.9 } }, "2026-09-25");
    expect(r.values.tTemp).toBe("");
  });

  it("flags every ticket field when nothing was read", () => {
    expect(flaggedFields({}, {})).toEqual(TICKET_FIELDS.map((f) => f.key));
  });
});

describe("csv", () => {
  it("round-trips gauge values with quotes", () => {
    const line = ["t1.jpg", `14' 3.5"`, "a,b"].map(csvCell).join(",");
    expect(parseCsv(`file,top,c\n${line}\n`)).toEqual([["file", "top", "c"], ["t1.jpg", `14' 3.5"`, "a,b"]]);
  });
});

describe("zeros on the ticket", () => {
  it("keeps a 0 the ticket prints in an empty box (e.g. no seals)", () => {
    const r = normalizeReading(
      { reader: "gemini", values: { gm: "G", sealOn: "0", sealOff: "0" }, confidence: { gm: 0.95, sealOn: 0.95, sealOff: 0.95 } },
      "2026-10-12",
    );
    expect(r.values.sealOn).toBe("0");
    expect(r.values.sealOff).toBe("0");
  });
});
