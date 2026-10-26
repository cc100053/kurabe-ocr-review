import assert from "node:assert/strict";
import { test } from "node:test";
import * as batch from "../lib/batch.ts";
import { load, selectAll, dbRows } from "./load.ts";

function queries(tables: Record<string, object[]>) {
  const db = dbRows(tables);
  return load("lib/receiptQueries.ts", { "./batch": batch, "./display": {},
    "./supabase": { getSupabaseAdmin: () => db, selectAll } });
}

test("receipt rate denominators include more than 1000 confusion pairs", async () => {
  const rows = Array.from({ length: 2567 }, (_, i) => ({ field_name: "name", ai_value: String(i),
    saved_value: String(i), sample_count: 1, corrected_count: i < 159 ? 1 : 0 }));
  const q = queries({ receipt_field_confusion_summary: rows });
  const result = q.rollupFieldOverview(await q.getReceiptConfusion());
  assert.equal(result[0].total, 2567);
  assert.equal(result[0].corrected, 159);
});

const row = { scan_id: "receipt#0", occurred_at: "2026-10-01T00:00:01Z", image_url: "new.jpg",
  event_id: 2, category: { ai: "その他", saved: "精肉" }, category_corrected: true };

test("duplicate receipt snapshots cannot render two categories with one verdict identity", async () => {
  const [g] = await queries({ receipt_line_review: [row,
    { ...row, event_id: 1, occurred_at: "2026-10-01T00:00:00Z", image_url: "old.jpg", category: { ai: "その他", saved: "野菜" } },
  ] }).getReceiptReviewGroups("1970");
  assert.equal(g.lines.length, 1);
  assert.equal(g.lines[0].eventId, 2);
  assert.equal(g.lines[0].category.saved, "精肉");
  assert.equal(g.imageUrl, "new.jpg");
});

test("different photos across receipt lines withhold the group photo", async () => {
  const [g] = await queries({ receipt_line_review: [row, { ...row, scan_id: "receipt#1", image_url: "other.jpg" }] }).getReceiptReviewGroups("1970");
  assert.equal(g.imageUrl, null);
  assert.equal(g.lines.length, 2);
});
