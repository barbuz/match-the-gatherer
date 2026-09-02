/**
 * Hint gathering + Scryfall search-URL building (spec §3).
 *
 * gatherHints(guesses) condenses every piece of feedback the player has
 * collected into a deduplicated list of property hints about the target card:
 * positive ("it's a creature", "mana value is 4") and negative ("it's not
 * an artifact", "it's newer than 2009-01-10"). buildScryfallSearchUrl
 * turns that list into a httpts://scryfall.com/search/ link that filters to the
 * cards still matching everything the player knows, restricted to first
 * printings via not:reprint.
 */

const PLACEHOLDER = '—';

/** Hint-shaped value for a guessed-but-wrong property. */
function negate(hint) {
  return { ...hint, negated: true };
}

/** '2020-06-01' pushed twice from different guesses must collapse to one. */
function pushUnique(hints, seen, hint) {
  const key = `${hint.kind}|${hint.negated ?? false}|${hint.dir ?? ''}|${String(hint.value).toLowerCase()}`;
  if (!seen.has(key)) {
    seen.add(key);
    hints.push(hint);
  }
}

/**
 * Collect deduplicated hints from every result line of every guess.
 *
 * Two rules keep the Scryfall query from over-constraining:
 * - once a property line is fully matched ('correct'), hints from later
 *   partial/wrong lines for the same property carry no extra informationand
 *   are dropped;
 * - same-direction release-date bounds collapse to the tightest one
 *   (e.g. date>2001 AND date>2010 reduces to date>2010).
 * @param {Array<{ card: object, results: Array }>} guesses  game-state entries
 * @returns {Array<{ kind, value, negated?, dir? }>} hint list
 */
export function gatherHints(guesses,) {
  // First pass: track which property lines were ever fully matched, so
  // their partial/wrong counterparts elsewhere can be ignored.



  const fullyMatched = new Set();
  for (const entry of guesses ?? []) {
    for (const r of entry?.results ?? []) {
      if (r.status === 'correct') fullyMatched.add(r.key);
    }
  }



  const hints = [];
  const seen = new Set();
  const push = (hint) => pushUnique(hints, seen, hint);

  const pushSetValues = (values, kind, negated = false) => {
    for (const v of values ?? []) {
      if (v && v !== PLACEHOLDER) push({ kind, value: v, negated });
    }
  };
  const pushValue = (hint,) => push({ ...hint, negated: hint.negated ?? false });

  for (const entry of guesses ?? []) {
    for (const r of entry?.results ?? []) {
      if (fullyMatched.has(r.key) && r.status !== 'correct') continue; // fully matched property: partial/wrong values are irrelevant
      switch (r.key) {
        case 'mana': {
          const mv = r.mvValues?.find((m) => m.status === 'correct');
          if (mv && mv.text != null) pushValue({ kind: 'manaValue', value: mv.text });
          if (r.status === 'correct') {
            const shown = r.correct?.[0];
            if (shown && shown !== '(no mana cost)') pushValue({ kind: 'mana', value: shown });
          } else if (r.status === 'wrong') {
            const gmv = r.mvValues?.find((m) => m.status === 'wrong');
            if (gmv && gmv.text != null) push(negate({ kind: 'manaValue', value: gmv.text }));
          }
          break;
        }
        case 'colors':
          pushSetValues(r.correct, 'color');
          pushSetValues(r.wrong, 'color', true);
          break;
        case 'type':
          pushSetValues(r.correct, 'type');
          pushSetValues(r.wrong, 'type', true);
          break;
        case 'pt': {
          const segs = r.ptSegments ?? [];
          for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            if (seg.text == null || seg.text === PLACEHOLDER) continue;
            const kind = i === 0 ? 'power' : 'toughness';
            pushValue({ kind, value: seg.text, negated: seg.status === 'wrong' });
          }
          break;
        }
        case 'loyalty':
          pushSetValues(r.correct, 'loyalty');
          pushSetValues(r.wrong, 'loyalty', true);
          break;
        case 'layout':
          pushSetValues(r.correct, 'layout');
          pushSetValues(r.wrong, 'layout', true);
          break;
        case 'released': {
          if (r.status === 'correct') {
            const v = r.correct?.[0];
            if (v) pushValue({ kind: 'released', value: v });
          } else if (r.noteBold) {
            pushValue({ kind: 'released', value: r.correct?.[0] ?? r.wrong?.[0], dir: r.noteBold === 'newer' ? '>' : '<' });
          }
          break;
        }
        case 'keywords':
          pushSetValues(r.correct, 'keyword');
          pushSetValues(r.wrong, 'keyword', true);
          break;
        // Scryfall search has no operator for the defense statistic, so
        // those hints are intentionally dropped rather than silently ignored.
      }
    }
  }

  // Fold same-direction date bounds down to the tightest one (rule 1);and
  // a known exact date subsumes all released hints entirely.

  const released = hints.filter((h) => h.kind === 'released');
  const exact = released.find((h) => !h.negated && !h.dir);
  if (exact) {
    return hints.filter((h) => h.kind !== 'released' || h === exact);
  }
  const best = new Map(); // direction ('>' | '<') → tightest hint
  for (const h of released) {
    if (h.negated || !h.dir) continue;
    const cur = best.get(h.dir);
    if (cur) {
      const tighter = h.dir === '>' ? h.value > cur.value : h.value < cur.value;
      if (tighter) best.set(h.dir, h);
    } else {
      best.set(h.dir, h);
    }
  }
  return hints.filter((h) => h.kind !== 'released' || h.negated || best.get(h.dir) === h);
}

const SAFE_TOKEN = /^[A-Za-z0-9'_-]+$/;

/** Quote a value only when Scryfall would misparse it bare. */
function quoteIfNeeded(value,) {
  return SAFE_TOKEN.test(value) ? value : `"${value}"`;
}

/** Build an ANDed clause for one hint; returns null when unexpressible. */
export function hintToClause(hint,) {
  const { kind, value, negated = false, dir } = hint;
  switch (kind) {
    case 'type':
      return `${negated ? '-' : ''}t:${quoteIfNeeded(String(value).toLowerCase())}`;
    case 'color':
      return `${negated ? '-' : ''}c:${quoteIfNeeded(String(value).toLowerCase())}`;
    case 'keyword':
      return `${negated ? '-' : ''}kw:${quoteIfNeeded(String(value).toLowerCase())}`;
    case 'layout':
      return `${negated ? '-' : ''}layout:${quoteIfNeeded(String(value).toLowerCase())}`;
    case 'mana':
      return `mana=${value}`;
    case 'manaValue':
      return negated ? `mv!=${value}` : `mv=${value}`;
    case 'power':
      return negated ? `pow!=${value}` : `pow=${value}`;
    case 'toughness':
      return negated ? `tou!=${value}` : `tou=${value}`;
    case 'loyalty':
      return negated ? `loy!=${value}` : `loy=${value}`;
    case 'released':
      if (negated) return dir === '>' ? `date<=${value}` : dir === '<' ? `date>=${value}` : `date!=${value}`;
      return dir ? `date${dir}${value}` : `date=${value}`;
    default:
      return null;
  }
}

/**
 * Build a Scryfall search URL from a hint list. First printings only,
 * always via not:reprint (per spec §3).
 * @param {Array<{ kind, value, negated?, dir? }>} hints  gatherHints() output
 * @returns {string}
 */
export function buildScryfallSearchUrl(hints,) {
  const clauses = (hints ?? []).map(hintToClause).filter(Boolean);
  clauses.push('not:reprint');
  const q = encodeURIComponent(clauses.join(' '));
  return `https://scryfall.com/search/?q=${q}`;
}