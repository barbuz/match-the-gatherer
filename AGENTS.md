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
2. Run `npm run mock` (or `node scripts/mock-server.mjs`; add `--port <n>` if
   12000 is taken) on that origin. It serves **both** `dist/` statically **and**
   the API:
   `GET /api/daily/<date>` (a real card JSON) and `GET|POST /api/stats*`
   (canned aggregates), and logs every request line. `http://127.0.0.1:<port>/mock`
   is a control page: pick one of six cards chosen to exercise different clues,
   and it clears this origin's caches before loading the game.
   - The script fetches cards with the **same query the app uses**, `!"<name>"
     not:reprint` (i.e. the *oldest* printing), **not** `cards/named?exact=`:
     bare `named?exact` returns Scryfall's *newest* default printing, so the
     served card's `released_at` won't match the oldest printing every guess
     resolves to, and the board will show a phantom "target is newer" date clue
     on every row. (`named?exact=...&set=...` is fine — the `set` pins the
     printing — but the app itself never uses `named`.)
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
- Loading is **bounded**: `dailyApi.js` and `cardNames.js` abort their request
  after 12 s, and `GameBoard.svelte`'s `setup()` has a 20 s watchdog that drops
  into the existing retry state. A request or storage call that never settles
  therefore cannot pin the board on "Loading game…" forever — the player always
  gets either the game or a Retry button (a late success still recovers).
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
    printed line break stays visible. A multi-faced guess joins its two faces'
    keyword spans / rules clauses with a `{ sep: true, text: '//' }` segment, the
    same face separator the type-line and mana rows use. In the wrapping oracle
    row that separator is styled `display: block`, so it sits on its own line
    between the two faces rather than landing mid-line. An oracle segment carries `text` (the
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
    so a text-less or keyword-less target is never leaked. Substring semantics are deliberate:
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
  a **weighted per-property similarity**, not a matched/applicable count:
  `scoring.js scoreGuess(guess, target)` compares each property on its own scale
  (the whole type line, colors and keywords by set overlap; mana value,
  P/T/loyalty/defense and release date by numeric distance; mana costs by
  symbol-multiset Dice; oracle text by word overlap after reminder text and
  stopwords are removed) and takes a weighted mean. Type, colors and oracle text
  dominate; mana cost is a light tiebreaker because its symbols overlap with
  colors and mana value; rarity, date and layout barely move the needle. The
  type score is one Jaccard over all supertype/type/subtype words, so sharing
  only `Creature` against `Creature — Beast` is 1/4, not a 0.6 baseline.
  A property is counted when either card has it. A guess missing a property the
  target has contributes 0 while its weight stays in the denominator, so a
  keyword-less guess against a keyword target is not divided by a smaller total.
  Only a property absent from both cards is skipped, so neither card is
  penalised for a property neither has. The aggregate still never reveals which
  individual properties exist on the target.
  `GuessFeedback`/`GameBoard`/`ShareSummary` all pass `targetCard` so the score can be
  computed at render time (results rows no longer carry enough info).
  - The continuous ratio is presented as **6 discrete match levels** (`MATCH_LEVELS`),
    not a percentage: 1 < 0.30, 2 < 0.45, 3 < 0.60, 4 < 0.80, 5 ≥ 0.80, 6 only for
    the actual answer (same `oracle_id`, else same name). Level 6 is gated rather
    than inferred from the ratio so a property-identical functional reprint reads
    5/6, never 6/6. The levels are labelled as a heat meter — **Cold, Cool, Warm,
    Hot, Blazing, Matched** — and `GuessFeedback` renders each as a six-block
    `MatchMeter.svelte` plus the tier word (no `N/6` numbers); the tooltip carries
    the one-line explanation. The lost-game heading prints the best tier, e.g.
    `Best match: Hot`.
  - The thresholds/weights were calibrated against the full Scryfall oracle-card
    list: random pairs land around 0.17 (level 1), "same colors only" around 0.37
    (level 2), "same colors + card type" around 0.48 (level 3), close creatures
    around 0.57 (level 3), near-reprints around 0.84–0.99 (level 5); only the
    answer reaches 6. Retune the thresholds in `levelForScore`/`WEIGHTS`, not the
    UI.
  - The share bar has one block per level, drawn in that guess's count color
    (`SHARE_BLOCKS = MATCH_LEVELS`, deliberately independent of `MAX_GUESSES`). An
    unresolved count uses ⬛ for filled blocks so the level stays visible against the
    ⬜ empty tail.

- Comparison rows are normalized in `comparison.js` `line()`: `segments` is the single
  source of truth for display, and `correct`/`wrong` (the token lists `hints.js` and
  share text consume) plus `status` are derived from the segments' statuses, so a row
  builder only describes what it renders. Plain rows (layout, released, rarity, the
  `—` placeholders) are just a single segment per value, so the UI has one render path.

- The **Colors** row is per-face **only when a face carries its own `colors`**.
  Scryfall omits the field from every face of the "combined" layouts (split,
  adventure, flip) and from some transforming back faces, leaving the color only
  at the card level. When no face has `colors`, the row shows that single
  card-level set once, with **no `//`** (`Twinmaw Stormbrood` → `W`, not
  `colorless // colorless`); a card-level-empty set still renders the explicit
  `colorless` token. Otherwise each face renders its own set joined by `//`
  (`Delver of Secrets` → `U // U`), and a face that alone lacks `colors` inherits
  the card-level set instead of a `colorless` placeholder (`Search for Azcanta`
  → `U // U`). This is display only: `colorTokens()` already unions the faces with the
  card-level field, so hints and the match score were never affected.

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
  each used hint press marks its share row with 🔮 (`buildShareText` `hintsUsed`).
  The button is **enabled before the first guess**: the daily free clue alone
  yields a valid query (`t:creature f:v not:reprint`), so there is something to
  open from the start. It is disabled only when there is nothing to search —
  the game is over, or free mode (no clue, so `hintHints` stays null and the
  link is empty).
  `markHintUsed()` records the **guess about to be played** (`guesses.length`),
  not the last one played, so a hint taken before the first guess is attributed
  to guess 0 instead of being dropped (the summary used to lose that icon
  entirely). The marker therefore always lands on a row that exists: a hint
  cannot be taken after the final guess, because the game has concluded and
  `markHintUsed()` returns early on a non-playing status. `hintsUsed` remains a
  set of indices, deduped per upcoming guess.
  `buildScryfallQuery()` returns the raw (unencoded) clause string, and
  `buildScryfallSearchUrl()` is just it URL-encoded, so the hint's count and the
  link it opens always search the same set.
  - **Scryfall truncates `q` at ~1024 characters**, cutting it mid-clause so a
    long query 400s ("unclosed parentheses") or 404s as if nothing matched — not
    a syntax error, so it is easy to mistake for a genuine empty result. A
    late-game daily (6 guesses) can gather ~50 clauses totalling >1100 chars.
    A single shared `clampClauses()` in `hints.js` keeps every query we build
    (the link **and** the count) within `MAX_QUERY_LENGTH` (1000, a safe margin
    under the observed ~1024 cut): all clauses are kept when they fit, and only
    an over-budget query is pruned — **negated `o:`** clauses first (bulky and
    the least specific hint), longest first and only as many as needed, then
    the **longest** remaining clauses, never `f:v`/`not:reprint`, until it fits.
    Because both the URL and the count go through the same clamp they still
    search the identical set.
    `buildScryfallSearchUrl()` returns `{ url, truncated, dropped, warning }`
    and `GameBoard.svelte` renders `warning` ("Some longer clues were omitted…")
    directly under the Hint button (above the colored bar) when clauses were
    dropped.

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
  response can't interfere with the number shown. A new guess shows the previous
  guess's count (never `???`) until its own resolves; before the first guess the
  bar starts at the local **name-list size** (`ensureData()` length), since no
  smaller set has been implied yet. A failed request keeps the previous value —
  never a wrong number. Resolved counts live in `gameState.js` `hintCounts` keyed
  by guess index and persist with the daily game; they surface in the share text
  (`buildShareText` colors each emoji row by its count). The `Hint` button itself
  is label-only.
- **Count color scheme** (`game/countColors.js`): shared by the share summary
  and the hint bar. Bands: blue = exactly 1, green ≤ 10, yellow ≤ 100, orange
  ≤ 1000, red > 1000 (gray = unknown). In the end-game summary each guess row's
  emoji bar is **drawn in that guess's count color** (the filled blocks are
  🟦/🟩/🟨/🟧/🟥, gray when unknown), so the bar itself encodes the count — there
  is no separate trailing square. The hint bar's gradient maps these colors onto
  a log scale whose **left edge is 1** (the minimum possible count) up to
  `MAX_COUNT` = 50 000, well past the ~35k name list, so a raw count near the
  top is still visibly short of the right edge. Because a log scale spends a
  decade per order of magnitude, the band widths follow the thresholds: blue
  (a single value) is a thin tip at the far left, green starts almost
  immediately, and red owns the last ~third — `bandEdges()`/`gradientStops()`
  place each color flat across the middle of its band and blend to its neighbor
  at the edges, rather than spreading the five colors evenly.
