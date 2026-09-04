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
 * Resolve the daily target card, re-rolling forward through the name list
 * until a vintage-legal (and non-reprint) card is found. The walk is
 * deterministic (same names[], same seed start, same fetcher → same target;
 * the reroll only shifts the pick forward within the list, so every player
 * still sees the same card each UTC date.
 */
export async function resolveDailyTargetCard(names, fetchCard = fetchCardByName, date = new Date()) {
  const key = utcDateKey(date);
  const start = dailyIndex(key, names.length);
  if (start === -1) return undefined;
  for (let i =0; i < names.length; i++) {
    const card = await fetchCard(names[(start + i) % names.length]);
    if (card && isVintageLegal(card)) return card;
  }
  return undefined;
}
