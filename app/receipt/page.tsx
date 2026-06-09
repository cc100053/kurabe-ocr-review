import {
  getReceiptConfusion,
  getReceiptCorrectionSamples,
  rollupFieldOverview,
  recurringConfusion,
  changedFieldNames,
  receiptFieldLabel,
  type ReceiptCorrectionSample,
} from "@/lib/receiptQueries";

export const dynamic = "force-dynamic";

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function fmt(v: unknown): string {
  if (v == null || v === "") return "∅";
  return String(v);
}

// Pull a field's {ai, saved} pair off a sample for inline display.
function pair(
  sample: ReceiptCorrectionSample,
  field: string,
): { ai: unknown; saved: unknown } {
  const cell = (sample as unknown as Record<string, { ai?: unknown; saved?: unknown } | null>)[
    field
  ];
  return { ai: cell?.ai, saved: cell?.saved };
}

function when(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

// Receipt-scan review: receipts have no guard pass and no per-line photo, so
// there is nothing for a human to eyeball case-by-case the way the price-tag
// queue needs. It is all statistical — which field the AI mis-reads off a
// receipt, and concrete corrected lines — so this page mirrors /stats.
export default async function ReceiptStats() {
  const confusion = await getReceiptConfusion();
  const samples = await getReceiptCorrectionSamples();
  const overview = rollupFieldOverview(confusion);
  const recurring = recurringConfusion(confusion);

  const hasData = confusion.length > 0 || samples.length > 0;

  return (
    <main>
      <h1>收據掃描</h1>
      <p className="subtitle">
        呢度係收據嘅統計:邊個欄位 AI 讀收據最易錯,同埋實際俾用戶改過嘅例子(交俾
        AI 讀去改 receipt prompt)。逐張收據對住相、逐行肉眼審而家喺
        <a href="/?source=receipt">「審查佇列 → 收據」</a>。
      </p>

      {!hasData ? (
        <p className="empty">
          仲未有收據掃描資料。用戶開始用「レシート」掃描並儲存後,
          呢度就會有數。
        </p>
      ) : (
        <>
          <h2 className="section">各欄位修正率</h2>
          <table style={{ marginBottom: 28 }}>
            <thead>
              <tr>
                <th>欄位</th>
                <th>修正率</th>
                <th>已改 / 總數</th>
              </tr>
            </thead>
            <tbody>
              {overview.map((o) => (
                <tr key={o.field_name}>
                  <td>{receiptFieldLabel(o.field_name)}</td>
                  <td>
                    <b>{pct(o.correction_rate)}</b>
                  </td>
                  <td className="mono">
                    {o.corrected} / {o.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="section">一直重複嘅錯誤（AI 讀 → 正確值）</h2>
          {recurring.length === 0 ? (
            <p className="empty">暫時冇重複出現嘅錯誤。</p>
          ) : (
            <table style={{ marginBottom: 28 }}>
              <thead>
                <tr>
                  <th>欄位</th>
                  <th>AI 讀</th>
                  <th>正確值</th>
                  <th>改咗次數</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recurring.map((r, i) => (
                  <tr key={i}>
                    <td>{receiptFieldLabel(r.field_name)}</td>
                    <td className="mono">{fmt(r.ai_value)}</td>
                    <td className="mono">{fmt(r.saved_value)}</td>
                    <td className="mono">{r.corrected_count}</td>
                    <td>
                      {r.corrected_count >= 3 ? (
                        <span className="badge flag">要修</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2 className="section">用戶改過嘅收據行</h2>
          {samples.length === 0 ? (
            <p className="empty">未有俾用戶改過嘅行。</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>時間</th>
                  <th>商品（最終）</th>
                  <th>改咗嘅欄位</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s, i) => {
                  const changed = changedFieldNames(s.changed_fields);
                  return (
                    <tr key={i}>
                      <td className="mono muted">{when(s.occurred_at)}</td>
                      <td>{s.product_name ?? "—"}</td>
                      <td>
                        {changed.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          changed.map((f) => {
                            const { ai, saved } = pair(s, f);
                            return (
                              <div key={f} style={{ marginBottom: 2 }}>
                                <span className="field-chip">
                                  {receiptFieldLabel(f)}
                                </span>{" "}
                                <span className="mono muted">{fmt(ai)}</span>
                                {" → "}
                                <span className="mono">{fmt(saved)}</span>
                              </div>
                            );
                          })
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
