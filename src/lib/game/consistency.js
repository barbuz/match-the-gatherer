/**
 * Consistency checking (spec §3 feedback, §11 summary).
 *
 * A guess "goes against" an earlier clue when it is inconsistent with a fact
 * the previous guesses already established about the target. Every clue is
 * distilled from the guess feedback by `gatherHints()`, so this module reuses
 * exactly the same semantics the Hint button's Scryfall search does:
 *
 * - **excluded** — a hint says the target does *not* have a value (a negated
 *   type/color/keyword/oracle token, an exact mana cost / mana value / stat it
 *   isn't, or a release-date bound it falls on the wrong side of) and the guess
 *   carries that value anyway;
 * - **missing** — a hint says the target *does* have a value (a matched type,
 *   color, keyword, oracle token, mana cost/value, stat, layout, rarity or an
 *   exact release date) and the guess lacks it.
 *
 * Both are derived only from feedback already shown to the player, so flagging
 * them never reveals anything new. The module is DOM-free and unit-testable,
 * and the per-guess result is recomputed from the persisted guesses, so it
 * needs no storage schema change.
 */

import {
  typeTokens,
  colorTokens,
  keywordTokens,
  searchableOracleText,
  manaCostTokens,
  normalizeManaCost,
  scalarTokens,
  statValue,
  NO_MANA_COST,
} from './comparison.js';
import { gatherHints } from './hints.js';

/**
 * Kinds a guess can be flagged for *lacking* a known target value. Oracle text
 * is deliberately excluded: a positive oracle hint is a whole rules clause, so
 * treating the target's prose as a checklist would flag almost every guess that
 * isn't the answer (and punish a differently-worded but equivalent clause).
 * Oracle still contributes *excluded* conflicts — guessing a clause the target
 * has been shown not to contain is a genuine contradiction.
 */
const MISSING_KINDS = new Set([
  'type',
  'color',
  'keyword',
  'mana',
  'manaValue',
  'power',
  'toughness',
  'loyalty',
  'layout',
  'rarity',
  'released',
]);

/** Row key each hint kind belongs to, so the UI can highlight the offending row. */
const ROW_OF_KIND = {
  type: 'type',
  color: 'colors',
  keyword: 'keywords',
  oracle: 'oracle',
  mana: 'mana',
  manaValue: 'mana',
  power: 'pt',
  toughness: 'pt',
  loyalty: 'loyalty',
  layout: 'layout',
  rarity: 'rarity',
  released: 'released',
};

/** The comparison row a hint belongs to, or null for an unmapped kind. */
export function rowForHint(hint) {
  return ROW_OF_KIND[hint?.kind] ?? null;
}

const lower = (v) => String(v ?? '').toLocaleLowerCase();

function cardHasType(card, value) {
  const v = lower(value);
  return typeTokens(card).some((t) => lower(t) === v);
}

function cardHasColor(card, value) {
  const v = lower(value);
  return colorTokens(card).some((c) => lower(c) === v);
}

function cardHasKeyword(card, value) {
  return keywordTokens(card).includes(lower(value));
}

function cardHasOracleToken(card, value) {
  return searchableOracleText(card).includes(lower(value));
}

function cardHasManaCost(card, value) {
  const v = normalizeManaCost(value);
  return manaCostTokens(card).some((c) => c !== NO_MANA_COST && normalizeManaCost(c) === v);
}

function cardHasManaValue(card, value) {
  return card?.cmc != null && String(card.cmc) === String(value);
}

function cardHasStat(card, key, value) {
  const v = statValue(value);
  if (v == null) return false;
  return scalarTokens(card, key).some((s) => statValue(s) === v);
}

function cardHasLayout(card, value) {
  return lower(card?.layout ?? 'normal') === lower(value);
}

function cardHasRarity(card, value) {
  return String(card?.rarity ?? '').trim().toLocaleLowerCase() === lower(value);
}

/**
 * Classify one hint against a guess card: `'excluded'` when the guess carries a
 * value the target lacks, `'missing'` when the guess lacks a value the target
 * has, or `null` when the guess is consistent with the hint. Date bounds are
 * the one asymmetry — a directional bound can only be violated (excluded),
 * never "missing", because the exact date is unknown.
 */
function conflictKindFor(card, hint) {
  const { kind, value, negated = false, dir } = hint;
  const check = (has) => {
    if (negated) return has ? 'excluded' : null;
    return has || !MISSING_KINDS.has(kind) ? null : 'missing';
  };
  switch (kind) {
    case 'type':
      return check(cardHasType(card, value));
    case 'color':
      return check(cardHasColor(card, value));
    case 'keyword':
      return check(cardHasKeyword(card, value));
    case 'oracle':
      return check(cardHasOracleToken(card, value));
    case 'mana':
      return check(cardHasManaCost(card, value));
    case 'manaValue':
      return check(cardHasManaValue(card, value));
    case 'power':
      return check(cardHasStat(card, 'power', value));
    case 'toughness':
      return check(cardHasStat(card, 'toughness', value));
    case 'loyalty':
      return check(cardHasStat(card, 'loyalty', value));
    case 'layout':
      return check(cardHasLayout(card, value));
    case 'rarity':
      return check(cardHasRarity(card, value));
    case 'released': {
      const date = card?.released_at;
      if (date == null) return null;
      if (dir === '>') return date <= value ? 'excluded' : null; // target is newer
      if (dir === '<') return date >= value ? 'excluded' : null; // target is older
      return date === value ? null : 'missing'; // exact release date known
    }
    default:
      return null;
  }
}

