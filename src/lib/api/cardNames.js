const CARD_NAMES_URL = 'https://api.scryfall.com/catalog/card-names';

/**
 * Fetch the full card-name catalog (spec §4.2). Alchemy-only "A-" cards are
 * filtered out since they were never printed in paper.
 */
export async function fetchCardNames() {
  const res = await fetch(CARD_NAMES_URL);
  if (!res.ok) throw new Error(`card-names fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  return (json.data ?? []).filter((n) => !n.startsWith('A-'));
}
