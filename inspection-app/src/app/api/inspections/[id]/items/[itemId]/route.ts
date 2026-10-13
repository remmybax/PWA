import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { saveItemResult } from "@/server/inspections";

/** Saves one checklist answer. The phone sends the item's whole result each time. */
export async function PUT(request: Request, ctx: RouteContext<"/api/inspections/[id]/items/[itemId]">) {
  try {
    const user = await apiUser();
    const { id, itemId } = await ctx.params;
    const result = await saveItemResult(user, id, itemId, await request.json());
    return NextResponse.json({ result });
  } catch (e) {
    return apiError(e);
  }
}
