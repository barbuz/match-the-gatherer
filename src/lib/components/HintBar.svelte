<script>
  /**
   * Horizontal gradient bar under the Hint button showing how many cards still
   * match the gathered hints. The gradient runs through the shared count-color
   * scheme on a log scale (see `game/countColors.js`), and a pointer carrying
   * the count slides to the matching position whenever a new count resolves.
   */
  import { logPosition, tierCenters, countColor, TIER_COLORS } from '../game/countColors.js';

  export let count = null; // cards still matching, or null while unknown
  export let disabled = false; // true before the first guess

  // One color stop per band, at the band's center (evenly spaced on the log
  // scale), plus a deeper red at the far edge so the "> 1000" tail darkens
  // instead of sitting flat.
  const centers = tierCenters();
  const stops = TIER_COLORS.map((c, i) => `${c} ${(centers[i] * 100).toFixed(2)}%`);
  const gradient = `linear-gradient(90deg, ${stops.join(', ')}, #b03030 100%)`;

  let pos = null; // pointer position in [0, 1], or null before any count
  let lastTarget = null;

  $: target = count != null ? logPosition(count) : null;

  // First resolved count places the pointer (a freshly created element does
  // not animate); later counts transition smoothly via CSS. A null count after
  // we already have a position keeps the pointer put and just shows "???".
  $: if (target != null && target !== lastTarget) {
    lastTarget = target;
    pos = target;
  }

  $: value = count != null ? count.toLocaleString() : '???';
  $: valueColor = count != null ? countColor(count) : 'var(--muted)';
</script>

<div class="bar" class:dim={disabled}>
  <div class="track" style={`background: ${gradient}`}></div>
  {#if pos != null}
    <div class="pointer" style={`left: ${(pos * 100).toFixed(3)}%`} title={`${value} matching cards`}>
      <span class="caret" aria-hidden="true"></span>
      <span class="value" style={`color: ${valueColor}`}>{value}</span>
    </div>
  {:else if !disabled}
    <span class="value pending" style="color: var(--muted)">???</span>
  {/if}
</div>

<style>
  .bar {
    position: relative;
    width: 100%;
    max-width: 20rem;
    height: 2.1rem;
    margin: 0.5rem auto 0;
    overflow: visible;
  }
  .bar.dim {
    opacity: 0.35;
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
    transition: left 1s ease;
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
    font-weight: 600;
  }
</style>
