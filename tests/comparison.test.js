import { describe, it, expect } from 'vitest';
import {
  parseTypeLine,
  normalizeManaCost,
  isDualFaced,
  getFaces,
  compareCards,
} from '../src/lib/game/comparison.js';

function makeCard(overrides = {}) {
  return {
    name: 'Test Card',
    oracle_id: 'oracle-1',
    mana_cost: '{2}{R}',
    cmc: 3,
    colors: ['R'],
    type_line: 'Creature — Goblin Warrior',
    power: '3',
    toughness: '2',
    loyalty: undefined,
    defense: undefined,
    released_at: '2020-01-01',
    layout: 'normal',
    ...overrides,
  };
}

function byKey(results, key) {
  return results.find((r) => r.key === key);
}

describe('parseTypeLine', () => {
  it('splits supertypes, types, subtypes', () => {
    expect(parseTypeLine('Legendary Creature — Elf Warrior')).toEqual({
      supertypes: ['Legendary'],
      types: ['Creature'],
      subtypes: ['Elf', 'Warrior'],
    });
  });

  it('handles missing subtype dash', () => {
    expect(parseTypeLine('Instant')).toEqual({
      supertypes: [],
      types: ['Instant'],
      subtypes: [],
    });
  });

  it('handles basic lands', () => {
    expect(parseTypeLine('Basic Land — Forest')).toEqual({
      supertypes: ['Basic'],
      types: ['Land'],
      subtypes: ['Forest'],
    });
  });
});

describe('normalizeManaCost', () => {
  it('strips braces, spaces and case', () => {
    expect(normalizeManaCost('{2}{u}{U}')).toBe('2UU');
    expect(normalizeManaCost('{X}{B/G}')).toBe('XB/G');
    expect(normalizeManaCost('')).toBe('');
  });
});

describe('compareCards — mana cost tiers', () => {
  const target = makeCard();

  it('exact mana cost match is correct', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1' });
    expect(byKey(compareCards(guess, target), 'mana').status).toBe('correct');
  });

  it('same mana value but different cost is partial with note', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', mana_cost: '{1}{R}{R}' });
    const mana = byKey(compareCards(guess, target), 'mana');
    expect(mana.status).toBe('partial');
    expect(mana.note).toContain('mana value');
  });

  it('different cost and value is wrong', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', mana_cost: '{4}{R}', cmc: 5 });
    expect(byKey(compareCards(guess, target), 'mana').status).toBe('wrong');
  });
});

describe('compareCards — sets', () => {
  const target = makeCard();

  it('full color match is correct', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1' });
    expect(byKey(compareCards(guess, target), 'colors').status).toBe('correct');
  });

  it('overlapping colors are partial with matching values first', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', colors: ['R', 'W'] });
    const colors = byKey(compareCards(guess, target), 'colors');
    expect(colors.status).toBe('partial');
    expect(colors.correct).toEqual(['R']);
    expect(colors.wrong).toEqual(['W']);
  });

  it('disjoint subtypes are wrong', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', type_line: 'Creature — Elf Druid' });
    const subtypes = byKey(compareCards(guess, target), 'subtypes');
    expect(subtypes.status).toBe('wrong');
    expect(subtypes.wrong).toEqual(['Elf', 'Druid']);
  });

  it('partial subtype overlap keeps 2 of 3 matching visible', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', type_line: 'Creature — Goblin Warrior Berserker' });
    const subtypes = byKey(compareCards(guess, target), 'subtypes');
    expect(subtypes.status).toBe('partial');
    expect(subtypes.correct).toEqual(['Goblin', 'Warrior']);
    expect(subtypes.wrong).toEqual(['Berserker']);
  });
});

describe('compareCards — creature stats applicability', () => {
  it('exact power/toughness match is correct', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1' });
    const results = compareCards(guess, makeCard());
    expect(byKey(results, 'power').status).toBe('correct');
    expect(byKey(results, 'toughness').status).toBe('correct');
  });

  it('non-creature guess has no power/toughness lines', () => {
    const guess = makeCard({
      name: 'A',
      oracle_id: 'g1',
      type_line: 'Instant',
      power: undefined,
      toughness: undefined,
    });
    const results = compareCards(guess, makeCard());
    expect(byKey(results, 'power')).toBeUndefined();
    expect(byKey(results, 'toughness')).toBeUndefined();
  });

  it('creature guess vs non-creature target marks stats wrong but applicable', () => {
    const target = makeCard({ type_line: 'Instant', power: undefined, toughness: undefined });
    const results = compareCards(makeCard({ name: 'A', oracle_id: 'g1' }), target);
    expect(byKey(results, 'power')).toMatchObject({ status: 'wrong', applicable: true });
  });

  it('loyalty only appears for planeswalker guesses', () => {
    const walker = makeCard({
      name: 'A',
      oracle_id: 'g1',
      type_line: 'Legendary Planeswalker — Jace',
      power: undefined,
      toughness: undefined,
      loyalty: '3',
    });
    const target = makeCard({ type_line: 'Legendary Planeswalker — Jace', power: undefined, toughness: undefined, loyalty: '4' });
    const results = compareCards(walker, target);
    expect(byKey(results, 'loyalty')).toMatchObject({ status: 'wrong', correct: [], wrong: ['3'] });
  });
});