- **HintBar animation** (`HintBar.svelte`): a **"Possible cards:"** label sits to
  the left of the bar. A pointer slides to the latest count and the number
  **visibly counts up or down** to the new value (a ~0.7 s `requestAnimationFrame`
  ease-out; the pointer position is derived from the animated value so digits and
  caret stay in lockstep). The jump can span tens of thousands, but only the ~42
  painted frames are computed, so the cost is independent of the gap. While a
  count query is in flight (`pending` from `GameBoard.svelte`'s `countPending`) a
  small **spinner** shows beside the number, from the moment a guess is submitted
  until its count resolves and the pointer starts moving — no minimum duration.
  `countPending` is raised **at submit**, before the Scryfall name lookup that
  precedes `addGuess` (the guess is not recorded until that round-trip returns),
  so the spinner is not delayed by it; it is kept imperative rather than derived
  so the submit→count hand-off cannot be reordered by Svelte's scheduling.
  The number itself keeps the previous value until the new one arrives (never
  `???`). The bar's value comes from the pure `barTarget.js` `barCountFor()`:
  while the current
  guess's count is resolving (or after it failed) it holds the most recent
  *resolved* count, so the bar only ever moves down into the true value — it never
  falls back to an older guess or the name-list size, which would make the pointer
  jump toward the top when a backgrounded query failed and a later guess was made.
  Before the first guess the bar starts at the local **name-list size**
  (`ensureData()` length). On conclusion the board holds the outcome back while the
  bar counts down to the fully-constrained count — 1 on a win (known without a
  request), or the real `countSearchResults()` value on a loss — then reveals it
  ~1.2 s later.
  The final count is scored once from `gatherHints(guesses)` (all guesses) and
  overrides the last summary row's stored count via `ShareSummary`'s
  `revealCount`, so summary and bar agree.

- **Mistakes** (`lib/game/consistency.js`): a guess "goes against an earlier clue"
  when it contradicts a fact the previous guesses already established about the
  target. Every clue is the `gatherHints()` output, so the check reuses the exact
  semantics of the Hint search: a hint is **excluded** when it says the target
  does *not* have a value (a negated type/color/keyword/oracle token, an exact
  mana cost / mana value / stat it isn't, or a release-date bound the guess falls
  on the wrong side of) and the guess carries it anyway; a hint is **missing**
  when it says the target *does* have a value (a matched type, color, keyword,
  mana cost/value, stat, layout, rarity or exact release date) and the guess
  lacks it. `analyzeGuesses(guesses)` checks guess *i* against
  `gatherHints(guesses.slice(0, i))`, so guess 0 can never conflict and a guess is
  never judged against itself; `countMistakes()` counts *guesses* that
  contradicted ≥1 clue (a guess breaking several is still one mistake). All
  conflicts are derived from feedback already on screen, so flagging them never
  leaks the target. Oracle text contributes **excluded** conflicts only:
  a positive oracle hint is a whole rules clause, so treating the target's prose
  as a checklist would flag nearly every non-answer (`MISSING_KINDS`), whereas
  guessing a clause the target was shown not to contain is a real contradiction.
  `GuessFeedback.svelte` accents the offending row and puts a ⚠️ badge by the
  card name (no wording); the
  endgame block prints "Solved in N guesses with M
  mistakes", and `buildShareText` marks each share row ✅ or ⚠️ (a mistake,
  matching the yellow conflict accent on the feedback card)
  before the 🔮 hint marker instead of summarizing mistakes in the header. The
  header itself carries only the day, and the share block has two formats —
  `markdown` (default) links the header to the app, `plaintext` appends the bare
  URL at the end. The per-guess result is recomputed from the persisted guesses, so
  it needs no storage schema change and works on a reloaded daily game; free mode
  is unaffected (no new API calls).
  - **`baseHints`**: both `analyzeGuesses`/`countMistakes` and `gatherHints` take
    an optional third/second argument of facts known *before guess 0*. It exists
    for the daily pre-revealed clue (`game/reveal.js`), which is a real clue, so
    a first guess that lacks the revealed word is a mistake even though guess 0
    is otherwise never judged. `buildShareText` forwards it too, or a first guess
    would read ⚠️ on the board and ✅ in the share text. Free mode passes nothing.

