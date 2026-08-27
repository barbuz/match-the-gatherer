# Match the Gatherer

A Wordle-style daily guessing game for Magic: The Gathering cards, built as a
Svelte Progressive Web App with no backend server. All data comes directly from
the [Scryfall](https://scryfall.com) public API.

[Try it live!](https://barbuz.github.io/match-the-gatherer)

## Gameplay

- Guess the daily target card in up to 10 tries (same card worldwide, picked
  deterministically from the UTC date).
- Each guess returns per-property feedback: mana cost/value, colors, types,
  supertypes, subtypes, power/toughness/loyalty/defense, dual-faced status,
  first release date, and oracle tags.
- Free Mode offers unlimited practice games with random targets and no stats
  tracking.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # unit tests (comparison / scoring / daily seed)
npm run build    # production build to dist/ (BASE_PATH=/repo-name/ for GH Pages)
npm run preview  # preview the production build
```

## Deployment

Pushes to `main` (or a manual dispatch) build and deploy to GitHub Pages via
`.github/workflows/deploy.yml`. The service-worker version string lives in
`src/lib/version.js` and is shown in small print on the main page — bump it
with every change.
