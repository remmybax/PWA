// Managers grant and remove access. Nobody gets in unless a manager has added them.

import type { Role, User } from "@/lib/types";
import { ForbiddenError, NotFoundError } from "./errors";
import { getStore, type Store } from "./store";
import { normalizePhone, supabaseConfigured } from "./supabase";
import { PIN_LENGTH, isValidPin } from "./pin";

export const ROLES: Role[] = ["driver", "manager", "mechanic", "viewer"];

/** Whether people sign in with phone + PIN (Supabase) rather than the demo picker. */
export function usesPins(): boolean {
  return supabaseConfigured();
}

function requireManager(user: User) {
  if (user.role !== "manager") throw new ForbiddenError("Only managers change access");
}

function checkPin(pin: string) {
  if (!isValidPin(pin)) throw new Error(`The PIN must be ${PIN_LENGTH} digits`);
}

export async function addPerson(
  by: User,
  input: { name: string; role: Role; phone?: string; pin?: string },
  store: Store = getStore(),
  pins = usesPins(),
): Promise<User> {
  requireManager(by);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new Error("Enter a name");
  if (!ROLES.includes(input.role)) throw new Error("Pick a role");

  if (!pins) return store.createUser({ name, role: input.role });

  const phone = normalizePhone(input.phone ?? "");
  if (!phone) throw new Error("Enter a 10-digit phone number");
  checkPin(input.pin ?? "");
  return store.createUser({ name, role: input.role, phone, pin: input.pin });
}

export async function resetPin(by: User, id: string, pin: string, store: Store = getStore()): Promise<void> {
  requireManager(by);
  checkPin(pin);
  if (!(await store.getUser(id))) throw new NotFoundError("Person not found");
  await store.setPin(id, pin);
}

export async function updatePerson(
  by: User,
  id: string,
  change: { name?: string; role?: Role; active?: boolean },
  store: Store = getStore(),
): Promise<User> {
  requireManager(by);
  const person = await store.getUser(id);
  if (!person) throw new NotFoundError("Person not found");
  const next: User = { ...person, ...change };
  if (change.name !== undefined) {
    next.name = change.name.trim().replace(/\s+/g, " ");
    if (!next.name || next.name.length > 80) throw new Error("Enter a name");
  }
  if (change.role && !ROLES.includes(change.role)) throw new Error("Pick a role");

  // Never leave the company without an active manager.
  const staysManager = next.role === "manager" && next.active;
  if (person.role === "manager" && person.active && !staysManager) {
    const others = (await store.listUsers()).filter((u) => u.id !== id && u.role === "manager" && u.active);
    if (!others.length) throw new Error("There has to be at least one active manager");
  }
  await store.saveUser(next);
  return next;
}
