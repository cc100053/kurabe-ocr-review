import "server-only";
import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { getSupabaseAdmin } from "./supabase";

type IdentityRecord = { id: number; image_url: string | null; product_name: string; brand: string | null; base_product: string | null; variant: string | null; size_value: number | null; size_unit: string | null; jan_code: string | null };
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
        .select("id,image_url,product_name,brand,base_product,variant,size_value,size_unit,jan_code")
        .eq("product_id", id).order("id", { ascending: false }).limit(5);
      if (recordError) throw recordError;
      return { ...product, records: records ?? [] };
    }));
    return { ...review, sides } as IdentityReview;
  }));
}
