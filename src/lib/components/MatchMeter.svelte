<script>
  /** Six-block heat meter shown in each guess's feedback header. */
  import { MATCH_LEVELS, levelDescription, levelLabel } from '../game/scoring.js';

  export let level = 1;

  $: safe = Math.max(0, Math.min(MATCH_LEVELS, Number(level) || 0));
  $: label = levelLabel(safe);
  $: title = `${label} — ${levelDescription(safe)}`;
</script>

<span class="match-meter" role="img" aria-label={title} {title}>
  <span class="blocks" aria-hidden="true">
    {#each Array.from({ length: MATCH_LEVELS }, (_, i) => i) as i (i)}
      <span class="block" class:on={i < safe}></span>
    {/each}
  </span>
  <span class="level-text" aria-hidden="true">{label}</span>
</span>

<style>
  .match-meter {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: var(--muted);
    font-family: var(--font-mono);
    font-size: 0.68rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .blocks {
    display: inline-flex;
    gap: 2px;
  }
  .block {
    width: 7px;
    height: 11px;
    border: 1px solid var(--border);
    border-radius: 2px;
    background: transparent;
  }
  .block.on {
    border-color: var(--accent);
    background: var(--accent);
  }
  .level-text {
    color: var(--fg);
  }
</style>
