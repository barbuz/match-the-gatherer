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

/** Join per-face segment groups with a `//` separator, dropping empty groups. */
function joinFaces(groups) {
  const out = [];
  for (const g of groups) {
    if (g.length === 0) continue;
    if (out.length > 0) out.push({ sep: true, text: '//' });
    out.push(...g);
  }
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

/**
 * The numeric value Scryfall indexes for a creature stat (power/toughness) or
 * loyalty. Scryfall's `pow`/`tou`/`loy` operators are numeric-only, but rather
 * than rejecting a variable stat they coerce it: the leading signed constant
 * wins, and a bare `*`/`X`/`?` counts as 0. Verified against the live API —
 * `tou=1` matches Tarmogoyf (`1+*`), `pow=2` matches Angry Mob (`2+*`), and
 * `pow=0` matches the ~220 cards with a bare `*`.
 *
 * Comparison uses this same coercion so the feedback the player sees agrees
 * with what Scryfall will actually return for the hint URL: a `1+*` guess
 * against a `1` target is a match, not a miss. Returns null when the value has
 * no numeric reading (e.g. `∞`), which no Scryfall operator can express.
 */
export function statValue(raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return null;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return String(Number(text));
  if (text.includes('*') || text === '?' || text === 'X') {
    const m = text.match(/[+-]?\d+(?:\.\d+)?/);
    return m ? String(Number(m[0])) : '0';
  }
  return null;
}

/** Equality key for a stat: Scryfall's coerced value, or the raw string when unexpressible. */
function statKey(raw) {
  const v = statValue(raw);
  return v == null ? `raw:${String(raw)}` : `n:${v}`;
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
  // Face-level only, like manaCostTokens(): a multi-faced card's card-level
  // `type_line` is the faces' type lines CONCATENATED with `//`, so parsing it
  // as one line would invent `//`/`—` tokens. facesOf falls back to [card] for
  // single-faced cards, so the card-level field is still covered there.
  const out = [];
  for (const f of facesOf(card)) {
    const parsed = parseTypeLine(f.type_line ?? '');
    addUnique(out, [...parsed.supertypes, ...parsed.types, ...parsed.subtypes]);
  }
  return out;
}

function scalarTokens(card, key) {
  const pick = (f) => {
    const v = f[key];
    return v == null ? null : [String(v)];
  };
  return collect(card, pick);
}

const ORACLE_BRACKET = /\([^()]*\)|\[[^\[\]]*\]/g;
const ORACLE_HAS_ALNUM = /[\p{L}\p{N}]/u;
const ORACLE_MIN_TOKEN = 2;

/**
 * Split one face's oracle text into the ordered verbatim tokens shared by the
 * oracle feedback row and the `fo:` hint search. Rules:
 *  - split on newlines: a newline can never appear in a URL query value;
 *  - split on the double-quote character: the quote stays as plain display text
 *    but is never inside a token, since an embedded `"` would terminate a quoted
 *    `fo:"..."` clause and make Scryfall silently discard it;
 *  - isolate parenthesised/bracketed spans as their own tokens (reminder text);
 *  - keep `{...}` mana symbols inline with the surrounding plain text;
 *  - trim only the ends, so each token stays a verbatim substring of the text.
 * Returns `{ tokens, segments }`; `segments` reproduces the text in order and
 * flags each emitted token so the row highlights exactly what the search uses.
 */
export function oracleLineTokens(text = '') {
  const src = String(text ?? '');
  const tokens = [];
  const segments = [];

  const pushPlain = (s) => { if (s) segments.push({ text: s }); };
  const pushChunk = (chunk) => {
    const trimmed = chunk.trim();
    if (!trimmed) { pushPlain(chunk); return; }
    const start = chunk.indexOf(trimmed);
    pushPlain(chunk.slice(0, start));
    if (trimmed.length >= ORACLE_MIN_TOKEN && ORACLE_HAS_ALNUM.test(trimmed)) {
      tokens.push(trimmed);
      segments.push({ text: trimmed, token: true });
    } else {
      segments.push({ text: trimmed });
    }
    pushPlain(chunk.slice(start + trimmed.length));
  };

  const lines = src.split('\n');
  for (let li = 0; li < lines.length; li++) {
    if (li > 0) pushPlain('\n');
    const pieces = lines[li].split('"');
    for (let pi = 0; pi < pieces.length; pi++) {
      // Keep the quote as plain display text, but never inside a token: an
      // embedded `"` would terminate the quoted `fo:"..."` clause.
      if (pi > 0) pushPlain('"');
      const piece = pieces[pi];
      if (!piece) continue;
      let last = 0;
      for (const m of piece.matchAll(ORACLE_BRACKET)) {
        if (m.index > last) pushChunk(piece.slice(last, m.index));
        pushChunk(m[0]);
        last = m.index + m[0].length;
      }
      if (last < piece.length) pushChunk(piece.slice(last));
    }
  }
  return { tokens, segments };
}

function oracleTokens(card) {
  const out = [];
  for (const f of facesOf(card)) {
    for (const t of oracleLineTokens(f.oracle_text ?? '').tokens) {
      out.push(t.toLocaleLowerCase());
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

function colorLine(key, label, guessCard, targetCard) {
  const g = colorTokens(guessCard);
  const t = colorTokens(targetCard);
  if (g.length === 0 && t.length === 0) {
    return line(key, label, 'correct', ['—'], [], true);
  }
  const targetSet = new Set(t);
  const correct = g.filter((v) => targetSet.has(v));
  const wrong = g.filter((v) => !targetSet.has(v));
  const status = wrong.length === 0 ? 'correct' : 'wrong';
  const segments = joinFaces(facesOf(guessCard).map((f) => {
    const fc = (f.colors ?? []).length > 0 ? f.colors : [COLORLESS];
    return fc.map((c) => ({ text: c, status: targetSet.has(c) ? 'correct' : 'wrong' }));
  }));
  return line(key, label, status, correct, wrong, true, undefined, undefined, segments);
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
  const segments = joinFaces(facesOf(guessCard).map((f) => {
    const parsed = parseTypeLine(f.type_line ?? '');
    const segs = [];
    const main = [...parsed.supertypes, ...parsed.types];
    for (const t of main) segs.push({ text: t, status: targetSet.has(t) ? 'correct' : 'wrong' });
    if (parsed.subtypes.length >0) {
      segs.push({ dash: true });
      for (const t of parsed.subtypes) segs.push({ text: t, status: targetSet.has(t) ? 'correct' : 'wrong' });
    }
    return segs;
  }));
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
  const tPower = new Set(scalarTokens(targetCard, 'power').map(statKey));
  const tTough = new Set(scalarTokens(targetCard, 'toughness').map(statKey));
  if (gPower.length + gTough.length === 0) return null;
  const segments = joinFaces(facesOf(guessCard).map((f) => {
    const p = f.power == null ? null : String(f.power);
    const t = f.toughness == null ? null : String(f.toughness);
    const segs = [];
    if (p != null) segs.push({ text: p, status: tPower.has(statKey(p)) ? 'correct' : 'wrong' });
    if (p != null && t != null) segs.push({ slash: true });
    if (t != null) segs.push({ text: t, status: tTough.has(statKey(t)) ? 'correct' : 'wrong' });
    return segs;
  }));
  const values = segments.filter((s) => !s.slash && !s.sep);
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
  // Loyalty has a Scryfall operator (`loy`), so it must use the same coercion
  // as the hint URL; defense has none, so its values compare raw.
  const keyOf = key === 'loyalty' ? statKey : (v) => `raw:${String(v)}`;
  const tSet = new Set(scalarTokens(targetCard, targetKey).map(keyOf));
  const correct = g.filter((v) => tSet.has(keyOf(v)));
  const wrong = g.filter((v) => !tSet.has(keyOf(v)));
  const status = wrong.length === 0 ? 'correct' : 'wrong';
  const segments = joinFaces(facesOf(guessCard).map((f) => {
    const v = f[key];
    return v == null ? [] : [{ text: String(v), status: tSet.has(keyOf(v)) ? 'correct' : 'wrong' }];
  }));
  const l = line(key, label, status, correct, wrong, true, undefined, undefined, segments);
  if (tSet.size === 0) l.absentOnTarget = true;
  return l;
}

/**
 * Token sets for every scored property of a card, keyed the same way as the
 * comparison rows (`mana`, `colors`, `type`, `pt`, `loyalty`, `defense`,
 * `layout`, `released`, `rarity`, `oracle`). Used by the token-overlap score
 * in `scoring.js`, which needs the same tokenization on both cards rather than
 * just the guessed-side tokens the comparison result lines carry.
 *
 * Properties a card does not have are omitted (or, for the always-present
 * mana/colors trio, fall back to the explicit placeholders). `layout` is only
 * emitted for non-normal layouts, mirroring the comparison row. Mana folds in
 * the mana value as its own token so a cost change at equal MV still scores
 * partial credit, matching the row's `mvValues`.
 */
export function propertyTokens(card) {
  const out = {};
  // Whole costs are normalized the way manaLine() compares them, so two costs
  // that differ only in brace/space/case still share a token.
  out.mana = manaCostTokens(card).map((v) => (v === NO_MANA_COST ? v : normalizeManaCost(v)));
  if (card?.cmc != null) out.mana.push(`mv:${card.cmc}`);
  out.colors = colorTokens(card);
  out.type = typeTokens(card);

  const pt = [
    ...scalarTokens(card, 'power').map(statKey),
    ...scalarTokens(card, 'toughness').map(statKey),
  ];
  if (pt.length > 0) out.pt = pt;

  const loyalty = scalarTokens(card, 'loyalty').map(statKey);
  if (loyalty.length > 0) out.loyalty = loyalty;

  const defense = scalarTokens(card, 'defense').map((v) => `raw:${String(v)}`);
  if (defense.length > 0) out.defense = defense;

  const layout = card?.layout ?? 'normal';
  if (layout !== 'normal') out.layout = [layout];

  const released = card?.released_at;
  if (released != null) out.released = [String(released)];

  const rarity = String(card?.rarity ?? '').trim();
  if (rarity) out.rarity = [rarity];

  const oracle = oracleTokens(card);
  if (oracle.length > 0) out.oracle = oracle;

  return out;
}

export function compareCards(guess, target) {
  const results = [];

  results.push(manaLine('mana', 'Mana cost', guess, target));
  results.push(colorLine('colors', 'Colors', guess, target));
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
    const segs = oracleLineTokens(f.oracle_text ?? '').segments;
    if (gSegs.length > 0 && segs.length >0) gSegs.push({ sep: true, text: '//' });
    gSegs.push(...segs);
  }
  const gTokens = oracleTokens(guess);
  if (gTokens.length >0) {
    // `fo:` is a case-insensitive substring match, so a guessed line is correct
    // when it appears anywhere in the target's text, not only when it equals a
    // whole target line. Matching this way keeps the negated hints sound: a line
    // the target contains as part of a longer line must never emit a `-fo:` that
    // would exclude the answer (e.g. guess "Flying" vs target "Flying, vigilance").
    const targetSearch = facesOf(target)
      .map((f) => f.oracle_text ?? '')
      .join('\n')
      .toLocaleLowerCase();
    // correct/wrong carry the ORIGINAL-case tokens: `fo:` matches literally, so
    // lowercasing would break the verbatim-substring guarantee. Matching itself
    // stays case-insensitive via the lowercased comparison text.
    const correct = [];
    const wrong = [];
    const segments = gSegs.map((s) => {
      const seg = { ...s };
      if (s.token) {
        const ok = targetSearch.includes(s.text.toLocaleLowerCase());
        (ok ? correct : wrong).push(s.text);
        seg.status = ok ? 'correct' : 'wrong';
      }
      return seg;
    });
    const status = wrong.length === 0 ? 'correct' : 'wrong';
    results.push({ key: 'oracle', label: 'Oracle text', status, correct, wrong, applicable: true, segments });
  }
  return results;
}
