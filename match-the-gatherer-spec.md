# Match the Gatherer — Specification

A Wordle-style daily guessing game for Magic: The Gathering cards, built as a Svelte Progressive Web App with no backend server.

## 1. Overview

- Player guesses a target MTG card by entering card names.
- Each guess returns feedback showing which properties the guessed card shares with the target.
- A new target card is chosen daily (same for all players worldwide, derived deterministically from the UTC date — no server required).
- A "Free Mode" allows unlimited practice games with a random target and no stats tracking.

## 2. Core Gameplay

- Player has up to **10 guesses** (tunable constant, to be tweaked after testing) to identify the target card.
- Each guess is compared against the target across the properties below, and feedback is shown after every guess.
- Guessed cards are displayed as a running list/timeline (see §6).

## 3. Properties Compared

| Property | Notes |
|---|---|
| Mana cost & mana value | |
| Color | |
| Type | |
| Supertypes | |
| Subtypes | |
| Power | |
| Toughness | |
| Loyalty | |
| Defense | |
| Dual-faced status | Including all properties above re-checked for the back face |
| Released date (`released_at`) | Oldest printing; used to place guess in the timeline |
| Oracle tags ("otags") | All tags associated with the card |

### Comparison specifics
- **Mana cost**: three possible outcomes per guess — exact mana cost match, mana value match only (cost differs), or no match.
- **Color**: compares the card's actual color (not color identity).
- **Type**: supertype/type/subtype are compared as separate line items, consistent with how Scryfall models `type_line`.
- **Otags**: all otags are used for the comparison (no cap for now).

### Feedback rules
- **Fully correct property** (e.g., exact type match, exact power/toughness match): show the correct value, highlighted.
- **Partially correct property** (e.g., 2 of 3 subtypes match, some otags match): show the matching values first, then the non-matching values, with clear visual distinction between the two groups.
- **Fully incorrect property**: show the (incorrect) guessed values, visually marked as wrong.

## 4. Data Sources & Fetching Strategy

All data comes directly from Scryfall's public API; there is no custom backend.

### 4.1 Card properties (per card)
- Fetched via exact-name search, oldest printing:
  `https://api.scryfall.com/search?q=!"card name here" prefer:oldest`
- All special characters and spaces in the card name must be correctly URL-encoded.
- Used both for the target card and for every guessed card.

### 4.2 Card name list (for autocomplete + daily card selection)
- Downloaded from `https://api.scryfall.com/catalog/card-names`.
- All names starting with `"A-"` are filtered out (Alchemy-only cards, never printed in paper).
- Downloaded in parallel with the oracle tag bulk data.
- Used to power the fuzzy-filtering guess input, and as the source list for picking the daily card.

### 4.3 Oracle tags (bulk data)
- Oracle tags are not available per-card via the normal API, so they require the bulk dataset.
- Metadata (download URL + last-updated timestamp) is fetched from:
  `https://api.scryfall.com/bulk-data/oracle_tags`
- Compare the reported "last updated" timestamp against the locally cached copy; re-download whenever a newer version exists (no fixed staleness window — any mismatch triggers a re-fetch), or if there's no local copy at all.
- The actual data file is gzip-compressed JSON (~5MB compressed). Attempt to read it directly without a separate decompression step, using an established JS library capable of streaming/parsing gzip-compressed JSON in the browser (e.g. `pako` or the native `DecompressionStream` API), rather than manually decompressing to a temp file.
- This download starts automatically when the main page loads (if the cached copy is stale) and **must not be interrupted** if the player navigates to start a game while it's in progress — it should continue in the background (e.g., a shared store / singleton fetch promise that persists across route changes).

## 5. Daily Puzzle Selection

- A seed is generated from the current UTC date (date only, no time).
- The seed deterministically picks one card from the filtered card-name list (§4.2).
- This guarantees every player sees the same daily card without any server coordination.
- Puzzle resets at UTC midnight.

## 6. Guess Timeline / Card Images

