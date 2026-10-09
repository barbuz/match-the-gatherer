import { describe, it, expect } from 'vitest';
import { compareCards, stripReminderText } from '../src/lib/game/comparison.js';
import {
  gatherHints,
  hintToClause,
  buildScryfallSearchUrl,
  buildScryfallQuery,
  MAX_QUERY_LENGTH,
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
    rarity: 'uncommon',
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
        makeCard({ name: 'A', manacost: '{2}{R}', cmc: 3, colors: ['R'], type_line: 'Creature — Goblin Warrior', power: '3', toughness: '2', oracle_text: 'Flying', released_at: '2020-01-01' }),
        makeCard({ oracle_text: 'Flying' }),
      ),
    ]);
    expect(hints).toEqual(
      expect.arrayContaining([
        { kind: 'manaValue', value: '3', negated: false },
        { kind: 'mana', value: '{2}{R}', negated: false },
        { kind: 'color', value: 'R', negated: false },
        { kind: 'type', value: 'Creature', negated: false },
        { kind: 'type', value: 'Goblin', negated: false },
        { kind: 'type', value: 'Warrior', negated: false },
        { kind: 'power', value: '3', negated: false },
        { kind: 'toughness', value: '2', negated: false },
        { kind: 'released', value: '2020-01-01', negated: false },
      ]),
    );
  });

  it('collects negative hints and correct positives from mismatches', () => {
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
      oracle_text: 'Haste',
      released_at: '2019-01-01',
    });
    const hints = gatherHints([guessEntry(guess, target,)]);
    expect(hints).toEqual(
      expect.arrayContaining([
        // MV was wrong, so `mv!=5` stands in for the whole cost line: no
        // `mana!={4}{R}` survives (it would add nothing).
        { kind: 'manaValue', value: '5', negated: true },
        { kind: 'color', value: 'R', negated: false },             // matching guessed color
        { kind: 'color', value: 'W', negated: true }, // non-matching guessed color
        { kind: 'type', value: 'Artifact', negated: true }, // supertype guessed but not on target
        { kind: 'type', value: 'Creature', negated: false },        // shared type token
        { kind: 'type', value: 'Golem', negated: true },
        { kind: 'toughness', value: '5', negated: true },
        { kind: 'released', value: '2019-01-01', dir: '>', negated: false }, // target released after the guess
      ]),
    );
    // The target's own power (3) matched so it stays a positive hint.

    expect(hints).toContainEqual({ kind: 'power', value: '3', negated: false });
  });

  it('deduplicates repeated hints across guesses', () => {
    const card = makeCard({ name: 'A', colors: ['R'], type_line: 'Creature — Goblin Warrior', oracle_text: 'Flying' });
    const target = makeCard({ oracle_text: 'Flying' });
    const hints = gatherHints([
      guessEntry(card, target),
      guessEntry(makeCard({ name: 'B', colors: ['R'], type_line: 'Artifact — Golem', oracle_text: 'Flying' }), target),
    ]);
    const count = (kind, value, negated = false) =>
      hints.filter((h) => h.kind === kind && h.value === value && (h.negated ?? false) === negated).length;
    expect(count('color', 'R')).toBe(1);
    expect(count('type', 'Creature')).toBe(1);
    expect(count('oracle', 'Flying')).toBe(1); // shared line token deduped across guesses
    expect(count('power', '3')).toBe(1); // identical P/T across both guesses
  });

  it('skips power/toughness/loyalty hints when the target lacks the property', () => {
    const guess = makeCard({ name: 'A', type_line: 'Creature — Bear', power: '2', toughness: '2' });
    const target = makeCard({ type_line: 'Instant', power: undefined, toughness: undefined });
    const hints = gatherHints([guessEntry(guess, target)]);
    expect(hints.some((h) => h.kind === 'power' || h.kind === 'toughness')).toBe(false);
  });

  it('ignores the empty-hold placeholder and defense stats', () => {
    const bothEmpty = guessEntry(
      makeCard({ name: 'A', colors: [], type_line: '', oracle_text: '', power: undefined, toughness: undefined, loyalty: undefined }),
      makeCard({ name: 'T', colors: [], type_line: '', oracle_text: '', power: undefined, toughness: undefined, loyalty: undefined }),
    );
    const hints = gatherHints([bothEmpty]);
    expect(hints.filter((h) => h.kind === 'color')).toHaveLength(0);
    expect(hints.filter((h) => h.kind === 'type')).toHaveLength(0);
    expect(hints.filter((h) => h.kind === 'oracle')).toHaveLength(0);
    expect(hints.some((h) => h.kind === 'defense')).toBe(false);
  });

  it('emits a positive rarity hint bila fully matched rarity line', () => {
    const hints = gatherHints([
      guessEntry(
        makeCard({ name: 'A', rarity: 'uncommon' }),
        makeCard({ name: 'T', rarity: 'uncommon' }),
      ),
    ]);
    expect(hints).toContainEqual({ kind: 'rarity', value: 'uncommon', negated: false });
  });

 it('emits a negated rarity hint bila the guessed rarity differs', () => {
    const hints = gatherHints([
      guessEntry(
        makeCard({ name: 'A', rarity: 'mythic' }),
        makeCard({ name: 'T', rarity: 'rare' }),
      ),
    ]);
    expect(hints).toContainEqual({ kind: 'rarity', value: 'mythic', negated: true });
  });

 it('drops later rarity hints once the rarity is already pinned', () => {
    const target = makeCard({ rarity: 'rare' });
    const hints = gatherHints([
      guessEntry(makeCard({ name: 'A', rarity: 'uncommon' }), target),
      guessEntry(makeCard({ name: 'B', rarity: 'rare' }), target),
    ]);
    expect(hints).toContainEqual({ kind: 'rarity', value: 'rare', negated: false });
    expect(hints.filter((h) => h.kind === 'rarity')).toHaveLength(1);
  });


  it('pulls exact mana cost from a fully correct mana line', () => {
    const hints = gatherHints([guessEntry(makeCard({ name: 'A', mana_cost: '{2}{R}', cmc: 3 }))]);
    expect(hints).toContainEqual({ kind: 'mana', value: '{2}{R}', negated: false });
    expect(hints).toContainEqual({ kind: 'manaValue', value: '3', negated: false });
  });

  it('emits no cost negation when the mana value is wrong too', () => {
    // The `mv!=5` hint alone covers every card with the guessed cost, so no
    // `mana!={4}{R}` survives.
    const hints = gatherHints([
      guessEntry(
        makeCard({ name: 'A', mana_cost: '{4}{R}', cmc: 5 }),
        makeCard({ name: 'T', mana_cost: '{2}{R}', cmc: 3 }),
      ),
    ]);
    expect(hints).toContainEqual({ kind: 'manaValue', value: '5', negated: true });
    expect(hints.filter((h) => h.kind === 'mana' && h.negated)).toHaveLength(0); // no mana!={4}{R} — mv!= suffices
  });

