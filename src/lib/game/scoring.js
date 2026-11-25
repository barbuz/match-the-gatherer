/** Match-level calculation and share-text rendering (spec §11). */

import {
  NO_MANA_COST,
  colorTokens,
  keywordTokens,
  manaCostTokens,
  oracleTokens,
  parseTypeLine,
  scalarTokens,
  statValue,
} from './comparison.js';
import { countColor } from './countColors.js';
import { analyzeGuesses } from './consistency.js';

/** Match levels: 1 (barely related) … 6 (the target itself). */
export const MATCH_LEVELS = 6;

/** One share block per match level, so a bar row *is* the level it scored. */
export const SHARE_BLOCKS = MATCH_LEVELS;

/** Row markers: no clue contradicted / contradicted an earlier clue. */
const CORRECT_MARK = '\u2705';
const ERROR_MARK = '\u26A0\uFE0F';
const HINT_MARK = '\u{1F52E}';

// Colored squares for each count band (blue, green, yellow, orange, red).
// The **filled** blocks of a share row are drawn in that row's band color, so
// the bar itself encodes how many cards still matched after that guess. An
// unknown count uses a dark square, keeping the fill count readable against
// the white empty blocks.
const FILLED_SQUARES = {
  '#2f6bff': '🟦',
  '#1f9d55': '🟩',
  '#d4b106': '🟨',
  '#e07b1a': '🟧',
  '#d64545': '🟥',
};
const UNKNOWN_SQUARE = '⬛';
const EMPTY_SQUARE = '⬜';

const LEVEL_LABELS = [
  'No match',
  'Cold',
  'Cool',
  'Warm',
  'Hot',
  'Blazing',
  'Matched',
];

const LEVEL_DESCRIPTIONS = [
  'No comparison available',
  'Almost nothing in common',
  'A little in common',
  'Some similarity',
  'Strong similarity',
  'Very strong similarity',
  'You found the target',
];

/** Human-readable name for a match level (shown in the meter). */
export function levelLabel(level) {
  return LEVEL_LABELS[level] ?? LEVEL_LABELS[0];
}

/** One-line explanation for the meter's tooltip. */
export function levelDescription(level) {
  return LEVEL_DESCRIPTIONS[level] ?? LEVEL_DESCRIPTIONS[0];
}

// How much each property contributes to the aggregate. Type carries the most
// identity; stats and release date narrow it next; colors, mana value, keywords
// and oracle text follow; mana cost, rarity and layout are light signals.
const WEIGHTS = {
  type: 3,
  colors: 1.5,
  manaValue: 1.5,
  manaCost: 1,
  stats: 2,
  keywords: 1.5,
  oracle: 1.5,
  rarity: 0.5,
  released: 2,
  layout: 0.5,
};

function facesOf(card) {
  const faces = card?.card_faces;
  if (Array.isArray(faces) && faces.length > 0) return faces;
  return card ? [card] : [];
}

const setOf = (values) => new Set(values ?? []);

