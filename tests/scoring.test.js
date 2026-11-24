import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MATCH_LEVELS,
  SHARE_BLOCKS,
  buildShareText,
  emojiBar,
  levelDescription,
  levelForScore,
  levelLabel,
  scoreGuess,
} from '../src/lib/game/scoring.js';

/** A real-shaped card so the metric's property weights are exercised. */
const target = {
  name: 'Goblin Guide',
  oracle_id: 'goblin-guide',
  mana_cost: '{R}',
  cmc: 1,
  colors: ['R'],
  type_line: 'Creature — Goblin Scout',
  power: '2',
  toughness: '2',
  oracle_text:
    'Haste\nWhenever this creature attacks, defending player reveals the top card of their library.',
  keywords: ['Haste'],
  rarity: 'rare',
  released_at: '2009-10-02',
  layout: 'normal',
};

/** Same properties, different card: every property matches, but it is not the answer. */
const lookalike = { ...target, name: 'Goblin Scout', oracle_id: 'goblin-scout' };

const near = {
  ...target,
  name: 'Goblin Piledriver',
  oracle_id: 'goblin-piledriver',
  mana_cost: '{1}{R}',
  cmc: 2,
  power: '1',
  toughness: '2',
  oracle_text:
    'Protection from blue\nWhenever this creature attacks, it gets +2/+0 for each other attacking Goblin.',
  keywords: ['Protection'],
  released_at: '2002-10-07',
};

const related = {
  ...target,
  name: 'Goblin Arsonist',
  oracle_id: 'goblin-arsonist',
  type_line: 'Creature — Goblin Shaman',
  power: '1',
  toughness: '1',
  oracle_text: 'When this creature dies, it deals 1 damage to any target.',
  keywords: [],
  released_at: '2011-07-15',
};

const sameTypeOnly = {
  ...target,
  name: 'Elf',
  oracle_id: 'elf',
  type_line: 'Creature — Elf',
  mana_cost: '{2}{R}',
  cmc: 3,
  power: '1',
  toughness: '1',
  oracle_text: 'Trample',
  keywords: ['Trample'],
  rarity: 'common',
  released_at: '2019-01-01',
};

const colorsOnly = {
  ...target,
  name: 'Red sorcery',
  oracle_id: 'red-sorcery',
  type_line: 'Sorcery',
  mana_cost: '{3}{R}',
  cmc: 4,
  oracle_text: 'Deal 3 damage to any target.',
  keywords: [],
  rarity: 'common',
  released_at: '2020-01-01',
};

const unrelated = {
  name: 'Wrath of God',
  oracle_id: 'wrath-of-god',
  mana_cost: '{2}{W}{W}',
  cmc: 4,
  colors: ['W'],
  type_line: 'Sorcery',
  oracle_text: "Destroy all creatures. They can't be regenerated.",
  rarity: 'rare',
  released_at: '1996-06-01',
  layout: 'normal',
};

describe('levelForScore', () => {
  it('maps the calibrated thresholds to six levels', () => {
    expect(levelForScore(1)).toBe(5);
    expect(levelForScore(0.8)).toBe(5);
    expect(levelForScore(0.799)).toBe(4);
    expect(levelForScore(0.6)).toBe(4);
    expect(levelForScore(0.599)).toBe(3);
    expect(levelForScore(0.45)).toBe(3);
    expect(levelForScore(0.449)).toBe(2);
    expect(levelForScore(0.3)).toBe(2);
    expect(levelForScore(0.299)).toBe(1);
    expect(levelForScore(0)).toBe(1);
    expect(levelForScore(Number.NaN)).toBe(1);
  });

  it('labels the six levels as a heat meter from Cold to Matched', () => {
    expect(Array.from({ length: MATCH_LEVELS }, (_, i) => levelLabel(i + 1))).toEqual([
      'Cold',
      'Cool',
      'Warm',
      'Hot',
      'Blazing',
      'Matched',
    ]);
    expect(levelLabel(0)).toBe('No match');
    expect(Array.from({ length: MATCH_LEVELS }, (_, i) => levelDescription(i + 1))).toEqual([
      'Almost nothing in common',
      'A little in common',
      'Some similarity',
      'Strong similarity',
      'Very strong similarity',
      'You found the target',
    ]);
  });
});

