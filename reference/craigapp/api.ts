import { NextResponse } from "next/server";
import type { User } from "@/lib/types";
import { getCurrentUser } from "./session";
import { DuplicateTicketError, ForbiddenError, NotFoundError, ValidationError } from "./loads";

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
  if (e instanceof ValidationError) return NextResponse.json({ error: e.message, problems: e.problems }, { status: 400 });
  if (e instanceof DuplicateTicketError) {
    return NextResponse.json({ error: e.message, problems: [{ key: "ticket", error: "Already logged" }] }, { status: 409 });
  }
  console.error(e);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
