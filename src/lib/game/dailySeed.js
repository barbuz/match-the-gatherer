/** UTC date → deterministic daily card selection (spec §5). */

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
