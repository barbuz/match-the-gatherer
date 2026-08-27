/** Cached card-name list (spec §4.2/4.3). */
import { dbGet, dbSet } from './db.js';

const NAMES_KEY = 'mtg:card-names';

export function getCachedNames() {
  return dbGet(NAMES_KEY); // { fetchedAt, names }
}

export function setCachedNames(names) {
  return dbSet(NAMES_KEY, { fetchedAt: new Date().toISOString(), names });
}
