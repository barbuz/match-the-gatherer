/**
 * Per-property comparison rules (spec §3).
 *
 * compareCards(guess, target) returns an array of result lines:
 *   { key, label, status, correct, wrong, applicable, note? }
 *
 * Comparison is token-based: every property's values are modeled as a
 * list of tokens, and a guessed token is correct when it appears anywhere
 * in the target's token list for that property. A row is fully correct when
 * every guessed token is present in the target's list, otherwise wrong..
 * Mana costs are one token per WHOLE cost (per face), compared via their
 * normalized forms — never symbol-by-symbol..
 *
 * For multi-faced cards, the target's token list is the union of every
 * face's values (plus the card-level field when relevant), mirroring how
 * Scryfall's search operators index any face. A creature with P/T 3/2
 * has power tokens [3]and toughness tokens [2];if its other face is
 * 4/5 the lists become [3,4]and [2,5]..
 *
 * Colorless cards carry an explicit 'colorless' token in their color list
 * and cards with no mana cost carry an explicit '(no mana cost)' token
 * so neither property can collapse to an empty list..
 *
 * - status: 'correct' | 'wrong'
 * - correct: guessed tokens that match the target (shown highlighted)
 * - wrong: guessed tokens that don't match the target (shown marked wrong)
 * - segments: ordered units for positioning-sensitive rows
 * - applicable: whetherthe property exists on the GUESSED card,so the
 *   share-score denominator never leaks information about the target (§11)
 * - absentOnTarget: guess has the property butthe target lacks it entirely
 *   (e.g. a creature guess against an instant)
 */

export const COLORLESS = 'colorless';
export const NO_MANA_COST = '(no mana cost)';

const SUPER_TYPES = new Set(['Basic', 'Legendary', 'Snow', 'World', 'Ongoing']);

export function parseTypeLine(typeLine = '') {
  const dash = typeLine.indexOf('—');
  let left;
  let right;
  if (dash === -1) {
    left = typeLine;
    right = '';
  } else {
    left = typeLine.slice(0, dash);
    right = typeLine.slice(dash + 1);
  }
  left = left.trim();
  right = right.trim();
  const leftTokens = left.split(/\s+/).filter(Boolean);
  return {
    supertypes: leftTokens.filter((t) => SUPER_TYPES.has(t)),
    types: leftTokens.filter((t) => !SUPER_TYPES.has(t)),
    subtypes: right ? right.split(/\s+/).filter(Boolean) : [],
  };
}

function facesOf(card) {
  const faces = card?.card_faces;
  if (Array.isArray(faces) && faces.length > 0) return faces;
  return [card];
}

function addUnique(out, vals) {
  if (!vals) return;
  for (const x of vals) {
    if (x != null && !out.includes(String(x))) out.push(String(x));
  }
}

function collect(card, picker) {
  const out = [];
  for (const f of facesOf(card)) addUnique(out, picker(f));
  addUnique(out, picker(card));
  return out;
}

function manaSymbols(cost = '') {
  const text = String(cost);
  const matches = [...text.matchAll(/\{[^{}]+\}/g)];
  return matches.map((m) => m[0]);
}

/** Normalized comparable form of a mana cost: braced symbols joined, braces/space/case stripped. */
export function normalizeManaCost(cost = '') {
  return String(cost ?? '').replace(/[{}]/g, '' ).replace(/\s+/g, '' ).toUpperCase();
}

function manaCostTokens(card) {
  const out = [];
  // Only face-level costs count. On split/fuse cards the card-level `mana_cost`
  // is the two halves CONCATENATED (`{1}{R} // {1}{U}}`), so adding it here
  // would invent a third whole-cost token that exists on no single face. On
  // single-faced cards `facesOf` falls back to `[card]`, so the face loop
  // already covers the card-level field. A token is ONE whole cost in its raw
  // braced form (`'{1}{R}'`), kept display-ready for hint `mana=` clauses..
  for (const f of facesOf(card)) {
    const syms = manaSymbols(f.mana_cost ?? '');
    addUnique(out, syms.length > 0 ? [syms.join('')] : [NO_MANA_COST]);
  }

  return out;
}

function colorTokens(card) {
  const colors = collect(card, (f) => f.colors ?? []);
  return colors.length > 0 ? colors : [COLORLESS];
}

function typeTokens(card) {
  const collectTypes = (f) => {
    const parsed = parseTypeLine(f.type_line ?? '');
    return [...parsed.supertypes, ...parsed.types, ...parsed.subtypes];
  };
  return collect(card, collectTypes);
}

