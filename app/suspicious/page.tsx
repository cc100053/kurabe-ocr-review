import { getSuspicious } from "@/lib/queries";

export const dynamic = "force-dynamic";

const FIELDS = ["all", "category", "grams", "price", "discount"] as const;

// Higher-risk flags to surface first (price/tax/food per the review doc).
const HIGH_RISK = new Set([
  "bundle_price_detected",
  "single_item_price_missing",
  "tax_inclusive_exclusive_conflict",
  "price_outlier_vs_visible_candidates",
  "food_tax_risk",
]);

function flags(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  return [];
}

export default async function SuspiciousPage({
  searchParams,
}: {
  searchParams: Promise<{ field?: string }>;
}) {
  const { field = "all" } = await searchParams;
  const all = await getSuspicious();
  const rows = field === "all" ? all : all.filter((r) => r.field_name === field);

  return (
    <main>
      <h1>Suspicious untouched</h1>
      <p className="subtitle">
        Guard raised a risk flag, but the user never changed the field and it was
        saved as-is. These are the &quot;maybe wrong, never corrected&quot; blind
        spots. <span className="badge danger">HIGH</span> marks price/tax/food
        risk.
      </p>

      <div className="filters">
        {FIELDS.map((f) => (
          <a key={f} href={`/suspicious?field=${f}`} className={f === field ? "active" : ""}>
            {f}
          </a>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="empty">No suspicious untouched cases.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Product</th>
              <th>Field</th>
              <th>AI</th>
              <th>Guarded</th>
              <th>Saved</th>
              <th>Risk flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const fl = flags(r.risk_flags);
              const high = fl.some((f) => HIGH_RISK.has(f));
              return (
                <tr key={i}>
                  <td className="mono">{new Date(r.occurred_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td>{r.product_name ?? "—"}</td>
                  <td>{r.field_name}</td>
                  <td className="mono">{r.ai_value ?? "∅"}</td>
                  <td className="mono">{r.guarded_value ?? "∅"}</td>
                  <td className="mono">{r.saved_value ?? "∅"}</td>
                  <td>
                    {high ? <span className="badge danger">HIGH</span> : null}{" "}
                    <span className="mono">{fl.join(", ")}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
