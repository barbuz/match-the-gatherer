/** Dark/light theme store: system default + persisted manual override (§12). */
import { writable } from 'svelte/store';

const THEME_KEY = 'mtg:theme';

function initialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* storage unavailable */
  }
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function createThemeStore() {
  const { subscribe, update } = writable(initialTheme());
  return {
    subscribe,
    toggle() {
      update((t) => {
        const next = t === 'dark' ? 'light' : 'dark';
        apply(next);
        return next;
      });
    },
    init() {
      update((t) => {
        apply(t);
        return t;
      });
    },
  };
}

function apply(theme) {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

export const theme = createThemeStore();
