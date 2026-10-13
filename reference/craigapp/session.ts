import "server-only";

// Sign-in. With Supabase configured: phone number + PIN through Supabase Auth. Without it (local
// demo): pick your name, remembered in a signed cookie. Every permission check goes through
// getCurrentUser / requirePageUser either way.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, User } from "@/lib/types";
import { getStore } from "./store";
import { adminClient, loginEmail, normalizePhone, supabaseConfigured, userClient } from "./supabase";
import { isValidPin, LOCK_MINUTES, MAX_FAILED_TRIES, PIN_LENGTH, pinPassword } from "./pin";

const COOKIE = "itl_session";
const MAX_AGE = 60 * 60 * 24 * 30; // drivers stay signed in on their phone for 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET (32+ characters) must be set in production");
  }
  return "dev-only-secret-do-not-use-in-production-000";
}

function sign(userId: string): string {
  return createHmac("sha256", secret()).update(userId).digest("base64url");
}

export function encodeSession(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

export function decodeSession(value: string | undefined): string | null {
  if (!value) return null;
  const i = value.lastIndexOf(".");
  if (i <= 0) return null;
  const userId = value.slice(0, i);
  const given = Buffer.from(value.slice(i + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

export async function getCurrentUser(): Promise<User | null> {
  if (supabaseConfigured()) {
    const db = await userClient();
    const { data } = await db.auth.getUser();
    if (!data.user) return null;
    const user = await getStore().getUser(data.user.id);
    return user && user.active ? user : null;
  }
  const jar = await cookies();
  const userId = decodeSession(jar.get(COOKIE)?.value);
  if (!userId) return null;
  const user = await getStore().getUser(userId);
  return user && user.active ? user : null;
}

/** Supabase build: phone number + PIN. Returns an error message, or null when signed in. */
export async function signInWithPin(phoneRaw: string, pin: string): Promise<{ error: string } | { user: User }> {
  const phone = normalizePhone(phoneRaw);
  if (!phone) return { error: "Enter a 10-digit phone number" };
  if (!isValidPin(pin)) return { error: `The PIN is ${PIN_LENGTH} digits` };

  // Lock a number after too many wrong PINs, so 5-digit PINs can't be guessed.
  const admin = adminClient();
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();
  const recent = await admin.from("sign_in_failures").select("id").eq("phone", phone).gte("at", since).limit(MAX_FAILED_TRIES);
  if (recent.error) {
    // Without the lockout, 5-digit PINs could be guessed, so don't sign anyone in until it's fixed.
    console.error("PIN lockout check failed; is supabase/migrations/0002_pin_lockout.sql applied?", recent.error);
    return { error: "Sign-in isn't working right now. Tell whoever set up the app." };
  }
  if (recent.data.length >= MAX_FAILED_TRIES) {
    return { error: `Too many wrong PINs. Try again in ${LOCK_MINUTES} minutes, or ask dispatch to reset it.` };
  }

  const db = await userClient();
  const { data, error } = await db.auth.signInWithPassword({ email: loginEmail(phone), password: pinPassword(phone, pin) });
  if (error || !data.user) {
    const logged = await admin.from("sign_in_failures").insert({ phone });
    if (logged.error) console.error("Couldn't record wrong PIN", logged.error);
    return { error: "That phone number and PIN don't match" };
  }
  await admin.from("sign_in_failures").delete().eq("phone", phone);
  const user = await getStore().getUser(data.user.id);
  if (!user || !user.active) {
    await db.auth.signOut();
    return { error: "Your access is switched off. Ask dispatch." };
  }
  return { user };
}

/** Demo build: sign in as the picked person. */
export async function signIn(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function signOut(): Promise<void> {
  if (supabaseConfigured()) {
    await (await userClient()).auth.signOut();
    return;
  }
  (await cookies()).delete(COOKIE);
}

/** Page guard: sends signed-out visitors to sign in and wrong roles to their home screen. */
export async function requirePageUser(roles?: Role[]): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  if (roles && !roles.includes(user.role)) redirect(homeFor(user));
  return user;
}

export function homeFor(user: Pick<User, "role">): string {
  return user.role === "driver" ? "/" : "/dispatch";
}

export function demoSignInEnabled(): boolean {
  if (supabaseConfigured()) return false;
  return process.env.NODE_ENV !== "production" || process.env.DEMO_SIGN_IN === "1";
}
