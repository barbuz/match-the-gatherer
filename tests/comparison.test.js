import { describe, it, expect } from 'vitest';
import {
  parseTypeLine,
  normalizeManaCost,
  compareCards,
  propertyTokens,
  parseOracleText,
  stripReminderText,
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

  it('oracle text compares rules clauses as verbatim tokens', () => {
    const guess = makeCard({ name: 'A', oracle_text: 'Target player draws a card.\nCycling' });
    const target = makeCard({ oracle_text: 'Target player draws a card.' });
    const results = compareCards(guess, target);
    const line = byKey(results, 'oracle');
    expect(line).toMatchObject({ status: 'wrong', applicable: true });
    expect(line.correct).toEqual(['Target player draws a card.']);
    expect(line.wrong).toEqual(['Cycling']);
    // One segment per compared clause, with an explicit break between printed
    // lines (no blank line where a keyword was removed).
    expect(line.segments).toEqual([
      { text: 'Target player draws a card.', token: true, kind: 'oracle', nameText: '', status: 'correct' },
      { break: true },
      { text: 'Cycling', token: true, kind: 'oracle', nameText: '', status: 'wrong' },
    ]);
  });

  it('splits a line at the colon, keeping braced symbols inline', () => {
    const guess = makeCard({ oracle_text: 'Add {G}: draw a card' });
    const target = makeCard({ oracle_text: 'Add {G}: draw a card' });
    const line = byKey(compareCards(guess, target), 'oracle');
    expect(line.status).toBe('correct');
    expect(line.correct).toEqual(['Add {G}:', 'draw a card']);
    expect(line.wrong).toEqual([]);
    expect(line.segments).toEqual([
      { text: 'Add {G}:', token: true, kind: 'oracle', nameText: '', status: 'correct' },
      { text: 'draw a card', token: true, kind: 'oracle', nameText: '', status: 'correct' },
    ]);
  });

  it('matches rules text case-insensitively as a substring', () => {
    const guess = makeCard({ oracle_text: 'ADD {2}{W/U}: STORM' });
    const target = makeCard({ oracle_text: 'Add {2}{W/U}: storm and more.' });
    const line = byKey(compareCards(guess, target), 'oracle');
    expect(line.status).toBe('correct');
    expect(line.correct).toEqual(['ADD {2}{W/U}:', 'STORM']);
    expect(line.wrong).toEqual([]);
  });

  it('ignores reminder text for matching, including nested parentheses', () => {
    const guess = makeCard({
      oracle_text: 'Ward {2} (Whenever this creature becomes the target of a spell, counter it. (Really.))',
    });
    const target = makeCard({
      oracle_text: 'Ward {2} (Whenever this creature becomes the target of a spell, counter it unless that player pays {2}.)',
    });
    const line = byKey(compareCards(guess, target), 'oracle');
    // Only the rules text (here just `Ward {2}`) is compared; the differing
    // reminder spans are stripped on both sides.
    expect(line.status).toBe('correct');
    expect(line.correct).toEqual(['Ward {2}']);
  });

  it('a line that is only reminder text produces no rules token', () => {
    const guess = makeCard({ oracle_text: '(This is reminder text.)\nDestroy target artifact.' });
    const target = makeCard({ oracle_text: 'Destroy target artifact.' });
    const line = byKey(compareCards(guess, target), 'oracle');
    expect(line.status).toBe('correct');
    expect(line.correct).toEqual(['Destroy target artifact.']);
    expect(line.wrong).toEqual([]);
  });

  it('no oracle-text line when the guess has no rules text', () => {
    const results = compareCards(
      makeCard({ name: 'A', oracle_text: '(only reminder)' }),
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
    const text = 'Ward {2} (This creature can\'t be blocked.)\nDestroy target artifact.';
    const results = compareCards(
      makeCard({ name: 'A', oracle_text: text }),
      makeCard({ name: 'T', oracle_text: text }),
    );
    expect(byKey(results, 'oracle')).toMatchObject({ status: 'correct' });
  });
});

