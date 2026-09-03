import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbGet, dbSet } from '../src/lib/storage/db.js';
import { createGame } from '../src/lib/game/gameState.js';

vi.mock('../src/lib/storage/db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
}));

const TARGET = { name: 'Grizzly Bears', oracle_id: 'abc' };
const DAY = '2026-09-03';
const GUESS = { card: { name: 'Elvish Mystic' }, results: [] };

function dailyGame(targetName = TARGET.name) {
  return createGame({ mode: 'daily', dayKey: DAY, targetName, targetCard: TARGET });
}

describe('createGame.load', () => {
  beforeEach(() => {
    dbGet.mockReset();
    dbSet.mockReset();
  });

  it('starts fresh when no persisted game exists', async () => {
    const g = createGame({ mode: 'free', dayKey: null, targetName: 'X', targetCard: TARGET });
    let s;
    g.subscribe((v) => (s = v));
    await g.load();
    expect(s.loaded).toBe(true);
    expect(s.guesses).toEqual([]);
  });


  it('restores hintsUsed from a persisted daily game', async () => {
    dbGet.mockResolvedValue({
      targetName: TARGET.name,
      guesses: [GUESS],
      hintsUsed: [0],
      status: 'won',
    });
    const g = dailyGame();
    let s;
    g.subscribe((v) => (s = v));
    await g.load();
    expect(s.guesses).toEqual([GUESS]);
    expect(s.hintsUsed).toEqual([0]);
    expect(s.status).toBe('won');
  });


  it('defaults hintsUsed to [] for legacy saved games without the field', async () => {
    dbGet.mockResolvedValue({
      targetName: TARGET.name,
      guesses: [GUESS],
      status: 'playing',
    });
    const g = dailyGame();
    let s;
    g.subscribe((v) => (s = v));
    await g.load();
    expect(s.hintsUsed).toEqual([]);
  });
});

describe('createGame.addGuess/markHintUsed', () => {
  beforeEach(() => {
    dbGet.mockReset();
    dbSet.mockReset();
  });


  it('persists hintsUsed alongside guesses', async () => {
    const g = dailyGame();
    await g.addGuess(GUESS);
    expect(dbSet).toHaveBeenLastCalledWith(
      `mtg:game:${DAY}`,
      expect.objectContaining({ guesses: [GUESS], hintsUsed: [], status: 'playing' }),
    );
    g.markHintUsed();
    expect(dbSet).toHaveBeenLastCalledWith(
      `mtg:game:${DAY}`,
      expect.objectContaining({ guesses: [GUESS], hintsUsed: [0], status: 'playing' }),
    );
  });


  it('marks the latest guess index and dedupes repeated presses', async () => {
    const g = dailyGame();
    await g.addGuess(GUESS);
    g.markHintUsed();
    g.markHintUsed();
    let s;
    g.subscribe((v) => (s = v));
    expect(s.hintsUsed).toEqual([0]);
  });


  it('ignores hint presses when no guess exists yet', async () => {
    const g = dailyGame();
    g.markHintUsed();
    expect(dbSet).not.toHaveBeenCalled();
  });


  it('ignores hint presses once the game has concluded', async () => {
    dbGet.mockResolvedValue({
      targetName: TARGET.name,
      guesses: [GUESS],
      hintsUsed: [0],
      status: 'won',
    });
    const g = dailyGame();
    await g.load();
    dbSet.mockClear();
    g.markHintUsed();
    expect(dbSet).not.toHaveBeenCalled();
  });
});
