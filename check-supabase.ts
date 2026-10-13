// Checks the Supabase connection and setup without changing anything.
//   npm run check-supabase

import { createClient } from "@supabase/supabase-js";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Environment may already be set.
  }
  const url = process.env.SUPABASE_URL!;
  const pub = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !pub || !secret) throw new Error("SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY must be set in .env.local");

  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const anon = createClient(url, pub, { auth: { persistSession: false } });
  const results: [string, boolean, string][] = [];

  // A plain select (not head: true), so a missing table actually reports an error.
  for (const table of ["profiles", "loads", "load_changes", "pending_readings", "sign_in_failures"]) {
    const { data, error } = await admin.from(table).select("*").limit(1);
    results.push([`table ${table}`, !error, error ? error.message : data.length ? "has rows" : "empty"]);
  }
  const { data: bucket, error: bucketError } = await admin.storage.getBucket("tickets");
  results.push(["photo bucket", !bucketError && bucket?.public === false, bucketError ? bucketError.message : "private"]);

  // Signed out, row-level security should hide everything.
  const { data: leaked, error: anonError } = await anon.from("loads").select("id").limit(1);
  results.push(["signed-out visitor sees no loads", !anonError && (leaked?.length ?? 0) === 0, anonError?.message ?? "none visible"]);

  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1 });
  results.push(["auth admin access", !usersError, usersError ? usersError.message : `${users.users.length ? "has" : "no"} sign-ins yet`]);

  for (const [name, ok, detail] of results) console.log(`${ok ? "OK  " : "FAIL"} ${name}: ${detail}`);
  if (results.some(([, ok]) => !ok)) process.exit(1);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
