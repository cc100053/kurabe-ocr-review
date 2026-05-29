import { getCorrectionSamples } from "@/lib/queries";
import { getNotesMap, noteKey } from "@/lib/notes";
import { NoteForm, StatusBadge } from "../NoteForm";
import { ScanThumb } from "../ScanThumb";

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
  const [rows, notes] = await Promise.all([
    getCorrectionSamples(field === "all" ? undefined : field),
    getNotesMap(),
  ]);

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
              <th>Image</th>
              <th>Product</th>
              <th>Field</th>
              <th>AI</th>
              <th>Guarded</th>
              <th>Current</th>
              <th>Guard action</th>
              <th>Risk flags</th>
              <th>Status</th>
              <th>Triage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const note =
                r.scan_id && r.field_name
                  ? notes.get(noteKey(r.scan_id, r.field_name))
                  : undefined;
              return (
                <tr key={i}>
                  <td className="mono">{new Date(r.occurred_at).toISOString().slice(0, 16).replace("T", " ")}</td>
                  <td><ScanThumb url={r.image_url} /></td>
                  <td>{r.product_name ?? "—"}</td>
                  <td>{r.field_name}</td>
                  <td className="mono">{fmt(r.ai_value)}</td>
                  <td className="mono">{fmt(r.guarded_value)}</td>
                  <td className="mono">{fmt(r.current_value)}</td>
                  <td title={r.guard_reason ?? ""}>{r.guard_action ?? "—"}</td>
                  <td className="mono">{fmt(r.risk_flags)}</td>
                  <td><StatusBadge note={note} /></td>
                  <td>
                    {r.scan_id && r.field_name ? (
                      <NoteForm scanId={r.scan_id} field={r.field_name} note={note} />
                    ) : (
                      "—"
                    )}
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
