<script>
  /**
   * Info modal: how-to-play guide (spec §8 style) + the Fan Content
   * Policy disclaimer and Scryfall attribution, shown at the bottom of the
   * panel. Opens from the ⓘ button next to the theme toggle.
   */
  import { onMount, onDestroy } from 'svelte';

  let open = false;
  let visible = false;

  function openModal() {
    open = true;
    visible = false;
    requestAnimationFrame(() => (visible = true));
  }

  function closeModal() {
    visible = false;
    setTimeout(() => (open = false), 150);
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && open) closeModal();
  }

  onMount(() => document.addEventListener('keydown', onKeydown));
  onDestroy(() => document.removeEventListener('keydown', onKeydown));
</script>

<button class="info-btn" on:click={openModal} title="How to play" aria-label="How to play" aria-expanded={open}>
  <span aria-hidden="true">ⓘ</span>
</button>

{#if open}
  <div
    class="backdrop"
    class:visible
    on:click|self={closeModal}
    on:keydown={onKeydown}
  >
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="info-title" aria-describedby="info-desc">
      <button class="close-btn" on:click={closeModal} aria-label="Close" title="Close (Esc)">×</button>

      <h2 id="info-title">How to play</h2>
      <p id="info-desc" class="lede">
        Guess the same daily Magic: The Gathering card as the whole world, in up to 10 tries. A new
        card is picked each day at midnight UTC.
      </p>

      <ol class="steps">
        <li>
          <strong>Make a guess.</strong> Type a card name and pick it from the autocomplete list. Cards
          already guessed are removed from the list.
        </li>
        <li>
          <strong>Read the feedback.</strong> Every property of your guess is compared against the target:
          green highlight means the value matches the target completely, means strikethrough means it isn't on the target at all,
          and yellow highlights show which parts of your values hit. The percentage badge shows how closely
          your guess matched overall.

          <ul class="props">
            <li>Mana cost and mana value (MV)</li>
            <li>Colors</li>
            <li>Type line — supertypes, types,and subtypes</li>
            <li>Power/toughness (creatures), loyalty (planeswalkers), defense (battles)</li>
            <li>Layout (e.g. double-faced)</li>
            <li>First release date (showing also if it's older or newer)</li>
            <li>Keywords appearing on the card's text</li>
          </ul>
        </li>
        <li>
          <strong>Narrow it down.</strong> The cards are laid out oldest-to-newest by first printing, with
          dividers showing what's older than, same day as, or newer than the target. Press <strong>Hint</strong> to
          open a Scryfall search for every card still matching everything you've learned so far.

        </li>
        <li>
          <strong>Win,or reveal.</strong> Find the card in 10 tries to win; otherwise the target is revealed. At the end,
          you can share your score as an emoji bar graph.

        </li>
      </ol>

      <h3>Free mode & stats</h3>
      <p>
        <strong>Free mode</strong> gives you unlimited practice games with random targets — no stats are
        recorded there. Daily games are tracked locally in your browser (games played, won, win rate), and
        you can close the tab any time and come back to the game later in the day.
      </p>

      <div class="disclaimer" aria-label="Disclaimer and attribution">
        <p>
          Match the Gatherer is unofficial Fan Content permitted under the Fan Content Policy. Not
          approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the
          Coast. ©Wizards of the Coast LLC.
        </p>
        <p>
          Card data, images, and the mana symbols are provided by <a href="https://scryfall.com" target="_blank" rel="noopener noreferrer">Scryfall</a>.
          This project is not affiliated with or endorsed by Scryfall or Wizards of the Coast.
        </p>
      </div>
    </div>
  </div>
{/if}

<style>
  .info-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    color: var(--fg);
    cursor: pointer;
    font-size: 1rem;
  }
  .info-btn:hover {
    background: var(--accent-soft);
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.55);
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .backdrop.visible {
    opacity: 1;
  }
  .dialog {
    position: relative;
    max-width: 32rem;
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.2rem 1.4rem;
    transform: translateY(8px) scale(0.98);
    transition: transform 0.15s ease;
  }
  .backdrop.visible .dialog {
    transform: none;
  }
  .close-btn {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    width: 2rem;
    height: 2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--fg);
    cursor: pointer;
    font-size: 1.1rem;
    line-height: 1;
  }
  .close-btn:hover {
    background: var(--accent-soft);
  }
  h2 {
    margin: 0 0 0.4rem;
  }
  h3 {
    margin: 1.1rem 0 0.4rem;
    font-size: 0.95rem;
  }
  .lede {
    margin-top: 0;
    color: var(--muted);
  }
  .steps {
    margin: 0.5rem 0 0;
    padding-left: 1.3rem;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    font-size: 0.92rem;
  }
  .props {
    margin: 0.4rem 0 0;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .disclaimer {
    margin-top: 1.2rem;
    padding: 0.7rem 0.9rem;
    border-top: 1px solid var(--border);
    font-size: 0.72rem;
    color: var(--muted);
  }
  .disclaimer p {
    margin: 0.3rem 0;
  }
  .disclaimer a {
    color: var(--accent);
  }
</style>