it('emits a negated exact-cost hint on a same-MV different-cost wrong line', () => {
    const hints = gatherHints([
      guessEntry(
        makeCard({ name: 'A', mana_cost: '{3}{R}', cmc: 4 }),
        makeCard({ name: 'T', mana_cost: '{2}{R}{R}', cmc: 4 }),
      ),
    ]);
    expect(hints).toContainEqual({ kind: 'manaValue', value: '4', negated: false });
    expect(hints).toContainEqual({ kind: 'mana', value: '{3}{R}', negated: true });
  });

  it('emits one mana!= clause per wrong whole cost on a wrong split line', () => {
    // A split guess whose every face cost fails: each whole cost gets its
    // own negation (ANDed — “neither”), instead of being rejoined into the
    // combined card-level `mana_cost` string that exists on no single face.


    const split = makeCard({
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
    const hints = gatherHints([
      guessEntry(
        split,
        makeCard({ name: 'T', mana_cost: '{2}{G}{G}', cmc: 4, colors: ['G'], type_line: 'Instant' }),
      ),
    ]);
    expect(hints).toContainEqual({ kind: 'mana', value: '{1}{R}', negated: true });
    expect(hints).toContainEqual({ kind: 'mana', value: '{1}{U}', negated: true });
    expect(hints.filter((h) => h.kind === 'mana' && h.negated)).toHaveLength(2);
    expect(hints.some((h) => h.kind === 'mana' && h.value === '{1}{R}{1}{U}}')).toBe(false);
  });

  it('drops negated exact-cost hints once the exact cost is pinned', () => {
    const target = makeCard();
    const hints = gatherHints([
      guessEntry(makeCard({ name: 'A', mana_cost: '{4}{R}', cmc: 5 }), target),
      guessEntry(makeCard({ name: 'B', mana_cost: '{2}{R}', cmc: 3 }), target),
    ]);
    expect(hints).toContainEqual({ kind: 'mana', value: '{2}{R}', negated: false });
    expect(hints.filter((h) => h.kind === 'mana' && h.negated)).toHaveLength(0); // no mana!={4}{R} survives
    expect(hints.filter((h) => h.kind === 'mana')).toHaveLength(1);
  });

  it('drops the no-mana-cost display token', () => {
    const hints = gatherHints([guessEntry(makeCard({ name: 'A', mana_cost: '' }))]);
    expect(hints.some((h) => h.kind === 'mana' && h.value === '(no mana cost)')).toBe(false);
  });

  it('emits per-color contains hints (never an exact set) on a fully matched color line', () => {
    // Regression: a fully matched colors row only proves the guessed colors
    // are a subset of the target's, so pinning `c=` would wrongly exclude
    // unguessed colors (a B,G row must not exclude U on a B,G,U target).
    const hints = gatherHints([
      guessEntry(
        makeCard({ name: 'A', colors: ['R', 'W'] }),
        makeCard({ name: 'T', colors: ['W', 'R'] }),
      ),
    ]);
    expect(hints).toContainEqual({ kind: 'color', value: 'R', negated: false });
    expect(hints).toContainEqual({ kind: 'color', value: 'W', negated: false });
    expect(hints.filter((h) => h.kind === 'colorSet')).toHaveLength(0);
    expect(hintToClause({ kind: 'color', value: 'R' })).toBe('c:r');
  });


  it('drops negated scalar hints once the exact value is pinned', () => {
    // Toughness 1 matches on the first guess (pt line wrong since power
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
  it('drops wrong hints once a property line is fully matched', () => {
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
    expect(hints).toContainEqual({ kind: 'color', value: 'U', negated: false });
    expect(hints).toContainEqual({ kind: 'type', value: 'Creature', negated: false });
  });


  it('keeps negated type hints even after a fully-matched type line', () => {
    // Scryfall's t: is a contains-match (no exact-type-line operator), so
    // learned negations (e.g. -t:legendary) stay informative: even once the
    // type tokens are fully known, a guessed extra supertype must keep
    // excluding cards with that extra token.

    const target = makeCard({ type_line: 'Creature — Wizard' });
    const hints = gatherHints([
      guessEntry(makeCard({ name: 'A', type_line: 'Creature — Wizard' }), target), // fully matched type row
      guessEntry(makeCard({ name: 'B', type_line: 'Legendary Creature — Wizard' }), target), // wrong: 'legendary' misses
    ]);
    expect(hints).toContainEqual({ kind: 'type', value: 'Creature', negated: false });
    expect(hints).toContainEqual({ kind: 'type', value: 'Wizard', negated: false });
    expect(hints).toContainEqual({ kind: 'type', value: 'Legendary', negated: true }); // survives despite the fully-matched row
    expect(hints.filter((h) => h.kind === 'type' && h.value === 'Legendary')).toHaveLength(1);
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

  it('matches tokens from any face of a multi-faced target (issue #27)', () => {
    // Regression: "Norman Osborn // Green Goblin" was wrongly excluded from
    // the hint URL even though the comparison feedback says the guess matches:
    // Scryfall's t:/pow:/tou:/mana: operators index ANY face, so aguessed
    // token found only on the target's back face must still be emitted.


    const dfc = {
      name: 'Norman Osborn // Green Goblin',
      layout: 'transform',
      card_faces: [
        {
          name: 'Norman Osborn',
          type_line: 'Legendary Creature — Human Rogue',
          power: '2',
          toughness: '2',
          colors: ['W', 'U'],
          mana_cost: '{1}{U}',
          oracle_text: '',
        },
        {
          name: 'Green Goblin',
          type_line: 'Legendary Creature — Goblin',
          power: '4',
          toughness: '4',
          colors: ['G'],
          mana_cost: '{2}{G}',
          oracle_text: '',
        },
      ],
      colors: ['U', 'G'],
      cmc: 3,
      power: undefined,
      toughness: undefined,
      oracle_text: '',
      released_at: '2020-10-01',
      rarity: 'mythic',
    };
    const guess = {
      ...makeCard({ name: 'A', type_line: 'Creature — Goblin', power: '4', toughness: '4' }),
      mana_cost: '{2}{G}',
      cmc: 3,
    };
    const hints = gatherHints([guessEntry(guess, dfc)]);
    // The back face's tokens are the only clues the guess locks into: every
    // comparison row is correct, so the hint list must carry them.
    expect(hints).toContainEqual({ kind: 'type', value: 'Goblin', negated: false });
    expect(hints).toContainEqual({ kind: 'power', value: '4', negated: false });
    expect(hints).toContainEqual({ kind: 'toughness', value: '4', negated: false });
    expect(hints).toContainEqual({ kind: 'mana', value: '{2}{G}', negated: false });
    expect(hints.some((h) => h.kind === 'type' && h.value === 'Human')).toBe(false); // front-face guess-only token
  });

  it('never filters on the `//` face separator or other separators', () => {
    // Regression: a modal-DFC guess emits `//` separator segments on its
    // type/pt/etc. rows. Those separators are layout, not values, so no hint
    // may carry `//` (nor the `—` subtype dash) as a filter value.
    const dfc = {
      name: 'Norman Osborn // Green Goblin',
      layout: 'modal_dfc',
      card_faces: [
        { name: 'Norman Osborn', type_line: 'Legendary Creature — Human Scientist Villain', power: '1', toughness: '1', colors: ['U'], mana_cost: '{1}{U}', oracle_text: '' },
        { name: 'Green Goblin', type_line: 'Legendary Creature — Goblin Human Villain', power: '3', toughness: '3', colors: ['B', 'R', 'U'], mana_cost: '{1}{U}{B}{R}', oracle_text: '' },
      ],
      colors: ['U', 'B', 'R'],
      cmc: 2,
      power: undefined,
      toughness: undefined,
      oracle_text: '',
      released_at: '2025-09-23',
      rarity: 'mythic',
    };
    const hints = gatherHints([guessEntry(dfc, makeCard({ name: 'T', power: '9', toughness: '9' }))]);
    const bad = hints.filter((h) => ['//', '—', '/', ''].includes(h.value));
    expect(bad).toHaveLength(0);
    // PT still resolves by position within each face (power before slash,
    // toughness after), so real stats are not lost to the separators.
    expect(hints).toContainEqual({ kind: 'power', value: '1', negated: true });
    expect(hints).toContainEqual({ kind: 'power', value: '3', negated: true });
    expect(hints).toContainEqual({ kind: 'toughness', value: '1', negated: true });
    expect(hints).toContainEqual({ kind: 'toughness', value: '3', negated: true });
  });

  it('keeps every guessed color as contains hints even after a fully matched color row', () => {
    // Regression for the reported game (target Gurmag Nightwatch, B/G/U):
    // guesses Chromanticore (WUBRG), The Gitrog Monster (B,G), and
    // Norman Osborn // Green Goblin (B,R,U). The Gitrog Monster's colors row
    // is fully correct (B,G are both on the target), but the old code pinned
    // the set to `c=bg`, dropping the target's U and the negations for R/W.
    // The hint URL must include c:b, c:g, c:u and exclude -c:r, -c:w.
    const chromanticore = makeCard({ name: 'Chromanticore', colors: ['W', 'U', 'B', 'R', 'G'], type_line: 'Enchantment Creature — Manticore', power: '4', toughness: '4', mana_cost: '{W}{U}{B}{R}{G}', cmc: 5 });
    const gitrog = makeCard({ name: 'The Gitrog Monster', colors: ['B', 'G'], type_line: 'Legendary Creature — Frog Horror', power: '6', toughness: '6', mana_cost: '{3}{B}{G}', cmc: 5 });
    const norman = {
      name: 'Norman Osborn // Green Goblin',
      layout: 'modal_dfc',
      card_faces: [
        { name: 'Norman Osborn', type_line: 'Legendary Creature — Human Scientist Villain', power: '1', toughness: '1', colors: ['U'], mana_cost: '{1}{U}', oracle_text: '' },
        { name: 'Green Goblin', type_line: 'Legendary Creature — Goblin Human Villain', power: '3', toughness: '3', colors: ['B', 'R', 'U'], mana_cost: '{1}{U}{B}{R}', oracle_text: '' },
      ],
      colors: ['U', 'B', 'R'], cmc: 2, power: undefined, toughness: undefined,
      oracle_text: '', released_at: '2025-09-23', rarity: 'mythic',
    };
    const target = makeCard({ name: 'Gurmag Nightwatch', colors: ['B', 'G', 'U'], type_line: 'Creature — Human Ranger', power: '3', toughness: '3', mana_cost: '{2/B}{2/G}{2/U}', cmc: 6 });
    // Gurmag Nightwatch's print date is after every guess's.
    const entries = [chromanticore, gitrog, norman].map((card) => guessEntry(card, target));
    const hints = gatherHints(entries);

    for (const c of ['B', 'G', 'U']) {
      expect(hints).toContainEqual({ kind: 'color', value: c, negated: false });
    }
    for (const c of ['R', 'W']) {
      expect(hints).toContainEqual({ kind: 'color', value: c, negated: true });
    }
    expect(hints.filter((h) => h.kind === 'colorSet')).toHaveLength(0);

    const url = decodeURIComponent(buildScryfallSearchUrl(hints).url);
    expect(url).toContain('c:b');
    expect(url).toContain('c:g');
    expect(url).toContain('c:u');
    expect(url).toContain('-c:r');
    expect(url).toContain('-c:w');
    expect(url).not.toContain('c=');
  });

  it('coerces variable power/toughness hints instead of dropping them', () => {
    // Regression: guessing Tarmogoyf (power `*`, toughness `1+*`) emitted
    // `pow!=* tou!=1+*`. Scryfall's pow/tou operators are numeric-only, but
    // they don't reject a variable stat — they coerce it to its leading
    // constant (`1+*` -> 1) or 0 for a bare `*`. So the hint is still
    // expressible, and it must not 404 the URL.
    const tarmogoyf = makeCard({
      name: 'Tarmogoyf',
      mana_cost: '{1}{G}',
      cmc: 2,
      colors: ['G'],
      type_line: 'Creature — Lhurgoyf',
      power: '*',
      toughness: '1+*',
      oracle_text: '',
    });
    const target = makeCard({
      name: 'T',
      mana_cost: '{3}{R}',
      cmc: 4,
      colors: ['R'],
      type_line: 'Creature — Dragon',
      power: '4',
      toughness: '4',
      oracle_text: '',
    });
    const hints = gatherHints([guessEntry(tarmogoyf, target)]);

    expect(hints).toContainEqual({ kind: 'power', value: '0', negated: true });
    expect(hints).toContainEqual({ kind: 'toughness', value: '1', negated: true });

    const url = decodeURIComponent(buildScryfallSearchUrl(hints).url);
    expect(url).toContain('pow!=0');
    expect(url).toContain('tou!=1');
    expect(url).not.toContain('pow!=*');
    expect(url).not.toContain('tou!=1+*');
    // The rest of the clue set survives.
    expect(url).toContain('t:creature');
    expect(url).toContain('mv!=2');
  });

  it('coerces every variable stat form Scryfall accepts', () => {
    // Leading constant wins; a bare `*`/`X`/`?` is 0. Verified against the
    // live API (`pow=2` matches Angry Mob's `2+*`, `tou=1` matches
    // Consuming Blob's `*+1`, `pow=0` matches Shellephant's `?`).
    expect(hintToClause({ kind: 'power', value: '1+*', negated: true })).toBe('pow!=1');
    expect(hintToClause({ kind: 'power', value: '2+*', negated: true })).toBe('pow!=2');
    expect(hintToClause({ kind: 'toughness', value: '*+1', negated: true })).toBe('tou!=1');
    expect(hintToClause({ kind: 'power', value: '*', negated: true })).toBe('pow!=0');
    expect(hintToClause({ kind: 'toughness', value: '?', negated: true })).toBe('tou!=0');
    expect(hintToClause({ kind: 'loyalty', value: 'X', negated: true })).toBe('loy!=0');
    // `+1`/`+0` carry a sign only.
    expect(hintToClause({ kind: 'power', value: '+1' })).toBe('pow=1');
    expect(hintToClause({ kind: 'toughness', value: '+0' })).toBe('tou=0');
    // Unreadable values have no Scryfall expression at all.
    expect(hintToClause({ kind: 'power', value: '∞' })).toBeNull();
  });

  it('keeps numeric power/toughness hints, including negative and fractional values', () => {
    const target = makeCard({ name: 'T', power: '2', toughness: '2' });
    const guess = makeCard({ name: 'A', power: '-1', toughness: '0.5', type_line: 'Creature — Ooze' });
    const hints = gatherHints([guessEntry(guess, target)]);
    expect(hints).toContainEqual({ kind: 'power', value: '-1', negated: true });
    expect(hints).toContainEqual({ kind: 'toughness', value: '0.5', negated: true });
    expect(hintToClause({ kind: 'power', value: '-1', negated: true })).toBe('pow!=-1');
    expect(hintToClause({ kind: 'toughness', value: '0.5', negated: true })).toBe('tou!=0.5');
  });

  it('coerces variable loyalty hints', () => {
    const target = makeCard({ name: 'T', type_line: 'Planeswalker — Test', power: undefined, toughness: undefined, loyalty: '3' });
    const guess = makeCard({ name: 'A', type_line: 'Planeswalker — Test', power: undefined, toughness: undefined, loyalty: '*' });
    const hints = gatherHints([guessEntry(guess, target)]);
    expect(hints).toContainEqual({ kind: 'loyalty', value: '0', negated: true });
    expect(hintToClause({ kind: 'loyalty', value: '*', negated: true })).toBe('loy!=0');
  });

  it('never emits a stat clause that excludes a target with the same indexed value', () => {
    // Soundness: the comparison layer must coerce exactly like Scryfall, or a
    // "wrong" verdict can exclude the true answer. A `1+*` guess facing a
    // target whose toughness is literally `1` is a MATCH in Scryfall's index
    // (`tou=1` returns Tarmogoyf), so the row must be correct — otherwise the
    // hint would read `tou!=1` and filter out the answer.
    const guess = makeCard({
      name: 'Tarmogoyf', mana_cost: '{1}{G}', cmc: 2, colors: ['G'],
      type_line: 'Creature — Lhurgoyf', power: '*', toughness: '1+*', oracle_text: '',
    });
    const target = makeCard({
      name: 'Llanowar Elves', mana_cost: '{G}', cmc: 1, colors: ['G'],
      type_line: 'Creature — Elf Druid', power: '0', toughness: '1', oracle_text: '',
    });
    const entry = guessEntry(guess, target);
    const pt = entry.results.find((r) => r.key === 'pt');
    expect(pt.segments).toEqual([
      { text: '*', status: 'correct' },
      { slash: true },
      { text: '1+*', status: 'correct' },
    ]);

    const hints = gatherHints([entry]);
    // Both stats match the target's indexed values, so the hints are positive
    // (never a negation that would filter the answer out).
    expect(hints).toContainEqual({ kind: 'power', value: '0', negated: false });
    expect(hints).toContainEqual({ kind: 'toughness', value: '1', negated: false });
    expect(hints.some((h) => (h.kind === 'power' || h.kind === 'toughness') && h.negated)).toBe(false);
  });

  it('emits positive and negated oracle line hints', () => {
    const target = makeCard({ oracle_text: 'Flying\nVigilance' });
    const guess = makeCard({ oracle_text: 'Flying\nTrample' });
    const hints = gatherHints([guessEntry(guess, target)]);
    expect(hints).toContainEqual({ kind: 'oracle', value: 'Flying', negated: false });
    expect(hints).toContainEqual({ kind: 'oracle', value: 'Trample', negated: true });
    expect(hints.some((h) => h.kind === 'oracle' && h.value === 'Vigilance')).toBe(false);
  });

  it('keeps negated oracle hints even after a fully-matched oracle line', () => {
    // `o:` is a contains-match (no exact-oracle operator), so a fully matched
    // row only proves the guessed lines are a subset of the target's: a line
    // from another guess that the target lacks still narrows the search.
    const target = makeCard({ oracle_text: 'Flying\nVigilance' });
    const hints = gatherHints([
      guessEntry(makeCard({ name: 'A', oracle_text: 'Flying\nVigilance' }), target), // fully matched
      guessEntry(makeCard({ name: 'B', oracle_text: 'Flying\nTrample' }), target),   // 'Trample' misses
    ]);
    expect(hints).toContainEqual({ kind: 'oracle', value: 'Flying', negated: false });
    expect(hints).toContainEqual({ kind: 'oracle', value: 'Trample', negated: true });
    expect(hints.filter((h) => h.kind === 'oracle' && h.value === 'Trample')).toHaveLength(1);
  });

  it('renders oracle hints as quoted o: clauses, reminder text excluded', () => {
    const target = makeCard({ oracle_text: 'Ward {2} (This creature can\'t be blocked.)\nDestroy target artifact.' });
    const guess = makeCard({ oracle_text: 'Ward {2} (Different reminder.)\nDestroy target artifact.\n"I — This Saga gains"' });
    const hints = gatherHints([guessEntry(guess, target)]);

    const url = decodeURIComponent(buildScryfallSearchUrl(hints).url);
    expect(url).toContain('o:"Ward {2}"');
    expect(url).toContain('o:"Destroy target artifact."');
    expect(url).toContain('-o:"I — This Saga gains"');
    // Reminder text is stripped, so it never becomes a hint.
    expect(url).not.toContain('reminder');
    expect(url).not.toContain("can't be blocked");

    for (const h of hints.filter((x) => x.kind === 'oracle')) {
      expect(h.value).not.toContain('"');
      expect(h.value.length).toBeGreaterThan(0);
      expect(hintToClause(h)).toBeTruthy();
    }
  });

  it('every emitted oracle token is a verbatim substring of the stripped target text', () => {
    // The exactness guarantee: a positive `o:` must match the true answer, and
    // a negative `-o:` must NOT, or it would filter the answer out. `o:` indexes
    // the oracle text with reminder `(...)` spans removed, so compare against
    // that stripped text.
    const target = makeCard({
      oracle_text: 'Flying\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)',
    });
    const guess = makeCard({ oracle_text: 'Flying\nTrample' });
    const hints = gatherHints([guessEntry(guess, target)]);
    const flat = stripReminderText(target.oracle_text).replace(/\n/g, '').toLowerCase();
    for (const h of hints.filter((x) => x.kind === 'oracle' && !x.negated)) {
      expect(flat).toContain(h.value.toLowerCase());
    }
    for (const h of hints.filter((x) => x.kind === 'oracle' && x.negated)) {
      expect(flat).not.toContain(h.value.toLowerCase());
    }
  });

  it('matches a guessed line that is a substring of a longer target line', () => {
    // Regression: line tokenization means a whole guessed line can appear inside
    // a longer target line. `o:` is a substring match, so the row must read
    // correct — otherwise the negation `-o:"Flying"` would exclude a target
    // whose text literally contains "Flying".
    const target = makeCard({ oracle_text: 'Flying, vigilance' });
    const guess = makeCard({ oracle_text: 'Flying' });
    const entry = guessEntry(guess, target);
    const oracle = entry.results.find((r) => r.key === 'oracle');
    expect(oracle.status).toBe('correct');
    expect(oracle.correct).toEqual(['Flying']);
    expect(oracle.wrong).toEqual([]);

    const hints = gatherHints([entry]);
    expect(hints.some((h) => h.kind === 'oracle' && h.negated)).toBe(false);
    expect(hints).toContainEqual({ kind: 'oracle', value: 'Flying', negated: false });
  });

  it('the oracle tokens compareCards highlights are exactly the ones gatherHints can emit', () => {
    const target = makeCard({ oracle_text: 'Flying\nVigilance' });
    const guess = makeCard({ oracle_text: 'Flying\nTrample' });
    const entry = guessEntry(guess, target);
    const oracle = entry.results.find((r) => r.key === 'oracle');
    const highlighted = new Set(
      oracle.segments.filter((s) => s.token).map((s) => s.text.toLowerCase()),
    );
    const emitted = new Set(
      gatherHints([entry]).filter((h) => h.kind === 'oracle').map((h) => h.value.toLowerCase()),
    );
    expect(emitted).toEqual(highlighted);
  });

  it('emits kw: hints from printed keywords, using the canonical name', () => {
    const target = makeCard({ keywords: ['Flying'], oracle_text: 'Flying' });
    const guess = makeCard({
      keywords: ['Flying', 'Kicker'],
      oracle_text: 'Flying, kicker {2} (You may pay {2}.)\nDraw a card.',
    });
    const hints = gatherHints([guessEntry(guess, target)]);
    expect(hints).toContainEqual({ kind: 'keyword', value: 'flying', negated: false });
    expect(hints).toContainEqual({ kind: 'keyword', value: 'kicker', negated: true });
    // `kw:` matches by name, so the printed parameter never leaks into a hint.
    expect(hints.some((h) => h.kind === 'keyword' && /[{}]/.test(h.value))).toBe(false);
  });

  it('keeps negated keyword hints even after a fully-matched keywords row', () => {
    const target = makeCard({ keywords: ['Flying', 'Vigilance'], oracle_text: 'Flying, vigilance' });
    const hints = gatherHints([
      guessEntry(makeCard({ keywords: ['Flying'], oracle_text: 'Flying' }), target),
      guessEntry(makeCard({ keywords: ['Flying', 'Haste'], oracle_text: 'Flying, haste' }), target),
    ]);
    expect(hints).toContainEqual({ kind: 'keyword', value: 'flying', negated: false });
    expect(hints).toContainEqual({ kind: 'keyword', value: 'haste', negated: true });
  });

  it('does not emit kw: for vocabulary keywords that are not printed keyword lines', () => {
    const target = makeCard({ keywords: ['Treasure'], oracle_text: 'Create a Treasure token.' });
    const guess = makeCard({
      keywords: ['Treasure'],
      oracle_text: 'Create a Treasure token.',
    });
    const hints = gatherHints([guessEntry(guess, target)]);
    expect(hints.some((h) => h.kind === 'keyword')).toBe(false);
  });
});

describe('hintToClause', () => {
  it('renders positive and negative clauses per kind', () => {
    expect(hintToClause({ kind: 'type', value: 'Creature' })).toBe('t:creature');
    expect(hintToClause({ kind: 'type', value: 'Creature', negated: true })).toBe('-t:creature');
    expect(hintToClause({ kind: 'color', value: 'R' })).toBe('c:r');
    expect(hintToClause({ kind: 'color', value: 'W', negated: true })).toBe('-c:w');
    expect(hintToClause({ kind: 'keyword', value: 'Flying' })).toBe('kw:flying');
    expect(hintToClause({ kind: 'keyword', value: 'Split second', negated: true })).toBe('-kw:"split second"');
    // Oracle hints use `o:` (oracle text with reminder text removed) so a token
    // from the shared tokenizer is a verbatim substring of the target.
    expect(hintToClause({ kind: 'oracle', value: 'Flying' })).toBe('o:Flying');
    expect(hintToClause({ kind: 'oracle', value: 'Flying', negated: true })).toBe('-o:Flying');
    expect(hintToClause({ kind: 'oracle', value: 'enter the battlefield' })).toBe('o:"enter the battlefield"');
    expect(hintToClause({ kind: 'layout', value: 'transform', negated: true })).toBe('-layout:transform');
    expect(hintToClause({ kind: 'mana', value: '{2}{R}' })).toBe('mana={2}{R}');
    expect(hintToClause({ kind: 'mana', value: '{2}{R}', negated: true })).toBe('mana!={2}{R}');
    expect(hintToClause({ kind: 'manaValue', value: '3' })).toBe('mv=3');
    expect(hintToClause({ kind: 'manaValue', value: '3', negated: true })).toBe('mv!=3');
    expect(hintToClause({ kind: 'power', value: '3' })).toBe('pow=3');
    expect(hintToClause({ kind: 'power', value: '3', negated: true })).toBe('pow!=3');
    expect(hintToClause({ kind: 'toughness', value: '2' })).toBe('tou=2');
    expect(hintToClause({ kind: 'loyalty', value: '4', negated: true })).toBe('loy!=4');
    expect(hintToClause({ kind: 'rarity', value: 'rare' })).toBe('r:rare');
    expect(hintToClause({ kind: 'rarity', value: 'Mythic', negated: true })).toBe('-r:mythic');
    expect(hintToClause({ kind: 'released', value: '2020-01-01' })).toBe('date=2020-01-01');
    expect(hintToClause({ kind: 'released', value: '2009-01-10', dir: '>' })).toBe('date>2009-01-10');
    expect(hintToClause({ kind: 'released', value: '2009-01-10', dir: '<' })).toBe('date<2009-01-10');
    expect(hintToClause({ kind: 'defense', value: '2' })).toBeNull();
  });

  it('quotes values a Scryfall would misparse bare', () => {
    expect(hintToClause({ kind: 'type', value: 'Noble Knight' })).toBe('t:"noble knight"');
    expect(hintToClause({ kind: 'oracle', value: 'Forestcycling' })).toBe('o:Forestcycling');
    expect(hintToClause({ kind: 'type', value: "Urza's" })).toBe('t:urza\'s'); // apostrophes are fine bare
  });
});

describe('buildScryfallSearchUrl', () => {
  it('combines all hints and always appends not:reprint', () => {
    const { url, truncated, dropped, warning } = buildScryfallSearchUrl([
      { kind: 'type', value: 'Creature' },
      { kind: 'manaValue', value: '4' },
      { kind: 'color', value: 'U', negated: true },
      { kind: 'released', value: '2009-01-10', dir: '>' },
    ]);
    expect(url).toBe(
      'https://scryfall.com/search/?q=t%3Acreature%20mv%3D4%20-c%3Au%20date%3E2009-01-10%20f%3Av%20not%3Areprint',
    );
    expect(truncated).toBe(false);
    expect(dropped).toBe(0);
    expect(warning).toBeNull();
  });

  it('handles an empty hint list with just the reprint filter', () => {
    expect(buildScryfallSearchUrl([]).url).toBe(
      'https://scryfall.com/search/?q=f%3Av%20not%3Areprint',
    );
  });

  it('keeps the mana-cost braces URL-encoded', () => {
    expect(buildScryfallSearchUrl([{ kind: 'mana', value: '{2}{R}' }]).url).toBe(
      'https://scryfall.com/search/?q=mana%3D%7B2%7D%7BR%7D%20f%3Av%20not%3Areprint',
    );
  });

  it('keeps negated o: clauses while the query fits (no needless precision loss)', () => {
    const { url, truncated } = buildScryfallSearchUrl([
      { kind: 'oracle', value: 'Flying' },
      { kind: 'oracle', value: 'Trample', negated: true },
    ]);
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('o:Flying');
    expect(decoded).toContain('-o:Trample');
    expect(truncated).toBe(false);
  });

  it("drops the longest clauses until the query fits Scryfall's limit", () => {
    // A real game can gather dozens of long oracle clauses. The query must stay
    // within Scryfall's 1000-character `q` limit or the search truncates mid
    // clause, so the longest (least specific) clauses are dropped and a warning
    // is surfaced.
    const hints = [];
    for (let i = 0; i < 40; i += 1) {
      hints.push({ kind: 'oracle', value: `Clause number ${i} that is deliberately quite long` });
    }
    hints.push({ kind: 'type', value: 'Creature' });
    const { url, truncated, dropped, warning } = buildScryfallSearchUrl(hints);
    const q = decodeURIComponent(url).split('q=')[1];
    expect(q.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    expect(truncated).toBe(true);
    expect(dropped).toBeGreaterThan(0);
    expect(warning).toMatch(/some longer clues were omitted/i);
    // The required clauses always survive.
    expect(q).toContain('f:v');
    expect(q).toContain('not:reprint');
    // The shortest non-required clause survives over the longer ones.
    expect(q).toContain('t:creature');
  });

  it('drops negated o: clauses before anything else when over budget', () => {
    // Negated `o:` is the biggest length contributor and the least useful hint,
    // so it is sacrificed first — the more specific positive clauses stay.
    const hints = [{ kind: 'type', value: 'Creature' }, { kind: 'oracle', value: 'Flying' }];
    for (let i = 0; i < 40; i += 1) {
      hints.push({ kind: 'oracle', value: `Negated clause ${i} with a fairly long oracle text`, negated: true });
    }
    hints.push({ kind: 'manaValue', value: '4' });
    const { url, truncated } = buildScryfallSearchUrl(hints);
    const q = decodeURIComponent(url).split('q=')[1];
    expect(truncated).toBe(true);
    expect(q).not.toContain('-o:');
    expect(q).toContain('o:Flying');
    expect(q).toContain('t:creature');
    expect(q).toContain('mv=4');
  });

  it('does not drop clauses when the query already fits', () => {
    const { truncated, dropped, warning } = buildScryfallSearchUrl([
      { kind: 'type', value: 'Creature' },
      { kind: 'oracle', value: 'Flying' },
    ]);
    expect(truncated).toBe(false);
    expect(dropped).toBe(0);
    expect(warning).toBeNull();
  });
});

describe('buildScryfallQuery', () => {
  it('produces the unencoded clause string the hint URL encodes', () => {
    const hints = [
      { kind: 'type', value: 'Creature' },
      { kind: 'manaValue', value: '4' },
    ];
    expect(buildScryfallQuery(hints)).toBe('t:creature mv=4 f:v not:reprint');
    // The URL is exactly the encoded query, so a count run against the query
    // searches the same set the button opens.
    expect(buildScryfallSearchUrl(hints).url).toBe(
      `https://scryfall.com/search/?q=${encodeURIComponent(buildScryfallQuery(hints))}`,
    );
  });

  it('always appends the vintage + reprint filters even with no hints', () => {
    expect(buildScryfallQuery([])).toBe('f:v not:reprint');
  });

  it('shares the length clamp with the URL builder, so link and count agree', () => {
    const hints = [];
    for (let i = 0; i < 60; i += 1) {
      hints.push({ kind: 'oracle', value: `A fairly long oracle clause number ${i}` });
    }
    const query = buildScryfallQuery(hints);
    expect(query.length).toBeLessThanOrEqual(MAX_QUERY_LENGTH);
    // The count searches exactly the set the button opens.
    expect(decodeURIComponent(buildScryfallSearchUrl(hints).url).split('q=')[1]).toBe(query);
  });
});
