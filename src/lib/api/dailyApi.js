/**
 * Daily answer client (backend spec §3).
 *
 * The daily card is server-authoritative: the backend precomputes one card per
 * UTC day so every player worldwide gets the same target. There is deliberately
 * no client-side fallback — a local pick would split players across different
 * answers on the same day (backend spec §3.5).
 */
import { utcDateKey } from '../game/dailySeed.js';
import { API_BASE } from './config.js';

const DATE_IN_URL = /\/api\/daily\/(\d{4}-\d{2}-\d{2})$/;

export class DailyApiError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DailyApiError';
  }
}

/**
 * The date the response actually describes. The backend 302s a non-today date
 * to `/api/daily/<today>`, so reading the final URL lets a clock-skewed client
 * persist the game under the day the server served.
 */
function servedDateKey(res, requested) {
  return DATE_IN_URL.exec(res.url ?? '')?.[1] ?? requested;
}

/**
 * Fetch the authoritative card for a UTC day (default: today).
 * @param {string} [dateKey] 'YYYY-MM-DD', computed fresh at game start.
 * @returns {Promise<{ card: object, dayKey: string }>}
 * @throws {DailyApiError} on network failure or a non-2xx / card-less response.
 */
export async function fetchDailyCard(dateKey = utcDateKey()) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/daily/${dateKey}`);
  } catch (err) {
    throw new DailyApiError(`couldn't reach the game server (${err?.message ?? err})`);
  }
  if (!res.ok) throw new DailyApiError(`game server responded HTTP ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch {
    throw new DailyApiError('game server returned an unreadable response');
  }
  const card = body?.card;
  if (!card?.name) throw new DailyApiError('game server returned no card for today');
  return { card, dayKey: servedDateKey(res, dateKey) };
}