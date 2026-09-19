/**
 * Anonymous stats sink client (backend spec §4).
 *
 * Reports a concluded daily game and returns the day's aggregates so the
 * end-of-game summary can show the worldwide distribution. Reporting is
 * best-effort telemetry: a failure (offline, 400, 429) is never surfaced and
 * never blocks play (backend spec §8).
 */
import { dbGet, dbSet } from '../storage/db.js';
import { APP_VERSION } from '../version.js';
import { API_BASE } from './config.js';

const DEVICE_KEY = 'mtg:device-id';

/** RFC 4122 v4 UUID; `crypto.randomUUID` when the browser has it. */
function newDeviceId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Stable per-install device id; generated once and persisted locally. */
export async function getDeviceId() {
  const stored = await dbGet(DEVICE_KEY);
  if (stored) return stored;
  const id = newDeviceId();
  await dbSet(DEVICE_KEY, id);
  return id;
}

/**
 * Report a concluded daily game. Resolves to the day's aggregates
 * (`{ date, target, won, lost, abandoned, byGuesses }`) or null when the sink
 * is unavailable. Never throws.
 */
export async function reportDailyResult({ date, outcome, guesses, hintsUsed }) {
  try {
    const deviceId = await getDeviceId();
    const res = await fetch(`${API_BASE}/api/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        outcome,
        guesses,
        hintsUsed,
        clientVersion: APP_VERSION,
        deviceId,
      }),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/**
 * Read a concluded day's aggregates without posting a result (backend spec
 * §4.4), so reloading a finished game can show the latest worldwide
 * distribution while staying within the request budget. The response omits
 * `target` for a live day, which is fine: the summary already knows the card.
 *
 * Best-effort like the sink: a failure resolves to null and the caller keeps
 * whatever aggregates it already had. Never throws.
 */
export async function fetchDailyStats(date) {
  try {
    const res = await fetch(`${API_BASE}/api/stats/${date}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}