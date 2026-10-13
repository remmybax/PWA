import { redirect } from "next/navigation";
import { signOut } from "@/server/session";

export async function POST() {
  await signOut();
  redirect("/signin");
}
