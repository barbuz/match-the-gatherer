# AGENTS.md — Match the Gatherer

Wordle-style MTG daily guessing game (Svelte PWA). Spec: `match-the-gatherer-spec.md`.

## Commands

- `npm test` — vitest (comparison / scoring / gameState / hints / symbology / dailySeed / dailyApi)
- `npm run build` — production build to `dist/` (set `BASE_PATH=/repo-name/` on GitHub Pages)
- `npm run preview` — serve the production build

## Key facts

- **There is a backend now.** The daily answer and anonymous stats come from
  the `match-the-gatherer-backend` Cloudflare Worker
  (`src/lib/api/config.js`, base URL override `VITE_API_BASE`). The daily game
  is **hard-coupled** to it (`src/lib/api/dailyApi.js`): `GameBoard.svelte`
  fetches `GET /api/daily/<today-utc>` and shows a retry state on failure —
  it must **never** fall back to the local `resolveDailyTargetCard`, which is
  retained for **free mode only**. Free mode must make zero `/api/*` calls.
- **Result reporting** (`src/lib/api/statsApi.js`, wired in
  `gameState.js addGuess`): when a daily game concludes, `POST /api/stats`
  with `{date, outcome, guesses, hintsUsed, clientVersion, deviceId}` and the
  response's day aggregates render via `CommunityStats.svelte`. A random
  `deviceId` is generated once per install and stored in `mtg:device-id`;
  the server dedupes on `(date, deviceId)`. Reporting is best-effort — offline/
  `400`/`429` resolve to `null` and never block the summary. A concluded game
  restored from storage re-reports once on load (`reportIfConcluded`), but only
  when its aggregates weren't already persisted — keeping the day at the
  spec's budget of 2 requests per player.
- The backend's selection mirrors `lib/game/dailySeed.js` (FNV-1a over the UTC
  date key, `A-` filter, attempt-seeded rerolls); the server's pick wins on
  divergence, so the two need not stay byte-identical.
- A response's **final URL** decides the day key (a non-today date 302s to
  today), so a clock-skewed client self-heals instead of mis-persisting.
- The `/api/daily/<date>` body is **gzipped and served with no
  `Content-Encoding`** (deliberate anti-casual-cheat obfuscation, backend spec
  §3.4), so the browser does *not* inflate it and `res.json()` fails on the raw
  bytes. `dailyApi.js` reads the bytes and inflates them itself via
  `DecompressionStream('gzip')`; the stats response is negotiated normally and
  still parses with `res.json()`. Re-test against the live Worker, not a mock —
  a mock that sets `Content-Encoding` hides this.
- Scryfall exact-name search (`cards/search?q=!"name" prefer:oldest`) also matches
  **individual face names**, so `lib/api/scryfall.js` prefers a whole-card name
  match, then face-name match, then first result.

- Oracle-text row: every word token of the guessed card's text (`card.oracle_text`,
  primary face only)is highlighted green when it appears anywhere in the target's
  text (punctuation stripped, words lowercased via `oracleWords()`);only rendered
  when the guess has text,so a text-less target is never leaked. Oracle text is
  **not** used for the hint search URL: positive `fo:` clauses give away the whole
  text (making the hint search too easy)and negated `-fo:` clauses are
  unreliable (Scryfall's `fo:` matches substrings,e.g. `-fo:if` would also
  exclude every card containing "different"),so oracle hints are dropped entirely..
