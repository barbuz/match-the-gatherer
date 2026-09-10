import { describe, it, expect } from 'vitest';
import {
  parseTypeLine,
  normalizeManaCost,
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
    rarity: 'uncommon',
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

  it('exact mana cost match shows a matching MV beside it', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1' });
    const mana = byKey(compareCards(guess, target), 'mana');
    expect(mana.status).toBe('correct');
    expect(mana.mvValues).toEqual([{ text: '3', status: 'correct' }]);
  });

  it('same mana value but different cost is wrong; MV marked correct', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', mana_cost: '{1}{R}{R}' });
    const mana = byKey(compareCards(guess, target), 'mana');
    expect(mana.status).toBe('wrong');
    expect(mana.note).toBeUndefined();
    expect(mana.mvValues).toEqual([{ text: '3', status: 'correct' }]);
  });

  it('different cost and value is wrong with MV marked wrong', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', mana_cost: '{4}{R}', cmc: 5 });
    const mana = byKey(compareCards(guess, target), 'mana');
    expect(mana.status).toBe('wrong');
    expect(mana.mvValues).toEqual([{ text: '5', status: 'wrong' }]);
  });

  it('cards without a mana value still show MV as undefined', () => {
    const land = makeCard({ name: 'A', oracle_id: 'g1', mana_cost: '', cmc: 0 });
    const mana = byKey(compareCards(land, target), 'mana');
    expect(mana.mvValues).toEqual([{ text: '0', status: 'wrong' }]);
  });

  it('split card card-level combined cost is not emitted as a third whole cost', () => {
    // Scryfall puts the concatenated face costs in the split card's card-level
    // `mana_cost` (`'{1}{R} // {1}{U}}'`). Only the two face-level costs
    // may appear, so guessing "Fire // Ice" shows exactly two cost chips.

    const fireIce = {
      ...makeCard(),
      name: 'Fire // Ice',
      layout: 'split',
      mana_cost: '{1}{R} // {1}{U}',
      cmc: 4,
      colors: ['R', 'U'],
      card_faces: [
        { name: 'Fire', mana_cost: '{1}{R}', colors: ['R'], type_line: 'Instant', power: undefined, toughness: undefined },
        { name: 'Ice', mana_cost: '{1}{U}', colors: ['U'], type_line: 'Instant', power: undefined, toughness: undefined },
      ],
      power: undefined,
      toughness: undefined,
    };
    const mana = byKey(compareCards(fireIce, { ...fireIce, name: 'Copy' }), 'mana');
    expect(mana.status).toBe('correct');
    expect(mana.correct).toEqual(['{1}{R}', '{1}{U}']);
    expect(mana.correct).toHaveLength(2);
  });

 it('mana row segments phrase per-face whole costs with a // separator', () => {
    const fireIce = makeCard({
      name: 'Fire // Ice',
      layout: 'split',
      mana_cost: '{1}{R} // {1}{U}',
      cmc: 4,
      colors: ['R', 'U'],
      card_faces: [
        { name: 'Fire', mana_cost: '{1}{R}', colors: ['R'], type_line: 'Instant', power: undefined, toughness: undefined },
        { name: 'Ice', mana_cost: '{1}{U}', colors: ['U'], type_line: 'Instant', power: undefined, toughness: undefined },
      ],
      power: undefined,
      toughness: undefined,
    });
    const mana = byKey(compareCards(fireIce, { ...fireIce, name: 'Copy' }), 'mana');
    expect(mana.segments).toEqual([
      { text: '{1}{R}', token: true, status: 'correct' },
      { sep: true, text: '//' },
      { text: '{1}{U}', token: true, status: 'correct' },
    ]);
  });

 it('mana segments strike each whole cost that does not appear on the target', () => {
    const guess = makeCard({
      name: 'Fire // Ice',
      layout: 'split',
      mana_cost: '{2}{R} // {1}{U}',
      cmc: 4,
      card_faces: [
        { name: 'Fire', mana_cost: '{2}{R}', colors: ['R'], type_line: 'Instant', power: undefined, toughness: undefined },
        { name: 'Ice', mana_cost: '{1}{U}', colors: ['U'], type_line: 'Instant', power: undefined, toughness: undefined },
      ],
      colors: ['R', 'U'],
    });
    const target = makeCard({ name: 'T', mana_cost: '{R}{U} // {3}{B}', cmc: 5, card_faces: [
      { name: 'T1', mana_cost: '{R}{U}', colors: ['R', 'U'], type_line: 'Instant', power: undefined, toughness: undefined },
      { name: 'T2', mana_cost: '{3}{B}', colors: ['B'], type_line: 'Instant', power: undefined, toughness: undefined },
    ], colors: ['R', 'U', 'B'], layout: 'split', power: undefined, toughness: undefined });
    const mana = byKey(compareCards(guess, target), 'mana');
    expect(mana.status).toBe('wrong');
    expect(mana.segments).toEqual([
      { text: '{2}{R}', token: true, status: 'wrong' },
      { sep: true, text: '//' },
      { text: '{1}{U}', token: true, status: 'wrong' },
    ]);
    // Each face's whole cost is judged as a unit: neither guessed whole cost
    // is on the target, so both chips are struck as wholes (no symbol-by-symbol
    // coloring); a lone {R}/{U} on a target face doesn't count as a match.

    expect(mana.wrong).toEqual(['{2}{R}', '{1}{U}']);
    expect(mana.correct).toEqual([]);
  });

 it('mana segments render the no-cost placeholder per face', () => {
    const dfc = makeCard({
      name: 'Human Side // Beast Side',
      layout: 'transform',
      mana_cost: '{1}{G}',
      cmc: 3,
      colors: ['G'],
      card_faces: [
        { name: 'Human Side', mana_cost: '{1}{G}', colors: ['G'], type_line: 'Creature — Human', power: '2', toughness: '2' },
        { name: 'Beast Side', mana_cost: '', colors: ['G'], type_line: 'Creature — Beast', power: '4', toughness: '4' },
      ],
      power: undefined,
      toughness: undefined,
    });
    const mana = byKey(compareCards(dfc, dfc), 'mana');
    expect(mana.segments).toEqual([
      { text: '{1}{G}', token: true, status: 'correct' },
      { sep: true, text: '//' },
      { text: '(no mana cost)', status: 'correct' },
    ]);
  });
});

