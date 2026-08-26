import { describe, it, expect } from 'vitest';
import { scoreResults, emojiBar, buildShareText, SHARE_BLOCKS } from '../src/lib/game/scoring.js';

const line = (status, applicable = true) => ({
  key: 'x',
  label: 'x',
  status,
  correct: [],
  wrong: [],
  applicable,
});

describe('scoreResults', () => {
  it('counts correct as 1 and partial as 0.5 over applicable properties', () => {
    const { matched, applicable, ratio } = scoreResults([
      line('correct'),
      line('correct'),
      line('partial'),
      line('wrong'),
    ]);
    expect(matched).toBe(2.5);
    expect(applicable).toBe(4);
    expect(ratio).toBeCloseTo(0.625);
  });

  it('ignores non-applicable properties so the denominator does not leak', () => {
    const { matched, applicable } = scoreResults([line('correct'), line('wrong', false)]);
    expect(matched).toBe(1);
    expect(applicable).toBe(1);
  });

  it('handles an empty result list', () => {
    expect(scoreResults([])).toEqual({ matched: 0, applicable: 0, ratio: 0 });
  });
});

describe('emojiBar', () => {
  it('renders full, empty and fractional bars', () => {
    expect(emojiBar(1)).toBe('🟩'.repeat(SHARE_BLOCKS));
    expect(emojiBar(0)).toBe('⬜'.repeat(SHARE_BLOCKS));
    expect(emojiBar(0.5)).toBe('🟩'.repeat(5) + '⬜'.repeat(5));
  });

  it('clamps out-of-range ratios', () => {
    expect(emojiBar(2)).toBe('🟩'.repeat(SHARE_BLOCKS));
    expect(emojiBar(-1)).toBe('⬜'.repeat(SHARE_BLOCKS));
  });
});

describe('buildShareText', () => {
  const guesses = [
    { results: [line('correct'), line('wrong')] },
    { results: [line('correct'), line('correct')] },
  ];

  it('shows the guess count on a win and X on a loss, ending with the URL', () => {
    const win = buildShareText({ dayKey: '2026-08-26', guesses, won: true, maxGuesses: 10, url: 'https://example.com/' });
    const rows = win.split('\n');
    expect(rows[0]).toBe('Match the Gatherer 2026-08-26 — 2/10');
    expect(rows).toHaveLength(4); // header + 2 bars + url
    expect(rows[rows.length - 1]).toBe('https://example.com/');

    const loss = buildShareText({ dayKey: '2026-08-26', guesses, won: false, maxGuesses: 10, url: 'https://example.com/' });
    expect(loss.split('\n')[0]).toBe('Match the Gatherer 2026-08-26 — X/10');
  });

  it('renders one bar row per guess with proportional fill', () => {
    const rows = buildShareText({ dayKey: 'd', guesses, won: true, maxGuesses: 10, url: 'u' }).split('\n');
    expect(rows[1]).toBe('🟩'.repeat(5) + '⬜'.repeat(5));
    expect(rows[2]).toBe('🟩'.repeat(10));
  });
});
