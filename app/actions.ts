"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Verdict } from "@/lib/notes";

// Map the one-tap human verdict onto the existing scan_review_notes schema
// (status ∈ open/triaged/fixed/wontfix, root_cause ∈ prompt/guard/ocr/
// preference) so no migration is needed. reviewed_by="human" marks it as an
// eyeball verdict (vs an AI/skill note), and the note text is human-readable.
const VERDICT_MAP: Record<
  Verdict,
  { status: string; root_cause: string | null; note: string }
> = {
  correct: { status: "wontfix", root_cause: null, note: "✅ 人手覆核：AI 正確（誤報）" },
  wrong: { status: "triaged", root_cause: null, note: "❌ 人手覆核：AI 錯誤，待修" },
  cannot_tell: {
    status: "wontfix",
    root_cause: "ocr",
    note: "🤷 人手覆核：相中睇唔到 / 無此資訊",
  },
};

// Record a human verdict for one scan+field. Invoked from a plain
// <form action={...}> with a submit button per verdict, so no client JS.
// Only the verdict columns are written — an AI note's linked_pr_url is left
// untouched on conflict.
export async function setVerdict(formData: FormData): Promise<void> {
  const scan_id = String(formData.get("scan_id") ?? "").trim();
  const field = String(formData.get("field") ?? "").trim();
  const verdict = String(formData.get("verdict") ?? "") as Verdict;
  const mapped = VERDICT_MAP[verdict];
  if (!scan_id || !field || !mapped) return;

  const { error } = await getSupabaseAdmin()
    .from("scan_review_notes")
    .upsert(
      {
        scan_id,
        field,
        status: mapped.status,
        root_cause: mapped.root_cause,
        note: mapped.note,
        reviewed_by: "human",
      },
      { onConflict: "scan_id,field" },
    );
  if (error) throw error;

  revalidatePath("/");
}
