import { describe, it, expect } from 'vitest';
import { compareCards } from '../src/lib/game/comparison.js';
import {
  gatherHints,
  hintToClause,
  buildScryfallSearchUrl,
} from '../src/lib/game/hints.js';

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

const guessEntry = (card, target = makeCard()) => ({
  card,
  results: compareCards(card, target),
});

describe('gatherHints', () => {
  it('collects positive hints from correct properties', () => {
    const hints = gatherHints([
      guessEntry(
        makeCard({ name: 'A', manacost: '{2}{R}', cmc: 3, colors: ['R'], type_line: 'Creature — Goblin Warrior', power: '3', toughness: '2', keywords: ['Flying'], released_at: '2020-01-01' }),
        makeCard({ keywords: ['Flying'] }),
      ),
    ]);
    expect(hints).toEqual(
      expect.arrayContaining([
        { kind: 'manaValue', value: '3', negated: false },
        { kind: 'mana', value: '{2}{R}', negated: false },
        { kind: 'colorSet', value: 'r', negated: false },
        { kind: 'type', value: 'Creature', negated: false },
        { kind: 'type', value: 'Goblin', negated: false },
        { kind: 'type', value: 'Warrior', negated: false },
        { kind: 'power', value: '3', negated: false },
        { kind: 'toughness', value: '2', negated: false },
        { kind: 'keyword', value: 'Flying', negated: false },
        { kind: 'released', value: '2020-01-01', negated: false },
      ]),
    );
  });

  it('collects negative hints and partial positives from mismatches', () => {
    const target = makeCard();
    const guess = makeCard({
      name: 'A',
      oracle_id: 'g1',
      mana_cost: '{4}{R}',
      cmc: 5,
      colors: ['R', 'W'],
      type_line: 'Artifact Creature — Golem',
      power: '3',
      toughness: '5',
      keywords: ['Haste'],
      released_at: '2019-01-01',
    });
    const hints = gatherHints([guessEntry(guess, target,)]);
    expect(hints).toEqual(
      expect.arrayContaining([
        { kind: 'manaValue', value: '5', negated: true }, // mv of the guess was wrong
        { kind: 'color', value: 'R', negated: false },             // matching guessed color
        { kind: 'color', value: 'W', negated: true }, // non-matching guessed color
        { kind: 'type', value: 'Artifact', negated: true }, // supertype guessed but not on target
        { kind: 'type', value: 'Creature', negated: false },        // shared type token
        { kind: 'type', value: 'Golem', negated: true },
        { kind: 'toughness', value: '5', negated: true },
        { kind: 'keyword', value: 'Haste', negated: true },
        { kind: 'released', value: '2019-01-01', dir: '>', negated: false }, // target released after the guess
      ]),
    );
    // The target's own power (3) matched so it stays a positive hint.

    expect(hints).toContainEqual({ kind: 'power', value: '3', negated: false });
  });

  it('deduplicates repeated hints across guesses', () => {
    const card = makeCard({ name: 'A', colors: ['R'], type_line: 'Creature — Goblin Warrior', keywords: ['Flying'] });
    const target = makeCard({ keywords: ['Flying'] });
    const hints = gatherHints([
      guessEntry(card, target),
      guessEntry(makeCard({ name: 'B', colors: ['R'], type_line: 'Artifact — Golem', keywords: ['Flying'] }), target),
    ]);
    const count = (kind, value, negated = false) =>
      hints.filter((h) => h.kind === kind && h.value === value && (h.negated ?? false) === negated).length;
    expect(count('colorSet', 'r')).toBe(1);
    expect(count('type', 'Creature')).toBe(1);
    expect(count('keyword', 'Flying')).toBe(1);
    expect(count('power', '3')).toBe(1); // identical P/T across both guesses
  });

  it('ignores the empty-hold placeholder and defense stats', () => {
    const bothEmpty = guessEntry(
      makeCard({ name: 'A', colors: [], type_line: '', keywords: [], power: undefined, toughness: undefined, loyalty: undefined }),
      makeCard({ name: 'T', colors: [], type_line: '', keywords: [], power: undefined, toughness: undefined, loyalty: undefined }),
    );
    const hints = gatherHints([bothEmpty]);
    expect(hints.filter((h) => h.kind === 'color')).toHaveLength(0);
    expect(hints.filter((h) => h.kind === 'type')).toHaveLength(0);
    expect(hints.filter((h) => h.kind === 'keyword')).toHaveLength(0);
    expect(hints.some((h) => h.kind === 'defense')).toBe(false);
  });

  it('pulls exact mana cost from a fully correct mana line', () => {
    const hints = gatherHints([guessEntry(makeCard({ name: 'A', mana_cost: '{2}{R}', cmc: 3 }))]);
    expect(hints).toContainEqual({ kind: 'mana', value: '{2}{R}', negated: false });
    expect(hints).toContainEqual({ kind: 'manaValue', value: '3', negated: false });
  });

  it('drops the no-mana-cost display token', () => {
    const hints = gatherHints([guessEntry(makeCard({ name: 'A', mana_cost: '' }))]);
    expect(hints.some((h) => h.kind === 'mana' && h.value === '(no mana cost)')).toBe(false);
  });

  it('emits an exact color-set hint bila fully matched color line', () => {
    const hints = gatherHints([
      guessEntry(
        makeCard({ name: 'A', colors: ['R', 'W'] }),
        makeCard({ name: 'T', colors: ['W', 'R'] }),
      ),
    ]);
    expect(hints).toContainEqual({ kind: 'colorSet', value: 'rw', negated: false });
    // No loose per-color "contains" hints survival when the set is pinned:
    expect(hints.filter((h) => h.kind === 'color')).toHaveLength(0);
    expect(hintToClause({ kind: 'colorSet', value: 'rw' })).toBe('c=rw');
  });


  it('drops negated scalar hints once the exact value is pinned', () => {
    // Toughness 1 matches on the first guess (pt line partial since power
    // misses); later guess had toughness 3, which the target does not have.
    const target = makeCard({ power: '2', toughness: '1' });
    const hints = gatherHints([
      guessEntry(makeCard({ name: 'A', power: '3', toughness: '1' }), target),
      guessEntry(makeCard({ name: 'B', power: '1', toughness: '3' }), target),
    ]);
    expect(hints).toContainEqual({ kind: 'toughness', value: '1', negated: false });
    expect(hints.filter((h) => h.kind === 'toughness' && h.negated)).toHaveLength(0); // no tou!=3
    expect(hintToClause({ kind: 'toughness', value: '1' })).toBe('tou=1');
  });

  it('uses the direction note for the release-date hint', () => {
    const target = makeCard({ released_at: '2009-01-10' });
    const newer = gatherHints([guessEntry(makeCard({ name: 'A', released_at: '2020-01-01' }), target,)]);
    expect(newer).toContainEqual({ kind: 'released', value: '2020-01-01', dir: '<', negated: false }); // target is older
    const older = gatherHints([guessEntry(makeCard({ name: 'A', released_at: '1995-01-01' }), target,)]);
    expect(older).toContainEqual({ kind: 'released', value: '1995-01-01', dir: '>', negated: false }); // target is newer
  });
  it('drops partial/wrong hints once a property line is fully matched', () => {
    // First guess fixes the mana value (4) but misses colors/type; the
    // second guess fixes colors/type but misses the mana value (5) -- those
    // later mana-value hints are dropped since the value is already pinned.

    const target = makeCard({ cmc: 4, colors: ['U'], type_line: 'Creature - Wizard' });
    const hints = gatherHints([
      // Fully matches the mana value;, everything else wrong:
      guessEntry(makeCard({ name: 'A', cmc: 4, colors: ['R'], type_line: 'Artifact - Golem' }), target),
      // Matches colors/type but misses the mana value:
      guessEntry(makeCard({ name: 'B', cmc: 5, colors: ['U'], type_line: 'Creature - Wizard' }), target),
    ]);
    expect(hints).toContainEqual({ kind: 'manaValue', value: '4', negated: false });
    const mv4 = hints.filter((h) => h.kind === 'manaValue');
    expect(mv4).toHaveLength(1); // no mv=5 / mv!=5 hints survive
    expect(hints).toContainEqual({ kind: 'colorSet', value: 'u', negated: false });
    expect(hints).toContainEqual({ kind: 'type', value: 'Creature', negated: false });
  });


  it('keeps only the tightest bound per release-date direction', () => {
    // Target is 2008-06-01. Guesses: A (2001) => newer-than bound,
    // B (2010) => older-than bound, C (1995) => looser newer-than,
    // D (2020) => looser older-than. Only the tightest of each direction stays.



    const target = makeCard({ released_at: '2008-06-01' });
    const hints = gatherHints([
      guessEntry(makeCard({ name: 'A', released_at: '2001-01-01' }), target), // target newer than 2001 -> date>2001
      guessEntry(makeCard({ name: 'B', released_at: '2010-01-01' }), target), // target older than  2010 -> date<2010
      guessEntry(makeCard({ name: 'C', released_at: '1995-01-01' }), target), // target newer than  1995 -> date>1995 (looser)
      guessEntry(makeCard({ name: 'D', released_at: '2020-01-01' }), target), // target older than  2020 -> date<2020 (looser)
    ]);
    expect(hints).toContainEqual({ kind: 'released', value: '2001-01-01', dir: '>', negated: false });
    expect(hints).toContainEqual({ kind: 'released', value: '2010-01-01', dir: '<', negated: false });
    // Looser same-direction bounds are dropped:
    expect(hints.filter((h) => h.kind === 'released')).toHaveLength(2);
  });


  it('subsumes all release-date bounds when the exact date is known', () => {
    const target = makeCard({ released_at: '2008-06-01' });
    const hints = gatherHints([
      guessEntry(makeCard({ name: 'A', released_at: '2001-01-01' }), target),
      guessEntry(makeCard({ name: 'B', released_at: '2010-01-01' }), target),
      guessEntry(makeCard({ name: 'C', released_at: target.released_at }), target), // exact match
    ]);
    expect(hints).toContainEqual({ kind: 'released', value: '2008-06-01', negated: false });
    expect(hints.filter((h) => h.kind === 'released')).toHaveLength(1);
  });
});

