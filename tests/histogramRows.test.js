import { describe, it, expect } from 'vitest';
import { histogramRows } from '../src/lib/game/histogramRows.js';

describe('histogramRows', () => {
  it('shows one row per allowed guess on a normal day', () => {
    expect(histogramRows({ 1: { plain: 3 }, 6: { plain: 2, hint: 1 } }, 6)).toBe(6);
  });

  it('keeps a day with no data at the normal height', () => {
    expect(histogramRows({}, 6)).toBe(6);
    expect(histogramRows(null, 6)).toBe(6);
  });

  it('grows to show wins from a day played under a larger limit', () => {
    // Retuning 10 → 6 must not hide players who won on guesses 7–10.
    expect(histogramRows({ 3: { plain: 5 }, 8: { plain: 9 }, 10: { plain: 4 } }, 6)).toBe(10);
  });

  it('ignores all-zero stub buckets so an untouched day stays short', () => {
    expect(histogramRows({ 1: { plain: 0, hint: 0 }, 10: { plain: 0, hint: 0 } }, 6)).toBe(6);
  });
});
