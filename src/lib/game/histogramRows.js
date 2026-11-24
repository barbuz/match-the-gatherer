/**
 * How many guess-count rows the community histogram shows (spec §11).
 *
 * Normally one row per allowed guess, but a day played under an older, larger
 * limit still has wins in buckets above today's `MAX_GUESSES`. Those players
 * must stay visible, so the table grows to the highest bucket holding data —
 * while a stub row of all-zero buckets must not stretch it.
 *
 * @param {Record<string, { plain?: number, hint?: number }>} byGuesses
 * @param {number} maxGuesses
 * @returns {number} row count, at least `maxGuesses`
 */
export function histogramRows(byGuesses, maxGuesses) {
  const used = Object.entries(byGuesses ?? {})
    .filter(([, v]) => (v?.plain ?? 0) + (v?.hint ?? 0) > 0)
    .map(([n]) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  return Math.max(maxGuesses, ...used);
}