function scalarTokens(card, key) {
  const pick = (f) => {
    const v = f[key];
    return v == null ? null : [String(v)];
  };
  return collect(card, pick);
}

/** Word or braced mana-symbol token ({G},{2}{W/U}}) — each brace pair is one
 * token — followed by words with internal apostrophes/hyphens kept. The gaps
 * between matches are punctuation/whitespace and render as-is with no status..
 */
const ORACLE_TOKEN = /\{[^\{\}]+\}|[\p{L}\p{N}]+(?:['\u2019\-][\p{L}\p{N}]+)*/gu;

export function oracleSegments(text = '') {
  const segments = [];
  let last = 0;
  for (const m of text.matchAll(ORACLE_TOKEN)) {
    if (m.index > last) segments.push({ text: text.slice(last,m.index) });
    segments.push({ text: m[0], token: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments;
}

function oracleTokens(card) {
  const out = [];
  for (const f of facesOf(card)) {
    for (const s of oracleSegments(f.oracle_text ?? '')) {
      if (s.token) out.push(s.text.toLocaleLowerCase());
    }
  }
  return out;
}

function line(key, label, status, correct, wrong, applicable, note, noteBold, segments) {
  return {
    key, label, status, correct, wrong, applicable,
    ...(note ? { note } : {}),
    ...(noteBold ? { noteBold } : {}),
    ...(segments ? { segments } : {}),
  };
}

function tokenRow(key, label, guessTokens, targetTokens) {
  if (guessTokens.length === 0 && targetTokens.length === 0) {
    return line(key, label, 'correct', ['—'], [], true);
  }
  const targetSet = new Set(targetTokens);
  const correct = guessTokens.filter((v) => targetSet.has(v));
  const wrong = guessTokens.filter((v) => !targetSet.has(v));
  const status = wrong.length === 0 ? 'correct' : 'wrong';
  return line(key, label, status, correct, wrong, true);
}

function typeLine(key, label, guessCard, targetCard) {
  const gTokens = typeTokens(guessCard);
  const tTokens = typeTokens(targetCard);
  if (gTokens.length === 0 && tTokens.length === 0) {
    return line(key, label, 'correct', ['—'], [], true);
  }
  const targetSet = new Set(tTokens);
  const correct = gTokens.filter((v) => targetSet.has(v));
  const wrong = gTokens.filter((v) => !targetSet.has(v));
  const status = wrong.length === 0 ? 'correct' : 'wrong';
  const segments = [];
  for (const f of facesOf(guessCard)) {
    const parsed = parseTypeLine(f.type_line ?? '');
    const main = [...parsed.supertypes, ...parsed.types];
    for (const t of main) segments.push({ text: t, status: targetSet.has(t) ? 'correct' : 'wrong' });
    if (parsed.subtypes.length >0) {
      segments.push({ dash: true });
      for (const t of parsed.subtypes) segments.push({ text: t, status: targetSet.has(t) ? 'correct' : 'wrong' });
    }
  }
  return line(key, label, status, correct, wrong, true, undefined, undefined, segments);
}

function manaLine(key, label, guessCard, targetCard) {
  const g = manaCostTokens(guessCard);
  const t = manaCostTokens(targetCard);
  // Whole costs are judged as units:the negation hint and the share text need
  // the whole cost string,, so each face's cost renders as one segment — `//`-
  // separated,, colored/struck as a whole by whether it appears in the target's
  // face-cost union `(not symbol by symbol)`. The raw braced strings stay in
  // `correct`/`wrong` for `mana=` hint clauses; matching runs on their
  // normalized forms (`normalizeManaCost`) — braces/whitespace/case are
  // stripped,, but symbol order is kept, so a whole cost matches only an
  // identical whole cost, never asubset or a reordering of its symbols..
  const compare = (v) => v === NO_MANA_COST ? v : normalizeManaCost(v);
  const targetSet = new Set(t.map(compare));
  const correct = g.filter((v) => targetSet.has(compare(v)));
  const wrong = g.filter((v) => !targetSet.has(compare(v)));
  const status = wrong.length === 0 ? 'correct' : 'wrong';
  const segments = [];
  const faces = facesOf(guessCard);
  for (let i = 0; i < faces.length; i++) {
    if (i > 0) segments.push({ sep: true, text: '//' });
    const cost = faces[i].mana_cost ?? '';
    if (manaSymbols(cost).length === 0) {
      segments.push({ text: NO_MANA_COST, status: targetSet.has(NO_MANA_COST) ? 'correct' : 'wrong' });
    } else {
      segments.push({ text: cost,token: true, status: targetSet.has(normalizeManaCost(cost)) ? 'correct' : 'wrong' });
    }
  }
  const mv = guessCard.cmc != null ? String(guessCard.cmc) : null;
  const mvStatus = mv == null ? null : String(targetCard.cmc) === mv ? 'correct' : 'wrong';
  const mvValue = { text: mv, status: mvStatus };
  return { key, label, status, correct, wrong, applicable: true, mvValues: [mvValue], segments };
}

function statsLine(key, label, guessCard, targetCard) {
  const gPower = scalarTokens(guessCard, 'power');
  const gTough = scalarTokens(guessCard, 'toughness');
  const tPower = new Set(scalarTokens(targetCard, 'power'));
  const tTough = new Set(scalarTokens(targetCard, 'toughness'));
  if (gPower.length + gTough.length === 0) return null;
  const segments = [];
  for (const v of gPower) segments.push({ text: v, status: tPower.has(v) ? 'correct' : 'wrong' });
  if (gPower.length > 0 && gTough.length > 0) segments.push({ slash: true });
  for (const v of gTough) segments.push({ text: v, status: tTough.has(v) ? 'correct' : 'wrong' });
  const values = segments.filter((s) => !s.slash);
  const status = values.every((s) => s.status === 'correct') ? 'correct' : 'wrong';
  const present = gPower.length + gTough.length;
  return {
    key, label, status,
    correct: [],
    wrong: [],
    applicable: true,
    segments,
    ...(present > 0 && tPower.size === 0 && tTough.size === 0 ? { absentOnTarget: true } : {}),
  };
}

function scalarRow(key, label, guessCard, targetCard, targetKey) {
  const g = scalarTokens(guessCard, key);
  if (g.length === 0) return null;
  const tSet = new Set(scalarTokens(targetCard, targetKey));
  const correct = g.filter((v) => tSet.has(v));
  const wrong = g.filter((v) => !tSet.has(v));
  const status = wrong.length === 0 ? 'correct' : 'wrong';
  const l = line(key, label, status, correct, wrong, true);
  if (tSet.size === 0) l.absentOnTarget = true;
  return l;
}

export function compareCards(guess, target) {
  const results = [];

  results.push(manaLine('mana', 'Mana cost', guess, target));
  results.push(tokenRow('colors', 'Colors', colorTokens(guess), colorTokens(target)));
  results.push(typeLine('type', 'Type', guess, target));
  const stats = statsLine('pt', 'P/T', guess, target);
  if (stats) results.push(stats);
  for (const key of ['loyalty', 'defense']) {
    const l = scalarRow(key, key === 'loyalty' ? 'Loyalty' : 'Defense', guess, target, key);
    if (l) results.push(l);
  }

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
      'released', 'First released', sameDate ? 'correct' : 'wrong',
      sameDate ? [guess.released_at] : [],
      sameDate ? [] : [guess.released_at],
      true, direction ? `target is ${direction}` : undefined, direction
    )
  );

  const gRarity = String(guess.rarity ?? '').trim();
  results.push(
    String(target.rarity ?? '').trim() === gRarity
      ? line('rarity', 'Rarity', 'correct', [gRarity], [], true)
      : line('rarity', 'Rarity', 'wrong', [], [gRarity], true)
  );



  const gSegs = [];
  for (const f of facesOf(guess)) {
    const segs = oracleSegments(f.oracle_text ?? '');
    if (gSegs.length > 0 && segs.length >0) gSegs.push({ text: '\n' });
    gSegs.push(...segs);
  }
  const gTokens = oracleTokens(guess);
  if (gTokens.length >0) {
  const tTokens = oracleTokens(target);
    const targetSet = new Set(tTokens);
    const correct = gTokens.filter((w) => targetSet.has(w));
    const wrong = gTokens.filter((w) => !targetSet.has(w));
    const status = wrong.length === 0 ? 'correct' : 'wrong';
    const segments = gSegs.map((s) => {
      const seg = { ...s };
      if (s.token) {
        seg.status = targetSet.has(s.text.toLocaleLowerCase()) ? 'correct' : 'wrong';
      }
      return seg;
    });
    results.push({ key: 'oracle', label: 'Oracle text', status, correct, wrong, applicable: true, segments });
  }
  return results;
}
