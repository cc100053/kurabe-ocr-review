export type IdentityRecord = {
  id: number; image_url: string | null; product_name: string;
  brand: string | null; base_product: string | null; variant: string | null;
  size_value: number | null; size_unit: string | null; jan_code: string | null;
  price: number | null; original_price: number | null; is_tax_included: boolean | null;
  quantity: number | null; category_tag: string | null; shop_name: string | null;
  created_at: string;
};

export function recordFields(r: IdentityRecord): [string, string][] {
  return [
    ["名稱", r.product_name],
    ["品牌", r.brand ?? "未保存"],
    ["品名", r.base_product ?? "未保存"],
    ["款式 / 香味 / 口味", r.variant ?? "未保存"],
    ["容量 / 規格", r.size_value == null ? "未保存" : `${r.size_value}${r.size_unit ?? "（單位未保存）"}`],
    ["JAN", r.jan_code ?? "未保存"],
    ["保存價格（含稅、折扣後）", r.price == null ? "未保存" : `¥${r.price.toLocaleString("ja-JP")}`],
    ["輸入價格", r.original_price == null ? "未保存" : `¥${r.original_price.toLocaleString("ja-JP")}（${r.is_tax_included == null ? "稅別未保存" : r.is_tax_included ? "含稅" : "未稅"}）`],
    ["件數", r.quantity == null ? "未保存" : String(r.quantity)],
    ["分類", r.category_tag ?? "未保存"],
    ["店舖", r.shop_name ?? "未保存"],
  ];
}

// Audit the owner's action; never invent photograph observations or an AI rationale.
export function manualReviewEvidence(action: string, reviewId: number, recordId?: number): string {
  return `Authenticated owner manual review: ${action}; review_id=${reviewId}${recordId == null ? "" : `; record_id=${recordId}`}. No written rationale supplied.`;
}

export function representativeRecord(records: IdentityRecord[], imageUrl: string | null): IdentityRecord | undefined {
  return imageUrl ? records.find((r) => r.image_url === imageUrl) : undefined;
}

export type CompareRow = { label: string; left: string; right: string; state: "same" | "diff" | "unknown" | "info" };

// Side-by-side identity fields for a pair. A side can hold several records, so
// "same" needs exactly one agreeing value per side; a missing side is unknown,
// never sameness. Price and shop are context only.
export function comparePair(left: IdentityRecord[], right: IdentityRecord[]): CompareRow[] {
  const size = (r: IdentityRecord) => r.size_value == null ? null : `${r.size_value}${r.size_unit ?? ""}`;
  const price = (r: IdentityRecord) => r.price == null ? null : `¥${r.price.toLocaleString("ja-JP")}`;
  const fields: [string, (r: IdentityRecord) => string | null, boolean][] = [
    ["品牌", (r) => r.brand, true], ["品名", (r) => r.base_product, true], ["款式 / 口味", (r) => r.variant, true],
    ["容量 / 規格", size, true], ["JAN", (r) => r.jan_code, true], ["價格", price, false], ["店舖", (r) => r.shop_name, false],
  ];
  const distinct = (records: IdentityRecord[], get: (r: IdentityRecord) => string | null) =>
    [...new Map(records.map(get).filter((v): v is string => !!v?.trim()).map((v) => [v.trim().toLowerCase(), v.trim()])).values()];
  return fields.map(([label, get, identity]) => {
    const l = distinct(left, get), r = distinct(right, get);
    const state = !identity ? "info" : !l.length || !r.length ? "unknown"
      : l.length === 1 && r.length === 1 && l[0].toLowerCase() === r[0].toLowerCase() ? "same" : "diff";
    return { label, left: l.join(" / ") || "—", right: r.join(" / ") || "—", state };
  });
}

// The weekly agent answers "different" for a same-series pair (same_series is
// human-only), so that combination counts as agreement.
export function aiAgrees(ai: string, verdict: string): boolean {
  return ai === verdict || (ai === "different" && verdict === "same_series");
}
