import Link from "next/link";
import { MagnifiedPhoto } from "../MagnifiedPhoto";
import { getProductIdentityReviews } from "@/lib/productIdentity";
import { recordFields, representativeRecord } from "@/lib/productReview";
import { queueIdentityPairs, reviewIdentityPair, undoIdentityPair, correctIdentityRecord } from "./actions";

export const dynamic = "force-dynamic";
const verdictLabels: Record<string, string> = { same: "同款", different: "不同商品", same_series: "同系列、不同規格", cannot_tell: "無法確認" };
const confidenceLabels: Record<string, string> = { high: "高", medium: "中", low: "低" };
const reasonLabels: Record<string, string> = { "Shared JAN": "JAN 相同", "Shared brand/base": "品牌及品名相同", "Similar names": "名稱相似", "User declined same-product suggestion": "使用者否決同款建議" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ view?: string; error?: string }> }) {
  const params = await searchParams;
  const done = params.view === "done";
  const reviews = await getProductIdentityReviews(done);
  return <>
    <h1>同款商品審查</h1>
    {params.error && <p role="alert" style={{ color: "#b42318" }}>{params.error}</p>}
    <p>你可直接審查，不需填姓名或理由；系統自動保留決定、修改及撤銷紀錄。AI 照片建議只供參考。完全同款才合併；容量、款式或 JAN 有衝突時先核實資料。同一系列但容量或包裝唔同（例如 700ml 補充裝對 1250ml 樽裝）揀「同系列、不同規格」：只會記錄，唔會合併。</p>
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
      <Link href="/products">待審</Link><Link href="/products?view=done">已審 / 撤銷</Link>
      <form action={queueIdentityPairs}><button>整理候選（最多 20 組）</button></form>
    </div>
    {!reviews.length && <p>暫無{done ? "已審" : "待審"}商品組合。</p>}
    {reviews.map((q) => <article key={q.id} className="identity-review" style={{ overflowWrap: "anywhere", border: "1px solid #ccc", borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <h2>#{q.id} · {reasonLabels[q.reason] ?? q.reason}</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))", gap: 20 }}>
        {q.sides.map((p) => {
          const target = representativeRecord(p.records, p.image_url);
          return <section key={p.id}>
          <h3>{p.display_name}</h3><p>商品 ID {p.id}{p.merged_into ? ` → ${p.merged_into}` : ""}</p>
          <p><strong>此相目標：{target?.product_name ?? "商品代表照片（下方未有對應記錄）"}</strong></p>
          {p.image_url ? <MagnifiedPhoto src={p.image_url} alt={`${p.display_name} 原始價牌照片`} /> : <p>缺少單商品照片，無法從照片確認。</p>}
          <p className="muted">相中可能有多件商品，請用目標名稱、容量及價格對照價牌；未保存目標位置，不能自動框選。</p>
          {p.records.map((r) => <details key={r.id} open={r.id === (target ?? p.records[0])?.id} className="identity-record">
            <summary>記錄 #{r.id} · {r.product_name} · {r.size_value == null ? "容量未保存" : `${r.size_value}${r.size_unit ?? ""}`} · {r.price == null ? "價格未保存" : `¥${r.price.toLocaleString("ja-JP")}`}</summary>
            <p><strong>本記錄目標商品：{r.product_name}</strong></p>
            {r.image_url && r.image_url !== p.image_url && <MagnifiedPhoto src={r.image_url} alt={`記錄 ${r.id}：${r.product_name} 的原始照片`} />}
            {!r.image_url && <p>本記錄未保存照片，不能用上方代表相核實這筆資料。</p>}
            <p className="muted">目前保存資料（可能經使用者或審查人修正）</p>
            <table aria-label={`記錄 ${r.id} 保存資料`}><tbody>{recordFields(r).map(([label, value]) => <tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}</tbody></table>
            <p className="muted">原 AI 讀取：未保留可核實的掃描連結，不能以保存值代替。</p>
            {!q.verdict && r.image_url && <details style={{ marginTop: 8 }}>
              <summary>核實 / 修正此記錄身份欄位</summary>
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
        </section>;
        })}
      </div>
      {q.ai_assessment ? <section style={{ background: "var(--panel)", border: "1px solid var(--border)", padding: 12, borderRadius: 8 }}>
        <strong>AI 建議：{verdictLabels[q.ai_assessment.judgement] ?? q.ai_assessment.judgement} · 信心{confidenceLabels[q.ai_assessment.confidence] ?? q.ai_assessment.confidence}</strong>
        <p>{q.ai_assessment.reason}</p>
        <p>左相證據：{q.ai_assessment.visible_evidence?.left || "不足"}<br />右相證據：{q.ai_assessment.visible_evidence?.right || "不足"}</p>
        {!!q.ai_assessment.conflicts?.length && <p>衝突：{q.ai_assessment.conflicts.join("；")}</p>}
        {Array.isArray(q.ai_assessment.data_conflicts) && !!q.ai_assessment.data_conflicts.length && <p>資料衝突（合併前需核實）：{q.ai_assessment.data_conflicts.join("；")}</p>}
        <small>{q.ai_assessment.assessor} · {q.ai_assessment.assessed_at}</small>
      </section> : <p>等待每週 AI 照片評估。可先由人手審查。</p>}
      {q.verdict ? <>
        <p><strong>審查：{verdictLabels[q.verdict] ?? q.verdict}</strong> · {q.reviewed_by}<br />{q.evidence}</p>
        <form action={undoIdentityPair} style={{ display: "flex", gap: 12 }}>
          <input type="hidden" name="id" value={q.id} />
          <button>撤銷此決定</button>
        </form>
      </> : <form action={reviewIdentityPair} style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <input type="hidden" name="id" value={q.id} />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button name="verdict" value="different">不同商品</button>
          <button name="verdict" value="same_series">同系列、不同規格</button>
          <button name="verdict" value="cannot_tell">無法確認</button>
          <button name="verdict" value="same" disabled={q.sides.some((p) => !p.image_url)}>完全同款 → 合併</button>
        </div>
      </form>}
      <details style={{ marginTop: 16 }}><summary>審查紀錄</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify((q.history ?? []).map((h: Record<string, unknown>) => ({ action: h.action, reviewer: h.reviewer, at: h.at, evidence: h.evidence, record_id: h.record_id, before: h.before, after: h.after })), null, 2)}</pre></details>
    </article>)}
  </>;
}
