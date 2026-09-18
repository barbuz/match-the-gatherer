import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbGet, dbSet } from '../src/lib/storage/db.js';
import { getStats, rebuildLegacyResults, recordDailyResult } from '../src/lib/storage/statsStore.js';
import { calculateStreak } from '../src/lib/game/streak.js';
import { utcDateKey } from '../src/lib/game/dailySeed.js';

vi.mock('../src/lib/storage/db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
}));

const TODAY = utcDateKey();

/** Route dbGet by key so stats and the persisted daily game can differ. */
function dbByKey(map) {
  dbGet.mockImplementation((key) => Promise.resolve(map[key]));
}

describe('getStats', () => {
  beforeEach(() => {
    dbGet.mockReset();
    dbSet.mockReset();
  });

  it('fills defaults for a fresh install without migrating', async () => {
    dbGet.mockResolvedValue(undefined);
    await expect(getStats()).resolves.toEqual({
      played: 0,
      won: 0,
      days: [],
      results: {},
    });
    // Nothing to repair, so nothing is written back.
    expect(dbSet).not.toHaveBeenCalled();
  });

  it('leaves a save that already has a results map untouched', async () => {
    const stored = {
      played: 2,
      won: 1,
      days: ['2026-09-16', '2026-09-17'],
      results: { '2026-09-16': true, '2026-09-17': false },
    };
    dbGet.mockResolvedValue(stored);
    await expect(getStats()).resolves.toEqual(stored);
    // Only the stats read; no game lookup and no write-back.
    expect(dbGet).toHaveBeenCalledTimes(1);
    expect(dbSet).not.toHaveBeenCalled();
  });

  it('rebuilds a legacy save, clustering wins on the most recent days', async () => {
    dbByKey({
      'mtg:stats': { played: 5, won: 3, days: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'] },
    });
    const stats = await getStats();
    expect(stats.results).toEqual({
      '2026-09-14': false,
      '2026-09-15': false,
      '2026-09-16': true,
      '2026-09-17': true,
      '2026-09-18': true,
    });
    expect(Object.values(stats.results).filter(Boolean)).toHaveLength(3);
    expect(dbSet).toHaveBeenCalledWith('mtg:stats', stats);
  });

  it('pins today to a loss and moves the displaced win earlier', async () => {
    // 3 wins over 5 days; generous rebuild would make today the 3rd win, but the
    // concluded game says today was lost.
    dbByKey({
      'mtg:stats': { played: 5, won: 3, days: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', TODAY] },
      [`mtg:game:${TODAY}`]: { status: 'lost' },
    });
    const stats = await getStats();
    expect(stats.results[TODAY]).toBe(false);
    // Win/loss totals stay exact: still three wins, moved to an earlier day.
    expect(Object.values(stats.results).filter(Boolean)).toHaveLength(3);
    expect(stats.results['2026-09-15']).toBe(true);
  });

  it('pins today to a win when reconciliation requires it', async () => {
    dbByKey({
      'mtg:stats': { played: 5, won: 1, days: ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', TODAY] },
      [`mtg:game:${TODAY}`]: { status: 'won' },
    });
    const stats = await getStats();
    expect(stats.results[TODAY]).toBe(true);
    expect(Object.values(stats.results).filter(Boolean)).toHaveLength(1);
  });
});

describe('rebuildLegacyResults', () => {
  const days = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];

  it('places exactly `won` wins, all at the end', () => {
    const { results } = rebuildLegacyResults(days, 2);
    expect(results).toEqual({
      '2026-09-14': false,
      '2026-09-15': false,
      '2026-09-16': false,
      '2026-09-17': true,
      '2026-09-18': true,
    });
  });

  it('clamps a corrupt win count to the day count', () => {
    const { results } = rebuildLegacyResults(days, 99);
    expect(Object.values(results).filter(Boolean)).toHaveLength(5);
  });

  it('flips today to a loss and re-seats the displaced win on the latest loss', () => {
    const { results, repairedToday } = rebuildLegacyResults(days, 3, { day: '2026-09-18', won: false });
    expect(repairedToday).toBe(true);
    expect(results['2026-09-18']).toBe(false);
    expect(results['2026-09-15']).toBe(true); // latest earlier loss slot, scanned newest-first
    expect(Object.values(results).filter(Boolean)).toHaveLength(3);
  });

  it('flips today to a win without changing the totals', () => {
    const { results, repairedToday } = rebuildLegacyResults(days, 2, { day: '2026-09-18', won: true });
    expect(repairedToday).toBe(false); // today was already a win
    const { results: forced } = rebuildLegacyResults(days, 1, { day: '2026-09-18', won: true });
    expect(forced['2026-09-18']).toBe(true);
    expect(Object.values(forced).filter(Boolean)).toHaveLength(1);
  });

  it('produces the maximum current streak the totals allow', () => {
    const { results } = rebuildLegacyResults(days, 3);
    expect(calculateStreak({ results }, TODAY)).toMatchObject({ current: 3, playedToday: true });
  });
});

describe('recordDailyResult', () => {
  beforeEach(() => {
    dbGet.mockReset();
    dbSet.mockReset();
  });

  it('records a day once with its outcome', async () => {
    dbGet.mockResolvedValue({ played: 0, won: 0, days: [], results: {} });
    const next = await recordDailyResult('2026-09-17', true);
    expect(next).toMatchObject({ played: 1, won: 1 });
    expect(next.results).toEqual({ '2026-09-17': true });
    expect(dbSet).toHaveBeenCalledWith('mtg:stats', next);
  });

  it('is idempotent per day', async () => {
    dbGet.mockResolvedValue({
      played: 1,
      won: 1,
      days: ['2026-09-17'],
      results: { '2026-09-17': true },
    });
    const next = await recordDailyResult('2026-09-17', false);
    expect(next.played).toBe(1);
    expect(dbSet).not.toHaveBeenCalled();
  });

  it('keeps history indefinitely instead of trimming old days', async () => {
    const days = Array.from({ length: 365 }, (_, i) => {
      const d = new Date('2025-09-18T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const results = Object.fromEntries(days.map((d) => [d, true]));
    dbGet.mockResolvedValue({ played: 365, won: 365, days, results });

    const next = await recordDailyResult('2026-09-18', true);
    expect(next.days).toHaveLength(366);
    expect(next.days[0]).toBe('2025-09-18');
    expect(next.days.at(-1)).toBe('2026-09-18');
    expect(next.results['2025-09-18']).toBe(true);
    expect(next.results['2026-09-18']).toBe(true);
    expect(next.played).toBe(366);
  });
});