- Guessed cards are displayed in a horizontal row of card images, ordered from oldest to newest `released_at`.
- Visual separators split the row into: older-than-target | same release date as target | newer-than-target.
- Images should be small/compact — some horizontal scrolling is acceptable, but the layout must remain comfortable on a smartphone screen (no oversized images, no awkward reflow).

## 7. Guess Input

- Text field with fuzzy filtering against the card name list (§4.2) as the player types.
- Selecting/submitting a name triggers the Scryfall lookup (§4.1) for that card.
- Cards already guessed in the current game are removed from the filtered list — a card cannot be guessed twice.

## 8. Main Page

- Shows a **minimal** stats summary from previous daily games (exact fields TBD later — start with something lightweight like games played / win rate, extendable without a schema rewrite).
- A daily game is only recorded as a win or loss once it actually concludes — the player finds the card, or exhausts all 10 guesses. Closing and reopening the tab mid-game does **not** count as a loss: in-progress guesses/state are persisted locally and resume exactly where the player left off.
- Two entry points: **Play Today's Game** and **Free Mode**.
- Triggers the otag + card-name background download on load if a newer otag version is available than the cached one (§4.3); this download continues uninterrupted when the player clicks into a game.
- Displays the current app/service-worker version in small print at the bottom (see §12).

## 9. Free Mode

- Picks a random card (not tied to the daily seed) and can be replayed repeatedly.
- Same gameplay/feedback rules as the daily game.
- **No stats are recorded** for Free Mode games.

## 10. Game-Over Behavior (loss)

- If all 10 guesses are used without identifying the card, the game ends immediately: the target card is revealed, the board is locked (no further guesses), and the end-of-game summary (§11) is shown.

## 11. End-of-Game Summary & Sharing

