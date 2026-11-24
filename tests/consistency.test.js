import { describe, it, expect } from 'vitest';
import { compareCards } from '../src/lib/game/comparison.js';
import {
  analyzeGuesses,
  countMistakes,
  findGuessConflicts,
  rowForHint,
} from '../src/lib/game/consistency.js';

function card(overrides = {}) {
  return {
    name: 'Test Card',
    oracle_id: 'oracle-1',
    mana_cost: '{1}{R}',
    cmc: 2,
    colors: ['R'],
    type_line: 'Creature — Goblin',
    power: '2',
    toughness: '1',
    released_at: '2019-07-12',
    layout: 'normal',
    rarity: 'common',
    ...overrides,
  };
}

/** Conflict kind (or null) for a single hint against a card. */
const kindOf = (hint, c) => findGuessConflicts(c, [hint])[0]?.kind ?? null;

describe('findGuessConflicts — excluded (guess carries a ruled-out value)', () => {
  it('flags a type the target was shown not to be', () => {
    const hint = { kind: 'type', value: 'Artifact', negated: true };
    expect(kindOf(hint, card({ type_line: 'Artifact Creature — Golem' }))).toBe('excluded');
    expect(kindOf(hint, card({ type_line: 'Creature — Goblin' }))).toBe(null);
  });

  it('flags an excluded color and an excluded keyword', () => {
    expect(kindOf({ kind: 'color', value: 'U', negated: true }, card({ colors: ['U'] }))).toBe('excluded');
    expect(kindOf({ kind: 'color', value: 'U', negated: true }, card({ colors: ['R'] }))).toBe(null);
    expect(kindOf({ kind: 'keyword', value: 'flying', negated: true }, card({ oracle_text: 'Flying', keywords: ['Flying'] }))).toBe('excluded');
    expect(kindOf({ kind: 'keyword', value: 'flying', negated: true }, card({ oracle_text: 'Vigilance', keywords: ['Vigilance'] }))).toBe(null);
  });

  it('flags an excluded oracle token by case-insensitive substring', () => {
    const hint = { kind: 'oracle', value: 'Draw a card', negated: true };
    expect(kindOf(hint, card({ oracle_text: 'Draw a card.' }))).toBe('excluded');
    expect(kindOf(hint, card({ oracle_text: 'Draw two cards.' }))).toBe(null);
  });

  it('flags an excluded mana cost, mana value, stat, layout and rarity', () => {
    expect(kindOf({ kind: 'mana', value: '{4}{R}', negated: true }, card({ mana_cost: '{4}{R}' }))).toBe('excluded');
    expect(kindOf({ kind: 'mana', value: '{4}{R}', negated: true }, card({ mana_cost: '{2}{R}' }))).toBe(null);
    expect(kindOf({ kind: 'manaValue', value: '5', negated: true }, card({ cmc: 5 }))).toBe('excluded');
    expect(kindOf({ kind: 'power', value: '3', negated: true }, card({ power: '3' }))).toBe('excluded');
    expect(kindOf({ kind: 'loyalty', value: '4', negated: true }, card({ loyalty: '4' }))).toBe('excluded');
    expect(kindOf({ kind: 'layout', value: 'transform', negated: true }, card({ layout: 'transform' }))).toBe('excluded');
    expect(kindOf({ kind: 'rarity', value: 'mythic', negated: true }, card({ rarity: 'mythic' }))).toBe('excluded');
  });

  it('coerces variable stats like the comparison and hint operators do', () => {
    // `pow!=2` excludes a card whose power Scryfall coerces to 2 (`2+*`).
    expect(kindOf({ kind: 'power', value: '2', negated: true }, card({ power: '2+*' }))).toBe('excluded');
    expect(kindOf({ kind: 'power', value: '2', negated: true }, card({ power: '3' }))).toBe(null);
  });

  it('flags a release date on the wrong side of a directional bound', () => {
    expect(kindOf({ kind: 'released', value: '2020-01-01', dir: '>' }, card({ released_at: '2019-07-12' }))).toBe('excluded');
    expect(kindOf({ kind: 'released', value: '2020-01-01', dir: '>' }, card({ released_at: '2021-01-01' }))).toBe(null);
    expect(kindOf({ kind: 'released', value: '2020-01-01', dir: '<' }, card({ released_at: '2021-01-01' }))).toBe('excluded');
    expect(kindOf({ kind: 'released', value: '2020-01-01', dir: '<' }, card({ released_at: '2019-01-01' }))).toBe(null);
  });
});

