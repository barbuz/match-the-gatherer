const API_BASE = 'https://api.scryfall.com';

/** Scryfall rejects browser-less requests without a User-Agent (Node returns 400). */
const USER_AGENT = 'MatchTheGatherer/1.0 (+https://github.com/barbuz/match-the-gatherer)';

/** Scryfall emits `total_cards` as the first field of a search list. */
const TOTAL_CARDS_RE = /"total_cards"\s*:\s*(\d+)/;

/** Give up buffering a search body once this much arrives without a count. */
const MAX_HEAD_BYTES = 64 * 1024;

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

/**
 * How many cards match a search query, without downloading the matches.
 *
 * Scryfall caps a page at 175 cards and emits `total_cards` as the first
 * field of the list, so we read only the opening bytes of the body and then
 * cancel the stream. The count request transfers a few KB instead of the
 * ~100 KB a full page would, and never paginates.
 *
 * Pass an `AbortSignal` to cancel an in-flight count when the player has
 * already moved on; an aborted request rejects with the signal's reason.
 *
 * @param {string} query  raw Scryfall search query (e.g. `t:creature f:v`)
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<number>} matching-card count; 0 when nothing matches
 */
export async function countSearchResults(query, { signal } = {}) {
  const res = await fetch(`${API_BASE}/cards/search?q=${encodeURIComponent(query)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal,
  });
  // Scryfall reports an empty result set as 404, not an empty list.
  if (res.status === 404) return 0;
  if (!res.ok) throw new Error(`Scryfall search failed: HTTP ${res.status}`);

  // Read just enough to reach `total_cards`, then abort the download. Streams
  // may be absent (some environments), in which case fall back to the text.
  if (res.body?.getReader) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffered = '';
    try {
      while (buffered.length < MAX_HEAD_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        const match = buffered.match(TOTAL_CARDS_RE);
        if (match) return Number(match[1]);
      }
    } finally {
      // The body is spent either way; cancelling also releases it when the
      // signal already aborted the fetch mid-stream.
      await reader.cancel().catch(() => {});
    }
    // The stream is spent; don't touch res.text() or it throws "already read".
    throw new Error('Scryfall search response had no total_cards');
  }
  const match = (await res.text()).match(TOTAL_CARDS_RE);
  if (!match) throw new Error('Scryfall search response had no total_cards');
  return Number(match[1]);
}
