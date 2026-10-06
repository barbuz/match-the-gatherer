<script>
  /** Per-property feedback for one guess (spec §3). */
  import { manaParts, symbols } from '../api/symbology.js';
  import { scoreGuess } from '../game/scoring.js';

  export let entry; // { card, results }
  export let targetCard = null;

  // `$symbols` is just a reactivity anchor — when the map finishes downloading
  // the store updates and any already-rendered mana rows re-render as images.

  const RING_RADIUS = 18;
  const RING_CIRC = 2 * Math.PI * RING_RADIUS;

  $: score = scoreGuess(entry.card, targetCard);
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
        <span class="prop-label" class:absent={r.absentOnTarget}>{r.label}</span>
        {#if r.segments}
          <span class="values seg-values" class:mana={r.key === 'mana'} class:oracle={r.key === 'oracle'} class:keywords={r.key === 'keywords'}>
            {#each r.segments as seg, i (i)}
              {#if seg.break}
                <span class="line-break" aria-hidden="true"></span>
              {:else if seg.dash}
                <span class="dash">—</span>
              {:else if seg.slash}
                <span class="pt-sep">/</span>
              {:else if seg.sep}
                <span class="sep">//</span>
              {:else if seg.kind === 'keyword'}
                <!-- Keyword abilities render verbatim (punctuation and parameters
                     included), never symbol-substituted, so the row reads exactly
                     as printed on the card. Only the canonical name is the
                     compared token, so the parameter stays muted. -->
                <span class="keyword">
                  <span class="val keyword-name {seg.status}">{seg.nameText}</span>{#if seg.nameText.length < seg.text.length}<span class="keyword-param">{seg.text.slice(seg.nameText.length)}</span>{/if}
                </span>
              {:else if seg.kind === 'oracle'}
                <!-- One printed rules line = one compared token. The leading name
                     (a keyword ability or mana cost) is muted: it is not part of
                     the compared line and is already shown by the Keywords row. -->
                <span class="token-line">
                  {#if seg.nameText}<span class="line-name">{seg.nameText}</span>{/if}
                  {#if seg.nameText.length < seg.text.length}
                    <span class="val {seg.status}">{seg.text.slice(seg.nameText.length)}</span>
                  {/if}
                </span>
              {:else if seg.token}
                {#if $symbols && manaParts(seg.text)}
                  <span class="val mana {seg.status}">
                    {#each manaParts(seg.text) as p, pi (pi)}
                      <img class="mana-img" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
                    {/each}
                  </span>
                {:else}
                  <span class="val {seg.status}">{seg.text}</span>
                {/if}
              {:else if seg.status}
                <span class="val {seg.status}">{seg.text}</span>
              {:else}
                <span class="plain">{seg.text}</span>
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
        {:else}
          <span class="values">
            {#each r.correct as v}
            {#if $symbols && manaParts(v)}
              <span class="val mana correct">
                {#each manaParts(v) as p, i (i)}
                  <img class="mana-img" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
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
    margin: 0 3rem 0.4rem;
    font-size: 0.95rem;
    overflow-wrap: anywhere;
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
  .prop-label.absent {
    color: var(--bad-fg);
    text-decoration: line-through;
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
  .pt-sep {
    color: var(--muted);
    padding: 0 0.1rem;
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
  /* Segments rows phrase values in order:the type line like the card
     ("Supertypes Types — Subtypes"),the P/T row as "3/2". */
  .values.seg-values {
    gap: 0.3em;
    align-items: baseline;
  }
  .values.seg-values .val {
    padding: 0 0.1rem;
  }
  .values.seg-values .dash, .values.seg-values .pt-sep, .values.seg-values .sep {
    padding: 0 0.25rem;
    color: var(--muted);
  }
  /* A printed line break: in a wrapping row it forces a new line; in the
     column-stacked oracle row it is simply hidden. */
  .line-break {
    flex-basis: 100%;
    height: 0;
  }
  /* Oracle text: one printed line per compared token, stacked as a dotted list
     so it is clear the line — not each word — is the unit being compared. */
  .values.seg-values.oracle {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.15rem;
  }
  .values.seg-values.oracle .line-break {
    display: none;
  }
  .values.seg-values.oracle .token-line {
    position: relative;
    padding-left: 0.85rem;
  }
  .values.seg-values.oracle .token-line::before {
    content: '';
    position: absolute;
    left: 0.2rem;
    top: 0.6em;
    width: 0.28rem;
    height: 0.28rem;
    border-radius: 50%;
    background: var(--muted);
  }
  .values.seg-values.oracle .val {
    padding: 0 0.15rem;
  }
  .values.seg-values.oracle .val.mana {
    vertical-align: middle;
  }
  /* The leading keyword name / mana cost is not part of the compared line (the
     Keywords row already shows it), so it is muted. */
  .values.seg-values.oracle .line-name {
    color: var(--muted);
    opacity: 0.7;
  }
  /* Mana rows phrase per-face costs in order, `//` between faces. */
  .values.seg-values.mana {
    align-items: center;
  }
  /* Keyword abilities: one span per printed ability, verbatim. Only the canonical
     name is the compared token (highlighted); the parameter stays muted. Printed
     punctuation already separates them, so no frame is drawn. */
  .values.seg-values.keywords {
    gap: 0.35rem;
  }
  .values.seg-values .keyword .val {
    padding: 0;
  }
  .values.seg-values .keyword-param {
    color: var(--muted);
    opacity: 0.75;
  }
  .values.seg-values .plain {
    white-space: pre-wrap;
    color: var(--muted);
  }
  .note {
    font-size: 0.7rem;
    color: var(--muted);
    font-style: italic;
  }
  .match-badge {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
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