- `catalog/card-names` needs `A-` prefix filtering (Alchemy-only cards. The
  names download is a singleton in-flight promise (`stores/backgroundFetch.js`), cached
  in idb-keyval (`storage/dataCache.js`), falling back to the cache when offline.

- Mana costs render as SVG images via Scryfall `/symbology` (`lib/api/symbology.js`):
  fetched once at module import (fire-and-forget), cached in localStorage
  (`mtg:card-symbols`) and mirrored in a `$symbols` store. Consumers render images
  only when the map is loaded and fall back to the ascii `{..}` placeholder otherwise
  (`manaParts()`).

- Daily pick: FNV-1a(UTC 'YYYY-MM-DD') % names.length → deterministic, but the
  **server** is the source of truth for the served card (see above).

- Game logic is DOM-freein `src/lib/game/` (incl. `gameState.js`,which imports
  svelte/store but runs fine under node)for unit-testability.Anti-leak rules:

  properties absent on the GUESSED card render no row;(so a creature-only target is
  never leaked);layout row appears only for non-normal guesses;rarity is a core
  Scryfall field present on every card, so the rarity row always renders for every guess;
  the oracle-text row appears only when the guessed card has text;score denominators
  count only `applicable` properties
  of the guessed card.

- Hints (`src/lib/game/hints.js`): `gatherHints()` distills every guess's feedback into a
  deduplicated minimal hint list; `buildScryfallSearchUrl()` turns it into a
  `https://scryfall.com/search/?q=...` link with clauses `t:`, `c:`, `layout:`,
  `mana=`, `mv=`, `pow=`, `tou=`, `loy=`, `r:`, `date>`/`date<`, negations via
  `-`/`!=`, and always ending `not:reprint`. Defense stats have no Scryfall operator, so
  those hints are dropped. Scryfall's `pow`/`tou`/`loy` operators are
  numeric-only but **coerce** a variable stat rather than rejecting it: the
  leading signed constant wins and a bare `*`/`X`/`?` counts as 0 (`tou=1`
  matches Tarmogoyf's `1+*`, `pow=2` matches Angry Mob's `2+*`, `pow=0` matches
  the ~220 cards with a bare `*`; verified against the live API). `comparison.js`
  `statValue()` applies that same coercion so the feedback agrees with the hint
  URL — without it a `1+*` guess against a `1` target would read "wrong" and
  emit `tou!=1`, filtering out the answer. Only values with no numeric reading
  (`∞`) are unexpressible and dropped.
  **exception**: Scryfall's `t:` is a contains-match
  with no exact-type-line operator, so negated type hints survive even after a
  fully-matched type row. Colors likewise never use the exact-set `c=` operator:
  a fully matched colors row only proves the guessed colors are a subset of the
  target's, so `c:` contains hints (positive and negated) are used throughout,
  and a `//` face separator is never emitted as a filter value. Same-direction
  date bounds fold down to the
  tightest,and an exact date subsumes all date hints. The HintButton opens that URL, and
  each used hint press marks its share row with 🔦 (`buildShareText` `hintsUsed`).

- Daily games persist per UTC day (`mtg:game:${dayKey}`, via `lib/game/gameState.js`);
  free-mode games are memory-only and never touch stats. Stats live in `storage/statsStore.js`
  (`mtg:stats`), idempotent per day, capped at 365 days (`days` + a parallel
  `results` map of `{dayKey: won}` so the streak can replay the calendar; the
  window trims both together). `game/streak.js` `calculateStreak()` is pure and
  derives the current/best win streak from `results`: a loss resets it, a skipped
  day breaks it, and the current run stays alive while today is still unplayed.
  The Home page renders it via `StreakMeter.svelte`.

- Scryfall rejects browser-less fetches without a User-Agent (Node returns 400);
  browsers are fine.

- Version string in `src/lib/version.js` is shown in footer AND embedded in the
  service worker — bump on every change. (`package.json` `version` is independent.)

- vite-plugin-pwa `injectManifest` + `workbox-precaching`; SW code lives in
  `src/service-worker.js` and must reference `self.__WB_MANIFEST`. Navigations are
  served network-first (`mtg:navigation`); the SW answers a `GET_VERSION` message with
  `APP_VERSION` and calls `skipWaiting()` / `clients.claim()`.



- Emoji fonts may be missing in headless browsers (glyphs show as boxes) — not a bug.