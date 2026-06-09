import {
  fieldLabel,
  riskReasons,
  isPriceField,
  taxBasisFromEvidence,
  type QueueItem,
} from "@/lib/display";
import type { Verdict } from "@/lib/verdict";
import { VerdictButtons } from "./VerdictButtons";

// One price-tag review card: a large scan image to eyeball, the product, the
// field, what the AI read (and what was saved, if the user changed it), one
// short hint, and the one-tap verdict. Presentational — focus + verdict are
// driven by the review board (mouse or keyboard); stats/pattern analysis live
// on /stats and are read by AI, not here.
export function QueueCard({
  item,
  verdict,
  aiResolved,
  focused,
  focusId,
  onFocus,
  onVerdict,
}: {
  item: QueueItem;
  verdict: Verdict | null;
  aiResolved: string | null;
  focused: boolean;
  focusId?: number;
  onFocus: () => void;
  onVerdict: (verdict: Verdict | null) => void;
}) {
  const decided = verdict || aiResolved;
  return (
    <article
      className={`card${decided ? " decided" : ""}${focused ? " focused" : ""}`}
      data-focus={focusId}
      onMouseDown={onFocus}
    >
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

        {(() => {
          // The verdict judges the FINAL stored value (= saved_value), whether
          // it came from the AI or a user edit. Show the AI's original read as
          // muted context only when it differs.
          const final =
            item.saved_value && item.saved_value !== "" ? item.saved_value : "∅";
          const aiRead = item.ai_value || "∅";
          const differ = (item.saved_value ?? "") !== item.ai_value;
          // 含稅/不含稅 tag for price fields, derived from the tag evidence.
          const tax = isPriceField(item.field)
            ? taxBasisFromEvidence(item.hint)
            : null;
          return (
            <div className="vals">
              <div className="final-val">
                最終存：<b>{final}</b>
                {tax ? (
                  <span className={`tax-tag${tax.conflict ? " conflict" : ""}`}>
                    {tax.label}
                  </span>
                ) : null}
              </div>
              {differ ? (
                <div className="ai-orig muted">AI 原讀：{aiRead}</div>
              ) : null}
            </div>
          );
        })()}

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
          <div className="hint">
            ⚐ 標籤：{item.hint.replace(/\s*\n\s*/g, " / ")}
          </div>
        ) : null}

        {item.scan_id ? (
          <div className="verdict-block">
            <div className="ask">存咗嘅值啱唔啱？</div>
            <VerdictButtons current={verdict} onVerdict={onVerdict} />
          </div>
        ) : (
          <div className="hint muted">無 scan_id，無法記錄</div>
        )}
      </div>
    </article>
  );
}
