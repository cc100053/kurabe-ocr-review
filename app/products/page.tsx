import { MagnifiedPhoto } from "../MagnifiedPhoto";
import { getIdentityCounts, getProductIdentityReviews } from "@/lib/productIdentity";
import { aiAgrees, comparePair, recordFields, representativeRecord } from "@/lib/productReview";
import { queueIdentityPairs, reviewIdentityPair, undoIdentityPair, correctIdentityRecord } from "./actions";

export const dynamic = "force-dynamic";
const verdictLabels: Record<string, string> = { same: "同款", different: "不同商品", same_series: "同系列、不同規格", cannot_tell: "無法確認" };
const confidenceLabels: Record<string, string> = { high: "高", medium: "中", low: "低" };
const reasonLabels: Record<string, string> = { "Shared JAN": "JAN 相同", "Shared brand/base": "品牌及品名相同", "Similar names": "名稱相似", "User declined same-product suggestion": "使用者否決同款建議" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ view?: string; error?: string }> }) {
  const params = await searchParams;
  const done = params.view === "done";
  const [reviews, counts] = await Promise.all([getProductIdentityReviews(done), getIdentityCounts()]);
  return <>
    <div className="page-head">
      <h1>同款商品審查</h1>
      <form action={queueIdentityPairs}><button className="clear-btn">整理候選（最多 20 組）</button></form>
    </div>
    <p className="subtitle">兩張相係咪完全同一件商品？睇相，再睇下面邊個欄位唔同（≠）或者冇資料（?）。只有「完全同款」會合併，可以撤銷。待審 {counts.pending} 組，其中 {counts.unassessed} 組未有 AI 建議。</p>
    {params.error && <p role="alert" style={{ color: "var(--danger)" }}>{params.error}</p>}
    <div className="filters">
      <a href="/products" className={done ? "" : "active"}>待審</a>
      <a href="/products?view=done" className={done ? "active" : ""}>已審 / 撤銷</a>
    </div>
    {!reviews.length && <p className="empty">暫無{done ? "已審" : "待審"}商品組合。</p>}
    {reviews.map((q) => {
      const ai = q.ai_assessment;
      const rows = comparePair(q.sides[0].records, q.sides[1].records);
      const hasDiff = rows.some((r) => r.state === "diff");
      return <article key={q.id} className="identity-review">
        <header className="pair-head">
          <h2>#{q.id} · {reasonLabels[q.reason] ?? q.reason}</h2>
          {ai ? <span className={`badge ${ai.judgement === "same" ? "ok" : "warn"}`}>AI：{verdictLabels[ai.judgement] ?? ai.judgement}（信心{confidenceLabels[ai.confidence] ?? ai.confidence}）</span>
            : <span className="badge">未有 AI 建議</span>}
          {q.verdict && <span className="badge ok">審查：{verdictLabels[q.verdict] ?? q.verdict} · {q.reviewed_by}</span>}
          {q.verdict && ai && <span className={`badge ${aiAgrees(ai.judgement, q.verdict) ? "ok" : "danger"}`}>{aiAgrees(ai.judgement, q.verdict) ? "AI 一致" : "AI 不一致"}</span>}
        </header>
        <div className="pair-photos">
          {q.sides.map((p) => {
            const target = representativeRecord(p.records, p.image_url);
            return <section key={p.id}>
              <h3>{target?.product_name ?? p.display_name}</h3>
              {p.image_url ? <MagnifiedPhoto src={p.image_url} alt={`${p.display_name} 原始價牌照片`} /> : <p className="muted">缺少單商品照片，無法從照片確認。</p>}
            </section>;
          })}
        </div>
        <table className="pair-diff" aria-label={`#${q.id} 欄位對照`}>
          <tbody>{rows.map((r) => <tr key={r.label} className={r.state}><th scope="row">{r.label}</th><td>{r.left}</td><td>{r.right}</td></tr>)}</tbody>
        </table>
        {ai && <details className="pair-ai">
          <summary>{ai.reason}</summary>
          <p>左相證據：{ai.visible_evidence?.left || "不足"}<br />右相證據：{ai.visible_evidence?.right || "不足"}</p>
          {!!ai.conflicts?.length && <p>衝突：{ai.conflicts.join("；")}</p>}
          {Array.isArray(ai.data_conflicts) && !!ai.data_conflicts.length && <p>資料衝突（合併前需核實）：{ai.data_conflicts.join("；")}</p>}
          <small className="muted">{ai.assessor} · {ai.assessed_at}</small>
        </details>}
        {q.verdict ? <form action={undoIdentityPair} className="pair-verdicts">
          <input type="hidden" name="id" value={q.id} />
          <button>撤銷此決定</button>
        </form> : <form className="pair-verdicts">
          <button formAction={reviewIdentityPair.bind(null, q.id, "same")} className="merge" disabled={q.sides.some((p) => !p.image_url)}>完全同款 → 合併</button>
          <button formAction={reviewIdentityPair.bind(null, q.id, "same_series")}>同系列、不同規格</button>
          <button formAction={reviewIdentityPair.bind(null, q.id, "different")}>不同商品</button>
          <button formAction={reviewIdentityPair.bind(null, q.id, "cannot_tell")}>無法確認</button>
          {hasDiff && <span className="muted">有欄位唔同（≠）：合併會被拒絕，如果係讀錯請先喺下面修正。</span>}
        </form>}
        <details className="pair-more">
          <summary>每筆記錄 / 修正身份欄位 / 審查紀錄</summary>
          <p className="muted">保存資料可能經使用者或審查人修正；原 AI 讀取未保留可核實的掃描連結。相中可能有多件商品，請用名稱、容量及價格對照價牌。</p>
          <div className="pair-photos">
            {q.sides.map((p) => <section key={p.id}>
              <p className="muted">商品 ID {p.id}{p.merged_into ? ` → ${p.merged_into}` : ""} · {p.display_name}</p>
              {p.records.map((r) => <details key={r.id} className="identity-record">
                <summary>記錄 #{r.id} · {r.product_name} · {r.size_value == null ? "容量未保存" : `${r.size_value}${r.size_unit ?? ""}`} · {r.price == null ? "價格未保存" : `¥${r.price.toLocaleString("ja-JP")}`}</summary>
                {r.image_url && r.image_url !== p.image_url && <MagnifiedPhoto src={r.image_url} alt={`記錄 ${r.id}：${r.product_name} 的原始照片`} />}
                {!r.image_url && <p>本記錄未保存照片，不能用上方代表相核實這筆資料。</p>}
                <table aria-label={`記錄 ${r.id} 保存資料`}><tbody>{recordFields(r).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table>
                {!q.verdict && r.image_url && <details style={{ marginTop: 8 }}>
                  <summary>修正此記錄身份欄位</summary>
                  <p><a href={r.image_url} target="_blank" rel="noreferrer">先查看此記錄的原始照片</a>。只修正相中可確認的身份資料；名稱、價格及比較重量保持原樣。</p>
                  <form action={correctIdentityRecord} style={{ display: "grid", gap: 8 }}>
                    <input type="hidden" name="review_id" value={q.id} />
                    <input type="hidden" name="record_id" value={r.id} />
                    <input type="hidden" name="photo_url" value={r.image_url} />
                    {[["brand", "品牌", r.brand], ["base_product", "品名", r.base_product], ["variant", "變體 / 口味", r.variant], ["size_value", "容量數值", r.size_value], ["size_unit", "容量單位（g / ml / ct 等）", r.size_unit], ["jan_code", "JAN", r.jan_code]].map(([field, label, value]) =>
                      <label key={String(field)}>{label}<input style={{ width: "100%", boxSizing: "border-box" }} name={String(field)} defaultValue={value ?? ""} maxLength={200} /></label>)}
                    <button>儲存身份修正（保留審查紀錄）</button>
                  </form>
                </details>}
              </details>)}
            </section>)}
          </div>
          {q.verdict && q.evidence && <p className="muted">{q.evidence}</p>}
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify((q.history ?? []).map((h: Record<string, unknown>) => ({ action: h.action, reviewer: h.reviewer, at: h.at, evidence: h.evidence, record_id: h.record_id, before: h.before, after: h.after })), null, 2)}</pre>
        </details>
      </article>;
    })}
  </>;
}
