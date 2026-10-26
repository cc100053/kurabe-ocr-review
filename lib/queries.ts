import { getSupabaseAdmin, selectAll } from "./supabase";
import {
  HIGH_RISK,
  TAX_CONFLICT_FLAG,
  isPriceField,
  taxPairConsistent,
  type QueueItem,
  type QueueSource,
} from "./display";

// Re-export the client-safe display helpers/types so existing imports
// (`from "@/lib/queries"`) keep working for server pages. Client components
// must import those from "@/lib/display" (this module is server-only).
export * from "./display";

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
// within the last 7 days → consider a deterministic guard / prompt fix.
export function isUpgradeCandidate(row: ConfusionRow): boolean {
  return row.count_7d >= 3;
}

function toFlags(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function fmtValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("type" in v && "value" in v) {
      return v.type == null || v.type === "none" ? "none" : `${v.type}:${fmtValue(v.value)}`;
    }
    return JSON.stringify(v);
  }
  return String(v);
}

// The single feed behind the review queue. High-risk first, then newest.
// Merges suspicious (flagged but untouched) + corrected (user overrode AI).
// `since` is the queue baseline: only cases after it are fetched (all of them).
export async function getReviewQueue(since: string): Promise<QueueItem[]> {
  const [suspicious, corrected] = await Promise.all([
    getSuspicious(since),
    getCorrectionSamples(since),
  ]);

  const items: QueueItem[] = [];

  for (const r of suspicious) {
    const flags = toFlags(r.risk_flags);
    items.push({
      source: "suspicious" as QueueSource,
      scan_id: r.scan_id,
      field: r.field_name,
      product_name: r.product_name,
      image_url: r.image_url,
      ai_value: r.ai_value ?? "",
      saved_value: null,
      hint: r.evidence_text,
      risk_flags: flags,
      high_risk: flags.some((f) => HIGH_RISK.has(f)),
      occurred_at: r.occurred_at,
      saved_tax_mode: null,
      saved_tax_rate: null,
      self_checked: false,
    });
  }

  for (const r of corrected) {
    if (!r.field_name) continue;
    const flags = toFlags(r.risk_flags);
    items.push({
      source: "corrected" as QueueSource,
      scan_id: r.scan_id,
      field: r.field_name,
      product_name: r.product_name,
      image_url: r.image_url,
      ai_value: fmtValue(r.ai_value),
      saved_value: null,
      hint: r.guard_reason,
      risk_flags: flags,
      high_risk: flags.some((f) => HIGH_RISK.has(f)),
      occurred_at: r.occurred_at,
      saved_tax_mode: null,
      saved_tax_rate: null,
      self_checked: false,
    });
  }

  const saved = await getSavedFields(
    items.filter((i) => i.scan_id).map((i) => i.scan_id!),
  );
  const savedItems = items.filter((item) => {
    const snapshot = item.scan_id ? saved.get(item.scan_id) : undefined;
    // Field-change events include intermediate and abandoned edits.
    if (!snapshot) return false;
    item.saved_value = snapshot.values[isPriceField(item.field) ? "price" : item.field] ?? null;
    if (isPriceField(item.field)) {
      item.saved_tax_mode = snapshot.mode;
      item.saved_tax_rate = snapshot.rate;
    }
    item.self_checked =
      item.risk_flags.length > 0 &&
      item.risk_flags.every((f) => f === TAX_CONFLICT_FLAG) &&
      taxPairConsistent(item.hint, item.saved_value, item.saved_tax_mode, item.saved_tax_rate);
    return true;
  });

  savedItems.sort((a, b) => {
    if (a.high_risk !== b.high_risk) return a.high_risk ? -1 : 1;
    return b.occurred_at.localeCompare(a.occurred_at);
  });
  return savedItems;
}

// The successful-save snapshot is authoritative; current_value in the
// correction feed is only the value at the time of one edit.
type SavedFields = {
  values: Record<string, string>;
  mode: string | null;
  rate: number | null;
};

type SavedEvent = {
  scan_id: string;
  price: { saved_original_price?: number | null; saved_tax_mode?: string; saved_tax_rate?: number } | null;
  category: { saved?: string | null } | null;
  grams: { saved?: number | null } | null;
  discount: { saved_discount_type?: string; saved_discount_value?: number | null } | null;
};

async function getSavedFields(scanIds: string[]): Promise<Map<string, SavedFields>> {
  const ids = [...new Set(scanIds)];
  const out = new Map<string, SavedFields>();
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await selectAll<SavedEvent>((from, to) =>
      getSupabaseAdmin()
        .from("scan_telemetry_events")
        .select("scan_id:properties->>scan_id, price:properties->price, category:properties->category, grams:properties->grams, discount:properties->discount")
        .eq("event_name", "scan_record_saved")
        .in("properties->>scan_id", ids.slice(i, i + 100))
        .order("occurred_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    );
    // Ascending, so the latest successful save supplies every field together.
    for (const row of rows) {
      const discount = row.discount?.saved_discount_type;
      out.set(row.scan_id, {
        values: {
          price: fmtValue(row.price?.saved_original_price),
          category: fmtValue(row.category?.saved),
          grams: fmtValue(row.grams?.saved),
          discount: discount == null ? "" : discount === "none" ? "none"
            : `${discount}:${fmtValue(row.discount?.saved_discount_value)}`,
        },
        mode: row.price?.saved_tax_mode ?? null,
        rate: row.price?.saved_tax_rate ?? null,
      });
    }
  }
  return out;
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
  since: string,
): Promise<CorrectionSample[]> {
  return selectAll<CorrectionSample>((from, to) =>
    getSupabaseAdmin()
      .from("scan_field_correction_samples")
      .select("*")
      .gt("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .order("scan_id")
      .order("field_name")
      .range(from, to),
  );
}

export async function getSuspicious(since: string): Promise<SuspiciousRow[]> {
  return selectAll<SuspiciousRow>((from, to) =>
    getSupabaseAdmin()
      .from("scan_field_suspicious_untouched")
      .select("*")
      .gt("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .order("scan_id")
      .order("field_name")
      .range(from, to),
  );
}
