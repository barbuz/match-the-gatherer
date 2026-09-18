import { describe, it, expect } from 'vitest';
import { calculateStreak } from '../src/lib/game/streak.js';

const TODAY = '2026-09-18';

/** Turn a list of `[dayKey, won]` into the stats shape. */
function statsOf(entries) {
  return { results: Object.fromEntries(entries) };
}

describe('calculateStreak', () => {
  it('reports no streak for a player with no history', () => {
    expect(calculateStreak({ results: {} }, TODAY)).toEqual({
      current: 0,
      best: 0,
      lastResult: null,
      playedToday: false,
    });
  });

  it('handles legacy saves without a results map', () => {
    expect(calculateStreak({ played: 3, won: 1, days: ['2026-09-16'] }, TODAY).current).toBe(0);
  });

  it('counts consecutive wins ending today', () => {
    const stats = statsOf([
      ['2026-09-16', true],
      ['2026-09-17', true],
      [TODAY, true],
    ]);
    expect(calculateStreak(stats, TODAY)).toMatchObject({
      current: 3,
      best: 3,
      playedToday: true,
    });
  });

  it('keeps the current streak alive while today is still unplayed', () => {
    const stats = statsOf([
      ['2026-09-15', true],
      ['2026-09-16', true],
      ['2026-09-17', true],
    ]);
    expect(calculateStreak(stats, TODAY)).toMatchObject({ current: 3, playedToday: false });
  });

  it('breaks the current streak when yesterday was skipped', () => {
    const stats = statsOf([
      ['2026-09-14', true],
      ['2026-09-15', true],
    ]);
    expect(calculateStreak(stats, TODAY).current).toBe(0);
  });

  it('resets the current streak on a loss', () => {
    const stats = statsOf([
      ['2026-09-16', true],
      ['2026-09-17', true],
      [TODAY, false],
    ]);
    expect(calculateStreak(stats, TODAY)).toMatchObject({
      current: 0,
      best: 2,
      playedToday: true,
    });
  });

  it('finds the best streak anywhere in history', () => {
    const stats = statsOf([
      ['2026-09-01', true],
      ['2026-09-02', true],
      ['2026-09-03', true],
      ['2026-09-04', true],
      ['2026-09-06', true],
      ['2026-09-07', true],
      ['2026-09-08', false],
      ['2026-09-09', true],
      ['2026-09-17', true],
      [TODAY, true],
    ]);
    const { current, best } = calculateStreak(stats, TODAY);
    expect(best).toBe(4);
    expect(current).toBe(2);
  });
});
