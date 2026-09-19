import { writable } from 'svelte/store';
import { dbGet, dbSet } from '../storage/db.js';
import { recordDailyResult } from '../storage/statsStore.js';
import { reportDailyResult, fetchDailyStats } from '../api/statsApi.js';

export const MAX_GUESSES = 10;

/**
 * Game-state store: guesses, remaining attempts, win/loss (spec §2, §10).
 * Daily games are persisted per UTC day so a mid-game tab close resumes
 * exactly where the player left off (§8). Free-mode games are kept in
 * memory only and never touch stats (§9).
 */
export function createGame({ mode, dayKey, targetName, targetCard }) {
  const storageKey = mode === 'daily' ? `mtg:game:${dayKey}` : null;
  const initial = {
    targetName,
    guesses: [],
    hintsUsed: [],
    status: 'playing',
    loaded: !storageKey,
    communityStats: null,
  };
  const { subscribe, set, update } = writable(initial);

  async function persist(state) {
    if (!storageKey) return;
    await dbSet(storageKey, {
      targetName: state.targetName,
      guesses: state.guesses,
      hintsUsed: state.hintsUsed,
      status: state.status,
      // Kept so a reload of a concluded game doesn't re-POST: the day's
      // aggregates are already here (backend spec §1.1 targets 2 requests/day).
      communityStats: state.communityStats,
    });
  }

  return {
    subscribe,

    /** Load any persisted in-progress daily game. Resolves once loading finished. */
    async load() {
      if (!storageKey) return;
      const saved = await dbGet(storageKey);
      if (saved && saved.targetName === targetName && Array.isArray(saved.guesses)) {
        set({
          targetName,
          guesses: saved.guesses,
          hintsUsed: Array.isArray(saved.hintsUsed) ? saved.hintsUsed : [],
          status: saved.status ?? 'playing',
          loaded: true,
          communityStats: saved.communityStats ?? null,
        });
      } else {
        update((s) => ({ ...s, loaded: true }));
      }
    },

    /**
     * Add a guess. `entry` is { card, results } where results comes from
     * compareCards(). A daily result is recorded to stats exactly once the
     * game concludes.
     */
    async addGuess(entry) {
      let concluded = null;
      update((s) => {
        if (s.status !== 'playing') return s;
        if (s.guesses.some((g) => g.card.name === entry.card.name)) return s;
        const guesses = [...s.guesses, entry];
        const won = entry.card.oracle_id && entry.card.oracle_id === targetCard?.oracle_id;
        const status = won ? 'won' : guesses.length >= MAX_GUESSES ? 'lost' : 'playing';
        const next = { ...s, guesses, status };
        if (status !== 'playing') {
          concluded = {
            dayKey: dayKey,
            won: status === 'won',
            guesses: guesses.length,
            hintsUsed: s.hintsUsed?.length ?? 0,
          };
        }
        persist(next);
        return next;
      });
      if (concluded && mode === 'daily') {
        await recordDailyResult(concluded.dayKey, concluded.won);
        const communityStats = await reportDailyResult({
          date: concluded.dayKey,
          outcome: concluded.won ? 'won' : 'lost',
          guesses: concluded.guesses,
          hintsUsed: concluded.hintsUsed,
        });
        update((s) => {
          if (s.status === 'playing' || !communityStats) return s;
          const next = { ...s, communityStats };
          persist(next);
          return next;
        });
      }
    },

    /**
     * Bring a concluded game's community aggregates up to date on load.
     *
     * A concluded game restored from storage whose aggregates never arrived
     * (the sink was down, or the tab closed before the response) is re-POSTed:
     * the report is idempotent server-side — a `(date, deviceId)` pair counts
     * once (§4.1) — so this only fills the gap. When the aggregates are already
     * stored, a reload must not spend another counted `POST`; it refreshes them
     * with the read-only `GET /api/stats/<date>` (backend spec §4.4), whose
     * 60-second shared cache keeps reloads off D1.
     */
    async reportIfConcluded() {
      if (mode !== 'daily') return;
      let concluded = null;
      let refresh = false;
      update((s) => {
        if (s.status === 'playing') return s;
        refresh = !!s.communityStats;
        concluded = {
          dayKey: dayKey,
          won: s.status === 'won',
          guesses: s.guesses.length,
          hintsUsed: s.hintsUsed?.length ?? 0,
        };
        return s;
      });
      if (!concluded) return;
      const communityStats = refresh
        ? await fetchDailyStats(concluded.dayKey)
        : await reportDailyResult({
            date: concluded.dayKey,
            outcome: concluded.won ? 'won' : 'lost',
            guesses: concluded.guesses,
            hintsUsed: concluded.hintsUsed,
          });
      if (!communityStats) return;
      update((s) => {
        if (s.status === 'playing') return s;
        const next = { ...s, communityStats };
        persist(next);
        return next;
      });
    },

    /** Record that a hint was used after the guess at `guessIndex` (persisted for reloads. */
    markHintUsed() {
      update((s) => {
        if (s.status !== 'playing') return s;
        const guessIndex = s.guesses.length - 1;
        if (guessIndex < 0 || s.hintsUsed.includes(guessIndex)) return s;
        const next = { ...s, hintsUsed: [...s.hintsUsed, guessIndex] };
        persist(next);
        return next;
      });
    },
  };
}
