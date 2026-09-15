# Match the Gatherer

A Wordle-style daily guessing game for Magic: The Gathering cards, built as a
Svelte Progressive Web App. Card data comes directly from the
[Scryfall](https://scryfall.com) public API; the daily puzzle and its anonymous
stats come from the [backend](https://github.com/barbuz/match-the-gatherer-backend).

[Try it live!](https://barbuz.github.io/match-the-gatherer)

## Gameplay

- Guess the daily target card in up to 10 tries. The same card is served to
  every player worldwide by the backend, so no client can pick a different one.
- Each guess returns per-property feedback: mana cost/value, colors, types,
  supertypes, subtypes, power/toughness/loyalty/defense, dual-faced status,
  first release date, and oracle tags.
- At the end of a daily game the result is reported anonymously and the day's
  worldwide distribution (solved-in-N, split by hint usage) is shown alongside
  your own share text.
- Free Mode offers unlimited practice games with random targets, no stats
  tracking, and no backend involvement.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (comparison / scoring / daily seed / backend clients)
npm run build    # production build to dist/ (BASE_PATH=/repo-name/ for GH Pages)
npm run preview  # preview the production build
```

The daily game requires the backend. Point the app at a local `wrangler dev`
instance with `VITE_API_BASE=http://localhost:8787 npm run dev`; otherwise it
uses the deployed Worker.

## Deployment

Pushes to `main` (or a manual dispatch) build and deploy to GitHub Pages via
`.github/workflows/deploy.yml`. The service-worker version string lives in
`src/lib/version.js` and is shown in small print on the main page — bump it
with every change.
