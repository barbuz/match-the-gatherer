/**
 * Scryfall symbol → SVG mapping, used to render mana costs as images
 * instead of their ascii placeholders (e.g. "{2}{R}").
 *
 * On page load we `fetchSymbols()` once (async, fire-and-forget): the map is
 * saved as a JSON object in localStorage and mirrored in a reactive store, so
 * `manaParts()` can resolve it synchronously for the rest of the session.
 * If the map isn't loaded yet, `manaParts()` returns nothing and the ascii
 * placeholder is shown until the download completes.
 */
import { writable } from 'svelte/store';

const SYMBOLOGY_URL = 'https://api.scryfall.com/symbology';
const SYMBOLS_KEY = 'mtg:card-symbols';

/**
 * Reactive symbol map (symbol → svg_uri). Keeping it in a store lets the UI
 * re-render as soon as the download lands. Read via `$symbols`.
 */
export const symbols = writable(null);

let map = null; // module mirror, also read synchronously by manaParts()

/** Build a Map from the raw symbology JSON array. */
function buildMap(data) {
  const m = new Map();
  for (const s of data ?? []) {
    if (s?.symbol && s?.svg_uri) m.set(s.symbol, s.svg_uri);
  }
  return m;
}

function publishSymbols(next) {
  map = next;
  symbols.set(next);
  try {
    localStorage.setItem(SYMBOLS_KEY, JSON.stringify(next ? Object.fromEntries(next) : {}));
  } catch {
    /* storage unavailable — map stays valid for this session */
  }
}

/** Load the stored map synchronously from localStorage, if present. */
function readStoredSymbols() {
  try {
    const raw = localStorage.getItem(SYMBOLS_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') return new Map(Object.entries(obj));
  } catch {
    /* malformed storage — treat as missing */
  }
  return null;
}

/** Assemble the best map currently available (module mirror, else storage). */
export function getSymbolMap() {
  if (!map) {
    const stored = readStoredSymbols();
    if (stored?.size) {
      map = stored;
      symbols.set(map);
    }
  }
  return map;
}

/**
 * Fetch the symbology list once and persist the map. Fire-and-forget: any
 * failure keeps the previous map (or none) and is never fatal.
 */
export function fetchSymbols() {
  return fetch(SYMBOLOGY_URL)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((json) => {
      const next = buildMap(json?.data);
      if (next.size) publishSymbols(next);
    })
    .catch(() => {
      // Cold start / offline: hydrate the mirror from the persisted cache.
      // No-op once the module mirror is populated, which is all we need —
      // a failed fetch has nothing newer to refresh *from*.
      getSymbolMap();
    });
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

/**
 * Render a value as a list of { token, uri } image parts when it is a pure
 * mana cost. Returns null when the value isn't mana or the symbol map isn't
 * loaded yet, in which case callers fall back to the ascii placeholder.
 */
export function manaParts(value) {
  const current = getSymbolMap();
  if (!current || !isManaCost(value)) return null;
  return tokenizeManaCost(value)
    .map((t) => ({ token: t, uri: current.get(t) }))
    .filter((p) => p.uri);
}

// Kick off the one-time download on page load. Fire-and-forget: the map is
// published to `$symbols` whenever it lands, updating any visible feedback.
fetchSymbols();