# AGENTS.md — Match the Gatherer

Wordle-style MTG daily guessing game (Svelte PWA). Spec: `match-the-gatherer-spec.md`.

## Commands

- `npm test` — vitest (comparison / scoring / countColors / gameState / hints / symbology / dailySeed / dailyApi)
- `npm run build` — production build to `dist/` (set `BASE_PATH=/repo-name/` on GitHub Pages)
- `npm run preview` — serve the production build

## Manual QA against a local mock (default procedure)

Exercising the **daily** game posts to the live stats sink, so never QA it
against production. Point the app at a local mock instead:

1. `VITE_API_BASE=<mock-origin> npm run build` — bakes the mock base URL into
   `dist/` (default build uses the real Worker). Rebuild without it afterwards.
2. Run a tiny mock server on that origin that serves **both** `dist/` statically
   **and** the API: `GET /api/daily/<date>` (a real card JSON, e.g. fetched once
   from Scryfall `cards/named?exact=...&set=...`) and `GET|POST /api/stats*`
   (canned aggregates). Log every request line.
3. Open the mock origin in the browser and play. Confirm counts, endgame
   summary, and — on reload of a finished game — a `GET /api/stats/<date>` read
   (not another `POST`).

Pitfalls that make this silently lie:
- **Serve the app from the mock origin itself**, not the dev/preview origin.
  The service worker caches `index.html` and old JS; pointing a different origin
  at the same API is not enough.
- **Force a full document reload** (add a `?cache-bust` query) when switching
  modes. SPA hash navigation (`#/free` → `#/daily`) is a same-document change:
  the browser keeps the already-loaded bundle and the SW may serve stale JS, so
  the page can run the *previous* build (e.g. the production API) while you think
  you're testing the mock. Confirm by reading the mock's request log, not the UI.
- The mock origin has no prior SW/cache, so a fresh origin is the cleanest.

## Key facts

- **There is a backend now.** The daily answer and anonymous stats come from
  the [`match-the-gatherer-backend`](https://github.com/barbuz/match-the-gatherer-backend)
  Cloudflare Worker
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
  restored from storage refreshes its aggregates on load (`reportIfConcluded`):
  it re-`POST`s only when they never arrived, and otherwise reads them back via
  `GET /api/stats/<date>` (`fetchDailyStats`, backend spec §4.4) so a reload
  costs a shared-cached read, not another counted write — keeping the day at
  the spec's budget of 2 requests per player (a reload adds one CDN-absorbed
  read). The read omits `target` for a live day, which the summary doesn't need
  (it already knows the card).
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

