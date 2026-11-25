<script>
  let { size = 26, title = '' } = $props();
</script>

<svg
  class="app-mark"
  width={size}
  height={size}
  viewBox="0 0 64 64"
  role={title ? 'img' : undefined}
  aria-hidden={title ? undefined : 'true'}
  focusable="false"
>
  {#if title}<title>{title}</title>{/if}
  <rect
    x="17"
    y="11"
    width="30"
    height="42"
    rx="5"
    fill="none"
    stroke="currentColor"
    stroke-width="4.5"
  />
  <rect x="27" y="27" width="10" height="10" transform="rotate(45 32 32)" fill="var(--accent)" />
</svg>
