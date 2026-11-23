<script>
  /**
   * The day's pre-revealed clue (spec §3, backend spec §3.7), shown above the
   * guess input for the whole daily game, naming one type-line word.
   *
   * It is a real clue, not decoration — the Hint link and the match count
   * include it, and a guess that lacks the word counts as a mistake (see
   * `game/reveal.js`, `game/consistency.js`).
   */
  import { revealParts } from '../game/reveal.js';

  /** `{ property, value }` from the daily answer, or null (free mode). */
  export let reveal = null;

  $: parts = revealParts(reveal);
</script>

{#if parts}
  <div class="reveal" role="note">
    <p class="text">
      {parts.lead} {parts.article} <strong class="word">{parts.value}</strong>
    </p>
  </div>
{/if}

<style>
  .reveal {
    margin: 0.25rem 0 0.75rem;
    text-align: center;
  }
  .text {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.35;
  }
  .word {
    color: var(--accent);
    font-weight: 700;
    font-size: 1.15em;
  }
</style>
