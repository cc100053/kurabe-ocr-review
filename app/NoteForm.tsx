import { upsertReviewNote } from "./actions";
import { ReviewNote } from "@/lib/notes";

const STATUSES = ["open", "triaged", "fixed", "wontfix"] as const;
const ROOT_CAUSES = ["", "prompt", "guard", "ocr", "preference"] as const;

// Compact triage form rendered per case. Server action upsert, no client JS.
export function NoteForm({
  scanId,
  field,
  note,
}: {
  scanId: string;
  field: string;
  note?: ReviewNote;
}) {
  return (
    <form action={upsertReviewNote} className="note-form">
      <input type="hidden" name="scan_id" value={scanId} />
      <input type="hidden" name="field" value={field} />
      <select name="status" defaultValue={note?.status ?? "open"}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select name="root_cause" defaultValue={note?.root_cause ?? ""}>
        {ROOT_CAUSES.map((c) => (
          <option key={c} value={c}>
            {c === "" ? "root cause…" : c}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="linked_pr_url"
        placeholder="PR url"
        defaultValue={note?.linked_pr_url ?? ""}
      />
      <input
        type="text"
        name="note"
        placeholder="note"
        defaultValue={note?.note ?? ""}
      />
      <button type="submit">save</button>
      {note ? (
        <span className="note-saved" title={`updated ${note.updated_at}`}>
          ✓
        </span>
      ) : null}
    </form>
  );
}

// Small status badge for at-a-glance triage state.
export function StatusBadge({ note }: { note?: ReviewNote }) {
  if (!note) return <span className="badge">untracked</span>;
  const cls =
    note.status === "fixed"
      ? "badge ok"
      : note.status === "wontfix"
        ? "badge"
        : note.status === "triaged"
          ? "badge warn"
          : "badge danger";
  return <span className={cls}>{note.status}</span>;
}
