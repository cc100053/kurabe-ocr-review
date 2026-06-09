import { getReviewQueue, fieldLabel } from "@/lib/queries";
import { getReceiptReviewGroups } from "@/lib/receiptQueries";
import {
  getNotesMap,
  noteKey,
  verdictFromNote,
  isResolved,
  resolutionLabel,
  getQueueClearedAt,
  type Verdict,
} from "@/lib/notes";
import { clearQueue } from "./actions";
import { ReviewBoard } from "./ReviewBoard";

export const dynamic = "force-dynamic";

const FIELDS = ["all", "category", "grams", "price", "discount"] as const;
const VIEWS = [
  { key: "todo", label: "待審" },
  { key: "high", label: "高風險" },
  { key: "done", label: "已審" },
  { key: "all", label: "全部" },
] as const;
const SOURCES = [
  { key: "all", label: "全部來源" },
  { key: "price", label: "價牌" },
  { key: "receipt", label: "收據" },
] as const;

// "price" filter also matches original_price (same human concept: 價格).
function fieldMatches(itemField: string, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "price")
    return itemField === "price" || itemField === "original_price";
  return itemField === filter;
}

export default async function ReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ field?: string; view?: string; source?: string }>;
}) {
  const {
    field = "all",
    view = "todo",
    source = "all",
  } = await searchParams;

  const [queue, receiptGroups, notes, clearedAt] = await Promise.all([
    getReviewQueue(),
    getReceiptReviewGroups(),
    getNotesMap(),
    getQueueClearedAt(),
  ]);

  // "Clear queue" baseline: only show cases that occurred after it.
  const clearedMs = clearedAt ? new Date(clearedAt).getTime() : 0;
  const fresh = (iso: string) => new Date(iso).getTime() > clearedMs;

  // ---- Price-tag cards ----
  const showPrice = source === "all" || source === "price";
  const decorated = queue
    .filter((item) => fresh(item.occurred_at))
    .map((item) => {
      const note = item.scan_id
        ? notes.get(noteKey(item.scan_id, item.field))
        : undefined;
      return {
        item,
        verdict: verdictFromNote(note),
        resolved: isResolved(note),
        // Badge only when resolved by the loop, not a human verdict (a human
        // verdict already shows via the highlighted button).
        aiResolved: verdictFromNote(note) ? null : resolutionLabel(note),
      };
    });

  const priceRows = showPrice
    ? decorated.filter(({ item, resolved }) => {
        if (!fieldMatches(item.field, field)) return false;
        if (view === "todo") return !resolved;
        if (view === "done") return resolved;
        if (view === "high") return item.high_risk && !resolved;
        return true; // all
      })
    : [];

  // ---- Receipt cards (image-backed; no risk concept) ----
  const showReceipt = source === "all" || source === "receipt";
  const lineResolved = (scanId: string) =>
    isResolved(notes.get(noteKey(scanId, "line")));

  const receiptRows = showReceipt
    ? receiptGroups
        .filter((g) => fresh(g.occurredAt))
        .filter((g) => {
          const unresolved = g.lines.filter((l) => !lineResolved(l.scanId));
          if (view === "todo") return unresolved.length > 0;
          if (view === "done") return unresolved.length === 0;
          if (view === "high") return false; // receipts carry no risk flags
          return true; // all
        })
    : [];

  // Seed the board's verdict overlay from existing human notes (both streams).
  const initialVerdicts: Record<string, Verdict> = {};
  const aiResolved: Record<string, string> = {};
  for (const { item, verdict, aiResolved: ai } of priceRows) {
    if (!item.scan_id) continue;
    const key = noteKey(item.scan_id, item.field);
    if (verdict) initialVerdicts[key] = verdict;
    if (ai) aiResolved[key] = ai;
  }
  for (const g of receiptRows) {
    for (const l of g.lines) {
      const v = verdictFromNote(notes.get(noteKey(l.scanId, "line")));
      if (v) initialVerdicts[noteKey(l.scanId, "line")] = v;
    }
  }

  const totalUnits =
    priceRows.length + receiptRows.reduce((n, g) => n + g.lines.length, 0);

  const clearedLabel = clearedAt
    ? new Date(clearedAt).toISOString().slice(0, 16).replace("T", " ")
    : null;

  return (
    <main>
      <div className="page-head">
        <h1>審查佇列</h1>
        <form action={clearQueue}>
          <button className="clear-btn" type="submit">
            清空佇列（之後只睇新 case）
          </button>
        </form>
      </div>
      <p className="subtitle">
        睇住相,判斷 AI 讀嘅值啱定錯。價牌逐張、收據逐行對住相審;統計同 pattern
        分析交俾 AI 讀(見「統計」/「收據」)。
        {clearedLabel
          ? `（已清空至 ${clearedLabel} UTC,只顯示之後嘅新 case）`
          : null}
      </p>

      <div className="filters">
        {SOURCES.map((s) => (
          <a
            key={s.key}
            href={`/?view=${view}&field=${field}&source=${s.key}`}
            className={s.key === source ? "active" : ""}
          >
            {s.label}
          </a>
        ))}
      </div>
      <div className="filters">
        {VIEWS.map((v) => (
          <a
            key={v.key}
            href={`/?view=${v.key}&field=${field}&source=${source}`}
            className={v.key === view ? "active" : ""}
          >
            {v.label}
          </a>
        ))}
      </div>
      {source !== "receipt" ? (
        <div className="filters">
          {FIELDS.map((f) => (
            <a
              key={f}
              href={`/?view=${view}&field=${f}&source=${source}`}
              className={f === field ? "active" : ""}
            >
              {f === "all" ? "全部欄位" : fieldLabel(f)}
            </a>
          ))}
        </div>
      ) : null}

      {totalUnits === 0 ? (
        <p className="empty">
          {view === "todo" || view === "high"
            ? "🎉 冇嘢要審。"
            : "冇符合嘅 case。"}
        </p>
      ) : (
        <ReviewBoard
          items={priceRows.map((r) => r.item)}
          receipts={receiptRows}
          initialVerdicts={initialVerdicts}
          aiResolved={aiResolved}
        />
      )}
    </main>
  );
}
