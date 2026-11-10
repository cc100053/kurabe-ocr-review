import assert from "node:assert/strict";
import { test } from "node:test";
import { recordFields, manualReviewEvidence, representativeRecord, comparePair, aiAgrees, type IdentityRecord } from "../lib/productReview.ts";

const record: IdentityRecord = {
  id: 1, image_url: "https://example.com/own.jpg", product_name: "洗潔精",
  brand: "花王", base_product: "キュキュット", variant: "オレンジ",
  size_value: 700, size_unit: "ml", jan_code: null,
  price: 220, original_price: 200, is_tax_included: false,
  quantity: 1, category_tag: "日用品", shop_name: "店", created_at: "2026-10-14T00:00:00Z",
};

test("display keeps stored total separate from tax-exclusive input and preserves ml", () => {
  const fields = Object.fromEntries(recordFields(record));
  assert.equal(fields["容量 / 規格"], "700ml");
  assert.equal(fields["保存價格（含稅、折扣後）"], "¥220");
  assert.equal(fields["輸入價格"], "¥200（未稅）");
  const missing = Object.fromEntries(recordFields({ ...record, price: 0, size_value: null, quantity: null }));
  assert.equal(missing["保存價格（含稅、折扣後）"], "¥0");
  assert.equal(missing["容量 / 規格"], "未保存");
  assert.equal(missing["件數"], "未保存");
});

test("representative photo only identifies a record with that exact photo", () => {
  assert.equal(representativeRecord([record], "https://example.com/other.jpg"), undefined);
  assert.equal(representativeRecord([{ ...record, image_url: null }], null), undefined);
  assert.equal(representativeRecord([record], record.image_url), record);
});

test("automatic audit identifies the human action without claiming photo evidence", () => {
  const evidence = manualReviewEvidence("identity correction", 3, 1);
  assert.match(evidence, /Authenticated owner manual review/);
  assert.match(evidence, /review_id=3; record_id=1/);
  assert.match(evidence, /No written rationale supplied/);
});

test("pair comparison flags a size difference and never treats a missing side as same", () => {
  const rows = Object.fromEntries(comparePair([record, { ...record, id: 2, brand: "花王 " }], [{ ...record, size_value: 1250, jan_code: "4901301000000" }]).map((r) => [r.label, r]));
  assert.equal(rows["品牌"].state, "same");
  assert.deepEqual([rows["容量 / 規格"].left, rows["容量 / 規格"].right, rows["容量 / 規格"].state], ["700ml", "1250ml", "diff"]);
  assert.equal(rows["JAN"].state, "unknown");
  assert.equal(rows["價格"].state, "info");
  // Two values on one side are a conflict even if one of them matches.
  assert.equal(comparePair([record, { ...record, variant: "ライム" }], [record]).find((r) => r.label === "款式 / 口味")!.state, "diff");
});

test("AI different counts as agreeing with a human same-series verdict only", () => {
  assert.ok(aiAgrees("different", "same_series"));
  assert.ok(aiAgrees("same", "same"));
  assert.ok(!aiAgrees("same", "same_series"));
  assert.ok(!aiAgrees("same", "different"));
});
