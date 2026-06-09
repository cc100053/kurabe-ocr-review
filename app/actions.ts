"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { QUEUE_CONFIG, type Verdict } from "@/lib/notes";

// Map the one-tap human verdict onto the existing scan_review_notes schema
// (status ∈ open/triaged/fixed/wontfix, root_cause ∈ prompt/guard/ocr/
// preference) so no migration is needed. reviewed_by="human" marks it as an
// eyeball verdict (vs an AI/skill note), and the note text is human-readable.
const VERDICT_MAP: Record<
  Verdict,
  { status: string; root_cause: string | null; note: string }
> = {
  correct: { status: "wontfix", root_cause: null, note: "✅ 人手覆核：存咗嘅值正確" },
  wrong: { status: "triaged", root_cause: null, note: "❌ 人手覆核：存咗嘅值錯誤，待修" },
  cannot_tell: {
    status: "wontfix",
    root_cause: "ocr",
    note: "🤷 人手覆核：相中睇唔到 / 無此資訊",
  },
};

// Record a human verdict for one scan+field (price-tag field, or "line" for a
// receipt line). Called directly from the client review board (no <form>), so
// it does NOT revalidate — the board reflects the verdict optimistically and
// keeps cards in place for fast keyboard review; a real refetch happens on the
// next navigation (every page is force-dynamic). Only the verdict columns are
// written, so an AI note's linked_pr_url is left untouched on conflict.
export async function setVerdict(
  scanId: string,
  field: string,
  verdict: Verdict,
): Promise<void> {
  const mapped = VERDICT_MAP[verdict];
  if (!scanId || !field || !mapped) return;

  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .upsert(
      {
        scan_id: scanId,
        field,
        status: mapped.status,
        root_cause: mapped.root_cause,
        note: mapped.note,
        reviewed_by: "human",
      },
      { onConflict: "scan_id,field" },
    );
  if (error) throw error;
}

// Undo a human verdict (U key): delete only the human eyeball note for this
// scan+field, leaving any AI/skill note untouched. The case returns to 待審.
export async function clearVerdict(scanId: string, field: string): Promise<void> {
  if (!scanId || !field) return;
  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .delete()
    .eq("scan_id", scanId)
    .eq("field", field)
    .eq("reviewed_by", "human");
  if (error) throw error;
}

// Receipt "confirm the rest": mark every still-unverdicted line of a receipt as
// correct in one upsert (assume-good, flag-exceptions — the reviewer only taps
// the wrong lines, then clears the remainder). field is always "line".
export async function confirmReceiptRest(scanIds: string[]): Promise<void> {
  if (scanIds.length === 0) return;
  const rows = scanIds.map((scan_id) => ({
    scan_id,
    field: "line",
    status: VERDICT_MAP.correct.status,
    root_cause: VERDICT_MAP.correct.root_cause,
    note: VERDICT_MAP.correct.note,
    reviewed_by: "human",
  }));
  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .upsert(rows, { onConflict: "scan_id,field" });
  if (error) throw error;
}

// Clear the queue: set the baseline to now so only cases that occur afterwards
// show up. Doesn't touch any per-case verdict — it's a viewing cutoff. This one
// DOES revalidate (a deliberate full reset of what the queue shows).
export async function clearQueue(): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .upsert(
      {
        scan_id: QUEUE_CONFIG.scanId,
        field: QUEUE_CONFIG.field,
        status: "wontfix",
        note: new Date().toISOString(),
        reviewed_by: "system",
      },
      { onConflict: "scan_id,field" },
    );
  if (error) throw error;

  revalidatePath("/");
}
