import assert from "node:assert/strict";
import { test } from "node:test";
import * as verdict from "../lib/verdict.ts";
import { load } from "./load.ts";

function actions(error: unknown = null) {
  const calls: any[] = [];
  const db = { rpc: async (...args: any[]) => { calls.push(args); return { data: null, error }; },
    from() { throw new Error("verdicts must never perform separate table writes"); } };
  return { calls, api: load("app/actions.ts", { "next/cache": {}, "@/lib/notes": verdict,
    "@/lib/supabase": { getSupabaseAdmin: () => db } }) };
}

test("verdict, undo and wrong fields use one atomic event-bound RPC each", async () => {
  const { calls, api } = actions();
  await api.setVerdict("receipt#0", "line", "correct", 12);
  await api.clearVerdict("receipt#0", "line", 12);
  await api.setLineWrongFields("receipt#0", ["price", "category"], 12);
  assert.deepEqual(calls.map(([name, p]) => [name, p.p_event_id, p.p_verdict]), [
    ["review_scan_event", 12, "correct"], ["review_scan_event", 12, "clear"], ["review_scan_event", 12, "wrong"],
  ]);
  assert.deepEqual(calls[2][1].p_wrong_fields, ["category", "price"]);
});

test("bulk confirmation binds every line to its inspected event in a single transaction", async () => {
  const { calls, api } = actions();
  const events = [{ scan_id: "receipt#0", event_id: 12 }];
  await api.confirmReceiptRest(events);
  assert.deepEqual(calls, [["review_receipt_rest", { p_events: events }]]);
});

test("database failure propagates without leaking the raw backend error", async () => {
  const { api } = actions(new Error("private backend payload"));
  await assert.rejects(api.setVerdict("receipt#0", "line", "correct", 12), /儲存判決失敗/);
});
