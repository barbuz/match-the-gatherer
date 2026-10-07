const CARD_NAMES_URL = 'https://api.scryfall.com/catalog/card-names';

// This download gates the whole board, so a request that never settles would
// leave it stuck on "Loading game…" forever. Fail instead, so the cached list
// (or the retry state) can take over.
const REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the full card-name catalog (spec §4.2). Alchemy-only "A-" cards are
 * filtered out since they were never printed in paper.
 */
export async function fetchCardNames() {
  const res = await fetchWithTimeout(CARD_NAMES_URL);
  if (!res.ok) throw new Error(`card-names fetch failed: HTTP ${res.status}`);
  const json = await res.json();
  return (json.data ?? []).filter((n) => !n.startsWith('A-'));
}
