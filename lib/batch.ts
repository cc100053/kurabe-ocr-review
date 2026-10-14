// Client-safe helpers that keep the review queue human-sized: which receipt
// lines need an eyeball at all, and how much to show per sitting.

export const BATCH_SIZE = 20;

// A saved receipt line is worth a human look only if something about it is
// uncertain: the user edited it, the category came from shared memory, or the AI
// itself was unsure. Untouched high-confidence lines are assumed correct.
export function needsHumanEye(line: {
  changed: string[];
  confidence: string | null;
  categoryCorrected: boolean;
  memoryApplied: boolean;
}): boolean {
  return (
    line.changed.length > 0 ||
    line.categoryCorrected ||
    line.memoryApplied ||
    line.confidence === "low" ||
    line.confidence === "medium"
  );
}

// One sitting's worth of work. Receipts get up to half the budget (whole
// receipts only, always at least one so a long receipt never starves), price
// cards fill the rest, and whichever stream is short hands its share over.
export function takeBatch<P, R>(
  price: P[],
  receipts: R[],
  lineCount: (r: R) => number,
  size = BATCH_SIZE,
): { price: P[]; receipts: R[] } {
  const receiptBudget = size - Math.min(price.length, Math.floor(size / 2));
  const taken: R[] = [];
  let used = 0;
  for (const r of receipts) {
    const n = lineCount(r);
    if (taken.length > 0 && used + n > receiptBudget) break;
    taken.push(r);
    used += n;
  }
  return { price: price.slice(0, Math.max(0, size - used)), receipts: taken };
}
