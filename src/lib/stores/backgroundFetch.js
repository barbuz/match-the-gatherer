/**
 * Singleton background download of card names + oracle tags (spec §4.3/§8).
 *
 * The in-flight promise is created once at module scope and shared across
 * routes, so navigating into a game never interrupts a running download.
 */
import { writable } from 'svelte/store';
import { fetchCardNames } from '../api/cardNames.js';
import { fetchOracleTagMetadata, fetchOracleTagIndex } from '../api/oracleTags.js';
import { getCachedNames, setCachedNames, getCachedOtags, setCachedOtags } from '../storage/dataCache.js';

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

async function loadOtags() {
  try {
    const meta = await fetchOracleTagMetadata();
    const cache = await getCachedOtags();
    if (cache && cache.updatedAt === meta.updated_at && cache.index) {
      return new Map(Object.entries(cache.index));
    }
    dataStatus.set({ phase: 'loading', detail: 'Updating oracle tags…' });
    const index = await fetchOracleTagIndex(meta);
    await setCachedOtags(meta.updated_at, Object.fromEntries(index));
    return index;
  } catch {
    // Oracle tags enrich feedback but the game is playable without them.
    const cache = await getCachedOtags();
    if (cache?.index) return new Map(Object.entries(cache.index));
    return new Map();
  }
}

export function ensureData() {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    dataStatus.set({ phase: 'loading', detail: 'Loading card data…' });
    const [names, otags] = await Promise.all([loadNames(), loadOtags()]);
    dataStatus.set({ phase: 'ready', detail: '' });
    return { names, otags };
  })().catch((err) => {
    inFlight = null; // allow retry after a real failure
    dataStatus.set({ phase: 'error', detail: String(err?.message ?? err) });
    throw err;
  });
  return inFlight;
}
