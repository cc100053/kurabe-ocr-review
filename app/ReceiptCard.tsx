import { receiptFieldLabel } from "@/lib/display";
import type {
  ReceiptReviewGroup,
  ReceiptReviewLine,
} from "@/lib/receiptQueries";
import { noteKey, type Verdict } from "@/lib/verdict";
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

// One receipt = one photo + every saved line. The reviewer eyeballs the image
// once and judges each line; "其餘全部 ✓" confirms all still-unjudged lines at
// once (assume-good, flag-exceptions). A line's verdict id is its per-line
// scan_id with field "line".
export function ReceiptCard({
  group,
  verdicts,
  focusedIdx,
  lineFocus,
  onFocusLine,
  onVerdictLine,
  onConfirmRest,
}: {
  group: ReceiptReviewGroup;
  verdicts: Map<string, Verdict>;
  focusedIdx: number;
  lineFocus: Map<string, number>;
  onFocusLine: (scanId: string) => void;
  onVerdictLine: (scanId: string, verdict: Verdict | null) => void;
  onConfirmRest: (scanIds: string[]) => void;
}) {
  const verdictOf = (line: ReceiptReviewLine): Verdict | null =>
    verdicts.get(noteKey(line.scanId, "line")) ?? null;

  const unjudged = group.lines.filter((l) => verdictOf(l) === null);
  const doneCount = group.lines.length - unjudged.length;

  return (
    <article className="receipt-card">
      <div className="receipt-img">
        {group.imageUrl ? (
          <a href={group.imageUrl} target="_blank" rel="noreferrer" title="開大圖">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={group.imageUrl} alt="receipt" loading="lazy" />
          </a>
        ) : (
          <div className="card-img no-img">無相</div>
        )}
      </div>

      <div className="receipt-body">
        <div className="receipt-head">
          <span className="product">{group.storeName ?? "（無店名）"}</span>
          <span className="src">
            {doneCount}/{group.lines.length} 已審
          </span>
          {unjudged.length > 0 ? (
            <button
              type="button"
              className="confirm-rest"
              onClick={() => onConfirmRest(unjudged.map((l) => l.scanId))}
              title="其餘未審嘅行全部標 ✓"
            >
              其餘全部 ✓
            </button>
          ) : (
            <span className="badge ok">全部已審</span>
          )}
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
              >
                <span className="rline-idx mono muted">
                  {line.lineIndex + 1}
                </span>
                <div className="rline-main">
                  <div className="rline-name">
                    {line.productName ?? fmt(line.name.saved)}
                    {line.changed.length > 0 ? (
                      <span className="badge warn rline-edited">
                        改咗{line.changed.map(receiptFieldLabel).join("・")}
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
                    <span className="field-chip sm">價</span> ¥<Cell pair={line.price} />
                    {"　"}
                    <span className="rline-tax">{taxTag(line.taxBasis.saved)}</span>
                  </div>
                </div>
                <VerdictButtons
                  current={v}
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
