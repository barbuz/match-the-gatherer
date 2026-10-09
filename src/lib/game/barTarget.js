/**
 * Chooses the value the Hint bar should show. Kept pure and DOM-free so it is
 * unit-testable, and so the sticky logic lives in one place.
 *
 * While a guess's count query is in flight (or after it failed) the bar holds
 * the most recent *resolved* count, so it only ever moves down into the true
 * value. It must not fall back to an unrelated number (an older guess, or the
 * name-list size), which is what made the pointer jump toward the top.
 */

/**
 * @param {object} args
 * @param {Array} args.guesses           the guesses made so far
 * @param {object} args.hintCounts       counts keyed by guess index
 * @param {string} args.status           'playing' | 'won' | 'lost'
 * @param {number|null} args.revealCount final fully-constrained count, once known
 * @param {number} args.initialCount     local card-name count (pre-first-guess value)
 * @returns {number|null}
 */
export function barCountFor({ guesses, hintCounts, status, revealCount, initialCount }) {
  const n = guesses.length;
  if (n === 0) return initialCount || null;
  // On a win the answer is known without a request, so slide straight to 1.
  if (status === 'won') return 1;
  // The current guess's count, if it has resolved.
  const latest = hintCounts?.[n - 1];
  if (latest != null) return latest;
  // Still resolving (or failed). Hold the most recent *resolved* count so the
  // bar can only ever move down into the true value. Falling back to an older
  // guess (or the name-list size) here is what made the pointer jump toward the
  // top when a backgrounded query failed and a later guess was made.
  for (let i = n - 2; i >= 0; i--) {
    if (hintCounts?.[i] != null) return hintCounts[i];
  }
  // No count has ever resolved (e.g. the first guess's query is still in
  // flight): hold the final value if we have it, else the starting size.
  if (revealCount != null) return revealCount;
  return initialCount || null;
}
