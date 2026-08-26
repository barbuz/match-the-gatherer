# AGENTS.md — Match the Gatherer

Wordle-style MTG daily guessing game (Svelte PWA, no backend). Spec: `match-the-gatherer-spec.md`.

## Commands

- `npm test` — vitest (comparison / scoring / dailySeed)
- `npm run build` — production build to `dist/` (set `BASE_PATH=/repo-name/` on GitHub Pages)
- `npm run preview` — serve the production build

## Key facts

- Scryfall exact-name search (`cards/search?q=!"name" prefer:oldest`) also matches
  **individual face names**, so `lib/api/scryfall.js` prefers a whole-card name
  match, then face-name match, then first result.
- Oracle tags: `api.scryfall.com/bulk-data/oracle_tags` → `jsonl_download_uri` is
  **JSONL gz** (one tag object per line, `taggings[].oracle_id`); inverted into
  `Map<oracle_id, label[]>` via `DecompressionStream` (pako fallback).
- `catalog/card-names` needs `A-` prefix filtering (Alchemy-only cards).
- Daily pick: FNV-1a(UTC 'YYYY-MM-DD') % names.length → deterministic worldwide.
- Scryfall rejects browser-less fetches without a User-Agent (Node returns 400);
  browsers are fine.
- Version string in `src/lib/version.js` is shown in footer AND embedded in the
  service worker — bump on every change.
- vite-plugin-pwa `injectManifest` + `workbox-precaching`; SW code lives in
  `src/service-worker.js` and must reference `self.__WB_MANIFEST`.
- Comparison/scoring logic is DOM-free in `src/lib/game/` for unit-testability.
- Emoji fonts may be missing in headless browsers (glyphs show as boxes) — not a bug.
