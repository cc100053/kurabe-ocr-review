import {
  getFieldOverview,
  getConfusion,
  fieldLabel,
  isUpgradeCandidate,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

// Compact "big picture" page: which field is worst, and which exact errors keep
// recurring. This is mostly for the AI to read off the views; kept here as a
// one-screen glance for the human. Detailed triage happens on the queue.
export default async function StatsPage() {
  const [overview, confusion] = await Promise.all([
    getFieldOverview(),
    getConfusion(),
  ]);
  const sorted = [...overview].sort(
    (a, b) => (b.correction_rate_7d ?? 0) - (a.correction_rate_7d ?? 0),
  );
  // Surface only the recurring ones — scattered one-offs are noise here.
  const recurring = confusion
    .filter((r) => r.count_7d >= 2)
    .slice(0, 12);

  return (
    <main>
      <h1>統計</h1>
      <p className="subtitle">
        邊個欄位最差、邊啲錯誤一直重複。詳細逐單交俾 AI 讀 view;
        人手逐張審喺「審查佇列」。
      </p>

      <h2 className="section">各欄位修正率(近 7 日)</h2>
      <table style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>欄位</th>
            <th>7 日修正率</th>
            <th>7 日</th>
            <th>30 日</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.field_name}>
              <td>{fieldLabel(o.field_name)}</td>
              <td>
                <b>{pct(o.correction_rate_7d)}</b>
              </td>
              <td className="mono">
                {o.corrected_7d} / {o.total_7d}
              </td>
              <td className="mono">
                {o.corrected_30d} / {o.total_30d}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="section">一直重複嘅錯誤</h2>
      {recurring.length === 0 ? (
        <p className="empty">近期冇重複出現嘅錯誤。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>欄位</th>
              <th>AI 讀</th>
              <th>正確值</th>
              <th>7 日次數</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {recurring.map((r, i) => (
              <tr key={i}>
                <td>{fieldLabel(r.field_name)}</td>
                <td className="mono">{r.ai_value ?? "∅"}</td>
                <td className="mono">{r.saved_value ?? "∅"}</td>
                <td className="mono">{r.count_7d}</td>
                <td>
                  {isUpgradeCandidate(r) ? (
                    <span className="badge flag">要修</span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
