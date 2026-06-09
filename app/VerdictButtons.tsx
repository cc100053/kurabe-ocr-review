import type { Verdict } from "@/lib/verdict";

// One-tap verdict: ✓ correct / ✗ wrong / 🤷 can't tell. Presentational — the
// click is handled by the parent review board (which also drives the same three
// choices from the keyboard 1/2/3), so there is no <form>/reload here. The
// current verdict (if any) is highlighted; `compact` shrinks it for receipt
// lines. Tapping the active verdict again clears it (toggle off).
export function VerdictButtons({
  current,
  onVerdict,
  compact = false,
}: {
  current: Verdict | null;
  onVerdict: (verdict: Verdict | null) => void;
  compact?: boolean;
}) {
  const pick = (v: Verdict) => onVerdict(current === v ? null : v);
  return (
    <div className={`verdict${compact ? " compact" : ""}`}>
      <button
        type="button"
        onClick={() => pick("correct")}
        className={`v v-ok${current === "correct" ? " on" : ""}`}
        title="啱 (1)"
      >
        ✓{compact ? "" : " 啱"}
      </button>
      <button
        type="button"
        onClick={() => pick("wrong")}
        className={`v v-bad${current === "wrong" ? " on" : ""}`}
        title="錯 (2)"
      >
        ✗{compact ? "" : " 錯"}
      </button>
      <button
        type="button"
        onClick={() => pick("cannot_tell")}
        className={`v v-idk${current === "cannot_tell" ? " on" : ""}`}
        title="睇唔到 (3)"
      >
        🤷{compact ? "" : " 睇唔到"}
      </button>
    </div>
  );
}
