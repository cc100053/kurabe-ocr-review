import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-only client using the service_role key. This bypasses RLS (the
// scan_telemetry_events table is select_own), so it MUST never reach the
// browser. Importing "server-only" makes the build fail if this module is
// pulled into a client component.
//
// Created lazily so `next build` does not require the env vars to be present;
// they are validated at request time (all pages are force-dynamic).
let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars (server-side).",
    );
  }

  client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
