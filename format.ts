// Parsing, validation and display for log values.
//
// Hard rule from the brief: no fractions anywhere. Inches are decimals (4' 1.25"). Anything a
// person or the ticket reader types as a fraction ("3 1/2", "¾") is converted to a decimal here,
// so a fraction can never reach storage, a screen or an export.

import { FIELD_BY_KEY, type FieldKey, type LoadFields } from "./fields";

export type Normalized = { ok: true; value: string } | { ok: false; value: string; error: string };

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅛": " 1/8", "⅜": " 3/8", "⅝": " 5/8", "⅞": " 7/8",
  "⅓": " 1/3", "⅔": " 2/3", "⅙": " 1/6", "⅚": " 5/6", "⅕": " 1/5", "⅖": " 2/5", "⅗": " 3/5", "⅘": " 4/5",
};

/** Formats a number without float noise or trailing zeros: 3.50 -> "3.5", 0.1+0.2 -> "0.3". */
export function fmtNumber(n: number, maxDecimals = 4): string {
  const fixed = n.toFixed(maxDecimals);
  return String(parseFloat(fixed));
}

/**
 * Parses a plain or mixed number that may contain a fraction: "3.5", "3 1/2", "3-1/2", "1/4", "¾".
 * Returns null if the text isn't a number.
 */
export function parseMixedNumber(raw: string): number | null {
  let s = raw.trim();
  for (const [ch, rep] of Object.entries(UNICODE_FRACTIONS)) s = s.split(ch).join(rep);
  s = s.trim().replace(/\s+/g, " ");
  if (s === "") return null;

  let m = s.match(/^(-?\d+(?:\.\d+)?)$/) || s.match(/^(-?\.\d+)$/);
  if (m) return parseFloat(m[1]);

  m = s.match(/^(\d+)[ -](\d+)\/(\d+)$/);
  if (m) {
    const den = parseInt(m[3], 10);
    if (den === 0) return null;
    return parseInt(m[1], 10) + parseInt(m[2], 10) / den;
  }

  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) {
    const den = parseInt(m[2], 10);
    if (den === 0) return null;
    return parseInt(m[1], 10) / den;
  }
  return null;
}

/** Parses a tank gauge into feet and decimal inches. */
export function parseGauge(raw: string): { feet: number; inches: number } | null {
  let s = raw.trim().toLowerCase();
  for (const [ch, rep] of Object.entries(UNICODE_FRACTIONS)) s = s.split(ch).join(rep);
  s = s
    .replace(/[’′`]/g, "'")
    .replace(/[”″]|''/g, '"')
    .replace(/\s*(feet|foot|ft)\.?/g, "'")
    .replace(/\s*(inches|inch|in)\.?/g, '"')
    .trim();
  if (s === "") return null;

  let feetPart: string;
  let inchPart: string;
  if (s.includes("'")) {
    [feetPart, inchPart] = s.split("'", 2);
  } else {
    // "14 3.5", "14-3.5", or "14 3 1/2" — first number is feet, the rest is inches.
    const m = s.match(/^(\d+)(?:[\s-]+(.*))?$/);
    if (!m) return null;
    feetPart = m[1];
    inchPart = m[2] ?? "";
  }
  inchPart = inchPart.replace(/"/g, "").replace(/^[\s-]+/, "").trim();

  if (!/^\d+$/.test(feetPart.trim())) return null;
  const feet = parseInt(feetPart.trim(), 10);
  const inches = inchPart === "" ? 0 : parseMixedNumber(inchPart);
  if (inches === null || inches < 0 || inches >= 12) return null;
  if (feet > 60) return null;
  return { feet, inches };
}

export function formatGauge(g: { feet: number; inches: number }): string {
  return `${g.feet}' ${fmtNumber(g.inches, 3)}"`;
}

/** Accepts YYYY-MM-DD, M/D, M/D/YY or M/D/YYYY. `refISO` supplies the year when it's missing. */
export function parseDate(raw: string, refISO: string): string | null {
  const s = raw.trim();
  let y: number, mo: number, d: number;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
  } else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/))) {
    mo = +m[1];
    d = +m[2];
    if (m[3]) y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    else {
      // No year on the ticket: take the reference year, but a December ticket read in January
      // belongs to the previous year.
      const [ry, rm] = refISO.split("-").map(Number);
      y = mo > rm + 1 ? ry - 1 : ry;
    }
  } else return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** "2026-09-24" -> "09/24" (the sheet's format). */
export function displayDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}`;
}

/** "2026-09-24" -> "09/24/2026". */
export function displayDateLong(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
}

/**
 * Keeps a plain decimal exactly as written (gravity is conventionally shown as 43.0, not 43);
 * anything else (fractions, a leading dot) is rewritten from the parsed number.
 */
function numberText(written: string, n: number, maxDecimals = 4): string {
  const w = written.trim();
  if (/^\d+(\.\d+)?$/.test(w)) return w.replace(/^0+(?=\d)/, "");
  return fmtNumber(n, maxDecimals);
}

function ok(value: string): Normalized {
  return { ok: true, value };
}
function bad(value: string, error: string): Normalized {
  return { ok: false, value, error };
}

/**
 * Cleans one value into its stored form. Blank is always allowed here; whether a field is
 * required is checked separately (see `validateLoad`).
 */
export function normalizeField(key: FieldKey, raw: string, ctx: { gm: string; refISO: string }): Normalized {
  const def = FIELD_BY_KEY[key];
  const s = (raw ?? "").trim();
  if (s === "" || s === "—" || s === "-") return ok("");

  switch (def.kind) {
    case "date": {
      const iso = parseDate(s, ctx.refISO);
      return iso ? ok(iso) : bad(s, "Use MM/DD, like 09/24");
    }
    case "text":
      return ok(s.replace(/\s+/g, " "));
    case "digits": {
      const v = s.replace(/\s+/g, "");
      return /^[A-Za-z0-9-]+$/.test(v) ? ok(v) : bad(s, "Letters and numbers only");
    }
    case "yn": {
      const v = s.toUpperCase();
      if (v === "Y" || v === "YES") return ok("Y");
      if (v === "N" || v === "NO") return ok("N");
      return bad(s, "N or Y");
    }
    case "gm": {
      const v = s.toUpperCase();
      if (v === "G" || v.startsWith("GAUGE")) return ok("G");
      if (v === "M" || v.startsWith("METER") || v === "LACT") return ok("M");
      return bad(s, "G (gauge) or M (meter)");
    }
    case "temp": {
      const t = s.replace(/°\s*f?$/i, "").replace(/f$/i, "").trim();
      const n = parseMixedNumber(t);
      if (n === null || n < -40 || n > 250) return bad(s, "Temperature in °F, like 76");
      return ok(numberText(t, n, 1));
    }
    case "decimal": {
      const t = s.replace(/%$/, "").replace(/\s*(hrs?|hours?)$/i, "").trim();
      const n = parseMixedNumber(t);
      if (n === null || n < 0) return bad(s, "A number, like 0.25");
      return ok(numberText(t, n));
    }
    case "gauge": {
      if (ctx.gm === "M") {
        const t = s.replace(/,/g, "");
        const n = parseMixedNumber(t);
        return n === null || n < 0 ? bad(s, "Meter reading, like 20418.6") : ok(numberText(t, n, 3));
      }
      const g = parseGauge(s);
      return g ? ok(formatGauge(g)) : bad(s, `Feet and inches, like 14' 3.5"`);
    }
    case "longtext":
      return ok(s);
  }
}

