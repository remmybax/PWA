// PINs are 5 digits (what Indeca already uses). Supabase needs passwords of 6+ characters, so the
// app never sends the PIN itself: it sends HMAC(PIN_SECRET, phone + PIN). Without PIN_SECRET,
// which only the app server has, a PIN is useless against Supabase directly, so PINs can only be
// guessed through the app, which locks a number after repeated wrong tries.
//
// Changing PIN_SECRET makes every existing PIN stop working (dispatch would reset them all).

import { createHmac } from "node:crypto";

export const PIN_LENGTH = 5;

export function isValidPin(pin: string): boolean {
  return pin.length === PIN_LENGTH && /^[0-9]+$/.test(pin);
}

export function pinPassword(phone: string, pin: string, secret = process.env.PIN_SECRET): string {
  if (!secret || secret.length < 32) throw new Error("PIN_SECRET (32+ characters) must be set");
  return createHmac("sha256", secret).update(`${phone}:${pin}`).digest("base64url");
}

/** Wrong PINs allowed per number before it's locked for LOCK_MINUTES. */
export const MAX_FAILED_TRIES = 5;
export const LOCK_MINUTES = 15;
