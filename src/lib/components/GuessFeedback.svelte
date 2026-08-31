<script>
  /** Per-property feedback for one guess (spec §3). */
  import { manaParts, symbols } from '../api/symbology.js';
  import { scoreResults } from '../game/scoring.js';

  export let entry; // { card, results }

  // `$symbols` is just a reactivity anchor — when the map finishes downloading
  // the store updates and any already-rendered mana rows re-render as images.

  const RING_RADIUS = 18;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  $: score = scoreResults(entry.results);
  $: pct = Math.round(score.ratio * 100);
  $: dashOffset = RING_CIRC * (1 - score.ratio);
</script>

<div class="guess-feedback">
  <h3 class="card-name">{entry.card.name}</h3>
  <div class="lines">
    <div class="match-badge" title="{pct}% match">
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle class="ring-bg" cx="22" cy="22" r={RING_RADIUS} />
        <circle
          class="ring-fill"
          cx="22"
          cy="22"
          r={RING_RADIUS}
          stroke-dasharray={RING_CIRC}
          stroke-dashoffset={dashOffset}
        />
      </svg>
      <span class="match-pct">{pct}%</span>
    </div>
    {#each entry.results as r (r.key)}
      <div class="line {r.status}">
        <span class="prop-label">{r.label}</span>
        {#if r.segments}
          <span class="values type-line">
            {#each r.segments as seg (seg.text ?? 'dash')}
              {#if seg.dash}
                <span class="dash">—</span>
              {:else}
                <span class="val" class:correct={seg.ok} class:wrong={!seg.ok}>{seg.text}</span>
              {/if}
            {/each}
          </span>
        {:else}
          <span class="values">
            {#each r.correct as v}
            {#if $symbols && manaParts(v)}
              <span class="val mana correct">
                {#each manaParts(v) as p, i (i)}
                  <img class="mana-icon" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
                {/each}
              </span>
            {:else}
              <span class="val correct">{v}</span>
            {/if}
          {/each}
          {#each r.wrong as v}
            {#if $symbols && manaParts(v)}
              <span class="val mana wrong">
                {#each manaParts(v) as p, i (i)}
                  <img class="mana-img" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
                {/each}
              </span>
            {:else}
              <span class="val wrong">{v}</span>
            {/if}
          {/each}
          {#if r.mvValues}
            {#each r.mvValues as mv, i (i)}
              {#if i > 0}
                <span class="pt-sep">,</span>
              {/if}
              <span class="prop-label mv-label">MV</span>
              <span class="val {mv.status}">{mv.text}</span>
            {/each}
          {/if}
        </span>
        {/if}
        {#if r.note}
          <span class="note">
            {#if r.noteBold}
              {r.note.replace(r.noteBold, '')}<strong>{r.noteBold}</strong>
            {:else}
              {r.note}
            {/if}
          </span>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .guess-feedback {
    position: relative;
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
  .mv-label {
    min-width: 0;
    margin-left: 0.5rem;
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
    height: 1px;
    background: var(--bad-fg);
    transform: translateY(-50%);
    pointer-events: none;
  }
  .line.partial .val.correct {
    background: var(--partial-bg);
    color: var(--partial-fg);
  }
  /* Type line is phrased like on the card: "Supertypes Types — Subtypes". */
  .values.type-line {
    gap: 0.3em;
    align-items: baseline;
  }
  .values.type-line .val {
    padding: 0 0.1rem;
  }
  .values.type-line .dash {
    padding: 0 0.25rem;
    color: var(--muted);
  }
  .note {
    font-size: 0.7rem;
    color: var(--muted);
    font-style: italic;
  }
  .match-badge {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    width: 44px;
    height: 44px;
  }
  .match-badge svg {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  .ring-bg {
    fill: none;
    stroke: var(--border);
    stroke-width: 3.5;
  }
  .ring-fill {
    fill: none;
    stroke: var(--accent);
    stroke-width: 3.5;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s ease;
  }
  .match-pct {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 700;
    color: var(--fg);
  }
</style>
