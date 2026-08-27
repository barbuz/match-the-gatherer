<script>
  /** Per-property feedback for one guess (spec §3). */
  import { tokenizeManaCost, isManaCost } from '../api/symbology.js';

  export let entry; // { card, results }
  export let symbols = null; // Scryfall symbol → svg_uri map (fetched & cached by the background loader)

  /** Render a value as symbol images when it is a pure mana cost. */
  function manaParts(value) {
    if (!symbols || !isManaCost(value)) return null;
    return tokenizeManaCost(value)
      .map((t) => ({ token: t, uri: symbols.get(t) }))
      .filter((p) => p.uri);
  }
</script>

<div class="guess-feedback">
  <h3 class="card-name">{entry.card.name}</h3>
  <div class="lines">
    {#each entry.results as r (r.key)}
      <div class="line {r.status}">
        <span class="prop-label">{r.label}</span>
        <span class="values">
          {#each r.correct as v}
            {#if symbols && manaParts(v)}
              <span class="val mana correct">
                {#each manaParts(v) as p (p.token)}
                  <img class="mana-icon" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
                {/each}
              </span>
            {:else}
              <span class="val correct">{v}</span>
            {/if}
          {/each}
          {#each r.wrong as v}
            {#if symbols && manaParts(v)}
              <span class="val mana wrong">
                {#each manaParts(v) as p (p.token)}
                  <img class="mana-img" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
                {/each}
              </span>
            {:else}
              <span class="val wrong">{v}</span>
            {/if}
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
  .val.mana {
    display: inline-flex;
    align-items: center;
    gap: 0.15rem;
    padding: 0.15rem 0.3rem;
  }
  .mana-img {
    width: 1em;
    height: 1em;
    display: block;
  }
  /* Mana symbol <img>s ignore text-decoration, so strike wrong answers with an
     overlay line spanning the row. */
  .val.wrong.mana {
    position: relative;
    overflow: hidden;
  }
  .val.wrong.mana::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 0.1em;
    background: var(--bad-fg);
    transform: translateY(-50%);
    pointer-events: none;
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
