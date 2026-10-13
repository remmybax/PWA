// The 18 columns of the paper log sheet, in sheet order. This list drives every screen, the
// ticket-reading prompt, CSV/Excel export and the PDF, so adding a field (e.g. net barrels, if
// Craig asks for it) starts here.

export const FIELD_KEYS = [
  "date",
  "lease",
  "ticket",
  "tank",
  "reject",
  "gm",
  "tTemp",
  "topGauge",
  "bTemp",
  "bottomGauge",
  "obGrav",
  "obTemp",
  "sw",
  "sealOn",
  "sealOff",
  "station",
  "waitTime",
  "comments",
] as const;

export type FieldKey = (typeof FIELD_KEYS)[number];

/** Where a value comes from: printed on the run ticket, or added by the driver. */
export type FieldSource = "ticket" | "driver";

/**
 * How a value is parsed, validated and displayed.
 * - gauge: feet + decimal inches when G/M is G, a meter reading when M
 * - temp: °F, whole or decimal
 * - decimal: plain decimal number (gravity, S&W, wait hours)
 * - digits: identifier that may carry leading zeros (seals)
 */
export type FieldKind =
  | "date"
  | "text"
  | "digits"
  | "yn"
  | "gm"
  | "temp"
  | "gauge"
  | "decimal"
  | "longtext";

export interface FieldDef {
  key: FieldKey;
  /** Column heading exactly as printed on the paper sheet. */
  sheetLabel: string;
  /** Label used in forms and detail panels. */
  label: string;
  source: FieldSource;
  kind: FieldKind;
  /** Blank when the load is a meter (LACT) load. */
  gaugeOnly?: boolean;
  /** Column width on the sheet, in pixels at normal size (from the designs). Comments is the minimum. */
  width: number;
  /** Hint given to the ticket reader. */
  readerHint?: string;
}

