import assert from "node:assert/strict";
import { test } from "node:test";
import * as jsx from "react/jsx-runtime";
import * as verdict from "../lib/verdict.ts";
import * as display from "../lib/display.ts";
import { load } from "./load.ts";

// Execute the real board handlers with deterministic hooks/actions; browser checks cover DOM focus.
function harness() {
  const slots: any[] = []; let cursor = 0; let effects: (() => void)[] = [];
  const handlers: Record<string, (e: any) => void> = {};
  let finish: () => void = () => {}; let fail: (e: Error) => void = () => {};
  const sent: any[] = [];
  const hooks = {
    useState(init: any) { const i = cursor++; if (!(i in slots)) slots[i] = typeof init === "function" ? init() : init;
      return [slots[i], (v: any) => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; },
    useRef(v: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: v }); },
    useCallback(fn: any) { cursor++; return fn; }, useMemo(fn: () => any) { cursor++; return fn(); },
    useEffect(fn: () => void) { const i = cursor++; if (!(i in slots)) { slots[i] = true; effects.push(fn); } },
  };
  (globalThis as any).window = { addEventListener: (k: string, fn: any) => { handlers[k] = fn; }, removeEventListener() {} };
  (globalThis as any).document = { querySelector: () => null };
  const photo = { MagnifiedPhoto: () => null };
  const buttons = load("app/VerdictButtons.tsx", { "react/jsx-runtime": jsx });
  const QC = load("app/QueueCard.tsx", { "react/jsx-runtime": jsx, "@/lib/display": display,
    "./MagnifiedPhoto": photo, "./VerdictButtons": buttons }).QueueCard;
  const RC = () => null;
  const board = load("app/ReviewBoard.tsx", { react: hooks, "react/jsx-runtime": jsx, "@/lib/verdict": verdict,
    "./QueueCard": { QueueCard: QC }, "./ReceiptCard": { ReceiptCard: RC },
    "./actions": { setVerdict: (...args: any[]) => { sent.push(args); return new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; }); } },
  }).ReviewBoard;
  const props = { items: [1, 2].map((event_id) => ({ event_id, scan_id: `scan-${event_id}`, field: "price", risk_flags: [], ai_value: "100", saved_value: "100" })),
    receipts: [], initialVerdicts: {}, initialWrongFields: {}, aiResolved: {}, backlog: 1, nextHref: "/" };
  function flatten(e: any): any[] { return e == null || typeof e !== "object" ? [] : [e, ...[e.props?.children].flat(Infinity).flatMap(flatten)]; }
  function render() { cursor = 0; const result = flatten(board(props)); const run = effects; effects = []; run.forEach((fn) => fn()); return result; }
  return { render, QC, sent, flatten, handlers, finish: () => finish(), fail: () => fail(new Error("synthetic write failure")) };
}

test("DOM focus updates the shortcut target and verdict is visible only after success", async () => {
  const h = harness(); let tree = h.render();
  const second = tree.filter((e) => e.type === h.QC)[1];
  h.QC(second.props).props.onFocusCapture();
  h.render();
  h.handlers.keydown({ key: "1", target: { tagName: "BUTTON" }, preventDefault() {} });
  assert.equal(h.sent[0][0], "scan-2");
  assert.equal(h.sent[0][3], 2);
  tree = h.render();
  assert.equal(tree.filter((e) => e.type === h.QC)[1].props.verdict, null);
  assert.equal(tree.some((e) => e.props?.className === "batch-done"), false);
  h.finish(); await new Promise((r) => setImmediate(r));
  assert.equal(h.render().filter((e) => e.type === h.QC)[1].props.verdict, "correct");
});

test("failed persistence preserves verdicts, shows an error and permits retry", async () => {
  const h = harness(); let tree = h.render();
  tree.find((e) => e.type === h.QC).props.onVerdict("wrong");
  h.fail(); await new Promise((r) => setImmediate(r));
  tree = h.render();
  assert.equal(tree.find((e) => e.type === h.QC).props.verdict, null);
  assert.equal(tree.some((e) => e.props?.role === "alert"), true);
  tree.find((e) => e.type === h.QC).props.onVerdict("correct");
  assert.equal(h.sent.length, 2);
  h.finish(); await new Promise((r) => setImmediate(r));
  assert.equal(h.render().find((e) => e.type === h.QC).props.verdict, "correct");
});