describe('compareCards — sets', () => {
  const target = makeCard();

  it('full color match is correct', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1' });
    expect(byKey(compareCards(guess, target), 'colors').status).toBe('correct');
  });

  it('overlapping colors are wrong with matching values first', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', colors: ['R', 'W'] });
    const colors = byKey(compareCards(guess, target), 'colors');
    expect(colors.status).toBe('wrong');
    expect(colors.correct).toEqual(['R']);
    expect(colors.wrong).toEqual(['W']);
  });

  it('single type line combines supertypes, types and subtypes', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', type_line: 'Creature — Elf Druid' });
    const target = makeCard({ name: 'T', oracle_id: 't1', type_line: 'Creature — Goblin Warrior' });
    const type = byKey(compareCards(guess, target), 'type');
    expect(type.status).toBe('wrong');
    expect(type.correct).toEqual(['Creature']);
    expect(type.wrong).toEqual(['Elf', 'Druid']);
  });

  it('type line keeps matching tokens visible in order', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', type_line: 'Creature — Goblin Warrior Berserker' });
    const type = byKey(compareCards(guess, target), 'type');
    expect(type.status).toBe('wrong');
    expect(type.correct).toEqual(['Creature', 'Goblin', 'Warrior']);
    expect(type.wrong).toEqual(['Berserker']);
  });

  it('type line segments phrase the card as "Supertypes Types — Subtypes"', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', type_line: 'Legendary Creature — Hydra Avatar' });
    const target = makeCard({ name: 'T', oracle_id: 't1', type_line: 'Legendary Creature — Hydra Avatar' });
    const type = byKey(compareCards(guess, target), 'type');
    expect(type.status).toBe('correct');
    expect(type.segments).toEqual([
      { text: 'Legendary', status: 'correct' },
      { text: 'Creature', status: 'correct' },
      { dash: true },
      { text: 'Hydra', status: 'correct' },
      { text: 'Avatar', status: 'correct' },
    ]);
  });

  it('type line without subtypes has no dash segment', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1', type_line: 'Instant' });
    const target = makeCard({ name: 'T', oracle_id: 't1', type_line: 'Sorcery' });
    const type = byKey(compareCards(guess, target), 'type');
    expect(type.status).toBe('wrong');
    expect(type.segments).toEqual([{ text: 'Instant', status: 'wrong' }]);
  });
});