describe('compareCards — keywords', () => {
  it('renders printed keywords verbatim in their own row, removed from oracle', () => {
    const guess = makeCard({
      keywords: ['Flying', 'First strike'],
      oracle_text: 'Flying, first strike (They can be blocked.)\nDestroy target artifact.',
    });
    const target = makeCard({
      keywords: ['Flying'],
      oracle_text: 'Flying (It can fly.)\nDestroy target artifact.',
    });
    const results = compareCards(guess, target);
    const kw = byKey(results, 'keywords');
    expect(kw).toMatchObject({ status: 'wrong', applicable: true });
    expect(kw.correct).toEqual(['Flying']);
    expect(kw.wrong).toEqual(['first strike']);
    // Canonical (lowercased) names feed `kw:` hints.
    expect(kw.correctNames).toEqual(['flying']);
    expect(kw.wrongNames).toEqual(['first strike']);
    expect(kw.segments).toEqual([
      { text: 'Flying', token: true, kind: 'keyword', name: 'Flying', nameText: 'Flying', status: 'correct' },
      { text: ', ' },
      { text: 'first strike', token: true, kind: 'keyword', name: 'First strike', nameText: 'first strike', status: 'wrong' },
    ]);
    // The oracle row carries only the rules text.
    const oracle = byKey(results, 'oracle');
    expect(oracle.correct).toEqual(['Destroy target artifact.']);
    expect(oracle.wrong).toEqual([]);
  });

  it('omits the keywords row when the guess prints no keywords', () => {
    const results = compareCards(
      makeCard({ oracle_text: 'Destroy target artifact.' }),
      makeCard({ keywords: ['Flying'], oracle_text: 'Flying' }),
    );
    expect(byKey(results, 'keywords')).toBeUndefined();
  });

  it('keeps keyword parameters in the printed span but matches by canonical name', () => {
    const guess = makeCard({ keywords: ['Kicker'], oracle_text: 'Kicker {2} (You may pay {2}.)\nDraw a card.' });
    const target = makeCard({ keywords: ['Kicker'], oracle_text: 'Kicker {4}\nDraw a card.' });
    const kw = byKey(compareCards(guess, target), 'keywords');
    expect(kw.status).toBe('correct');
    expect(kw.correct).toEqual(['Kicker {2}']);
    expect(kw.correctNames).toEqual(['kicker']);
    expect(kw.segments).toEqual([
      { text: 'Kicker {2}', token: true, kind: 'keyword', name: 'Kicker', nameText: 'Kicker', status: 'correct' },
    ]);
  });

  it('renders ability words and keyword costs verbatim', () => {
    const guess = makeCard({
      keywords: ['Channel'],
      oracle_text: 'Channel — {6}, Discard this card: Draw a card.',
    });
    const target = makeCard({
      keywords: [],
      oracle_text: 'You may play an additional land.\n, Discard this card: Draw a card.',
    });
    const kw = byKey(compareCards(guess, target), 'keywords');
    expect(kw.wrong).toEqual(['Channel — {6}']);
    expect(kw.wrongNames).toEqual(['channel']);
    expect(kw.segments).toEqual([
      { text: 'Channel — {6}', token: true, kind: 'keyword', name: 'Channel', nameText: 'Channel', status: 'wrong' },
    ]);
    // The ability's rules text stays in the oracle row (and matches the target).
    expect(byKey(compareCards(guess, target), 'oracle').correct).toEqual([
      ', Discard this card:',
      'Draw a card.',
    ]);
  });

  it('renders an ability-word keyword with its dash and rules text', () => {
    const guess = makeCard({
      keywords: ['Landfall'],
      oracle_text: 'Landfall — Whenever a land you control enters, you may draw a card.',
    });
    const target = makeCard({
      keywords: [],
      oracle_text: 'Whenever a land you control enters, you may draw a card.',
    });
    const kw = byKey(compareCards(guess, target), 'keywords');
    expect(kw.wrong).toEqual(['Landfall']);
    expect(kw.segments).toEqual([
      { text: 'Landfall', token: true, kind: 'keyword', name: 'Landfall', nameText: 'Landfall', status: 'wrong' },
    ]);
    expect(byKey(compareCards(guess, target), 'oracle').correct).toEqual([
      'Whenever a land you control enters, you may draw a card.',
    ]);
  });

  it('does not invent a keyword for a vocabulary entry that is not a printed line', () => {
    // `Treasure`/`Food` live in `card.keywords` but never as leading keyword
    // lines, so they stay in the oracle text and emit no keyword hint.
    const card = makeCard({
      keywords: ['Treasure', 'Food'],
      oracle_text: 'If you would create a Clue, Food, or Treasure token, instead create one of each.',
    });
    const results = compareCards(card, card);
    expect(byKey(results, 'keywords')).toBeUndefined();
    expect(byKey(results, 'oracle').correct).toEqual([
      'If you would create a Clue, Food, or Treasure token, instead create one of each.',
    ]);
  });

  it('does not treat a keyword-action inside an ability as a printed keyword', () => {
    // `Monstrosity` is in the vocabulary but appears mid-ability after a cost,
    // so it stays in the oracle text and is not hinted.
    const card = makeCard({
      keywords: ['Monstrosity'],
      oracle_text: '{5}{B}{G}: Monstrosity 4. (If this creature isn\'t monstrous, put four +1/+1 counters on it.)',
    });
    const results = compareCards(card, card);
    expect(byKey(results, 'keywords')).toBeUndefined();
    expect(byKey(results, 'oracle').correct).toEqual(['{5}{B}{G}:', 'Monstrosity 4.']);
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
    // Face-level tokens only: the card-level `type_line` of a multi-faced card
    // is the faces' lines concatenated, so it must not contribute tokens.
    expect(byKey(results, 'type')).toMatchObject({ status: 'wrong', correct: [], wrong: ['Creature', 'Human', 'Beast'] });
    expect(byKey(results, 'pt')).toMatchObject({ status: 'wrong' });
    expect(byKey(results, 'pt').segments).toEqual([
      { text: '2', status: 'wrong' },
      { slash: true },
      { text: '2', status: 'wrong' },
      { sep: true, text: '//' },
      { text: '4', status: 'wrong' },
      { slash: true },
      { text: '4', status: 'wrong' },
    ]);
  });

  it('color row phrases per-face colors with a // separator', () => {
    const split = makeCard({
      name: 'Fire // Ice',
      layout: 'split',
      card_faces: [
        { name: 'Fire', colors: ['R'] },
        { name: 'Ice', colors: ['U'] },
      ],
    });
    const colors = byKey(compareCards(split, makeCard({ colors: ['R'] })), 'colors');
    expect(colors.segments).toEqual([
      { text: 'R', status: 'correct' },
      { sep: true, text: '//' },
      { text: 'U', status: 'wrong' },
    ]);
  });

  it('type row phrases per-face type lines with a // separator', () => {
    const split = makeCard({
      name: 'Fire // Ice',
      layout: 'split',
      card_faces: [
        { name: 'Fire', type_line: 'Instant' },
        { name: 'Ice', type_line: 'Sorcery' },
      ],
    });
    const type = byKey(compareCards(split, makeCard({ type_line: 'Instant' })), 'type');
    expect(type.segments).toEqual([
      { text: 'Instant', status: 'correct' },
      { sep: true, text: '//' },
      { text: 'Sorcery', status: 'wrong' },
    ]);
  });

  it('oracle row phrases per-face oracle text with a // separator', () => {
    const split = makeCard({
      name: 'Fire // Ice',
      layout: 'split',
      card_faces: [
        { name: 'Fire', oracle_text: 'Flying' },
        { name: 'Ice', oracle_text: 'Vigilance' },
      ],
    });
    const line = byKey(compareCards(split, makeCard({ oracle_text: 'Flying' })), 'oracle');
    expect(line.segments).toEqual([
      { text: 'Flying', token: true, kind: 'oracle', nameText: '', status: 'correct' },
      { break: true },
      { text: 'Vigilance', token: true, kind: 'oracle', nameText: '', status: 'wrong' },
    ]);
  });

  it('keywords row phrases per-face keyword spans with a // separator', () => {
    const split = makeCard({
      name: 'Fire // Ice',
      layout: 'split',
      keywords: ['Flying', 'Vigilance'],
      card_faces: [
        { name: 'Fire', oracle_text: 'Flying', keywords: ['Flying'] },
        { name: 'Ice', oracle_text: 'Vigilance', keywords: ['Vigilance'] },
      ],
    });
    const kw = byKey(compareCards(split, makeCard({ keywords: ['Flying'], oracle_text: 'Flying' })), 'keywords');
    expect(kw.segments).toEqual([
      { text: 'Flying', token: true, kind: 'keyword', name: 'Flying', nameText: 'Flying', status: 'correct' },
      { sep: true, text: '//' },
      { text: 'Vigilance', token: true, kind: 'keyword', name: 'Vigilance', nameText: 'Vigilance', status: 'wrong' },
    ]);
  });
});

