<script>
  /**
   * Horizontal gradient bar under the Hint button showing how many cards still
   * match the gathered hints. The gradient runs the shared count-color scheme on
   * a log scale from 1 to `MAX_COUNT` (see `game/countColors.js`), so the blue
   * band is a thin tip and red fills the right. A pointer carrying the count
   * slides to the matching position, and the number visibly counts up or down to
   * the new value.
   */
  import { onDestroy } from 'svelte';
  import { logPosition, gradientStops, countColor } from '../game/countColors.js';

  /** Latest still-matching count, or null while it is still resolving. */
  export let count = null;
  /** Starting value shown before any guess (the local card-name count). */
  export let initialCount = null;
  /** True while a Scryfall count query is in flight (shows the spinner). */
  export let pending = false;

  // Gradient stops are static for a given scale; compute once.
  const stops = gradientStops();
  const gradient = `linear-gradient(90deg, ${stops
    .map(([c, p]) => `${c} ${(p * 100).toFixed(2)}%`)
    .join(', ')})`;

  // The target value: the latest count, or — while it resolves — the previous
  // one, so we never flash "???" once we have a number. Before the first count
  // it starts from the local name-list size.
  let target = null;
  $: if (count != null) {
    target = count;
  } else if (target == null && initialCount != null) {
    target = initialCount;
  }

  // The number actually painted, animated towards `target`. Drives both the
  // digits and the pointer so the two stay in lockstep.
  let animated = null;
  let shown = 0;
  let pos = 0;
  let ready = false;
  let rafId = null;

  // Restart the count animation whenever the target changes.
  $: if (target != null) animateTo(target);

  // Slide the pointer proportionally to the animated value so its movement and
  // the digits stay in lockstep (the caret follows the number, not a jump).
  $: if (ready) pos = logPosition(shown);

  function animateTo(to) {
    if (rafId) cancelAnimationFrame(rafId);
    const from = animated == null ? to : animated;
    const start = performance.now();
    const duration = 700;
    ready = true;
    const step = (now) => {
      if (from === to) {
        shown = to;
        animated = to;
        rafId = null;
        return;
      }
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      animated = Math.round(from + (to - from) * eased);
      shown = animated;
      if (t < 1) rafId = requestAnimationFrame(step);
      else {
        animated = to;
        shown = to;
        rafId = null;
      }
    };
    // Paint the starting value immediately (no flash of 0), then ease.
    shown = from;
    animated = from;
    rafId = requestAnimationFrame(step);
  }

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  $: value = ready ? shown.toLocaleString() : '…';
  $: valueColor = ready ? countColor(shown) : 'var(--muted)';
</script>

<div class="hintbar">
  <span class="label">Possible cards:</span>
  <div class="bar">
    <div class="track" style={`background: ${gradient}`}></div>
    {#if ready}
      <div class="pointer" style={`left: ${(pos * 100).toFixed(3)}%`} title={`${shown.toLocaleString()} matching cards`}>
        <span class="caret" aria-hidden="true"></span>
        <span class="value" style={`color: ${valueColor}`}>
          {value}
          {#if pending}
            <span class="spinner" role="status" aria-label="counting"></span>
          {/if}
        </span>
      </div>
    {:else}
      <span class="value pending">
        <span class="spinner" role="status" aria-label="loading"></span>
      </span>
    {/if}
  </div>
</div>

<style>
  .hintbar {
    display: flex;
    /* Align to the top so the label can be centred on the *track* (the bar
       itself), not on the whole widget including the number hanging below. */
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
    max-width: 20rem;
    margin: 0.5rem auto 0;
  }
  .label {
    flex: 0 0 auto;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    white-space: nowrap;
    /* Match the track's height so the text is vertically centred on the bar. */
    line-height: 0.55rem;
  }
  .bar {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    height: 2.1rem;
    overflow: visible;
  }
  .track {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 0.55rem;
    border-radius: 999px;
    border: 1px solid var(--border);
  }
  .pointer {
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    transform: translateX(-50%);
    /* The JS animation drives the digits; the pointer follows in step, with a
       short easing so tiny frame jitter does not read as a stutter. */
    transition: left 0.12s linear;
    white-space: nowrap;
  }
  .caret {
    width: 0;
    height: 0;
    border-left: 0.4rem solid transparent;
    border-right: 0.4rem solid transparent;
    border-top: 0.5rem solid var(--fg);
  }
  .value {
    margin-top: 0.1rem;
    font-size: 0.78rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .value.pending {
    position: absolute;
    top: 0.7rem;
    left: 50%;
    transform: translateX(-50%);
  }
  /* Small "still counting" ring shown beside the number. */
  .spinner {
    display: inline-block;
    width: 0.6rem;
    height: 0.6rem;
    margin-left: 0.3rem;
    vertical-align: -0.05em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: hintbar-spin 0.7s linear infinite;
  }
  @keyframes hintbar-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
