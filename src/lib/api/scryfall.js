const API_BASE = 'https://api.scryfall.com';

/**
 * Fetch a card by exact name, oldest printing (spec §4.1).
 * The exact-name operator also matches individual face names (e.g. the back
 * face of a modal DFC), so prefer a whole-card name match when possible.
 */
export async function fetchCardByName(name) {
  const q = encodeURIComponent(`!"${name}" prefer:oldest`);
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
