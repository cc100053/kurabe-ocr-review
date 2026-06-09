import { getSupabaseAdmin } from "./supabase";
import { noteKey, QUEUE_CONFIG, type ReviewNote } from "./verdict";

// Re-export the client-safe types/helpers so existing server-side imports
// (`from "@/lib/notes"`) keep working. Client components must import those from
// "@/lib/verdict" directly (this module pulls in the server-only Supabase client).
export * from "./verdict";

export async function getQueueClearedAt(): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .select("note")
    .eq("scan_id", QUEUE_CONFIG.scanId)
    .eq("field", QUEUE_CONFIG.field)
    .maybeSingle();
  if (error) throw error;
  return data?.note ?? null;
}

// All notes, keyed by scan_id::field, so pages can pre-fill forms in one query.
export async function getNotesMap(): Promise<Map<string, ReviewNote>> {
  const { data, error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .select(
      "scan_id, field, status, root_cause, linked_pr_url, note, reviewed_by, updated_at",
    );
  if (error) throw error;
  const map = new Map<string, ReviewNote>();
  for (const row of (data ?? []) as ReviewNote[]) {
    map.set(noteKey(row.scan_id, row.field), row);
  }
  return map;
}
