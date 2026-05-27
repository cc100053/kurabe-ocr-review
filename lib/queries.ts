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
};

// "Upgrade rule" from the review doc: same confusion pair recurring >= 3 times
// within the last 7 days → consider a deterministic guard / prompt fix. Now a
// true rolling window (count_7d), not an all-time count.
export function isUpgradeCandidate(row: ConfusionRow): boolean {
  return row.count_7d >= 3;
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
