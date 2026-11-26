import { describe, it, expect } from 'vitest';
import { endgameMessage } from '../src/lib/game/endgame.js';

const won = (overrides = {}) => endgameMessage({ status: 'won', ...overrides });
const lost = (overrides = {}) => endgameMessage({ status: 'lost', ...overrides });

describe('endgameMessage', () => {
  it('says nothing while the game is still being played', () => {
    expect(endgameMessage({ status: 'playing', guesses: 2 })).toBe('');
    expect(endgameMessage()).toBe('');
  });

  describe('losses', () => {
    it('is consoling when the guesses were all consistent', () => {
      expect(lost({ mistakes: 0, hintsUsed: 0 })).toBe('Unlucky.');
      expect(lost({ mistakes: 0, hintsUsed: 2 })).toBe('Unlucky.');
    });

    it('nudges toward hints when no hint was used', () => {
      expect(lost({ mistakes: 1, hintsUsed: 0 })).toBe('Need a hint?');
      expect(lost({ mistakes: 3, hintsUsed: 0 })).toBe('Need a hint?');
    });

    it('wishes luck when both hints and mistakes were involved', () => {
      expect(lost({ mistakes: 1, hintsUsed: 1 })).toBe('Better luck next time.');
      expect(lost({ mistakes: 3, hintsUsed: 2 })).toBe('Better luck next time.');
    });
  });

  describe('clean solve (no hints, no mistakes)', () => {
    const expected = [
      'Lucky guess.',
      'Peerless.',
      'Sharp.',
      'Clean sweep.',
      'Clutch.',
      'Last-guess hero.',
    ];
    expected.forEach((message, i) => {
      it(`uses "${message}" on guess ${i + 1}`, () => {
        expect(won({ guesses: i + 1 })).toBe(message);
      });
    });
  });

  describe('some mistakes but no hints', () => {
    const expected = [
      'This should be impossible',
      'Almost perfect.',
      'Impressive.',
      'Well done.',
      'You know your cards.',
      'You need no hint.',
    ];
    expected.forEach((message, i) => {
      it(`uses "${message}" on guess ${i + 1}`, () => {
        expect(won({ guesses: i + 1, mistakes: 1 })).toBe(message);
      });
    });
  });

  describe('some hints but no mistakes', () => {
    const expected = [
      'Bullseye.',
      'Quick.',
      'Neat.',
      'Precisely.',
      "Never didn't have it.",
      'Slow and steady.',
    ];
    expected.forEach((message, i) => {
      it(`uses "${message}" on guess ${i + 1}`, () => {
        expect(won({ guesses: i + 1, hintsUsed: 1 })).toBe(message);
      });
    });
  });

  describe('hints and mistakes', () => {
    const expected = [
      'Impossible',
      'Found it fast.',
      'There it is.',
      'You got there.',
      'Down to the wire.',
      'Just in time.',
    ];
    expected.forEach((message, i) => {
      it(`uses "${message}" on guess ${i + 1}`, () => {
        expect(won({ guesses: i + 1, hintsUsed: 1, mistakes: 1 })).toBe(message);
      });
    });
  });

  it('falls back to the final rung when the guess limit changes', () => {
    expect(won({ guesses: 8, maxGuesses: 8 })).toBe('Last-guess hero.');
    expect(won({ guesses: 8, maxGuesses: 8, hintsUsed: 1 })).toBe('Slow and steady.');
  });
});
