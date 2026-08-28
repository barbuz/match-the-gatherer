import { describe, it, expect } from 'vitest';
import { createGame } from '../src/lib/game/gameState.js';

const TARGET = { name: 'Grizzly Bears', oracle_id: 'abc' };

describe('createGame.load', () => {
  it('starts fresh when no persisted game exists', async () => {
    const g = createGame({ mode: 'free', dayKey: null, targetName: 'X', targetCard: TARGET });
    let s;
    g.subscribe((v) => (s = v));
    await g.load();
    expect(s.loaded).toBe(true);
    expect(s.guesses).toEqual([]);
  });

  it('makes the board playable even when storage never settles', async () => {
    // Simulate a sandboxed/background iframe where the IndexedDB read never
    // resolves: stub idb-keyval's backing store with a get() that hangs.
    globalThis.indexedDB = {
      open: () => new Promise(() => {}), // never settles
    };
    const g = createGame({ mode: 'daily', dayKey: '2026-08-27', targetName: 'Grizzly Bears', targetCard: TARGET });
    let s;
    g.subscribe((v) => (s = v));
    // load() marks the board playable immediately; the background read may
    // hang forever without blocking readiness.
    const p = g.load();
    expect(s.loaded).toBe(true);
    // Give the microtask a chance to run, then confirm we never blocked.
    await Promise.resolve();
    expect(s.loaded).toBe(true);
    // Don't await p — the storage read never settles by design here.
    p.catch(() => {});
  });
});