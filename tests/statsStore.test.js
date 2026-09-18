import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbGet, dbSet } from '../src/lib/storage/db.js';
import { getStats, recordDailyResult } from '../src/lib/storage/statsStore.js';

vi.mock('../src/lib/storage/db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
}));

describe('getStats', () => {
  beforeEach(() => {
    dbGet.mockReset();
  });

  it('fills defaults for a fresh install', async () => {
    dbGet.mockResolvedValue(undefined);
    await expect(getStats()).resolves.toEqual({
      played: 0,
      won: 0,
      days: [],
      results: {},
    });
  });

  it('backfills results for legacy saves', async () => {
    dbGet.mockResolvedValue({ played: 2, won: 1, days: ['2026-09-16', '2026-09-17'] });
    const stats = await getStats();
    expect(stats.results).toEqual({});
    expect(stats.days).toEqual(['2026-09-16', '2026-09-17']);
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