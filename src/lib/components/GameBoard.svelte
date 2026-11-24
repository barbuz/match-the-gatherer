<script>
  /**
   * Daily game screen (spec §2). Handles target selection, guessing, feedback,
   * timeline, and summary.
   */
  import { onMount, onDestroy } from 'svelte';
  import { ensureData, dataStatus } from '../stores/backgroundFetch.js';
  import { fetchCardByName, countSearchResults } from '../api/scryfall.js';
  import { fetchDailyCard } from '../api/dailyApi.js';
  import { utcDateKey } from '../game/dailySeed.js';
  import { compareCards } from '../game/comparison.js';
  import { createGame, MAX_GUESSES } from '../game/gameState.js';
  import { gatherHints, buildScryfallSearchUrl, buildScryfallQuery } from '../game/hints.js';
  import { analyzeGuesses, countMistakes } from '../game/consistency.js';
  import { revealHints } from '../game/reveal.js';
  import { scoreGuess } from '../game/scoring.js';
  import { barCountFor } from '../game/barTarget.js';
  import GuessInput from './GuessInput.svelte';
  import GuessFeedback from './GuessFeedback.svelte';
  import CardTimeline from './CardTimeline.svelte';
  import CardImage from './CardImage.svelte';
  import ShareSummary from './ShareSummary.svelte';
  import CommunityStats from './CommunityStats.svelte';
  import HintButton from './HintButton.svelte';
  import HintBar from './HintBar.svelte';
  import RevealClue from './RevealClue.svelte';
  import StatsSummary from './StatsSummary.svelte';
  import StreakMeter from './StreakMeter.svelte';

  let phase = 'loading'; // 'loading' | 'ready' | 'error'
  let error = '';
  // The day key comes from the server response (see below), computed fresh on
  // every game start.
  let dayKey = utcDateKey();
  let targetName = '';
  let targetCard = null;
  let names = [];
  let game = null;
  let state = { guesses: [], hintsUsed: [], status: 'playing', loaded: false, communityStats: null };
  let submitError = '';
  let unsubscribe = null;
  let hintLink = { url: '', warning: null };
  // The day's pre-revealed clue. It is a clue from the very start, so it seeds
  // the hint list and the mistake check.
  let reveal = null;
  // The daily clue constrains the search before any guess, so its count is
  // resolved once on load and becomes the bar's starting value. A failed count
  // keeps the name-list size, which is a safe upper bound.
  let preGuessCount = null;
  let preGuessToken = null;
  let countedIndex = -1;
  let setupToken = 0;
  // The button's link and count are built from the same cumulative hint list,
  // so the number shown always matches the set the link opens.
  $: baseHints = revealHints(reveal);
  $: hintHints =
    state.guesses.length > 0 || baseHints.length > 0 ? gatherHints(state.guesses, baseHints) : null;
  $: hintLink = hintHints ? buildScryfallSearchUrl(hintHints) : { url: '', warning: null };
  // Count the final, fully-constrained hint set once the game has ended, so the
  // bar can slide down to the true number (1 on a win) before the outcome shows.
  $: finalHints =
    state.status !== 'playing' && state.guesses.length > 0
      ? gatherHints(state.guesses, baseHints)
      : null;
  $: revealCount = finalCountsResolved ? finalCountValue : null;
  // The bar's value (see `barTarget.js`): the latest resolved count, holding the
  // previous resolved value (never an unrelated fallback) while one resolves.
  $: barCount = barCountFor({
    guesses: state.guesses,
    hintCounts: state.hintCounts,
    status: state.status,
    revealCount,
    // Before the first guess the bar starts at the name-list size, unless the
    // daily clue already narrowed the field (counted below).
    initialCount: preGuessCount ?? names.length,
  });

  $: if (baseHints.length > 0) {
    const query = buildScryfallQuery(baseHints);
    if (query !== preGuessToken) {
      preGuessToken = query;
      preGuessCount = null;
      countSearchResults(query)
        .then((n) => (preGuessCount = n))
        .catch(() => {});
    }
  } else if (preGuessToken !== null) {
    preGuessToken = null;
    preGuessCount = null;
  }

  // The final count (1 on a win, the real value on a loss) is scored from the
  // accumulated hints; on a win we know it is exactly the answer, so it is 1
  // without a request.
  let finalCountValue = null;
  let finalCountsResolved = false;
  let finalCountToken = null;

  $: if (finalHints) {
    if (state.status === 'won') {
      finalCountValue = 1;
      finalCountsResolved = true;
    } else {
      const query = buildScryfallQuery(finalHints);
      if (query !== finalCountToken) {
        finalCountToken = query;
        finalCountValue = null;
        finalCountsResolved = false;
        countSearchResults(query)
          .then((n) => {
            finalCountValue = n;
            finalCountsResolved = true;
          })
          .catch(() => {
            finalCountsResolved = true; // keep whatever the bar already shows
          });
      }
    }
  } else {
    finalCountValue = null;
    finalCountsResolved = false;
    finalCountToken = null;
  }

  // While the game has just ended but the final count is still resolving (or
  // sliding into place), hold the outcome back; then reveal it after the bar has
  // had time to animate.
  let gameOverVisible = false;
  let revealTimer = null;
  $: if (state.status === 'playing') {
    if (gameOverVisible) gameOverVisible = false;
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
  } else if (!gameOverVisible && !revealTimer && finalCountsResolved) {
    revealTimer = setTimeout(() => {
      gameOverVisible = true;
      revealTimer = null;
    }, 1200);
  }

  // Count each new guess's cumulative clue set asynchronously; the game never
  // waits. A request for an earlier guess is left to finish: its result is
  // still saved per guess index (for the endgame summary), but it no longer
  // drives the button, which only ever reads the latest guess's count.
  let pendingForIndex = -1;
  // True from the moment a guess is submitted until its count query settles.
  // Kept imperative (not derived) so the submit→count hand-off cannot be
  // reordered by Svelte's reactive-statement scheduling: the Scryfall name
  // lookup happens *before* the guess is recorded, so without raising this at
  // submit the spinner would only appear once that round-trip finished.
  let countPending = false;
  $: {
    const idx = state.guesses.length - 1;
    if (idx >= 0 && idx !== countedIndex && state.status === 'playing') {
      countedIndex = idx;
      trackHintCount(idx);
    }
  }

  function trackHintCount(index) {
    // Already counted (e.g. restored) — no query, so nothing to wait for.
    if (state.guesses[index] == null || state.hintCounts?.[index] != null) {
      countPending = false;
      return;
    }
    // Count the same cumulative hint set the button's link opens (hints from
    // this and every earlier guess), so the number shown always describes that
    // link. A per-guess set would ignore earlier clues and can even grow.
    const hints = gatherHints(state.guesses.slice(0, index + 1), baseHints);
    pendingForIndex = index;
    countPending = true;
    countSearchResults(buildScryfallQuery(hints))
      .then((n) => game.setHintCount(index, n))
      .catch(() => {
        // Offline: leave the count unresolved so it keeps the previous value
        // instead of blocking or showing a wrong number.
      })
      .finally(() => {
        if (pendingForIndex === index) {
          pendingForIndex = -1;
          countPending = false;
        }
      });
  }

  $: guessedNames = state.guesses.map((g) => g.card.name);
  $: gameOver = state.status !== 'playing';
  $: remaining = MAX_GUESSES - state.guesses.length;
  $: bestPct = Math.max(0, ...state.guesses.map((g) => Math.round(scoreGuess(g.card, targetCard).ratio * 100)));
  // Which earlier clue each guess contradicts, recomputed from the persisted
  // guesses (no storage schema change). Indexed like `state.guesses`.
  $: conflictsByGuess = analyzeGuesses(state.guesses, targetCard, baseHints);
  $: mistakeCount = countMistakes(state.guesses, targetCard, baseHints);

  onMount(() => {
    setup();
    return () => unsubscribe?.();
  });

  onDestroy(() => {
    if (revealTimer) clearTimeout(revealTimer);
  });

  async function setup() {
    const token = ++setupToken;
    phase = 'loading';
    error = '';
    // A stalled dependency (a request or a storage call that never settles)
    // must not pin the board on "Loading game…" forever; fall back to the
    // retry state, which a late success still recovers from.
    const watchdog = setTimeout(() => {
      if (token === setupToken && phase === 'loading') {
        error = 'The game took too long to load.';
        phase = 'error';
      }
    }, 20_000);
    try {
      names = await ensureData();
      // Server-authoritative target: there is no client-side fallback, so a
      // failure shows a retry state instead of a local pick.
      const daily = await fetchDailyCard();
      targetCard = daily.card;
      dayKey = daily.dayKey;
      reveal = daily.reveal ?? null;
      targetName = targetCard.name;
      if (token !== setupToken) return; // superseded by a retry
      game = createGame({ dayKey, targetName, targetCard });
      unsubscribe?.();
      unsubscribe = game.subscribe((s) => (state = s));
      await game.load();
      // A concluded game restored from storage refreshes its community
      // aggregates: it re-POSTs only if they never arrived, otherwise it reads
      // them back (backend spec §4.4), so a reload stays within budget.
      await game.reportIfConcluded();
      if (token === setupToken) phase = 'ready';
    } catch (e) {
      if (token === setupToken) {
        error = String(e?.message ?? e);
        phase = 'error';
      }
    } finally {
      clearTimeout(watchdog);
    }
  }

  async function onSelect(e) {
    submitError = '';
    const name = e.detail;
    countPending = true; // spin from the moment of submit, before the lookup
    try {
      const card = await fetchCardByName(name);
      if (!card) {
        submitError = `Couldn't find "${name}" on Scryfall.`;
        countPending = false;
        return;
      }
      const results = compareCards(card, targetCard);
      // `addGuess` records the guess (and kicks off its count query)
      // synchronously; only its best-effort stats reporting is awaited, and
      // that must not hold the spinner — it hands off to the count the moment
      // the guess lands.
      const recorded = game.addGuess({ card, results });
      countPending = false;
      await recorded;
    } catch (err) {
      submitError = `Lookup failed: ${err?.message ?? err}`;
      countPending = false;
    }
  }

  function onHintPress() {
    if (hintLink.url) window.open(hintLink.url, '_blank');
    game.markHintUsed();
  }
