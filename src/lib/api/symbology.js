/**
 * Scryfall symbol → SVG mapping, used to render mana costs as images
 * instead of their ascii placeholders (e.g. "{2}{R}").
 *
 * The symbology list is fetched once and shared across components via a
 * module-level cache / in-flight promise.
 */
const SYMBOLOGY_URL = 'https://api.scryfall.com/symbology';

let cache = null;
let inFlight = null;

export function fetchSymbology() {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const res = await fetch(SYMBOLOGY_URL);
    if (!res.ok) throw new Error(`symbology fetch failed: HTTP ${res.status}`);
    const json = await res.json();
    const map = new Map();
    for (const s of json.data ?? []) {
      if (s?.symbol && s?.svg_uri) map.set(s.symbol, s.svg_uri);
    }
    cache = map;
    return cache;
  })().catch((err) => {
    inFlight = null; // allow retry after a real failure
    throw err;
  });
  return inFlight;
}

/** Split a mana cost like "{2}{R/G}" into its "{…}" symbol tokens. */
export function tokenizeManaCost(cost = '') {
  return cost.match(/\{[^}]+\}/g) ?? [];
}

/** True when a string is purely one or more "{…}" mana symbols. */
export function isManaCost(cost = '') {
  const tokens = tokenizeManaCost(cost);
  return tokens.length > 0 && tokens.join('') === cost.trim();
}