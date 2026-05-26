"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";

// Upsert a review note (one per scan_id+field). Invoked directly from a
// server-component <form action={...}>, so no client JS is required.
export async function upsertReviewNote(formData: FormData): Promise<void> {
  const scan_id = String(formData.get("scan_id") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  if (!scan_id || !field) return;

  const status = String(formData.get("status") ?? "open");
  const root_cause = String(formData.get("root_cause") ?? "");
  const linked_pr_url = String(formData.get("linked_pr_url") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();

  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .upsert(
      {
        scan_id,
        field,
        status,
        root_cause: root_cause === "" ? null : root_cause,
        linked_pr_url: linked_pr_url === "" ? null : linked_pr_url,
        note: note === "" ? null : note,
      },
      { onConflict: "scan_id,field" },
    );
  if (error) throw error;

  // Refresh both surfaces that show notes.
  revalidatePath("/suspicious");
  revalidatePath("/correction-samples");
}