describe('findGuessConflicts — missing (guess lacks a known target value)', () => {
  it('flags a guess that lacks a property the target was shown to have', () => {
    expect(kindOf({ kind: 'type', value: 'Creature' }, card({ type_line: 'Instant' }))).toBe('missing');
    expect(kindOf({ kind: 'type', value: 'Creature' }, card({ type_line: 'Creature — Elf' }))).toBe(null);
    expect(kindOf({ kind: 'color', value: 'R' }, card({ colors: ['U'] }))).toBe('missing');
    expect(kindOf({ kind: 'keyword', value: 'flying' }, card({ oracle_text: 'Vigilance', keywords: ['Vigilance'] }))).toBe('missing');
    expect(kindOf({ kind: 'mana', value: '{2}{R}' }, card({ mana_cost: '{4}{R}' }))).toBe('missing');
    expect(kindOf({ kind: 'manaValue', value: '3' }, card({ cmc: 2 }))).toBe('missing');
    expect(kindOf({ kind: 'power', value: '3' }, card({ power: '2' }))).toBe('missing');
    expect(kindOf({ kind: 'rarity', value: 'rare' }, card({ rarity: 'common' }))).toBe('missing');
  });

  it('flags a guess that is not from a known exact release date', () => {
    expect(kindOf({ kind: 'released', value: '2020-01-01' }, card({ released_at: '2019-07-12' }))).toBe('missing');
    expect(kindOf({ kind: 'released', value: '2020-01-01' }, card({ released_at: '2020-01-01' }))).toBe(null);
  });

  it('never flags a "missing" oracle clause: positive oracle hints are not a checklist', () => {
    // A positive oracle hint (a whole rules clause the target has) must not make
    // every differently-worded guess a mistake.
    expect(kindOf({ kind: 'oracle', value: 'Flying' }, card({ oracle_text: 'Vigilance' }))).toBe(null);
    // ...but guessing a clause the target was shown NOT to have still counts.
    expect(kindOf({ kind: 'oracle', value: 'Flying', negated: true }, card({ oracle_text: 'Flying' }))).toBe('excluded');
  });
});

describe('findGuessConflicts — shape and edge cases', () => {
  it('returns the offending row', () => {
    const [conflict] = findGuessConflicts(card({ type_line: 'Instant' }), [
      { kind: 'type', value: 'Creature' },
    ]);
    expect(conflict).toMatchObject({ kind: 'missing', row: 'type' });
  });

  it('maps every hint kind to its comparison row', () => {
    expect(rowForHint({ kind: 'manaValue' })).toBe('mana');
    expect(rowForHint({ kind: 'toughness' })).toBe('pt');
    expect(rowForHint({ kind: 'oracle' })).toBe('oracle');
    expect(rowForHint({ kind: 'nonsense' })).toBe(null);
  });

  it('deduplicates identical conflicts', () => {
    const c = card({ type_line: 'Instant' });
    const conflicts = findGuessConflicts(c, [
      { kind: 'type', value: 'Creature' },
      { kind: 'type', value: 'Creature' },
    ]);
    expect(conflicts).toHaveLength(1);
  });

  it('ignores hints it has no operator for', () => {
    expect(kindOf({ kind: 'defense', value: '3' }, card({ defense: '3' }))).toBe(null);
  });
});

