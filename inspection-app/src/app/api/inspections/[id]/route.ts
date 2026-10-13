import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { updateDraft } from "@/server/inspections";

/** Changes the draft's location, trailer or comments. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/inspections/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const body = await request.json();
    const insp = await updateDraft(user, id, {
      ...(typeof body.location === "string" ? { location: body.location } : {}),
      ...(typeof body.comments === "string" ? { comments: body.comments } : {}),
      ...("trailerId" in body ? { trailerId: body.trailerId ? String(body.trailerId) : null } : {}),
    });
    return NextResponse.json({ inspection: { id: insp.id, trailerId: insp.trailerId, location: insp.location } });
  } catch (e) {
    return apiError(e);
  }
}