- Oracle text + keywords: a single shared tokenizer (`comparison.js
  parseOracleText`) feeds both rows and the hint URL, so what the player sees
  marked is exactly what the search filters on. It strips reminder text, splits
  each face's `oracle_text` into a **Keywords** stream and an **Oracle text**
  stream, and splits the rules text into tokens at newlines, `:`, `.` and `"`
  (`ruleLineTokens`). `{...}` mana symbols are **opaque** (a `.`/`:`/`"` inside
  one never splits; Scryfall indexes braces literally, verified: `o:"Add {G}"`
  matches Llanowar Elves while `o:"Add G"` matches nothing) and `[...]` spans are
  kept whole. A `:`/`.` **stays on the token it ends** (`{T}:`, `Add {G}.`); a
  `"` splits but is **not part of any token**. Each segment records a `quotes`
  marker (`'open'`/`'close'`/`'both'`/`''`) from the quote's position (line start
  or after whitespace marks the following run, otherwise the preceding run), so
  the UI draws the quotes **outside** the token frame — the border hugs the text,
  not the quotes. Quotes are never in the compared token (a quote inside a quoted
  `o:"..."` clause would make Scryfall silently drop it). Only the ends are trimmed.
  Tokens with no letter/digit or below a 2-char floor are dropped, so every
  compared token is a verbatim substring of the stripped text.
  - **Rendering = data.** Each display stream (`segments`, `keywordSegments`,
    `rulesSegments`) holds one segment per compared unit — a chip for a keyword,
    one chip per rules **clause** — with `{ break: true }` between printed lines.
    A line whose keyword was removed therefore renders no blank row, and a
    printed line break stays visible. An oracle segment carries `text` (the
    compared/hinted value, verbatim `{...}` braces in place) and `quotes` (the
    enclosing-quote marker, drawn as siblings just outside the frame). There is
    **no per-part muting**: a keyword that appears mid-rules-text (e.g.
    `Proliferate`) or a brace run (`{T}`) is an ordinary literal inside its
    clause chip and gets no distinct highlight — only
    the whole chip is marked by status. A keyword segment carries `nameText` (the
    canonical name) so only the name is marked as the token, not its printed
    parameter; that muting is Keywords-row only. Both rows draw a **frame**
    around each chip (the Oracle row wraps within the value column; it is no
    longer a dotted list). Oracle chips are `display: inline` with `box-decoration-break: slice`,
    so a token that wraps is framed **per line** — top/bottom on every line, the
    left edge only on the first fragment and the right only on the last — and the
    next token can continue on the same line. (The row is a block, not flex, so
    the chips sit in an inline formatting context and can fragment; a flex item
    is atomic and would not.)
  - **Reminder text** (`(...)`, depth-aware so nested spans like `Super haste`
    are removed cleanly) is **ignored for matching** and never hinted. This is
    what lets the hints use `o:` instead of `fo:`: Scryfall's `o:` indexes the
    oracle text with reminder spans removed, so the client and Scryfall index the
    same string. Square brackets are **not** reminder text (cleave text is
    indexed by `o:`), and an unmatched `)` stays literal.
  - **Keywords** are extracted only from the *leading* keyword occurrence of
    each line, using `card.keywords` as recognition **vocabulary** (longest name
    first). Handles the comma-separated keyword list (`Flying, first strike`),
    ability words (`Landfall — …`, where the dash and following space are
    consumed but the rules text is kept verbatim), and keyword costs/parameters
    (`Kicker {2}`, `Protection from red`, `Ward {2}`, `Equip legendary creature
    {1}`). A comma ends a text parameter unless the keyword's value may contain
    one (`Partner with Krav, the Unredeemed`). `card.keywords` is **not** the
    printed list: entries like `Treasure`/`Food`/`Double`/`Monstrosity` never
    appear as a leading keyword line, so they stay in the oracle text and emit
    **no** `kw:` hint (gating rule). The Keywords row renders the printed span
    verbatim (punctuation and parameters included) and compares by canonical
    name, exactly as `kw:` matches, so `Kicker {2}` vs `{4}` is still correct.
  - Hints: the oracle row uses `o:"<token>"` (positive keeps the answer,
    `-o:"<token>"` excludes only literal occurrences); the keywords row uses
    `kw:<canonical-name>` (lowercased, from `card.keywords`). Because a guessed
    token can sit inside a longer target run, the oracle row matches by
    case-insensitive **substring** (mirroring `o:`) rather than whole-token
    equality, so a contained token reads correct instead of emitting a `-o:` that
    would exclude the answer. `compareCards`' `correct`/`wrong` carry the
    **original-case** token (matching stays case-insensitive), since `o:` is
    literal; the keywords row additionally carries `correctNames`/`wrongNames`
    for the hint values. `oracle` and `keywords` join `type`/`colors` as
    contains-match exceptions: negated hints survive a fully-matched row. The
    rows render only when the guess has the property (text / a printed keyword),
    so a text-less or keyword-less target is never leaked; the token-overlap
    score also runs on these line tokens. Substring semantics are deliberate:
    over-broad positives are harmless and
  negatives exclude only literal occurrences.
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
  the oracle-text row appears only when the guessed card has text. The share score is
  token-overlap rather than a matched/applicable count: `scoring.js scoreGuess(guess,
  target)` tokenizes each card's properties via `comparison.js propertyTokens()` and
  averages the per-property Dice coefficient. A property counts whenever EITHER card
  has tokens for it, so a property only the target has (creature vs. instant) scores 0
  instead of being dropped; the aggregate still never reveals which properties exist on
  the target. `GuessFeedback`/`GameBoard`/`ShareSummary` all pass `targetCard` so the
  score can be computed at render time (results rows no longer carry enough info).

- Comparison rows are normalized in `comparison.js` `line()`: `segments` is the single
  source of truth for display, and `correct`/`wrong` (the token lists `hints.js` and
  share text consume) plus `status` are derived from the segments' statuses, so a row
  builder only describes what it renders. Plain rows (layout, released, rarity, the
  `—` placeholders) are just a single segment per value, so the UI has one render path.

- Hints (`src/lib/game/hints.js`): `gatherHints()` distills every guess's feedback into a
  deduplicated minimal hint list; `buildScryfallSearchUrl()` turns it into a
  `https://scryfall.com/search/?q=...` link with clauses `t:`, `c:`, `layout:`,
  `mana=`, `mv=`, `pow=`, `tou=`, `loy=`, `r:`, `kw:`, `o:`, `date>`/`date<`, negations via
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
  **exception**: Scryfall's `t:`, `c:`, `kw:` and `o:` are all
  contains-matches with no exact operator, so negated hints for `type`, `colors`,
  `keywords` and `oracle` survive even after a fully-matched row. Colors never use the
  exact-set `c=` operator: a fully matched colors row only proves the guessed
  colors are a subset of the target's, so `c:` contains hints (positive and
  negated) are used throughout, and a `//` face separator is never emitted as a
  filter value. Same-direction date bounds fold down to the
  tightest,and an exact date subsumes all date hints. The HintButton opens that URL, and
  each used hint press marks its share row with 🔦 (`buildShareText` `hintsUsed`).
  `buildScryfallQuery()` returns the raw (unencoded) clause string, and
  `buildScryfallSearchUrl()` is just it URL-encoded, so the hint's count and the
  link it opens always search the same set.

