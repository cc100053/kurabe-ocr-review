import { getSupabaseAdmin, selectAll } from "./supabase";
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

// All notes, keyed by scan_id::field, so pages can pre-fill verdicts in one
// pass. Paged: the table outgrows a single 1000-row response.
export async function getNotesMap(): Promise<Map<string, ReviewNote>> {
  const rows = await selectAll<ReviewNote>((from, to) =>
    getSupabaseAdmin()
      .from("scan_review_notes")
      .select(
        "scan_id, field, status, root_cause, action_taken, linked_pr_url, note, reviewed_by, updated_at",
      )
      .order("id")
      .range(from, to),
  );
  const map = new Map<string, ReviewNote>();
  for (const row of rows) map.set(noteKey(row.scan_id, row.field), row);
  return map;
}
