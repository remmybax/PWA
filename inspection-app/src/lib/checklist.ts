// The monthly inspection checklist. Every screen, the printed report, the dashboard and the
// export read from this one list, so adding, removing or rewording an item happens here only.
//
// Item kinds:
//   check    Pass / Fail / N/A
//   reading  a number the driver types (tread depth, odometer). With `min`, the app decides
//            pass/fail itself (tread below the minimum fails).
//   count    how many are on the truck. With `expected`, fewer than that fails.
//   doc      paperwork: Present / Missing / N/A, plus an expiration or due date when `date` is set.
//            A date in the past fails the item.
//   text     free text (location, VIN digits)
//
// Any Fail needs a note and a photo of the problem, whatever `photo` says.

export type ItemKind = "check" | "reading" | "count" | "doc" | "text";
export type PhotoRule = "required" | "optional";

export interface ChecklistItem {
  id: string;
  label: string;
  kind: ItemKind;
  photo?: PhotoRule;
  /** Shown under the label: what to look at, what counts as a fail. */
  help?: string;
  /** reading: unit shown after the number. */
  unit?: string;
  /** reading: lowest passing value. */
  min?: number;
  /** count: how many should be there. */
  expected?: number;
  /** doc: ask for a date, and what to call it. */
  date?: "Expires" | "Due";
  /** Which unit the item is about, for the documents/dates board. Defaults to the truck. */
  unit_of?: "truck" | "trailer";
}

export interface ChecklistSection {
  id: string;
  title: string;
  /** Short name for progress bars and the printed report. */
  short: string;
  intro: string;
  /** Sections about the trailer are skipped when the truck is inspected without one. */
  trailerOnly?: boolean;
  items: ChecklistItem[];
}

export const CHECKLIST_VERSION = "2026-10-draft-1";

