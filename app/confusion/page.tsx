import { getConfusion, getFieldOverview, isUpgradeCandidate } from "@/lib/queries";

export const dynamic = "force-dynamic";

const FIELDS = ["all", "category", "grams", "price", "discount"] as const;

function pct(rate: number | null): string {
  if (rate == null) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function ConfusionPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>;
}) {
  const { field = "all" } = await searchParams;
  const [overview, all] = await Promise.all([getFieldOverview(), getConfusion()]);
  const rows = field === "all" ? all : all.filter((r) => r.field_name === field);
  const sortedOverview = [...overview].sort(
    (a, b) => (b.correction_rate ?? 0) - (a.correction_rate ?? 0),
  );

  return (
    <main>
      <h1>Confusion summary</h1>
      <p className="subtitle">
        Which field is worst (top), then the specific recurring AI→saved pairs
        (bottom). <span className="badge flag">UPGRADE</span> = the pair recurred
        ≥3× in the last 7 days → consider a deterministic guard / prompt fix.
      </p>

      <h2 style={{ fontSize: 15, margin: "8px 0" }}>Per-field correction rate</h2>
      <table style={{ marginBottom: 28 }}>
        <thead>
          <tr>
            <th>Field</th>
            <th>Rate (all)</th>
            <th>Corrected / total</th>
            <th>Rate (7d)</th>
            <th>7d</th>
            <th>30d</th>
          </tr>
        </thead>
        <tbody>
          {sortedOverview.map((o) => (
            <tr key={o.field_name}>
              <td>{o.field_name}</td>
              <td>{pct(o.correction_rate)}</td>
              <td className="mono">{o.corrected} / {o.total}</td>
              <td>{pct(o.correction_rate_7d)}</td>
              <td className="mono">{o.corrected_7d} / {o.total_7d}</td>
              <td className="mono">{o.corrected_30d} / {o.total_30d}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ fontSize: 15, margin: "8px 0" }}>Recurring confusion pairs</h2>
      <div className="filters">
        {FIELDS.map((f) => (
          <a key={f} href={`/confusion?field=${f}`} className={f === field ? "active" : ""}>
            {f}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">No corrections recorded.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>AI value</th>
              <th>Saved value</th>
              <th>Total</th>
              <th>7d</th>
              <th>30d</th>
              <th>Last seen</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.field_name}</td>
                <td className="mono">{r.ai_value ?? "∅"}</td>
                <td className="mono">{r.saved_value ?? "∅"}</td>
                <td>{r.sample_count}</td>
                <td className="mono">{r.count_7d}</td>
                <td className="mono">{r.count_30d}</td>
                <td className="mono">{new Date(r.last_seen_at).toISOString().slice(0, 10)}</td>
                <td>{isUpgradeCandidate(r) ? <span className="badge flag">UPGRADE</span> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
