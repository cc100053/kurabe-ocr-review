import assert from "node:assert/strict";
import { test } from "node:test";
import { needsHumanEye, takeBatch } from "../lib/batch.ts";

const line = { changed: [] as string[], confidence: "high", categoryCorrected: false, memoryApplied: false };

test("untouched high-confidence receipt lines are skipped; anything uncertain is kept", () => {
  assert.equal(needsHumanEye(line), false);
  assert.equal(needsHumanEye({ ...line, confidence: null }), false);
  assert.equal(needsHumanEye({ ...line, changed: ["price"] }), true);
  assert.equal(needsHumanEye({ ...line, categoryCorrected: true }), true);
  assert.equal(needsHumanEye({ ...line, memoryApplied: true }), true);
  assert.equal(needsHumanEye({ ...line, confidence: "medium" }), true);
});

test("batch splits the budget and rolls an unused share over", () => {
  const price = Array.from({ length: 30 }, (_, i) => i);
  const lines = (n: number) => n;
  assert.deepEqual(takeBatch(price, [4, 4, 4], lines, 20), { price: price.slice(0, 12), receipts: [4, 4] });
  assert.deepEqual(takeBatch(price, [], lines, 20).price.length, 20);
  assert.deepEqual(takeBatch([1, 2], [5, 5, 5, 5], lines, 20), { price: [1, 2], receipts: [5, 5, 5] });
  // A single long receipt is still shown whole, even past the budget.
  assert.deepEqual(takeBatch(price, [25, 3], lines, 20), { price: [], receipts: [25] });
});
