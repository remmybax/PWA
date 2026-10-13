import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { ForbiddenError, recordReading } from "@/server/loads";
import { readTicket } from "@/server/reader";
import { getStore } from "@/server/store";

const MAX_BYTES = 10 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Takes the ticket photo, saves it and returns what the reader found. */
export async function POST(req: Request) {
  const t0 = Date.now();
  const marks: string[] = [];
  const mark = (label: string) => marks.push(`${label} ${Date.now() - t0}ms`);
  try {
    const user = await apiUser();
    mark("auth");
    if (user.role !== "driver") throw new ForbiddenError("Only drivers log loads");

    const form = await req.formData();
    mark("upload");
    const photo = form.get("photo");
    if (!(photo instanceof File)) return NextResponse.json({ error: "No photo" }, { status: 400 });
    if (photo.size > MAX_BYTES) return NextResponse.json({ error: "Photo is too large" }, { status: 413 });
    if (!TYPES.includes(photo.type)) return NextResponse.json({ error: "Use a JPEG or PNG photo" }, { status: 415 });

    const bytes = Buffer.from(await photo.arrayBuffer());
    const store = getStore();
    // Save the photo and read it at the same time; neither needs the other.
    const [photoKey, result] = await Promise.all([
      store.putPhoto(bytes, photo.type).then((k) => (mark("photo saved"), k)),
      readTicket(bytes, photo.type).then((r) => (mark("read"), r)),
    ]);
    const reading = await recordReading(user, photoKey, { ...result, readAt: new Date().toISOString() }, store);
    mark("done");
    console.info(`read-ticket: ${result.reader} ${result.model ?? ""}, photo ${(bytes.length / 1024).toFixed(0)} KB | ${marks.join(" | ")}`);
    return NextResponse.json({ photoKey, reading });
  } catch (e) {
    return apiError(e);
  }
}
