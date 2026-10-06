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

/** End of a `{...}` mana symbol starting at `i`, or -1 when `i` is not a `{`. */
function braceEnd(text, i) {
  if (text[i] !== '{') return -1;
  const close = text.indexOf('}', i + 1);
  return close === -1 ? -1 : close + 1;
}

/**
 * Split one rules line into display segments at `:`, `.`, and `"`, treating
 * `{...}` mana symbols as opaque so a `.`/`:`/`"` inside one never splits.
 * `[...]` spans are kept whole (Scryfall indexes cleave brackets under `o:`).
 *
 * A quote is a delimiter: it splits the line but is not part of any token (a
 * quote inside a quoted `o:"…"` clause would make Scryfall silently drop it).
 * Each segment records which side(s) it was quoted on (`quotes`: `'open'`,
 * `'close'`, `'both'`, or `''`), determined by position — an opening quote
 * (line start or after whitespace) marks the following run, a closing quote
 * marks the preceding run. The UI renders those quotes outside the token frame.
 * A `:`/`.` terminator stays on the token it ends, so the token matches the
 * literal text Scryfall indexes. Segments with no letter/digit or below the
 * 2-char floor are dropped.
 */
function ruleLineTokens(line) {
  const text = String(line ?? '');
  // Atoms are either a text run or a dropped quote marker carrying its index.
  const atoms = [];
  let start = 0;
  let i = 0;
  const flush = (end) => {
    const run = text.slice(start, end).trim();
    if (run !== '') atoms.push({ text: run });
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      const end = braceEnd(text, i);
      if (end !== -1) { i = end; continue; }
    } else if (ch === '[') {
      const close = text.indexOf(']', i + 1);
      if (close !== -1) { i = close + 1; continue; }
    } else if (ch === '"') {
      flush(i);
      atoms.push({ quote: true, at: i });
      start = i + 1;
    } else if (ch === ':' || ch === '.') {
      flush(i + 1);
      start = i + 1;
    }
    i += 1;
  }
  flush(text.length);

  // Attach each quote to the run it bounds: an opening quote to the next run, a
  // closing quote to the previous one (falling back to the other side when a run
  // is missing). A run can end up quoted on both sides (`"…"`).
  const neighbour = (qi, step) => {
    for (let j = qi + step; j >= 0 && j < atoms.length; j += step) {
      if (!atoms[j].quote) return atoms[j];
    }
    return null;
  };
  for (let qi = 0; qi < atoms.length; qi++) {
    const q = atoms[qi];
    if (!q.quote) continue;
    const opening = q.at === 0 || /\s/.test(text[q.at - 1]);
    const target = opening
      ? neighbour(qi, 1) ?? neighbour(qi, -1)
      : neighbour(qi, -1) ?? neighbour(qi, 1);
    if (!target) continue;
    if (opening) target.open = true; else target.close = true;
  }

  const out = [];
  for (const a of atoms) {
    if (a.quote) continue;
    const token = a.text;
    if (token.length >= ORACLE_MIN_TOKEN && ORACLE_HAS_ALNUM.test(token)) {
      const quotes = a.open && a.close ? 'both' : a.open ? 'open' : a.close ? 'close' : '';
      out.push({ text: token, quotes });
    }
  }
  return out;
}

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

/**
 * Split one face's oracle text into the rules-text tokens and the printed
 * keyword spans shared by the feedback rows and the Scryfall hint search.
 *
 * Reminder `(...)` spans are stripped (depth-aware) and excluded from matching.
 * A leading keyword ability on each line is removed from the rules text and
 * returned separately, verbatim (punctuation and parameters included): the
 * comma/semicolon-separated keyword list, ability words (`Landfall — …`), and
 * keyword costs (`Kicker {2}`, `Protection from red`). The remaining rules text
 * is split into tokens at newlines, `:`, `.`, and `"` (see `ruleLineTokens`),
 * keeps `{...}` mana symbols and `[...]` spans opaque, and trims only the ends,
 * so every rules token is a verbatim substring of the stripped text — which is
 * exactly what Scryfall's `o:` indexes.
 *
 * Returns `{ rules, keywords, segments, keywordSegments, rulesSegments }`:
 * `rules` is the ordered rules tokens, `keywords` the `{ text, name }` printed
 * keyword items, and the three `*segments` are display streams — `segments` the
 * full ordered display, `keywordSegments`/`rulesSegments` the Keywords and
 * Oracle-text rows separately. A keyword chip is one segment per printed
 * ability; each rules token is one segment, with `{ break: true }` between
 * printed lines so a row never renders a blank line where a keyword was removed
 * and a printed line break is always visible. An oracle segment carries the
 * compared/hinted `text` and a `quotes` marker (`'open'`/`'close'`/`'both'`/`''`)
 * so the UI can draw any enclosing quotes outside the token frame; nothing is
 * muted inside the chip.
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
    rules.push(...lineRules.map((r) => r.text));
    // One segment per token: the whole printed clause is the compared unit, so
    // it is framed as a single chip. `text` is the compared/hinted token; any
    // enclosing quotes are rendered outside the frame from `quotes`.
    const lineOracle = lineRules.map((r) => ({
      text: r.text,
      token: true,
      kind: 'oracle',
      quotes: r.quotes,
    }));

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

/**
 * Normalized row. `segments` is the single source of truth: `correct`/`wrong`
 * (the token lists hints and share text consume) are derived from the segments'
 * statuses, so every row builder just describes what it renders.
 */
