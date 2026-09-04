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
  it('resolves the card at the index picked for attempt 0', async () => {
    const map = new Map([['Beta', legalH('Beta')], ['Gamma', illegalH('Gamma')]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta', 'Gamma'], () => 1, fetchCard);
    expect(card).toEqual(legalH('Beta'));
    expect(calls).toEqual(['Beta']);
  });
  it('rerolls with pickIndex until a legal card is found', async () => {
    const map = new Map([['Alpha', illegalH('Alpha')], ['Gamma', null], ['Beta', legalH('Beta')]]);
    const pickIndex = (attempt) => [0,2,1][attempt];
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta', 'Gamma'], pickIndex, fetchCard);
    expect(card).toEqual(legalH('Beta'));
    expect(calls).toEqual(['Alpha', 'Gamma', 'Beta']);
  });
  it('allows pickIndex to revisit the same name', async () => {
    const map = new Map([['Alpha', illegalH('Alpha')], ['Beta', legalH('Beta')]]);
    const pickIndex = (attempt) => [0,0,1][attempt];
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta'], pickIndex, fetchCard);
    expect(card).toEqual(legalH('Beta'));
    expect(calls).toEqual(['Alpha', 'Alpha', 'Beta']);
  });
  it('skips reprints and counts restricted as legal', async () => {
    const map = new Map([
      ['Alpha', reprintH('Alpha')],
      ['Beta', restrictedH('Beta')],
    ]);
    const pickIndex = (attempt) => [0,1][attempt];
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveVintageLegalCard(['Alpha', 'Beta'], pickIndex, fetchCard);
    expect(card).toEqual(restrictedH('Beta'));
    expect(calls).toEqual(['Alpha', 'Beta']);
  });
  it('gives up after 100 attempts when nothing is legal', async () => {
    const map = new Map([['Alpha', illegalH('Alpha')], ['Beta', null]]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    await expect(resolveVintageLegalCard(['Alpha', 'Beta'], () => 0, fetchCard)).resolves.toBeUndefined();
    expect(calls).toHaveLength(100);
    expect(calls.every((name) => name === 'Alpha')).toBe(true);
  });
  it('returns undefined on invalid input', async () => {
    const [fetchCard, calls] = await makeFakeFetch(new Map());
    await expect(resolveVintageLegalCard([], () => 0, fetchCard)).resolves.toBeUndefined();
    await expect(resolveVintageLegalCard(['Alpha'], () => -1, fetchCard)).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

describe('resolveDailyTargetCard', () => {
  it('rerolls through deterministic attempt seeds', async () => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const map = new Map([
      ['Epsilon', reprintH('Epsilon')],
      ['Alpha', illegalH('Alpha')],
      ['Beta', legalH('Beta')],
    ]);
    const [fetchCard, calls] = await makeFakeFetch(map);
    const card = await resolveDailyTargetCard(names, fetchCard, new Date('2026-08-26T00:00:00Z'));
    expect(card).toEqual(legalH('Beta'));
    expect(calls).toEqual(['Epsilon', 'Alpha', 'Gamma', 'Delta', 'Alpha', 'Beta']);
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
    expect(calls).toHaveLength(100);
  });

  it('handles an empty name list', async () => {
    const [fetchCard, calls] = await makeFakeFetch(new Map());
    await expect(resolveDailyTargetCard([], fetchCard, new Date('2026-08-26T00:00:00Z'))).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});
