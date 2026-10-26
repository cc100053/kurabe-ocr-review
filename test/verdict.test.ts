import assert from "node:assert/strict";
import { test } from "node:test";
import { noteForEvent, noteKey, type ReviewNote } from "../lib/verdict.ts";

const note: ReviewNote = { scan_id: "scan", field: "price", status: "triaged", root_cause: null,
  action_taken: null, linked_pr_url: null, note: null, reviewed_by: "human", updated_at: "2026-10-02T00:00:00Z", event_id: 12 };

test("a verdict never follows a later successful save", () => {
  const notes = new Map([[noteKey("scan", "price"), note]]);
  assert.equal(noteForEvent(notes, "scan", "price", 12, "2026-10-01"), note);
  assert.equal(noteForEvent(notes, "scan", "price", 13, "2026-10-01"), undefined);
});

test("legacy original_price verdict survives normalization but not a later save", () => {
  const old = { ...note, field: "original_price", event_id: null };
  const notes = new Map([[noteKey("scan", "original_price"), old]]);
  assert.equal(noteForEvent(notes, "scan", "price", 12, "2026-10-01"), old);
  assert.equal(noteForEvent(notes, "scan", "price", 13, "2026-10-03"), undefined);
});
