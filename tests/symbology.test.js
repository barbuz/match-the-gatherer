// This module runs fetchSymbols() at import time; track which storage writes
// happen so tests can assert against the published map.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('symbology', () => {
  let mod;

  beforeAll(async () => {
    const store = {};
    global.localStorage = {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
    };
    // Never resolve the module-level fetchSymbols() so tests stay hermetic.
    global.fetch = () => new Promise(() => {});
    mod = await import('../src/lib/api/symbology.js');
  });

  afterAll(() => {
    delete global.localStorage;
    delete global.fetch;
  });

  it('getSymbolMap returns nothing before any fetch resolves', () => {
    expect(mod.getSymbolMap()).toBeNull();
  });

  it('a failed fetch on cold start hydrates from the persisted cache', async () => {
    // Simulate offline: reject the fetch. There's a stored map from a
    // previous session and no in-memory mirror yet.
    localStorage.setItem('mtg:card-symbols', JSON.stringify({ '{R}': 'https://img/r.svg' }));
    global.fetch = () => Promise.reject(new Error('offline'));

    await mod.fetchSymbols();
    expect(mod.manaParts('{R}')).toEqual([{ token: '{R}', uri: 'https://img/r.svg' }]);
  });

  it('a failed fetch does not clobber an already-populated map', async () => {
    // After the mirror is populated, a failed fetch must keep the working
    // in-memory map even if storage has since changed or been cleared.
    localStorage.setItem('mtg:card-symbols', JSON.stringify({ '{R}': 'https://img/r.svg' }));
    mod.getSymbolMap();
    expect(mod.manaParts('{R}')).toEqual([{ token: '{R}', uri: 'https://img/r.svg' }]);
    global.fetch = () => Promise.reject(new Error('offline'));
    delete localStorage['mtg:card-symbols'];

    await mod.fetchSymbols();
    expect(mod.manaParts('{R}')).toEqual([{ token: '{R}', uri: 'https://img/r.svg' }]);
  });

  it('manage cost helpers split and validate mana strings', () => {
    expect(mod.tokenizeManaCost('{2}{R/G}')).toEqual(['{2}', '{R/G}']);
    expect(mod.isManaCost('{2}{R}')).toBe(true);
    expect(mod.isManaCost('2R')).toBe(false);
  });

  it('split mana containing repeated symbols without losing tokens', () => {
    // A {R}{R} cost must keep both tokens: GuessFeedback.svelte keyed-each
    // iteration is index-based now, so repeated symbols are safe to render.
    expect(mod.tokenizeManaCost('{R}{R}')).toEqual(['{R}', '{R}']);
    expect(mod.isManaCost('{R}{R}')).toBe(true);
  });
});