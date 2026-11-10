import "server-only";
import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "./supabase";

import { type IdentityRecord } from "./productReview";
type IdentitySide = { id: number; display_name: string; image_url: string | null; merged_into: number | null; records: IdentityRecord[] };
type IdentityAssessment = { judgement: string; confidence: string; reason: string; visible_evidence: { left: string; right: string }; conflicts: string[]; data_conflicts?: string[]; assessor: string; assessed_at: string };
type IdentityReview = { id: number; left_product_id: number; right_product_id: number; reason: string; verdict: string | null; evidence: string | null; reviewed_by: string | null; ai_assessment: IdentityAssessment | null; history: Record<string, unknown>[]; sides: IdentitySide[] };

export async function requireIdentityReviewer() {
  const expected = process.env.CONSOLE_PASSWORD;
  const authorization = (await headers()).get("authorization") ?? "";
  const [scheme, encoded] = authorization.split(" ");
  let actual = "";
  if (scheme === "Basic" && encoded) {
    actual = Buffer.from(encoded, "base64").toString().split(":").slice(1).join(":");
  }
  if (!expected || Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    throw new Error("Authenticated reviewer required");
  }
}

export const IDENTITY_RECORD_COLUMNS = "id,image_url,product_name,name_key,brand,base_product,variant,size_value,size_unit,jan_code,price,original_price,is_tax_included,quantity,category_tag,shop_name,created_at";

export async function getProductIdentityReviews(done: boolean): Promise<IdentityReview[]> {
  await requireIdentityReviewer();
  const admin = getSupabaseAdmin();
  let query = admin.from("product_identity_reviews").select("*").order("id", { ascending: !done }).limit(20);
  query = done ? query.not("verdict", "is", null) : query.is("verdict", null);
  const { data: reviews, error } = await query;
  if (error) throw error;
  const ids = [...new Set((reviews ?? []).flatMap((q) => [q.left_product_id, q.right_product_id]))];
  if (!ids.length) return [];
  const { data: products, error: productError } = await admin.from("products").select("id,display_name,image_url,merged_into").in("id", ids);
  if (productError) throw productError;
  return Promise.all((reviews ?? []).map(async (review): Promise<IdentityReview> => {
    const sides = await Promise.all([review.left_product_id, review.right_product_id].map(async (id) => {
      const product = products!.find((p) => p.id === id)!;
      const { data: records, error: recordError } = await admin.from("price_records")
        .select(IDENTITY_RECORD_COLUMNS)
        // Every record can block a merge, so the pair needs them all (bounded for safety).
        .eq("product_id", id).order("id", { ascending: false }).limit(100);
      if (recordError) throw recordError;
      return { ...product, records: records ?? [] };
    }));
    return { ...review, sides } as IdentityReview;
  }));
}

export async function getIdentityCounts(): Promise<{ pending: number; unassessed: number }> {
  await requireIdentityReviewer();
  const pending = () => getSupabaseAdmin().from("product_identity_reviews").select("id", { count: "exact", head: true }).is("verdict", null);
  const [all, unassessed] = await Promise.all([pending(), pending().is("ai_assessment", null)]);
  if (all.error ?? unassessed.error) throw all.error ?? unassessed.error;
  return { pending: all.count ?? 0, unassessed: unassessed.count ?? 0 };
}
