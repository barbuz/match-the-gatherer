<script>
  import CardImage from './CardImage.svelte';

  export let guesses = []; // [{ card, results }]
  export let targetReleasedAt = null;

  function groupOf(releasedAt) {
    if (!targetReleasedAt || !releasedAt) return 'same';
    if (releasedAt < targetReleasedAt) return 'older';
    if (releasedAt > targetReleasedAt) return 'newer';
    return 'same';
  }

  $: sorted = [...guesses].sort((a, b) =>
    (a.card.released_at ?? '').localeCompare(b.card.released_at ?? '')
  );
  $: groups = ['older', 'same', 'newer'].map((g) => ({
    key: g,
    items: sorted.filter((e) => groupOf(e.card.released_at) === g),
  }));
</script>

{#if guesses.length > 0}
  <div class="timeline" aria-label="Guessed cards ordered by release date">
    {#each groups as group}
      {#if group.key !== 'older'}
        <div class="separator" title="Target first released: {targetReleasedAt}">
          {#if group.key !== 'same'}
            <span class="sep-label">newer ➔</span>
          {/if}
        </div>
      {/if}
      {#each group.items as entry (entry.card.name)}
        <div class="cell">
          <CardImage card={entry.card} />
          <span class="date">{entry.card.released_at ?? ''}</span>
        </div>
      {/each}
    {/each}
  </div>
{/if}

<style>
  .timeline {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    overflow-x: auto;
    padding: 0.5rem 0.25rem;
    -webkit-overflow-scrolling: touch;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .date {
    font-size: 0.6rem;
    color: var(--muted);
    white-space: nowrap;
  }
  .separator {
    align-self: stretch;
    border-left: 2px dashed var(--accent);
    margin: 0 0.15rem;
    position: relative;
    min-width: 2px;
  }
  .sep-label {
    position: absolute;
    top: -0.4rem;
    left: 0.3rem;
    font-size: 0.55rem;
    color: var(--accent);
    white-space: nowrap;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    height: 100%;
  }
</style>
