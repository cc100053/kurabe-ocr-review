import assert from "node:assert/strict";
import { test } from "node:test";
import { magnifierGeometry } from "../lib/magnifier.ts";

test("portrait letterboxing maps the pointer to the correct original pixel", () => {
  const lens = magnifierGeometry(540, 280, 1000, 2000, 270, 140)!;
  assert.equal(lens.imageWidth, 140);
  assert.equal(lens.offsetX, 200);
  assert.equal(lens.imageLeft, 80 - 70 * 3);
  assert.equal(lens.imageTop, 80 - 140 * 3);
  assert.equal(magnifierGeometry(540, 280, 1000, 2000, 100, 140), null);
});

test("landscape letterboxing and edge placement keep the lens inside the photo stage", () => {
  const lens = magnifierGeometry(280, 280, 2000, 1000, 280, 70)!;
  assert.equal(lens.offsetY, 70);
  assert.equal(lens.left, 120);
  assert.equal(lens.top, 0);
  assert.equal(lens.imageTop, 80);
  assert.equal(magnifierGeometry(280, 280, 2000, 1000, 140, 40), null);
});

test("small thumbnails fit the lens and unloaded/hidden images cannot be magnified", () => {
  assert.equal(magnifierGeometry(132, 132, 1000, 1000, 66, 66)!.size, 132);
  assert.equal(magnifierGeometry(0, 280, 1000, 2000, 0, 140), null);
  assert.equal(magnifierGeometry(540, 280, 0, 0, 270, 140), null);
});
