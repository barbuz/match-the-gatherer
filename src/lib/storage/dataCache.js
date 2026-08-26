/** Cached card-name list and oracle-tag bulk data + versions (spec §4.2/4.3). */
import { dbGet, dbSet } from './db.js';

const NAMES_KEY = 'mtg:card-names';
const OTAGS_KEY = 'mtg:oracle-tags';

export function getCachedNames() {
  return dbGet(NAMES_KEY); // { fetchedAt, names }
}

export function setCachedNames(names) {
  return dbSet(NAMES_KEY, { fetchedAt: new Date().toISOString(), names });
}

export function getCachedOtags() {
  return dbGet(OTAGS_KEY); // { updatedAt, index: { [oracleId]: string[] } }
}

export function setCachedOtags(updatedAt, index) {
  return dbSet(OTAGS_KEY, { updatedAt, index });
}
