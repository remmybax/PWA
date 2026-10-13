import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { resolveDefect } from "@/server/inspections";

/** Marks a failed item repaired ({itemId, note, photo?}) or undoes it ({itemId, undo: true}). */
export async function POST(request: Request, ctx: RouteContext<"/api/inspections/[id]/resolve">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const body = await request.json();
    await resolveDefect(user, id, String(body.itemId ?? ""), { note: String(body.note ?? ""), photo: body.photo ?? null, undo: Boolean(body.undo) });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