describe('propertyTokens', () => {
  it('exposes the same token sets the comparison rows use, including MV', () => {
    const card = makeCard({ oracle_text: 'Flying', cmc: 3 });
    const tokens = propertyTokens(card);
    expect(tokens.colors).toEqual(['R']);
    expect(tokens.type).toEqual(['Creature', 'Goblin', 'Warrior']);
    expect(tokens.pt).toEqual(['n:3', 'n:2']);
    expect(tokens.mana).toEqual(['2R', 'mv:3']);
    expect(tokens.oracle).toEqual(['flying']);
    expect(tokens.released).toEqual(['2020-01-01']);
    expect(tokens.rarity).toEqual(['uncommon']);
    expect(tokens.layout).toBeUndefined();
  });

  it('omits properties the card does not have and normalizes costs', () => {
    const instant = makeCard({
      mana_cost: '{2}{r}',
      type_line: 'Instant',
      power: undefined,
      toughness: undefined,
      oracle_text: '',
    });
    const tokens = propertyTokens(instant);
    expect(tokens.pt).toBeUndefined();
    expect(tokens.oracle).toBeUndefined();
    expect(tokens.mana[0]).toBe('2R');
  });

  it('emits the layout token only for non-normal layouts', () => {
    expect(propertyTokens(makeCard({ layout: 'transform' })).layout).toEqual(['transform']);
  });

  it('splits printed keywords out of the oracle tokens', () => {
    const card = makeCard({
      keywords: ['Flying', 'Vigilance'],
      oracle_text: "Flying\nVigilance (Attacking doesn't cause this creature to tap.)\nDestroy target artifact.",
    });
    const tokens = propertyTokens(card);
    expect(tokens.keywords).toEqual(['flying', 'vigilance']);
    expect(tokens.oracle).toEqual(['destroy target artifact.']);
  });

  it('omits the keywords token set for a keyword-less card', () => {
    expect(propertyTokens(makeCard({ oracle_text: 'Destroy target artifact.' })).keywords).toBeUndefined();
  });
});

