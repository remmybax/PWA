import { describe, expect, it } from "vitest";
import { rangeFor, rangeFromParams, rangeLabel, shiftRange, todayISO, weekStart } from "./dates";

describe("dates", () => {
  it("weeks run Sunday to Saturday like the paper sheet", () => {
    expect(weekStart("2026-09-24")).toBe("2026-09-20");
    expect(weekStart("2026-09-20")).toBe("2026-09-20");
    expect(rangeFor("week", "2026-09-26")).toEqual({ mode: "week", from: "2026-09-20", to: "2026-09-26" });
  });

  it("labels ranges like the dispatch design", () => {
    expect(rangeLabel(rangeFor("day", "2026-09-24"))).toBe("Thu, 09/24/2026");
    expect(rangeLabel(rangeFor("week", "2026-09-24"))).toBe("09/20 – 09/26");
    expect(rangeLabel(rangeFor("month", "2026-09-24"))).toBe("September 2026");
  });

  it("shifts ranges", () => {
    expect(shiftRange(rangeFor("month", "2026-12-15"), 1)).toBe("2027-01-01");
    expect(rangeFor("month", "2026-02-10").to).toBe("2026-02-28");
    expect(shiftRange(rangeFor("week", "2026-09-24"), -1)).toBe("2026-09-13");
  });

  it("uses Odessa time for today", () => {
    // 03:00 UTC on the 25th is still the evening of the 24th in Texas.
    expect(todayISO(new Date("2026-09-25T03:00:00Z"))).toBe("2026-09-24");
  });
});

describe("custom range and all time", () => {
  it("builds from-to ranges in either order", () => {
    expect(rangeFor("range", "2026-09-15", "2026-09-01")).toEqual({ mode: "range", from: "2026-09-01", to: "2026-09-15" });
    expect(rangeLabel(rangeFor("range", "2026-09-01", "2026-09-15"))).toBe("09/01/2026 – 09/15/2026");
  });

  it("has an all-time range with no dates", () => {
    expect(rangeFor("all", "2026-09-24")).toEqual({ mode: "all", from: "", to: "" });
    expect(rangeLabel(rangeFor("all", "2026-09-24"))).toBe("All time");
  });

  it("reads ranges from URL parameters", () => {
    const p = (o: Record<string, string>) => (k: string) => o[k];
    expect(rangeFromParams(p({ range: "range", from: "2026-09-01", to: "2026-09-15" }), "2026-10-11").to).toBe("2026-09-15");
    expect(rangeFromParams(p({ range: "all" }), "2026-10-11").mode).toBe("all");
    expect(rangeFromParams(p({ range: "bogus" }), "2026-10-11")).toEqual({ mode: "day", from: "2026-10-11", to: "2026-10-11" });
  });
});
