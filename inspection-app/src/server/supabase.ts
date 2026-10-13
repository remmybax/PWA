// Supabase clients.
//
// - userClient(): acts as the signed-in person (their session cookie), so row-level security in
//   supabase/migrations/0001_init.sql applies to every query.
// - adminClient(): service key, bypasses RLS. Only used to create sign-ins and change people,
//   after src/server/people.ts has checked the caller is dispatch.

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Supabase dashboard -> Project Settings -> API Keys. Newer projects call them publishable/secret
// keys; older ones anon/service_role. Either name works.
const publishableKey = () => process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
const secretKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && publishableKey());
}

export async function userClient(): Promise<SupabaseClient> {
  const jar = await cookies();
  return createServerClient(process.env.SUPABASE_URL!, publishableKey()!, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) jar.set(name, value, options);
        } catch {
          // Server Components can't set cookies; proxy.ts refreshes the session instead.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;
export function adminClient(): SupabaseClient {
  const key = secretKey();
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set");
  admin ??= createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/**
 * Supabase signs people in by email or phone. Phone sign-in needs a paid SMS provider, so each
 * person gets an email-shaped login made from their phone number (no email is ever sent) and a
 * PIN that dispatch sets.
 */
export function loginEmail(phone: string): string {
  return `phone-${phone}@users.indeca-truck-inspection.example.com`;
}

/** "(432) 555-1234" -> "4325551234". US numbers only, leading 1 dropped. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : null;
}

export function formatPhone(d: string): string {
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d;
}
