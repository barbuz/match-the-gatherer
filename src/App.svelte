<script>
  import Router from 'svelte-spa-router';
  import DailyGame from './routes/DailyGame.svelte';
  import ThemeToggle from './lib/components/ThemeToggle.svelte';
  import AppFooter from './lib/components/AppFooter.svelte';
  import InfoDialog from './lib/components/InfoDialog.svelte';
  import AppMark from './lib/components/AppMark.svelte';

  // The daily game is the app: open the page and play. `/daily` stays as an
  // alias for old links, and unknown hashes fall back to the game rather than
  // rendering a blank page.
  const routes = {
    '/': DailyGame,
    '/daily': DailyGame,
    '*': DailyGame,
  };
</script>

<div class="app">
  <header class="topbar">
    <a class="brand" href="#/" aria-label="match the gatherer — home">
      <AppMark size={30} />
      <span class="brand__name">match the <strong>gatherer</strong></span>
    </a>
    <div class="topbar-actions">
      <InfoDialog />
      <ThemeToggle />
    </div>
  </header>
  <main>
    <Router {routes} />
  </main>
  <AppFooter />
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    padding: 0.55rem 0.9rem;
    border-bottom: 1px solid var(--line);
    background: var(--bg);
  }
  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    color: var(--fg);
    text-decoration: none;
  }
  .brand__name {
    font-family: var(--font-display);
    font-size: 1.02rem;
    letter-spacing: -0.025em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .brand__name strong {
    font-weight: 800;
  }
  main {
    flex: 1;
    padding: 0.9rem 0 0;
  }
  @media (max-width: 420px) {
    .brand__name {
      font-size: 0.92rem;
    }
  }
</style>
