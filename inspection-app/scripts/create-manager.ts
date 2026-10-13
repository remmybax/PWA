// Creates the first manager sign-in in Supabase. After that, the manager adds everyone else from
// People & access in the app.
//
//   npm run create-manager -- --name "Dan V." --phone 4325551234 --pin 12345
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local.

import { SupabaseStore } from "../src/server/supabase-store";
import { normalizePhone } from "../src/server/supabase";
import { isValidPin, PIN_LENGTH } from "../src/server/pin";

function arg(name: string): string {
  // Everything up to the next --flag, so --name Dan V. works even when the shell drops quotes.
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return "";
  const words: string[] = [];
  for (const w of process.argv.slice(i + 1)) {
    if (w.startsWith("--")) break;
    words.push(w);
  }
  return words.join(" ");
}

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment may already be set.
  }
  const name = arg("name").trim();
  const phone = normalizePhone(arg("phone"));
  const pin = arg("pin");
  if (!name || !phone || !isValidPin(pin)) {
    console.error(`Usage: npm run create-manager -- --name "Dan V." --phone 4325551234 --pin <${PIN_LENGTH} digits>`);
    process.exit(1);
  }
  if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
    process.exit(1);
  }
  const user = await new SupabaseStore().createUser({ name, role: "manager", phone, pin });
  console.log(`Created ${user.name} (manager). Sign in with ${phone} and the PIN you chose.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
