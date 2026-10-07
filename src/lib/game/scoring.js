/** Match-score calculation and share-text rendering (spec §11). */

import { propertyTokens } from './comparison.js';
import { countColor } from './countColors.js';

export const SHARE_BLOCKS = 10;

// The five tier colors (plus gray for unknown) as colored squares, so the
// shareable text carries the same count-color scheme as the on-screen summary.
const COUNT_SQUARES = {
  '#2f6bff': '🟦',
  '#1f9d55': '🟩',
  '#d4b106': '🟨',
  '#e07b1a': '🟧',
  '#d64545': '🟥',
  '#8b91a3': '⬜',
};

/**
 * Token-overlap (Sørensen–Dice) score for one property: the tokens shared by
 * both cards, counted once from each side, over the total number of tokens on
 * the two cards combined:
 *
 *   (tokens of guess on target + tokens of target on guess) / (guess + target)
 *
 * Duplicate tokens collapse (a word repeated in an oracle text is one token),
 * so the result is always in [0, 1]. Two empty token sets contribute nothing
 * and are skipped rather than counted as a perfect match.
 */
function overlapScore(guessTokens, targetTokens) {
  const g = new Set(guessTokens ?? []);
  const t = new Set(targetTokens ?? []);
  const denom = g.size + t.size;
  if (denom === 0) return null;
  let shared = 0;
  for (const token of g) {
    if (t.has(token)) shared += 1;
  }
  return (2 * shared) / denom;
}

/**
 * Score one guess against the target: for every property present on either
 * card, compute its token-overlap score, then average across properties.
 * Returns `{ ratio }` in [0, 1]; scale to a percentage for display.
 *
 * A property counts for the average whenever either card has tokens for it, so
 * a property the guess lacks but the target has (e.g. a non-creature guess vs
 * a creature target) scores 0 for that property rather than being ignored.
 */
export function scoreGuess(guess, target) {
  const g = propertyTokens(guess ?? {});
  const t = propertyTokens(target ?? {});
  const keys = new Set([...Object.keys(g), ...Object.keys(t)]);
  let sum = 0;
  let count = 0;
  for (const key of keys) {
    const propertyScore = overlapScore(g[key], t[key]);
    if (propertyScore == null) continue;
    sum += propertyScore;
    count += 1;
  }
  return { ratio: count === 0 ? 0 : sum / count };
}

/** Horizontal emoji bar, proportionally fuller the higher the ratio. */
export function emojiBar(ratio, blocks = SHARE_BLOCKS) {
  const filled = Math.max(0, Math.min(blocks, Math.round(ratio * blocks)));
  return '🟩'.repeat(filled) + '⬜'.repeat(blocks - filled);
}

/**
 * Copy-pasteable share block: one emoji-bar row per guess, ending with the
 * game URL (§11). `targetCard` is needed to score each guess. Each row ends
 * with a colored square encoding that guess's Scryfall match count
 * (`hintCounts`) — the same color scheme as the on-screen summary — or a gray
 * square when the count never resolved.
 */
export function buildShareText({
  dayKey,
  guesses,
  won,
  url,
  hintsUsed = [],
  targetCard,
  hintCounts = {},
}) {
  const ratios = guesses.map((g) => scoreGuess(g.card, targetCard).ratio);
  const bestPct = Math.max(0, ...ratios.map((r) => Math.round(r * 100)));
  const header = won
    ? `Match the Gatherer ${dayKey} — Matched in ${guesses.length}`
    : `Match the Gatherer ${dayKey} — ${bestPct}% matched`;
  const used = new Set(hintsUsed ?? []);
  const rows = guesses.map((g, i) => {
    const marker = used.has(i) ? '\u{1F52E}' : '';
    const count = hintCounts?.[i];
    const square = COUNT_SQUARES[countColor(count)] ?? '⬜';
    return `${emojiBar(ratios[i])}${marker} ${square}`;
  });
  return [header, ...rows, url].join('\n');
}
