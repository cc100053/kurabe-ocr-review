import { getSupabaseAdmin } from "./supabase";

export type ReviewStatus = "open" | "triaged" | "fixed" | "wontfix";
export type RootCause = "prompt" | "guard" | "ocr" | "preference";

export type ReviewNote = {
  scan_id: string;
  field: string;
  status: ReviewStatus;
  root_cause: RootCause | null;
  linked_pr_url: string | null;
  note: string | null;
  updated_at: string;
};

export function noteKey(scanId: string | null, field: string | null): string {
  return `${scanId ?? ""}::${field ?? ""}`;
}

// All notes, keyed by scan_id::field, so pages can pre-fill forms in one query.
export async function getNotesMap(): Promise<Map<string, ReviewNote>> {
  const { data, error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .select("scan_id, field, status, root_cause, linked_pr_url, note, updated_at");
  if (error) throw error;
  const map = new Map<string, ReviewNote>();
  for (const row of (data ?? []) as ReviewNote[]) {
    map.set(noteKey(row.scan_id, row.field), row);
  }
  return map;
}
