import { describe, it, expect } from 'vitest';
import {
  countColor,
  logPosition,
  tierBoundaries,
  tierCenters,
  TIER_COLORS,
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
  it('spaces the color-band boundaries at even 20% intervals', () => {
    const b = tierBoundaries();
    expect(b).toHaveLength(5);
    b.forEach((v, i) => expect(v).toBeCloseTo((i + 1) / 5, 6));
  });

  it('is monotonic and clamps out-of-range values to [0, 1]', () => {
    expect(logPosition(1)).toBeLessThan(logPosition(10));
    expect(logPosition(10)).toBeLessThan(logPosition(1000));
    expect(logPosition(0.001)).toBe(0);
    expect(logPosition(1_000_000)).toBe(1);
  });

  it('places each band boundary at its band edge', () => {
    expect(logPosition(1)).toBeCloseTo(0.2, 6);
    expect(logPosition(1000)).toBeCloseTo(0.8, 6);
  });
});

describe('TIER_COLORS', () => {
  it('runs blue → green → yellow → orange → red', () => {
    expect(TIER_COLORS).toEqual(['#2f6bff', '#1f9d55', '#d4b106', '#e07b1a', '#d64545']);
  });
});

describe('tierCenters', () => {
  it('places the five band centers at even 20% intervals', () => {
    const c = tierCenters();
    c.forEach((v, i) => expect(v).toBeCloseTo((i + 0.5) / 5, 6));
  });
});
