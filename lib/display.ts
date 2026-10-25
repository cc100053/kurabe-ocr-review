// Client-safe display helpers + types for the review cards. Must NOT import
// lib/supabase (server-only). The data-fetching layer (lib/queries.ts,
// lib/receiptQueries.ts) re-exports these so server pages can keep importing
// from there; client components import from here directly.

// One unified card for the human review queue. We merge two sources:
//  - "suspicious": guard flagged a risk but the user never changed it → maybe
//    silently wrong, only a human looking at the photo can tell.
//  - "corrected":  AI gave a value and the user overrode it → confirm the final
//    saved value is right.
export type QueueSource = "suspicious" | "corrected";

export type QueueItem = {
  source: QueueSource;
  scan_id: string | null;
  field: string;
  product_name: string | null;
  image_url: string | null;
  ai_value: string; // what the AI read
  saved_value: string | null; // what was finally saved (differs only when corrected)
  hint: string | null; // evidence text or guard reason — a short eyeball aid
  risk_flags: string[];
  high_risk: boolean;
  occurred_at: string;
  // The tax mode/rate the user saved with the price (scan_record_saved), so
  // the reviewer knows whether "最終存" is 含稅 or 不含稅. Null on non-price
  // fields and on events from apps that did not send them.
  saved_tax_mode: string | null;
  saved_tax_rate: number | null;
  // The only risk was a tag printing both 本体 and 税込, and the two numbers
  // agree with the saved price/mode/rate: nothing left for a human to judge.
  self_checked: boolean;
};

// Higher-risk flags to surface first (price/tax/food per the review doc).
export const HIGH_RISK = new Set([
  "bundle_price_detected",
  "single_item_price_missing",
  "multi_buy_price_as_single",
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

// Receipt field labels (category/name/price/tax_basis).
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

// Plain-language "what to check" for each guard risk flag. The card shows these
// so a reviewer knows WHY a case is risky and exactly what to eyeball — a bare
// "高風險" badge with no reason is useless.
export const RISK_LABELS: Record<string, string> = {
  bundle_price_detected: "似多件裝/整袋價：核對個價係成袋定單件",
  single_item_price_missing: "搵唔到單件價：確認影到嘅價就係你想記嗰個",
  multi_buy_price_as_single:
    "AI 將多件優惠價當單件價，已清空：用戶要自己填單件價，多件價另外存",
  tax_inclusive_exclusive_conflict: "稅込/税抜有衝突：核對個價含唔含稅",
  price_outlier_vs_visible_candidates: "個價同相中其他數字差好遠：確認揀啱咗",
  food_tax_risk: "食品稅率風險：核對分類同稅率啱唔啱",
  non_food_household_cue: "似日用品：核對分類啱唔啱",
  discount_without_discount_cue: "冇折扣線索但標咗折扣：核對係咪真係特價",
  discount_value_not_in_evidence: "折扣數字喺標籤文字搵唔到：核對折扣值啱唔啱",
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

// "最終存" tax tag from the saved tax mode: 含稅 / 不含稅, plus the rate.
export function savedTaxLabel(
  mode: string | null,
  rate: number | null,
): string | null {
  const base =
    mode === "included" ? "含稅" : mode === "excluded" ? "不含稅" : null;
  if (!base) return null;
  return rate ? `${base} ${Math.round(rate * 100)}%` : base;
}

export const TAX_CONFLICT_FLAG = "tax_inclusive_exclusive_conflict";

// Japanese tags routinely print both 本体 and 税込, which trips the app's
// tax-conflict flag. It is self-verifying when the tag holds the saved price and
// its counterpart at the saved rate (±1 yen for rounding): 本体 478 / 税込 525.8.
export function taxPairConsistent(
  evidence: string | null,
  saved: string | null,
  mode: string | null,
  rate: number | null,
): boolean {
  const price = Number(saved);
  if (!evidence || !price || !rate || (mode !== "included" && mode !== "excluded")) {
    return false;
  }
  const other = mode === "excluded" ? price * (1 + rate) : price / (1 + rate);
  const nums = (evidence.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  const near = (target: number) => nums.some((n) => Math.abs(n - target) <= 1);
  return near(price) && near(other);
}

// Tax basis derived from the tag evidence cues — mirrors the app's own logic
// (税込 → included; 税抜/本体 → excluded; both → conflict). Lets a price card
// show whether the stored number is 含稅/不含稅 without a backend change.
// Returns null when the evidence carries no cue (e.g. a guard_reason string).
export type TaxBasis = {
  label: string;
  conflict: boolean;
  mode: "included" | "excluded" | null; // null when the tag shows both
};

export function taxBasisFromEvidence(text: string | null): TaxBasis | null {
  if (!text) return null;
  const incl = text.includes("税込");
  const excl = text.includes("税抜") || text.includes("本体");
  if (incl && excl)
    return { label: "⚠️ 牌上同時有税込+税抜", conflict: true, mode: null };
  if (incl) return { label: "牌上：税込", conflict: false, mode: "included" };
  if (excl) return { label: "牌上：税抜", conflict: false, mode: "excluded" };
  return null;
}
