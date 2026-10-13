import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sectionsFor } from "@/lib/checklist";
import type { ItemResult, User } from "@/lib/types";
import { JsonFileStore } from "./store";
import { certify, discardDraft, resolveDefect, saveItemResult, startInspection } from "./inspections";
import { addPerson, updatePerson } from "./people";
import { addVehicle } from "./fleet";

const photo = { key: "seed-zone1.jpg", takenAt: "2026-10-13T12:00:00Z" };
const driver: User = { id: "u-mike", name: "Mike Reyes", role: "driver", active: true, createdAt: "" };
const other: User = { id: "u-jose", name: "Jose Garza", role: "driver", active: true, createdAt: "" };
const manager: User = { id: "u-dan", name: "Dan V.", role: "manager", active: true, createdAt: "" };
const viewer: User = { id: "u-office", name: "Office", role: "viewer", active: true, createdAt: "" };

function freshStore() {
  return new JsonFileStore(mkdtempSync(path.join(tmpdir(), "insp-")));
}

function passFor(id: string, kind: string, needsPhoto: boolean): ItemResult {
  const r: ItemResult = { photos: needsPhoto ? [photo] : [] };
  if (kind === "reading") r.value = "12";
  else if (kind === "count") r.value = "10";
  else if (kind === "text") r.value = "ABC123";
  else r.verdict = "pass";
  if (kind === "doc") r.date = "2030-01-01";
  return r;
}

async function fillAll(store: JsonFileStore, user: User, id: string, hasTrailer: boolean) {
  for (const item of sectionsFor(hasTrailer).flatMap((s) => s.items)) {
    await saveItemResult(user, id, item.id, passFor(item.id, item.kind, item.photo === "required"), store);
  }
}

describe("inspection rules", () => {
  it("runs start → answer → sign, then locks", async () => {
    const store = freshStore();
    const insp = await startInspection(driver, { truckId: "v-105", trailerId: null, location: "Yard" }, store);
    // Picking the same truck again resumes the draft.
    expect((await startInspection(driver, { truckId: "v-105", trailerId: null, location: "" }, store)).id).toBe(insp.id);

    await expect(certify(driver, insp.id, { overall: "in_service", comments: "", signature: "Mike" }, store)).rejects.toThrow(/not finished/);
    await fillAll(store, driver, insp.id, false);
    await saveItemResult(driver, insp.id, "mud-flaps", { verdict: "fail", note: "torn", photos: [photo] }, store);
    await expect(certify(driver, insp.id, { overall: "in_service", comments: "", signature: "Mike" }, store)).rejects.toThrow(/failed items/);
    await expect(certify(driver, insp.id, { overall: "needs_repair", comments: "", signature: " " }, store)).rejects.toThrow(/Type your name/);
    const signed = await certify(driver, insp.id, { overall: "needs_repair", comments: "ok", signature: "Mike Reyes" }, store);
    expect(signed.certifiedAt).toBeTruthy();

    await expect(saveItemResult(driver, insp.id, "mud-flaps", { verdict: "pass", photos: [] }, store)).rejects.toThrow(/signed off/);
    await expect(discardDraft(driver, insp.id, store)).rejects.toThrow(/signed off/);
  });

  it("only lets the inspector edit their draft, and keeps viewers out", async () => {
    const store = freshStore();
    const insp = await startInspection(driver, { truckId: "v-101", trailerId: "v-t-201", location: "" }, store);
    await expect(saveItemResult(other, insp.id, "horn", { verdict: "pass", photos: [] }, store)).rejects.toThrow(/not found/);
    await expect(startInspection(viewer, { truckId: "v-101", trailerId: null, location: "" }, store)).rejects.toThrow(/View-only/);
  });

  it("refuses trailer items on a bobtail inspection, fractions, and junk photo keys", async () => {
    const store = freshStore();
    const insp = await startInspection(driver, { truckId: "v-105", trailerId: null, location: "" }, store);
    await expect(saveItemResult(driver, insp.id, "tank-vk", { verdict: "pass", photos: [] }, store)).rejects.toThrow(/isn't part/);
    await expect(saveItemResult(driver, insp.id, "steer-tread-left", { value: "4/32", photos: [] }, store)).rejects.toThrow(/Numbers only/);
    const saved = await saveItemResult(driver, insp.id, "horn", { verdict: "pass", photos: [{ key: "../../etc/passwd", takenAt: "2026-10-13" }, photo] }, store);
    expect(saved.photos).toEqual([photo]);
  });

  it("lets the shop mark a defect repaired, but not a driver", async () => {
    const store = freshStore();
    const insp = await startInspection(driver, { truckId: "v-105", trailerId: null, location: "" }, store);
    await fillAll(store, driver, insp.id, false);
    await saveItemResult(driver, insp.id, "horn", { verdict: "fail", note: "no air horn", photos: [photo] }, store);
    await certify(driver, insp.id, { overall: "needs_repair", comments: "", signature: "Mike Reyes" }, store);
    await expect(resolveDefect(driver, insp.id, "horn", { note: "fixed" }, store)).rejects.toThrow(/Only managers/);
    await expect(resolveDefect(manager, insp.id, "seat-belt", { note: "fixed" }, store)).rejects.toThrow(/didn't fail/);
    await resolveDefect(manager, insp.id, "horn", { note: "Replaced air horn valve" }, store);
    expect((await store.getInspection(insp.id))!.results.horn.resolution?.byName).toBe("Dan V.");
  });
});

describe("fleet and people", () => {
  it("refuses duplicate unit numbers and non-managers", async () => {
    const store = freshStore();
    const base = { kind: "truck" as const, unit: "101", vin: "", year: "", make: "", model: "", plate: "", notes: "" };
    await expect(addVehicle(manager, base, store)).rejects.toThrow(/already on the list/);
    await expect(addVehicle(driver, { ...base, unit: "200" }, store)).rejects.toThrow(/Only managers/);
    const v = await addVehicle(manager, { ...base, unit: " 200 " }, store);
    expect(v.unit).toBe("200");
  });
  it("never leaves the company without a manager", async () => {
    const store = freshStore();
    const p = await addPerson(manager, { name: "New Boss", role: "manager" }, store, false);
    await updatePerson(manager, "u-kevin", { active: false }, store);
    await updatePerson(manager, p.id, { active: false }, store);
    await expect(updatePerson(manager, "u-dan", { role: "driver" }, store)).rejects.toThrow(/at least one active manager/);
  });
});
