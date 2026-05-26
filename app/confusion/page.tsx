import { getConfusion, isUpgradeCandidate } from "@/lib/queries";

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
  const all = await getConfusion();
  const rows = field === "all" ? all : all.filter((r) => r.field_name === field);

  return (
    <main>
      <h1>Confusion summary</h1>
      <p className="subtitle">
        AI value vs final saved value. Sorted by how often the pair was
        corrected. <span className="badge flag">UPGRADE</span> = recurred ≥3× in
        the last 7 days → consider a deterministic guard / prompt fix.
      </p>

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
              <th>Corrected</th>
              <th>Samples</th>
              <th>Rate</th>
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
                <td>{r.corrected_count}</td>
                <td>{r.sample_count}</td>
                <td>{pct(r.correction_rate)}</td>
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