At the end of a **daily** game (win or loss), show a summary that:
- For each guess, computes a match score: number of properties matched out of the total number of properties applicable to the **guessed card** (e.g. a non-creature guess doesn't count power/toughness in its denominator). This keeps the denominator itself from leaking information about the target.
- Renders each guess's score as a **horizontal bar made of emojis** (e.g. filled vs. empty block/square emoji), proportionally fuller the higher the match count — one row per guess.
- Is copy-pasteable as a single shareable text block (the emoji bars).
- Always ends with the URL to the game.

Note: an earlier idea used a per-property emoji grid (one column per property), but this was dropped — it would reveal which properties exist on the target (e.g. a filled power/toughness column would confirm the target is a creature) before the player has actually guessed that. The bar approach only reveals an aggregate score per guess, not which specific properties matched, so it can be safely shown even for guesses that got some properties wrong.

## 12. Technical Architecture

- **Framework**: Svelte, built as a Progressive Web App (PWA).
- **Structure**: componentized, with clear separation of concerns (e.g., data-fetching/caching layer, game-state/logic layer, comparison/scoring logic, and presentational components should be distinct modules).
- **Hosting**: GitHub Pages.
- **CI/CD**: GitHub Action that deploys on every push to `main` and supports manual dispatch.
- **Service Worker**: version string embedded (including a date component), bumped with every change, so updates are detected client-side. The same version string is shown in small print on the main page.
- **No backend server** — all logic runs client-side; no login/account and no cross-device sync. All persistent data (stats, otag cache, card name cache, in-progress game state) lives in browser storage on-device (e.g., IndexedDB/localStorage).
- **Theming**: dark and light modes both supported; default follows system preference, with a manual toggle to override, persisted locally.
- **Connectivity**: the app assumes an active internet connection to query Scryfall for every lookup; no offline gameplay in v1 (may be revisited later).

## 13. Proposed File Architecture

Plain **Vite + Svelte** (no SvelteKit needed — there's no SSR/backend, and GitHub Pages just serves static files). `svelte-spa-router` for the two routes, `idb-keyval` for IndexedDB access, `vite-plugin-pwa` for the service worker/manifest.

```
match-the-gatherer/
├── .github/
│   └── workflows/
│       └── deploy.yml            # build + deploy to GitHub Pages, on push to main + manual dispatch
├── public/
│   ├── icons/                    # PWA icons (various sizes)
│   └── favicon.svg
├── src/
│   ├── main.js                   # app entry point, mounts App.svelte
│   ├── App.svelte                # root: router outlet + ThemeToggle + VersionFooter
│   ├── app.css                   # global styles, CSS variables for light/dark theming
│   │
│   ├── routes/
│   │   ├── Home.svelte           # §8 — stats summary, entry points, triggers bg download
│   │   ├── DailyGame.svelte      # §2,5-7,10-11 — daily game screen
│   │   └── FreeMode.svelte       # §9 — free play screen
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── scryfall.js       # §4.1 — exact-name card lookup (oldest printing)
│   │   │   ├── cardNames.js      # §4.2 — catalog/card-names fetch + A- filtering
│   │   │   └── oracleTags.js     # §4.3 — bulk-data metadata check, gzip JSON fetch/parse
│   │   │
│   │   ├── game/
│   │   │   ├── dailySeed.js      # §5 — UTC date → deterministic card index
│   │   │   ├── comparison.js     # §3 — per-property comparison rules (mana, color, type, otags…)
│   │   │   ├── scoring.js        # §11 — match score (matched / applicable properties)
│   │   │   └── gameState.js      # store: guesses, remaining attempts, win/loss, persisted per day
│   │   │
│   │   ├── storage/
│   │   │   ├── db.js             # thin idb-keyval wrapper (get/set/del helpers)
│   │   │   ├── statsStore.js     # §8 — minimal win/loss stats, read/write
│   │   │   └── dataCache.js      # §4.2/4.3 — cached card-name list + otag bulk data + versions
│   │   │
│   │   ├── stores/
│   │   │   ├── theme.js          # §12 — dark/light mode, system default + manual override
│   │   │   └── backgroundFetch.js# §4.3/§8 — singleton in-flight download promise, survives route changes
│   │   │
│   │   └── components/
│   │       ├── GuessInput.svelte     # §7 — fuzzy autocomplete, excludes already-guessed cards
│   │       ├── GuessFeedback.svelte  # §3 — per-property feedback row for one guess
│   │       ├── CardTimeline.svelte   # §6 — horizontal release-date-ordered guess row
│   │       ├── CardImage.svelte      # compact card image tile used by the timeline
│   │       ├── StatsSummary.svelte   # §8 — minimal stats block on Home
│   │       ├── ShareSummary.svelte   # §11 — emoji-bar summary + copy-to-clipboard
│   │       ├── ThemeToggle.svelte    # §12 — light/dark switch
│   │       └── VersionFooter.svelte  # §11 — shows service-worker version string
│   │
│   └── service-worker.js         # §11 — generated/configured via vite-plugin-pwa, versioned
│
├── tests/
│   ├── comparison.test.js        # unit tests for §3 comparison rules (esp. mana cost tiers, otags)
│   ├── scoring.test.js           # unit tests for §11 match-score calculation
│   └── dailySeed.test.js         # unit tests for deterministic date → card mapping
│
├── index.html
├── vite.config.js                # vite-plugin-svelte + vite-plugin-pwa config
├── package.json
└── README.md
```

### Notes on the structure
- `lib/api/` only talks to Scryfall — it has no game logic, so it can be reused unchanged if the data source ever changes.
- `lib/game/` is pure logic (comparison, scoring, seeding) with no DOM/Svelte dependency, making it straightforward to unit test in isolation (see `tests/`).
- `lib/storage/` isolates all browser-persistence concerns (IndexedDB via `idb-keyval`) so the rest of the app just calls plain functions/stores without knowing the storage mechanism.
- `lib/stores/backgroundFetch.js` is the piece that specifically satisfies §4.3's "must not be interrupted by navigation" requirement — it's a singleton promise created once and shared across routes rather than being re-triggered per-page.
- Routing is intentionally minimal (2-3 routes) — `svelte-spa-router` avoids pulling in SvelteKit's SSR-oriented conventions that aren't needed for a static, client-only app.
