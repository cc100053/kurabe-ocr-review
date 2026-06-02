import { setVerdict } from "./actions";
import type { Verdict } from "@/lib/notes";

// One-tap verdict: ✓ correct / ✗ wrong / 🤷 can't tell. Three submit buttons
// in one server-action form (no client JS); the chosen button's value rides
// along as `verdict`. The current verdict (if any) is highlighted.
export function VerdictButtons({
  scanId,
  field,
  current,
}: {
  scanId: string;
  field: string;
  current: Verdict | null;
}) {
  return (
    <form action={setVerdict} className="verdict">
      <input type="hidden" name="scan_id" value={scanId} />
      <input type="hidden" name="field" value={field} />
      <button
        type="submit"
        name="verdict"
        value="correct"
        className={`v v-ok${current === "correct" ? " on" : ""}`}
      >
        ✓ 啱
      </button>
      <button
        type="submit"
        name="verdict"
        value="wrong"
        className={`v v-bad${current === "wrong" ? " on" : ""}`}
      >
        ✗ 錯
      </button>
      <button
        type="submit"
        name="verdict"
        value="cannot_tell"
        className={`v v-idk${current === "cannot_tell" ? " on" : ""}`}
      >
        🤷 睇唔到
      </button>
    </form>
  );
}
