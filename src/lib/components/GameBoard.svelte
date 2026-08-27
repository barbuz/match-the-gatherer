<script>
  /**
   * Shared game screen used by the Daily and Free Mode routes (spec §2).
   * Handles target selection, guessing, feedback, timeline, and summary.
   */
  import { onMount } from 'svelte';
  import { ensureData, dataStatus } from '../stores/backgroundFetch.js';
  import { fetchCardByName } from '../api/scryfall.js';
  import { pickDailyCardName, utcDateKey } from '../game/dailySeed.js';
  import { compareCards } from '../game/comparison.js';
  import { createGame, MAX_GUESSES } from '../game/gameState.js';
  import GuessInput from './GuessInput.svelte';
  import GuessFeedback from './GuessFeedback.svelte';
  import CardTimeline from './CardTimeline.svelte';
  import CardImage from './CardImage.svelte';
  import ShareSummary from './ShareSummary.svelte';

  export let mode; // 'daily' | 'free'

  let phase = 'loading'; // 'loading' | 'ready' | 'error'
  let error = '';
  let dayKey = utcDateKey();
  let targetName = '';
  let targetCard = null;
  let names = [];
  let symbols = null;
  let game = null;
  let state = { guesses: [], status: 'playing', loaded: false };
  let submitError = '';
  let unsubscribe = null;

  $: guessedNames = state.guesses.map((g) => g.card.name);
  $: gameOver = state.status !== 'playing';
  $: remaining = MAX_GUESSES - state.guesses.length;

  onMount(() => {
    setup();
    return () => unsubscribe?.();
  });

  async function setup() {
    phase = 'loading';
    error = '';
    try {
      const data = await ensureData();
      names = data.names;
      symbols = data.symbols ?? null;
      targetName =
        mode === 'daily'
          ? pickDailyCardName(names)
          : names[Math.floor(Math.random() * names.length)];
      if (!targetName) throw new Error('no card names available');
      targetCard = await fetchCardByName(targetName);
      if (!targetCard) throw new Error(`target card not found: ${targetName}`);
      game = createGame({ mode, dayKey, targetName, targetCard });
      unsubscribe?.();
      unsubscribe = game.subscribe((s) => (state = s));
      await game.load();
      phase = 'ready';
    } catch (e) {
      error = String(e?.message ?? e);
      phase = 'error';
    }
  }

  async function onSelect(e) {
    submitError = '';
    const name = e.detail;
    try {
      const card = await fetchCardByName(name);
      if (!card) {
        submitError = `Couldn't find "${name}" on Scryfall.`;
        return;
      }
      const results = compareCards(card, targetCard);
      game.addGuess({ card, results });
    } catch (err) {
      submitError = `Lookup failed: ${err?.message ?? err}`;
    }
  }
</script>

<div class="game">
  {#if phase === 'loading'}
    <p class="status">{$dataStatus.detail || 'Loading game…'}</p>
  {:else if phase === 'error'}
    <p class="status error-msg">{error}</p>
  {:else}
    <p class="hint">
      {mode === 'daily' ? `Daily puzzle — ${dayKey} (UTC)` : 'Free mode'}
      {#if !gameOver}
        · {remaining} {remaining === 1 ? 'guess' : 'guesses'} left
      {/if}
    </p>

    {#if gameOver}
      <div class="game-over">
        {#if state.status === 'won'}
          <h2>🎉 You found it!</h2>
        {:else}
          <h2>Out of guesses!</h2>
        {/if}
        <div class="target-reveal">
          <CardImage card={targetCard} />
          <p>The card was <strong>{targetName}</strong></p>
        </div>
        {#if mode === 'daily'}
          <ShareSummary guesses={state.guesses} won={state.status === 'won'} {dayKey} />
        {:else}
          <p class="muted">Free mode — no stats recorded.</p>
        {/if}
      </div>
    {:else}
      <GuessInput {names} exclude={guessedNames} disabled={!state.loaded} on:select={onSelect} />
      {#if submitError}
        <p class="error-msg">{submitError}</p>
      {/if}
    {/if}

    <CardTimeline guesses={state.guesses} targetReleasedAt={targetCard?.released_at ?? null} />

    <div class="feedback-list">
      {#each [...state.guesses].reverse() as entry (entry.card.name)}
        <GuessFeedback {entry} {symbols} />
      {/each}
    </div>
  {/if}
</div>

<style>
  .game {
    max-width: 40rem;
    margin: 0 auto;
    padding: 0 0.5rem;
  }
  .hint {
    text-align: center;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .status {
    text-align: center;
    padding: 2rem 0;
  }
  .error-msg {
    color: var(--bad-fg);
    text-align: center;
    font-size: 0.85rem;
  }
  .feedback-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .game-over {
    text-align: center;
    margin-top: 1rem;
  }
  .target-reveal {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
