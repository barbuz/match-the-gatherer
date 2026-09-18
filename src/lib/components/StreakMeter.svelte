<script>
  /**
   * Daily win-streak meter for the main page (spec §8). Reads the persisted
   * stats, shows the current streak as a row of flame pips plus the best run,
   * and marks the last 7 days. Read-only; renders nothing until loaded.
   */
  import { onMount } from 'svelte';
  import { getStats } from '../storage/statsStore.js';
  import { calculateStreak } from '../game/streak.js';
  import { utcDateKey } from '../game/dailySeed.js';

  const TODAY = utcDateKey();
  const HISTORY_DAYS = 7;
  // The pip row stays readable; longer runs collapse into a "+N" badge.
  const MAX_PIPS = 10;

  let stats = null;
  let metrics = null;

  onMount(async () => {
    stats = await getStats();
    metrics = calculateStreak(stats, TODAY);
  });

  $: current = metrics?.current ?? 0;
  $: pips = Math.min(current, MAX_PIPS);
  $: overflow = Math.max(0, current - MAX_PIPS);
  $: active = current > 0;
  $: history = stats ? lastDays(stats.results ?? {}, TODAY, HISTORY_DAYS) : [];

  /** `[{ key, won }]` for the `count` days ending today, oldest first. */
  function lastDays(results, today, count) {
    const end = new Date(`${today}T00:00:00Z`);
    return Array.from({ length: count }, (_, i) => {
      const day = new Date(end);
      day.setUTCDate(day.getUTCDate() - (count - 1 - i));
      const key = day.toISOString().slice(0, 10);
      return { key, won: results[key] };
    });
  }
</script>

{#if metrics}
  <section class="streak" class:active aria-label="Daily win streak">
    <div class="flames" aria-hidden="true">
      {#each Array(pips) as _}
        <span class="pip on">🔥</span>
      {/each}
      {#if !active}
        <span class="pip off">🔥</span>
      {/if}
      {#if overflow > 0}
        <span class="more">+{overflow}</span>
      {/if}
    </div>

    <p class="readout">
      <span class="current"><strong>{current}</strong> day{current === 1 ? '' : 's'} streak</span>
      <span class="best">Best {metrics.best}</span>
    </p>

    <p class="nudge">
      {#if metrics.playedToday}
        {#if active}
          Today is in the books — keep it rolling tomorrow.
        {:else}
          Streak broken. A new one starts tomorrow.
        {/if}
      {:else}
        Play today's game to keep it alive.
      {/if}
    </p>

    <div class="history" aria-label="Last 7 days">
      {#each history as day}
        <span
          class="day"
          class:win={day.won === true}
          class:loss={day.won === false}
          title={day.key}
        ></span>
      {/each}
    </div>
  </section>
{/if}

<style>
  .streak {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }
  .streak.active {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .flames {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    font-size: 1.2rem;
    line-height: 1;
  }
  .pip.off {
    opacity: 0.3;
    filter: grayscale(1);
  }
  .more {
    margin-left: 0.2rem;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .readout {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    margin: 0;
  }
  .current {
    font-size: 0.95rem;
  }
  .current strong {
    font-size: 1.4rem;
  }
  .best {
    font-size: 0.7rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .nudge {
    margin: 0;
    font-size: 0.75rem;
    color: var(--muted);
  }
  .history {
    display: flex;
    gap: 0.3rem;
    margin-top: 0.2rem;
  }
  .day {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: var(--border);
  }
  .day.win {
    background: var(--ok-fg);
  }
  .day.loss {
    background: var(--bad-fg);
  }
</style>