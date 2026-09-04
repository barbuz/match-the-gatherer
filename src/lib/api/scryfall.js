const API_BASE = 'https://api.scryfall.com';

/** Vintage allows these two legality values (1-of restricted cards are playable). */
export const VINTAGE_LEGAL = new Set(['legal', 'restricted']);

/** True when the card's resolved printing is vintage-legal and nota reprint. */
export function isVintageLegal(card) {
  return VINTAGE_LEGAL.has(card?.legalities?.vintage) && !card?.reprint;
}

/**
 * Fetch a card by exact name, first printing only (spec §4.1).
 * The exact-name operator also matches individual face names (e.g. the back
 * face of a modal DFC), so prefer a whole-card name match when possible.

 *
 * `not:reprint` keeps only the oldest printing of each name, so the card
 * object represents the same printing that hints narrow toward..
 */
export async function fetchCardByName(name) {
  const q = encodeURIComponent(`!"${name}" not:reprint`);
  const res = await fetch(`${API_BASE}/cards/search?q=${q}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Scryfall search failed: HTTP ${res.status}`);
  const json = await res.json();
  const cards = json.data ?? [];
  const lower = name.trim().toLowerCase();
  return (
    cards.find((c) => c.name.toLowerCase() === lower) ??
    cards.find((c) => (c.card_faces ?? []).some((f) => f.name?.toLowerCase() === lower)) ??
    cards[0] ??
    null
  );
}
