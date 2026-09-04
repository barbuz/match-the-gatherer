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
 * Reroll through the name list, drawing a fresh index via `pickIndex(attempt)`
 * until a vintage-legal (and non-reprint) card is found. Each attempt
 * seeds an independent candidate (the attempt number is part of the hash), so
 * every legal card has equal selection probability instead of sliding forward's
 * bias toward cards following long illegal runs. Determinism is preserved for
 * the daily path because the same date produces the same attempt index sequence..
 *
 * @param {string[]} names full card-name list.
 * @param {(attempt: number) => number} pickIndex candidate index for each
 *   attempt (0-based within `names`。
 * @param {(name: string) => Promise<object|null>} fetchCard card lookup,
 *   defaulting to the Scryfall exact-name fetch。
 * @returns {Promise<object|undefined>} The resolved card,, or undefined after
 *   100 attempts when nothing legal was found．
 */
export async function resolveVintageLegalCard(names, pickIndex, fetchCard = fetchCardByName) {
  if (!Array.isArray(names) || names.length === 0) return undefined;
  for (let attempt =0; attempt < 100; attempt++) {
    const idx = pickIndex(attempt);
    if (!Number.isInteger(idx) || idx < 0 || idx >= names.length) continue;
    const card = await fetchCard(names[idx]);
    if (card && isVintageLegal(card)) return card;
  }
  return undefined;
}
/**
 * Resolve the daily target card for a UTC date, re-rolling through the name
 * list until a vintage-legal (and non-reprint) card is found. Each
 * attempt seeds a fresh index from the date key + attempt number,, so the
 * result is deterministic for every player on the same date (and uniform over
 * legal cards when several attempts are needed)..
 *
 * @param {string[]} names full card-name list．
 * @param {(name: string) => Promise<object|null>} fetchCard card lookup,
 *   defaulting to the Scryfall exact-name fetch．
 * @param {Date|string} [date] The UTC date (defaults to now), as accepted
 *   by `utcDateKey`．
 * @returns {Promise<object|undefined>} The resolved card,, or undefined after
 *   100 attempts when nothing legal was found．
 */
export async function resolveDailyTargetCard(names, fetchCard = fetchCardByName, date = new Date()) {

  const key = utcDateKey(date);
  return resolveVintageLegalCard(names, (attempt) => {
    const idx = dailyIndex(`${key}:${attempt}`, names.length);
    if (idx === -1) return -1;
    return idx;
  }, fetchCard);
}
