import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import * as display from "../lib/display.ts";

// Load the real server query module with only its database boundary replaced.
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/queries.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

const correction = {
  occurred_at: "2026-10-24T04:25:37Z", scan_id: "scan-test",
  product_name: "国産黒毛和牛切り落とし", field_name: "original_price",
  ai_value: 1680, current_value: "155", risk_flags: [],
};
const saved = {
  id: 1, occurred_at: "2026-10-24T04:25:54Z", scan_id: "scan-test",
  price: { saved_original_price: 1680, saved_tax_mode: "excluded", saved_tax_rate: 0.08 },
  category: { saved: "精肉" }, grams: { saved: 400 },
  discount: { saved_discount_type: "percentage", saved_discount_value: 50 },
};

async function queue(corrected: object[], saves: object[], suspicious: object[] = []) {
  const tables: Record<string, object[]> = {
    scan_field_correction_samples: corrected,
    scan_field_suspicious_untouched: suspicious,
    scan_telemetry_events: saves,
  };
  const db = {
    from(table: string) {
      let rows = tables[table];
      const query = {
        select() { return query; }, eq() { return query; }, in() { return query; },
        gt() { return query; }, order() { return query; },
        range(from: number, to: number) { rows = rows.slice(from, to + 1); return query; },
        then(resolve: (result: object) => unknown) { return Promise.resolve(resolve({ data: rows, error: null })); },
      };
      return query;
    },
  };
  const exports: { getReviewQueue?: (since: string) => Promise<display.QueueItem[]> } = {};
  new Function("require", "exports", compiled)((name: string) => {
    if (name === "./display") return display;
    assert.equal(name, "./supabase");
    return {
      getSupabaseAdmin: () => db,
      selectAll: async (page: (from: number, to: number) => PromiseLike<{ data: object[] }>) =>
        (await page(0, 999)).data,
    };
  }, exports);
  return exports.getReviewQueue!("2026-10-01T00:00:00Z");
}

test("a temporary 155 edit never replaces the 1680 successful save", async () => {
  const [item] = await queue([correction], [saved]);
  assert.equal(item.saved_value, "1680");
  assert.equal(item.saved_tax_mode, "excluded");
  assert.equal(item.saved_tax_rate, 0.08);
});

test("an abandoned edit is not presented as a saved value", async () => {
  assert.deepEqual(await queue([correction], []), []);
});

test("every field uses the latest successful save, preserving null and zero", async () => {
  const corrections = ["original_price", "category", "grams", "discount"].map(field_name => ({
    ...correction, field_name, current_value: "temporary",
  }));
  const items = await queue(corrections, [saved, {
    ...saved, id: 2, occurred_at: "2026-10-24T04:26:00Z",
    price: { ...saved.price, saved_original_price: 0 },
    category: { saved: "その他" }, grams: { saved: null },
    discount: { saved_discount_type: "none", saved_discount_value: 0 },
  }]);
  assert.deepEqual(Object.fromEntries(items.map(i => [i.field, i.saved_value])), {
    original_price: "0", category: "その他", grams: "", discount: "none",
  });
});

test("a suspicious tax pair checks the saved input rather than an older value", async () => {
  const [item] = await queue([], [{ ...saved, price: {
    saved_original_price: 478, saved_tax_mode: "excluded", saved_tax_rate: 0.1,
  } }], [{
    ...correction, field_name: "price", ai_value: "478", saved_value: "155",
    evidence_text: "本体 478円 税込525.80円", risk_flags: [display.TAX_CONFLICT_FLAG],
  }]);
  assert.equal(item.saved_value, "478");
  assert.equal(item.self_checked, true);
});

test("discount AI and saved values use the same format", async () => {
  const [item] = await queue([{
    ...correction, field_name: "discount", ai_value: { type: "percentage", value: 50 },
  }], [saved]);
  assert.equal(item.saved_value, "percentage:50");
  assert.equal(item.ai_value, item.saved_value);
});
