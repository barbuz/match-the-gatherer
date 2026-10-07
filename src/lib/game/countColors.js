/**
 * Shared color scheme for "how many cards still match the known information".
 * Used by the end-game summary bars and the hint button's gradient bar so both
 * speak the same visual language.
 *
 * Five bands: blue = exactly 1, green ≤ 10, yellow ≤ 100, orange ≤ 1000,
 * red > 1000. The bar positions counts on a log scale whose **left edge is the
 * value 1** (the smallest count that can ever occur), so the blue band always
 * starts at the far left and we never show a value below 1. The five band
 * boundaries (1, 10, 100, 1000, 10 000) sit at even 20% intervals.
 */

/** Left edge of the bar's log scale: the minimum possible count. */
export const MIN_COUNT = 1;

/** Right edge: 10 000, ten times past the red cutoff, so every band is equal. */
export const MAX_COUNT = 10000;

/** The five band edges, low → high, at even 20% intervals on the bar. */
const BOUNDS = [1, 10, 100, 1000, MAX_COUNT];

/** Ordered low → high; each entry's color fills up to `max` (inclusive). */
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
 * Position of a count on the bar, in [0, 1], on a log scale from `min` (1) to
 * `max` (10 000). Counts below `min` clamp to the left edge, counts at or above
 * `max` clamp to the right.
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
 * Spread evenly (20% apart) so the gradient runs through all five colors
 * roughly evenly, as the color scheme intends, rather than bunching the narrow
 * low bands against the value boundaries.
 */
export function tierCenters() {
  return TIER_COLORS.map((_, i) => (i + 0.5) / TIER_COLORS.length);
}
