import { getSupabaseAdmin } from "./supabase";

// Per-field summary: answers "which field is worst / is it improving".
export type FieldOverview = {
  field_name: string;
  total: number;
  corrected: number;
  correction_rate: number | null;
  total_7d: number;
  corrected_7d: number;
  correction_rate_7d: number | null;
  total_30d: number;
  corrected_30d: number;
};

// One recurring AI→saved confusion pair, with true time-windowed recurrence.
export type ConfusionRow = {
  field_name: string;
  ai_value: string | null;
  saved_value: string | null;
  sample_count: number;
  count_7d: number;
  count_30d: number;
  last_seen_at: string;
};

export type CorrectionSample = {
  occurred_at: string;
  scan_id: string | null;
  product_name: string | null;
  field_name: string | null;
  ai_value: unknown;
  guarded_value: unknown;
  current_value: unknown;
  guard_action: string | null;
  guard_reason: string | null;
  risk_flags: unknown;
  changed_after_guard: string | null;
  image_url: string | null;
};

export type SuspiciousRow = {
  occurred_at: string;
  scan_id: string | null;
  product_name: string | null;
  field_name: string;
  ai_value: string | null;
  guarded_value: string | null;
  saved_value: string | null;
  evidence_text: string | null;
  risk_flags: unknown;
  image_url: string | null;
};

// "Upgrade rule" from the review doc: same confusion pair recurring >= 3 times
// within the last 7 days → consider a deterministic guard / prompt fix. Now a
// true rolling window (count_7d), not an all-time count.
export function isUpgradeCandidate(row: ConfusionRow): boolean {
  return row.count_7d >= 3;
}

// Higher-risk flags to surface first (price/tax/food per the review doc).
export const HIGH_RISK = new Set([
  "bundle_price_detected",
  "single_item_price_missing",
  "tax_inclusive_exclusive_conflict",
  "price_outlier_vs_visible_candidates",
  "food_tax_risk",
]);

// Human-friendly field labels — the console is for eyeballing, not column names.
export function fieldLabel(field: string | null): string {
  switch (field) {
    case "category":
      return "分類";
    case "grams":
      return "重量";
    case "price":
    case "original_price":
      return "價格";
    case "discount":
      return "折扣";
    default:
      return field ?? "—";
  }
}

// Plain-language "what to check" for each guard risk flag. The card shows
// these so a reviewer knows WHY a case is risky and exactly what to eyeball —
// a bare "高風險" badge with no reason is useless.
export const RISK_LABELS: Record<string, string> = {
  bundle_price_detected: "似多件裝/整袋價：核對個價係成袋定單件",
  single_item_price_missing: "搵唔到單件價：確認影到嘅價就係你想記嗰個",
  tax_inclusive_exclusive_conflict: "稅込/税抜有衝突：核對個價含唔含稅",
  price_outlier_vs_visible_candidates: "個價同相中其他數字差好遠：確認揀啱咗",
  food_tax_risk: "食品稅率風險：核對分類同稅率啱唔啱",
  non_food_household_cue: "似日用品：核對分類啱唔啱",
  discount_without_discount_cue: "冇折扣線索但標咗折扣：核對係咪真係特價",
  weight_without_weight_keyword: "重量冇單位字眼：確認個重量讀啱",
  weight_too_large_for_context: "重量大得異常：核對單位（g / kg）",
  weight_from_unit_price_context: "重量可能來自單價（100g當り）：核對唔係包裝淨重",
};

export type RiskReason = { flag: string; label: string; high: boolean };

// Turn raw flags into human "what to check" lines, high-risk ones first.
export function riskReasons(flags: string[]): RiskReason[] {
  return flags
    .map((f) => ({ flag: f, label: RISK_LABELS[f] ?? f, high: HIGH_RISK.has(f) }))
    .sort((a, b) => (a.high === b.high ? 0 : a.high ? -1 : 1));
}

export function isPriceField(field: string): boolean {
  return field === "price" || field === "original_price";
}

