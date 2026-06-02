import { fieldLabel, riskReasons, type QueueItem } from "@/lib/queries";
import type { Verdict } from "@/lib/notes";
import { VerdictButtons } from "./VerdictButtons";

// One review card: a large scan image to eyeball, the product, the field, what
// the AI read (and what was saved, if the user changed it), one short hint, and
// the one-tap verdict. Nothing else — stats and pattern analysis live on /stats
// and are read by AI, not here.
export function QueueCard({
  item,
  verdict,
  aiResolved,
}: {
  item: QueueItem;
  verdict: Verdict | null;
  aiResolved: string | null;
}) {
  return (
    <article className={`card${verdict || aiResolved ? " decided" : ""}`}>
      {item.image_url ? (
        <a
          className="card-img"
          href={item.image_url}
          target="_blank"
          rel="noreferrer"
          title="開大圖"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.image_url} alt="scan" loading="lazy" />
        </a>
      ) : (
        <div className="card-img no-img">無相</div>
      )}

      <div className="card-body">
        <div className="card-head">
          <span className="product">{item.product_name ?? "（無名）"}</span>
          {aiResolved ? <span className="badge ok">{aiResolved}</span> : null}
          {item.high_risk ? <span className="badge danger">高風險</span> : null}
        </div>

        <div className="meta">
          <span className="field-chip">{fieldLabel(item.field)}</span>
          <span className="src">
            {item.source === "corrected" ? "用戶改過" : "未改動"}
          </span>
        </div>

        <div className="vals">
          <div className="ai-val">
            AI 讀：<b>{item.ai_value || "∅"}</b>
          </div>
          {item.source === "corrected" &&
          item.saved_value !== item.ai_value ? (
            <div className="saved-val">
              用戶改成：<b>{item.saved_value || "∅"}</b>
            </div>
          ) : null}
        </div>

        {item.risk_flags.length > 0 ? (
          <ul className="risks">
            {riskReasons(item.risk_flags).map((r) => (
              <li key={r.flag} className={r.high ? "high" : ""}>
                {r.high ? "⚠️ 核對：" : "・"}
                {r.label}
              </li>
            ))}
          </ul>
        ) : null}

        {item.hint ? (
          <div className="hint">⚐ 標籤：{item.hint.replace(/\s*\n\s*/g, " / ")}</div>
        ) : null}

        {item.scan_id ? (
          <VerdictButtons
            scanId={item.scan_id}
            field={item.field}
            current={verdict}
          />
        ) : (
          <div className="hint muted">無 scan_id，無法記錄</div>
        )}
      </div>
    </article>
  );
}