describe('compareCards — creature stats applicability', () => {
  it('exact power/toughness match is a single correct P/T row', () => {
    const guess = makeCard({ name: 'A', oracle_id: 'g1' });
    const results = compareCards(guess, makeCard());
    const pt = byKey(results, 'pt');
    expect(pt).toMatchObject({ status: 'correct', applicable: true });
    expect(pt.segments).toEqual([
      { text: '3', status: 'correct' },
      { slash: true },
      { text: '2', status: 'correct' },
    ]);
  });

  it('non-creature guess has no P/T row', () => {
    const guess = makeCard({
      name: 'A',
      oracle_id: 'g1',
      type_line: 'Instant',
      power: undefined,
      toughness: undefined,
    });
    const results = compareCards(guess, makeCard());
    expect(byKey(results, 'pt')).toBeUndefined();
  });

  it('creature guess vs non-creature target marks both stats wrong but applicable', () => {
    const target = makeCard({ type_line: 'Instant', power: undefined, toughness: undefined });
    const results = compareCards(makeCard({ name: 'A', oracle_id: 'g1' }), target);
    const pt = byKey(results, 'pt');
    expect(pt).toMatchObject({ status: 'wrong', applicable: true });
    expect(pt.segments).toEqual([
      { text: '3', status: 'wrong' },
      { slash: true },
      { text: '2', status: 'wrong' },
    ]);
  });

  it('P/T row marks absentOnTarget when the target has no P/T', () => {
    const target = makeCard({ type_line: 'Instant', power: undefined, toughness: undefined });
    const pt = byKey(compareCards(makeCard({ name: 'A', oracle_id: 'g1' }), target), 'pt');
    expect(pt).toMatchObject({ status: 'wrong', applicable: true, absentOnTarget: true });
    expect(pt.segments).toEqual([
      { text: '3', status: 'wrong' },
      { slash: true },
      { text: '2', status: 'wrong' },
    ]);
  });

  it('wrong P/T match colors each side independently', () => {
    const results = compareCards(
      makeCard({ name: 'A', oracle_id: 'g1', power: '3', toughness: '5' }),
      makeCard()
    );
    const pt = byKey(results, 'pt');
    expect(pt.status).toBe('wrong');
    expect(pt.segments).toEqual([
      { text: '3', status: 'correct' },
      { slash: true },
      { text: '5', status: 'wrong' },
    ]);
  });

  it('symmetric P/T row has unique per-segment keys for the UI', () => {
    // A creature with equal power and toughness renders "3 / 3". The
    // distinc separator keeps the two values distinguishable; the keyed
    // each-block in GuessFeedback is index-based, so duplicate texts are safe.
    const pt = byKey(compareCards(makeCard({ name: 'A', oracle_id: 'g1', power: '3', toughness: '3' }), makeCard()), 'pt');
    expect(pt.segments).toEqual([
      { text: '3', status: 'correct' },
      { slash: true },
      { text: '3', status: 'wrong' },
    ]);
  });

  it('loyalty marks absentOnTarget when the guessed walker faces a non-walker', () => {
    const walker = makeCard({
      name: 'A',
      oracle_id: 'g1',
      type_line: 'Legendary Planeswalker — Jace',
      power: undefined,
      toughness: undefined,
      loyalty: '3',
    });
    const loy = byKey(compareCards(walker, makeCard({ type_line: 'Instant' })), 'loyalty');
    expect(loy).toMatchObject({ status: 'wrong', applicable: true, absentOnTarget: true });
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

describe('compareCards — rarity', () => {
  it('matching rarity is correct', () => {
    const guess = makeCard({ name: 'A', rarity: 'uncommon' });
    const target = makeCard({ rarity: 'uncommon' });
    expect(byKey(compareCards(guess, target), 'rarity')).toMatchObject({ status: 'correct', correct: ['uncommon'] });
  });

  it('mismatched rarity is wrong', () => {
    const guess = makeCard({ name: 'A', rarity: 'mythic' });
    const target = makeCard({ rarity: 'rare' });
    expect(byKey(compareCards(guess, target), 'rarity')).toMatchObject({ status: 'wrong', wrong: ['mythic'] });
  });


  it('rarity row renders above the oracle-text row', () => {
    const results = compareCards(
      makeCard({ name: 'A', rarity: 'uncommon', oracle_text: 'Flying' }),
      makeCard({ name: 'T', rarity: 'rare', oracle_text: 'Flying' }),
    );
    const keys = results.map((r) => r.key);
    expect(keys.indexOf('rarity')).toBeGreaterThan(-1);
    expect(keys.indexOf('oracle')).toBeGreaterThan(-1);
    expect(keys.indexOf('rarity')).toBeLessThan(keys.indexOf('oracle'));
  });


  it('rarity is always compared (every card has one, including guesses', () => {
    // Every Scryfall card object carries a non-empty `rarity`, so the row
    // renders even when the guess doesn't spell it out explicitly (the fixture
    // default above models that). A target that "lacks" it is treated as an
    // empty string mismatch rather than an omitted row.

    const results = compareCards(makeCard({ name: 'A' }), makeCard({ name: 'T', rarity: '' }));
    expect(byKey(results, 'rarity')).toMatchObject({ status: 'wrong', wrong: ['uncommon'] });
  });
});

describe('compareCards — release date and oracle text', () => {
  it('same release date is correct; otherwise wrong with direction note', () => {
    const target = makeCard({ released_at: '2020-06-01' });
    const older = compareCards(makeCard({ name: 'A', released_at: '2019-01-01' }), target);
    expect(byKey(older, 'released')).toMatchObject({ status: 'wrong', note: 'target is newer' });
    const same = compareCards(makeCard({ name: 'A', released_at: '2020-06-01' }), target);
    expect(byKey(same, 'released').status).toBe('correct');
  });

  it('oracle text compares wrong when the guess has text', () => {
    const guess = makeCard({ name: 'A', oracle_text: 'Flying\nVigilance\nCycling' });
    const target = makeCard({ oracle_text: 'Flying\nVigilance' });
    const results = compareCards(guess, target);
    const line = byKey(results, 'oracle');
    expect(line).toMatchObject({ status: 'wrong', applicable: true });
    expect(line.correct).toEqual(['flying', 'vigilance']);
    expect(line.wrong).toEqual(['cycling']);
    expect(line.segments).toEqual([
      { text: 'Flying', token: true, status: 'correct' },
      { text: '\n' },
      { text: 'Vigilance', token: true, status: 'correct' },
      { text: '\n' },
      { text: 'Cycling', token: true, status: 'wrong' },
    ]);
  });
  it('preserves punctuation and braced symbols as separate tokens', () => {
    const guess = makeCard({ oracle_text: 'Add {G}: Flying, Vigilance.' });
    const target = makeCard({ oracle_text: 'Add {G}: Flying' });
    const line = byKey(compareCards(guess, target), 'oracle');
    expect(line.status).toBe('wrong');
    // correct/wrong list the lowercased token texts only
    expect(line.correct).toEqual(['add', '{g}', 'flying']);
    expect(line.wrong).toEqual(['vigilance']);
    expect(line.segments).toEqual([
      { text: 'Add', token: true, status: 'correct' },
      { text: ' ' },
      { text: '{G}', token: true, status: 'correct' },
      { text: ': ' },
      { text: 'Flying', token: true, status: 'correct' },
      { text: ', ' },
      { text: 'Vigilance', token: true, status: 'wrong' },
      { text: '.' },
    ]);
  });
  it('treats braced groups as single tokens and matches case-insensitively', () => {
    const guess = makeCard({ oracle_text: 'Add {2}{W/U}: Storm (This spell can\'t be countered).' });
    const target = makeCard({ oracle_text: 'add {2}{W/U}: storm (This spell can\'t be countered).' });
    const line = byKey(compareCards(guess, target), 'oracle');
    expect(line.status).toBe('correct');
    expect(line.segments).toEqual([
      { text: 'Add', token: true, status: 'correct' },
      { text: ' ' },
      { text: '{2}', token: true, status: 'correct' },
      { text: '{W/U}', token: true, status: 'correct' },
      { text: ': ' },
      { text: 'Storm', token: true, status: 'correct' },
      { text: ' (' },
      { text: 'This', token: true, status: 'correct' },
      { text: ' ' },
      { text: 'spell', token: true, status: 'correct' },
      { text: ' ' },
      { text: 'can\'t', token: true, status: 'correct' },
      { text: ' ' },
      { text: 'be', token: true, status: 'correct' },
      { text: ' ' },
      { text: 'countered', token: true, status: 'correct' },
      { text: ').' },
    ]);
  });

  it('no oracle-text line when the guess has no text', () => {
    const results = compareCards(
      makeCard({ name: 'A', oracle_text: '' }),
      makeCard({ oracle_text: 'Flying' }),
    );
    expect(byKey(results, 'oracle')).toBeUndefined();
  });

  it('empty oracle text on both cards omits the line too', () => {
    const guess = makeCard({ colors: [], type_line: 'Creature', oracle_text: '' });
    const target = makeCard({ colors: [], type_line: 'Creature', oracle_text: '' });
    const results = compareCards(guess, target);
    expect(byKey(results, 'oracle')).toBeUndefined();
    const colors = byKey(results, 'colors');
    expect(colors.status).toBe('correct');
    // Both cards are colorless: the guessed explicit token matches the target's.
    expect(colors.correct).toEqual(['colorless']);
  });

  it('a fully matching oracle text is a correct row', () => {
    const text = 'Flying (This creature can\'t be blocked.)\nVigilance';
    const results = compareCards(
      makeCard({ name: 'A', oracle_text: text }),
      makeCard({ name: 'T', oracle_text: text }),
    );
    expect(byKey(results, 'oracle')).toMatchObject({ status: 'correct' });
  });
});


describe('compareCards — layout', () => {
  const frontFace = {
    name: 'Human Side',
    mana_cost: '{1}{G}',
    colors: ['G'],
    type_line: 'Creature — Human',
    power: '2',
    toughness: '2',
  };
  const backFace = {
    name: 'Beast Side',
    mana_cost: '',
    colors: ['G'],
    type_line: 'Creature — Beast',
    power: '4',
    toughness: '4',
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

  it('matching layout is correct; mismatch is wrong', () => {
    expect(byKey(compareCards(dfc, dfc), 'layout')).toMatchObject({ status: 'correct', correct: ['transform'] });
    const split = makeCard({ layout: 'split' });
    const splitVsNormal = compareCards(split, makeCard());
    expect(byKey(splitVsNormal, 'layout')).toMatchObject({ status: 'wrong', wrong: ['split'] });
  });

  it('no layout line when the guess is normal', () => {
    expect(byKey(compareCards(makeCard(), makeCard()), 'layout')).toBeUndefined();
    expect(byKey(compareCards(makeCard(), dfc), 'layout')).toBeUndefined();
  });

  it('any face token matches: target token lists are the union of all faces', () => {
    const other = makeCard({
      name: 'Other // Beast Side',
      layout: 'transform',
      card_faces: [{ ...frontFace, name: 'Other' }, backFace],
      power: undefined,
      toughness: undefined,
    });
    const results = compareCards(dfc, other);
    expect(results.some((r) => r.key.startsWith('front:') || r.key.startsWith('back:'))).toBe(false);
    expect(byKey(results, 'pt')).toMatchObject({ status: 'correct' });
    expect(byKey(results, 'type')).toMatchObject({ status: 'correct' });
    // A guessed-only front token that appears only on the target's back face
    // still matches (Scryfall's t:/pow:/tou: operators index any face).
    const mismatched = compareCards(
      makeCard({ name: 'A', type_line: 'Creature — Human', power: '2', toughness: '2', layout: 'normal' }),
      dfc,
    );
    expect(byKey(mismatched, 'type')).toMatchObject({ status: 'correct', correct: ['Creature', 'Human'] });
    expect(byKey(mismatched, 'pt')).toMatchObject({ status: 'correct' });
  });

  it('guessed tokens from any face are checked against the target face union', () => {
    const results = compareCards(dfc, makeCard({ name: 'T', type_line: 'Artifact', power: '1', toughness: '1' }));
    expect(byKey(results, 'type')).toMatchObject({ status: 'wrong', correct: [], wrong: ['Creature', 'Human', 'Beast', 'Goblin', 'Warrior'] });
    expect(byKey(results, 'pt')).toMatchObject({ status: 'wrong' });
    expect(byKey(results, 'pt').segments).toEqual([
      { text: '2', status: 'wrong' },
      { text: '4', status: 'wrong' },
      { slash: true },
      { text: '2', status: 'wrong' },
      { text: '4', status: 'wrong' },
    ]);
  });
});
