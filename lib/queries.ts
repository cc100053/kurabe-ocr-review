import { getSupabaseAdmin } from "./supabase";

export type ConfusionRow = {
  field_name: string;
  ai_value: string | null;
  saved_value: string | null;
  sample_count: number;
  corrected_count: number;
  correction_rate: number | null;
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
  risk_flags: unknown;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// "Upgrade rule" from the review doc: same confusion pair recurring >= 3 times
// within a week is worth promoting to a deterministic guard / prompt fix.
export function isUpgradeCandidate(row: ConfusionRow): boolean {
  const recent = Date.now() - new Date(row.last_seen_at).getTime() < SEVEN_DAYS_MS;
  return recent && row.corrected_count >= 3;
}

export async function getConfusion(): Promise<ConfusionRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("scan_field_confusion_summary")
    .select("*")
    .order("corrected_count", { ascending: false })
    .order("sample_count", { ascending: false });
  if (error) throw error;
  return (data ?? []).filter(
    (r) => (r.ai_value ?? "") !== (r.saved_value ?? ""),
  ) as ConfusionRow[];
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
