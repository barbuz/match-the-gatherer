<script>
  /** Fuzzy-filter autocomplete guess input (spec §7). Already-guessed cards
   *  are excluded so a card can't be guessed twice. */
  import { createEventDispatcher } from 'svelte';

  export let names = [];
  export let exclude = [];
  export let disabled = false;

  const dispatch = createEventDispatcher();
  let query = '';
  let highlighted = 0;
  let listEl;

  $: excluded = new Set(exclude.map((n) => n.toLowerCase()));
  $: matches = rank(names, query, excluded).slice(0, 50);
  $: if (highlighted >= matches.length) highlighted = 0;

  function rank(names, query, excluded) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const qAlnum = q.replace(/[^a-z0-9]+/g, '');
    const out = [];
    for (const name of names) {
      const lower = name.toLowerCase();
      if (excluded.has(lower)) continue;
      const idx = lower.indexOf(q);
      let score = -1;
      if (idx === 0) score = 0;
      else if (idx > 0) score = 1;
      else if (qAlnum) {
        const hay = lower.replace(/[^a-z0-9]+/g, '');
        let i = 0;
        for (const ch of hay) if (ch === qAlnum[i]) i++;
        if (i === qAlnum.length) score = 2 + hay.indexOf(qAlnum[0]) / (hay.length + 1);
      }
      if (score !== -1) out.push({ name, score, len: name.length });
    }
    out.sort((a, b) => a.score - b.score || a.len - b.len || a.name.localeCompare(b.name));
    return out.map((o) => o.name);
  }

  function select(name) {
    if (disabled) return;
    query = '';
    highlighted = 0;
    dispatch('select', name);
  }

  function scrollHighlightedIntoView() {
    requestAnimationFrame(() => {
      listEl
        ?.querySelector('button.highlighted')
        ?.scrollIntoView({ block: 'nearest' });
    });
  }

  function onKeydown(e) {
    if (disabled) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      highlighted = Math.min(highlighted + 1, matches.length - 1);
      scrollHighlightedIntoView();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlighted = Math.max(highlighted - 1, 0);
      scrollHighlightedIntoView();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (matches.length > 0) select(matches[highlighted]);
    }
  }
</script>

<div class="guess-input">
  <input
    type="text"
    bind:value={query}
    on:keydown={onKeydown}
    {disabled}
    placeholder={disabled ? 'Game over' : 'Type a card name…'}
    autocomplete="off"
    spellcheck="false"
  />
  {#if query.trim() && !disabled}
    <ul class="matches" bind:this={listEl}>
      {#each matches as name, i (name)}
        <li>
          <button class:highlighted={i === highlighted} on:click={() => select(name)}>{name}</button>
        </li>
      {:else}
        <li class="none">No matches</li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .guess-input {
    position: relative;
    width: 100%;
    max-width: 28rem;
    margin: 0 auto;
  }
  input {
    width: 100%;
    padding: 0.6rem 0.8rem;
    font-size: 1rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--fg);
    box-sizing: border-box;
  }
  .matches {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin: 0.25rem 0 0;
    padding: 0;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    overflow-y: auto;
    max-height: 16rem;
    z-index: 10;
  }
  .matches li button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.5rem 0.8rem;
    background: none;
    border: none;
    color: var(--fg);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .matches li button.highlighted,
  .matches li button:hover {
    background: var(--accent-soft);
  }
  .matches .none {
    padding: 0.5rem 0.8rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
