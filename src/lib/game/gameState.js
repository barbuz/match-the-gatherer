import { writable } from 'svelte/store';
import { dbGet, dbSet } from '../storage/db.js';
import { recordDailyResult } from '../storage/statsStore.js';

export const MAX_GUESSES = 10;

/**
 * Game-state store: guesses, remaining attempts, win/loss (spec §2, §10).
 * Daily games are persisted per UTC day so a mid-game tab close resumes
 * exactly where the player left off (§8). Free-mode games are kept in
 * memory only and never touch stats (§9).
 */
export function createGame({ mode, dayKey, targetName, targetCard }) {
  const storageKey = mode === 'daily' ? `mtg:game:${dayKey}` : null;
  const initial = { targetName, guesses: [], status: 'playing', loaded: !storageKey };
  const { subscribe, set, update } = writable(initial);

  async function persist(state) {
    if (!storageKey) return;
    await dbSet(storageKey, {
      targetName: state.targetName,
      guesses: state.guesses,
      status: state.status,
    });
  }

  return {
    subscribe,

    /** Load any persisted in-progress daily game. Resolves once loading finished. */
    async load() {
      if (!storageKey) return;
      const saved = await dbGet(storageKey);
      if (saved && saved.targetName === targetName && Array.isArray(saved.guesses)) {
        set({ targetName, guesses: saved.guesses, status: saved.status ?? 'playing', loaded: true });
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
        if (status !== 'playing') concluded = { dayKey, won: status === 'won' };
        persist(next);
        return next;
      });
      if (concluded && mode === 'daily') {
        await recordDailyResult(concluded.dayKey, concluded.won);
      }
    },
  };
}
