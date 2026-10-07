import { describe, it, expect } from 'vitest';
import { barCountFor } from '../src/lib/game/barTarget.js';

const base = { hintCounts: {}, status: 'playing', revealCount: null, initialCount: 35136 };

describe('barCountFor', () => {
  it('starts at the local name-list size before any guess', () => {
    expect(barCountFor({ ...base, guesses: [] })).toBe(35136);
  });

  it('falls back to null when the name list is not loaded yet', () => {
    expect(barCountFor({ ...base, guesses: [], initialCount: 0 })).toBe(null);
  });

  it('shows a resolved count for the latest guess', () => {
    expect(
      barCountFor({ ...base, guesses: [{}, {}], hintCounts: { 0: 12, 1: 5 } }),
    ).toBe(5);
  });

  it('holds the most recent resolved count while the latest is still resolving', () => {
    // Guess added, its count not resolved yet: hold the last resolved value so
    // the bar only ever moves down — never back up toward the top.
    expect(
      barCountFor({ ...base, guesses: [{}, {}], hintCounts: { 0: 12 } }),
    ).toBe(12);
  });

  it('skips unresolved guesses when holding, and never jumps to a fallback', () => {
    // Guess 1 (index 0) resolved to 3; guess 2 (index 1) failed to resolve and
    // was left unset. A third guess must hold at 3, not fall back to the
    // name-list size (the "briefly jumping to the max" regression).
    const held = barCountFor({
      ...base,
      guesses: [{}, {}, {}],
      hintCounts: { 0: 3, 2: undefined },
    });
    expect(held).toBe(3);
    expect(held).not.toBe(35136);
  });

  it('falls back to the starting size only when nothing has ever resolved', () => {
    expect(
      barCountFor({ ...base, guesses: [{}], hintCounts: {} }),
    ).toBe(35136);
  });

  it('slides to 1 on a win without waiting for a count', () => {
    expect(
      barCountFor({ ...base, status: 'won', guesses: [{}], hintCounts: {} }),
    ).toBe(1);
  });

  it('uses the final count on a loss once it is known', () => {
    expect(
      barCountFor({ ...base, status: 'lost', guesses: [{}], revealCount: 4 }),
    ).toBe(4);
  });

  it('keeps the last resolved count on a loss while the final count resolves', () => {
    expect(
      barCountFor({
        ...base,
        status: 'lost',
        guesses: [{}, {}],
        hintCounts: { 0: 9, 1: 4 },
        revealCount: null,
      }),
    ).toBe(4);
  });

  it('holds the starting size on a loss if nothing resolved', () => {
    expect(
      barCountFor({ ...base, status: 'lost', guesses: [{}], revealCount: null }),
    ).toBe(35136);
  });
});
