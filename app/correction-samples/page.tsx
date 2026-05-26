import { getCorrectionSamples } from "@/lib/queries";

export const dynamic = "force-dynamic";

const FIELDS = ["all", "category", "grams", "original_price", "discount"] as const;

function fmt(v: unknown): string {
  if (v == null) return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default async function CorrectionSamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>;
}) {
  const { field = "all" } = await searchParams;
  const rows = await getCorrectionSamples(field === "all" ? undefined : field);

  return (
    <main>
      <h1>Correction samples</h1>
      <p className="subtitle">
        Raw <code>scan_field_user_changed</code> events (latest 200). Note: this
        only captures cases where AI supplied a value and the user overrode it —
        &quot;AI=∅ → user filled&quot; corrections live in Confusion, not here.
      </p>

      <div className="filters">
        {FIELDS.map((f) => (
          <a key={f} href={`/correction-samples?field=${f}`} className={f === field ? "active" : ""}>
            {f}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">No user-change events.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Product</th>
              <th>Field</th>
              <th>AI</th>
              <th>Guarded</th>
              <th>Current</th>
              <th>Guard action</th>
              <th>Guard reason</th>
              <th>Risk flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="mono">{new Date(r.occurred_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{r.product_name ?? "—"}</td>
                <td>{r.field_name}</td>
                <td className="mono">{fmt(r.ai_value)}</td>
                <td className="mono">{fmt(r.guarded_value)}</td>
                <td className="mono">{fmt(r.current_value)}</td>
                <td>{r.guard_action ?? "—"}</td>
                <td>{r.guard_reason ?? "—"}</td>
                <td className="mono">{fmt(r.risk_flags)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
