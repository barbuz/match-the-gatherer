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
 * `u` words that are pronounced "you-" and so take "a", not "an"
 * ("a Unicorn", but "an Urza"). Every other `u` word in the pool reads "uh-".
 */
const CONSONANTAL_U = /^(uni|eu|ubiq|use|usu|uti|ure)/;

/**
 * The indefinite article for a revealed word: "an Artifact", "a Kithkin".
 *
 * Article choice is phonetic, not spelling-based, so the vowel test is
 * qualified. Checked against the 605 distinct type-line tokens in Scryfall's
 * oracle bulk data (~24% of token occurrences need "an"):
 *
 * - `a`/`e`/`i`/`o` always take "an";
 * - `u` splits — see {@link CONSONANTAL_U};
 * - `h` always takes "a", since every H-initial token is pronounced ("a
 *   Human", "a Horror"); there is no "an hour" in the pool. A silent-h word
 *   would need adding here;
 * - anything else takes "a".
 *
 * Two known rough edges, both a handful of cards: a genuinely plural token
 * ("Creature — Elves") still takes an article, and a function word ("Lady of
 * Proper Etiquette") reads oddly at all. Fixing either needs the backend to
 * filter its candidate pool, not smarter copy here.
 * @param {string} word
 * @returns {string} 'a' or 'an'
 */
export function articleFor(word) {
  const w = String(word ?? '').trim().toLowerCase();
  if (!w) return 'a';
  const first = w[0];
  if (first === 'u') return CONSONANTAL_U.test(w) ? 'a' : 'an';
  return 'aeio'.includes(first) ? 'an' : 'a';
}

/**
 * The clue sentence broken into the parts the UI styles differently, so the
 * revealed word can be emphasised without duplicating the copy in the
 * component. Null when there is nothing to show (a response without a reveal).
 *
 * A multi-word subtype arrives split ("Time", "Lord"), so this can read "a
 * Time" — accepted, since the sentence is friendlier than a label-plus-word
 * layout for the overwhelmingly common single-word case.
 * @param {{ property: string, value: string } | null | undefined} reveal
 * @returns {{ lead: string, article: string, value: string } | null}
 */
export function revealParts(reveal) {
  const value = reveal?.value == null ? '' : String(reveal.value).trim();
  if (!value) return null;
  return { lead: 'Today we are guessing', article: articleFor(value), value };
}

/**
 * The player-facing sentence for the clue, e.g. "Today we are guessing a
 * Kithkin" / "an Artifact". Null when there is nothing to show.
 *
 * Plain-text form of the sentence, for tests and any non-markup consumer. The
 * UI renders {@link revealParts} instead so the word itself can be emphasised.
 * @param {{ property: string, value: string } | null | undefined} reveal
 * @returns {string | null}
 */
export function revealText(reveal) {
  const parts = revealParts(reveal);
  return parts ? `${parts.lead} ${parts.article} ${parts.value}` : null;
}
