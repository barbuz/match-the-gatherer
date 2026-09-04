import { describe, it, expect } from 'vitest';
import { utcDateKey, seedFromDateKey, dailyIndex, pickDailyCardName, resolveVintageLegalCard, resolveDailyTargetCard } from '../src/lib/game/dailySeed.js';

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
const legalH = (name) => ({ name: name, legalities: { vintage: 'legal' }, reprint: false });
const restrictedH = (name) => ({ name: name, legalities: { vintage: 'restricted' }, reprint: false });
const reprintH = (name) => ({ name: name, legalities: { vintage: 'legal' }, reprint: true });
const illegalH = (name) => ({ name: name, legalities: { vintage: 'not_legal' }, reprint: false });

async function makeFakeFetch(map) {
  const calls = [];
  return [async (name) => {
    calls.push(name);
    const entry = map.get(name);
    return entry ?? null;
  }, calls];
}

describe('resolveVintageLegalCard', () => {
  it('returns the first legal card from the start index', async () => {
    const map = new Map([['Beta', legalH('Beta')], ['Gamma', illegalH('Gamma')]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta', 'Gamma'], 1, fetchCard);
    expect(card).toEqual(legalH('Beta'));
    expect(calls).toEqual(['Beta']);
  });
});

describe('resolveVintageLegalCard', () => {
  it('rerolls forward past illegal cards', async () => {
    const map = new Map([['Alpha', illegalH('Alpha')], ['Beta', illegalH('Beta')], ['Gamma', legalH('Gamma')]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta', 'Gamma'], 0, fetchCard);
    expect(card).toEqual(legalH('Gamma'));
    expect(calls).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('wraps around the end of the list', async () => {
    const map = new Map([['Alpha', legalH('Alpha')], ['Beta', illegalH('Beta')]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta'], 1, fetchCard);
    expect(card).toEqual(legalH('Alpha'));
    expect(calls).toEqual(['Beta', 'Alpha']);
  });

  it('skips reprints and counts restricted as legal', async () => {
    const map = new Map([
      ['Alpha', reprintH('Alpha')],
      ['Beta', restrictedH('Beta')],
    ]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta'], 0, fetchCard);
    expect(card).toEqual(restrictedH('Beta'));
  });

  it('returns undefined when no name is legal', async () => {
    const map = new Map([['Alpha', illegalH('Alpha')], ['Beta', null]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    await expect(resolveVintageLegalCard(['Alpha', 'Beta'], 0, fetchCard)).resolves.toBeUndefined();
  });

  it('returns undefined on invalid input', async () => {
    const map = new Map();
    const [fetchCard, calls] = await makeFakeFetch(map);
    await expect(resolveVintageLegalCard([], 0, fetchCard)).resolves.toBeUndefined();
    await expect(resolveVintageLegalCard(['Alpha'], -1, fetchCard)).resolves.toBeUndefined();
    await expect(resolveVintageLegalCard(['Alpha'], 1, fetchCard)).resolves.toBeUndefined();
    await expect(resolveVintageLegalCard(['Alpha'], 1.5, fetchCard)).resolves.toBeUndefined();
  });
});

describe('resolveDailyTargetCard', () => {
  it('rerolls from the deterministic daily index', async () => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const map = new Map([
      ['Epsilon', reprintH('Epsilon')],
      ['Alpha', illegalH('Alpha')],
      ['Beta', legalH('Beta')],
    ]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveDailyTargetCard(names, fetchCard, new Date('2026-08-26T00:00:00Z'));
    expect(card).toEqual(legalH('Beta'));
    expect(calls).toEqual(['Epsilon', 'Alpha', 'Beta']);
  });

  it('is deterministic for a given date', async () => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const map = new Map([['Epsilon', legalH('Epsilon')]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const a = await resolveDailyTargetCard(names, fetchCard, new Date('2026-08-26T00:00:00Z'));
    const b = await resolveDailyTargetCard(names, fetchCard, new Date('2026-08-26T00:00:00Z'));
    expect(a).toEqual(b);
  });

  it('returns undefined when no name resolves to a legal card', async () => {
    const names = ['Alpha', 'Beta', 'Gamma'];
    const map = new Map([['Alpha', illegalH('Alpha')], ['Beta', null], ['Gamma', illegalH('Gamma')]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    await expect(resolveDailyTargetCard(names, fetchCard, new Date('2026-08-26T00:00:00Z'))).resolves.toBeUndefined();
  });

  it('handles an empty name list', async () => {
    const [fetchCard, calls] = await makeFakeFetch(new Map());
    await expect(resolveDailyTargetCard([], fetchCard, new Date('2026-08-26T00:00:00Z'))).resolves.toBeUndefined();
  });
});
