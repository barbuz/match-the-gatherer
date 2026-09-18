/**
 * Daily win-streak math (spec §8). Pure and DOM-free so the meter stays
 * unit-testable; `stats.results` is the `{ 'YYYY-MM-DD': won }` map written by
 * `recordDailyResult`.
 */

/** Day key for the instant immediately before `dayKey` (UTC). */
function prevDayKey(dayKey) {
  const d = new Date(`${dayKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Summarize a player's streak from their per-day results.
 *
 * A streak only counts consecutive *wins*: a loss resets it, and skipping a
 * day breaks it. The current streak still reads as alive on a day not yet
 * played (the day after the last result), so the meter doesn't collapse to 0
 * every midnight before the player has had a chance to guess.
 *
 * @param {{results?: Record<string, boolean>}} stats
 * @param {string} today UTC day key.
 * @returns {{current: number, best: number, lastResult: string|null, playedToday: boolean}}
 */
export function calculateStreak(stats, today) {
  const results = stats?.results ?? {};
  const keys = Object.keys(results).sort();
  if (keys.length === 0) {
    return { current: 0, best: 0, lastResult: null, playedToday: false };
  }

  const lastResult = keys[keys.length - 1];
  const playedToday = results[today] !== undefined;

  // Current streak ends today, or yesterday while today is still unplayed.
  let cursor = playedToday ? today : lastResult === prevDayKey(today) ? lastResult : null;
  let current = 0;
  while (cursor && results[cursor] === true) {
    current += 1;
    cursor = prevDayKey(cursor);
  }

  let best = 0;
  let run = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (!results[key]) {
      run = 0;
      continue;
    }
    run = i > 0 && prevDayKey(key) === keys[i - 1] ? run + 1 : 1;
    if (run > best) best = run;
  }

  return { current, best, lastResult, playedToday };
}
