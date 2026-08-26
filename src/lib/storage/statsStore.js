/** Minimal daily-game stats (spec §8): games played / wins, extendable. */
import { dbGet, dbSet } from './db.js';

const STATS_KEY = 'mtg:stats';
const EMPTY = { played: 0, won: 0, days: [] };

export async function getStats() {
  const stats = await dbGet(STATS_KEY, EMPTY);
  return { ...EMPTY, ...stats, days: stats?.days ?? [] };
}

/**
 * Record a concluded daily game. Idempotent per day — reopening the tab on a
 * finished game never double-counts, and an abandoned in-progress game is
 * never recorded (§8).
 */
export async function recordDailyResult(dayKey, won) {
  const stats = await getStats();
  if (stats.days.includes(dayKey)) return stats;
  const next = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    days: [...stats.days, dayKey].slice(-365),
  };
  await dbSet(STATS_KEY, next);
  return next;
}
