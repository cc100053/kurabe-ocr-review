import { getSupabaseAdmin, selectAll } from "./supabase";
import { needsHumanEye } from "./batch";

// Re-export the client-safe receipt label so server pages can keep importing it
// from here; client components import it from "@/lib/display".
export { receiptFieldLabel } from "./display";

// Receipt-scan views (defined by migrations in the APP repo):
//   - receipt_field_confusion_summary / receipt_field_correction_samples:
//     statistics for AI (the /receipt page, hidden from the nav).
//   - receipt_line_review: every saved line + the shared receipt photo, backing
//     the per-photo human review cards on `/` (see getReceiptReviewGroups).

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

// ---------------------------------------------------------------------------
// Image-backed receipt review: one card per receipt photo + its parsed lines.
//
// A receipt scan saves many lines that all share ONE uploaded photo, so the
// human-review unit is the receipt: show the image once, list every saved line,
// and let the reviewer eyeball each line against the picture. Reads the
// `receipt_line_review` view (migration 20260608120000) which carries every
// saved line plus the shared image_url / store_name / confidence.
// ---------------------------------------------------------------------------

export type ReceiptReviewLine = {
  scanId: string; // full per-line id "<base>#<idx>"
  lineIndex: number;
  occurredAt: string;
  productName: string | null;
  confidence: string | null;
  name: { ai: unknown; saved: unknown };
  price: { ai: unknown; saved: unknown };
  category: { ai: unknown; saved: unknown };
  taxBasis: { ai: unknown; saved: unknown };
  changed: string[]; // fields the user edited (context only)
  eventId: number | null; // telemetry event id: the category-memory approval key
  categoryCorrected: boolean; // a category correction = shared-memory source candidate
  memoryApplied: boolean; // category was prefilled from shared memory
};

export type ReceiptReviewGroup = {
  baseScanId: string;
  storeName: string | null;
  imageUrl: string | null;
  occurredAt: string; // newest line in the group
  lines: ReceiptReviewLine[]; // only lines that need a human eye
  skipped: number; // untouched high-confidence lines, assumed correct
};

type LineReviewRow = {
  occurred_at: string;
  scan_id: string | null;
  product_name: string | null;
  store_name: string | null;
  image_url: string | null;
  confidence: string | null;
  name: AiSaved;
  price: AiSaved;
  category: AiSaved;
  tax_basis: AiSaved;
  changed_fields: Record<string, boolean> | null;
  // Appended by app migration 20261014180000; undefined on the older view.
  event_id?: number;
  category_corrected?: boolean;
  category_memory_applied?: boolean;
};

// Group saved receipt lines (after the queue baseline `since`) into per-photo
// review cards, newest receipt first. Only lines that need a human eye are kept;
// receipts with none are dropped.
export async function getReceiptReviewGroups(
  since: string,
): Promise<ReceiptReviewGroup[]> {
  const rows = await selectAll<LineReviewRow>((from, to) =>
    getSupabaseAdmin()
      .from("receipt_line_review")
      .select("*")
      .gt("occurred_at", since)
      .order("occurred_at", { ascending: false })
      .order("scan_id")
      .range(from, to),
  );

  const groups = new Map<string, ReceiptReviewGroup>();
  for (const r of rows) {
    if (!r.scan_id) continue;
    const hash = r.scan_id.lastIndexOf("#");
    const base = hash >= 0 ? r.scan_id.slice(0, hash) : r.scan_id;
    const lineIndex = hash >= 0 ? Number(r.scan_id.slice(hash + 1)) || 0 : 0;
    // changed_fields.category is also true for an accepted memory prefill; the
    // newer view's category_corrected is the real "user changed it" signal.
    const changed = changedFieldNames(r.changed_fields).filter(
      (f) => f !== "category" || r.category_corrected !== false,
    );
    const line: ReceiptReviewLine = {
      scanId: r.scan_id,
      lineIndex,
      occurredAt: r.occurred_at,
      productName: r.product_name,
      confidence: r.confidence,
      name: { ai: r.name?.ai, saved: r.name?.saved },
      price: { ai: r.price?.ai, saved: r.price?.saved },
      category: { ai: r.category?.ai, saved: r.category?.saved },
      taxBasis: { ai: r.tax_basis?.ai, saved: r.tax_basis?.saved },
      changed,
      eventId: r.event_id ?? null,
      categoryCorrected: r.category_corrected ?? changed.includes("category"),
      memoryApplied: r.category_memory_applied ?? false,
    };
    const keep = needsHumanEye(line);
    const g = groups.get(base);
    if (g) {
      if (keep) g.lines.push(line);
      else g.skipped++;
      if (r.occurred_at > g.occurredAt) g.occurredAt = r.occurred_at;
      if (!g.imageUrl && r.image_url) g.imageUrl = r.image_url;
      if (!g.storeName && r.store_name) g.storeName = r.store_name;
    } else {
      groups.set(base, {
        baseScanId: base,
        storeName: r.store_name,
        imageUrl: r.image_url,
        occurredAt: r.occurred_at,
        lines: keep ? [line] : [],
        skipped: keep ? 0 : 1,
      });
    }
  }

  const out = [...groups.values()].filter((g) => g.lines.length > 0);
  for (const g of out) g.lines.sort((a, b) => a.lineIndex - b.lineIndex);
  out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return out;
}
