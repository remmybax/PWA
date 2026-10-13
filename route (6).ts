import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { canSeeAllLoads } from "@/server/loads";
import { getStore } from "@/server/store";

/** Ticket photos: dispatch/viewers see all; a driver sees photos of their own loads and scans. */
export async function GET(_req: Request, ctx: RouteContext<"/api/photos/[key]">) {
  try {
    const user = await apiUser();
    const { key } = await ctx.params;
    const store = getStore();

    if (!canSeeAllLoads(user)) {
      const pending = await store.getPendingReading(key);
      const own =
        pending?.driverId === user.id ||
        (await store.listLoads({ driverId: user.id })).some((l) => l.photoKey === key);
      if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const photo = await store.getPhoto(key);
    if (!photo) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(photo.bytes), {
      headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (e) {
    return apiError(e);
  }
}
