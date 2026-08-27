/**
 * Singleton background download of card names (spec §4.2/§4.3).
 *
 * The in-flight promise is created once at module scope and shared across
 * routes, so navigating into a game never interrupts a running download.
 */
import { writable } from 'svelte/store';
import { fetchCardNames } from '../api/cardNames.js';
import { fetchSymbology, getCachedSymbols } from '../api/symbology.js';
import { getCachedNames, setCachedNames } from '../storage/dataCache.js';

export const dataStatus = writable({ phase: 'idle', detail: '' });

let inFlight = null;

async function loadNames() {
  try {
    const names = await fetchCardNames();
    setCachedNames(names);
    return names;
  } catch (err) {
    const cache = await getCachedNames();
    if (cache?.names?.length) return cache.names;
    throw err;
  }
}

/**
 * Load the symbol map. Unlike names, symbols are optional — a failure here
 * falls back to the persisted copy (or ascii placeholders), never blocking
 * the game from starting.
 */
async function loadSymbols() {
  try {
    return await fetchSymbology();
  } catch (err) {
    const persisted = await getCachedSymbols();
    return persisted?.size ? persisted : null;
  }
}

export function ensureData() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    dataStatus.set({ phase: 'loading', detail: 'Loading card data…' });
    const [names, symbols] = await Promise.all([loadNames(), loadSymbols()]);
    dataStatus.set({ phase: 'ready', detail: '' });
    return { names, symbols };
  })().catch((err) => {
    inFlight = null; // allow retry after a real failure
    dataStatus.set({ phase: 'error', detail: String(err?.message ?? err) });
    throw err;
  });
  return inFlight;
}