- **Pre-revealed daily clue** (`lib/game/reveal.js`, backend spec §3.7): every
  daily answer carries `reveal: { property, value }` — one word of the target's
  type line (`supertype`/`type`/`subtype`), chosen server-side per UTC day from
  the card's own type-line words, so it is the same for everyone. `revealHints()`
  turns it into a positive `type` hint (`t:kithkin`) seeded into `gatherHints`,
  so the Hint link and the Possible-cards bar include it from the first guess,
  and `GameBoard` counts that clue's constrained set once on load as the bar's
  starting value. `RevealClue.svelte` renders it above the guess input as plain
  centered text — no tag, box or frame, so it reads as a line of copy rather
  than a widget — as the sentence "Today we are guessing a Kithkin" / "an
  Artifact", with the revealed word in bold accent so the clue reads as the
  actionable part. The sentence is composed from `revealParts()` (lead /
  article / value) rather than one string, so the component styles only the
  word; `revealText()` stays the plain-text form for tests and non-markup
  consumers, and a test pins the two to recompose identically. The article
  comes from `articleFor()` — a phonetic test, not a
  vowel test: ~24% of type-line token occurrences need "an", and the `u` split
  is real (`a Unicorn` but `an Urza`). Every H-initial token is pronounced, so
  `h` always takes "a"; a silent-h word would need adding. The clue is one
  printed word, so a multi-word subtype arrives split (`Time Lord` → `Time`)
  and the sentence can read "a Time" — accepted; don't "fix" it by
  reintroducing a label-plus-word layout. Known residue, 57 of 35,385 cards
  (0.16%): a plural token (`Creature — Elves`), a function word (`Lady of
  Proper Etiquette`), and the Un-set `Stickers` type. Filtering those belongs in
  the backend's candidate pool, not in the copy. `dailyApi.js` parses
  it defensively (missing/malformed → `null`, never a load failure) and caches it
  under `mtg:daily-card:v2` — versioned so a pre-feature cached answer without a
  clue is not reused for the rest of the day. Free mode never has a reveal.

- **Guesses per game: 6** (`MAX_GUESSES` in `lib/game/gameState.js`, the one
  place to tune it). The endgame share bar's width is **not** tied to it: a row
  has one square per match level (`scoring.js SHARE_BLOCKS = MATCH_LEVELS = 6`),
  so the bar encodes closeness rather than the guess budget. The backend
  buckets wins 1..10 (`won_N_*` columns in D1); 7–10 simply stay zero under a
  6-guess limit, so no backend change or migration is needed. Tests derive from
  `MAX_GUESSES`/`SHARE_BLOCKS` rather than hardcoding the number.

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