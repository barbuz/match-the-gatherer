<script>
  /**
   * The day's pre-revealed clue (spec §3, backend spec §3.7), shown above the
   * guess input for the whole daily game: "Today we are guessing a Goblin".
   *
   * It is a real clue, not decoration — the Hint link and the match count
   * include it, and a guess that lacks the word counts as a mistake (see
   * `game/reveal.js`, `game/consistency.js`).
   */
  import { revealText, revealLabel } from '../game/reveal.js';

  /** `{ property, value }` from the daily answer, or null (free mode). */
  export let reveal = null;

  $: text = revealText(reveal);
  $: label = revealLabel(reveal);
</script>

{#if text}
  <div class="reveal" role="note">
    <span class="tag" aria-hidden="true">Free clue</span>
    <p class="text">
      {#if label}<span class="label">{label}:</span>{/if}
      <strong>{text}</strong>
    </p>
  </div>
{/if}

<style>
  .reveal {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0.25rem 0 0.75rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 8px;
    background: var(--surface);
  }
  .tag {
    flex: 0 0 auto;
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .text {
    margin: 0;
    font-size: 0.9rem;
  }
  .label {
    color: var(--muted);
  }
</style>