</script>

<div class="game">
  {#if phase === 'loading'}
    <p class="status">{$dataStatus.detail || 'Loading game…'}</p>
  {:else if phase === 'error'}
    <div class="status">
      <p class="error-msg">Unable to load today's puzzle.</p>
      <p class="error-detail">{error}</p>
      <button on:click={setup}>Retry</button>
    </div>
  {:else}
    <p class="hint">
      Daily puzzle — {dayKey} (UTC)
      {#if !gameOverVisible}
        · {remaining} {remaining === 1 ? 'guess' : 'guesses'} left
      {/if}
    </p>

    {#if gameOverVisible}
      <div class="game-over">
        {#if state.status === 'won'}
          <h2>{state.hintsUsed?.length === 0 ? '🔮 Peerless!' : '🎉 You found it!'}</h2>
        {:else}
          <h2>{bestPct}% matched</h2>
        {/if}
        <p class="outcome-line">
          {state.status === 'won' ? 'Solved in' : 'Used'}
          <strong>{state.guesses.length}</strong>
          {state.guesses.length === 1 ? 'guess' : 'guesses'}
          {mistakeCount === 0
            ? 'with no mistakes'
            : `with ${mistakeCount} ${mistakeCount === 1 ? 'mistake' : 'mistakes'}`}
        </p>
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
        <ShareSummary
          guesses={state.guesses}
          {dayKey}
          hintsUsed={state.hintsUsed ?? []}
          hintCounts={state.hintCounts ?? {}}
          {revealCount}
          {targetCard}
          {baseHints}
        />
        <CommunityStats stats={state.communityStats} />
        <div class="daily-meta">
          <StatsSummary />
          <StreakMeter />
        </div>
      </div>
    {:else}
      <RevealClue {reveal} />
      <GuessInput
        {names}
        exclude={guessedNames}
        disabled={!state.loaded || gameOver}
        on:select={onSelect}
      />
      <div class="hint-row">
        <HintButton disabled={gameOver || !hintLink.url} on:press={onHintPress} />
      </div>
      {#if hintLink.warning}
        <p class="hint-warning" role="status">{hintLink.warning}</p>
      {/if}
      <HintBar count={barCount} initialCount={preGuessCount ?? names.length} pending={countPending} />
      {#if submitError}
        <p class="error-msg">{submitError}</p>
      {/if}
    {/if}

    <CardTimeline guesses={state.guesses} targetReleasedAt={targetCard?.released_at ?? null} />

    <div class="feedback-list">
      {#each [...state.guesses].map((entry, i) => ({ entry, conflicts: conflictsByGuess[i] ?? [] })).reverse() as item (item.entry.card.name)}
        <GuessFeedback entry={item.entry} {targetCard} conflicts={item.conflicts} />
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
  .hint-warning {
    text-align: center;
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0.15rem 0 0;
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
  .outcome-line {
    margin: 0.2rem 0 0.6rem;
    color: var(--muted);
    font-size: 0.9rem;
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
  .daily-meta {
    margin-top: 1rem;
  }
</style>
