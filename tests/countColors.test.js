import { describe, it, expect } from 'vitest';
import {
  countColor,
  logPosition,
  bandEdges,
  gradientStops,
  TIER_COLORS,
  MIN_COUNT,
  MAX_COUNT,
} from '../src/lib/game/countColors.js';

describe('countColor', () => {
  it('maps each band to its color', () => {
    expect(countColor(1)).toBe('#2f6bff'); // blue
    expect(countColor(0)).toBe('#2f6bff'); // blue
    expect(countColor(2)).toBe('#1f9d55'); // green
    expect(countColor(10)).toBe('#1f9d55'); // green
    expect(countColor(11)).toBe('#d4b106'); // yellow
    expect(countColor(100)).toBe('#d4b106'); // yellow
    expect(countColor(101)).toBe('#e07b1a'); // orange
    expect(countColor(1000)).toBe('#e07b1a'); // orange
    expect(countColor(1001)).toBe('#d64545'); // red
    expect(countColor(30000)).toBe('#d64545'); // red
  });

  it('renders unknown counts gray', () => {
    expect(countColor(null)).toBe('#8b91a3');
    expect(countColor(undefined)).toBe('#8b91a3');
  });
});

describe('logPosition', () => {
  it('is monotonic and clamps out-of-range values to [0, 1]', () => {
    expect(logPosition(1)).toBeLessThan(logPosition(10));
    expect(logPosition(10)).toBeLessThan(logPosition(1000));
    expect(logPosition(0.5)).toBe(0);
    expect(logPosition(1_000_000)).toBe(1);
  });

  it('runs from the left edge (1) to the right edge (MAX_COUNT)', () => {
    expect(logPosition(1)).toBeCloseTo(0, 6);
    expect(logPosition(MAX_COUNT)).toBeCloseTo(1, 6);
    expect(MIN_COUNT).toBe(1);
  });

  it('gives blue only a thin tip and red the whole right portion', () => {
    // Blue is a single value, so its band is tiny; green starts almost at once.
    const [blue0, blue1] = bandEdges();
    expect(blue1).toBeLessThan(0.08); // blue band is a thin tip
    expect(blue0).toBe(0);
    // Red (> 1000) owns everything from the 1000 edge to the right.
    expect(logPosition(1000)).toBeLessThan(0.8);
    expect(1 - logPosition(1000)).toBeGreaterThan(0.2);
  });
});

describe('bandEdges', () => {
  it('returns six edges delimiting the five bands, low → high', () => {
    const e = bandEdges();
    expect(e).toHaveLength(6);
    e.forEach((v, i) => {
      if (i > 0) expect(v).toBeGreaterThanOrEqual(e[i - 1]);
    });
    expect(e[0]).toBeCloseTo(0, 6);
    expect(e[5]).toBeCloseTo(1, 6);
  });
});

describe('gradientStops', () => {
  it('starts with blue at the tip and ends with red before max', () => {
    const stops = gradientStops();
    expect(stops[0][0]).toBe(TIER_COLORS[0]); // blue first
    expect(stops[0][1]).toBeLessThan(0.05); // still in the thin blue tip
    expect(stops[stops.length - 1][0]).toBe(TIER_COLORS[4]); // red last
  });

  it('keeps each stop within [0, 1] and non-decreasing', () => {
    const stops = gradientStops();
    let prev = -1;
    for (const [, p] of stops) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('TIER_COLORS', () => {
  it('runs blue → green → yellow → orange → red', () => {
    expect(TIER_COLORS).toEqual(['#2f6bff', '#1f9d55', '#d4b106', '#e07b1a', '#d64545']);
  });
});
