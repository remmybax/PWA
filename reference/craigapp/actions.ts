"use server";

import { redirect } from "next/navigation";
import { homeFor, signInWithPin } from "@/server/session";

export async function pinSignIn(_prev: { error: string } | null, formData: FormData): Promise<{ error: string } | null> {
  const result = await signInWithPin(String(formData.get("phone") ?? ""), String(formData.get("pin") ?? ""));
  if ("error" in result) return result;
  redirect(homeFor(result.user));
}
