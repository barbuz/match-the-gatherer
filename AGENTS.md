# AGENTS.md — Match the Gatherer

Wordle-style MTG daily guessing game (Svelte PWA). Spec: `match-the-gatherer-spec.md`.

## Commands

- `npm test` — vitest (comparison / scoring / gameState / hints / symbology / dailySeed / dailyApi)
- `npm run build` — production build to `dist/` (set `BASE_PATH=/repo-name/` on GitHub Pages)
- `npm run preview` — serve the production build

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
  stream, and splits the rules text on newlines and on `"` (a quote inside a
  token would make a quoted `o:"..."` clause malformed and Scryfall silently
  drops it), keeps `{...}` mana symbols inline with the plain run, trims only the
  ends, and drops tokens with no letter/digit or below a 2-char floor. Tokens are
  therefore verbatim substrings of the stripped text (newlines removed).
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
    whole line can sit inside a longer target line, the oracle row matches by
    case-insensitive **substring** (mirroring `o:`) rather than whole-line
    equality, so a contained line reads correct instead of emitting a `-o:` that
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



- Emoji fonts may be missing in headless browsers (glyphs show as boxes) — not a bug.