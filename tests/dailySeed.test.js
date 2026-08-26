import { describe, it, expect } from 'vitest';
import { utcDateKey, seedFromDateKey, dailyIndex, pickDailyCardName } from '../src/lib/game/dailySeed.js';

const NAMES = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];

describe('utcDateKey', () => {
  it('uses UTC date only, ignoring local time zones', () => {
    // 2026-08-26T23:30:00-02:00 is 2026-08-27T01:30:00Z
    expect(utcDateKey(new Date('2026-08-26T23:30:00-02:00'))).toBe('2026-08-27');
    expect(utcDateKey(new Date('2026-08-26T12:00:00Z'))).toBe('2026-08-26');
  });
});

describe('seedFromDateKey', () => {
  it('is deterministic', () => {
    expect(seedFromDateKey('2026-08-26')).toBe(seedFromDateKey('2026-08-26'));
  });

  it('differs across dates', () => {
    expect(seedFromDateKey('2026-08-26')).not.toBe(seedFromDateKey('2026-08-27'));
  });
});

describe('dailyIndex', () => {
  it('always lands within the list bounds', () => {
    for (let d = 1; d <= 28; d++) {
      const idx = dailyIndex(`2026-08-${String(d).padStart(2, '0')}`, NAMES.length);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(NAMES.length);
    }
  });

  it('is stable for a given date (same card for all players)', () => {
    const a = dailyIndex('2026-08-26', 30000);
    const b = dailyIndex('2026-08-26', 30000);
    expect(a).toBe(b);
  });

  it('picks different cards for different dates over a span', () => {
    const picks = new Set();
    for (let d = 1; d <= 28; d++) {
      picks.add(pickDailyCardName(NAMES, new Date(Date.UTC(2026, 7, d))));
    }
    expect(picks.size).toBeGreaterThan(1);
  });

  it('handles an empty name list', () => {
    expect(dailyIndex('2026-08-26', 0)).toBe(-1);
    expect(pickDailyCardName([], new Date())).toBeUndefined();
  });
});
