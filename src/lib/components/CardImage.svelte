<script>
  export let card;
  export let guessed = false;
  export let large = false;

  $: src = large
    ? card?.image_uris?.normal ??
      card?.image_uris?.large ??
      card?.card_faces?.[0]?.image_uris?.normal ??
      card?.card_faces?.[0]?.image_uris?.large ??
      null
    : card?.image_uris?.small ??
      card?.image_uris?.normal ??
      card?.card_faces?.[0]?.image_uris?.small ??
      null;
</script>

{#if src}
  <img class="card-image" class:guessed class:large {src} alt={card?.name ?? 'card'} title={card?.name ?? ''} loading="lazy" />
{:else}
  <div class="card-image placeholder" class:guessed class:large>{card?.name ?? '?'}</div>
{/if}

<style>
  .card-image {
    width: 72px;
    border-radius: 6px;
    display: block;
    flex: 0 0 auto;
  }
  .card-image.large {
    width: 240px;
    max-width: 100%;
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
  .placeholder.large {
    height: 335px;
    font-size: 0.9rem;
  }
</style>
