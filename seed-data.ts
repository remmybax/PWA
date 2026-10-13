// Sample data taken from the design files (design/MyLoads.dc.html and design/Dispatch.dc.html).
// Used by `npm run seed` and to populate an empty local store on first run.

import { FIELD_KEYS, FIELD_BY_KEY, type FieldKey, type LoadFields } from "@/lib/fields";
import type { ChangeEntry, FieldStatus, Load, TicketReading, User } from "@/lib/types";

const CREATED = "2026-09-01T12:00:00.000Z";

export const SEED_USERS: User[] = [
  { id: "u-dan", name: "Dan VanWormer", role: "driver", active: true, createdAt: CREATED },
  { id: "u-d02", name: "Driver 02", role: "driver", active: true, createdAt: CREATED },
  { id: "u-d03", name: "Driver 03", role: "driver", active: true, createdAt: CREATED },
  { id: "u-d04", name: "Driver 04", role: "driver", active: true, createdAt: CREATED },
  { id: "u-craig", name: "Craig", role: "dispatch", active: true, createdAt: CREATED },
  { id: "u-blaze", name: "Blaze", role: "viewer", active: true, createdAt: CREATED },
];

// Sheet order: date, lease, ticket, tank, reject, gm, tTemp, topGauge, bTemp, bottomGauge,
// obGrav, obTemp, sw, sealOn, sealOff, station, waitTime, comments
type Row = [string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string, string];

interface SeedRow {
  driverId: string;
  /** Odessa local time the load was logged. */
  time: string;
  row: Row;
  /** Field the driver had to confirm (read with low confidence). */
  confirmed?: FieldKey;
  /** Field dispatch changed after logging, with the value originally read. */
  edited?: { field: FieldKey; from: string };
}

const ROWS: SeedRow[] = [
  // Dan VanWormer, week of 09/20 – 09/26 (MyLoads design)
  { driverId: "u-dan", time: "2026-09-22T06:05", row: ["2026-09-22", "40217", "1180211", "1", "N", "G", "71", "14' 2.5\"", "70", "4' 3.25\"", "42.4", "69", "0.1", "0048741", "0048740", "12", "0.25", ""] },
  { driverId: "u-dan", time: "2026-09-22T09:40", row: ["2026-09-22", "40388", "1180236", "2", "N", "G", "74", "13' 9\"", "73", "4' 1.75\"", "41.2", "72", "0.2", "0048743", "0048742", "12", "0", ""] },
  { driverId: "u-dan", time: "2026-09-22T14:15", row: ["2026-09-22", "40519", "1180260", "1", "N", "G", "77", "15' 1.25\"", "76", "4' 6.5\"", "40.8", "75", "0.3", "0048745", "0048744", "7", "1.5", "Waited on gauger"] },
  { driverId: "u-dan", time: "2026-09-23T06:20", row: ["2026-09-23", "40217", "1180342", "2", "N", "G", "69", "14' 8.75\"", "68", "4' 2\"", "42.2", "68", "0.1", "0048747", "0048746", "12", "0", ""] },
  { driverId: "u-dan", time: "2026-09-23T10:02", row: ["2026-09-23", "40602", "1180371", "1", "N", "M", "", "20418.6", "", "20614.2", "41.9", "73", "0.2", "", "", "7", "0.5", "LACT meter"] },
  { driverId: "u-dan", time: "2026-09-23T13:30", row: ["2026-09-23", "40388", "1180395", "3", "N", "G", "76", "13' 11.5\"", "75", "4' 0.75\"", "41.5", "75", "0.2", "0048751", "0048750", "7", "0", ""] },
  { driverId: "u-dan", time: "2026-09-24T06:12", row: ["2026-09-24", "40217", "1180471", "1", "N", "G", "68", "14' 6\"", "67", "4' 4.75\"", "42.1", "68", "0.1", "0048791", "0048790", "12", "0", ""] },
  { driverId: "u-dan", time: "2026-09-24T08:47", row: ["2026-09-24", "40731", "1180495", "1", "N", "G", "73", "13' 8.25\"", "72", "4' 2\"", "41.4", "73", "0.2", "0048797", "0048796", "12", "0", ""] },
  { driverId: "u-dan", time: "2026-09-24T11:05", row: ["2026-09-24", "40217", "1180533", "2", "N", "G", "75", "15' 0\"", "74", "4' 10.5\"", "42.3", "75", "0.1", "0048805", "0048804", "7", "0.75", ""] },
  { driverId: "u-dan", time: "2026-09-24T13:38", row: ["2026-09-24", "40844", "1180562", "3", "N", "G", "76", "14' 3.5\"", "75", "4' 1.25\"", "41.8", "76", "0.2", "0048813", "0048812", "12", "0", "B gauge confirmed by driver"], confirmed: "bottomGauge" },

  // Other drivers, 09/24 (Dispatch design)
  { driverId: "u-d02", time: "2026-09-24T06:40", row: ["2026-09-24", "40155", "1180476", "2", "N", "G", "70", "13' 2\"", "69", "4' 0.5\"", "40.6", "70", "0.3", "0051103", "0051102", "12", "0.5", ""] },
  { driverId: "u-d03", time: "2026-09-24T07:55", row: ["2026-09-24", "40990", "1180488", "1", "N", "G", "72", "14' 1.75\"", "71", "4' 3\"", "43.0", "72", "0.2", "0049316", "0049315", "7", "0", ""], edited: { field: "ticket", from: "1180483" } },
  { driverId: "u-d02", time: "2026-09-24T10:20", row: ["2026-09-24", "40162", "1180519", "3", "N", "G", "75", "13' 10\"", "74", "4' 5.25\"", "40.9", "75", "0.3", "0051109", "0051108", "12", "0", ""] },
  { driverId: "u-d04", time: "2026-09-24T12:50", row: ["2026-09-24", "41003", "1180551", "4", "N", "G", "77", "12' 9.5\"", "76", "4' 1\"", "39.8", "77", "0.4", "0052241", "0052240", "7", "1.25", "Waited on gauger"], confirmed: "sw" },
];

