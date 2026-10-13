// Dispatch grants and removes access. Nobody gets in unless dispatch has added them.

import type { Role, User } from "@/lib/types";
import { ForbiddenError, NotFoundError } from "./loads";
import { getStore, type Store } from "./store";
import { normalizePhone, supabaseConfigured } from "./supabase";
import { PIN_LENGTH, isValidPin } from "./pin";

export const ROLES: Role[] = ["driver", "dispatch", "viewer"];

/** Whether people sign in with phone + PIN (Supabase) rather than the demo picker. */
export function usesPins(): boolean {
  return supabaseConfigured();
}

function requireDispatch(user: User) {
  if (user.role !== "dispatch") throw new ForbiddenError("Only dispatch manages access");
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
  requireDispatch(by);
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
  requireDispatch(by);
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
  requireDispatch(by);
  const person = await store.getUser(id);
  if (!person) throw new NotFoundError("Person not found");
  const next: User = { ...person, ...change };
  if (change.name !== undefined) {
    next.name = change.name.trim().replace(/\s+/g, " ");
    if (!next.name || next.name.length > 80) throw new Error("Enter a name");
  }
  if (change.role && !ROLES.includes(change.role)) throw new Error("Pick a role");

  // Never leave the company without an active dispatcher.
  const staysDispatch = next.role === "dispatch" && next.active;
  if (person.role === "dispatch" && person.active && !staysDispatch) {
    const others = (await store.listUsers()).filter((u) => u.id !== id && u.role === "dispatch" && u.active);
    if (!others.length) throw new Error("There has to be at least one active dispatcher");
  }
  await store.saveUser(next);
  return next;
}