describe('scoreGuess', () => {
  it('treats the actual target as level 6', () => {
    expect(scoreGuess(target, target)).toEqual({ ratio: 1, level: 6 });
  });

  it('matches by oracle id, so another printing of the answer is still level 6', () => {
    expect(scoreGuess({ ...target, name: 'Goblin Guide (reprint)' }, target).level).toBe(6);
  });

  it('caps a different card at level 5 even when every property matches', () => {
    const score = scoreGuess(lookalike, target);
    expect(score.ratio).toBeCloseTo(1);
    expect(score.level).toBe(5);
  });

  it('spreads close, related and distant cards across the lower levels', () => {
    expect(scoreGuess(near, target).level).toBe(4);
    expect(scoreGuess(related, target).level).toBe(4);
    expect(scoreGuess(sameTypeOnly, target).level).toBe(3);
    expect(scoreGuess(colorsOnly, target).level).toBe(2);
    expect(scoreGuess(unrelated, target).level).toBe(1);
  });

  it('gives partial credit for a colour superset and more for exact colours', () => {
    const superset = scoreGuess({ ...target, name: 'a', oracle_id: 'a', colors: ['R', 'U'] }, target);
    const wrong = scoreGuess({ ...target, name: 'b', oracle_id: 'b', colors: ['U'] }, target);
    expect(superset.ratio).toBeGreaterThan(wrong.ratio);
    expect(superset.ratio).toBeLessThan(scoreGuess(lookalike, target).ratio);
  });

  it('rewards closer mana values, costs and stats', () => {
    const close = { ...target, name: 'a', oracle_id: 'a', power: '3', toughness: '3', cmc: 2 };
    const far = { ...target, name: 'b', oracle_id: 'b', power: '8', toughness: '8', cmc: 7 };
    expect(scoreGuess(close, target).ratio).toBeGreaterThan(scoreGuess(far, target).ratio);
  });

  it('rewards shared oracle text and keywords', () => {
    const similarText = {
      ...target,
      name: 'a',
      oracle_id: 'a',
      oracle_text:
        'Haste\nWhenever this creature attacks, defending player reveals the top card of their library.',
    };
    const otherText = {
      ...target,
      name: 'b',
      oracle_id: 'b',
      oracle_text: 'Flying',
      keywords: ['Flying'],
    };
    expect(scoreGuess(similarText, target).ratio).toBeGreaterThan(
      scoreGuess(otherText, target).ratio,
    );
  });

  it('scores oracle text over the displayed clause tokens with Sørensen–Dice', () => {
    const wrath = {
      name: 'a',
      oracle_id: 'a',
      oracle_text: "Destroy all creatures. They can't be regenerated.",
    };
    const day = { name: 'b', oracle_id: 'b', oracle_text: 'Destroy all creatures.' };
    expect(scoreGuess(wrath, day).ratio).toBeCloseTo(2 / 3);

    const bolt = {
      name: 'c',
      oracle_id: 'c',
      oracle_text: 'Lightning Bolt deals 3 damage to any target.',
    };
    const shock = {
      name: 'd',
      oracle_id: 'd',
      oracle_text: 'Shock deals 2 damage to any target.',
    };
    expect(scoreGuess(bolt, shock).ratio).toBe(0);
  });

  it('uses Sørensen–Dice for type, colors and keywords', () => {
    const typeGuess = { name: 'a', oracle_id: 'a', type_line: 'Creature — Goblin Scout' };
    const typeTarget = { name: 'b', oracle_id: 'b', type_line: 'Creature — Elf' };
    expect(scoreGuess(typeGuess, typeTarget).ratio).toBeCloseTo(0.4);

    const colorGuess = { name: 'c', oracle_id: 'c', colors: ['R'] };
    const colorTarget = { name: 'd', oracle_id: 'd', colors: ['R', 'U'] };
    expect(scoreGuess(colorGuess, colorTarget).ratio).toBeCloseTo(2 / 3);

    const keywordGuess = {
      name: 'e',
      oracle_id: 'e',
      oracle_text: 'Flying',
      keywords: ['Flying'],
    };
    const keywordTarget = {
      name: 'f',
      oracle_id: 'f',
      oracle_text: 'Flying, haste',
      keywords: ['Flying', 'Haste'],
    };
    expect(scoreGuess(keywordGuess, keywordTarget).ratio).toBeCloseTo(2 / 3);
  });

  it('compares mana costs as a symbol multiset', () => {
    const single = { name: 'a', oracle_id: 'a', mana_cost: '{U}' };
    const double = { name: 'b', oracle_id: 'b', mana_cost: '{U}{U}' };
    expect(scoreGuess(single, double).ratio).toBeCloseTo(2 / 3);
  });

  it('does not treat absent properties as a perfect match', () => {
    expect(scoreGuess({}, {}).ratio).toBe(0);
    expect(scoreGuess({}, {}).level).toBe(1);
  });

  it('ignores a property absent from both cards', () => {
    const keywordlessTarget = { ...target, keywords: [] };
    const missing = { ...keywordlessTarget, name: 'a', oracle_id: 'a' };
    const nonMatching = {
      ...keywordlessTarget,
      name: 'b',
      oracle_id: 'b',
      keywords: ['Haste'],
    };
    // The keyword weight is skipped only when neither card has a keyword; a
    // guess that adds a keyword the target lacks is still a mismatch.
    expect(scoreGuess(missing, keywordlessTarget).ratio).toBeGreaterThan(
      scoreGuess(nonMatching, keywordlessTarget).ratio,
    );
  });

  it('keeps a property weight when the target has it and the guess does not', () => {
    const keywordTarget = { ...target, keywords: ['Haste'] };
    const missing = { ...keywordTarget, name: 'a', oracle_id: 'a', keywords: [] };
    const matching = { ...keywordTarget, name: 'b', oracle_id: 'b' };
    expect(scoreGuess(matching, keywordTarget).ratio).toBeGreaterThan(
      scoreGuess(missing, keywordTarget).ratio,
    );
  });

  it('treats a property present on only one card as a mismatch', () => {
    const withoutCost = {
      ...target,
      name: 'a',
      oracle_id: 'a',
      mana_cost: undefined,
      card_faces: undefined,
    };
    const withCost = { ...target, name: 'b', oracle_id: 'b' };
    const missing = scoreGuess(withoutCost, target);
    expect(missing.ratio).toBeLessThan(1);
    expect(missing.ratio).toBeLessThan(scoreGuess(withCost, target).ratio);
  });
});

