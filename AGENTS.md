# AGENTS.md — Match the Gatherer

Wordle-style MTG daily guessing game (Svelte PWA, no backend. Spec: `match-the-gatherer-spec.md`.

## Commands

- `npm test` — vitest (comparison / scoring / gameState / hints / symbology / dailySeed)
- `npm run build` — production build to `dist/` (set `BASE_PATH=/repo-name/` on GitHub Pages)
- `npm run preview` — serve the production build

## Key facts

- Scryfall exact-name search (`cards/search?q=!"name" prefer:oldest`) also matches
  **individual face names**, so `lib/api/scryfall.js` prefers a whole-card name
  match, then face-name match, then first result.

- Keywords come straight from the card object (`card.keywords`) — no otag bulk
  download (removed.
- `catalog/card-names` needs `A-` prefix filtering (Alchemy-only cards. The
  names download is a singleton in-flight promise (`stores/backgroundFetch.js`), cached
  in idb-keyval (`storage/dataCache.js`), falling back to the cache when offline.

- Mana costs render as SVG images via Scryfall `/symbology` (`lib/api/symbology.js`):
  fetched once at module import (fire-and-forget), cached in localStorage
  (`mtg:card-symbols`) and mirrored in a `$symbols` store. Consumers render images
  only when the map is loaded and fall back to the ascii `{..}` placeholder otherwise
  (`manaParts()`).

- Daily pick: FNV-1a(UTC 'YYYY-MM-DD') % names.length → deterministic worldwide.

- Game logic is DOM-free in `src/lib/game/` (incl. `gameState.js`, which imports
  svelte/store but runs fine under node) for unit-testability. Anti-leak rules:
  properties absent on the GUESSED card render no row;(so a creature-only target is
  never leaked); layout row appears only for non-normal guesses; score denominators
  count only `applicable` properties of the guessed card.

- Hints (`src/lib/game/hints.js`): `gatherHints()` distills every guess's feedback into a
  deduplicated minimal hint list; `buildScryfallSearchUrl()` turns it into a
  `https://scryfall.com/search/?q=...` link with clauses `t:`, `c:`, `c=`, `kw:`,
  `layout:`, `mana=`, `mv=`, `pow=`, `tou=`, `loy=`, `date>`/`date<`, negations via
  `-`/`!=`, and always ending `not:reprint`. Defense stats have no Scryfall operator, so
  those hints are dropped; fully-matched properties pin their value (later partial/wrong
  hints for the same property are dropped); same-direction date bounds fold down to the
  tightest,and an exact date subsumes all date hints. The HintButton opens that URL, and
  each used hint press marks its share row with 🔦 (`buildShareText` `hintsUsed`).

- Daily games persist per UTC day (`mtg:game:${dayKey}`, via `lib/game/gameState.js`);
  free-mode games are memory-only and never touch stats. Stats live in `storage/statsStore.js`
  (`mtg:stats`), idempotent per day, capped at 365 days.

- Scryfall rejects browser-less fetches without a User-Agent (Node returns 400);
  browsers are fine.

- Version string in `src/lib/version.js` is shown in footer AND embedded in the
  service worker — bump on every change. (`package.json` `version` is independent.)

- vite-plugin-pwa `injectManifest` + `workbox-precaching`; SW code lives in
  `src/service-worker.js` and must reference `self.__WB_MANIFEST`. Navigations are
  served network-first (`mtg:navigation`); the SW answers a `GET_VERSION` message with
  `APP_VERSION` and calls `skipWaiting()` / `clients.claim()`.



- Emoji fonts may be missing in headless browsers (glyphs show as boxes) — not a bug.