// Tax basis derived from the tag evidence cues — mirrors the app's own logic
// (税込 → included; 税抜/本体 → excluded; both → conflict). Lets a price card
// show whether the stored number is 含稅/不含稅 without a backend change.
// Returns null when the evidence carries no cue (e.g. a guard_reason string).
export type TaxBasis = { label: string; conflict: boolean };

export function taxBasisFromEvidence(text: string | null): TaxBasis | null {
  if (!text) return null;
  const incl = text.includes("税込");
  const excl = text.includes("税抜") || text.includes("本体");
  if (incl && excl) return { label: "⚠️ 牌上同時有税込+税抜", conflict: true };
  if (incl) return { label: "含稅（税込）", conflict: false };
  if (excl) return { label: "不含稅（税抜）", conflict: false };
  return null;
}

function toFlags(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function fmtValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// One unified card for the human review queue. We merge two sources:
//  - "suspicious": guard flagged a risk but the user never changed it → maybe
//    silently wrong, only a human looking at the photo can tell.
//  - "corrected":  AI gave a value and the user overrode it → confirm the final
//    saved value is right.
// Everything a human needs to adjudicate, nothing else (stats live on /stats).
export type QueueSource = "suspicious" | "corrected";

export type QueueItem = {
  source: QueueSource;
  scan_id: string | null;
  field: string;
  product_name: string | null;
  image_url: string | null;
  ai_value: string; // what the AI read
  saved_value: string | null; // what was finally saved (only differs when corrected)
  hint: string | null; // evidence text or guard reason — a short eyeball aid
  risk_flags: string[];
  high_risk: boolean;
  occurred_at: string;
};

// The single feed behind the review queue. High-risk first, then newest.
export async function getReviewQueue(): Promise<QueueItem[]> {
  const [suspicious, corrected] = await Promise.all([
    getSuspicious(),
    getCorrectionSamples(),
  ]);

  const items: QueueItem[] = [];

  for (const r of suspicious) {
    const flags = toFlags(r.risk_flags);
    items.push({
      source: "suspicious",
      scan_id: r.scan_id,
      field: r.field_name,
      product_name: r.product_name,
      image_url: r.image_url,
      ai_value: r.ai_value ?? "",
      saved_value: r.saved_value,
      hint: r.evidence_text,
      risk_flags: flags,
      high_risk: flags.some((f) => HIGH_RISK.has(f)),
      occurred_at: r.occurred_at,
    });
  }

  for (const r of corrected) {
    if (!r.field_name) continue;
    const flags = toFlags(r.risk_flags);
    items.push({
      source: "corrected",
      scan_id: r.scan_id,
      field: r.field_name,
      product_name: r.product_name,
      image_url: r.image_url,
      ai_value: fmtValue(r.ai_value),
      saved_value: fmtValue(r.current_value),
      hint: r.guard_reason,
      risk_flags: flags,
      high_risk: flags.some((f) => HIGH_RISK.has(f)),
      occurred_at: r.occurred_at,
    });
  }

  items.sort((a, b) => {
    if (a.high_risk !== b.high_risk) return a.high_risk ? -1 : 1;
    return b.occurred_at.localeCompare(a.occurred_at);
  });
  return items;
}

export async function getFieldOverview(): Promise<FieldOverview[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("scan_field_correction_overview")
    .select("*")
    .order("correction_rate", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FieldOverview[];
}

export async function getConfusion(): Promise<ConfusionRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("scan_field_confusion_summary")
    .select("*")
    .order("sample_count", { ascending: false })
    .order("count_7d", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConfusionRow[];
}

export async function getCorrectionSamples(
  field?: string,
): Promise<CorrectionSample[]> {
  let q = getSupabaseAdmin()
    .from("scan_field_correction_samples")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(200);
  if (field) q = q.eq("field_name", field);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as CorrectionSample[];
}

export async function getSuspicious(): Promise<SuspiciousRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("scan_field_suspicious_untouched")
    .select("*")
    .order("occurred_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as SuspiciousRow[];
}