export const SECTIONS: ChecklistSection[] = [
  {
    id: "start",
    title: "Truck ID and readings",
    short: "ID & readings",
    intro: "Photograph the dash and the VIN plates so the report proves which truck this was.",
    items: [
      { id: "odometer", label: "Odometer", kind: "reading", unit: "mi", photo: "required", help: "Photo of the dash showing the odometer." },
      { id: "engine-hours", label: "Engine hours", kind: "reading", unit: "hrs" },
      { id: "truck-vin", label: "Truck VIN plate (last 6)", kind: "text", photo: "required", help: "Type the last 6 characters." },
      { id: "trailer-vin", label: "Trailer VIN plate (last 6)", kind: "text", photo: "required", unit_of: "trailer", help: "Skip if no trailer." },
    ],
  },
  {
    id: "paperwork",
    title: "Paperwork and dates",
    short: "Paperwork",
    intro: "Photograph each document and enter its expiration or due date. The dashboard warns 30 days ahead.",
    items: [
      { id: "truck-registration", label: "Truck registration / cab card (IRP)", kind: "doc", date: "Expires", photo: "required" },
      { id: "trailer-registration", label: "Trailer registration", kind: "doc", date: "Expires", photo: "required", unit_of: "trailer" },
      { id: "insurance", label: "Insurance card", kind: "doc", date: "Expires", photo: "required" },
      { id: "ifta", label: "IFTA license (copy in cab) and decals on both sides", kind: "doc", date: "Expires", photo: "required" },
      { id: "truck-annual", label: "Truck annual DOT inspection", kind: "doc", date: "Due", photo: "required", help: "Report in the cab or sticker. Enter the date the next one is due." },
      { id: "trailer-annual", label: "Trailer annual DOT inspection", kind: "doc", date: "Due", photo: "required", unit_of: "trailer" },
      { id: "tank-vk", label: "Cargo tank tests: annual visual (V) and leak (K)", kind: "doc", date: "Due", photo: "required", unit_of: "trailer", help: "Test markings on the tank head. Enter when the next V/K is due." },
      { id: "tank-ip", label: "Cargo tank tests: 5-year internal (I) and pressure (P)", kind: "doc", date: "Due", photo: "required", unit_of: "trailer" },
      { id: "hazmat-registration", label: "PHMSA hazmat registration (copy in cab)", kind: "doc", date: "Expires", photo: "required" },
      { id: "erg", label: "Emergency Response Guidebook (current edition)", kind: "doc" },
      { id: "shipping-papers", label: "Shipping papers holder / emergency response info", kind: "doc" },
      { id: "eld-docs", label: "ELD instruction card, malfunction sheet, 8 days of blank logs", kind: "doc", photo: "required" },
      { id: "accident-kit", label: "Accident kit (report form, insurance contact)", kind: "doc" },
      { id: "extinguisher-tag", label: "Fire extinguisher inspection tag", kind: "doc", date: "Due", photo: "required" },
      { id: "h2s-calibration", label: "H2S monitor calibration / bump test", kind: "doc", date: "Due", photo: "required" },
      { id: "permits", label: "Permits and operating authority the truck must carry", kind: "doc", date: "Expires", photo: "optional", help: "List which ones in the note." },
    ],
  },
  {
    id: "supplies",
    title: "Safety equipment and supplies",
    short: "Supplies",
    intro: "Count what is on the truck. Anything short is a fail and goes on the defect list.",
    items: [
      { id: "extinguisher", label: "Fire extinguisher: mounted, charged, pin and seal intact", kind: "check", photo: "required" },
      { id: "triangles", label: "Reflective warning triangles", kind: "count", expected: 3, photo: "required" },
      { id: "first-aid", label: "First aid kit, stocked", kind: "check" },
      { id: "spill-kit", label: "Spill kit: absorbent pads/socks, bags", kind: "check", photo: "required" },
      { id: "chocks", label: "Wheel chocks", kind: "count", expected: 2 },
      { id: "h2s-monitor", label: "H2S personal monitor: present, powers on, no fault", kind: "check" },
      { id: "ppe", label: "Hard hat, safety glasses, gloves, hi-vis vest", kind: "check" },
      { id: "fr-clothing", label: "FR clothing available", kind: "check" },
      { id: "flashlight", label: "Flashlight (intrinsically safe)", kind: "check" },
      { id: "gauging-kit", label: "Gauging kit: tape and bob, thermometer, thief, sample jars", kind: "check", photo: "required" },
      { id: "seals", label: "Seals on hand", kind: "count", expected: 10 },
      { id: "ticket-book", label: "Blank run tickets / ticket book", kind: "check" },
      { id: "bonding-cable", label: "Bonding / grounding cable", kind: "check" },
      { id: "gaskets", label: "Spare hose gaskets and caps", kind: "check" },
    ],
  },
  {
    id: "tractor",
    title: "Tractor walk-around",
    short: "Tractor",
    intro: "Walk the truck: front, driver side, rear, passenger side, then under the hood.",
    items: [
      { id: "front-lights", label: "Front: headlights (low/high), turn signals, clearance and ID lights", kind: "check", photo: "required" },
      { id: "windshield", label: "Windshield, wipers, washer", kind: "check", help: "No cracks in the driver's view." },
      { id: "mirrors", label: "Mirrors: mounted, not cracked", kind: "check" },
      { id: "steer-tread-left", label: "Steer tire tread, driver side", kind: "reading", unit: "/32\"", min: 4, photo: "required" },
      { id: "steer-tread-right", label: "Steer tire tread, passenger side", kind: "reading", unit: "/32\"", min: 4, photo: "required" },
      { id: "drive-tread-left", label: "Drive tires tread, driver side (lowest)", kind: "reading", unit: "/32\"", min: 2, photo: "required" },
      { id: "drive-tread-right", label: "Drive tires tread, passenger side (lowest)", kind: "reading", unit: "/32\"", min: 2, photo: "required" },
      { id: "tire-condition", label: "Tires: no cuts, bulges or mismatched duals; pressures OK", kind: "check" },
      { id: "wheels", label: "Wheels and lug nuts: none missing or loose, no rust trails, hub oil", kind: "check" },
      { id: "brakes", label: "Brakes: chambers, slack adjusters, hoses, no air leaks", kind: "check", photo: "required" },
      { id: "suspension", label: "Suspension: springs, U-bolts, airbags", kind: "check" },
      { id: "steering", label: "Steering box and linkage: no leaks or play", kind: "check" },
      { id: "frame", label: "Frame and crossmembers: no cracks", kind: "check" },
      { id: "fuel-tanks", label: "Fuel tanks, caps and straps", kind: "check" },
      { id: "battery", label: "Battery box, cover, cables", kind: "check" },
      { id: "exhaust", label: "Exhaust and DPF: no leaks or damage", kind: "check" },
      { id: "def", label: "DEF level", kind: "check" },
      { id: "fifth-wheel", label: "Fifth wheel: locked, greased, mounting bolts, release handle", kind: "check", photo: "required" },
      { id: "air-lines", label: "Air lines, glad hands, electrical cord", kind: "check" },
      { id: "mud-flaps", label: "Mud flaps", kind: "check" },
      { id: "rear-lights", label: "Rear: brake lights, turn signals, tail lights", kind: "check" },
      { id: "body-driver", label: "Body, driver side: no new damage", kind: "check", photo: "required" },
      { id: "body-passenger", label: "Body, passenger side: no new damage", kind: "check", photo: "required" },
      { id: "leaks", label: "No fluid leaks under the truck (oil, coolant, fuel)", kind: "check", photo: "required" },
      { id: "engine-bay", label: "Under the hood: oil, coolant, belts, hoses, wiring", kind: "check", photo: "required" },
    ],
  },
  {
    id: "trailer",
    title: "Trailer and cargo tank",
    short: "Trailer",
    intro: "Start at the kingpin and walk the tank. Skipped automatically when there's no trailer.",
    trailerOnly: true,
    items: [
      { id: "kingpin", label: "Kingpin and upper coupler plate", kind: "check", unit_of: "trailer" },
      { id: "landing-gear", label: "Landing gear works, handle secured", kind: "check", unit_of: "trailer" },
      { id: "tank-driver", label: "Tank shell, driver side: no leaks, dents or cracks", kind: "check", photo: "required", unit_of: "trailer" },
      { id: "tank-passenger", label: "Tank shell, passenger side: no leaks, dents or cracks", kind: "check", photo: "required", unit_of: "trailer" },
      { id: "domes", label: "Dome / manhole lids, gaskets and latches", kind: "check", photo: "required", unit_of: "trailer" },
      { id: "vents", label: "Vents and pressure relief", kind: "check", unit_of: "trailer" },
      { id: "internal-valve", label: "Internal valve and emergency remote shutoff work", kind: "check", unit_of: "trailer" },
      { id: "outlets", label: "Outlet valves, caps and seals", kind: "check", photo: "required", unit_of: "trailer" },
      { id: "hoses", label: "Hoses: condition, couplings, hose tubes", kind: "check", unit_of: "trailer" },
      { id: "ladder", label: "Ladder and catwalk secure", kind: "check", unit_of: "trailer" },
      { id: "placards", label: "Placards (UN 1267) on all four sides, clean and readable", kind: "check", photo: "required", unit_of: "trailer" },
      { id: "conspicuity", label: "Reflective conspicuity tape", kind: "check", unit_of: "trailer" },
      { id: "trailer-tread-left", label: "Trailer tires tread, driver side (lowest)", kind: "reading", unit: "/32\"", min: 2, photo: "required", unit_of: "trailer" },
      { id: "trailer-tread-right", label: "Trailer tires tread, passenger side (lowest)", kind: "reading", unit: "/32\"", min: 2, photo: "required", unit_of: "trailer" },
      { id: "trailer-wheels", label: "Trailer wheels and lug nuts", kind: "check", unit_of: "trailer" },
      { id: "trailer-brakes", label: "Trailer brakes, air lines, ABS lamp", kind: "check", unit_of: "trailer" },
      { id: "trailer-lights", label: "Trailer lights: clearance, marker, brake, turn", kind: "check", photo: "required", unit_of: "trailer" },
      { id: "underride", label: "Rear bumper / underride guard", kind: "check", unit_of: "trailer" },
    ],
  },
  {
    id: "cab",
    title: "In the cab",
    short: "Cab",
    intro: "Start the engine for these.",
    items: [
      { id: "dash-lights", label: "Dash: no warning lights after start-up", kind: "check", photo: "required" },
      { id: "gauges", label: "Gauges work (air, oil, temp, fuel)", kind: "check" },
      { id: "air-test", label: "Air pressure build-up and leak-down check", kind: "check" },
      { id: "horn", label: "Horn (city and air)", kind: "check" },
      { id: "hvac", label: "Heater, defroster, AC", kind: "check" },
      { id: "seat-belt", label: "Seat belt", kind: "check" },
      { id: "parking-brake", label: "Parking brake holds", kind: "check" },
      { id: "eld", label: "ELD works and is logged in", kind: "check" },
      { id: "cab-clean", label: "Cab clean, no loose items", kind: "check", photo: "required" },
    ],
  },
];

export const ALL_ITEMS: ChecklistItem[] = SECTIONS.flatMap((s) => s.items);

export const ITEM_BY_ID: Record<string, ChecklistItem> = Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i]));

export const SECTION_OF: Record<string, ChecklistSection> = Object.fromEntries(
  SECTIONS.flatMap((s) => s.items.map((i) => [i.id, s] as const)),
);

/** Sections that apply to this inspection (trailer sections drop out with no trailer). */
export function sectionsFor(hasTrailer: boolean): ChecklistSection[] {
  return SECTIONS.map((s) => (hasTrailer ? s : { ...s, items: s.items.filter((i) => i.unit_of !== "trailer") })).filter(
    (s) => s.items.length > 0 && (hasTrailer || !s.trailerOnly),
  );
}
