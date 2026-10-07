/**
 * Shared color scheme for "how many cards still match the known information".
 * Used by the end-game summary squares and the hint button's gradient bar so
 * both speak the same visual language.
 *
 * Five bands: blue = exactly 1, green ≤ 10, yellow ≤ 100, orange ≤ 1000,
 * red > 1000. The counts span five orders of magnitude, so the bar positions
 * them on a log scale running from 0.1 to 10 000 — five equal decades, which
 * puts each band boundary at an even 20% of the bar.
 */

/** Lower edge of the bar's log scale (below 1, so the blue band has width). */
export const MIN_COUNT = 0.1;

/** Upper edge: 10 000, the start of the red band — ten times past the cutoff. */
export const MAX_COUNT = 10000;

/** The five band edges, low → high, at even 20% intervals on the bar. */
const BOUNDS = [1, 10, 100, 1000, MAX_COUNT];

/** Ordered low → high; each entry's color fills up to `max` (exclusive). */
const TIERS = [
  { max: 1, color: '#2f6bff' }, // blue — exactly one
  { max: 10, color: '#1f9d55' }, // green — ≤ 10
  { max: 100, color: '#d4b106' }, // yellow — ≤ 100
  { max: 1000, color: '#e07b1a' }, // orange — ≤ 1000
  { max: Infinity, color: '#d64545' }, // red — > 1000
];

/** The tier colors, low → high (blue, green, yellow, orange, red). */
export const TIER_COLORS = TIERS.map((t) => t.color);

/** Hex color for a match count (null/undefined → gray, count still unknown). */
export function countColor(n) {
  if (n == null) return '#8b91a3';
  for (const tier of TIERS) {
    if (n <= tier.max) return tier.color;
  }
  return TIERS[TIERS.length - 1].color;
}

/**
 * Position of a count on the bar, in [0, 1], on a log scale from `min` to
 * `max`. Values below `min` clamp to the left edge, values at or above `max`
 * clamp to the right.
 */
export function logPosition(n, min = MIN_COUNT, max = MAX_COUNT) {
  const x = Math.min(Math.max(n, min), max);
  return (Math.log(x) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

/**
 * Positions of the color-band boundaries (1, 10, 100, 1000, max) on the bar,
 * low → high. Used to place the gradient's color stops.
 */
export function tierBoundaries(min = MIN_COUNT, max = MAX_COUNT) {
  return BOUNDS.map((b) => logPosition(Math.min(b, max), min, max));
}

/**
 * Positions of each color band's center (blue, green, yellow, orange, red),
 * low → high — the points where the gradient shows each band's pure color.
 */
export function tierCenters(min = MIN_COUNT, max = MAX_COUNT) {
  const edges = [0, ...tierBoundaries(min, max)];
  return TIER_COLORS.map((_, i) => (edges[i] + edges[i + 1]) / 2);
}
