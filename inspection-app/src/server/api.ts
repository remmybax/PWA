import { NextResponse } from "next/server";
import type { User } from "@/lib/types";
import { getCurrentUser } from "./session";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { DuplicatePhoneError, DuplicateUnitError } from "./store";

export class Unauthorized extends Error {}

export async function apiUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Unauthorized("Sign in first");
  return user;
}

/** Maps domain errors to JSON responses so route handlers stay short. */
export function apiError(e: unknown): NextResponse {
  if (e instanceof Unauthorized) return NextResponse.json({ error: e.message }, { status: 401 });
  if (e instanceof ForbiddenError) return NextResponse.json({ error: e.message }, { status: 403 });
  if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof ValidationError || e instanceof DuplicateUnitError || e instanceof DuplicatePhoneError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