describe('emojiBar', () => {
  const UNKNOWN = '\u2B1B'; // ⬛
  const EMPTY = '\u2B1C'; // ⬜

  it('fills one block per level', () => {
    expect(emojiBar(1)).toBe(UNKNOWN + EMPTY.repeat(SHARE_BLOCKS - 1));
    expect(emojiBar(4)).toBe(UNKNOWN.repeat(4) + EMPTY.repeat(SHARE_BLOCKS - 4));
    expect(emojiBar(6)).toBe(UNKNOWN.repeat(SHARE_BLOCKS));
  });

  it('clamps out-of-range levels', () => {
    expect(emojiBar(99)).toBe(UNKNOWN.repeat(SHARE_BLOCKS));
    expect(emojiBar(-1)).toBe(EMPTY.repeat(SHARE_BLOCKS));
    expect(emojiBar(undefined)).toBe(EMPTY.repeat(SHARE_BLOCKS));
  });

  it('draws the filled blocks in the still-matching count color', () => {
    expect(emojiBar(6, SHARE_BLOCKS, 1)).toBe('\u{0001F7E6}'.repeat(SHARE_BLOCKS)); // blue
    expect(emojiBar(6, SHARE_BLOCKS, 60)).toBe('\u{0001F7E8}'.repeat(SHARE_BLOCKS)); // yellow
    expect(emojiBar(6, SHARE_BLOCKS, 30000)).toBe('\u{0001F7E5}'.repeat(SHARE_BLOCKS)); // red
    // A real zero-count is blue too, with the unfilled tail staying white.
    expect(emojiBar(3, SHARE_BLOCKS, 0)).toBe(
      '\u{0001F7E6}'.repeat(3) + EMPTY.repeat(SHARE_BLOCKS - 3),
    );
  });
});

