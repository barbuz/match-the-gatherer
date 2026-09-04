/** UTC date → deterministic daily card selection (spec §5). */
import { fetchCardByName, isVintageLegal } from '../api/scryfall.js';

/** 'YYYY-MM-DD' for the given instant, in UTC (date only, no time). */
export function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

/** FNV-1a 32-bit hash of the date key, used as the daily seed. */
export function seedFromDateKey(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic index into the card-name list for a given UTC date key. */
export function dailyIndex(key, count) {
  if (!Number.isInteger(count) || count <= 0) return -1;
  return seedFromDateKey(key) % count;
}

/** Pick the daily card name from the (filtered) name list. */
export function pickDailyCardName(names, date = new Date()) {
  const idx = dailyIndex(utcDateKey(date), names.length);
  return idx === -1 ? undefined : names[idx];
}

/**
 * Reroll forward through the name list, circularly from `start`, fetching
 * each name until a vintage-legal (and non-reprint) card is found..
 * Returns undefined when no name resolves to a legal card (or when the
 * inputs are invalid.. The reroll steps forward within the list, so the
 * result is deterministic for a given start index — shared by the daily
 * seed and free-mode random start..
 *
 * @param {string[]} names full card-name list, iterated circularly.
 * @param {number} start starting index into `names` (the first candidate.
 * @param {(name: string) => Promise<object|null>} fetchCard card lookup,
 *   defaulting to the Scryfall exact-name fetch.
 * @returns {Promise<object|undefined>} The resolved card,, or undefined when
 *   no name resolves to a vintage-legal card.
 */
export async function resolveVintageLegalCard(names, start, fetchCard = fetchCardByName) {
  if (!Number.isInteger(start) || start < 0 || start >= names.length) return undefined;
  for (let i = 0; i < names.length; i++) {
    const card = await fetchCard(names[(start + i) % names.length]);
    if (card && isVintageLegal(card)) return card;
  }
  return undefined;
}

/**
 * Resolve the daily target card for a UTC date,, re-rolling forward through
 * the name list until a vintage-legal (and non-reprint) card is found..
 * The walk starts at the deterministic daily seed index,, so same inputs
 * (names,, date) always yield the same target for every player..
 *
 * @param {string[]} names full card-name list,, iterated circularly.
 * @param {(name: string) => Promise<object|null>} fetchCard card lookup,
 *   defaulting to the Scryfall exact-name fetch.
 * @param {Date|string} [date] The UTC date (defaults to now),, as accepted
 *   by `utcDateKey`..
 * @returns {Promise<object|undefined>} The resolved card,, or undefined when
 *   no name in the list resolves to a vintage-legal card..
 */
export async function resolveDailyTargetCard(names, fetchCard = fetchCardByName, date = new Date()) {
  const key = utcDateKey(date);
  const start = dailyIndex(key, names.length);
  if (start === -1) return undefined;
  return resolveVintageLegalCard(names, start, fetchCard);
}
