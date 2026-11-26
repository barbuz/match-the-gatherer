/**
 * End-of-game heading copy (spec §11).
 *
 * The copy is picked from the player's own record — guesses taken, hints used
 * and contradicted clues (mistakes) — with a separate ladder per combination so
 * an assisted solve reads differently from a clean one. Losses get a short
 * consolation chosen from the same signals. Nothing here reveals the target.
 *
 * Pure and DOM-free so it runs under node in the unit tests.
 */

const CLEAN = [
  'Lucky guess.',
  'Peerless.',
  'Sharp.',
  'Clean sweep.',
  'Clutch.',
  'Last-guess hero.',
];

const MISTAKES_ONLY = [
  'This should be impossible',
  'Almost perfect.',
  'Impressive.',
  'Well done.',
  'You know your cards.',
  'You need no hint.',
];

const HINTS_ONLY = [
  'Bullseye.',
  'Quick.',
  'Neat.',
  'Precisely.',
  "Never didn't have it.",
  'Slow and steady.',
];

const HINTS_AND_MISTAKES = [
  'Impossible',
  'Found it fast.',
  'There it is.',
  'You got there.',
  'Down to the wire.',
  'Just in time.',
];

function solveMessage(ladder, attempts, maxGuesses) {
  if (attempts >= maxGuesses) return ladder[ladder.length - 1];
  return ladder[attempts - 1] ?? ladder[ladder.length - 1];
}

/**
 * @param {{
 *   status?: 'playing' | 'won' | 'lost',
 *   guesses?: number,
 *   mistakes?: number,
 *   hintsUsed?: number,
 *   maxGuesses?: number,
 * }} game
 * @returns {string} the heading to render, or '' while the game is still on.
 */
export function endgameMessage({
  status,
  guesses = 0,
  mistakes = 0,
  hintsUsed = 0,
  maxGuesses = 6,
} = {}) {
  if (status === 'lost') {
    if (mistakes === 0) return 'Unlucky.';
    if (hintsUsed === 0) return 'Need a hint?';
    return 'Better luck next time.';
  }
  if (status !== 'won') return '';

  const attempts = Math.max(1, guesses);
  if (hintsUsed > 0 && mistakes > 0) {
    return solveMessage(HINTS_AND_MISTAKES, attempts, maxGuesses);
  }
  if (hintsUsed > 0) return solveMessage(HINTS_ONLY, attempts, maxGuesses);
  if (mistakes > 0) return solveMessage(MISTAKES_ONLY, attempts, maxGuesses);
  return solveMessage(CLEAN, attempts, maxGuesses);
}
