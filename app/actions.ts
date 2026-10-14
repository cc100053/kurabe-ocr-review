"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  QUEUE_CONFIG,
  RECEIPT_FIELDS,
  type ReceiptField,
  type Verdict,
} from "@/lib/notes";

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

// A receipt line whose category the user corrected is a shared category-memory
// source; memoryEventId is its telemetry event id (null for any other unit).
// See docs/receipt_category_memory.md in the app repo.
type MemoryState = "approve" | "reject" | "none";

// Keep the memory gate in step with the reviewer's eyeball verdict on the line:
//   approve: ✓ after looking at the photo → event-bound approval (the RPC
//            snapshots the exact payload, as the lookup requires)
//   reject:  ✗ with 分類 blamed → disproven source, excluded from memory
//   none:    no human claim about the category → drop both human rows
// Only rows this console wrote (reviewed_by="human") are ever removed.
async function syncCategoryMemory(
  scanId: string,
  eventId: number,
  state: MemoryState,
): Promise<void> {
  const db = getSupabaseAdmin();
  const drop = async (key: string) => {
    const { error } = await db
      .from("scan_review_notes")
      .delete()
      .eq("scan_id", key)
      .eq("field", "category_memory")
      .eq("reviewed_by", "human");
    if (error) throw error;
  };
  if (state !== "approve") await drop(`event:${eventId}`);
  if (state !== "reject") await drop(scanId);
  if (state === "approve") {
    const { error } = await db.rpc("approve_receipt_category_memory", {
      p_event_id: eventId,
      p_note: `✅ 人手睇收據相確認分類（${scanId}）`,
    });
    if (error) throw error;
  } else if (state === "reject") {
    const { error } = await db.from("scan_review_notes").upsert(
      {
        scan_id: scanId,
        field: "category_memory",
        status: "wontfix",
        note: `❌ 人手睇收據相：存咗嘅分類錯（event:${eventId}），唔可以做記憶來源`,
        reviewed_by: "human",
      },
      { onConflict: "scan_id,field" },
    );
    if (error) throw error;
  }
}

// Record a human verdict for one scan+field (price-tag field, or "line" for a
// receipt line). Called directly from the client review board (no <form>), so
// it does NOT revalidate — the board reflects the verdict optimistically and
// keeps cards in place for fast keyboard review; a real refetch happens on the
// next navigation (every page is force-dynamic). Only the verdict columns are
// written, so an AI note's linked_pr_url is left untouched on conflict. A
// receipt line also resets its blamed fields (action_taken).
export async function setVerdict(
  scanId: string,
  field: string,
  verdict: Verdict,
  memoryEventId: number | null = null,
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
        ...(field === "line" ? { action_taken: null } : {}),
      },
      { onConflict: "scan_id,field" },
    );
  if (error) throw error;
  if (field === "line" && memoryEventId != null) {
    await syncCategoryMemory(
      scanId,
      memoryEventId,
      verdict === "correct" ? "approve" : "none",
    );
  }
}

// ✗ on a receipt line: record which fields are wrong so the AI loop gets more
// than "something on this line". Blaming 分類 disproves a memory source.
export async function setLineWrongFields(
  scanId: string,
  fields: ReceiptField[],
  memoryEventId: number | null = null,
): Promise<void> {
  if (!scanId) return;
  const picked = RECEIPT_FIELDS.filter((f) => fields.includes(f));
  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .update({ action_taken: picked.length ? `wrong:${picked.join(",")}` : null })
    .eq("scan_id", scanId)
    .eq("field", "line")
    .eq("reviewed_by", "human")
    .eq("status", VERDICT_MAP.wrong.status);
  if (error) throw error;
  if (memoryEventId != null) {
    await syncCategoryMemory(
      scanId,
      memoryEventId,
      picked.includes("category") ? "reject" : "none",
    );
  }
}

// Undo a human verdict (U key): delete only the human eyeball note for this
// scan+field, leaving any AI/skill note untouched. The case returns to 待審.
export async function clearVerdict(
  scanId: string,
  field: string,
  memoryEventId: number | null = null,
): Promise<void> {
  if (!scanId || !field) return;
  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .delete()
    .eq("scan_id", scanId)
    .eq("field", field)
    .eq("reviewed_by", "human");
  if (error) throw error;
  if (field === "line" && memoryEventId != null) {
    await syncCategoryMemory(scanId, memoryEventId, "none");
  }
}

// Receipt "confirm the rest": mark every still-unverdicted line of a receipt as
// correct in one upsert (assume-good, flag-exceptions — the reviewer only taps
// the wrong lines, then clears the remainder). field is always "line". Never
// approves category memory: the board leaves memory candidates out, because a
// memory source needs its own per-line look at the photo.
export async function confirmReceiptRest(scanIds: string[]): Promise<void> {
  if (scanIds.length === 0) return;
  const rows = scanIds.map((scan_id) => ({
    scan_id,
    field: "line",
    status: VERDICT_MAP.correct.status,
    root_cause: VERDICT_MAP.correct.root_cause,
    note: VERDICT_MAP.correct.note,
    action_taken: null,
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
