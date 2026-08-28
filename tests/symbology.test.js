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

  it('reloadSymbolMap bypasses the memo and picks up a newly stored map', async () => {
    // Seed storage, then trigger the memoized read path.
    localStorage.setItem('mtg:card-symbols', JSON.stringify({ '{R}': 'https://img/r.svg' }));
    mod.getSymbolMap();
    expect(mod.manaParts('{R}')).toEqual([{ token: '{R}', uri: 'https://img/r.svg' }]);

    // Now storage changes (e.g. a later session persisted more data). The
    // memoized getSymbolMap still returns the stale in-memory map…
    localStorage.setItem('mtg:card-symbols', JSON.stringify({ '{R}': 'https://img/r.svg', '{G}': 'https://img/g.svg' }));
    expect(mod.getSymbolMap().has('{G}')).toBe(false);

    // …whereas reloadSymbolMap re-reads storage and picks up the new entry.
    const mapped = mod.reloadSymbolMap();
    expect(mapped.get('{G}')).toBe('https://img/g.svg');
    expect(mod.manaParts('{R}{G}')).toEqual([
      { token: '{R}', uri: 'https://img/r.svg' },
      { token: '{G}', uri: 'https://img/g.svg' },
    ]);
  });

  it('manage cost helpers split and validate mana strings', () => {
    expect(mod.tokenizeManaCost('{2}{R/G}')).toEqual(['{2}', '{R/G}']);
    expect(mod.isManaCost('{2}{R}')).toBe(true);
    expect(mod.isManaCost('2R')).toBe(false);
  });
});