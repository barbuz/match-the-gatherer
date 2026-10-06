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

const ORACLE_HAS_ALNUM = /[\p{L}\p{N}]/u;
const ORACLE_MIN_TOKEN = 2;

/**
 * Keywords whose printed form may carry an alphabetic parameter after the name
 * (`Protection from red`, `Partner with Rory Williams`, `Enchant creature`,
 * `Equip legendary creature {1}`). Everything else takes a numeric/braced
 * parameter or none.
 */
const TEXT_PARAM_KEYWORDS = new Set(['partner with', 'partner', 'protection', 'enchant', 'equip']);

/**
 * Text-parameter keywords whose value may itself contain a comma — partner
 * names like `Krav, the Unredeemed`. For every other keyword a comma ends the
 * parameter, so `Protection from red, flying` splits into two keywords instead
 * of swallowing `flying`.
 */
const COMMA_IN_PARAM_KEYWORDS = new Set(['partner with', 'partner']);

/** A keyword parameter starts with a mana symbol, number, X, or a dash
 *  (`Kicker {2}`, `Crew 3`, `Monstrosity X`, `Escape—{2}{R}`, `Channel — {6}`). */
const PARAM_START = /^[{\dXx*?+\-—–]/;

/**
 * Remove parenthesised reminder spans, tracking depth so nested parentheses
 * (`Rocket-Powered Turbo Slug`) are removed cleanly. An unmatched `)` at depth 0
 * stays literal. Square brackets are NOT reminder text: Scryfall indexes cleave
 * brackets under `o:`, so they are kept.
 */
export function stripReminderText(text = '') {
  const src = String(text ?? '');
  let out = '';
  let depth = 0;
  for (const ch of src) {
    if (ch === '(') { depth += 1; continue; }
    if (ch === ')') { if (depth > 0) depth -= 1; else out += ch; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

/** A card's canonical keywords as recognition vocabulary, longest name first. */
function keywordVocabulary(card) {
  const seen = new Set();
  const out = [];
  for (const k of Array.isArray(card?.keywords) ? card.keywords : []) {
    const name = String(k ?? '').trim();
    if (!name) continue;
    const lower = name.toLocaleLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(name);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Offset in `rest` where a keyword parameter ends (start of `(`, `.`, `;`, and
 *  `,` unless the keyword's text value may itself contain commas). */
function parameterEnd(rest, allowComma) {
  const stops = allowComma ? ['(', '.', ';'] : ['(', '.', ';', ','];
  let idx = -1;
  for (const ch of stops) {
    const i = rest.indexOf(ch);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  return idx;
}

/** True when `param` is a plausible keyword parameter: empty, numeric/braced, or
 *  a short text value for the keywords that take one. */
function isKeywordParameter(name, param) {
  const p = param.trim();
  if (!p) return true;
  if (PARAM_START.test(p)) return true;
  if (TEXT_PARAM_KEYWORDS.has(name.toLocaleLowerCase())) {
    return p.split(/\s+/).length <= 5 && /^[A-Za-z'’\-][A-Za-z'’\-,\s]*$/.test(p);
  }
  return false;
}

/** Match one vocabulary keyword at the start of `text` (longest first, requiring
 *  a word boundary and a plausible parameter). */
function matchKeywordAt(text, vocab) {
  const lower = text.toLocaleLowerCase();
  for (const name of vocab) {
    const n = name.toLocaleLowerCase();
    if (!lower.startsWith(n)) continue;
    const after = text[name.length];
    if (after && ORACLE_HAS_ALNUM.test(after)) continue; // not a whole word
    const rest = text.slice(name.length);
    const stop = parameterEnd(rest, COMMA_IN_PARAM_KEYWORDS.has(n));
    let paramEnd = stop === -1 ? rest.length : stop;
    while (paramEnd > 0 && /\s/.test(rest[paramEnd - 1])) paramEnd -= 1; // never a trailing space
    const param = rest.slice(0, paramEnd);
    if (!isKeywordParameter(name, param)) continue;
    return { name, end: name.length + paramEnd };
  }
  return null;
}

/** A leading run of `{...}` mana symbols, e.g. the cost in `{T}: Add {G}.` or
 *  `{2}{R}: …`. Used only to mute the cost part of a rules line, never to match. */
const MANA_COST_PREFIX = /^(?:\{[^}]*\})+/;

/**
 * The leading "name" of a rules line — the part a reader scans first: a
 * keyword-ability name or a mana-cost run. Display-only: the whole line is still
 * one compared token, but muting just this prefix makes the compared unit
 * legible (the name was already shown by the Keywords row).
 */
function ruleNamePrefix(text, vocab = []) {
  const kw = matchKeywordAt(text, vocab);
  if (kw) return text.slice(0, kw.end);
  const m = text.match(MANA_COST_PREFIX);
  if (m) return m[0];
  return '';
}

/**
 * Consume a leading keyword occurrence from one reminder-free line. Handles an
 * ability-word prefix (`Landfall — …`, but not a keyword cost like
 * `Channel — {6}`), a comma/semicolon-separated keyword list
 * (`Flying, first strike, vigilance`), and per-keyword parameters
 * (`Kicker {2}`, `Protection from red`). Returns `{ items, end }` with each
 * item's character span and canonical name, or null for a plain rules line.
 */
function parseKeywordPrefix(line, vocab) {
  const lower = line.toLocaleLowerCase();
  for (const name of vocab) {
    if (lower.slice(0, name.length) !== name.toLocaleLowerCase()) continue;
    const rest = line.slice(name.length);
    const dm = rest.match(/^\s*[—–-]\s*(.*)$/s);
    if (!dm) continue;
    const after = dm[1];
    if (PARAM_START.test(after)) continue; // keyword cost, e.g. `Channel — {6}`
    // Consume the dash and any following whitespace, but leave `after` itself so
    // the rules text keeps its exact characters (and no stray leading space).
    const end = name.length + (dm[0].length - after.length);
    return { items: [{ start: 0, end: name.length, name }], end };
  }
  const items = [];
  let cursor = 0;
  while (cursor < line.length) {
    const m = matchKeywordAt(line.slice(cursor), vocab);
    if (!m) break;
    items.push({ start: cursor, end: cursor + m.end, name: m.name });
    cursor += m.end;
    const after = line[cursor];
    if (after === ',' || after === ';') { cursor += 1; if (line[cursor] === ' ') cursor += 1; continue; }
    break;
  }
  if (items.length === 0) return null;
  return { items, end: items[items.length - 1].end };
}

/** Tokens for one rules line: split on `"` (a quote inside a quoted clause would
 *  make Scryfall discard it) and drop empty, too-short, or punctuation-only
 *  runs. Every token stays a verbatim substring of the reminder-free line. */
function ruleLineTokens(line) {
  const tokens = [];
  for (const piece of String(line ?? '').split('"')) {
    const trimmed = piece.trim();
    if (trimmed.length >= ORACLE_MIN_TOKEN && ORACLE_HAS_ALNUM.test(trimmed)) tokens.push(trimmed);
  }
  return tokens;
}

/**
 * Split one face's oracle text into the rules-text tokens and the printed
 * keyword spans shared by the feedback rows and the Scryfall hint search.
 *
 * Reminder `(...)` spans are stripped (depth-aware) and excluded from matching.
 * A leading keyword ability on each line is removed from the rules text and
 * returned separately, verbatim (punctuation and parameters included): the
 * comma/semicolon-separated keyword list, ability words (`Landfall — …`), and
 * keyword costs (`Kicker {2}`, `Protection from red`). The remaining rules text
 * is split on newlines and on `"`, keeps `{...}` mana symbols inline, and trims
 * only the ends, so every rules token is a verbatim substring of the stripped
 * text — which is exactly what Scryfall's `o:` indexes.
 *
 * Returns `{ rules, keywords, segments, keywordSegments, rulesSegments }`:
 * `rules` is the per-line rules tokens, `keywords` the `{ text, name }` printed
 * keyword items, and the three `*segments` are display streams — `segments` the
 * full ordered display, `keywordSegments`/`rulesSegments` the Keywords and
 * Oracle-text rows separately. Each stream holds one segment per printed line (a
 * chip for a keyword, the whole rules line for oracle text) with `{ break: true }`
 * between lines, so a row never renders a blank line where a keyword was removed
 * and a printed line break is always visible. Oracle segments carry `nameText`,
 * the leading keyword name or mana cost the UI mutes (it is not part of the
 * compared line and is already shown by the Keywords row).
 */
export function parseOracleText(text = '', keywords = []) {
  const vocab = Array.isArray(keywords) ? [...keywords].sort((a, b) => b.length - a.length) : [];
  const stripped = stripReminderText(text);
  const rules = [];
  const keywordItems = [];
  const segments = [];
  const keywordSegments = [];
  const rulesSegments = [];
  for (const line of stripped.split('\n')) {
    const parsed = parseKeywordPrefix(line, vocab);
    let remainder = line;
    const lineKeywords = [];
    if (parsed) {
      let prevEnd = 0;
      for (const item of parsed.items) {
        const sep = line.slice(prevEnd, item.start);
        if (sep) lineKeywords.push({ text: sep });
        const span = line.slice(item.start, item.end);
        keywordItems.push({ text: span, name: item.name });
        // Only the canonical name is the compared token; the printed parameter
        // (`{2}{W}{U}{B}{R}{G}`, `from red`, …) is shown but not marked.
        lineKeywords.push({
          text: span,
          token: true,
          kind: 'keyword',
          name: item.name,
          nameText: span.slice(0, item.name.length),
        });
        prevEnd = item.end;
      }
      remainder = line.slice(parsed.end);
    }
    const lineRules = ruleLineTokens(remainder);
    rules.push(...lineRules);
    // Display segment is the whole printed line; `tokens` are the quote-split
    // pieces actually matched/hinted, so a line containing `"` never yields a
    // malformed `o:"…"` clause.
    const lineOracle = lineRules.length > 0
      ? [{
          text: remainder.trim(),
          token: true,
          kind: 'oracle',
          nameText: ruleNamePrefix(remainder.trim(), vocab),
          tokens: lineRules,
        }]
      : [];

    if (lineKeywords.length || lineOracle.length) {
      if (segments.length) segments.push({ break: true });
      segments.push(...lineKeywords, ...lineOracle);
    }
    if (lineKeywords.length) {
      if (keywordSegments.length) keywordSegments.push({ break: true });
      keywordSegments.push(...lineKeywords);
    }
    if (lineOracle.length) {
      if (rulesSegments.length) rulesSegments.push({ break: true });
      rulesSegments.push(...lineOracle);
    }
  }
  return { rules, keywords: keywordItems, segments, keywordSegments, rulesSegments };
}

/** Lowercased rules-text tokens for a whole card (union of faces). */
function oracleTokens(card) {
  const vocab = keywordVocabulary(card);
  const out = [];
  for (const f of facesOf(card)) {
    for (const t of parseOracleText(f.oracle_text ?? '', vocab).rules) {
      out.push(t.toLocaleLowerCase());
    }
  }
  return out;
}

/** Printed keyword items for a whole card (union of faces), in reading order. */
function keywordItems(card) {
  const vocab = keywordVocabulary(card);
  const out = [];
  for (const f of facesOf(card)) {
    for (const k of parseOracleText(f.oracle_text ?? '', vocab).keywords) out.push(k);
  }
  return out;
}

/** Lowercased canonical keyword names actually printed on the card (deduplicated). */
function keywordTokens(card) {
  const out = [];
  const seen = new Set();
  for (const k of keywordItems(card)) {
    const n = k.name.toLocaleLowerCase();
    if (!seen.has(n)) { seen.add(n); out.push(n); }
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
 * `layout`, `released`, `rarity`, `keywords`, `oracle`). Used by the token-overlap score
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

  const keywords = keywordTokens(card);
  if (keywords.length > 0) out.keywords = keywords;

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



  // Keywords row: only when the GUESS prints keyword abilities (anti-leak). The
  // printed spans are compared by canonical-name membership, exactly as
  // Scryfall's `kw:` matches, so parameters (`Kicker {2}` vs `{1}`) don't matter.
  const gKeywords = keywordItems(guess);
  if (gKeywords.length > 0) {
    const targetKeywords = new Set(keywordTokens(target));
    const segments = [];
    for (const f of facesOf(guess)) {
      const parsed = parseOracleText(f.oracle_text ?? '', keywordVocabulary(guess));
      if (!parsed.keywordSegments.some((s) => s.token && s.kind === 'keyword')) continue;
      if (segments.length > 0) segments.push({ sep: true, text: '//' });
      // Keep the non-token separators (`, `) so the row reads exactly as
      // printed, and colour only the keyword spans.
      segments.push(...parsed.keywordSegments.map((s) => (
        s.token && s.kind === 'keyword'
          ? { ...s, status: targetKeywords.has(s.name.toLocaleLowerCase()) ? 'correct' : 'wrong' }
          : s
      )));
    }
    const ok = (k) => targetKeywords.has(k.name.toLocaleLowerCase());
    const correct = gKeywords.filter(ok).map((k) => k.text);
    const wrong = gKeywords.filter((k) => !ok(k)).map((k) => k.text);
    // Canonical names (lowercased) for `kw:` hints; the verbatim `text` is for
    // display only, since `kw:` matches by name and ignores parameters.
    const correctNames = gKeywords.filter(ok).map((k) => k.name.toLocaleLowerCase());
    const wrongNames = gKeywords.filter((k) => !ok(k)).map((k) => k.name.toLocaleLowerCase());
    const status = wrong.length === 0 ? 'correct' : 'wrong';
    results.push({ key: 'keywords', label: 'Keywords', status, correct, wrong, correctNames, wrongNames, applicable: true, segments });
  }

  // Oracle-text row: only the rules text (reminder spans and printed keywords
  // removed). `o:` is a case-insensitive substring match over that same text, so
  // a guessed line is correct when it appears anywhere in the target's rules
  // text. Matching this way keeps the negated hints sound: a line the target
  // contains as part of a longer line must never emit a `-o:` that would exclude
  // the answer (e.g. guess "Flying" vs target "Flying, vigilance").
  const gSegs = [];
  for (const f of facesOf(guess)) {
    const segs = parseOracleText(f.oracle_text ?? '', keywordVocabulary(guess)).rulesSegments;
    if (gSegs.length > 0 && segs.length > 0) gSegs.push({ break: true });
    gSegs.push(...segs);
  }
  const gTokens = oracleTokens(guess);
  if (gTokens.length > 0) {
    const targetSearch = facesOf(target)
      .map((f) => stripReminderText(f.oracle_text ?? ''))
      .join('\n')
      .toLocaleLowerCase();
    // correct/wrong carry the ORIGINAL-case tokens: `o:` matches literally, so
    // lowercasing would break the verbatim-substring guarantee. Matching itself
    // stays case-insensitive via the lowercased comparison text.
    const correct = [];
    const wrong = [];
    const segments = gSegs.map((s) => {
      const seg = { ...s };
      if (s.token) {
        // Match and hint each quote-split piece, but colour the whole printed
        // line by whether every piece matched.
        const ok = (s.tokens ?? [s.text]).every((t) => targetSearch.includes(t.toLocaleLowerCase()));
        (ok ? correct : wrong).push(...(s.tokens ?? [s.text]));
        seg.status = ok ? 'correct' : 'wrong';
      }
      return seg;
    });
    const status = wrong.length === 0 ? 'correct' : 'wrong';
    results.push({ key: 'oracle', label: 'Oracle text', status, correct, wrong, applicable: true, segments });
  }
  return results;
}
