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

/** Normalized view of a card's primary face (falls back to card-level fields). */
function faceView(card) {
  const face = Array.isArray(card?.card_faces) && card.card_faces.length > 0 ? card.card_faces[0] : card;
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

export function normalizeManaCost(cost = '') {
  return cost.replace(/[{}]/g, '').replace(/\s+/g, '').toUpperCase();
}

function line(key, label, status, correct, wrong, applicable, note, noteBold, segments) {
  return {
    key,
    label,
    status,
    correct,
    wrong,
    applicable,
    ...(note ? { note } : {}),
    ...(noteBold ? { noteBold } : {}),
    ...(segments ? { segments } : {}),
  };
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

/**
 * Type line rendered like the card: "Supertypes Types — Subtypes".
 * Matching is still per-token against the target's combined type tokens,
 * but `segments` preserves the guess's order (supertypes + types before an
 * em-dash, subtypes after) so the UI can phrase it the way cards do.
 */
function typeLine(key, label, guessFace, targetFace) {
  const gMain = [...guessFace.supertypes, ...guessFace.types];
  const gSub = [...guessFace.subtypes];
  const tMain = [...targetFace.supertypes, ...targetFace.types];
  const tSub = [...targetFace.subtypes];
  if (gMain.length + gSub.length === 0 && tMain.length + tSub.length === 0) {
    return line(key, label, 'correct', ['—'], [], true);
  }
  const targetSet = new Set([...tMain, ...tSub]);
  const all = [...gMain, ...gSub];
  const correct = all.filter((v) => targetSet.has(v));
  const wrong = all.filter((v) => !targetSet.has(v));
  const status =
    wrong.length === 0 && all.length === tMain.length + tSub.length
      ? 'correct'
      : correct.length > 0
        ? 'partial'
        : 'wrong';
  const segments = [];
  for (const t of gMain) segments.push({ text: t, ok: targetSet.has(t) });
  if (gSub.length > 0) segments.push({ dash: true });
  for (const t of gSub) segments.push({ text: t, ok: targetSet.has(t) });
  return line(key, label, status, correct, wrong, true, undefined, undefined, segments);
}

function manaLine(key, label, guessFace, targetFace, guessCmc, targetCmc) {
  const g = normalizeManaCost(guessFace.manaCost);
  const t = normalizeManaCost(targetFace.manaCost);
  const shown = guessFace.manaCost || '(no mana cost)';
  const mv = guessCmc != null ? String(guessCmc) : null;
  const mvCorrect = mv != null && targetCmc != null && String(guessCmc) === String(targetCmc);
  const mvStatus = mv == null ? null : mvCorrect ? 'correct' : 'wrong';
  const mvValue = { text: mv, status: mvStatus };
  if (g === t) {
    return { key, label, status: 'correct', correct: [shown], wrong: [], applicable: true, mvValues: [mvValue] };
  }
  if (guessCmc != null && targetCmc != null && guessCmc === targetCmc) {
    return {
      key,
      label,
      status: 'partial',
      correct: [],
      wrong: [shown],
      applicable: true,
      mvValues: [mvValue],
    };
  }
  return { key, label, status: 'wrong', correct: [], wrong: [shown], applicable: true, mvValues: [mvValue] };
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
  results.push(typeLine(`${keyPrefix}type`, `${labelPrefix}Type`, guessFace, targetFace));
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

  compareFace(results, '', '', faceView(guess), faceView(target), guess.cmc, target.cmc);

  // Layout shown only when the guess is non-normal, never revealing a
  // normal target's layout.
  const gLayout = guess.layout ?? 'normal';
  if (gLayout !== 'normal') {
    results.push(
      gLayout === (target.layout ?? 'normal')
        ? line('layout', 'Layout', 'correct', [gLayout], [], true)
        : line('layout', 'Layout', 'wrong', [], [gLayout], true)
    );
  }

  const sameDate = guess.released_at === target.released_at;
  const direction = sameDate ? undefined : guess.released_at < target.released_at ? 'newer' : 'older';
  results.push(
    line(
      'released',
      'First released',
      sameDate ? 'correct' : 'wrong',
      sameDate ? [guess.released_at] : [],
      sameDate ? [] : [guess.released_at],
      true,
      direction ? `target is ${direction}` : undefined,
      direction
    )
  );

  const gKw = guess.keywords ?? [];
  const tKw = target.keywords ?? [];
  const kwLine = setLine('keywords', 'Keywords', gKw, tKw);
  kwLine.applicable = gKw.length > 0;
  results.push(kwLine);

  return results;
}
