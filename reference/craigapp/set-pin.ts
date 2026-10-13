// Sets a new PIN for someone, by mobile number. Dispatch normally does this from People & access;
// this is for when nobody can sign in (e.g. the only dispatcher forgot their PIN).
//
//   npm run set-pin -- --phone 4325551234 --pin 12345

import { createClient } from "@supabase/supabase-js";
import { normalizePhone } from "../src/server/supabase";
import { isValidPin, PIN_LENGTH, pinPassword } from "../src/server/pin";

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] ?? "" : "";
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment may already be set.
  }
  const phone = normalizePhone(arg("phone"));
  const pin = arg("pin");
  if (!phone || !isValidPin(pin)) {
    console.error(`Usage: npm run set-pin -- --phone 4325551234 --pin <${PIN_LENGTH} digits>`);
    process.exit(1);
  }
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = createClient(process.env.SUPABASE_URL!, key!, { auth: { persistSession: false } });
  const { data: person } = await admin.from("profiles").select("id, name").eq("phone", phone).maybeSingle();
  if (!person) {
    console.error("Nobody has that mobile number.");
    process.exit(1);
  }
  const { error } = await admin.auth.admin.updateUserById(person.id, { password: pinPassword(phone, pin) });
  if (error) throw error;
  await admin.from("sign_in_failures").delete().eq("phone", phone);
  console.log(`New PIN set for ${person.name}.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
