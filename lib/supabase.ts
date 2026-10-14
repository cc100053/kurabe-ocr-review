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

// PostgREST caps every response (1000 rows by default), so a plain select
// silently truncates. Page with `.range()` until a short page comes back; the
// query must have a stable order.
const PAGE = 1000;
export async function selectAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
