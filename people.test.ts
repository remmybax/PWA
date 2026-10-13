import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonFileStore } from "./store";
import { addPerson, resetPin, updatePerson } from "./people";
import { loginEmail, normalizePhone } from "./supabase";
import { isValidPin, pinPassword } from "./pin";
import { ForbiddenError } from "./loads";
import { SEED_USERS } from "./seed-data";

const craig = SEED_USERS.find((u) => u.id === "u-craig")!;
const dan = SEED_USERS.find((u) => u.id === "u-dan")!;
const blaze = SEED_USERS.find((u) => u.id === "u-blaze")!;

let store: JsonFileStore;
beforeEach(() => {
  store = new JsonFileStore(mkdtempSync(path.join(tmpdir(), "itl-people-")));
});

describe("people & access", () => {
  it("only dispatch grants access", async () => {
    await expect(addPerson(dan, { name: "New Driver", role: "driver" }, store)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addPerson(blaze, { name: "New Driver", role: "driver" }, store)).rejects.toBeInstanceOf(ForbiddenError);
    const p = await addPerson(craig, { name: "  New   Driver ", role: "driver" }, store);
    expect(p).toMatchObject({ name: "New Driver", role: "driver", active: true });
    expect(await store.getUser(p.id)).toMatchObject({ name: "New Driver" });
  });

  it("switches people off and on", async () => {
    expect((await updatePerson(craig, dan.id, { active: false }, store)).active).toBe(false);
    expect((await updatePerson(craig, dan.id, { active: true }, store)).active).toBe(true);
  });

  it("won't remove the last active dispatcher", async () => {
    await expect(updatePerson(craig, craig.id, { active: false }, store)).rejects.toThrow(/at least one/);
    await expect(updatePerson(craig, craig.id, { role: "viewer" }, store)).rejects.toThrow(/at least one/);
    await updatePerson(craig, blaze.id, { role: "dispatch" }, store);
    await expect(updatePerson(craig, craig.id, { role: "viewer" }, store)).resolves.toMatchObject({ role: "viewer" });
  });
});

describe("phone + PIN sign-in (Supabase build)", () => {
  it("turns a 5-digit PIN into a long password only the server can make", () => {
    const secret = "x".repeat(32);
    const a = pinPassword("4325551234", "12345", secret);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).toBe(pinPassword("4325551234", "12345", secret));
    expect(a).not.toBe(pinPassword("4325559999", "12345", secret));
    expect(a).not.toBe(pinPassword("4325551234", "12345", "y".repeat(32)));
    expect(() => pinPassword("4325551234", "12345", "")).toThrow(/PIN_SECRET/);
    expect(isValidPin("12345")).toBe(true);
    expect(isValidPin("123456")).toBe(false);
  });

  it("requires a 10-digit phone and a 5-digit PIN", async () => {
    await expect(addPerson(craig, { name: "A B", role: "driver", phone: "555-1234", pin: "12345" }, store, true)).rejects.toThrow(/phone/);
    await expect(addPerson(craig, { name: "A B", role: "driver", phone: "4325551234", pin: "123456" }, store, true)).rejects.toThrow(/5 digits/);
    const p = await addPerson(craig, { name: "A B", role: "driver", phone: "+1 (432) 555-1234", pin: "12345" }, store, true);
    expect(p.phone).toBe("4325551234");
    await expect(addPerson(craig, { name: "C D", role: "driver", phone: "432.555.1234", pin: "54321" }, store, true)).rejects.toThrow(/already/);
  });

  it("only dispatch resets PINs", async () => {
    await expect(resetPin(dan, dan.id, "12345", store)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(resetPin(craig, dan.id, "12a45", store)).rejects.toThrow(/5 digits/);
    await expect(resetPin(craig, dan.id, "12345", store)).resolves.toBeUndefined();
  });

  it("builds a stable login from the phone number", () => {
    expect(normalizePhone("1-432-555-1234")).toBe("4325551234");
    expect(normalizePhone("555-1234")).toBeNull();
    expect(loginEmail("4325551234")).toBe(loginEmail("4325551234"));
  });
});

describe("renaming", () => {
  it("lets dispatch fix a name, and only dispatch", async () => {
    await expect(updatePerson(craig, dan.id, { name: "  Dan   VanWormer " }, store)).resolves.toMatchObject({ name: "Dan VanWormer" });
    await expect(updatePerson(craig, dan.id, { name: "  " }, store)).rejects.toThrow(/name/);
    await expect(updatePerson(dan, dan.id, { name: "X" }, store)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
