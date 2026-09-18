/** Minimal daily-game stats (spec §8): games played / wins, extendable. */
import { dbGet, dbSet } from './db.js';
import { utcDateKey } from '../game/dailySeed.js';

const STATS_KEY = 'mtg:stats';
const EMPTY = { played: 0, won: 0, days: [], results: {} };

export async function getStats() {
  const stats = await dbGet(STATS_KEY, EMPTY);
  const merged = {
    ...EMPTY,
    ...stats,
    days: stats?.days ?? [],
    // Legacy saves predate per-day outcomes; an empty map degrades to "no
    // streak yet" rather than a schema migration.
    results: stats?.results ?? {},
  };
  // --- TEMPORARY MIGRATION START ---
  // Saves written before the streak meter (v0.9 era) have no `results` map, so
  // the meter reads 0 even on an already-played day. Rebuild it once and
  // persist. Safe to delete together with `rebuildLegacyResults` and
  // `migrateLegacyResults` once no such saves remain.
  if (needsLegacyRebuild(stats)) {
    return await migrateLegacyResults(merged);
  }
  // --- TEMPORARY MIGRATION END ---
  return merged;
}

// --- TEMPORARY MIGRATION START ---
// Everything from here to the matching END marker exists only to repair saves
// written before the streak meter shipped. Deleting this block restores the
// previous `getStats()` behaviour (legacy saves degrade to an empty streak).

/**
 * A save is pre-streak when it has recorded days but never a `results` map.
 * `days` is non-empty on every legacy install, so this can't fire on a fresh
 * install (where it stays false and nothing is written back).
 */
function needsLegacyRebuild(stats) {
  const days = stats?.days ?? [];
  return days.length > 0 && !stats?.results;
}

/**
 * Rebuild a legacy save's `results` map from its lifetime totals.
 *
 * Outcomes aren't recorded per-day back then, so we only know the totals:
 * exactly `won` wins and `played - won` losses. To be as generous as possible
 * with the reconstructed streak we place every win at the end of the day list
 * (the most recent days), so the surviving current run is as long as the totals
 * allow. `todayResult`, when supplied, pins today's entry to the truth and any
 * displaced win is re-seated on the latest day still holding a loss, keeping
 * the win/loss totals exact.
 *
 * @param {string[]} days recorded day keys (any order).
 * @param {number} won lifetime wins.
 * @param {{day: string, won: boolean}|null} [todayResult] today's known outcome.
 * @returns {{days: string[], results: Record<string, boolean>, repairedToday: boolean}}
 */
export function rebuildLegacyResults(days, won, todayResult = null) {
  const sorted = [...days].sort();
  const total = sorted.length;
  const wins = Math.max(0, Math.min(won, total)); // clamp defensively
  const results = {};
  sorted.forEach((key, i) => {
    results[key] = i >= total - wins; // wins clustered on the most recent days
  });

  let repairedToday = false;
  if (todayResult && results[todayResult.day] !== todayResult.won) {
    results[todayResult.day] = todayResult.won;
    repairedToday = true;
    // Flipping today to a loss would drop a win; move the displaced win to the
    // latest earlier day still holding a loss so the lifetime totals stay exact.
    if (!todayResult.won) {
      const moved = [...sorted]
        .reverse()
        .find((key) => key !== todayResult.day && !results[key]);
      if (moved) results[moved] = true;
    }
  }

  return { days: sorted, results, repairedToday };
}

/** Reconstruct and persist the repaired stats, then return them. */
async function migrateLegacyResults(stats) {
  const today = utcDateKey();
  let todayResult = null;
  if (stats.days.includes(today)) {
    // The concluded-game record (stored separately from stats) is the only
    // remaining source of today's true outcome.
    const saved = await dbGet(`mtg:game:${today}`);
    if (saved?.status === 'won' || saved?.status === 'lost') {
      todayResult = { day: today, won: saved.status === 'won' };
    }
  }

  const { days, results } = rebuildLegacyResults(stats.days, stats.won, todayResult);
  const repaired = { ...stats, days, results };
  await dbSet(STATS_KEY, repaired);
  return repaired;
}
// --- TEMPORARY MIGRATION END ---

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