describe('hintToClause', () => {
  it('renders positive and negative clauses per kind', () => {
    expect(hintToClause({ kind: 'type', value: 'Creature' })).toBe('t:creature');
    expect(hintToClause({ kind: 'type', value: 'Creature', negated: true })).toBe('-t:creature');
    expect(hintToClause({ kind: 'color', value: 'R' })).toBe('c:r');
    expect(hintToClause({ kind: 'color', value: 'W', negated: true })).toBe('-c:w');
    expect(hintToClause({ kind: 'colorSet', value: 'RW' })).toBe('c=rw');
    expect(hintToClause({ kind: 'keyword', value: 'Flying' })).toBe('kw:flying');
    expect(hintToClause({ kind: 'layout', value: 'transform', negated: true })).toBe('-layout:transform');
    expect(hintToClause({ kind: 'mana', value: '{2}{R}' })).toBe('mana={2}{R}');
    expect(hintToClause({ kind: 'manaValue', value: '3' })).toBe('mv=3');
    expect(hintToClause({ kind: 'manaValue', value: '3', negated: true })).toBe('mv!=3');
    expect(hintToClause({ kind: 'power', value: '3' })).toBe('pow=3');
    expect(hintToClause({ kind: 'power', value: '3', negated: true })).toBe('pow!=3');
    expect(hintToClause({ kind: 'toughness', value: '2' })).toBe('tou=2');
    expect(hintToClause({ kind: 'loyalty', value: '4', negated: true })).toBe('loy!=4');
    expect(hintToClause({ kind: 'released', value: '2020-01-01' })).toBe('date=2020-01-01');
    expect(hintToClause({ kind: 'released', value: '2009-01-10', dir: '>' })).toBe('date>2009-01-10');
    expect(hintToClause({ kind: 'released', value: '2009-01-10', dir: '<' })).toBe('date<2009-01-10');
    expect(hintToClause({ kind: 'defense', value: '2' })).toBeNull();
  });

  it('quotes values a Scryfall would misparse bare', () => {
    expect(hintToClause({ kind: 'type', value: 'Noble Knight' })).toBe('t:"noble knight"');
    expect(hintToClause({ kind: 'keyword', value: 'Forestcycling' })).toBe('kw:forestcycling');
    expect(hintToClause({ kind: 'type', value: "Urza's" })).toBe('t:urza\'s'); // apostrophes are fine bare
  });
});

describe('buildScryfallSearchUrl', () => {
  it('combines all hints and always appends not:reprint', () => {
    const url = buildScryfallSearchUrl([
      { kind: 'type', value: 'Creature' },
      { kind: 'manaValue', value: '4' },
      { kind: 'color', value: 'U', negated: true },
      { kind: 'released', value: '2009-01-10', dir: '>' },
    ]);
    expect(url).toBe(
      'https://scryfall.com/search/?q=t%3Acreature%20mv%3D4%20-c%3Au%20date%3E2009-01-10%20not%3Areprint',
    );
  });

  it('handles an empty hint list with just the reprint filter', () => {
    expect(buildScryfallSearchUrl([])).toBe(
      'https://scryfall.com/search/?q=not%3Areprint',
    );
  });

  it('keeps the mana-cost braces URL-encoded', () => {
    expect(buildScryfallSearchUrl([{ kind: 'mana', value: '{2}{R}' }])).toBe(
      'https://scryfall.com/search/?q=mana%3D%7B2%7D%7BR%7D%20not%3Areprint',
    );
  });
});
