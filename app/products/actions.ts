"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireIdentityReviewer } from "@/lib/productIdentity";

export async function queueIdentityPairs() {
  await requireIdentityReviewer();
  const { error } = await getSupabaseAdmin().rpc("queue_product_identity_reviews", { p_limit: 20 });
  if (error) redirect(`/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/products");
}

export async function reviewIdentityPair(form: FormData) {
  await requireIdentityReviewer();
  const id = Number(form.get("id"));
  const verdict = String(form.get("verdict") ?? "");
  const evidence = String(form.get("evidence") ?? "").trim();
  const reviewer = String(form.get("reviewer") ?? "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !["same", "different", "cannot_tell"].includes(verdict) || evidence.length < 10 || evidence.length > 4000 || !reviewer || reviewer.length > 100) {
    throw new Error("請填寫審查人及至少 10 字的照片證據。");
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
  const reviewer = String(form.get("reviewer") ?? "").trim();
  if (!Number.isSafeInteger(id) || id < 1 || !reviewer || reviewer.length > 100) throw new Error("請填寫審查人。");
  const { error } = await getSupabaseAdmin().rpc("undo_product_identity_review", { p_review_id: id, p_reviewer: reviewer });
  if (error) redirect(`/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/products");
}

export async function correctIdentityRecord(form: FormData) {
  await requireIdentityReviewer();
  const reviewId = Number(form.get("review_id"));
  const recordId = Number(form.get("record_id"));
  const evidence = String(form.get("evidence") ?? "").trim();
  const reviewer = String(form.get("reviewer") ?? "").trim();
  if (![reviewId, recordId].every((id) => Number.isSafeInteger(id) && id > 0) || evidence.length < 10 || evidence.length > 4000 || !reviewer || reviewer.length > 100) {
    throw new Error("請填寫審查人及原始照片證據。");
  }
  const values = Object.fromEntries(["brand", "base_product", "variant", "size_value", "size_unit", "jan_code"].map((field) => [field, String(form.get(field) ?? "").trim() || null]));
  const { error } = await getSupabaseAdmin().rpc("correct_product_identity_record", {
    p_review_id: reviewId, p_record_id: recordId, p_values: values,
    p_photo_url: String(form.get("photo_url") ?? ""), p_evidence: evidence, p_reviewer: reviewer,
  });
  if (error) redirect(`/products?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/products");
}
