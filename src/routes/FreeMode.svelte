<script>
  import GameBoard from '../lib/components/GameBoard.svelte';

  let round = 0;
</script>

<div class="free-mode">
  {#key round}
    <GameBoard mode="free" />
  {/key}
  <div class="actions">
    <button on:click={() => (round += 1)}>🔀 New random card</button>
  </div>
</div>

<style>
  .actions {
    display: flex;
    justify-content: center;
    margin: 1rem 0;
  }
  button {
    padding: 0.5rem 1.2rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
    font-size: 0.95rem;
  }
  button:hover {
    background: var(--accent-soft);
  }
</style>
