import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonFileStore } from "./store";
import {
  editLoad, flaggedFields, getLoadFor, listLoadsFor, logLoad, recordReading,
  ValidationError, ForbiddenError, NotFoundError, DuplicateTicketError,
} from "./loads";
import { SEED_USERS } from "./seed-data";
import { nothingWasRead, summaryStatus } from "@/lib/types";

const dan = SEED_USERS.find((u) => u.id === "u-dan")!;
const d02 = SEED_USERS.find((u) => u.id === "u-d02")!;
const craig = SEED_USERS.find((u) => u.id === "u-craig")!;
const blaze = SEED_USERS.find((u) => u.id === "u-blaze")!;

const ticketValues = {
  date: "2026-09-25", lease: "40844", ticket: "1180999", tank: "3", gm: "G", tTemp: "76", topGauge: `14' 3.5"`,
  bTemp: "75", bottomGauge: `4' 1.25"`, obGrav: "41.8", obTemp: "76", sw: "0.2", sealOn: "0048813", sealOff: "0048812", station: "P66",
};

/** What a driver ticks on every load (ALWAYS_CHECK). */
const CHECKED = ["ticket", "topGauge", "bottomGauge"] as const;

let store: JsonFileStore;
beforeEach(() => {
  store = new JsonFileStore(mkdtempSync(path.join(tmpdir(), "itl-")));
});

async function read(photoKey: string, lowConfidence: string[] = []) {
  const confidence = Object.fromEntries(Object.keys(ticketValues).map((k) => [k, lowConfidence.includes(k) ? 0.4 : 0.98]));
  return recordReading(dan, photoKey, { reader: "gemini", readAt: new Date().toISOString(), values: ticketValues, confidence }, store);
}

