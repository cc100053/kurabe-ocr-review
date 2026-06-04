import { getSupabaseAdmin } from "./supabase";

// Receipt-scan review reads two views (defined by a migration in the APP repo:
// supabase/migrations/20260604120000_add_receipt_review_views.sql):
//   - receipt_field_confusion_summary  : AI value vs final saved value per field
//   - receipt_field_correction_samples : lines the user actually edited
// Receipts have NO guard pass and NO per-line image (one photo → many lines),
// so there is no image-forward "eyeball the photo" queue like the price-tag flow.
// This surface is purely statistical, like /stats: which field the AI gets wrong
// most, and concrete corrected examples to read off.

const FIELD_ORDER = ["category", "name", "price", "tax_basis"];

// One recurring AI→saved confusion pair for a receipt field.
export type ReceiptConfusionRow = {
  field_name: string;
  ai_value: string | null;
  saved_value: string | null;
  sample_count: number;
  corrected_count: number;
  correction_rate: number | null;
  last_seen_at: string;
};

// One saved receipt line the user edited. The view stores each field as a
// {ai, saved} json object plus a changed_fields flag map.
type AiSaved = { ai?: unknown; saved?: unknown } | null;
export type ReceiptCorrectionSample = {
  occurred_at: string;
  scan_id: string | null;
  product_name: string | null;
  name: AiSaved;
  price: AiSaved;
  category: AiSaved;
  tax_basis: AiSaved;
  changed_fields: Record<string, boolean> | null;
};

// Per-field rollup derived from the confusion summary: total saved lines vs how
// many the user corrected → the receipt analogue of scan_field_correction_overview.
export type ReceiptFieldOverview = {
  field_name: string;
  total: number;
  corrected: number;
  correction_rate: number | null;
};

export function receiptFieldLabel(field: string | null): string {
  switch (field) {
    case "category":
      return "分類";
    case "name":
      return "名稱";
    case "price":
      return "價格";
    case "tax_basis":
      return "稅別";
    default:
      return field ?? "—";
  }
}

export async function getReceiptConfusion(): Promise<ReceiptConfusionRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("receipt_field_confusion_summary")
    .select("*")
    .order("corrected_count", { ascending: false })
    .order("sample_count", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ReceiptConfusionRow[];
}

export async function getReceiptCorrectionSamples(): Promise<
  ReceiptCorrectionSample[]
> {
  const { data, error } = await getSupabaseAdmin()
    .from("receipt_field_correction_samples")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ReceiptCorrectionSample[];
}

// Collapse the confusion summary (one row per ai/saved pair) into a per-field
// total-vs-corrected rollup, ordered by the field that gets corrected most.
export function rollupFieldOverview(
  confusion: ReceiptConfusionRow[],
): ReceiptFieldOverview[] {
  const byField = new Map<string, { total: number; corrected: number }>();
  for (const r of confusion) {
    const acc = byField.get(r.field_name) ?? { total: 0, corrected: 0 };
    acc.total += r.sample_count;
    acc.corrected += r.corrected_count;
    byField.set(r.field_name, acc);
  }
  return [...byField.entries()]
    .map(([field_name, { total, corrected }]) => ({
      field_name,
      total,
      corrected,
      correction_rate: total > 0 ? corrected / total : null,
    }))
    .sort(
      (a, b) =>
        (b.correction_rate ?? 0) - (a.correction_rate ?? 0) ||
        b.total - a.total,
    );
}

// Only the rows where AI != saved are worth surfacing as "recurring errors";
// matching pairs (the AI got it right) are dropped, then highest-count first.
export function recurringConfusion(
  confusion: ReceiptConfusionRow[],
  limit = 15,
): ReceiptConfusionRow[] {
  return confusion
    .filter((r) => (r.corrected_count ?? 0) > 0)
    .sort(
      (a, b) =>
        b.corrected_count - a.corrected_count ||
        b.sample_count - a.sample_count,
    )
    .slice(0, limit);
}

// Stable display order for a sample's changed fields.
export function changedFieldNames(
  changed: Record<string, boolean> | null,
): string[] {
  if (!changed) return [];
  return FIELD_ORDER.filter((f) => changed[f]);
}
