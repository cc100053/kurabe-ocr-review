import assert from "node:assert/strict";
import { test } from "node:test";
import * as display from "../lib/display.ts";
import { load, selectAll, dbRows } from "./load.ts";

const saved = {
  event_id: 12, occurred_at: "2026-10-24T04:25:54Z", scan_id: "saved-scan", field_name: "price",
  product_name: "国産黒毛和牛切り落とし", image_url: "saved.jpg", image_source: "explicit",
  ai_value: "1680", saved_value: "1680", saved_tax_mode: "excluded", saved_tax_rate: 0.08,
  evidence_text: "本体 1680円", risk_flags: [], source: "corrected",
};

test("the queue gets photo, fields and identity from one save view, never intermediate edits", async () => {
  const calls: string[] = [];
  const db = dbRows({ scan_review_queue: [saved] }, calls);
  const [item] = await load("lib/queries.ts", { "./display": display,
    "./supabase": { getSupabaseAdmin: () => db, selectAll } }).getReviewQueue("1970");
  assert.equal(item.saved_value, "1680");
  assert.equal(item.saved_tax_mode, "excluded");
  assert.equal(item.saved_tax_rate, 0.08);
  assert.equal(item.image_url, "saved.jpg");
  assert.equal(item.event_id, 12);
  assert.deepEqual(calls, ["scan_review_queue"]);
});

test("null, zero and legacy-photo provenance survive mapping; tax flags always require review", async () => {
  const db = dbRows({ scan_review_queue: [
    { ...saved, saved_value: "0", image_source: "legacy", risk_flags: ["tax_inclusive_exclusive_conflict"] },
    { ...saved, field_name: "grams", saved_value: null, image_url: null, image_source: "none" },
  ] });
  const items = await load("lib/queries.ts", { "./display": display,
    "./supabase": { getSupabaseAdmin: () => db, selectAll } }).getReviewQueue("1970");
  assert.equal(items[0].saved_value, "0");
  assert.equal(items[0].image_source, "legacy");
  assert.equal(items[0].high_risk, true);
  assert.equal(items[0].self_checked, undefined);
  assert.equal(items[1].saved_value, null);
});
