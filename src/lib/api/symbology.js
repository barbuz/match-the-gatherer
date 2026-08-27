/**
 * Scryfall symbol → SVG mapping, used to render mana costs as images
 * instead of their ascii placeholders (e.g. "{2}{R}").
 *
 * The symbology list is fetched exactly once (concurrently with the card-name
 * catalog in the background loader) and persisted to storage, so it remains
 * usable on later visits even when the network fetch fails. Consumers get the
 * map from the in-flight promise / module cache.
 */
import { dbGet, dbSet } from '../storage/db.js';

const SYMBOLOGY_URL = 'https://api.scryfall.com/symbology';
const SYMBOLS_KEY = 'mtg:card-symbols';

let cache = null;
let inFlight = null;

/** Build a Map from the raw symbology JSON array. */
function buildMap(data) {
  const map = new Map();
  for (const s of data ?? []) {
    if (s?.symbol && s?.svg_uri) map.set(s.symbol, s.svg_uri);
  }
  return map;
}

/** Load the persisted symbol map, or null when none has been saved. */
export async function getCachedSymbols() {
  const record = await dbGet(SYMBOLS_KEY);
  if (record?.symbols) {
    try {
      return new Map(Object.entries(record.symbols));
    } catch {
      return null;
    }
  }
  return null;
}

/** Persist a symbol map to storage (idb-keyval can't store a Map directly). */
export function cacheSymbols(map) {
  return dbSet(SYMBOLS_KEY, {
    fetchedAt: new Date().toISOString(),
    symbols: Object.fromEntries(map),
  });
}

/**
 * Resolve the symbol map exactly once, sharing the in-flight request across
 * callers. On failure, falls back to the persisted copy so symbols stay
 * available offline/after a failed fetch.
 */
export function fetchSymbology() {
  if (cache) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const res = await fetch(SYMBOLOGY_URL);
    if (!res.ok) throw new Error(`symbology fetch failed: HTTP ${res.status}`);
    const map = buildMap((await res.json()).data);
    cache = map;
    await cacheSymbols(map);
    return cache;
  })().catch(async (err) => {
    inFlight = null; // allow retry after a real failure
    const persisted = await getCachedSymbols();
    if (persisted?.size) {
      cache = persisted;
      return cache;
    }
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