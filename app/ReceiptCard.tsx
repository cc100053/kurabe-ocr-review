import { receiptFieldLabel } from "@/lib/display";
import { MagnifiedPhoto } from "./MagnifiedPhoto";
import type {
  ReceiptReviewGroup,
  ReceiptReviewLine,
} from "@/lib/receiptQueries";
import {
  noteKey,
  RECEIPT_FIELDS,
  type ReceiptField,
  type Verdict,
} from "@/lib/verdict";
import { VerdictButtons } from "./VerdictButtons";

function fmt(v: unknown): string {
  if (v == null || v === "") return "∅";
  return String(v);
}

// Receipt tax basis → plain tag (the line stores included/excluded/unknown).
function taxTag(v: unknown): string {
  if (v === "included") return "含稅";
  if (v === "excluded") return "不含稅";
  return "稅別?";
}

// One value cell: the final saved value, with the AI's original read shown
// muted only when the user changed it.
function Cell({ pair }: { pair: { ai: unknown; saved: unknown } }) {
  const differ = fmt(pair.ai) !== fmt(pair.saved);
  return (
    <>
      <span className="mono">{fmt(pair.saved)}</span>
      {differ ? <span className="muted"> (AI:{fmt(pair.ai)})</span> : null}
    </>
  );
}

// One receipt = one photo + the saved lines that need a human eye (edited,
// memory-prefilled or low-confidence; the rest are assumed correct). The
// reviewer eyeballs the image once and judges each line; "其餘全部 ✓" confirms
// the still-unjudged lines at once (assume-good, flag-exceptions) — except
// category corrections, which become shared category memory only through their
// own per-line ✓. A ✗ line asks which fields are wrong. A line's verdict id is
// its per-line scan_id with field "line".
export function ReceiptCard({
  group,
  verdicts,
  focusedIdx,
  lineFocus,
  onFocusLine,
  onVerdictLine,
  wrongFields,
  onBlame,
  onConfirmRest,
  disabled,
}: {
  group: ReceiptReviewGroup;
  disabled: boolean;
  verdicts: Map<string, Verdict>;
  focusedIdx: number;
  lineFocus: Map<string, number>;
  onFocusLine: (scanId: string) => void;
  onVerdictLine: (scanId: string, verdict: Verdict | null) => void;
  wrongFields: Map<string, ReceiptField[]>;
  onBlame: (scanId: string, fields: ReceiptField[]) => void;
  onConfirmRest: (scanIds: string[]) => void;
}) {
  const verdictOf = (line: ReceiptReviewLine): Verdict | null =>
    verdicts.get(noteKey(line.scanId, "line")) ?? null;

  const unjudged = group.lines.filter((l) => verdictOf(l) === null);
  const doneCount = group.lines.length - unjudged.length;
  // Memory sources need their own look; bulk ✓ only covers the rest.
  const bulk = unjudged.filter((l) => !l.categoryCorrected);

  return (
    <article className="receipt-card">
      <div className="receipt-img">
        {group.imageUrl ? (
          <MagnifiedPhoto src={group.imageUrl} alt={`${group.storeName ?? "店舖"} 收據照片`} />
        ) : (
          <div className="card-img no-img">無相</div>
        )}
      </div>

      <div className="receipt-body">
        <div className="receipt-head">
          <span className="product">{group.storeName ?? "（無店名）"}</span>
          <span className="src">
            {doneCount}/{group.lines.length} 已審
            {group.skipped > 0 ? ` · 另 ${group.skipped} 行 AI 照存，默認啱` : ""}
          </span>
          {bulk.length > 0 ? (
            <button
              type="button"
              disabled={disabled}
              className="confirm-rest"
              onClick={() => onConfirmRest(bulk.map((l) => l.scanId))}
              title="其餘未審嘅行全部標 ✓（分類修正要逐行確認）"
            >
              其餘全部 ✓
            </button>
          ) : unjudged.length === 0 ? (
            <span className="badge ok">全部已審</span>
          ) : null}
        </div>

        <ul className="receipt-lines">
          {group.lines.map((line) => {
            const v = verdictOf(line);
            const focusId = lineFocus.get(line.scanId);
            const focused = focusId !== undefined && focusId === focusedIdx;
            const lowConf =
              line.confidence === "low" || line.confidence === "medium";
            return (
              <li
                key={line.scanId}
                className={`rline${v ? " decided" : ""}${focused ? " focused" : ""}`}
                data-focus={focusId}
                onMouseDown={() => onFocusLine(line.scanId)}
                onFocusCapture={() => onFocusLine(line.scanId)}
              >
                <span className="rline-idx mono muted">
                  {line.lineIndex + 1}
                </span>
                <div className="rline-main">
                  <div className="rline-name">
                    {line.productName ?? fmt(line.name.saved)}
                    {line.changed.length > 0 ? (
                      <span className="badge warn rline-edited">
                        改咗{line.changed.map((f) => receiptFieldLabel(f)).join("・")}
                      </span>
                    ) : null}
                    {line.categoryCorrected ? (
                      <span
                        className="badge warn rline-edited"
                        title="✓ 會將呢個分類加入共用分類記憶"
                      >
                        分類修正 → ✓ 即入記憶
                      </span>
                    ) : null}
                    {line.memoryApplied ? (
                      <span className="badge rline-conf" title="分類由共用記憶預填">
                        記憶預填
                      </span>
                    ) : null}
                    {lowConf ? (
                      <span className="badge rline-conf" title="AI 信心低">
                        信心{line.confidence === "low" ? "低" : "中"}
                      </span>
                    ) : null}
                  </div>
                  <div className="rline-vals muted">
                    <span className="field-chip sm">分類</span> <Cell pair={line.category} />
                    {"　"}
                    <span className="field-chip sm">輸入價</span> ¥<Cell pair={line.price} />
                    {"　"}
                    <span className="rline-tax">{taxTag(line.taxBasis.saved)}</span>
                  </div>
                  {v === "wrong" ? (
                    <div className="blame">
                      錯邊樣：
                      {RECEIPT_FIELDS.map((f) => {
                        const picked = wrongFields.get(noteKey(line.scanId, "line")) ?? [];
                        const on = picked.includes(f);
                        return (
                          <button
                            key={f}
                            type="button"
                            disabled={disabled}
                            aria-pressed={on}
                            className={on ? "on" : ""}
                            onClick={() =>
                              onBlame(
                                line.scanId,
                                on ? picked.filter((x) => x !== f) : [...picked, f],
                              )
                            }
                          >
                            {receiptFieldLabel(f)}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <VerdictButtons
                  current={v}
                  disabled={disabled}
                  compact
                  onVerdict={(verdict) => onVerdictLine(line.scanId, verdict)}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
