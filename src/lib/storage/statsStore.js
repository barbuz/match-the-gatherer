/** Minimal daily-game stats (spec §8): games played / wins, extendable. */
import { dbGet, dbSet } from './db.js';

const STATS_KEY = 'mtg:stats';
const EMPTY = { played: 0, won: 0, days: [], results: {} };

export async function getStats() {
  const stats = await dbGet(STATS_KEY, EMPTY);
  return {
    ...EMPTY,
    ...stats,
    days: stats?.days ?? [],
    // Legacy saves predate per-day outcomes; an empty map degrades to "no
    // streak yet" rather than a schema migration.
    results: stats?.results ?? {},
  };
}

/**
 * Record a concluded daily game. Idempotent per day — reopening the tab on a
 * finished game never double-counts, and an abandoned in-progress game is
 * never recorded (§8). `results` keeps each recorded day's win/loss so the
 * streak meter can reconstruct consecutive play (§8).
 *
 * History is kept forever: `played`/`won` are lifetime totals and would drift
 * from a trimmed roster, and dropping old days would silently reset an
 * all-time best streak. At one short entry per concluded game the growth is
 * negligible.
 */
export async function recordDailyResult(dayKey, won) {
  const stats = await getStats();
  if (stats.days.includes(dayKey)) return stats;
  const next = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    days: [...stats.days, dayKey],
    results: { ...stats.results, [dayKey]: !!won },
  };
  await dbSet(STATS_KEY, next);
  return next;
}
