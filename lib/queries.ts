import { getSupabaseAdmin, selectAll } from "./supabase";
import {
  HIGH_RISK,
  type QueueItem,
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

// The view supplies values, photo and identity from one successful save.
export async function getReviewQueue(since: string): Promise<QueueItem[]> {
  type Row = {
    event_id: number; scan_id: string; field_name: string; source: QueueItem["source"];
    product_name: string | null; image_url: string | null; image_source: QueueItem["image_source"];
    ai_value: string | null; saved_value: string | null; evidence_text: string | null;
    risk_flags: unknown; occurred_at: string; saved_tax_mode: string | null; saved_tax_rate: number | null;
  };
  const rows = await selectAll<Row>((from, to) => getSupabaseAdmin()
    .from("scan_review_queue").select("*").gt("occurred_at", since)
    .order("occurred_at", { ascending: false }).order("event_id").order("field_name").range(from, to));
  return rows.map((r) => {
    const flags = toFlags(r.risk_flags);
    return {
      event_id: r.event_id, scan_id: r.scan_id, field: r.field_name, source: r.source,
      product_name: r.product_name, image_url: r.image_url, image_source: r.image_source,
      ai_value: r.ai_value ?? "", saved_value: r.saved_value, hint: r.evidence_text,
      risk_flags: flags, high_risk: flags.some((f) => HIGH_RISK.has(f)), occurred_at: r.occurred_at,
      saved_tax_mode: r.saved_tax_mode, saved_tax_rate: r.saved_tax_rate,
    };
  }).sort((a, b) => Number(b.high_risk) - Number(a.high_risk) || b.occurred_at.localeCompare(a.occurred_at));
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
  return selectAll<ConfusionRow>((from, to) => getSupabaseAdmin()
    .from("scan_field_confusion_summary").select("*")
    .order("sample_count", { ascending: false }).order("count_7d", { ascending: false })
    .order("field_name").order("ai_value").order("saved_value").range(from, to));
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
