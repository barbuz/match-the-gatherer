<script>
  /** Main page (spec §8): stats summary, entry points, triggers background download. */
  import { onMount } from 'svelte';
  import { ensureData, dataStatus } from '../lib/stores/backgroundFetch.js';
  import StatsSummary from '../lib/components/StatsSummary.svelte';

  onMount(() => {
    ensureData().catch(() => {});
  });
</script>

<div class="home">
  <h1>Match the Gatherer</h1>
  <p class="tagline">Guess today's Magic: The Gathering card in 10 tries.</p>

  <StatsSummary />

  <nav class="entry-points">
    <a class="entry" href="#/daily">📅 Play Today's Game</a>
    <a class="entry" href="#/free">🎲 Free Mode</a>
  </nav>

  {#if $dataStatus.phase === 'loading'}
    <p class="data-status">{$dataStatus.detail || 'Updating card data…'}</p>
  {:else if $dataStatus.phase === 'error'}
    <p class="data-status error">Card data update failed — playing with cached data if available.</p>
  {/if}
</div>

<style>
  .home {
    max-width: 40rem;
    margin: 0 auto;
    text-align: center;
  }
  h1 {
    margin-bottom: 0.25rem;
  }
  .tagline {
    color: var(--muted);
    margin-top: 0;
  }
  .entry-points {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
    margin-top: 1.5rem;
  }
  .entry {
    display: block;
    width: 16rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--fg);
    text-decoration: none;
    font-size: 1.05rem;
  }
  .entry:hover {
    background: var(--accent-soft);
  }
  .data-status {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .data-status.error {
    color: var(--bad-fg);
  }
</style>
