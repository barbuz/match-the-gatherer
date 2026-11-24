<script>
  import Router from 'svelte-spa-router';
  import DailyGame from './routes/DailyGame.svelte';
  import ThemeToggle from './lib/components/ThemeToggle.svelte';
  import VersionFooter from './lib/components/VersionFooter.svelte';
  import InfoDialog from './lib/components/InfoDialog.svelte';

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
    <a class="brand" href="#/">Match the Gatherer</a>
    <div class="topbar-actions">
      <InfoDialog />
      <ThemeToggle />
    </div>
  </header>
  <main>
    <Router {routes} />
  </main>
  <VersionFooter />
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.8rem;
    border-bottom: 1px solid var(--border);
  }
  .topbar-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .brand {
    font-weight: 700;
    text-decoration: none;
    color: var(--fg);
  }
  main {
    flex: 1;
    padding: 0.8rem 0;
  }
</style>
