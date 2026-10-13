import { NextResponse } from "next/server";
import { z } from "zod";
import { FIELD_KEYS } from "@/lib/fields";
import { apiError, apiUser } from "@/server/api";
import { editLoad } from "@/server/loads";

const Body = z.object({
  changes: z.partialRecord(z.enum(FIELD_KEYS), z.string().max(500)),
  note: z.string().max(500).optional(),
});

/** Dispatch edits a logged load. Every changed field is added to the load's change history. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/loads/[id]">) {
  try {
    const user = await apiUser();
    const { id } = await ctx.params;
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const load = await editLoad(user, id, parsed.data.changes, parsed.data.note);
    return NextResponse.json({ id: load.id, history: load.history.length });
  } catch (e) {
    return apiError(e);
  }
}
