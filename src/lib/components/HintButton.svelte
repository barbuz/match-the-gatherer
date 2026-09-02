<script>
  /** Button that opens a Scryfall search for all cards still matching the
   *  player's gathered hints. Enabled only once the player has guessed. */
  import { createEventDispatcher } from 'svelte';

  export let disabled = false;

  const dispatch = createEventDispatcher();
</script>

<button
  class="hint-btn"
  {disabled}
  on:click={() => dispatch('press')}
  title={disabled ? 'Make a guess first' : 'Open matching cards on Scryfall'}
>
  <span class="logo" aria-hidden="true">
    <!-- Vendored from https://scryfall.com/ so the Scryfall logo stays
         bundled offline with the PWA; kept in sync manually. -->
    <img src={`${import.meta.env.BASE_URL}scryfall-logo.svg`} alt="Scryfall" />
  </span>
  <span class="label">Hint</span>
</button>

<style>
  .hint-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
  }
  .hint-btn:hover:not(:disabled) {
    background: var(--accent-soft);
  }
  .hint-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .logo {
    width: 1.35rem;
    height: 1.35rem;
    border-radius: 50%;
    background: #23262b;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .logo img {
    width: 1.1rem;
    height: 1.1rem;
    display: block;
  }
</style>