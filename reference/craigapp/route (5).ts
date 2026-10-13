import { NextResponse } from "next/server";
import { z } from "zod";
import { FIELD_KEYS } from "@/lib/fields";
import { apiError, apiUser } from "@/server/api";
import { logLoad } from "@/server/loads";

const Body = z.object({
  photoKey: z.string().min(1).max(100),
  fields: z.partialRecord(z.enum(FIELD_KEYS), z.string().max(500)),
  confirmed: z.array(z.enum(FIELD_KEYS)).max(FIELD_KEYS.length),
});

/** "Log this load": appends the row to the driver's log. */
export async function POST(req: Request) {
  try {
    const user = await apiUser();
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const load = await logLoad(user, parsed.data);
    return NextResponse.json({ id: load.id }, { status: 201 });
  } catch (e) {
    return apiError(e);
  }
}