/** Sørensen–Dice over two sets: 2|A∩B| / (|A|+|B|). */
function diceSet(a, b) {
  if (a.size === 0 && b.size === 0) return null;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function diceMultiset(a, b) {
  if (a.length === 0 && b.length === 0) return null;
  const counts = (values) => {
    const map = new Map();
    for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
    return map;
  };
  const left = counts(a);
  const right = counts(b);
  let shared = 0;
  for (const [value, n] of left) shared += Math.min(n, right.get(value) ?? 0);
  return (2 * shared) / (a.length + b.length);
}

function typeLineWords(card) {
  const words = new Set();
  for (const face of facesOf(card)) {
    const parsed = parseTypeLine(face.type_line ?? '');
    for (const word of [...parsed.supertypes, ...parsed.types, ...parsed.subtypes]) {
      words.add(word.toLowerCase());
    }
  }
  return words;
}

function typeScore(guess, target) {
  return diceSet(typeLineWords(guess), typeLineWords(target));
}

function hasColorField(card) {
  return card?.colors != null || facesOf(card).some((face) => face.colors != null);
}

function colorScore(guess, target) {
  const guessHas = hasColorField(guess);
  const targetHas = hasColorField(target);
  if (!guessHas && !targetHas) return null;
  if (!guessHas || !targetHas) return 0;
  return diceSet(setOf(colorTokens(guess)), setOf(colorTokens(target)));
}

/** Closeness on a numeric axis: 1 at equal, roughly halving every 2 points. */
function numberCloseness(a, b) {
  return 0.5 ** (Math.abs(Number(a) - Number(b)) / 2);
}

function manaValueScore(guess, target) {
  const guessHas = guess?.cmc != null;
  const targetHas = target?.cmc != null;
  if (!guessHas && !targetHas) return null;
  if (!guessHas || !targetHas) return 0;
  return numberCloseness(guess.cmc, target.cmc);
}

function hasManaCostField(card) {
  return card?.mana_cost != null || facesOf(card).some((face) => face.mana_cost != null);
}

function manaSymbols(card) {
  const symbols = [];
  for (const cost of manaCostTokens(card)) {
    if (cost === NO_MANA_COST) {
      symbols.push(NO_MANA_COST);
      continue;
    }
    for (const match of cost.matchAll(/\{[^{}]+\}/g)) symbols.push(match[0].toUpperCase());
  }
  return symbols;
}

function manaCostScore(guess, target) {
  const guessHas = hasManaCostField(guess);
  const targetHas = hasManaCostField(target);
  if (!guessHas && !targetHas) return null;
  if (!guessHas || !targetHas) return 0;
  return diceMultiset(manaSymbols(guess), manaSymbols(target));
}

function statValues(card, key) {
  return scalarTokens(card, key)
    .map(statValue)
    .filter((value) => value != null);
}

/** Best closeness for each guess value against the target's face values. */
function statAxisScore(guessValues, targetValues) {
  if (guessValues.length === 0 && targetValues.length === 0) return null;
  if (guessValues.length === 0 || targetValues.length === 0) return 0;
  let total = 0;
  for (const g of guessValues) {
    let best = 0;
    for (const t of targetValues) best = Math.max(best, numberCloseness(g, t));
    total += best;
  }
  return total / guessValues.length;
}

function statsScore(guess, target) {
  const axes = [
    statAxisScore(statValues(guess, 'power'), statValues(target, 'power')),
    statAxisScore(statValues(guess, 'toughness'), statValues(target, 'toughness')),
    statAxisScore(statValues(guess, 'loyalty'), statValues(target, 'loyalty')),
    statAxisScore(statValues(guess, 'defense'), statValues(target, 'defense')),
  ].filter((score) => score != null);
  if (axes.length === 0) return null;
  return axes.reduce((sum, score) => sum + score, 0) / axes.length;
}

function oracleScore(guess, target) {
  return diceSet(setOf(oracleTokens(guess)), setOf(oracleTokens(target)));
}

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 2, bonus: 2 };

function rarityScore(guess, target) {
  const a = RARITY_RANK[String(guess?.rarity ?? '').trim().toLowerCase()];
  const b = RARITY_RANK[String(target?.rarity ?? '').trim().toLowerCase()];
  if (a == null && b == null) return null;
  if (a == null || b == null) return 0;
  return 1 - Math.abs(a - b) / 3;
}

function releasedScore(guess, target) {
  const a = Date.parse(guess?.released_at ?? '');
  const b = Date.parse(target?.released_at ?? '');
  const guessHas = !Number.isNaN(a);
  const targetHas = !Number.isNaN(b);
  if (!guessHas && !targetHas) return null;
  if (!guessHas || !targetHas) return 0;
  // Eight-year half-life: the same era is a clue, decades apart is not.
  return 0.5 ** (Math.abs(a - b) / (86_400_000 * 365.25 * 8));
}

function layoutScore(guess, target) {
  const guessHas = guess?.layout != null;
  const targetHas = target?.layout != null;
  if (!guessHas && !targetHas) return null;
  if (!guessHas || !targetHas) return 0;
  return guess.layout === target.layout ? 1 : 0;
}

/** True only for the actual answer (same oracle id / name), never a lookalike. */
function isTarget(guess, target) {
  if (!guess || !target) return false;
  if (guess.oracle_id && target.oracle_id) return guess.oracle_id === target.oracle_id;
  return Boolean(guess.name && target.name && guess.name === target.name);
}

/**
 * Continuous score → discrete level. The thresholds were calibrated against
 * real cards: unrelated pairs land at 1, "same colors and card type" at 2–3,
 * close creatures at 4, near-reprints at 5, and the answer itself at 6.
 */
export function levelForScore(ratio) {
  if (ratio >= 0.8) return 5;
  if (ratio >= 0.6) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.3) return 2;
  return 1;
}