/**
 * Every prior hint a guess contradicts. The conflict carries only the row it
 * should accent; the guess's own row already shows the value, so no wording is
 * needed.
 *
 * @param {object} card  the guessed Scryfall card
 * @param {Array<{ kind, value, negated?, dir? }>} hints  gatherHints() of earlier guesses
 * @returns {Array<{ kind: 'excluded'|'missing', row: string|null, hint: object }>}
 */
export function findGuessConflicts(card, hints) {
  const conflicts = [];
  const seen = new Set();
  for (const hint of hints ?? []) {
    const kind = conflictKindFor(card, hint);
    if (!kind) continue;
    const row = rowForHint(hint);
    const key = `${kind}|${row}|${lower(hint.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    conflicts.push({ kind, row, hint });
  }
  return conflicts;
}

const isDisplayedValue = (seg) => seg?.status === 'correct' || seg?.status === 'wrong';

/** Does one displayed segment carry the exact value the hint rules out? */
function segmentCarriesHint(seg, hint) {
  if (!isDisplayedValue(seg)) return false;
  const { text } = seg;
  if (text == null) return false;
  const value = hint.value;
  switch (hint.kind) {
    case 'keyword':
      // `kw:` hints carry the canonical (lowercased) name; the segment keeps
      // the printed span and the canonical name separately.
      return lower(seg.name ?? text) === lower(value);
    case 'type':
    case 'color':
    case 'oracle':
    case 'layout':
    case 'rarity':
      return lower(text) === lower(value);
    case 'mana':
      if (text === NO_MANA_COST || value === NO_MANA_COST) return text === value;
      return normalizeManaCost(text) === normalizeManaCost(value);
    case 'power':
    case 'toughness':
    case 'loyalty': {
      const v = statValue(text);
      return v != null && v === statValue(value);
    }
    case 'released':
      // The row shows exactly the guess's release date, which is the value on
      // the wrong side of the bound (the hint carries the bound, not the date).
      return true;
    default:
      return false;
  }
}

/**
 * Locate the displayed tokens that made a guess contradict an earlier clue, so
 * the feedback can mark those tokens (not just the whole row).
 *
 * Returns an object keyed by row: `{ segments: Set, mv: Set }`, where the
 * indices address that row's `segments` / `mvValues`. Only `excluded` conflicts
 * carry a value on the guess; a `missing` conflict means the guess lacks the
 * value by definition, so it contributes no token (the row accent covers it).
 *
 * @param {Array<{ key, segments, mvValues? }>} results  compareCards() output
 * @param {Array<{ kind, row, hint }>} conflicts  findGuessConflicts() output
 */
export function conflictTokens(results, conflicts) {
  const out = {};
  const bucket = (row) => {
    if (!out[row]) out[row] = { segments: new Set(), mv: new Set() };
    return out[row];
  };
  for (const conflict of conflicts ?? []) {
    if (conflict.kind !== 'excluded') continue;
    const { row, hint } = conflict;
    if (!row) continue;
    const result = (results ?? []).find((r) => r.key === row);
    if (!result) continue;
    const entry = bucket(row);
    if (hint.kind === 'manaValue') {
      (result.mvValues ?? []).forEach((mv, i) => {
        if (mv.text != null && String(mv.text) === String(hint.value)) entry.mv.add(i);
      });
      continue;
    }
    (result.segments ?? []).forEach((seg, i) => {
      if (segmentCarriesHint(seg, hint)) entry.segments.add(i);
    });
  }
  return out;
}

/**
 * Conflicts for every guess, keyed by guess index. Guess *i* is checked against
 * the hints distilled from guesses `0..i-1` only, so the first guess can never
 * conflict (nothing is known yet) and a guess is never judged against itself.
 *
 * A guess of the target card itself is always conflict-free: guessing the card
 * is a win (the win condition is a shared `oracle_id`), and a correct guess
 * satisfies every clue by definition, so it must never be counted as a mistake
 * — even if a clue ever drifted from the card object (e.g. a Scryfall data
 * revision between the answer being served and the guess being resolved).
 *
 * `baseHints` are facts known before the first guess — today's pre-revealed
 * clue (`reveal.js`). They seed *every* guess, including guess 0, which can
 * otherwise never conflict: once the player has been told the card is a Kithkin,
 * a first guess that is not one contradicts a known clue and is a mistake.
 *
 * @param {Array<{ card: object, results: Array }>} guesses
 * @param {object} [targetCard]  the target card, to exempt a correct guess
 * @param {Array<{ kind, value, negated?, dir? }>} [baseHints]  pre-known clues
 * @returns {Array<Array>} one conflict list per guess, in guess order
 */
export function analyzeGuesses(guesses, targetCard = null, baseHints = []) {
  const list = guesses ?? [];
  const targetId = targetCard?.oracle_id ?? null;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const card = list[i]?.card;
    if (!card || (targetId != null && card.oracle_id === targetId)) {
      out.push([]);
      continue;
    }
    const priorHints = gatherHints(i === 0 ? [] : list.slice(0, i), baseHints);
    out.push(findGuessConflicts(card, priorHints));
  }
  return out;
}

/**
 * How many guesses contradicted at least one earlier clue — the "M mistakes" of
 * "solved in N guesses with M mistakes" (a guess contradicting several clues is
 * still a single wasted guess). A correct guess never counts (see
 * {@link analyzeGuesses}).
 */
export function countMistakes(guesses, targetCard = null, baseHints = []) {
  return analyzeGuesses(guesses, targetCard, baseHints).filter((c) => c.length > 0).length;
}
