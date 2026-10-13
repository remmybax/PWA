import { photoList } from "@/lib/inspection";
import { getCurrentUser } from "@/server/session";
import { getStore } from "@/server/store";

/**
 * Serves a photo to someone signed in, or to anyone holding the report's QR token (?t=...) when
 * the photo belongs to that report. Nobody else gets photos.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/photos/[key]">) {
  const { key } = await ctx.params;
  const token = new URL(request.url).searchParams.get("t");
  const store = getStore();
  let allowed = false;
  if (token) {
    const insp = await store.getInspectionByToken(token);
    allowed = Boolean(insp?.certifiedAt && photoList(insp).some((p) => p.key === key));
  } else {
    allowed = Boolean(await getCurrentUser());
  }
  if (!allowed) return new Response("Not found", { status: 404 });
  const photo = await store.getPhoto(key);
  if (!photo) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