function line(key, label, segments, extra = {}) {
  const correct = [];
  const wrong = [];
  for (const seg of segments) {
    if (seg.status !== 'correct' && seg.status !== 'wrong') continue;
    // `text` is the compared/hinted token (quotes never included); the enclosing
    // quotes ride along separately as `quotes` for display only.
    const value = seg.text;
    if (value == null) continue;
    const bucket = seg.status === 'correct' ? correct : wrong;
    if (!bucket.includes(value)) bucket.push(value);
  }
  const status = wrong.length === 0 ? 'correct' : 'wrong';
  return { key, label, status, correct, wrong, applicable: true, segments, ...extra };
}

function colorLine(key, label, guessCard, targetCard) {
  const g = colorTokens(guessCard);
  const t = colorTokens(targetCard);
  if (g.length === 0 && t.length === 0) {
    return line(key, label, [{ text: '—', status: 'correct' }]);
  }
  const targetSet = new Set(t);
  const segments = joinFaces(facesOf(guessCard).map((f) => {
    const fc = (f.colors ?? []).length > 0 ? f.colors : [COLORLESS];
    return fc.map((c) => ({ text: c, status: targetSet.has(c) ? 'correct' : 'wrong' }));
  }));
  return line(key, label, segments);
}

function typeLine(key, label, guessCard, targetCard) {
  const gTokens = typeTokens(guessCard);
  const tTokens = typeTokens(targetCard);
  if (gTokens.length === 0 && tTokens.length === 0) {
    return line(key, label, [{ text: '—', status: 'correct' }]);
  }
  const targetSet = new Set(tTokens);
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
  return line(key, label, segments);
}

function manaLine(key, label, guessCard, targetCard) {
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
  return { ...line(key, label, segments), mvValues: [mvValue] };
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
  const absent = gPower.length + gTough.length > 0 && tPower.size === 0 && tTough.size === 0;
  return line(key, label, segments, absent ? { absentOnTarget: true } : {});
}

function scalarRow(key, label, guessCard, targetCard, targetKey) {
  const g = scalarTokens(guessCard, key);
  if (g.length === 0) return null;
  // Loyalty has a Scryfall operator (`loy`), so it must use the same coercion
  // as the hint URL; defense has none, so its values compare raw.
  const keyOf = key === 'loyalty' ? statKey : (v) => `raw:${String(v)}`;
  const tSet = new Set(scalarTokens(targetCard, targetKey).map(keyOf));
  const segments = joinFaces(facesOf(guessCard).map((f) => {
    const v = f[key];
    return v == null ? [] : [{ text: String(v), status: tSet.has(keyOf(v)) ? 'correct' : 'wrong' }];
  }));
  return line(key, label, segments, tSet.size === 0 ? { absentOnTarget: true } : {});
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
    results.push(line('layout', 'Layout', [{ text: gLayout, status: gLayout === (target.layout ?? 'normal') ? 'correct' : 'wrong' }]));
  }

  const sameDate = guess.released_at === target.released_at;
  const direction = sameDate ? undefined : guess.released_at < target.released_at ? 'newer' : 'older';
  results.push(
    line(
      'released', 'First released',
      [{ text: guess.released_at, status: sameDate ? 'correct' : 'wrong' }],
      { note: direction ? `target is ${direction}` : undefined, noteBold: direction }
    )
  );

  const gRarity = String(guess.rarity ?? '').trim();
  results.push(
    line('rarity', 'Rarity', [{ text: gRarity, status: String(target.rarity ?? '').trim() === gRarity ? 'correct' : 'wrong' }])
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
    // Canonical names (lowercased) for `kw:` hints; the verbatim `text` is for
    // display only, since `kw:` matches by name and ignores parameters.
    const correctNames = gKeywords.filter(ok).map((k) => k.name.toLocaleLowerCase());
    const wrongNames = gKeywords.filter((k) => !ok(k)).map((k) => k.name.toLocaleLowerCase());
    results.push(line('keywords', 'Keywords', segments, { correctNames, wrongNames }));
  }

  // Oracle-text row: only the rules text (reminder spans and printed keywords
  // removed). `o:` is a case-insensitive substring match over that same text, so
  // a guessed token is correct when it appears anywhere in the target's rules
  // text. Matching this way keeps the negated hints sound: a token the target
  // contains as part of a longer run must never emit a `-o:` that would exclude
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
    // The tokens keep their ORIGINAL case: `o:` matches literally, so lowercasing
    // would break the verbatim-substring guarantee. Matching itself stays
    // case-insensitive via the lowercased comparison text.
    const segments = gSegs.map((s) => (
      s.token ? { ...s, status: targetSearch.includes(s.text.toLocaleLowerCase()) ? 'correct' : 'wrong' } : s
    ));
    results.push(line('oracle', 'Oracle text', segments));
  }
  return results;
}
