/**
 * Per-property comparison rules (spec §3).
 *
 * compareCards(guess, target) returns an array of result lines:
 *   { key, label, status, correct, wrong, applicable, note? }
 * - status: 'correct' | 'partial' | 'wrong'
 * - correct: guessed values that match the target (shown highlighted)
 * - wrong: guessed values that don't match the target (shown marked wrong)
 * - empty properties on both cards report a '—' marker as correct
 * - applicable: whether the property exists on the GUESSED card, so the
 *   share-score denominator never leaks information about the target (§11)
 */

const SUPERTYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Ongoing']);

const DUAL_FACED_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'double_faced_token',
  'reversible_card',
  'prepare',
]);

export function parseTypeLine(typeLine = '') {
  const dash = typeLine.indexOf('—');
  const left = (dash === -1 ? typeLine : typeLine.slice(0, dash)).trim();
  const right = dash === -1 ? '' : typeLine.slice(dash + 1).trim();
  const leftTokens = left.split(/\s+/).filter(Boolean);
  return {
    supertypes: leftTokens.filter((t) => SUPERTYPES.has(t)),
    types: leftTokens.filter((t) => !SUPERTYPES.has(t)),
    subtypes: right ? right.split(/\s+/).filter(Boolean) : [],
  };
}

export function isDualFaced(card) {
  return (
    DUAL_FACED_LAYOUTS.has(card?.layout) &&
    Array.isArray(card?.card_faces) &&
    card.card_faces.length > 1
  );
}

/** Normalized view of one face of a card (falls back to card-level fields). */
function faceView(card, face) {
  const { supertypes, types, subtypes } = parseTypeLine(face.type_line ?? card.type_line ?? '');
  return {
    name: face.name ?? card.name ?? '',
    manaCost: face.mana_cost ?? '',
    colors: face.colors ?? card.colors ?? [],
    supertypes,
    types,
    subtypes,
    power: face.power ?? card.power,
    toughness: face.toughness ?? card.toughness,
    loyalty: face.loyalty ?? card.loyalty,
    defense: face.defense ?? card.defense,
  };
}

export function getFaces(card) {
  if (isDualFaced(card)) return card.card_faces.map((f) => faceView(card, f));
  return [faceView(card, card)];
}

export function normalizeManaCost(cost = '') {
  return cost.replace(/[{}]/g, '').replace(/\s+/g, '').toUpperCase();
}

function line(key, label, status, correct, wrong, applicable, note) {
  return { key, label, status, correct, wrong, applicable, ...(note ? { note } : {}) };
}

function setLine(key, label, guessVals, targetVals) {
  // Both empty: the placeholder '—' renders as a correct (green) value.
  if (guessVals.length === 0 && targetVals.length === 0) {
    return line(key, label, 'correct', ['—'], [], true);
  }
  const targetSet = new Set(targetVals);
  const correct = guessVals.filter((v) => targetSet.has(v));
  const wrong = guessVals.filter((v) => !targetSet.has(v));
  let status;
  if (wrong.length === 0 && guessVals.length === targetVals.length) status = 'correct';
  else if (correct.length > 0) status = 'partial';
  else status = 'wrong';
  return line(key, label, status, correct, wrong, true);
}

function manaLine(key, label, guessFace, targetFace, guessCmc, targetCmc) {
  const g = normalizeManaCost(guessFace.manaCost);
  const t = normalizeManaCost(targetFace.manaCost);
  const shown = guessFace.manaCost || '(no mana cost)';
  if (g === t) return line(key, label, 'correct', [shown], [], true);
  if (guessCmc != null && targetCmc != null && guessCmc === targetCmc) {
    return line(key, label, 'partial', [], [shown], true, `mana value ${guessCmc} matches`);
  }
  return line(key, label, 'wrong', [], [shown], true);
}

function scalarLine(key, label, guessVal, targetVal) {
  if (guessVal == null) return null; // property absent on the guess: don't reveal the target has it
  const shown = String(guessVal);
  if (targetVal != null && String(targetVal) === shown) return line(key, label, 'correct', [shown], [], true);
  return line(key, label, 'wrong', [], [shown], true);
}

function compareFace(results, keyPrefix, labelPrefix, guessFace, targetFace, guessCmc, targetCmc) {
  results.push(manaLine(`${keyPrefix}mana`, `${labelPrefix}Mana cost`, guessFace, targetFace, guessCmc, targetCmc));
  results.push(setLine(`${keyPrefix}colors`, `${labelPrefix}Colors`, guessFace.colors, targetFace.colors));
  results.push(setLine(`${keyPrefix}supertypes`, `${labelPrefix}Supertypes`, guessFace.supertypes, targetFace.supertypes));
  results.push(setLine(`${keyPrefix}types`, `${labelPrefix}Types`, guessFace.types, targetFace.types));
  results.push(setLine(`${keyPrefix}subtypes`, `${labelPrefix}Subtypes`, guessFace.subtypes, targetFace.subtypes));
  for (const [key, label, g, t] of [
    ['power', 'Power', guessFace.power, targetFace.power],
    ['toughness', 'Toughness', guessFace.toughness, targetFace.toughness],
    ['loyalty', 'Loyalty', guessFace.loyalty, targetFace.loyalty],
    ['defense', 'Defense', guessFace.defense, targetFace.defense],
  ]) {
    const l = scalarLine(`${keyPrefix}${key}`, `${labelPrefix}${label}`, g, t);
    if (l) results.push(l);
  }
}

/**
 * Compare a guessed card against the target card.
 * @param {object} guess  Scryfall card object
 * @param {object} target Scryfall card object
 */
export function compareCards(guess, target) {
  const results = [];
  const gFaces = getFaces(guess);
  const tFaces = getFaces(target);
  const gDual = gFaces.length > 1;
  const tDual = tFaces.length > 1;
  const anyDual = gDual || tDual;

  compareFace(
    results,
    anyDual ? 'front:' : '',
    anyDual ? 'Front face: ' : '',
    gFaces[0],
    tFaces[0],
    guess.cmc,
    target.cmc
  );

  results.push(
    gDual === tDual
      ? line('dualfaced', 'Dual-faced', 'correct', [gDual ? 'Yes' : 'No'], [], true)
      : line('dualfaced', 'Dual-faced', 'wrong', [], [gDual ? 'Yes' : 'No'], true)
  );

  if (gDual) {
    if (tDual) {
      // Back-face properties re-checked against the target's back face (§3)
      compareFace(results, 'back:', 'Back face: ', gFaces[1], tFaces[1], null, null);
    } else {
      compareFace(
        results,
        'back:',
        'Back face: ',
        gFaces[1],
        { manaCost: '', colors: [], supertypes: [], types: [], subtypes: [] },
        null,
        null
      );
    }
  }

  const sameDate = guess.released_at === target.released_at;
  results.push(
    line(
      'released',
      'First released',
      sameDate ? 'correct' : 'wrong',
      sameDate ? [guess.released_at] : [],
      sameDate ? [] : [guess.released_at],
      true,
      sameDate ? undefined : guess.released_at < target.released_at ? 'target is newer' : 'target is older'
    )
  );

  const gKw = guess.keywords ?? [];
  const tKw = target.keywords ?? [];
  const kwLine = setLine('keywords', 'Keywords', gKw, tKw);
  kwLine.applicable = gKw.length > 0;
  results.push(kwLine);

  return results;
}
