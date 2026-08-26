<script>
  import { onMount } from 'svelte';
  import { getStats } from '../storage/statsStore.js';

  let stats = null;
  onMount(async () => {
    stats = await getStats();
  });

  $: winRate = stats && stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : null;
</script>

{#if stats}
  <div class="stats">
    <div class="stat">
      <span class="value">{stats.played}</span>
      <span class="label">Played</span>
    </div>
    <div class="stat">
      <span class="value">{stats.won}</span>
      <span class="label">Won</span>
    </div>
    <div class="stat">
      <span class="value">{winRate === null ? '—' : `${winRate}%`}</span>
      <span class="label">Win rate</span>
    </div>
  </div>
{/if}

<style>
  .stats {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    margin: 1rem 0;
  }
  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .value {
    font-size: 1.4rem;
    font-weight: 700;
  }
  .label {
    font-size: 0.75rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
</style>
