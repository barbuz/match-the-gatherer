import { describe, it, expect } from 'vitest';
import { revealHints, revealText } from '../src/lib/game/reveal.js';

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
  it('reads as a sentence naming the revealed word', () => {
    expect(revealText({ property: 'subtype', value: 'Kithkin' })).toBe(
      'Today we are guessing a Kithkin',
    );
    expect(revealText({ property: 'supertype', value: 'Legendary' })).toBe(
      'Today we are guessing a Legendary',
    );
  });

  it('still reads as a sentence for a split multi-word subtype', () => {
    expect(revealText({ property: 'subtype', value: 'Time' })).toBe('Today we are guessing a Time');
  });

  it('is null without a value', () => {
    expect(revealText(null)).toBeNull();
    expect(revealText({ property: 'subtype', value: ' ' })).toBeNull();
  });
});
