"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { noteKey, type ReceiptField, type Verdict } from "@/lib/verdict";
import type { QueueItem } from "@/lib/display";
import type { ReceiptReviewGroup } from "@/lib/receiptQueries";
import { QueueCard } from "./QueueCard";
import { ReceiptCard } from "./ReceiptCard";
import {
  setVerdict,
  clearVerdict,
  confirmReceiptRest,
  setLineWrongFields,
} from "./actions";

// One focusable unit is bound to the successful save event shown on its card.
type Unit = {
  scanId: string;
  field: string;
  key: string;
  eventId: number;
};

const NUM_TO_VERDICT: Record<string, Verdict> = {
  "1": "correct",
  "2": "wrong",
  "3": "cannot_tell",
};

// The interactive review surface. Owns: keyboard focus across every reviewable
// unit (price cards + receipt lines), the acknowledged verdict overlay and
// server-action calls. Cards stay in place after successful persistence; errors
// preserve the previous verdict and allow retry.
export function ReviewBoard({
  items,
  receipts,
  initialVerdicts,
  initialWrongFields,
  aiResolved,
  backlog,
  nextHref,
}: {
  items: QueueItem[];
  receipts: ReceiptReviewGroup[];
  initialVerdicts: Record<string, Verdict>;
  initialWrongFields: Record<string, ReceiptField[]>;
  aiResolved: Record<string, string>;
  backlog: number; // units still waiting outside this batch
  nextHref: string;
}) {
  const [verdicts, setVerdicts] = useState<Map<string, Verdict>>(
    () => new Map(Object.entries(initialVerdicts)),
  );
  const [wrongFields, setWrongFieldsState] = useState<
    Map<string, ReceiptField[]>
  >(() => new Map(Object.entries(initialWrongFields)));
  const [focusedIdx, setFocusedIdx] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

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
      u.push({ scanId: it.scan_id, field: it.field, key, eventId: it.event_id });
    }
    for (const g of receipts) {
      for (const l of g.lines) {
        if (l.eventId == null) continue;
        lf.set(l.scanId, u.length);
        u.push({
          scanId: l.scanId,
          field: "line",
          key: noteKey(l.scanId, "line"),
          eventId: l.eventId!,
        });
      }
    }
    return { units: u, priceFocus: pf, lineFocus: lf };
  }, [items, receipts]);

  // Refs so the (mount-once) key handler always sees current units/focus.
  const unitsRef = useRef<Unit[]>(units);
  unitsRef.current = units;
  const focusRef = useRef(0);
  focusRef.current = focusedIdx;

  const persist = useCallback(async (write: () => Promise<void>, apply: () => void): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await write();
      apply();
      return true;
    } catch {
      setError("判決未儲存。請再試；如果資料已更新，請重新整理。畫面保留原有判決；請重新整理確認儲存狀態。");
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const decide = useCallback((unit: Unit, verdict: Verdict | null) => {
    const { scanId, field, key, eventId } = unit;
    return persist(
      () => verdict === null ? clearVerdict(scanId, field, eventId) : setVerdict(scanId, field, verdict, eventId),
      () => {
        setVerdicts((prev) => {
          const next = new Map(prev);
          if (verdict === null) next.delete(key); else next.set(key, verdict);
          return next;
        });
        setWrongFieldsState((prev) => { const next = new Map(prev); next.delete(key); return next; });
      },
    );
  }, [persist]);

  const blame = useCallback((unit: Unit, fields: ReceiptField[]) => {
    void persist(() => setLineWrongFields(unit.scanId, fields, unit.eventId),
      () => setWrongFieldsState((prev) => new Map(prev).set(unit.key, fields)));
  }, [persist]);

  const confirmRest = useCallback((scanIds: string[]) => {
    const events = scanIds.map((id) => unitsRef.current.find((u) => u.scanId === id && u.field === "line"));
    if (!events.length || events.some((u) => !u)) return;
    void persist(() => confirmReceiptRest(events.map((u) => ({ scan_id: u!.scanId, event_id: u!.eventId }))), () => {
      setVerdicts((prev) => {
        const next = new Map(prev);
        for (const id of scanIds) next.set(noteKey(id, "line"), "correct");
        return next;
      });
    });
  }, [persist]);

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
          const decidedIdx = focusRef.current;
          void decide(cur, NUM_TO_VERDICT[k]).then((ok) => {
            if (ok && focusRef.current === decidedIdx) moveFocus(1);
          });
        }
      } else if (k === "u") {
        e.preventDefault();
        const cur = u[focusRef.current];
        if (cur) void decide(cur, null);
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

  const unitOf = (key: string) => units.find((u) => u.key === key);
  const batchDone = !pending && units.length > 0 && decidedCount === units.length;

  return (
    <div>
      {error ? <p role="alert">{error}</p> : null}
      {pending ? <p role="status">儲存判決中…</p> : null}
      <div className="board-status">
        <span>
          今批 <b>{units.length - decidedCount}</b> 未審 · {decidedCount} 已審
          {backlog > 0 ? ` · 之後仲有 ${backlog}` : ""}
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
                disabled={pending}
                verdict={item.scan_id ? verdictOf(key) : null}
                aiResolved={aiResolved[key] ?? null}
                focused={focusId !== undefined && focusId === focusedIdx}
                focusId={focusId}
                onFocus={() => focusId !== undefined && setFocusedIdx(focusId)}
                onVerdict={(v) => {
                  const u = unitOf(key);
                  if (u) void decide(u, v);
                }}
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
              disabled={pending}
              verdicts={verdicts}
              focusedIdx={focusedIdx}
              lineFocus={lineFocus}
              onFocusLine={(scanId) => {
                const idx = lineFocus.get(scanId);
                if (idx !== undefined) setFocusedIdx(idx);
              }}
              onVerdictLine={(scanId, v) => {
                const u = unitOf(noteKey(scanId, "line"));
                if (u) void decide(u, v);
              }}
              wrongFields={wrongFields}
              onBlame={(scanId, fields) => {
                const u = unitOf(noteKey(scanId, "line"));
                if (u) blame(u, fields);
              }}
              onConfirmRest={confirmRest}
            />
          ))}
        </div>
      ) : null}

      {batchDone ? (
        <div className="batch-done">
          {backlog > 0 ? (
            <>
              ✅ 今批完成。 <a href={nextHref}>下一批 →</a>
            </>
          ) : (
            "🎉 全部審完。"
          )}
        </div>
      ) : null}
    </div>
  );
}
