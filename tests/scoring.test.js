import { describe, it, expect } from 'vitest';
import { scoreGuess, emojiBar, buildShareText, SHARE_BLOCKS } from '../src/lib/game/scoring.js';

/** Minimal cards so a guess's ratio is a clean fraction of a few properties. */
const target = { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' };
const same = { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' };

describe('scoreGuess', () => {
  it('scores an identical guess as a perfect match', () => {
    expect(scoreGuess(same, target).ratio).toBeCloseTo(1);
  });

  it('averages per-property token overlap: no shared mana/colors, matching type', () => {
    const guess = { mana_cost: '{U}', colors: ['U'], type_line: 'Instant' };
    // mana 0/1, colors 0/1, type 1/1 → mean 1/3.
    expect(scoreGuess(guess, target).ratio).toBeCloseTo(1 / 3);
  });

  it('gives partial credit per property by shared-token fraction', () => {
    const guess = { mana_cost: '{R}{U}', colors: ['R', 'U'], type_line: 'Instant Sorcery' };
    // mana: no shared whole cost → 0; colors: 1 shared over 3 → 2/3;
    // type: 1 shared over 3 → 2/3. Mean = 4/9.
    expect(scoreGuess(guess, target).ratio).toBeCloseTo(4 / 9);
  });

  it('counts a property that only the target has against the guess', () => {
    const creature = { ...target, type_line: 'Creature — Goblin', power: '2', toughness: '2' };
    const instant = { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' };
    // mana + colors match (2), type and P/T score 0 → mean 2/4.
    expect(scoreGuess(instant, creature).ratio).toBeCloseTo(0.5);
  });

  it('collapses repeated line tokens so duplicates cannot inflate a property', () => {
    const a = { ...target, oracle_text: 'Flying' };
    const b = { ...target, oracle_text: 'Flying\nFlying' };
    expect(scoreGuess(a, b).ratio).toBeCloseTo(1);
  });

  it('scores oracle text at token granularity: distinct lines share no token', () => {
    const a = { ...target, oracle_text: 'Flying' };
    const b = { ...target, oracle_text: 'Vigilance' };
    // mana + colors + type match (3); oracle is the only mismatched property
    // (whole-line tokens 'Flying' vs 'Vigilance') → mean 3/4.
    expect(scoreGuess(a, b).ratio).toBeCloseTo(3 / 4);
  });

  it('gives oracle partial credit for a shared token', () => {
    const a = { ...target, oracle_text: 'Flying\nVigilance' };
    const b = { ...target, oracle_text: 'Flying\nTrample' };
    // oracle: 1 shared token over 4 → 0.5; mana/colors/type match → (1+1+1+0.5)/4.
    expect(scoreGuess(a, b).ratio).toBeCloseTo((1 + 1 + 1 + 0.5) / 4);
  });

  it('scores oracle text per clause, so a shared clause earns credit', () => {
    const a = { ...target, oracle_text: 'Flying. Vigilance.' };
    const b = { ...target, oracle_text: 'Flying. Trample.' };
    // Two clause tokens each; the shared `Flying.` is 1 over 4 → 0.5.
    expect(scoreGuess(a, b).ratio).toBeCloseTo((1 + 1 + 1 + 0.5) / 4);
  });

  it('handles an empty property set without dividing by zero', () => {
    expect(scoreGuess({}, {}).ratio).toBeGreaterThanOrEqual(0);
  });
});

describe('emojiBar', () => {
  it('renders full, empty and fractional bars gray without a count', () => {
    expect(emojiBar(1)).toBe('⬜'.repeat(SHARE_BLOCKS));
    expect(emojiBar(0)).toBe('\u2B1C'.repeat(SHARE_BLOCKS));
    expect(emojiBar(0.5)).toBe('⬜'.repeat(SHARE_BLOCKS / 2) + '⬜'.repeat(SHARE_BLOCKS / 2));
  });

  it('clamps out-of-range ratios', () => {
    expect(emojiBar(2)).toBe('⬜'.repeat(SHARE_BLOCKS));
    expect(emojiBar(-1)).toBe('\u2B1C'.repeat(SHARE_BLOCKS));
  });

  it('draws the filled blocks in the still-matching count color', () => {
    expect(emojiBar(1, SHARE_BLOCKS, 1)).toBe('\u{0001F7E6}'.repeat(SHARE_BLOCKS)); // blue
    expect(emojiBar(1, SHARE_BLOCKS, 60)).toBe('\u{0001F7E8}'.repeat(SHARE_BLOCKS)); // yellow
    expect(emojiBar(1, SHARE_BLOCKS, 30000)).toBe('\u{0001F7E5}'.repeat(SHARE_BLOCKS)); // red
    // A zero-count row is blue too, with the unfilled tail staying gray.
    expect(emojiBar(0.5, SHARE_BLOCKS, 0)).toBe(
      '\u{0001F7E6}'.repeat(SHARE_BLOCKS / 2) + '\u2B1C'.repeat(SHARE_BLOCKS / 2),
    );
  });
});

describe('buildShareText', () => {
  const guesses = [
    { card: { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' } }, // 100%
    { card: { mana_cost: '{U}', colors: ['U'], type_line: 'Instant' } }, // 33%
  ];
  const CORRECT = '\u2705';
  const ERROR = '\u26A0\uFE0F';
  const BALL = '\u{1F52E}';

  it('defaults to markdown: the header links to the app and no bare URL is appended', () => {
    const rows = buildShareText({ dayKey: '2026-08-26', guesses, url: 'https://example.com/', targetCard: target }).split('\n');
    expect(rows[0]).toBe('[Match the Gatherer 2026-08-26](https://example.com/)');
    expect(rows).toHaveLength(3); // header + 2 bars, no trailing URL
    expect(rows[rows.length - 1]).not.toBe('https://example.com/');
  });

  it('plain text keeps the header plain and appends the bare URL', () => {
    const rows = buildShareText({
      dayKey: '2026-08-26',
      guesses,
      url: 'https://example.com/',
      targetCard: target,
      format: 'plaintext',
    }).split('\n');
    expect(rows[0]).toBe('Match the Gatherer 2026-08-26');
    expect(rows).toHaveLength(4); // header + 2 bars + url
    expect(rows[rows.length - 1]).toBe('https://example.com/');
  });

  it('falls back to a plain header when no URL is known', () => {
    const rows = buildShareText({ dayKey: 'd', guesses, url: '', targetCard: target }).split('\n');
    expect(rows[0]).toBe('Match the Gatherer d');
  });

  it('marks every row correct when no clue was contradicted', () => {
    const rows = buildShareText({ dayKey: 'd', guesses, url: 'u', targetCard: target }).split('\n');
    expect(rows[1]).toBe('⬜'.repeat(SHARE_BLOCKS) + CORRECT);
    expect(rows[2]).toBe('⬜'.repeat(3) + '⬜'.repeat(SHARE_BLOCKS - 3) + CORRECT);
  });

  it('marks a guess that contradicts an earlier clue as an error', () => {
    const g0 = {
      card: { type_line: 'Instant' },
      results: [{ key: 'type', status: 'correct', correct: ['Instant'], wrong: [] }],
    };
    const g1 = { card: { type_line: 'Sorcery' } };
    const rows = buildShareText({ dayKey: 'd', guesses: [g0, g1], url: 'u', targetCard: target }).split('\n');
    expect(rows[1].endsWith(CORRECT)).toBe(true);
    expect(rows[2].endsWith(ERROR)).toBe(true);
  });

  it('places the correctness marker before the hint scrying ball', () => {
    const text = buildShareText({
      dayKey: 'd',
      guesses: [
        { card: { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' } },
        { card: { mana_cost: '{U}', colors: ['U'], type_line: 'Instant' } },
        { card: { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' } },
      ],
      url: 'u',
      hintsUsed: [0, 2],
      targetCard: target,
    });
    const rows = text.split('\n');
    expect(rows[1]).toBe('⬜'.repeat(SHARE_BLOCKS) + CORRECT + BALL);
    expect(rows[2]).toBe('⬜'.repeat(3) + '⬜'.repeat(SHARE_BLOCKS - 3) + CORRECT);
    expect(rows[3]).toBe('⬜'.repeat(SHARE_BLOCKS) + CORRECT + BALL);
  });

  it('colors each bar by its still-matching count', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      url: 'u',
      targetCard: target,
      hintCounts: { 0: 1226, 1: 60 },
    }).split('\n');
    expect(rows[1]).toBe('\u{0001F7E5}'.repeat(SHARE_BLOCKS) + CORRECT); // 1226 → red fill
    // Second guess scores 30%, so the fill count follows emojiBar's rounding.
    const filled = Math.round(0.3 * SHARE_BLOCKS);
    expect(rows[2]).toBe(
      '\u{0001F7E8}'.repeat(filled) + '\u2B1C'.repeat(SHARE_BLOCKS - filled) + CORRECT, // 60 → yellow
    );
  });

  it('falls back to green for a count that never resolved, and blue for a real 0', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      url: 'u',
      targetCard: target,
      hintCounts: { 0: 0 }, // 1 is unresolved
    }).split('\n');
    expect(rows[1]).toBe('\u{0001F7E6}'.repeat(SHARE_BLOCKS) + CORRECT); // 0 → blue fill
    expect(rows[2]).toBe('⬜'.repeat(3) + '⬜'.repeat(SHARE_BLOCKS - 3) + CORRECT); // unresolved → green
  });
});

describe('buildShareText with the pre-revealed clue', () => {
  const CORRECT = '\u2705';
  const ERROR = '\u26A0\uFE0F';
  const reveal = [{ kind: 'type', value: 'Kithkin', negated: false }];
  // A first guess that lacks the revealed subtype is a mistake from the start.
  const guesses = [{ card: { type_line: 'Creature — Elf' } }];

  it('marks a first guess contradicting the revealed clue as an error', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      url: 'u',
      targetCard: { type_line: 'Creature — Kithkin' },
      baseHints: reveal,
    }).split('\n');
    expect(rows[1].endsWith(ERROR)).toBe(true);
  });

  it('keeps the board and the share text in agreement without the clue', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      url: 'u',
      targetCard: { type_line: 'Creature — Kithkin' },
    }).split('\n');
    expect(rows[1].endsWith(CORRECT)).toBe(true);
  });
});