/**
 * Score one guess against the target: a weighted mean of per-property
 * similarities. Unlike the old per-property token Dice, every property is
 * measured on its own scale — the whole type line, colors and keywords by
 * Sørensen–Dice set overlap, numeric values (mana value, P/T, loyalty, date) by
 * distance, mana costs by Sørensen–Dice over the symbol multiset (a light
 * tiebreaker), and oracle text by Sørensen–Dice over the displayed rules clauses
 * (the same clause tokens the Oracle row renders).
 * A property is compared when either card has it: a guess missing a property the
 * target has contributes 0 while its weight stays in the denominator. If both
 * cards lack the property, the property is skipped entirely.
 *
 * Returns `{ ratio, level }`; the UI shows the level, but the continuous ratio
 * is useful for tests and future tuning.
 */
export function scoreGuess(guess, target) {
  const g = guess ?? {};
  const t = target ?? {};
  const parts = {
    type: typeScore(g, t),
    colors: colorScore(g, t),
    manaValue: manaValueScore(g, t),
    manaCost: manaCostScore(g, t),
    stats: statsScore(g, t),
    keywords: diceSet(setOf(keywordTokens(g)), setOf(keywordTokens(t))),
    oracle: oracleScore(g, t),
    rarity: rarityScore(g, t),
    released: releasedScore(g, t),
    layout: layoutScore(g, t),
  };
  let sum = 0;
  let total = 0;
  for (const [key, value] of Object.entries(parts)) {
    if (value == null) continue;
    sum += value * WEIGHTS[key];
    total += WEIGHTS[key];
  }
  const ratio = total === 0 ? 0 : sum / total;
  return { ratio, level: isTarget(g, t) ? MATCH_LEVELS : levelForScore(ratio) };
}

/**
 * Horizontal emoji bar, one filled block per match level and drawn in the band
 * color of `count` (the still-matching count for that row); without a count the
 * filled blocks are dark and the empty tail white, so the level stays readable.
 */
export function emojiBar(level, blocks = SHARE_BLOCKS, count = undefined) {
  const fill =
    count == null ? UNKNOWN_SQUARE : FILLED_SQUARES[countColor(count)] ?? UNKNOWN_SQUARE;
  const value = Number.isFinite(level) ? level : 0;
  const filled = Math.max(0, Math.min(blocks, Math.round((value / MATCH_LEVELS) * blocks)));
  return fill.repeat(filled) + EMPTY_SQUARE.repeat(blocks - filled);
}

/**
 * Share block as data: the day header (plus the app URL) and one emoji-bar row
 * per guess. `buildShareText` flattens it for the clipboard; `ShareSummary`
 * renders the header as a real link and the rows as centered lines.
 *
 * `targetCard` is needed to score each guess. Each row's filled blocks encode
 * that guess's match level (1–6) and are drawn in the guess's Scryfall
 * match-count color (from `hintCounts`) — the same color scheme as the on-screen
 * summary — or dark when the count never resolved. Every row ends with a
 * correctness marker: ⚠️ when the guess contradicted an earlier clue (a mistake,
 * see consistency.js) and ✅ otherwise, followed by the 🔮 marker when a hint was
 * used for that row. The warning sign matches the yellow accent that flags the
 * offending row on the guess's feedback card, so the share marker points back at
 * what the board highlighted.
 */
export function shareSummary({
  dayKey,
  guesses,
  url,
  hintsUsed = [],
  targetCard,
  hintCounts = {},
  baseHints = [],
}) {
  const levels = guesses.map((g) => scoreGuess(g.card, targetCard).level);
  // `baseHints` (the pre-revealed clue, see reveal.js) keeps the row markers in
  // step with the board: without it a first guess that contradicts the revealed
  // word would read ✅ here and ⚠️ on screen.
  const conflicts = analyzeGuesses(guesses, targetCard, baseHints);
  const used = new Set(hintsUsed ?? []);
  return {
    title: `Match the Gatherer ${dayKey}`,
    url: url ?? '',
    rows: guesses.map((g, i) => {
      const marker = conflicts[i]?.length ? ERROR_MARK : CORRECT_MARK;
      const hint = used.has(i) ? HINT_MARK : '';
      return `${emojiBar(levels[i], SHARE_BLOCKS, hintCounts?.[i])}${marker}${hint}`;
    }),
  };
}

/** Copy-pasteable form of a `shareSummary` result: header, then one emoji-bar
 * row per guess. The header links the app as markdown unless `includeLink` is
 * off, in which case it is the bare title. */
export function formatShareText({ title, url, rows }, { includeLink = true } = {}) {
  const header = includeLink && url ? `[${title}](${url})` : title;
  return [header, ...rows].join('\n');
}

export function buildShareText({ includeLink = true, ...args }) {
  return formatShareText(shareSummary(args), { includeLink });
}
