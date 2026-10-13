// Rules about an inspection that every screen shares: what an item's verdict is, when an item
// counts as done, what's still missing before sign-off, the defect list, and document dates.
// Pure functions so the tests can cover them and the client and server agree.

import { ITEM_BY_ID, SECTION_OF, sectionsFor, type ChecklistItem, type ChecklistSection } from "./checklist";
import { addMonths, daysBetween, isoInZone, isValidISODate } from "./dates";
import type { Inspection, ItemResult, Overall, Verdict } from "./types";

export const EMPTY_RESULT: ItemResult = { photos: [] };

/** Days before an expiration/due date that the dashboard starts warning. */
export const WARN_DAYS = 30;

/** How often a truck should be inspected. */
export const INSPECTION_INTERVAL_MONTHS = 1;

export function parseNumber(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * The item's verdict. Readings with a minimum and counts with an expected number decide for
 * themselves; a document whose date has passed fails even if the driver tapped Present.
 */
export function verdictOf(item: ChecklistItem, r: ItemResult | undefined, today: string): Verdict | undefined {
  if (!r) return undefined;
  if (r.verdict === "na") return "na";
  if (item.kind === "reading" && item.min !== undefined) {
    const n = parseNumber(r.value);
    if (n === null) return r.verdict;
    return n >= item.min ? "pass" : "fail";
  }
  if (item.kind === "count" && item.expected !== undefined) {
    const n = parseNumber(r.value);
    if (n === null) return r.verdict;
    return n >= item.expected ? "pass" : "fail";
  }
  if (item.kind === "doc" && r.verdict === "pass" && item.date && isValidISODate(r.date) && r.date < today) return "fail";
  if (item.kind === "reading" || item.kind === "text") {
    // No limit to judge by: having a value is a pass.
    if (r.verdict) return r.verdict;
    return r.value?.trim() ? "pass" : undefined;
  }
  return r.verdict;
}

/** Why an item can't be counted as done yet, or null when it is done. */
export function itemProblem(item: ChecklistItem, r: ItemResult | undefined, today: string): string | null {
  const v = verdictOf(item, r, today);
  if (!r || !v) {
    if (item.kind === "reading" || item.kind === "count") return "Enter the number";
    if (item.kind === "text") return "Fill this in";
    return "Choose an answer";
  }
  if (v === "na") return null;
  if ((item.kind === "reading" || item.kind === "count") && parseNumber(r.value) === null) return "Enter the number";
  if (item.kind === "text" && !r.value?.trim()) return "Fill this in";
  if (item.kind === "doc" && item.date && r.verdict === "pass" && !isValidISODate(r.date)) return `Enter the ${item.date.toLowerCase()} date`;
  if (item.photo === "required" && r.photos.length === 0) return "Take the photo";
  if (v === "fail") {
    if (!r.note?.trim()) return "Say what's wrong";
    if (r.photos.length === 0) return "Photo of the problem";
  }
  return null;
}

export interface SectionProgress {
  section: ChecklistSection;
  done: number;
  total: number;
  fails: number;
}

export function progress(insp: Pick<Inspection, "trailerId" | "results">, today: string): SectionProgress[] {
  return sectionsFor(Boolean(insp.trailerId)).map((section) => {
    let done = 0;
    let fails = 0;
    for (const item of section.items) {
      const r = insp.results[item.id];
      if (!itemProblem(item, r, today)) done++;
      if (verdictOf(item, r, today) === "fail") fails++;
    }
    return { section, done, total: section.items.length, fails };
  });
}

export function totals(p: SectionProgress[]): { done: number; total: number; fails: number } {
  return p.reduce((a, s) => ({ done: a.done + s.done, total: a.total + s.total, fails: a.fails + s.fails }), { done: 0, total: 0, fails: 0 });
}

export interface Problem {
  item: ChecklistItem;
  section: ChecklistSection;
  problem: string;
}

/** Everything still missing before sign-off, in walk order. */
export function missing(insp: Pick<Inspection, "trailerId" | "results">, today: string): Problem[] {
  const out: Problem[] = [];
  for (const section of sectionsFor(Boolean(insp.trailerId))) {
    for (const item of section.items) {
      const problem = itemProblem(item, insp.results[item.id], today);
      if (problem) out.push({ item, section, problem });
    }
  }
  return out;
}

export interface Defect {
  item: ChecklistItem;
  section: ChecklistSection;
  result: ItemResult;
  /** Repaired since the inspection. */
  resolved: boolean;
}

/** Failed items, in walk order. `today` is the inspection day for a certified report. */
export function defects(insp: Pick<Inspection, "trailerId" | "results">, today: string): Defect[] {
  const out: Defect[] = [];
  for (const section of sectionsFor(Boolean(insp.trailerId))) {
    for (const item of section.items) {
      const r = insp.results[item.id];
      if (r && verdictOf(item, r, today) === "fail") out.push({ item, section, result: r, resolved: Boolean(r.resolution) });
    }
  }
  return out;
}

/** The day the inspection is judged on: sign-off day once certified, else today. */
export function judgeDay(insp: Pick<Inspection, "certifiedAt">, today: string): string {
  return insp.certifiedAt ? isoInZone(new Date(insp.certifiedAt)) : today;
}

/** What the app suggests for the overall status; the inspector makes the call. */
export function suggestedOverall(insp: Pick<Inspection, "trailerId" | "results">, today: string): Overall {
  return defects(insp, today).length ? "needs_repair" : "in_service";
}

export function nextDue(certifiedAt: string): string {
  return addMonths(isoInZone(new Date(certifiedAt)), INSPECTION_INTERVAL_MONTHS);
}

export type DateStatus = "ok" | "soon" | "overdue";

export function dateStatus(date: string, today: string): { status: DateStatus; days: number } {
  const days = daysBetween(today, date);
  return { status: days < 0 ? "overdue" : days <= WARN_DAYS ? "soon" : "ok", days };
}

export interface DatedDoc {
  item: ChecklistItem;
  date: string;
  /** The unit the document belongs to (truck or trailer of that inspection). */
  vehicleId: string;
  inspectionId: string;
}

/** Documents with an expiration/due date recorded on a certified inspection. */
export function datedDocs(insp: Inspection): DatedDoc[] {
  const out: DatedDoc[] = [];
  for (const [id, r] of Object.entries(insp.results)) {
    const item = ITEM_BY_ID[id];
    if (!item || item.kind !== "doc" || !item.date || r.verdict !== "pass" || !isValidISODate(r.date)) continue;
    const vehicleId = item.unit_of === "trailer" ? insp.trailerId : insp.truckId;
    if (!vehicleId) continue;
    out.push({ item, date: r.date, vehicleId, inspectionId: insp.id });
  }
  return out;
}

/** Item photos in walk order, for the gallery. */
export function photoList(insp: Pick<Inspection, "trailerId" | "results">): { item: ChecklistItem; section: ChecklistSection; key: string; takenAt: string; repair?: boolean }[] {
  const out: { item: ChecklistItem; section: ChecklistSection; key: string; takenAt: string; repair?: boolean }[] = [];
  for (const section of sectionsFor(Boolean(insp.trailerId))) {
    for (const item of section.items) {
      const r = insp.results[item.id];
      if (!r) continue;
      for (const p of r.photos) out.push({ item, section, key: p.key, takenAt: p.takenAt });
      if (r.resolution?.photo) out.push({ item, section, key: r.resolution.photo.key, takenAt: r.resolution.photo.takenAt, repair: true });
    }
  }
  return out;
}

export function sectionOf(itemId: string): ChecklistSection | undefined {
  return SECTION_OF[itemId];
}

/** The text shown for an item's answer on reports: "Pass", "6 /32\"", "Expires 03/01/2027"... */
export function answerText(item: ChecklistItem, r: ItemResult | undefined, today: string): string {
  if (!r) return "—";
  const v = verdictOf(item, r, today);
  if (v === "na") return "N/A";
  const parts: string[] = [];
  if (item.kind === "reading" || item.kind === "count") {
    if (r.value?.trim()) parts.push(`${r.value.trim()}${item.unit ? ` ${item.unit}` : ""}${item.expected !== undefined ? ` of ${item.expected}` : ""}`);
  } else if (item.kind === "text") {
    if (r.value?.trim()) parts.push(r.value.trim());
  } else if (item.kind === "doc") {
    parts.push(r.verdict === "fail" ? "Missing" : r.verdict === "pass" ? "Present" : "—");
    if (item.date && r.date) parts.push(`${item.date.toLowerCase()} ${r.date.slice(5, 7)}/${r.date.slice(8, 10)}/${r.date.slice(0, 4)}`);
  } else {
    parts.push(v === "pass" ? "Pass" : v === "fail" ? "Fail" : "—");
  }
  return parts.join(", ") || "—";
}