describe('stripReminderText', () => {
  it('removes parenthesised spans', () => {
    expect(stripReminderText("Flying (This creature can't be blocked.)"))
      .toBe('Flying ');
  });

  it('removes nested parentheses cleanly', () => {
    const text = 'Super haste (This may attack. (You may put it from your hand.))';
    expect(stripReminderText(text)).toBe('Super haste ');
    expect(stripReminderText(text)).not.toContain(')');
  });

  it('keeps square brackets (cleave text is indexed by o:)', () => {
    expect(stripReminderText('Cleave [+2]')).toBe('Cleave [+2]');
  });

  it('keeps an unmatched close paren', () => {
    expect(stripReminderText('A ) B')).toBe('A ) B');
  });
});

describe('parseOracleText', () => {
  const rulesOf = (text, keywords = []) => parseOracleText(text, keywords).rules;
  const keywordsOf = (text, keywords = []) => parseOracleText(text, keywords).keywords;

  it('splits rules text on newlines into one token per non-empty line', () => {
    expect(rulesOf('Target player draws a card.\nDestroy target artifact.'))
      .toEqual(['Target player draws a card.', 'Destroy target artifact.']);
  });

  it('drops reminder spans from the rules tokens', () => {
    expect(rulesOf("Destroy target artifact. (It's an artifact.)"))
      .toEqual(['Destroy target artifact.']);
  });

  it('splits on the colon and keeps braced mana symbols opaque', () => {
    expect(rulesOf('{T}: Add {G}.')).toEqual(['{T}:', 'Add {G}.']);
    expect(rulesOf('Add {2}{W/U}')).toEqual(['Add {2}{W/U}']);
  });

  it('splits on the sentence period, keeping it on the token it ends', () => {
    expect(rulesOf('Draw a card. Discard a card.'))
      .toEqual(['Draw a card.', 'Discard a card.']);
  });

  it('keeps square-bracket spans opaque', () => {
    expect(rulesOf('Add {C} [note, with: punctuation.]')).toEqual(['Add {C} [note, with: punctuation.]']);
  });

  it('mutes a leading mana-cost name on the token it starts', () => {
    const { segments } = parseOracleText('{T}: Add {G}.', []);
    expect(segments.filter((s) => s.token)).toEqual([
      { text: '{T}:', token: true, kind: 'oracle', nameText: '{T}' },
      { text: 'Add {G}.', token: true, kind: 'oracle', nameText: '' },
    ]);
  });

  it('trims only the ends, preserving internal whitespace', () => {
    const { rules, segments } = parseOracleText('  Target player  draws a card.  ');
    expect(rules).toEqual(['Target player  draws a card.']);
    expect(segments[0].text).toBe('Target player  draws a card.');
  });

  it('drops pure-punctuation and too-short tokens', () => {
    expect(rulesOf('Destroy target artifact.')).toEqual(['Destroy target artifact.']);
    expect(rulesOf('.')).toEqual([]);
    expect(rulesOf('-')).toEqual([]);
    expect(rulesOf('a')).toEqual([]); // single character below the floor
  });

  it('splits on the double quote so a token can never contain one', () => {
    const tokens = rulesOf('I — This Saga gains "When you sacrifice a permanent, add {C}."');
    expect(tokens).toEqual(['I — This Saga gains', 'When you sacrifice a permanent, add {C}.']);
    expect(tokens.some((t) => t.includes('"'))).toBe(false);
  });

  it('extracts a printed keyword list verbatim, leaving no rules text', () => {
    const text = 'Flying, first strike, vigilance, trample, haste, protection from black and from red';
    const keywords = ['Flying', 'Vigilance', 'First strike', 'Protection', 'Haste', 'Trample'];
    expect(keywordsOf(text, keywords)).toEqual([
      { text: 'Flying', name: 'Flying' },
      { text: 'first strike', name: 'First strike' },
      { text: 'vigilance', name: 'Vigilance' },
      { text: 'trample', name: 'Trample' },
      { text: 'haste', name: 'Haste' },
      { text: 'protection from black and from red', name: 'Protection' },
    ]);
    expect(rulesOf(text, keywords)).toEqual([]);
  });

  it('extracts a keyword with a parameter and keeps it out of the rules text', () => {
    const { rules, keywords } = parseOracleText(
      'Kicker {2} (You may pay an additional {2}.)\nSearch your library for a basic land card.',
      ['Kicker'],
    );
    expect(keywords).toEqual([{ text: 'Kicker {2}', name: 'Kicker' }]);
    expect(rules).toEqual(['Search your library for a basic land card.']);
  });

  it('extracts ability words but not a keyword cost after the dash', () => {
    const landfall = parseOracleText(
      'Landfall — Whenever a land you control enters, you may draw a card.',
      ['Landfall'],
    );
    expect(landfall.keywords).toEqual([{ text: 'Landfall', name: 'Landfall' }]);
    expect(landfall.rules).toEqual(['Whenever a land you control enters, you may draw a card.']);

    // `Channel — {6}, ...` is a keyword cost, not an ability word: the keyword
    // span is just `Channel — {6}` and the rest is rules text.
    const channel = parseOracleText(
      'Channel — {6}, Discard this card: Draw a card.',
      ['Channel'],
    );
    expect(channel.keywords).toEqual([{ text: 'Channel — {6}', name: 'Channel' }]);
    expect(channel.rules).toEqual([', Discard this card:', 'Draw a card.']);
  });

  it('extracts text-parameter keywords', () => {
    expect(keywordsOf('Partner with Rory Williams (When this enters.)', ['Partner with']))
      .toEqual([{ text: 'Partner with Rory Williams', name: 'Partner with' }]);
    expect(keywordsOf('Enchant creature\nEnchanted creature gets +2/+2.', ['Enchant']))
      .toEqual([{ text: 'Enchant creature', name: 'Enchant' }]);
  });

  it('ends a text parameter at a comma unless the keyword allows one', () => {
    // A comma separates keywords for `Protection`, so `flying` is its own entry.
    expect(keywordsOf('Protection from red, flying', ['Protection', 'Flying']))
      .toEqual([
        { text: 'Protection from red', name: 'Protection' },
        { text: 'flying', name: 'Flying' },
      ]);
    // A partner's name may contain a comma, so it stays one span.
    expect(keywordsOf('Partner with Krav, the Unredeemed\nFirst strike', ['Partner with', 'First strike']))
      .toEqual([
        { text: 'Partner with Krav, the Unredeemed', name: 'Partner with' },
        { text: 'First strike', name: 'First strike' },
      ]);
  });

  it('does not extract a vocabulary keyword that is not a leading keyword line', () => {
    // `Double all damage…` starts with the vocabulary word `Double` but the next
    // token is a normal word, not a parameter.
    expect(keywordsOf('Double all damage that creature sources would deal.', ['Double'])).toEqual([]);
    expect(rulesOf('Double all damage that creature sources would deal.', ['Double']))
      .toEqual(['Double all damage that creature sources would deal.']);
    // `Monstrosity` appears mid-ability after a cost.
    expect(keywordsOf('{5}{B}{G}: Monstrosity 4.', ['Monstrosity'])).toEqual([]);
  });

  it('prefers the longest keyword match', () => {
    expect(keywordsOf('Empower Jace 2. (Put two loyalty counters on a Jace.)', ['Empower', 'Empower Jace']))
      .toEqual([{ text: 'Empower Jace 2', name: 'Empower Jace' }]);
  });

  it('reconstructs the reminder-free lines from its segments', () => {
    const text = 'Flying (This creature can\'t be blocked.)\nKicker {2} "quoted"';
    const { segments } = parseOracleText(text, ['Flying', 'Kicker']);
    const lines = segments.filter((s) => !s.break).map((s) => s.text);
    expect(lines).toEqual(['Flying', 'Kicker {2} "quoted"']);
  });

  it('frames each clause as its own segment; a quote-split line yields several', () => {
    const text = 'I — This Saga gains "When you sacrifice a permanent, add {C}."';
    const { segments, rules } = parseOracleText(text, []);
    expect(segments.filter((s) => s.token).map((s) => s.text)).toEqual([
      'I — This Saga gains',
      'When you sacrifice a permanent, add {C}.',
    ]);
    expect(segments.filter((s) => s.token).map((s) => s.text)).toEqual(rules);
    expect(rules.some((t) => t.includes('"'))).toBe(false);
  });

  it('every emitted token is a verbatim substring of the reminder-free text', () => {
    const text = '(As this Saga enters, add a lore counter.)\nI — This Saga gains "When you sacrifice a permanent, add {C}."';
    const flat = stripReminderText(text).replace(/\n/g, '');
    const { rules, keywords } = parseOracleText(text, []);
    for (const token of [...rules, ...keywords.map((k) => k.text)]) {
      expect(flat).toContain(token);
    }
  });
});

