import { NextResponse } from "next/server";
import { apiError, apiUser } from "@/server/api";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { canInspect, canResolve } from "@/server/inspections";
import { getStore } from "@/server/store";

const MAX_BYTES = 10 * 1024 * 1024;

/** Uploads one photo (already shrunk and time-stamped on the phone) and returns its key. */
export async function POST(request: Request) {
  try {
    const user = await apiUser();
    if (!canInspect(user) && !canResolve(user)) throw new ForbiddenError("View-only access can't add photos");
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof Blob)) throw new ValidationError("No photo was sent");
    if (file.size > MAX_BYTES) throw new ValidationError("That photo is too big");
    const type = file.type || "image/jpeg";
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new ValidationError("Photos only");
    const key = await getStore().putPhoto(Buffer.from(await file.arrayBuffer()), type);
    return NextResponse.json({ key, takenAt: new Date().toISOString() });
  } catch (e) {
    return apiError(e);
  }
}
