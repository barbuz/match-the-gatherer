/**
 * Shared color scheme for "how many cards still match the known information".
 * Used by the end-game summary bars and the hint button's gradient bar so both
 * speak the same visual language.
 *
 * Five bands: blue = exactly 1, green ≤ 10, yellow ≤ 100, orange ≤ 1000,
 * red > 1000. The bar positions counts on a log scale from 1 to `MAX_COUNT`.
 *
 * Because a log scale spends a full decade on every order of magnitude, the
 * thresholds (1, 10, 100, 1000, max) sit at even intervals — so the blue band,
 * which is a *single value* (exactly 1), collapses to a thin tip at the far
 * left, green starts almost immediately, and red owns the whole right portion.
 */

/** Left edge of the bar's log scale: the minimum possible count. */
export const MIN_COUNT = 1;

/** Right edge: 50 000, well past both the red cutoff and the ~35k name list. */
export const MAX_COUNT = 50000;

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
 * `max` (50 000). Counts below `min` clamp to the left edge, counts at or above
 * `max` clamp to the right.
 */
export function logPosition(n, min = MIN_COUNT, max = MAX_COUNT) {
  const x = Math.min(Math.max(n, min), max);
  return (Math.log(x) - Math.log(min)) / (Math.log(max) - Math.log(min));
}

/**
 * Value edges of the five color bands, low → high, as log positions in [0, 1].
 * Six edges delimit five bands: blue (1), green (2–10), yellow (11–100),
 * orange (101–1000), red (> 1000 up to `max`). The blue/green edge is placed at
 * 2 so the single-value blue band still gets a visible sliver at the tip.
 */
export function bandEdges(min = MIN_COUNT, max = MAX_COUNT) {
  return [1, 2, 10, 100, 1000, max].map((v) => logPosition(v, min, max));
}

/**
 * CSS gradient stops (`[color, position]`) that run the five tier colors across
 * the bar in proportion to their band widths. Each color holds flat across the
 * middle of its band and blends to its neighbor over the band's outer fifth,
 * giving a smooth gradient that stays faithful to the boundaries rather than
 * spreading the colors evenly.
 */
export function gradientStops(min = MIN_COUNT, max = MAX_COUNT) {
  const edges = bandEdges(min, max);
  const stops = [];
  for (let i = 0; i < TIER_COLORS.length; i++) {
    const lo = edges[i];
    const hi = edges[i + 1];
    const pad = (hi - lo) / 5;
    stops.push([TIER_COLORS[i], lo + pad]);
    stops.push([TIER_COLORS[i], hi - pad]);
  }
  return stops;
}
