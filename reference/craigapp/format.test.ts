import { describe, expect, it } from "vitest";
import { normalizeField, parseGauge, parseMixedNumber, validateLoad, displayValue, fitClass, sheetColumns, shortName, stationCode, sumHours } from "./format";

const ctxG = { gm: "G", refISO: "2026-09-24" };
const ctxM = { gm: "M", refISO: "2026-09-24" };

describe("no fractions anywhere", () => {
  it("converts fractions to decimals", () => {
    expect(parseMixedNumber("3 1/2")).toBe(3.5);
    expect(parseMixedNumber("3-1/4")).toBe(3.25);
    expect(parseMixedNumber("¾")).toBe(0.75);
    expect(parseMixedNumber("1/0")).toBeNull();
  });

  it.each([
    [`14' 3.5"`, `14' 3.5"`],
    [`14' 3 1/2"`, `14' 3.5"`],
    [`14'3½"`, `14' 3.5"`],
    ["14 3.5", `14' 3.5"`],
    ["14-3-1/2", `14' 3.5"`],
    ["4ft 1.25in", `4' 1.25"`],
    [`13' 8 3/4`, `13' 8.75"`],
    [`15' 0"`, `15' 0"`],
    ["15", `15' 0"`],
    ["13’ 9”", `13' 9"`],
  ])("gauge %s -> %s", (input, out) => {
    expect(normalizeField("topGauge", input, ctxG)).toEqual({ ok: true, value: out });
  });

  it("never stores a slash in any numeric field", () => {
    for (const key of ["tTemp", "obGrav", "obTemp", "sw", "waitTime"] as const) {
      const r = normalizeField(key, "1/4", ctxG);
      expect(r.ok).toBe(true);
      expect(r.value).not.toContain("/");
    }
  });

  it("rejects impossible gauges", () => {
    expect(parseGauge(`14' 12"`)).toBeNull();
    expect(parseGauge("abc")).toBeNull();
    expect(normalizeField("topGauge", `4' 13"`, ctxG).ok).toBe(false);
  });

  it("treats gauge columns as meter readings on meter loads", () => {
    expect(normalizeField("topGauge", "20,418.6", ctxM)).toEqual({ ok: true, value: "20418.6" });
  });
});

describe("normalizeField", () => {
  it("keeps plain decimals as written", () => {
    expect(normalizeField("obGrav", "43.0", ctxG).value).toBe("43.0");
    expect(normalizeField("waitTime", "1.50", ctxG).value).toBe("1.50");
    expect(normalizeField("waitTime", ".5", ctxG).value).toBe("0.5");
    expect(normalizeField("waitTime", "1.5 hrs", ctxG).value).toBe("1.5");
  });

  it("parses dates to ISO and fills the year", () => {
    expect(normalizeField("date", "09/24", ctxG).value).toBe("2026-09-24");
    expect(normalizeField("date", "9/24/26", ctxG).value).toBe("2026-09-24");
    expect(normalizeField("date", "12/30", { gm: "G", refISO: "2027-01-02" }).value).toBe("2026-12-30");
    expect(normalizeField("date", "02/30", ctxG).ok).toBe(false);
  });

  it("keeps leading zeros on seals", () => {
    expect(normalizeField("sealOn", "0048813", ctxG).value).toBe("0048813");
  });

  it("normalizes Y/N and G/M", () => {
    expect(normalizeField("reject", "yes", ctxG).value).toBe("Y");
    expect(normalizeField("gm", "meter", ctxG).value).toBe("M");
    expect(normalizeField("gm", "x", ctxG).ok).toBe(false);
  });
});

describe("validateLoad", () => {
  it("blanks tank temps on meter loads and reports required fields", () => {
    const { fields, problems } = validateLoad({ gm: "M", tTemp: "70", ticket: "" }, { refISO: "2026-09-24", required: ["ticket"] });
    expect(fields.tTemp).toBe("");
    expect(problems).toEqual([{ key: "ticket", error: "Required" }]);
  });
});

describe("display helpers", () => {
  it("formats values for the sheet", () => {
    expect(displayValue("date", "2026-09-24")).toBe("09/24");
    expect(displayValue("sealOn", "")).toBe("—");
    expect(displayValue("comments", "")).toBe("");
    expect(shortName("Dan VanWormer")).toBe("D. VanWormer");
    expect(shortName("Driver 02")).toBe("Driver 02");
    expect(sumHours(["0.25", "1.5", "", "0"])).toBe("1.75");
  });
});

describe("station code", () => {
  it.each([
    ["PLAINS BADGER TRK - 7185", "7185"],
    ["Station 412", "412"],
    ["DB ANDREWS", "DB ANDREWS"],
    ["CR1 - MARATHON", "CR1 - MARATHON"],
    ["P66", "P66"],
    ["7185", "7185"],
    ["PLANT 12 TRK 2045", "2045"],
    ["UNIT 1200 - 3400", "UNIT 1200 - 3400"],
  ])("%s -> %s", (input, out) => {
    expect(stationCode(input)).toBe(out);
  });
});

describe("shrink to fit", () => {
  it("shrinks by how wide the column is, not a fixed length", () => {
    expect(fitClass("3", 44)).toBe(""); // Tank #
    expect(fitClass("0048813", 76)).toBe(""); // Seal On fits as is
    expect(fitClass("073513", 44)).toBe("fit-xs"); // long tank number in a narrow column
    expect(fitClass("YADA CTB", 64)).toBe("fit-sm");
    expect(fitClass("PARABO FACILITY", 64)).toBe("fit-wrap");
    expect(fitClass("Waited on gauger", 180)).toBe("");
  });

  it("builds the sheet's grid from the field widths", () => {
    expect(sheetColumns([{ key: "date", width: 52 }, { key: "comments", width: 180 }])).toBe("52px minmax(180px, 1fr)");
  });
});