describe('compareCards — release date and keywords', () => {
  it('same release date is correct; otherwise wrong with direction note', () => {
    const target = makeCard({ released_at: '2020-06-01' });
    const older = compareCards(makeCard({ name: 'A', released_at: '2019-01-01' }), target);
    expect(byKey(older, 'released')).toMatchObject({ status: 'wrong', note: 'target is newer' });
    const same = compareCards(makeCard({ name: 'A', released_at: '2020-06-01' }), target);
    expect(byKey(same, 'released').status).toBe('correct');
  });

  it('keywords compare partially when guess has keywords', () => {
    const guess = makeCard({ name: 'A', keywords: ['Flying', 'Cycling', 'Haste'] });
    const target = makeCard({ keywords: ['Flying', 'Cycling'] });
    const results = compareCards(guess, target);
    const line = byKey(results, 'keywords');
    expect(line).toMatchObject({ status: 'partial', applicable: true });
    expect(line.correct).toEqual(['Flying', 'Cycling']);
    expect(line.wrong).toEqual(['Haste']);
  });

  it('keywords line is not applicable when the guess has no keywords', () => {
    const results = compareCards(makeCard({ name: 'A', keywords: [] }), makeCard({ keywords: ['Flying'] }));
    expect(byKey(results, 'keywords').applicable).toBe(false);
  });

  it('both-empty set properties come back correct with the placeholder', () => {
    const guess = makeCard({ colors: [], type_line: 'Creature', keywords: [] });
    const target = makeCard({ colors: [], type_line: 'Creature', keywords: [] });
    const results = compareCards(guess, target);
    for (const key of ['colors', 'supertypes', 'subtypes', 'keywords']) {
      const l = byKey(results, key);
      expect(l.status).toBe('correct');
      expect(l.correct).toEqual(['—']);
      expect(l.wrong).toEqual([]);
    }
  });
});

describe('compareCards — dual-faced cards', () => {
  const backFace = {
    name: 'Beast Side',
    mana_cost: '',
    colors: ['G'],
    type_line: 'Creature — Beast',
    power: '4',
    toughness: '4',
  };
  const frontFace = {
    name: 'Human Side',
    mana_cost: '{1}{G}',
    colors: ['G'],
    type_line: 'Creature — Human',
    power: '2',
    toughness: '2',
  };
  const dfc = makeCard({
    name: 'Human Side // Beast Side',
    layout: 'transform',
    mana_cost: '{1}{G}',
    colors: ['G'],
    card_faces: [frontFace, backFace],
    power: undefined,
    toughness: undefined,
  });

  it('detects dual-faced layouts', () => {
    expect(isDualFaced(dfc)).toBe(true);
    expect(isDualFaced(makeCard())).toBe(false);
    expect(getFaces(dfc)).toHaveLength(2);
  });

  it('matching dual-faced status is correct; mismatch is wrong', () => {
    const resultsMatch = compareCards(dfc, dfc);
    expect(byKey(resultsMatch, 'dualfaced').status).toBe('correct');
    const resultsMismatch = compareCards(dfc, makeCard());
    expect(byKey(resultsMismatch, 'dualfaced')).toMatchObject({ status: 'wrong', wrong: ['Yes'] });
  });

  it('no dual-faced line when the guess is single-faced', () => {
    expect(byKey(compareCards(makeCard(), makeCard()), 'dualfaced')).toBeUndefined();
    expect(byKey(compareCards(makeCard(), dfc), 'dualfaced')).toBeUndefined();
  });

  it('back-face properties are compared for the back face', () => {
    const other = makeCard({
      name: 'Other // Beast Side',
      layout: 'transform',
      card_faces: [
        { ...frontFace, name: 'Other' },
        { ...backFace },
      ],
    });
    const results = compareCards(dfc, other);
    expect(byKey(results, 'back:power').status).toBe('correct');
    expect(byKey(results, 'back:subtypes').status).toBe('correct');
  });

  it('dual guess vs single target shows back-face lines as wrong', () => {
    const results = compareCards(dfc, makeCard());
    expect(byKey(results, 'back:types').status).toBe('wrong');
  });
});
