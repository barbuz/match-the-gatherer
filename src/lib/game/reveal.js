/**
 * Pre-revealed daily clue (game spec §3, backend spec §3.7).
 *
 * The backend hands the client one word of the target's type line with every
 * daily answer. That word is a *clue the player has from the very start*, not
 * just decoration, so it is modelled as a seed hint:
 *
 * - `revealHints()` turns it into the same `{ kind, value }` shape `gatherHints`
 *   produces, so the Hint link and the "Possible cards" count include it from
 *   the first guess (`t:kithkin`).
 * - `consistency.js` receives it as `baseHints`, so a guess that lacks the word
 *   contradicts a known clue and is flagged as a mistake even when it is the
 *   very first guess.
 *
 * Pure and DOM-free so it runs under node in the unit tests.
 */

/**
 * Hint kind for each reveal property. All three are type-line words, which
 * Scryfall's `t:` operator matches (`t:kithkin`, `t:legendary`), so they all
 * become positive `type` hints — the same kind the Type row emits.
 */
const HINT_KIND = {
  supertype: 'type',
  type: 'type',
  subtype: 'type',
};

/**
 * The reveal as seed hints for `gatherHints` / `analyzeGuesses`.
 * @param {{ property: string, value: string } | null | undefined} reveal
 * @returns {Array<{ kind: string, value: string, negated: boolean }>}
 */
export function revealHints(reveal) {
  const value = reveal?.value == null ? '' : String(reveal.value).trim();
  if (!value) return [];
  const kind = HINT_KIND[reveal?.property];
  if (!kind) return [];
  return [{ kind, value, negated: false }];
}

/**
 * The revealed word, quoted for display next to its property label (see
 * `revealLabel`), or null when there is nothing to show (free mode, or a
 * response without a reveal).
 *
 * Only the word is returned: it is a single printed token, so a multi-word
 * subtype arrives split ("Time", "Lord") and any sentence built around it would
 * have to guess at an article ("a Time"). The label carries the grammar.
 * @param {{ property: string, value: string } | null | undefined} reveal
 * @returns {string | null}
 */
export function revealText(reveal) {
  const value = reveal?.value == null ? '' : String(reveal.value).trim();
  return value ? `“${value}”` : null;
}

/** Short label for the clue's property ("Subtype", "Type", "Supertype"). */
export function revealLabel(reveal) {
  const p = reveal?.property;
  if (p === 'subtype') return 'Subtype';
  if (p === 'supertype') return 'Supertype';
  if (p === 'type') return 'Type';
  return null;
}
