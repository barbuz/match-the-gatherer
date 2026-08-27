<script>
  /** Per-property feedback for one guess (spec §3). */
  export let entry; // { card, results }
</script>

<div class="guess-feedback">
  <h3 class="card-name">{entry.card.name}</h3>
  <div class="lines">
    {#each entry.results as r (r.key)}
      <div class="line {r.status}">
        <span class="prop-label">{r.label}</span>
        <span class="values">
          {#each r.correct as v}
            <span class="val correct">{v}</span>
          {/each}
          {#each r.wrong as v}
            <span class="val wrong">{v}</span>
          {/each}
        </span>
        {#if r.note}
          <span class="note">{r.note}</span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .guess-feedback {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 0.8rem;
    background: var(--surface);
  }
  .card-name {
    margin: 0 0 0.4rem;
    font-size: 0.95rem;
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.8rem;
  }
  .prop-label {
    min-width: 7.5rem;
    color: var(--muted);
  }
  .values {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }
  .val {
    border-radius: 4px;
    padding: 0 0.3rem;
  }
  .val.correct {
    background: var(--ok-bg);
    color: var(--ok-fg);
  }
  .val.wrong {
    background: var(--bad-bg);
    color: var(--bad-fg);
    text-decoration: line-through;
  }
  .line.partial .val.correct {
    background: var(--partial-bg);
    color: var(--partial-fg);
  }
  .note {
    font-size: 0.7rem;
    color: var(--muted);
    font-style: italic;
  }
</style>
