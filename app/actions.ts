"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  QUEUE_CONFIG,
  RECEIPT_FIELDS,
  type ReceiptField,
  type Verdict,
} from "@/lib/notes";

// The database validates the inspected event and commits verdict + memory together.
async function review(scanId: string, field: string, verdict: Verdict | "clear", eventId: number,
  wrongFields: ReceiptField[] | null = null): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("review_scan_event", {
    p_scan_id: scanId, p_event_id: eventId, p_field: field, p_verdict: verdict,
    p_wrong_fields: wrongFields,
  });
  if (error) throw new Error("儲存判決失敗；資料可能已更新，請重新整理後再試。");
}

export async function setVerdict(scanId: string, field: string, verdict: Verdict, eventId: number): Promise<void> {
  await review(scanId, field, verdict, eventId);
}

export async function setLineWrongFields(scanId: string, fields: ReceiptField[], eventId: number): Promise<void> {
  await review(scanId, "line", "wrong", eventId, RECEIPT_FIELDS.filter((f) => fields.includes(f)));
}

export async function clearVerdict(scanId: string, field: string, eventId: number): Promise<void> {
  await review(scanId, field, "clear", eventId);
}

export async function confirmReceiptRest(events: { scan_id: string; event_id: number }[]): Promise<void> {
  if (!events.length) return;
  const { error } = await getSupabaseAdmin().rpc("review_receipt_rest", { p_events: events });
  if (error) throw new Error("批次判決未儲存；資料可能已更新，請重新整理後再試。");
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
