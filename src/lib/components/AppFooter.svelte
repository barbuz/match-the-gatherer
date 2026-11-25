<script>
  import { APP_VERSION } from '../version.js';

  const SITE = 'https://barbuz.github.io';
  const REPO = 'https://github.com/barbuz/match-the-gatherer';
  const TIP = 'https://donate.stripe.com/9B6eVd1madcF8Dt8yp1gs00';
</script>

<footer class="foot">
  <p class="foot__links">
    <a href={SITE} target="_blank" rel="noopener">made by barbuz</a>
    <span aria-hidden="true">·</span>
    <a href={REPO} target="_blank" rel="noopener">source ↗</a>
    <span aria-hidden="true">·</span>
    <a href={TIP} target="_blank" rel="noopener">leave a tip ↗</a>
  </p>
  <p class="foot__ver">v{APP_VERSION}</p>
</footer>

<style>
  .foot {
    margin-top: 2rem;
    padding: 1.1rem 1rem 1.25rem;
    border-top: 1px solid var(--border);
    text-align: center;
  }
  .foot__links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: baseline;
    gap: 0.45rem;
    margin: 0;
    font-family: var(--font-mono);
    font-size: 0.72rem;
    color: var(--muted);
  }
  .foot__links a {
    color: var(--muted);
    text-decoration: none;
  }
  .foot__links a:hover {
    color: var(--accent);
  }
  .foot__ver {
    margin: 0.4rem 0 0;
    font-family: var(--font-mono);
    font-size: 0.62rem;
    color: var(--muted);
    opacity: 0.7;
  }
</style>
