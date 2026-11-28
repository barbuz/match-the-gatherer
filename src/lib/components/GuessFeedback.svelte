<script>
  /** Per-property feedback for one guess (spec §3). */
  import { manaParts, symbols } from '../api/symbology.js';
  import { scoreGuess } from '../game/scoring.js';
  import { conflictTokens } from '../game/consistency.js';
  import MatchMeter from './MatchMeter.svelte';

  export let entry; // { card, results }
  export let targetCard = null;
  /** Clues from earlier guesses this guess contradicts (see consistency.js). */
  export let conflicts = [];

  $: conflictRows = new Set(conflicts.map((c) => c.row).filter(Boolean));
  // The tokens/values that connect this guess to an earlier clue, per row:
  // `segments`/`mv` mark the guess's own offending values, `missing` lists the
  // clue's values the guess lacks (drawn as dashed chips).
  $: conflictMarks = conflictTokens(entry.results, conflicts);

  // `$symbols` is just a reactivity anchor — when the map finishes downloading
  // the store updates and any already-rendered mana rows re-render as images.

  $: score = scoreGuess(entry.card, targetCard);
</script>

<div class="guess-feedback">
  <div class="card-header">
    <h3 class="card-name">
      {entry.card.name}{#if conflicts.length}<span
        class="conflict-badge"
        role="img"
        aria-label="Contradicts an earlier clue"
        title="This guess contradicts an earlier clue"
      >⚠️</span>{/if}
    </h3>
    <MatchMeter level={score.level} />
  </div>
  <div class="lines">
    {#each entry.results as r (r.key)}
      <div class="line {r.status}" class:conflict={conflictRows.has(r.key)}>
        <span class="prop-label" class:absent={r.absentOnTarget}>{r.label}</span>
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
                <span class="val keyword-name {seg.status}" class:mistake={conflictMarks[r.key]?.segments.has(i)}>{seg.nameText}</span>{#if seg.nameText.length < seg.text.length}<span class="keyword-param">{seg.text.slice(seg.nameText.length)}</span>{/if}
              </span>
            {:else if seg.kind === 'oracle'}
              <!-- One rules token = one compared chip, rendered verbatim: `{...}`
                   braces keep their printed position with no special highlight.
                   Any enclosing quotes are drawn outside the frame so the token
                   border hugs the text, not the quotes. -->
              <span class="oracle-wrap">{#if seg.quotes === 'open' || seg.quotes === 'both'}<span class="oracle-quote">"</span>{/if}<span class="oracle-token {seg.status}" class:mistake={conflictMarks[r.key]?.segments.has(i)}>{seg.text}</span>{#if seg.quotes === 'close' || seg.quotes === 'both'}<span class="oracle-quote">"</span>{/if}</span>
            {:else if seg.token}
              {#if $symbols && manaParts(seg.text)}
                <span class="val mana {seg.status}" class:mistake={conflictMarks[r.key]?.segments.has(i)}>
                  {#each manaParts(seg.text) as p, pi (pi)}
                    <img class="mana-img" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
                  {/each}
                </span>
              {:else}
                <span class="val {seg.status}" class:mistake={conflictMarks[r.key]?.segments.has(i)}>{seg.text}</span>
              {/if}
            {:else if seg.status}
              <span class="val {seg.status}" class:mistake={conflictMarks[r.key]?.segments.has(i)}>{seg.text}</span>
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
              <span class="val {mv.status}" class:mistake={conflictMarks[r.key]?.mv.has(i)}>{mv.text}</span>
            {/each}
          {/if}
          {#each conflictMarks[r.key]?.missing ?? [] as m, mi (`m${mi}`)}
            {#if m.kind === 'mana' && $symbols && manaParts(m.text)}
              <span class="val mana missing" title="Mana cost known from an earlier clue: {m.text}">
                {#each manaParts(m.text) as p, pi (pi)}
                  <img class="mana-img" src={p.uri} alt={p.token} title={p.token} loading="lazy" />
                {/each}
              </span>
            {:else}
              <span
                class="val missing"
                title="{m.kind === 'manaValue' ? 'Mana value' : 'Value'} known from an earlier clue: {m.text}"
              >{m.text}</span>
            {/if}
          {/each}
        </span>
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
  .card-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.4rem;
  }
  .card-name {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0;
    overflow-wrap: anywhere;
  }
  .conflict-badge {
    margin-left: 0.3rem;
    /* Colour emoji ignore `color`, but the monochrome fallback (some Linux
       fonts, headless browsers) then still reads as the warning accent. */
    color: var(--warn-fg);
  }
  /* A row the guess got wrong *and* that an earlier clue already ruled out. */
  .line.conflict .prop-label {
    color: var(--warn-fg);
  }
  .line.conflict {
    border-left: 2px solid var(--warn-fg);
    padding-left: 0.35rem;
    margin-left: -0.45rem;
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  /* No wrap here: the value block must stay in its own column next to the
     label, so a long row (keywords, oracle) wraps internally and stays
     indented rather than dropping below the label at the container edge. */
  .line {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.8rem;
  }
  .prop-label {
    flex: 0 0 7.5rem;
    font-family: var(--font-mono);
    font-size: 0.68rem;
    letter-spacing: 0.01em;
    color: var(--muted);
  }
  .prop-label.absent {
    color: var(--bad-fg);
    text-decoration: line-through;
  }
  .mv-label {
    flex: 0 0 auto;
    margin-left: 0.5rem;
  }
  .values {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    /* Let the block shrink below its content width so it wraps internally
       instead of pushing the row wider than the container. */
    min-width: 0;
  }
  .val {
    border-radius: 4px;
  }
  .val.correct {
    background: var(--ok-bg);
    color: var(--ok-fg);
  }
  .val.wrong {
    color: var(--bad-fg);
    text-decoration: line-through;
  }
  /* The exact token a clue already ruled out: it stays struck through (it is
     wrong) but takes the warning accent instead of the plain red, so the
     player can see which value broke the clue. */
  .val.wrong.mistake,
  .keyword-name.wrong.mistake,
  .values.seg-values.oracle .oracle-token.wrong.mistake {
    color: var(--warn-fg);
    text-decoration-color: var(--warn-fg);
  }
  /* A value an earlier clue already established that this guess lacks: the same
     warning accent, drawn as a dashed frame rather than a strike-through,
     because the value is not printed on the guess. */
  .values.seg-values .val.missing {
    color: var(--warn-fg);
    border: 1px dashed var(--warn-fg);
    border-radius: 4px;
    padding: 0 0.25rem;
    background: transparent;
  }
  .values.seg-values .val.missing.mana {
    padding: 0.15rem 0.3rem;
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
  .val.wrong.mana.mistake::after {
    background: var(--warn-fg);
  }
  /* Segments rows phrase values in order: the type line like the card
     ("Supertypes Types — Subtypes"), each Power/Toughness row as one value. */
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
  /* Oracle text: one chip per compared token. Chips are inline so a token that
     wraps is fragmented per line (`box-decoration-break: slice`): each line
     gets top/bottom borders, the left border only on the first fragment and the
     right only on the last, so a wrapped chip reads as an open-sided frame that
     the next token can follow on the same line. The row is a block (not flex)
     so the chips live in an inline formatting context and can fragment. */
  .values.seg-values.oracle {
    display: block;
    line-height: 1.6;
  }
  .values.seg-values.oracle .line-break {
    display: block;
    height: 0;
  }
  /* In the wrapping oracle row the face separator gets its own line, so the two
     faces read as distinct blocks instead of the `//` landing mid-line. */
  .values.seg-values.oracle .sep {
    display: block;
  }
  /* The chip's enclosing quotes are siblings of the framed token, so the frame
     hugs the text and the quote sits just outside it. Spacing lives on the
     wrapper, so it falls after the closing quote. */
  .values.seg-values.oracle .oracle-wrap {
    display: inline;
    margin: 0 0.1rem 0 0;
  }
  /* The quote is additional punctuation, not the compared text, so it reads as
     muted like the other separators — never the chip's status colour. */
  .values.seg-values.oracle .oracle-quote {
    color: var(--muted);
  }
  .values.seg-values.oracle .oracle-token {
    display: inline;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.05rem 0.3rem;
    -webkit-box-decoration-break: slice;
    box-decoration-break: slice;
  }
  /* Status colour/background on the chip itself so it fills the frame padding. */
  .values.seg-values.oracle .oracle-token.correct {
    background: var(--ok-bg);
    color: var(--ok-fg);
  }
  .values.seg-values.oracle .oracle-token.wrong {
    color: var(--bad-fg);
    text-decoration: line-through;
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
</style>
