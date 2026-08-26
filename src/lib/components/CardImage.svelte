<script>
  export let card;
  export let guessed = false;

  $: src =
    card?.image_uris?.small ??
    card?.image_uris?.normal ??
    card?.card_faces?.[0]?.image_uris?.small ??
    null;
</script>

{#if src}
  <img class="card-image" class:guessed {src} alt={card?.name ?? 'card'} title={card?.name ?? ''} loading="lazy" />
{:else}
  <div class="card-image placeholder" class:guessed>{card?.name ?? '?'}</div>
{/if}

<style>
  .card-image {
    width: 72px;
    border-radius: 6px;
    display: block;
    flex: 0 0 auto;
  }
  .card-image.guessed {
    outline: 2px solid var(--border);
  }
  .placeholder {
    height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 0.6rem;
    background: var(--surface);
    border: 1px solid var(--border);
    padding: 2px;
  }
</style>
