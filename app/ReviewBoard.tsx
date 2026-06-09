"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { noteKey, type Verdict } from "@/lib/verdict";
import type { QueueItem } from "@/lib/display";
import type { ReceiptReviewGroup } from "@/lib/receiptQueries";
import { QueueCard } from "./QueueCard";
import { ReceiptCard } from "./ReceiptCard";
import { setVerdict, clearVerdict, confirmReceiptRest } from "./actions";

// A focusable review unit: one price card, or one receipt line.
type Unit = { scanId: string; field: string; key: string };

const NUM_TO_VERDICT: Record<string, Verdict> = {
  "1": "correct",
  "2": "wrong",
  "3": "cannot_tell",
};

// The interactive review surface. Owns: keyboard focus across every reviewable
// unit (price cards + receipt lines), the live verdict overlay, and the
// server-action calls. Verdicts apply optimistically and DON'T trigger a refetch
// (cards stay put for fast keyboard review); persistence happens server-side and
// real state refreshes on the next navigation (pages are force-dynamic).
export function ReviewBoard({
  items,
  receipts,
  initialVerdicts,
  aiResolved,
}: {
  items: QueueItem[];
  receipts: ReceiptReviewGroup[];
  initialVerdicts: Record<string, Verdict>;
  aiResolved: Record<string, string>;
}) {
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(
    () => new Map(Object.entries(initialVerdicts)),
  );
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [, startTransition] = useTransition();

  // Flat, ordered list of focusable units + the focus-index assigned to each
  // rendered element (price cards first, then receipt lines). Items with no
  // scan_id aren't actionable, so they get no focus id.
  const { units, priceFocus, lineFocus } = useMemo(() => {
    const u: Unit[] = [];
    const pf = new Map<string, number>();
    const lf = new Map<string, number>();
    for (const it of items) {
      if (!it.scan_id) continue;
      const key = noteKey(it.scan_id, it.field);
      pf.set(key, u.length);
      u.push({ scanId: it.scan_id, field: it.field, key });
    }
    for (const g of receipts) {
      for (const l of g.lines) {
        lf.set(l.scanId, u.length);
        u.push({ scanId: l.scanId, field: "line", key: noteKey(l.scanId, "line") });
      }
    }
    return { units: u, priceFocus: pf, lineFocus: lf };
  }, [items, receipts]);

  // Refs so the (mount-once) key handler always sees current units/focus.
  const unitsRef = useRef<Unit[]>(units);
  unitsRef.current = units;
  const focusRef = useRef(0);
  focusRef.current = focusedIdx;

  const decide = useCallback(
    (scanId: string, field: string, verdict: Verdict | null) => {
      const key = noteKey(scanId, field);
      setVerdicts((prev) => {
        const next = new Map(prev);
        if (verdict === null) next.delete(key);
        else next.set(key, verdict);
        return next;
      });
      startTransition(async () => {
        if (verdict === null) await clearVerdict(scanId, field);
        else await setVerdict(scanId, field, verdict);
      });
    },
    [],
  );

  const confirmRest = useCallback((scanIds: string[]) => {
    if (scanIds.length === 0) return;
    setVerdicts((prev) => {
      const next = new Map(prev);
      for (const id of scanIds) next.set(noteKey(id, "line"), "correct");
      return next;
    });
    startTransition(async () => {
      await confirmReceiptRest(scanIds);
    });
  }, []);

  const moveFocus = useCallback((delta: number) => {
    setFocusedIdx((i) => {
      const n = unitsRef.current.length;
      if (n === 0) return 0;
      return Math.max(0, Math.min(n - 1, i + delta));
    });
  }, []);

  // Keyboard: J/K or ↓/↑ move focus, 1/2/3 verdict the focused unit (then
  // advance), U undoes it. Ignored while typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.metaKey || e.ctrlKey) return;
      const u = unitsRef.current;
      if (u.length === 0) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus(1);
      } else if (k === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus(-1);
      } else if (NUM_TO_VERDICT[k]) {
        e.preventDefault();
        const cur = u[focusRef.current];
        if (cur) {
          decide(cur.scanId, cur.field, NUM_TO_VERDICT[k]);
          moveFocus(1);
        }
      } else if (k === "u") {
        e.preventDefault();
        const cur = u[focusRef.current];
        if (cur) decide(cur.scanId, cur.field, null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, moveFocus]);

  // Keep the focused element in view as the cursor marches down a long list.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document
      .querySelector(`[data-focus="${focusedIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  const verdictOf = (key: string): Verdict | null => verdicts.get(key) ?? null;
  const decidedCount = useMemo(
    () => units.reduce((n, u) => (verdicts.get(u.key) ? n + 1 : n), 0),
    [units, verdicts],
  );

  if (units.length === 0 && items.length === 0 && receipts.length === 0) {
    return null; // page shows its own empty state
  }

  return (
    <div>
      <div className="board-status">
        <span>
          <b>{units.length - decidedCount}</b> 未審 · {decidedCount} 已審
        </span>
        <span className="kbd-hints">
          <kbd>1</kbd>啱 <kbd>2</kbd>錯 <kbd>3</kbd>睇唔到 · <kbd>J</kbd>/
          <kbd>K</kbd> 移動 · <kbd>U</kbd> 復原
        </span>
      </div>

      {items.length > 0 ? (
        <div className="cards">
          {items.map((item, i) => {
            const key = item.scan_id ? noteKey(item.scan_id, item.field) : `na-${i}`;
            const focusId = item.scan_id ? priceFocus.get(key) : undefined;
            return (
              <QueueCard
                key={`${key}-${i}`}
                item={item}
                verdict={item.scan_id ? verdictOf(key) : null}
                aiResolved={aiResolved[key] ?? null}
                focused={focusId !== undefined && focusId === focusedIdx}
                focusId={focusId}
                onFocus={() => focusId !== undefined && setFocusedIdx(focusId)}
                onVerdict={(v) =>
                  item.scan_id && decide(item.scan_id, item.field, v)
                }
              />
            );
          })}
        </div>
      ) : null}

      {receipts.length > 0 ? (
        <div className="receipts">
          {receipts.map((g) => (
            <ReceiptCard
              key={g.baseScanId}
              group={g}
              verdicts={verdicts}
              focusedIdx={focusedIdx}
              lineFocus={lineFocus}
              onFocusLine={(scanId) => {
                const idx = lineFocus.get(scanId);
                if (idx !== undefined) setFocusedIdx(idx);
              }}
              onVerdictLine={(scanId, v) => decide(scanId, "line", v)}
              onConfirmRest={confirmRest}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