describe('compareCards — every row is segmented', () => {
  it('plain-value rows (layout, released, rarity, placeholders) carry one segment per value', () => {
    // The UI renders a single segment list for every row, so a plain row must
    // not rely on the legacy `correct`/`wrong` arrays for display.
    const dfc = makeCard({
      name: 'A // B',
      layout: 'transform',
      rarity: 'mythic',
      released_at: '2019-05-05',
      card_faces: [
        { name: 'A', mana_cost: '{1}{G}', colors: ['G'], type_line: 'Creature — Human', power: '2', toughness: '2' },
        { name: 'B', mana_cost: '', colors: ['G'], type_line: 'Creature — Beast', power: '4', toughness: '4' },
      ],
      power: undefined,
      toughness: undefined,
    });
    const target = makeCard({ rarity: 'rare', released_at: '2020-06-01' });
    const results = compareCards(dfc, target);
    for (const r of results) {
      expect(Array.isArray(r.segments)).toBe(true);
      expect(r.segments.length).toBeGreaterThan(0);
    }
    const released = byKey(results, 'released');
    expect(released.segments).toEqual([{ text: '2019-05-05', status: 'wrong' }]);
    expect(byKey(results, 'rarity').segments).toEqual([{ text: 'mythic', status: 'wrong' }]);
    expect(byKey(results, 'layout').segments).toEqual([{ text: 'transform', status: 'wrong' }]);
  });

  it('placeholder rows (no type tokens) render the em-dash as a segment', () => {
    const results = compareCards(
      makeCard({ type_line: '' }),
      makeCard({ type_line: '' }),
    );
    expect(byKey(results, 'type').segments).toEqual([{ text: '—', status: 'correct' }]);
  });
});