export const FIELDS: readonly FieldDef[] = [
  { key: "date", width: 52, sheetLabel: "Date", label: "Date", source: "ticket", kind: "date", readerHint: "Date of the load. Return as YYYY-MM-DD." },
  { key: "lease", width: 64, sheetLabel: "Lease #", label: "Lease #", source: "ticket", kind: "text", readerHint: "The lease number printed after Lease #. If no lease number is printed, use the lease name instead: the name printed on its own line under the shipper, between the dashed lines, just above Federal Lease Number (e.g. YADA CTB, PARABO FACILITY, HACKBERRY 201H). Never a handwritten number." },
  { key: "ticket", width: 72, sheetLabel: "Ticket#", label: "Ticket #", source: "ticket", kind: "text", readerHint: "The run ticket number: the number printed under the TICKET heading (between the ===== lines). Not the BOL #, PO #, tank number or any other number." },
  { key: "tank", width: 44, sheetLabel: "Tank #", label: "Tank #", source: "ticket", kind: "text", readerHint: "Tank number." },
  {
    key: "reject",
    width: 52,
    sheetLabel: "Reject",
    label: "Reject",
    source: "driver",
    kind: "yn",
    readerHint: "From the printed Rejected line: \"N\" if it says Accept (or the line is blank), \"Y\" if it gives anything else, such as a reason like High BS&W.",
  },
  { key: "gm", width: 40, sheetLabel: "G/M", label: "G/M", source: "ticket", kind: "gm", readerHint: "\"G\" if measured by tank gauge (top/bottom gauges), \"M\" if measured by meter / LACT unit." },
  { key: "tTemp", width: 56, sheetLabel: "T.Temp", label: "T.Temp", source: "ticket", kind: "temp", gaugeOnly: true, readerHint: "Top (opening) tank temperature in °F. Empty for meter loads." },
  { key: "topGauge", width: 76, sheetLabel: "Top gauge\nor meter", label: "Top gauge", source: "ticket", kind: "gauge", readerHint: "Top (opening) gauge as feet and inches, or the opening meter reading for meter loads." },
  { key: "bTemp", width: 56, sheetLabel: "B.Temp", label: "B.Temp", source: "ticket", kind: "temp", gaugeOnly: true, readerHint: "Bottom (closing) tank temperature in °F. Empty for meter loads." },
  { key: "bottomGauge", width: 76, sheetLabel: "B Gauge\nor meter", label: "B Gauge", source: "ticket", kind: "gauge", readerHint: "Bottom (closing) gauge as feet and inches, or the closing meter reading for meter loads." },
  { key: "obGrav", width: 60, sheetLabel: "Ob.Grav", label: "Ob.Grav", source: "ticket", kind: "decimal", readerHint: "Observed API gravity." },
  { key: "obTemp", width: 60, sheetLabel: "Ob.Temp", label: "Ob.Temp", source: "ticket", kind: "temp", readerHint: "Observed temperature in °F (the temperature the gravity was observed at)." },
  { key: "sw", width: 44, sheetLabel: "S&W", label: "S&W", source: "ticket", kind: "decimal", readerHint: "Sediment & water (BS&W), as printed, usually a percent like 0.2." },
  { key: "sealOn", width: 76, sheetLabel: "Seal On", label: "Seal On", source: "ticket", kind: "digits", readerHint: "Seal number put on. Keep leading zeros. Often empty for meter loads." },
  { key: "sealOff", width: 76, sheetLabel: "Seal Off", label: "Seal Off", source: "ticket", kind: "digits", readerHint: "Seal number taken off. Keep leading zeros. Often empty for meter loads." },
  {
    key: "station",
    width: 56,
    sheetLabel: "Station #",
    label: "Station #",
    source: "driver",
    kind: "text",
    readerHint:
      "The unload station, from the LAST printed line of the Receiver section (the station or facility where the load was unloaded). If that line has a 3 or 4 digit station code, return only the code: \"PLAINS BADGER TRK - 7185\" gives \"7185\". Otherwise return the station name: for Receiver \"ENERGY TRANSFER / DB ANDREWS\" return \"DB ANDREWS\"; for \"MARATHON / CR1 - MARATHON\" return \"CR1 - MARATHON\". If the receiver is a single line (e.g. P66), use that. Never leave this empty if a receiver is printed.",
  },
  { key: "waitTime", width: 48, sheetLabel: "Wait\nTime", label: "Wait Time", source: "driver", kind: "decimal" },
  {
    key: "comments",
    width: 180,
    sheetLabel: "Comments",
    label: "Comments",
    source: "driver",
    kind: "longtext",
    readerHint:
      "Only for a rejected load: \"Rejected: <the printed reject reason>\", e.g. \"Rejected: High BS&W\". Empty for every load that was accepted. Never copy handwritten notes.",
  },
];

/** The Driver column that dispatch views and fleet exports add in front of the sheet columns. */
export const DRIVER_COLUMN_WIDTH = 112;

export const FIELD_BY_KEY: Record<FieldKey, FieldDef> = Object.fromEntries(
  FIELDS.map((f) => [f.key, f]),
) as Record<FieldKey, FieldDef>;

export const TICKET_FIELDS = FIELDS.filter((f) => f.source === "ticket");

/**
 * Everything the ticket reader is asked for: the printed ticket fields plus driver fields it can
 * suggest from the ticket (Station #). Suggestions prefill the driver's section; they're never flagged.
 */
export const READ_FIELDS = FIELDS.filter((f) => f.source === "ticket" || f.readerHint);
export const DRIVER_FIELDS = FIELDS.filter((f) => f.source === "driver");

export type LoadFields = Record<FieldKey, string>;

export function emptyFields(): LoadFields {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, ""])) as LoadFields;
}

/**
 * The driver ticks these off against the paper on every load, whatever the reader's confidence:
 * the reader's confidence isn't reliable (Gemini Flash-Lite has dropped a digit from a ticket
 * number while scoring it 95%), and these are the fields that cost money when wrong.
 */
export const ALWAYS_CHECK: FieldKey[] = ["ticket", "topGauge", "bottomGauge"];

/** Fields the ticket must supply for a load to be logged. */
export function requiredTicketFields(gm: string): FieldKey[] {
  // Lease # is optional: some tickets genuinely have none, and an empty space stays empty.
  const base: FieldKey[] = ["date", "ticket", "tank", "gm", "topGauge", "bottomGauge", "obGrav", "obTemp", "sw"];
  return gm === "M" ? base : [...base, "tTemp", "bTemp"];
}
