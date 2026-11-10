"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { IDENTITY_RECORD_COLUMNS, requireIdentityReviewer } from "@/lib/productIdentity";
import { ALIGNABLE_FIELDS, alignmentTargets, manualReviewEvidence, type AlignableField, type IdentityRecord } from "@/lib/productReview";

export async function queueIdentityPairs() {
  await requireIdentityReviewer();
  const { error } = await getSupabaseAdmin().rpc("queue_product_identity_reviews", { p_limit: 20 });
  if (error) redirect(`/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/products");
}

// Bound per button: the clicked button's name/value did not reach the action's FormData.
export async function reviewIdentityPair(id: number, verdict: string) {
  await requireIdentityReviewer();
  const evidence = manualReviewEvidence(verdict, id);
  const reviewer = "human";
  if (!Number.isSafeInteger(id) || id < 1 || !["same", "different", "same_series", "cannot_tell"].includes(verdict)) {
    throw new Error("無效的審查決定。");
  }
  const { error } = await getSupabaseAdmin().rpc("review_product_identity", {
    p_review_id: id, p_verdict: verdict, p_evidence: evidence, p_reviewer: reviewer,
  });
  if (error) redirect(`/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/products");
}

export async function undoIdentityPair(form: FormData) {
  await requireIdentityReviewer();
  const id = Number(form.get("id"));
  const reviewer = "human";
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("無效的審查記錄。");
  const { error } = await getSupabaseAdmin().rpc("undo_product_identity_review", { p_review_id: id, p_reviewer: reviewer });
  if (error) redirect(`/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/products");
}

export async function correctIdentityRecord(form: FormData) {
  await requireIdentityReviewer();
  const reviewId = Number(form.get("review_id"));
  const recordId = Number(form.get("record_id"));
  const evidence = manualReviewEvidence("identity correction", reviewId, recordId);
  const reviewer = "human";
  if (![reviewId, recordId].every((id) => Number.isSafeInteger(id) && id > 0)) {
    throw new Error("無效的身份修正記錄。");
  }
  const values = Object.fromEntries(["brand", "base_product", "variant", "size_value", "size_unit", "jan_code"].map((field) => [field, String(form.get(field) ?? "").trim() || null]));
  const { error } = await getSupabaseAdmin().rpc("correct_product_identity_record", {
    p_review_id: reviewId, p_record_id: recordId, p_values: values,
    p_photo_url: String(form.get("photo_url") ?? ""), p_evidence: evidence, p_reviewer: reviewer,
  });
  if (error) redirect(`/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/products");
}

// Use one spelling of a brand/product/variant across every record of a pending pair.
// Each record goes through the audited correction RPC; a failure stops the loop
// and leaves the earlier corrections in place (each is in the review history).
export async function alignIdentityField(reviewId: number, field: AlignableField, form: FormData) {
  await requireIdentityReviewer();
  const value = String(form.get("value") ?? "").trim();
  if (!Number.isSafeInteger(reviewId) || reviewId < 1 || !ALIGNABLE_FIELDS.includes(field) || !value || value.length > 200) {
    throw new Error("無效的統一寫法。");
  }
  const admin = getSupabaseAdmin();
  const { data: review, error: reviewError } = await admin.from("product_identity_reviews")
    .select("left_product_id,right_product_id").eq("id", reviewId).single();
  if (reviewError) redirect(`/products?error=${encodeURIComponent(reviewError.message)}`);
  const { data: records, error: recordError } = await admin.from("price_records").select(IDENTITY_RECORD_COLUMNS)
    .in("product_id", [review!.left_product_id, review!.right_product_id]).limit(200);
  if (recordError) redirect(`/products?error=${encodeURIComponent(recordError.message)}`);
  const { updates, skipped } = alignmentTargets((records ?? []) as unknown as IdentityRecord[], field, value);
  for (const u of updates) {
    const { error } = await admin.rpc("correct_product_identity_record", {
      p_review_id: reviewId, p_record_id: u.id, p_values: u.values, p_photo_url: u.photo,
      p_evidence: manualReviewEvidence(`identity alignment ${field}`, reviewId, u.id), p_reviewer: "human",
    });
    if (error) redirect(`/products?error=${encodeURIComponent(`記錄 #${u.id}：${error.message}`)}`);
  }
  revalidatePath("/products");
  if (skipped.length) redirect(`/products?error=${encodeURIComponent(`記錄 ${skipped.map((id) => `#${id}`).join("、")} 冇自己嘅相，未能修正。`)}`);
}