describe("permissions", () => {
  it("drivers only see their own loads", async () => {
    const mine = await listLoadsFor(dan, { driverId: "u-d02" }, store);
    expect(mine.length).toBe(10);
    expect(mine.every((l) => l.driverId === "u-dan")).toBe(true);
    const other = (await store.listLoads({ driverId: "u-d02" }))[0];
    await expect(getLoadFor(dan, other.id, store)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("dispatch and granted viewers see everyone", async () => {
    expect((await listLoadsFor(craig, {}, store)).length).toBe(14);
    expect((await listLoadsFor(blaze, {}, store)).length).toBe(14);
  });

  it("only dispatch edits", async () => {
    const load = (await store.listLoads({ driverId: "u-dan" }))[0];
    await expect(editLoad(dan, load.id, { waitTime: "3" }, undefined, store)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(editLoad(blaze, load.id, { waitTime: "3" }, undefined, store)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("logging a load", () => {
  it("requires flagged fields to be confirmed", async () => {
    const r = await read("p1", ["bottomGauge"]);
    expect(r.flagged).toEqual(["bottomGauge"]);
    const input = { photoKey: "p1", fields: { ...ticketValues, station: "12" }, confirmed: [] };
    await expect(logLoad(dan, input, store)).rejects.toBeInstanceOf(ValidationError);
    const load = await logLoad(dan, { ...input, confirmed: [...CHECKED] }, store);
    expect(load.status.bottomGauge).toBe("confirmed");
    expect(load.status.topGauge).toBe("read");
    expect(load.status.station).toBe("driver");
    expect(load.fields.reject).toBe("N");
    expect(load.fields.waitTime).toBe("0");
  });

  it("marks driver corrections and keeps the original reading", async () => {
    await read("p2");
    const load = await logLoad(dan, { photoKey: "p2", fields: { ...ticketValues, sw: "0.3" }, confirmed: [...CHECKED] }, store);
    expect(load.status.sw).toBe("confirmed");
    expect(load.reading?.values.sw).toBe("0.2");
  });

  it("logs a ticket typed in from the photo when nothing was read", async () => {
    const r = await recordReading(dan, "p5", { reader: "none", readAt: new Date().toISOString(), values: {}, confidence: {} }, store);
    expect(r.flagged.length).toBe(14);
    const fields = { ...ticketValues, ticket: "1180777", sealOn: "", sealOff: "" };
    const load = await logLoad(dan, { photoKey: "p5", fields, confirmed: r.flagged }, store);
    expect(load.status.ticket).toBe("driver");
    expect(load.status.sealOn).toBe("driver");
    expect(summaryStatus(load)).toBe("typed");
  });

  it("won't log a load without a station or receiver", async () => {
    await read("p6");
    await expect(logLoad(dan, { photoKey: "p6", fields: { ...ticketValues, ticket: "1180888", station: "" }, confirmed: [...CHECKED] }, store)).rejects.toMatchObject({
      problems: [{ key: "station", error: "Required" }],
    });
  });

  it("rejects a ticket number that's already logged", async () => {
    await read("p3");
    await expect(
      logLoad(dan, { photoKey: "p3", fields: { ...ticketValues, ticket: "1180562" }, confirmed: [...CHECKED] }, store),
    ).rejects.toBeInstanceOf(DuplicateTicketError);
  });

  it("won't let a driver log another driver's photo", async () => {
    await read("p4");
    await expect(logLoad(d02, { photoKey: "p4", fields: ticketValues, confirmed: [] }, store)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("dispatch edits", () => {
  it("records every change and never loses the original", async () => {
    const load = (await store.listLoads({ driverId: "u-dan" }))[0];
    const updated = await editLoad(craig, load.id, { waitTime: "0.75" }, "Per phone call", store);
    expect(updated.fields.waitTime).toBe("0.75");
    expect(updated.status.waitTime).toBe("edited");
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0]).toMatchObject({ field: "waitTime", from: "0.25", to: "0.75", byName: "Craig", note: "Per phone call" });

    const again = await editLoad(craig, load.id, { waitTime: "1" }, undefined, store);
    expect(again.history.map((h) => h.from)).toEqual(["0.25", "0.75"]);
  });

  it("validates edits", async () => {
    const load = (await store.listLoads({ driverId: "u-dan" }))[0];
    await expect(editLoad(craig, load.id, { topGauge: `14' 3 1/2"` }, undefined, store)).resolves.toMatchObject({
      fields: { topGauge: `14' 3.5"` },
    });
    await expect(editLoad(craig, load.id, { topGauge: "lots" }, undefined, store)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("ticket #, top gauge and B gauge are always ticked off", () => {
  it("won't log until the driver ticks all three, even when the reader is sure", async () => {
    await read("p7");
    const fields = { ...ticketValues, ticket: "1180999" };
    await expect(logLoad(dan, { photoKey: "p7", fields, confirmed: ["ticket", "topGauge"] }, store)).rejects.toMatchObject({
      problems: [{ key: "bottomGauge", error: "Check this against the ticket" }],
    });
    const load = await logLoad(dan, { photoKey: "p7", fields, confirmed: ["ticket", "topGauge", "bottomGauge"] }, store);
    // Ticked but unchanged stays "read", so it doesn't pile up in dispatch's spot-check count.
    expect(load.status.ticket).toBe("read");
  });
});

describe("empty spaces stay empty", () => {
  it("logs a ticket with no lease number, and doesn't flag the blank", async () => {
    const values = { ...ticketValues, lease: "" };
    const confidence = Object.fromEntries(Object.keys(values).map((k) => [k, 0.98]));
    const r = await recordReading(dan, "p8", { reader: "gemini", readAt: new Date().toISOString(), values, confidence }, store);
    expect(r.flagged).not.toContain("lease");
    const load = await logLoad(dan, { photoKey: "p8", fields: { ...values, ticket: "1180555" }, confirmed: [...CHECKED] }, store);
    expect(load.fields.lease).toBe("");
  });
});

describe("reject tickets", () => {
  it("still gives the type-it-in form when only Reject was read", async () => {
    expect(flaggedFields({ reject: "N" }, { reject: 0.95 }).length).toBe(14);
    expect(nothingWasRead({ values: { reject: "N", station: "7185" } })).toBe(true);
  });

  it("logs a rejected load with its reason", async () => {
    await read("p9");
    const load = await logLoad(
      dan,
      { photoKey: "p9", fields: { ...ticketValues, ticket: "5728127", reject: "Y", comments: "Rejected: High BS&W" }, confirmed: [...CHECKED] },
      store,
    );
    expect(load.fields.reject).toBe("Y");
    expect(load.fields.comments).toBe("Rejected: High BS&W");
  });
});
