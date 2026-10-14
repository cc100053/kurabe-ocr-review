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

test("a tag printing both 本体 and 税込 self-verifies only when the numbers agree", async () => {
  const { taxPairConsistent } = await import("../lib/display.ts");
  // The two real production cases.
  assert.equal(taxPairConsistent("本体 478円 税込525.80円", "478.0", "excluded", 0.1), true);
  assert.equal(taxPairConsistent("(税込み価格)1,485円\n1,350\n税抜", "1350.0", "excluded", 0.1), true);
  // Saved as 税込 instead: the counterpart is 本体.
  assert.equal(taxPairConsistent("本体 478円 税込525.80円", "525.8", "included", 0.1), true);
  // Wrong mode, wrong rate, mismatched numbers, or unknown mode → a human looks.
  assert.equal(taxPairConsistent("本体 478円 税込525.80円", "478.0", "included", 0.1), false);
  assert.equal(taxPairConsistent("本体 478円 税込525.80円", "478.0", "excluded", 0.08), false);
  assert.equal(taxPairConsistent("本体 478円 税込598円", "478.0", "excluded", 0.1), false);
  assert.equal(taxPairConsistent("本体 478円 税込525.80円", "478.0", null, 0.1), false);
});
