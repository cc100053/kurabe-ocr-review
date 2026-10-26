import assert from "node:assert/strict";
import { test } from "node:test";
import { savedTaxLabel, taxBasisFromEvidence } from "../lib/display.ts";

test("最終存 shows the saved tax mode with its rate", () => {
  assert.equal(savedTaxLabel("included", 0.1), "含稅 10%");
  assert.equal(savedTaxLabel("excluded", 0.08), "不含稅 8%");
  assert.equal(savedTaxLabel("excluded", null), "不含稅");
  assert.equal(savedTaxLabel(null, 0.1), null);
});

test("tag cues carry a comparable mode", () => {
  assert.equal(taxBasisFromEvidence("本体 880円")?.mode, "excluded");
  assert.equal(taxBasisFromEvidence("税込 968円")?.mode, "included");
  assert.equal(taxBasisFromEvidence("税込 968 税抜 880")?.mode, null);
  assert.equal(taxBasisFromEvidence("過去価格: ¥1,100"), null);
});