describe('analyzeGuesses / countMistakes', () => {
  const target = card({ name: 'Target', oracle_id: 't', type_line: 'Creature — Elf', power: '2', toughness: '2' });
  const entry = (c) => ({ card: c, results: compareCards(c, target) });

  // A reveals the target is a Creature (positive) but not a Goblin (negative).
  const A = entry(card({ name: 'A', oracle_id: 'a', type_line: 'Creature — Goblin' }));
  // B is an Instant: it lacks the known "Creature" property → a mistake.
  const B = entry(card({ name: 'B', oracle_id: 'b', type_line: 'Instant' }));
  // C is a Goblin, which A already ruled out → a mistake.
  const C = entry(card({ name: 'C', oracle_id: 'c', type_line: 'Creature — Goblin' }));

  it('never flags the first guess (nothing is known yet)', () => {
    expect(analyzeGuesses([A])[0]).toEqual([]);
  });

  it('flags a later guess that lacks a property an earlier guess established', () => {
    const conflicts = analyzeGuesses([A, B])[1];
    expect(conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'missing', row: 'type' })]),
    );
  });

  it('flags a later guess that carries a value an earlier guess ruled out', () => {
    const conflicts = analyzeGuesses([A, C])[1];
    expect(conflicts).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'excluded', row: 'type' })]),
    );
  });

  it('counts one mistake per offending guess, not per contradicting clue', () => {
    expect(countMistakes([A])).toBe(0);
    expect(countMistakes([A, B])).toBe(1);
    expect(countMistakes([A, B, C])).toBe(2);
  });

  it('never flags the winning guess (it satisfies every earlier clue)', () => {
    const win = entry(target);
    expect(analyzeGuesses([A, win], target)[1]).toEqual([]);
    expect(countMistakes([A, win], target)).toBe(0);
  });

  it('exempts a guess of the target even when a clue is subtly skewed', () => {
    // The win is a shared oracle_id, so a correct guess must never count as a
    // mistake even if a clue drifted from the card object it was distilled from.
    const skewed = entry(target);
    expect(analyzeGuesses([A, skewed], { oracle_id: 't' })[1]).toEqual([]);
  });
});

describe('analyzeGuesses with the pre-revealed clue (baseHints)', () => {
  const target = card({ name: 'Target', oracle_id: 't', type_line: 'Creature — Kithkin Soldier' });
  const entry = (c) => ({ card: c, results: compareCards(c, target) });
  // The day's clue: the target's type line includes the Kithkin subtype.
  const reveal = [{ kind: 'type', value: 'Kithkin', negated: false }];

  const kithkin = entry(card({ name: 'Kin', oracle_id: 'k', type_line: 'Creature — Kithkin' }));
  const elf = entry(card({ name: 'Elf', oracle_id: 'e', type_line: 'Creature — Elf' }));
  const instant = entry(card({ name: 'Inst', oracle_id: 'i', type_line: 'Instant' }));

  it('flags a FIRST guess that lacks the revealed word (guess 0 is no longer exempt)', () => {
    // Without the clue nothing is known yet, so guess 0 can never conflict.
    expect(analyzeGuesses([elf])[0]).toEqual([]);
    // With it, the same first guess contradicts a fact the player was told.
    expect(analyzeGuesses([elf], null, reveal)[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'missing', row: 'type' })]),
    );
  });

  it('does not flag a first guess that carries the revealed word', () => {
    expect(analyzeGuesses([kithkin], null, reveal)[0]).toEqual([]);
  });

  it('flags a first guess that has no subtype at all, since it lacks the word', () => {
    // An Instant carries no subtypes, so it cannot contain the revealed
    // Kithkin — the same "missing" rule that applies to any known target value.
    expect(analyzeGuesses([instant], null, reveal)[0]).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'missing', row: 'type' })]),
    );
  });

  it('counts the contradicted clue as a mistake', () => {
    expect(countMistakes([elf], null, reveal)).toBe(1);
    expect(countMistakes([kithkin], null, reveal)).toBe(0);
  });

  it('still exempts the winning guess, which satisfies the revealed clue', () => {
    expect(analyzeGuesses([elf, entry(target)], target, reveal)[1]).toEqual([]);
    expect(countMistakes([elf, entry(target)], target, reveal)).toBe(1);
  });

  it('keeps the earlier-clue rules working alongside the reveal', () => {
    // `elf` breaks the clue; a later Goblin breaks the clue too (still one
    // mistake each), so the two mistakes compose.
    const goblin = entry(card({ name: 'Gob', oracle_id: 'g', type_line: 'Creature — Goblin' }));
    expect(countMistakes([elf, goblin], null, reveal)).toBe(2);
  });

  it('treats missing base hints as no prior clues', () => {
    expect(countMistakes([elf])).toBe(0);
    expect(analyzeGuesses([elf])[0]).toEqual([]);
  });
});
