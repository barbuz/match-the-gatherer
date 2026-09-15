<script>
  /**
   * Worldwide distribution for the day (backend spec §4.1), from the
   * `POST /api/stats` response. Wins are split by guess count, with the
   * hint-using wins layered on top of the plain ones. Read-only; renders
   * nothing until the sink has answered.
   */
  import { MAX_GUESSES } from '../game/gameState.js';

  export let stats = null; // { won, lost, abandoned, byGuesses }

  $: byGuesses = stats?.byGuesses ?? {};
  $: maxBucket = Math.max(
    1,
    ...Object.entries(byGuesses).map(([, v]) => (v?.plain ?? 0) + (v?.hint ?? 0)),
  );
  $: lost = stats?.lost ?? 0;
  $: abandoned = stats?.abandoned ?? 0;
</script>

{#if stats}
  <div class="community">
    <table>
      <thead>
        <tr><th class="head">Solved in</th><th class="head">Players</th></tr>
      </thead>
      <tbody>
        {#each Array.from({ length: MAX_GUESSES }, (_, i) => i + 1) as n}
          {@const plain = byGuesses[String(n)]?.plain ?? 0}
          {@const hint = byGuesses[String(n)]?.hint ?? 0}
          {@const total = plain + hint}
          <tr>
            <th scope="row">{n}</th>
            <td>
              <span
                class="bar"
                style={`width: ${(total / maxBucket) * 100}%`}
                title={`${plain} without a hint, ${hint} with a hint`}
              >
                <span class="plain" style={`width: ${total ? (plain / total) * 100 : 0}%`}></span>
              </span>
            </td>
            <td class="count">{total || ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="totals">
      Everyone solved in N tries, worldwide. {lost} lost · {abandoned} abandoned.
      <span class="legend">Solid = no hint · faded = used a hint.</span>
    </p>
  </div>
{/if}

<style>
  .community {
    margin: 1rem 0;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8rem;
  }
  .head {
    color: var(--muted);
    font-weight: 600;
    text-align: left;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  th[scope='row'] {
    width: 2rem;
    text-align: right;
    color: var(--muted);
    font-weight: 600;
    padding-right: 0.4rem;
  }
  td {
    padding: 0.1rem 0;
  }
  .bar {
    display: flex;
    height: 0.7rem;
    min-width: 1px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--accent-soft);
  }
  .plain {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .count {
    width: 2.5rem;
    text-align: right;
    color: var(--muted);
  }
  .totals {
    color: var(--muted);
    font-size: 0.75rem;
    margin: 0.6rem 0 0;
  }
  .legend {
    margin-left: 0.5rem;
  }
</style>