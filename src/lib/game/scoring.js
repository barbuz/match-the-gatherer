/** Match-score calculation and share-text rendering (spec §11). */

export const SHARE_BLOCKS = 10;

/**
 * Score one guess: matched properties out of the properties applicable to
 * the GUESSED card, so the denominator can't leak target information.
 * A full match counts 1, a partial match counts 0.5.
 */
export function scoreResults(results) {
  let matched = 0;
  let applicable = 0;
  for (const r of results) {
    if (!r.applicable) continue;
    applicable += 1;
    if (r.status === 'correct') matched += 1;
    else if (r.status === 'partial') matched += 0.5;
  }
  return { matched, applicable, ratio: applicable === 0 ? 0 : matched / applicable };
}

/** Horizontal emoji bar, proportionally fuller the higher the ratio. */
export function emojiBar(ratio, blocks = SHARE_BLOCKS) {
  const filled = Math.max(0, Math.min(blocks, Math.round(ratio * blocks)));
  return '🟩'.repeat(filled) + '⬜'.repeat(blocks - filled);
}

/**
 * Copy-pasteable share block: one emoji-bar row per guess, ending with the
 * game URL (§11).
 */
export function buildShareText({ dayKey, guesses, won, url, hintsUsed = [] }) {
  const bestPct = Math.max(0, ...guesses.map((g) => Math.round(scoreResults(g.results).ratio * 100)));
  const header = won
    ? `Match the Gatherer ${dayKey} — Matched in ${guesses.length}`
    : `Match the Gatherer ${dayKey} — ${bestPct}% matched`;
  const used = new Set(hintsUsed ?? []);
  const rows = guesses.map((g, i) => {
    const marker = used.has(i) ? '\u{1F52E}' : '';
    return emojiBar(scoreResults(g.results).ratio) + marker;
  });
  return [header, ...rows, url].join('\n');
}
