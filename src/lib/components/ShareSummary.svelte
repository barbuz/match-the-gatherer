<script>
  /** Emoji-bar share summary + copy to clipboard (spec §11). */
  import { formatShareText, shareSummary } from '../game/scoring.js';

  export let guesses = []; // [{ card, results }]
  export let dayKey = '';
  export let label = '';
  export let hintsUsed = [];
  export let targetCard = null;
  export let hintCounts = {};
  /** Pre-known clues (the day's revealed type-line word), so the row markers
   * agree with the board's mistake flags. See `game/reveal.js`. */
  export let baseHints = [];
  /** Still-matching count after the final guess (1 on a win), scored from the
   * hint set built from every guess; overrides the last row's stored count so
   * the summary reflects the fully-constrained search. */
  export let revealCount = null;

  let copied = false;
  /** Checkbox beside the copy button: the on-screen header is always a link, but
   * the copied markdown can drop it (a plain title reads better in some chats). */
  let includeLink = true;

  $: url = typeof location !== 'undefined' ? location.origin + location.pathname : '';
  // The last row ends the game, so its count is the fully-constrained one.
  $: finalCounts =
    revealCount != null && guesses.length > 0
      ? { ...hintCounts, [guesses.length - 1]: revealCount }
      : hintCounts;
  $: summary = shareSummary({
    dayKey: dayKey || label,
    guesses,
    url,
    hintsUsed,
    targetCard,
    hintCounts: finalCounts,
    baseHints,
  });
  $: shareText = formatShareText(summary, { includeLink });

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = shareText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="share">
  <p class="share-header">
    {#if summary.url}
      <a href={summary.url}>{summary.title}</a>
    {:else}
      {summary.title}
    {/if}
  </p>
  <div class="share-rows" aria-label="Share result">
    {#each summary.rows as row}
      <p class="share-row">{row}</p>
    {/each}
  </div>
  <div class="share-actions">
    <label class="include-link">
      <input type="checkbox" bind:checked={includeLink} />
      Include link
    </label>
    <button class="copy" on:click={copy}>{copied ? '✓ Copied' : 'Copy result'}</button>
  </div>
</div>

<style>
  .share {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    margin: 1rem 0;
    text-align: center;
  }
  .share-header {
    margin: 0 0 0.15rem;
    font-size: 0.9rem;
  }
  .share-header a {
    color: var(--accent);
  }
  /* Rows are left-aligned inside a block that is itself centered, so a row with a
     hint marker does not sit off-centre from the bars above it. */
  .share-rows {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    text-align: left;
  }
  .share-row {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.3;
    white-space: nowrap;
  }
  .share-actions {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.4rem;
  }
  .include-link {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .include-link input {
    margin: 0;
    cursor: pointer;
  }
  .copy {
    padding: 0.4rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--accent);
    color: var(--accent-ink);
    cursor: pointer;
  }
</style>
