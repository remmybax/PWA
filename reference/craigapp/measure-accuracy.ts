// Field-by-field accuracy of the ticket reader against hand-checked answers.
//
//   npm run accuracy                 # every photo listed in samples/answers.csv
//   npm run accuracy -- --limit 3    # first 3 only (each photo is one paid API call)
//
// Uses the configured reader (GEMINI_API_KEY or ANTHROPIC_API_KEY in .env.local). Writes samples/accuracy-report.md and .json.
//
// The number that matters most is "missed": a wrong value the reader was confident about, so the
// driver was never asked to check it. Those reach payroll silently.

import { promises as fs } from "node:fs";
import path from "node:path";
import { FIELDS, TICKET_FIELDS, type FieldKey } from "../src/lib/fields";
import { normalizeField } from "../src/lib/format";
import { activeModel, aiRead, normalizeReading } from "../src/server/reader";
import { CONFIDENCE_THRESHOLD } from "../src/server/loads";
import { parseCsv } from "../src/lib/csv";

const SAMPLES = path.join(process.cwd(), "samples");

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9&]/g, "");

/** Maps a CSV header to a field key; accepts keys ("topGauge") or sheet labels ("Top gauge or meter"). */
function headerToKey(h: string): FieldKey | "file" | null {
  const s = squash(h);
  if (s === "file" || s === "photo" || s === "filename") return "file";
  for (const f of FIELDS) {
    if ([f.key, f.label, f.sheetLabel].some((x) => squash(x) === s)) return f.key;
  }
  return null;
}

interface FieldResult {
  key: FieldKey;
  expected: string;
  got: string;
  confidence: number;
  correct: boolean;
  flagged: boolean;
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : Infinity;

  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment may already be set.
  }
  const model = await activeModel();
  const csvPath = path.join(SAMPLES, "answers.csv");
  const text = await fs.readFile(csvPath, "utf8").catch(() => null);
  if (!text) {
    console.error(`No ${csvPath}. Copy samples/answers.example.csv and fill in one row per photo.`);
    process.exit(1);
  }

  const [header, ...rows] = parseCsv(text);
  const keys = header.map(headerToKey);
  const unknown = header.filter((_, i) => keys[i] === null);
  if (unknown.length) console.warn(`Ignoring unknown columns: ${unknown.join(", ")}`);
  const fileCol = keys.indexOf("file");
  if (fileCol < 0) throw new Error('answers.csv needs a "file" column');

  const results: { file: string; fields: FieldResult[]; notes?: string; ms: number }[] = [];
  for (const row of rows.slice(0, limit)) {
    const file = row[fileCol];
    const ext = path.extname(file).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    const bytes = await fs.readFile(path.join(SAMPLES, file));

    const expectedRaw: Partial<Record<FieldKey, string>> = {};
    keys.forEach((k, i) => {
      if (k && k !== "file") expectedRaw[k] = row[i] ?? "";
    });
    const gm = normalizeField("gm", expectedRaw.gm ?? "", { gm: "", refISO: "2026-01-01" }).value;
    const expectedDate = normalizeField("date", expectedRaw.date ?? "", { gm, refISO: "2026-12-31" });
    const refISO = expectedDate.ok && expectedDate.value ? expectedDate.value : "2026-12-31";

    const started = Date.now();
    const reading = normalizeReading(await aiRead(bytes, contentType), refISO);
    const ms = Date.now() - started;

    const fields: FieldResult[] = [];
    for (const f of TICKET_FIELDS) {
      if (!(f.key in expectedRaw)) continue;
      const expected = normalizeField(f.key, expectedRaw[f.key] ?? "", { gm, refISO }).value;
      const got = reading.values[f.key] ?? "";
      const confidence = reading.confidence[f.key] ?? 0;
      fields.push({ key: f.key, expected, got, confidence, correct: got === expected, flagged: confidence < CONFIDENCE_THRESHOLD });
    }
    results.push({ file, fields, notes: reading.notes, ms });
    const wrong = fields.filter((x) => !x.correct);
    console.log(`${file}: ${fields.length - wrong.length}/${fields.length} correct, ${wrong.filter((x) => !x.flagged).length} missed, ${(ms / 1000).toFixed(1)}s`);
  }

  // Per-field summary.
  const lines: string[] = [];
  lines.push(`# Ticket reader accuracy`, "", `Model: ${model} · ${results.length} photos · flag threshold ${CONFIDENCE_THRESHOLD} · ${new Date().toISOString()}`, "");
  lines.push("| Field | Correct | Wrong but flagged | **Missed** (wrong, not flagged) | Correct but flagged |", "|---|---|---|---|---|");
  let tot = { n: 0, ok: 0, caught: 0, missed: 0, noise: 0 };
  for (const f of TICKET_FIELDS) {
    const rs = results.flatMap((r) => r.fields.filter((x) => x.key === f.key));
    if (!rs.length) continue;
    const ok = rs.filter((x) => x.correct).length;
    const caught = rs.filter((x) => !x.correct && x.flagged).length;
    const missed = rs.filter((x) => !x.correct && !x.flagged).length;
    const noise = rs.filter((x) => x.correct && x.flagged).length;
    tot = { n: tot.n + rs.length, ok: tot.ok + ok, caught: tot.caught + caught, missed: tot.missed + missed, noise: tot.noise + noise };
    const pct = (x: number) => `${x} (${Math.round((100 * x) / rs.length)}%)`;
    lines.push(`| ${f.label} | ${pct(ok)} | ${caught} | **${missed}** | ${noise} |`);
  }
  lines.push(`| **All** | ${tot.ok}/${tot.n} (${Math.round((100 * tot.ok) / Math.max(1, tot.n))}%) | ${tot.caught} | **${tot.missed}** | ${tot.noise} |`, "");

  const avgMs = results.reduce((t, r) => t + r.ms, 0) / Math.max(1, results.length);
  lines.push(`Average read time: ${(avgMs / 1000).toFixed(1)}s`, "", "## Wrong values", "");
  lines.push("| Photo | Field | Expected | Read | Confidence | Flagged |", "|---|---|---|---|---|---|");
  for (const r of results) {
    for (const x of r.fields.filter((y) => !y.correct)) {
      lines.push(`| ${r.file} | ${x.key} | \`${x.expected}\` | \`${x.got}\` | ${x.confidence.toFixed(2)} | ${x.flagged ? "yes" : "**no**"} |`);
    }
  }

  await fs.writeFile(path.join(SAMPLES, "accuracy-report.md"), lines.join("\n") + "\n");
  await fs.writeFile(path.join(SAMPLES, "accuracy-report.json"), JSON.stringify({ model, results }, null, 2));
  console.log("\n" + lines.slice(0, 6 + TICKET_FIELDS.length).join("\n"));
  console.log(`\nFull report: samples/accuracy-report.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