- **Hint count** (`lib/api/scryfall.js countSearchResults()`): how many cards
  still match, counted after each guess from the **cumulative** hint set
  `gatherHints(guesses.slice(0, i+1))` — the same clause set the link opens, so
  the number always describes that link (a per-guess set would ignore earlier
  clues and could even grow). The count is rendered as a **color** and a bar
  position, not as digits on the button (see `game/countColors.js` below).
  Scryfall emits `total_cards` as the first field of a search list, so the client
  reads only the opening streamed bytes and then cancels the body — a few KB
  instead of the ~100 KB gzipped (~900 KB raw) full page, and never paginates. A
  404 (Scryfall's empty-result shape) maps to 0. Requests send a User-Agent
  (Node's fetch 400s without one).
  The count is **async and non-blocking**: `GameBoard.svelte` kicks it off on each
  new guess. An earlier guess's request is **left to finish, not aborted** — its
  result is still saved per guess index so it can appear in the endgame summary,
  while the bar only ever reads the *latest* guess's count, so a slow older
  response can't interfere with the number shown. Until the latest resolves the
  bar's pointer stays put and the number reads `???`, and a failed request leaves
  it unresolved (never a wrong number). Resolved counts live in `gameState.js`
  `hintCounts` keyed by guess index and persist with the daily game; they surface
  in the share text (`buildShareText` tags each emoji row with the count's color).
  The `Hint` button itself is label-only and stays enabled while unresolved —
  only the `HintBar`'s number is pending.
- **Count color scheme** (`game/countColors.js`): shared by the share summary
  and the hint bar. Bands: blue = exactly 1, green ≤ 10, yellow ≤ 100, orange
  ≤ 1000, red > 1000 (gray = unknown). In the end-game summary each guess row
  ends with a colored square for that guess's `hintCounts` value (in the
  copy-pasteable share text as 🟦/🟩/🟨/🟧/🟥/⬜ emoji) instead of the digits.
  The hint bar's gradient maps these colors onto a log scale from 0.1 to
  10 000 (five equal decades), so every band boundary sits at an even 20% of the
  bar; `logPosition()` converts a count to a `[0, 1]` position. `HintBar.svelte`
  draws the gradient under the button with a caret pointer that slides to the
  latest count (CSS `transition: left 1s`; the first placement is applied with no
  transition so a freshly created pointer doesn't fly in from the edge) and shows
  the actual number beneath the pointer, tinted with the band color.

- Daily games persist per UTC day (`mtg:game:${dayKey}`, via `lib/game/gameState.js`);
  free-mode games are memory-only and never touch stats. Stats live in `storage/statsStore.js`
  (`mtg:stats`), idempotent per day, with full history retained (no cap: `played`/`won`
  are lifetime totals and a trimmed roster would silently reset the all-time best
  streak). `days` is the recorded-day list and `results` is a parallel
  `{dayKey: won}` map so the streak can replay the calendar. `game/streak.js`
  `calculateStreak()` is pure and derives the current/best win streak from
  `results`: a loss resets it, a skipped day breaks it, and the current run stays
  alive while today is still unplayed. The Home page renders it via
  `StreakMeter.svelte`.

- Scryfall rejects browser-less fetches without a User-Agent (Node returns 400);
  browsers are fine.

- Version string in `src/lib/version.js` is shown in footer AND embedded in the
  service worker — bump on every change. (`package.json` `version` is independent.)

- vite-plugin-pwa `injectManifest` + `workbox-precaching`; SW code lives in
  `src/service-worker.js` and must reference `self.__WB_MANIFEST`. Navigations are
  served network-first (`mtg:navigation`); the SW answers a `GET_VERSION` message with
  `APP_VERSION` and calls `skipWaiting()` / `clients.claim()`.
  - **Route order matters.** Workbox matches routes in registration order, so
    the navigate `NetworkFirst` route must be registered **before**
    `precacheAndRoute()`. The precache route also answers a navigation to `/`
    with the precached `index.html`; if it went first it would win and pin the
    app to the cached HTML shell (and thus the old hashed bundle) indefinitely —
    a deploy would appear not to take. Offline still works via
    `PrecacheFallbackPlugin({ fallbackURL: 'index.html' })` on that route.
    The browser picks up a new worker on its own schedule and `autoUpdate`
    reloads once it activates; no extra polling is done in `main.js`.



- Emoji fonts may be missing in headless browsers (glyphs show as boxes) — not a bug.