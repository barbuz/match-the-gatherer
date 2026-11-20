<script>
  /** Emoji-bar share summary + copy to clipboard (spec §11). */
  import { buildShareText } from '../game/scoring.js';

  export let guesses = []; // [{ card, results }]
  export let dayKey = '';
  export let label = '';
  export let hintsUsed = [];
  export let targetCard = null;
  export let hintCounts = {};
  /** Still-matching count after the final guess (1 on a win), scored from the
   * hint set built from every guess; overrides the last row's stored count so
   * the summary reflects the fully-constrained search. */
  export let revealCount = null;

  let copied = false;
  let format = 'markdown';

  $: url = typeof location !== 'undefined' ? location.origin + location.pathname : '';
  // The last row ends the game, so its count is the fully-constrained one.
  $: finalCounts =
    revealCount != null && guesses.length > 0
      ? { ...hintCounts, [guesses.length - 1]: revealCount }
      : hintCounts;
  $: shareText = buildShareText({ dayKey: dayKey || label, guesses, url, hintsUsed, targetCard, hintCounts: finalCounts, format });

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
  <pre class="share-text">{shareText}</pre>
  <div class="formats" role="group" aria-label="Share format">
    <button
      class="format"
      class:active={format === 'markdown'}
      aria-pressed={format === 'markdown'}
      on:click={() => (format = 'markdown')}
    >Markdown</button>
    <button
      class="format"
      class:active={format === 'plaintext'}
      aria-pressed={format === 'plaintext'}
      on:click={() => (format = 'plaintext')}
    >Plain text</button>
  </div>
  <button class="copy" on:click={copy}>{copied ? '✓ Copied' : 'Copy result'}</button>
</div>

<style>
  .share {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin: 1rem 0;
  }
  .share-text {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    font-size: 0.85rem;
    white-space: pre-wrap;
    word-break: break-word;
    max-width: 100%;
    margin: 0;
    text-align: left;
  }
  .formats {
    display: flex;
    gap: 0.35rem;
  }
  .format {
    padding: 0.2rem 0.65rem;
    font-size: 0.75rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: inherit;
    cursor: pointer;
  }
  .format.active {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }
  .copy {
    padding: 0.4rem 1rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--accent);
    color: #fff;
    cursor: pointer;
  }
</style>
