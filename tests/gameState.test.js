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
});