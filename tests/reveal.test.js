import { describe, it, expect } from 'vitest';
import { articleFor, revealHints, revealText } from '../src/lib/game/reveal.js';

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

describe('articleFor', () => {
  it('picks "an" before a written vowel', () => {
    // Every one of these is a real type-line token, and "an" is the common
    // case — ~24% of token occurrences need it.
    for (const w of ['Artifact', 'Instant', 'Enchantment', 'Elf', 'Elemental', 'Ogre', 'Imp', 'Aura']) {
      expect(articleFor(w), w).toBe('an');
    }
  });

  it('picks "a" before a consonant', () => {
    for (const w of ['Kithkin', 'Creature', 'Legendary', 'Goblin', 'Sorcery', 'Land']) {
      expect(articleFor(w), w).toBe('a');
    }
  });

  it('treats a "you-" u as a consonant sound and other u words as vowels', () => {
    // The split matters: these are all real tokens, and both spellings exist.
    expect(articleFor('Unicorn')).toBe('a');
    expect(articleFor('Universewalker')).toBe('a');
    expect(articleFor('Urza')).toBe('an');
    expect(articleFor("Urza's")).toBe('an');
    expect(articleFor('Ugin')).toBe('an');
    expect(articleFor('Utrom')).toBe('an');
  });

  it('gives "a" before h, since no token has a silent h', () => {
    for (const w of ['Human', 'Horror', 'Hero', 'Hydra', 'Halfling']) {
      expect(articleFor(w), w).toBe('a');
    }
  });

  it('is case-insensitive and tolerates blank input', () => {
    expect(articleFor('artifact')).toBe('an');
    expect(articleFor('  ELF ')).toBe('an');
    expect(articleFor('')).toBe('a');
    expect(articleFor(null)).toBe('a');
    expect(articleFor(undefined)).toBe('a');
  });
});

describe('revealText', () => {
  it('reads as a sentence with the right article', () => {
    expect(revealText({ property: 'subtype', value: 'Kithkin' })).toBe(
      'Today we are guessing a Kithkin',
    );
    expect(revealText({ property: 'supertype', value: 'Legendary' })).toBe(
      'Today we are guessing a Legendary',
    );
    expect(revealText({ property: 'type', value: 'Artifact' })).toBe(
      'Today we are guessing an Artifact',
    );
    expect(revealText({ property: 'subtype', value: 'Elf' })).toBe(
      'Today we are guessing an Elf',
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