describe('buildShareText', () => {
  const CORRECT = '\u2705';
  const ERROR = '\u26A0\uFE0F';
  const BALL = '\u{1F52E}';
  const UNKNOWN = '\u2B1B';
  const EMPTY = '\u2B1C';
  const rowsFor = (cards, extra = {}) =>
    buildShareText({
      dayKey: 'd',
      url: 'u',
      targetCard: target,
      guesses: cards.map((card) => ({ card })),
      ...extra,
    }).split('\n');

  it('defaults to markdown: the header links to the app and no bare URL is appended', () => {
    const rows = buildShareText({
      dayKey: '2026-08-26',
      guesses: [{ card: lookalike }],
      url: 'https://example.com/',
      targetCard: target,
    }).split('\n');
    expect(rows[0]).toBe('[Match the Gatherer 2026-08-26](https://example.com/)');
    expect(rows).toHaveLength(2); // header + 1 bar, no trailing URL
    expect(rows[rows.length - 1]).not.toBe('https://example.com/');
  });

  it('plain text keeps the header plain and appends the bare URL', () => {
    const rows = buildShareText({
      dayKey: '2026-08-26',
      guesses: [{ card: lookalike }],
      url: 'https://example.com/',
      targetCard: target,
      format: 'plaintext',
    }).split('\n');
    expect(rows[0]).toBe('Match the Gatherer 2026-08-26');
    expect(rows).toHaveLength(3); // header + 1 bar + url
    expect(rows[rows.length - 1]).toBe('https://example.com/');
  });

  it('falls back to a plain header when no URL is known', () => {
    const rows = buildShareText({ dayKey: 'd', guesses: [{ card: lookalike }], url: '', targetCard: target }).split('\n');
    expect(rows[0]).toBe('Match the Gatherer d');
  });

  it('draws the bar from the match level, one block per level', () => {
    const rows = rowsFor([target, lookalike, colorsOnly]);
    expect(rows[1]).toBe(UNKNOWN.repeat(6) + CORRECT);
    expect(rows[2]).toBe(UNKNOWN.repeat(5) + EMPTY + CORRECT);
    expect(rows[3]).toBe(UNKNOWN.repeat(2) + EMPTY.repeat(4) + CORRECT);
  });

  it('marks every row correct when no clue was contradicted', () => {
    const rows = rowsFor([target, lookalike]);
    expect(rows[1].endsWith(CORRECT)).toBe(true);
    expect(rows[2].endsWith(CORRECT)).toBe(true);
  });

  it('marks a guess that contradicts an earlier clue as an error', () => {
    const g0 = {
      card: { name: 'a', oracle_id: 'a', type_line: 'Instant' },
      results: [{ key: 'type', status: 'correct', correct: ['Instant'], wrong: [] }],
    };
    const g1 = { card: { name: 'b', oracle_id: 'b', type_line: 'Sorcery' } };
    const rows = buildShareText({
      dayKey: 'd',
      guesses: [g0, g1],
      url: 'u',
      targetCard: { name: 't', oracle_id: 't', type_line: 'Instant' },
    }).split('\n');
    expect(rows[1].endsWith(CORRECT)).toBe(true);
    expect(rows[2].endsWith(ERROR)).toBe(true);
  });

  it('places the correctness marker before the hint scrying ball', () => {
    const rows = rowsFor([target, lookalike, target], { hintsUsed: [0, 2] });
    expect(rows[1]).toBe(UNKNOWN.repeat(6) + CORRECT + BALL);
    expect(rows[2]).toBe(UNKNOWN.repeat(5) + EMPTY + CORRECT);
    expect(rows[3]).toBe(UNKNOWN.repeat(6) + CORRECT + BALL);
  });

  it('colors each bar by its still-matching count', () => {
    const rows = rowsFor([target, lookalike], { hintCounts: { 0: 1226, 1: 60 } });
    expect(rows[1]).toBe('\u{0001F7E5}'.repeat(SHARE_BLOCKS) + CORRECT); // 1226 → red
    expect(rows[2]).toBe(
      '\u{0001F7E8}'.repeat(5) + EMPTY + CORRECT, // 60 → yellow, 5/6 match
    );
  });

  it('uses a dark fill when the count never resolved, and blue for a real 0', () => {
    const rows = rowsFor([target, lookalike], { hintCounts: { 0: 0 } });
    expect(rows[1]).toBe('\u{0001F7E6}'.repeat(SHARE_BLOCKS) + CORRECT); // 0 → blue
    expect(rows[2]).toBe(UNKNOWN.repeat(5) + EMPTY + CORRECT); // unresolved → dark
  });
});

describe('buildShareText with the pre-revealed clue', () => {
  const CORRECT = '\u2705';
  const ERROR = '\u26A0\uFE0F';
  const reveal = [{ kind: 'type', value: 'Kithkin', negated: false }];
  // A first guess that lacks the revealed subtype is a mistake from the start.
  const guesses = [{ card: { name: 'a', oracle_id: 'a', type_line: 'Creature — Elf' } }];

  it('marks a first guess contradicting the revealed clue as an error', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      url: 'u',
      targetCard: { name: 't', oracle_id: 't', type_line: 'Creature — Kithkin' },
      baseHints: reveal,
    }).split('\n');
    expect(rows[1].endsWith(ERROR)).toBe(true);
  });

  it('keeps the board and the share text in agreement without the clue', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      url: 'u',
      targetCard: { name: 't', oracle_id: 't', type_line: 'Creature — Kithkin' },
    }).split('\n');
    expect(rows[1].endsWith(CORRECT)).toBe(true);
  });

  // The pure function was right from the start; the bug was GameBoard not
  // forwarding the prop, which left the summary silently on the `[]` default
  // and marking a contradicting guess ✅ while the board showed ⚠️.
  it('is wired from GameBoard to ShareSummary', () => {
    const board = readFileSync(new URL('../src/lib/components/GameBoard.svelte', import.meta.url), 'utf8');
    const summary = board.slice(board.indexOf('<ShareSummary'));
    expect(summary.slice(0, summary.indexOf('/>'))).toContain('{baseHints}');

    const component = readFileSync(
      new URL('../src/lib/components/ShareSummary.svelte', import.meta.url),
      'utf8',
    );
    expect(component).toContain('export let baseHints');
    // …and forwarded into the share text, not just declared.
    const call = component.slice(component.indexOf('buildShareText({'));
    expect(call.slice(0, call.indexOf('})'))).toContain('baseHints');
  });
});
