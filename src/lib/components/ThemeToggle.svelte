<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { theme } from '../stores/theme.js';

  let current = 'light';
  let unsub;
  onMount(() => {
    theme.init();
    unsub = theme.subscribe((t) => (current = t));
  });
  onDestroy(() => unsub?.());
</script>

<button class="theme-toggle" on:click={() => theme.toggle()} title="Toggle light/dark theme" aria-label="Toggle light/dark theme">
  {current === 'dark' ? '☀️' : '🌙'}
</button>

<style>
  .theme-toggle {
    background: none;
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    font-size: 1rem;
  }
</style>
