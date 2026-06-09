// Client-safe review types + pure helpers. This module must NOT import
// lib/supabase (which is `server-only`), so it can be used from client
// components (the review board) as well as server pages. The server-side
// readers/writers live in lib/notes.ts and re-export everything here.

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

// A "clear the queue" baseline, stored as a sentinel row in scan_review_notes
// (no extra table). After clearing, the queue only shows cases that occurred
// after this timestamp. The sentinel scan_id never matches a real scan.
export const QUEUE_CONFIG = {
  scanId: "__config__",
  field: "queue_cleared_at",
} as const;
