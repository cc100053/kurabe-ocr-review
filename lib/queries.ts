import { getSupabaseAdmin } from "./supabase";
import { HIGH_RISK, type QueueItem, type QueueSource } from "./display";

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
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// The single feed behind the review queue. High-risk first, then newest.
// Merges suspicious (flagged but untouched) + corrected (user overrode AI).
export async function getReviewQueue(): Promise<QueueItem[]> {
  const [suspicious, corrected] = await Promise.all([
    getSuspicious(),
    getCorrectionSamples(),
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
      source: "corrected" as QueueSource,
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
