import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dbGet, dbSet } from '../src/lib/storage/db.js';
import { createGame } from '../src/lib/game/gameState.js';
import { reportDailyResult, fetchDailyStats } from '../src/lib/api/statsApi.js';

vi.mock('../src/lib/storage/db.js', () => ({
  dbGet: vi.fn(),
  dbSet: vi.fn(),
}));

vi.mock('../src/lib/api/statsApi.js', () => ({
  reportDailyResult: vi.fn(),
  fetchDailyStats: vi.fn(),
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

describe('createGame — daily result reporting', () => {
  beforeEach(() => {
    dbGet.mockReset();
    dbSet.mockReset();
    reportDailyResult.mockReset();
    fetchDailyStats.mockReset();
  });

  it('reports a win once, with the guess and hint counts', async () => {
    reportDailyResult.mockResolvedValue({ date: DAY, won: 1, byGuesses: {} });
    const g = dailyGame();
    await g.addGuess(GUESS);
    g.markHintUsed();
    await g.addGuess({ card: { name: TARGET.name, oracle_id: TARGET.oracle_id }, results: [] });

    expect(reportDailyResult).toHaveBeenCalledTimes(1);
    expect(reportDailyResult).toHaveBeenCalledWith({
      date: DAY,
      outcome: 'won',
      guesses: 2,
      hintsUsed: 1,
    });
    let s;
    g.subscribe((v) => (s = v));
    expect(s.communityStats).toEqual({ date: DAY, won: 1, byGuesses: {} });
  });

  it('reports a loss after the tenth guess', async () => {
    reportDailyResult.mockResolvedValue({ date: DAY, won: 0 });
    const g = dailyGame();
    for (let i = 0; i < 10; i++) {
      await g.addGuess({ card: { name: `Card ${i}`, oracle_id: `o${i}` }, results: [] });
    }
    expect(reportDailyResult).toHaveBeenCalledTimes(1);
    expect(reportDailyResult).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'lost', guesses: 10 }),
    );
  });

  it('does not report a free-mode game', async () => {
    const g = createGame({ mode: 'free', dayKey: null, targetName: TARGET.name, targetCard: TARGET });
    await g.addGuess(GUESS);
    await g.addGuess({ card: { name: TARGET.name, oracle_id: TARGET.oracle_id }, results: [] });
    expect(reportDailyResult).not.toHaveBeenCalled();
  });

  it('reports a restored concluded game, but not a restored in-progress one', async () => {
    reportDailyResult.mockResolvedValue({ date: DAY, won: 1 });

    dbGet.mockResolvedValue({
      targetName: TARGET.name,
      guesses: [GUESS],
      hintsUsed: [],
      status: 'won',
    });
    const concluded = dailyGame();
    await concluded.load();
    await concluded.reportIfConcluded();
    expect(reportDailyResult).toHaveBeenCalledWith(
      expect.objectContaining({ date: DAY, outcome: 'won', guesses: 1 }),
    );

    reportDailyResult.mockClear();
    dbGet.mockResolvedValue({
      targetName: TARGET.name,
      guesses: [GUESS],
      hintsUsed: [],
      status: 'playing',
    });
    const inProgress = dailyGame();
    await inProgress.load();
    await inProgress.reportIfConcluded();
    expect(reportDailyResult).not.toHaveBeenCalled();
  });

  it('does not re-POST a concluded game whose aggregates are already stored, refreshing via GET instead', async () => {
    // Spec §1.1 budgets 2 requests/player/day, so a reload of a finished day
    // must not spend another counted POST — it reads the aggregates back from
    // the shared-cached read route (backend spec §4.4) to show fresh numbers.
    const stored = { date: DAY, won: 1, byGuesses: {} };
    const fresh = { date: DAY, won: 5, byGuesses: { '3': { plain: 2, hint: 0 } } };
    dbGet.mockResolvedValue({
      targetName: TARGET.name,
      guesses: [GUESS],
      hintsUsed: [],
      status: 'won',
      communityStats: stored,
    });
    fetchDailyStats.mockResolvedValue(fresh);

    const g = dailyGame();
    await g.load();
    await g.reportIfConcluded();

    expect(reportDailyResult).not.toHaveBeenCalled();
    expect(fetchDailyStats).toHaveBeenCalledWith(DAY);
    let s;
    g.subscribe((v) => (s = v));
    expect(s.communityStats).toEqual(fresh);
  });

  it('keeps the stored aggregates when the refresh read fails', async () => {
    const stored = { date: DAY, won: 1, byGuesses: {} };
    dbGet.mockResolvedValue({
      targetName: TARGET.name,
      guesses: [GUESS],
      hintsUsed: [],
      status: 'won',
      communityStats: stored,
    });
    fetchDailyStats.mockResolvedValue(null);

    const g = dailyGame();
    await g.load();
    await g.reportIfConcluded();

    let s;
    g.subscribe((v) => (s = v));
    expect(s.communityStats).toEqual(stored);
  });

  it('persists the returned aggregates so a later reload skips the sink', async () => {
    reportDailyResult.mockResolvedValue({ date: DAY, won: 1 });
    const g = dailyGame();
    await g.addGuess({ card: { name: TARGET.name, oracle_id: TARGET.oracle_id }, results: [] });

    const lastWrite = dbSet.mock.calls.at(-1)[1];
    expect(lastWrite.communityStats).toEqual({ date: DAY, won: 1 });
  });
});
