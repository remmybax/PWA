import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, sectionsFor } from "./checklist";
import { addMonths } from "./dates";
import { answerText, dateStatus, defects, itemProblem, missing, nextDue, verdictOf } from "./inspection";

const today = "2026-10-13";
const item = (id: string) => ITEM_BY_ID[id];

describe("verdictOf", () => {
  it("judges tread readings against the minimum", () => {
    expect(verdictOf(item("steer-tread-left"), { value: "4", photos: [] }, today)).toBe("pass");
    expect(verdictOf(item("steer-tread-left"), { value: "3", photos: [] }, today)).toBe("fail");
    expect(verdictOf(item("drive-tread-left"), { value: "2", photos: [] }, today)).toBe("pass");
  });
  it("judges counts against the expected number", () => {
    expect(verdictOf(item("triangles"), { value: "3", photos: [] }, today)).toBe("pass");
    expect(verdictOf(item("triangles"), { value: "2", photos: [] }, today)).toBe("fail");
  });
  it("fails a present document whose date has passed", () => {
    expect(verdictOf(item("insurance"), { verdict: "pass", date: "2026-10-12", photos: [] }, today)).toBe("fail");
    expect(verdictOf(item("insurance"), { verdict: "pass", date: "2026-10-13", photos: [] }, today)).toBe("pass");
  });
  it("lets N/A win over a number", () => {
    expect(verdictOf(item("steer-tread-left"), { verdict: "na", value: "1", photos: [] }, today)).toBe("na");
  });
  it("treats a typed reading without a limit as a pass", () => {
    expect(verdictOf(item("odometer"), { value: "401234", photos: [] }, today)).toBe("pass");
    expect(verdictOf(item("odometer"), { value: "", photos: [] }, today)).toBeUndefined();
  });
});

describe("itemProblem", () => {
  const photo = { key: "seed-zone1.jpg", takenAt: "2026-10-13T12:00:00Z" };
  it("asks for the required photo", () => {
    expect(itemProblem(item("front-lights"), { verdict: "pass", photos: [] }, today)).toBe("Take the photo");
    expect(itemProblem(item("front-lights"), { verdict: "pass", photos: [photo] }, today)).toBeNull();
  });
  it("needs a note and a photo on a fail, even for items without a required photo", () => {
    expect(itemProblem(item("mud-flaps"), { verdict: "fail", photos: [] }, today)).toBe("Say what's wrong");
    expect(itemProblem(item("mud-flaps"), { verdict: "fail", note: "torn", photos: [] }, today)).toBe("Photo of the problem");
    expect(itemProblem(item("mud-flaps"), { verdict: "fail", note: "torn", photos: [photo] }, today)).toBeNull();
  });
  it("needs the date on a dated document", () => {
    expect(itemProblem(item("insurance"), { verdict: "pass", photos: [photo] }, today)).toBe("Enter the expires date");
    expect(itemProblem(item("insurance"), { verdict: "pass", date: "2027-01-01", photos: [photo] }, today)).toBeNull();
  });
  it("accepts N/A with nothing else", () => {
    expect(itemProblem(item("insurance"), { verdict: "na", photos: [] }, today)).toBeNull();
  });
});

describe("whole inspection", () => {
  it("drops the trailer items with no trailer", () => {
    const ids = sectionsFor(false).flatMap((s) => s.items.map((i) => i.id));
    expect(ids).not.toContain("tank-vk");
    expect(ids).not.toContain("trailer-vin");
    expect(sectionsFor(false).some((s) => s.id === "trailer")).toBe(false);
    expect(sectionsFor(true).some((s) => s.id === "trailer")).toBe(true);
  });
  it("lists everything missing on a blank inspection, and the defects once failed", () => {
    const blank = { trailerId: null, results: {} };
    expect(missing(blank, today).length).toBe(sectionsFor(false).flatMap((s) => s.items).length);
    const failed = { trailerId: null, results: { "mud-flaps": { verdict: "fail" as const, note: "torn", photos: [] } } };
    expect(defects(failed, today).map((d) => d.item.id)).toEqual(["mud-flaps"]);
  });
});

describe("dates", () => {
  it("adds a month, clamping to the end of the month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-13", 1)).toBe("2026-11-13");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
  });
  it("is due a month after sign-off, in Odessa time", () => {
    // 2026-10-13 03:00 UTC is still the 12th in Odessa.
    expect(nextDue("2026-10-13T03:00:00Z")).toBe("2026-11-12");
  });
  it("flags dates 30 days out", () => {
    expect(dateStatus("2026-11-12", today).status).toBe("soon");
    expect(dateStatus("2026-11-13", today).status).toBe("ok");
    expect(dateStatus("2026-10-12", today)).toEqual({ status: "overdue", days: -1 });
  });
  it("writes answers for reports", () => {
    expect(answerText(item("triangles"), { value: "2", photos: [] }, today)).toBe("2 of 3");
    expect(answerText(item("insurance"), { verdict: "pass", date: "2027-03-01", photos: [] }, today)).toBe("Present, expires 03/01/2027");
  });
});
