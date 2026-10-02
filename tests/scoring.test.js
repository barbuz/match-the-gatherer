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
  it('renders full, empty and fractional bars', () => {
    expect(emojiBar(1)).toBe('🟩'.repeat(SHARE_BLOCKS));
    expect(emojiBar(0)).toBe('⬜'.repeat(SHARE_BLOCKS));
    expect(emojiBar(0.5)).toBe('🟩'.repeat(5) + '⬜'.repeat(5));
  });

  it('clamps out-of-range ratios', () => {
    expect(emojiBar(2)).toBe('🟩'.repeat(SHARE_BLOCKS));
    expect(emojiBar(-1)).toBe('⬜'.repeat(SHARE_BLOCKS));
  });
});

describe('buildShareText', () => {
  const guesses = [
    { card: { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' } }, // 100%
    { card: { mana_cost: '{U}', colors: ['U'], type_line: 'Instant' } }, // 33%
  ];

  it('shows "Matched in N" on a win and the best "% matched" on a loss, ending with the URL', () => {
    const win = buildShareText({ dayKey: '2026-08-26', guesses, won: true, url: 'https://example.com/', targetCard: target });
    const rows = win.split('\n');
    expect(rows[0]).toBe('Match the Gatherer 2026-08-26 — Matched in 2');
    expect(rows).toHaveLength(4); // header + 2 bars + url
    expect(rows[rows.length - 1]).toBe('https://example.com/');

    const loss = buildShareText({ dayKey: '2026-08-26', guesses, won: false, url: 'https://example.com/', targetCard: target });
    expect(loss.split('\n')[0]).toBe('Match the Gatherer 2026-08-26 — 100% matched');
  });

  it('renders one bar row per guess with proportional fill', () => {
    const rows = buildShareText({ dayKey: 'd', guesses, won: true, maxGuesses: 10, url: 'u', targetCard: target }).split('\n');
    expect(rows[1]).toBe('🟩'.repeat(10) + ' ???');
    expect(rows[2]).toBe('🟩'.repeat(3) + '⬜'.repeat(7) + ' ???');
  });

  it('appends a scrying-ball marker to rows where a hint was used', () => {
    const text = buildShareText({
      dayKey: 'd',
      guesses: [
        { card: { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' } },
        { card: { mana_cost: '{U}', colors: ['U'], type_line: 'Instant' } },
        { card: { mana_cost: '{R}', colors: ['R'], type_line: 'Instant' } },
      ],
      won: true,
      maxGuesses: 10,
      url: 'u',
      hintsUsed: [0, 2],
      targetCard: target,
    });
    const rows = text.split('\n');
    expect(rows[1]).toBe('🟩'.repeat(10) + '🔮 ???');
    expect(rows[2]).toBe('🟩'.repeat(3) + '⬜'.repeat(7) + ' ???');
    expect(rows[3]).toBe('🟩'.repeat(10) + '🔮 ???');
  });

  it('tags each row with its per-guess match count', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      won: true,
      url: 'u',
      targetCard: target,
      hintCounts: { 0: 1226, 1: 60 },
    }).split('\n');
    expect(rows[1]).toBe('🟩'.repeat(10) + ' 1226');
    expect(rows[2]).toBe('🟩'.repeat(3) + '⬜'.repeat(7) + ' 60');
  });

  it('shows "???" for a count that never resolved (including 0 as a real count)', () => {
    const rows = buildShareText({
      dayKey: 'd',
      guesses,
      won: true,
      url: 'u',
      targetCard: target,
      hintCounts: { 0: 0 }, // 1 is unresolved
    }).split('\n');
    expect(rows[1]).toBe('🟩'.repeat(10) + ' 0');
    expect(rows[2]).toBe('🟩'.repeat(3) + '⬜'.repeat(7) + ' ???');
  });
});