<script>
  import { onMount, onDestroy } from 'svelte';
  import { theme } from '../stores/theme.js';

  let current = 'light';
  let unsub;
  onMount(() => {
    theme.init();
    unsub = theme.subscribe((t) => (current = t));
  });
  onDestroy(() => unsub?.());

  const other = () => (current === 'dark' ? 'light' : 'dark');
</script>

<button
  class="theme-toggle"
  class:is-dark={current === 'dark'}
  onclick={() => theme.toggle()}
  aria-label={`Switch to ${other()} theme`}
  title={`Switch to ${other()} theme`}
>
  <span class="thumb" aria-hidden="true"></span>
  <span class="icon" class:on={current === 'light'} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </svg>
  </span>
  <span class="icon" class:on={current === 'dark'} aria-hidden="true">
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  </span>
</button>

<style>
  .theme-toggle {
    position: relative;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    width: 3.9rem;
    height: 1.95rem;
    padding: 0.15rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    cursor: pointer;
  }
  .thumb {
    position: absolute;
    top: 0.15rem;
    left: 0.15rem;
    width: 1.55rem;
    height: 1.55rem;
    border-radius: 50%;
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    transition: transform var(--dur-base) var(--ease);
  }
  .theme-toggle.is-dark .thumb {
    transform: translateX(1.9rem);
  }
  .icon {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color var(--dur-fast) var(--ease);
  }
  .icon.on {
    color: var(--accent);
  }
</style>