export interface FieldProblem {
  key: FieldKey;
  error: string;
}

/**
 * Normalizes every field and reports problems. Meter loads have no tank temps, so those are
 * cleared rather than rejected.
 */
export function validateLoad(
  input: Partial<LoadFields>,
  opts: { refISO: string; required?: FieldKey[] },
): { fields: LoadFields; problems: FieldProblem[] } {
  const gmN = normalizeField("gm", input.gm ?? "", { gm: "", refISO: opts.refISO });
  const gm = gmN.ok ? gmN.value : "";
  const fields = {} as LoadFields;
  const problems: FieldProblem[] = [];

  for (const key of Object.keys(FIELD_BY_KEY) as FieldKey[]) {
    let raw = input[key] ?? "";
    if (gm === "M" && FIELD_BY_KEY[key].gaugeOnly) raw = "";
    const n = normalizeField(key, raw, { gm, refISO: opts.refISO });
    fields[key] = n.value;
    if (!n.ok) problems.push({ key, error: n.error });
  }
  for (const key of opts.required ?? []) {
    if (fields[key] === "" && !problems.some((p) => p.key === key)) {
      problems.push({ key, error: "Required" });
    }
  }
  return { fields, problems };
}

/** Value as shown on screens and the PDF: blanks as an em dash, dates as MM/DD. */
export function displayValue(key: FieldKey, value: string): string {
  if (value === "") return key === "comments" ? "" : "—";
  if (key === "date") return displayDate(value);
  return value;
}

/** Short driver name used in dispatch tables: "Dan VanWormer" -> "D. VanWormer". */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2 || /^\d+$/.test(parts[parts.length - 1])) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

/** Total of decimal hour strings, formatted with two decimals like the design ("2.00"). */
export function sumHours(values: string[]): string {
  const total = values.reduce((t, v) => t + (parseFloat(v) || 0), 0);
  return total.toFixed(2);
}

/**
 * Station # rule: a 3–4 digit station code if the receiver line has one ("PLAINS BADGER TRK - 7185"
 * → "7185"), otherwise the station name as printed ("DB ANDREWS", "CR1 - MARATHON", "P66").
 */
export function stationCode(value: string): string {
  const v = value.trim();
  const codes = v.match(/(?<![\w.])\d{3,4}(?![\w.])/g);
  return codes && codes.length === 1 ? codes[0] : v;
}

/**
 * Size class for a value in a sheet column: values too long for their column shrink so they fit
 * instead of being cut off ("PARABO FACILITY" in Lease #); very long ones wrap to two lines.
 */
export function fitClass(value: string, columnWidth: number): "" | "fit-sm" | "fit-xs" | "fit-wrap" {
  // Approximate character widths of the sheet's monospace font at 13px, 11px and 9.5px.
  const room = columnWidth - 8; // 4px padding each side
  const n = value.length;
  if (n * 7.8 <= room) return "";
  if (n * 6.6 <= room) return "fit-sm";
  if (n * 5.7 <= room) return "fit-xs";
  return "fit-wrap";
}

/** CSS grid columns for the sheet: each field's width, with Comments taking any spare room. */
export function sheetColumns(widths: readonly { key: string; width: number }[]): string {
  return widths.map((c) => (c.key === "comments" ? `minmax(${c.width}px, 1fr)` : `${c.width}px`)).join(" ");
}