/** Converts an Odessa wall-clock time in late September (CDT, UTC-5) to an ISO instant. */
function cdt(local: string): string {
  return new Date(`${local}:00-05:00`).toISOString();
}

function toLoad(r: SeedRow, i: number): Load {
  const fields = Object.fromEntries(FIELD_KEYS.map((k, idx) => [k, r.row[idx]])) as LoadFields;
  const status = Object.fromEntries(
    FIELD_KEYS.map((k) => [k, (FIELD_BY_KEY[k].source === "driver" ? "driver" : "read") as FieldStatus]),
  ) as Record<FieldKey, FieldStatus>;

  const values: Partial<LoadFields> = {};
  const confidence: Partial<Record<FieldKey, number>> = {};
  for (const k of FIELD_KEYS) {
    if (FIELD_BY_KEY[k].source !== "ticket") continue;
    values[k] = fields[k];
    confidence[k] = 0.97;
  }

  const history: ChangeEntry[] = [];
  const flagged: FieldKey[] = [];
  if (r.confirmed) {
    status[r.confirmed] = "confirmed";
    confidence[r.confirmed] = 0.55;
    flagged.push(r.confirmed);
  }
  if (r.edited) {
    status[r.edited.field] = "edited";
    values[r.edited.field] = r.edited.from;
    history.push({
      at: cdt(r.time.slice(0, 11) + "15:10"),
      byUserId: "u-craig",
      byName: "Craig",
      field: r.edited.field,
      from: r.edited.from,
      to: fields[r.edited.field],
      note: "Checked against the ticket photo",
    });
  }

  const loggedAt = cdt(r.time);
  const reading: TicketReading = { reader: "sample", readAt: loggedAt, values, confidence, flagged, notes: "Sample data" };
  return {
    id: `seed-${String(i + 1).padStart(3, "0")}`,
    driverId: r.driverId,
    loggedAt,
    photoKey: null,
    fields,
    status,
    reading,
    history,
  };
}

export function seedLoads(): Load[] {
  return ROWS.map(toLoad);
}
