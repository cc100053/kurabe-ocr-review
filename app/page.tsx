import { getReviewQueue, fieldLabel } from "@/lib/queries";
import {
  getNotesMap,
  noteKey,
  verdictFromNote,
  isResolved,
  resolutionLabel,
} from "@/lib/notes";
import { QueueCard } from "./QueueCard";

export const dynamic = "force-dynamic";

const FIELDS = ["all", "category", "grams", "price", "discount"] as const;
const VIEWS = [
  { key: "todo", label: "待審" },
  { key: "high", label: "高風險" },
  { key: "done", label: "已審" },
  { key: "all", label: "全部" },
] as const;

// "price" filter also matches original_price (same human concept: 價格).
function fieldMatches(itemField: string, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "price") return itemField === "price" || itemField === "original_price";
  return itemField === filter;
}

export default async function ReviewQueue({
  searchParams,
}: {
  searchParams: Promise<{ field?: string; view?: string }>;
}) {
  const { field = "all", view = "todo" } = await searchParams;
  const [queue, notes] = await Promise.all([getReviewQueue(), getNotesMap()]);

  const decorated = queue.map((item) => {
    const note = item.scan_id
      ? notes.get(noteKey(item.scan_id, item.field))
      : undefined;
    return {
      item,
      verdict: verdictFromNote(note),
      resolved: isResolved(note),
      // Badge only when it was resolved by the loop, not a human verdict —
      // a human verdict already shows via the highlighted button.
      aiResolved: verdictFromNote(note) ? null : resolutionLabel(note),
    };
  });

  const rows = decorated.filter(({ item, resolved }) => {
    if (!fieldMatches(item.field, field)) return false;
    if (view === "todo") return !resolved;
    if (view === "done") return resolved;
    if (view === "high") return item.high_risk && !resolved;
    return true; // all
  });

  const todoCount = decorated.filter((d) => !d.resolved).length;

  return (
    <main>
      <h1>審查佇列</h1>
      <p className="subtitle">
        睇住相,判斷 AI 讀嘅值啱定錯。淨係要肉眼審嘅 case
        會喺度;統計同 pattern 分析交俾 AI 讀(見「統計」)。
        <br />
        仲有 <b>{todoCount}</b> 個未審。
      </p>

      <div className="filters">
        {VIEWS.map((v) => (
          <a
            key={v.key}
            href={`/?view=${v.key}&field=${field}`}
            className={v.key === view ? "active" : ""}
          >
            {v.label}
          </a>
        ))}
      </div>
      <div className="filters">
        {FIELDS.map((f) => (
          <a
            key={f}
            href={`/?view=${view}&field=${f}`}
            className={f === field ? "active" : ""}
          >
            {f === "all" ? "全部欄位" : fieldLabel(f)}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">
          {view === "todo" || view === "high"
            ? "🎉 冇嘢要審。"
            : "冇符合嘅 case。"}
        </p>
      ) : (
        <div className="cards">
          {rows.map(({ item, verdict, aiResolved }, i) => (
            <QueueCard
              key={`${item.scan_id}-${item.field}-${i}`}
              item={item}
              verdict={verdict}
              aiResolved={aiResolved}
            />
          ))}
        </div>
      )}
    </main>
  );
}
