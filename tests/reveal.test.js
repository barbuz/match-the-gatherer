import { describe, it, expect } from 'vitest';
import { revealHints, revealText, revealLabel } from '../src/lib/game/reveal.js';

describe('revealHints', () => {
  it('turns every type-line property into a positive `type` hint', () => {
    expect(revealHints({ property: 'subtype', value: 'Kithkin' })).toEqual([
      { kind: 'type', value: 'Kithkin', negated: false },
    ]);
    expect(revealHints({ property: 'type', value: 'Creature' })[0]).toMatchObject({ kind: 'type' });
    expect(revealHints({ property: 'supertype', value: 'Legendary' })[0]).toMatchObject({
      kind: 'type',
    });
  });

  it('yields no hints when there is nothing to reveal', () => {
    expect(revealHints(null)).toEqual([]);
    expect(revealHints(undefined)).toEqual([]);
    expect(revealHints({ property: 'subtype', value: '' })).toEqual([]);
    expect(revealHints({ property: 'unknown', value: 'X' })).toEqual([]);
  });
});

describe('revealText', () => {
  it('reads as a sentence naming the word', () => {
    expect(revealText({ property: 'subtype', value: 'Kithkin' })).toBe(
      'Today we are guessing a Kithkin',
    );
  });

  it('is null without a value', () => {
    expect(revealText(null)).toBeNull();
    expect(revealText({ property: 'subtype', value: ' ' })).toBeNull();
  });
});

describe('revealLabel', () => {
  it('names the property', () => {
    expect(revealLabel({ property: 'subtype' })).toBe('Subtype');
    expect(revealLabel({ property: 'type' })).toBe('Type');
    expect(revealLabel({ property: 'supertype' })).toBe('Supertype');
    expect(revealLabel(null)).toBeNull();
  });
});
