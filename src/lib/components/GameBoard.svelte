<script>
  /**
   * Shared game screen used by the Daily and Free Mode routes (spec §2).
   * Handles target selection, guessing, feedback, timeline, and summary.
   */
  import { onMount } from 'svelte';
  import { ensureData, dataStatus } from '../stores/backgroundFetch.js';
  import { fetchCardByName } from '../api/scryfall.js';
  import { fetchDailyCard } from '../api/dailyApi.js';
  import { resolveVintageLegalCard, utcDateKey } from '../game/dailySeed.js';
  import { compareCards } from '../game/comparison.js';
  import { createGame, MAX_GUESSES } from '../game/gameState.js';
  import { gatherHints, buildScryfallSearchUrl } from '../game/hints.js';
  import { scoreResults } from '../game/scoring.js';
  import GuessInput from './GuessInput.svelte';
  import GuessFeedback from './GuessFeedback.svelte';
  import CardTimeline from './CardTimeline.svelte';
  import CardImage from './CardImage.svelte';
  import ShareSummary from './ShareSummary.svelte';
  import CommunityStats from './CommunityStats.svelte';
  import HintButton from './HintButton.svelte';

  export let mode; // 'daily' | 'free'

  let phase = 'loading'; // 'loading' | 'ready' | 'error'
  let error = '';
  // Free mode never leaves the client; the daily day key comes from the
  // server response (see below), computed fresh on every game start.
  let dayKey = utcDateKey();
  let targetName = '';
  let targetCard = null;
  let names = [];
  let game = null;
  let state = { guesses: [], hintsUsed: [], status: 'playing', loaded: false, communityStats: null };
  let submitError = '';
  let unsubscribe = null;
  let hintUrl = '';
  $: hintUrl = state.guesses.length > 0
    ? buildScryfallSearchUrl(gatherHints(state.guesses))
    : '';

  $: guessedNames = state.guesses.map((g) => g.card.name);
  $: gameOver = state.status !== 'playing';
  $: remaining = MAX_GUESSES - state.guesses.length;
  $: bestPct = Math.max(0, ...state.guesses.map((g) => Math.round(scoreResults(g.results).ratio * 100)));

  onMount(() => {
    setup();
    return () => unsubscribe?.();
  });

  async function setup() {
    phase = 'loading';
    error = '';
    try {
      names = await ensureData();
      if (mode === 'daily') {
        // Server-authoritative target: the daily game has no client-side
        // fallback, so a failure shows a retry state instead of a local pick.
        const daily = await fetchDailyCard();
        targetCard = daily.card;
        dayKey = daily.dayKey;
        targetName = targetCard.name;
      } else {
        targetCard = await resolveVintageLegalCard(names, () => Math.floor(Math.random() * names.length), fetchCardByName);
        if (!targetCard) throw new Error('no vintage-legal card found in name list');
        targetName = targetCard.name;
      }
      game = createGame({ mode, dayKey, targetName, targetCard });
      unsubscribe?.();
      unsubscribe = game.subscribe((s) => (state = s));
      await game.load();
      // A concluded game restored from storage refreshes its community
      // aggregates: it re-POSTs only if they never arrived, otherwise it reads
      // them back (backend spec §4.4), so a reload stays within budget.
      if (mode === 'daily') await game.reportIfConcluded();
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

  function onHintPress() {
    if (hintUrl) window.open(hintUrl, '_blank');
    game.markHintUsed();
  }
</script>

<div class="game">
  {#if phase === 'loading'}
    <p class="status">{$dataStatus.detail || 'Loading game…'}</p>
  {:else if phase === 'error'}
    <div class="status">
      <p class="error-msg">
        {mode === 'daily'
          ? "Unable to load today's puzzle."
          : 'Unable to start a free game.'}
      </p>
      <p class="error-detail">{error}</p>
      <button on:click={setup}>Retry</button>
    </div>
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
          <h2>{state.hintsUsed?.length === 0 ? '🔮 Peerless!' : '🎉 You found it!'}</h2>
        {:else}
          <h2>{bestPct}% matched</h2>
        {/if}
        <div class="target-reveal">
          <a
            class="reveal-link"
            href={targetCard?.scryfall_uri ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            title={`View ${targetName} on Scryfall`}
          >
            <CardImage card={targetCard} large />
          </a>
          <p>
            The card was <strong>{targetName}</strong>
            {#if targetCard?.scryfall_uri}
              — <a class="outside-link" href={targetCard.scryfall_uri} target="_blank" rel="noopener noreferrer">Scryfall</a>
            {/if}
          </p>
        </div>
        {#if mode === 'daily'}
          <ShareSummary guesses={state.guesses} won={state.status === 'won'} {dayKey} hintsUsed={state.hintsUsed ?? []} />
          <CommunityStats stats={state.communityStats} />
        {:else}
          <p class="muted">Free mode — no stats recorded.</p>
        {/if}
      </div>
    {:else}
      <GuessInput {names} exclude={guessedNames} disabled={!state.loaded} on:select={onSelect} />
      <div class="hint-row">
        <HintButton disabled={state.guesses.length === 0} on:press={onHintPress} />
      </div>
      {#if submitError}
        <p class="error-msg">{submitError}</p>
      {/if}
    {/if}

    <CardTimeline guesses={state.guesses} targetReleasedAt={targetCard?.released_at ?? null} />

    <div class="feedback-list">
      {#each [...state.guesses].reverse() as entry (entry.card.name)}
        <GuessFeedback {entry} />
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
  .hint-row {
    display: flex;
    justify-content: center;
    margin: 0.75rem 0 0.25rem;
  }
  .status {
    text-align: center;
    padding: 2rem 0;
  }
  .error-msg {
    color: var(--bad-fg);
    text-align: center;
    font-size: 0.9rem;
  }
  .error-detail {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .status button {
    margin-top: 0.5rem;
    padding: 0.4rem 1.2rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
  }
  .status button:hover {
    background: var(--accent-soft);
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
  .reveal-link {
    line-height: 0;
    border-radius: 10px;
  }
  .reveal-link:hover {
    outline: 3px solid var(--accent-soft);
  }
  .outside-link {
    color: var(--accent);
  }
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
