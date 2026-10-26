import {
  fieldLabel,
  riskReasons,
  isPriceField,
  taxBasisFromEvidence,
  savedTaxLabel,
  type QueueItem,
} from "@/lib/display";
import type { Verdict } from "@/lib/verdict";
import { VerdictButtons } from "./VerdictButtons";
import { MagnifiedPhoto } from "./MagnifiedPhoto";

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
        <MagnifiedPhoto src={item.image_url} alt={`${item.product_name ?? "商品"} 價牌照片`} className="queue-photo" />
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
            {item.source === "corrected" ? "輸入曾改動" : "未改動"}
          </span>
        </div>

        {(() => {
          // Judge the successful-save snapshot, not an intermediate edit.
          // Price is the pre-discount input, not the app's tax-included total.
          const final =
            item.saved_value && item.saved_value !== "" ? item.saved_value : "∅";
          const aiRead = item.ai_value || "∅";
          const differ = (item.saved_value ?? "") !== item.ai_value;
          // 含稅/不含稅 of the saved price; the tag's own cue is shown only
          // when it conflicts or the saved mode is unknown (older apps).
          const saved = isPriceField(item.field)
            ? savedTaxLabel(item.saved_tax_mode, item.saved_tax_rate)
            : null;
          const cue = isPriceField(item.field)
            ? taxBasisFromEvidence(item.hint)
            : null;
          return (
            <div className="vals">
              <div className="final-val">
                {isPriceField(item.field) ? "儲存時輸入價" : "儲存時"}：<b>{final}</b>
                {saved ? <span className="tax-tag">{saved}</span> : null}
                {item.self_checked ? (
                  <span className="tax-tag">✓ 牌上本体同税込數字一致</span>
                ) : cue && cue.mode !== item.saved_tax_mode ? (
                  <span className={`tax-tag${saved || cue.conflict ? " conflict" : ""}`}>
                    {cue.label}
                  </span>
                ) : null}
              </div>
              {isPriceField(item.field) ? (
                <div className="muted">折扣前輸入價；App 顯示含稅、折扣後總價。</div>
              ) : null}
              {differ ? (
                <div className="ai-orig muted">AI 原讀：{aiRead}</div>
              ) : null}
            </div>
          );
        })()}

        {item.risk_flags.length > 0 && !item.self_checked ? (
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
