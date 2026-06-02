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
  reviewed_by: string | null;
  updated_at: string;
};

// The human eyeball verdict. Stored inside the existing scan_review_notes
// schema (no migration): correct → wontfix, wrong → triaged, cannot_tell →
// wontfix+ocr. reviewed_by="human" distinguishes these from AI/skill notes.
export type Verdict = "correct" | "wrong" | "cannot_tell";

export function verdictFromNote(note?: ReviewNote): Verdict | null {
  if (!note || note.reviewed_by !== "human") return null;
  if (note.status === "triaged") return "wrong";
  if (note.status === "wontfix") {
    return note.root_cause === "ocr" ? "cannot_tell" : "correct";
  }
  return null;
}

// A case is "handled" once any note moves it off `open` — whether that was a
// human eyeball verdict OR the AI review loop (fixed/wontfix/triaged). Handled
// cases drop out of the 待審 queue so the human isn't re-asked to judge work
// that's already done.
export function isResolved(note?: ReviewNote): boolean {
  return !!note && note.status !== "open";
}

// Short "who·status" badge for a case resolved by the AI loop (not a human
// verdict), so the human can see it's already handled and by whom.
export function resolutionLabel(note?: ReviewNote): string | null {
  if (!isResolved(note)) return null;
  const who = note!.reviewed_by === "human" ? "人手" : "AI";
  return `${who}・${note!.status}`;
}

export function noteKey(scanId: string | null, field: string | null): string {
  return `${scanId ?? ""}::${field ?? ""}`;
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
