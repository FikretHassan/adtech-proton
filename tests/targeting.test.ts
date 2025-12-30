import { describe, it, expect } from 'vitest';
import {
  matchesRule,
  isExcluded,
  evaluateTargeting,
  matchesDomain,
  matchesProperty
} from '../src/targeting';

describe('matchesRule', () => {
  describe('exact matching (default)', () => {
    it('returns true when value matches exactly', () => {
      expect(matchesRule('sport', ['sport', 'news'])).toBe(true);
    });

    it('returns false when value does not match', () => {
      expect(matchesRule('puzzles', ['sport', 'news'])).toBe(false);
    });

    it('is case insensitive', () => {
      expect(matchesRule('SPORT', ['sport'])).toBe(true);
      expect(matchesRule('sport', ['SPORT'])).toBe(true);
    });

    it('returns true for empty rules (no restrictions)', () => {
      expect(matchesRule('anything', [])).toBe(true);
    });

    it('returns true when rules include "all"', () => {
      expect(matchesRule('anything', ['all'])).toBe(true);
      expect(matchesRule('anything', ['sport', 'all'])).toBe(true);
    });
  });

  describe('startsWith matching', () => {
    it('matches values that start with rule', () => {
      expect(matchesRule('/news/article', ['/news'], 'startsWith')).toBe(true);
      expect(matchesRule('/news', ['/news'], 'startsWith')).toBe(true);
    });

    it('does not match values that do not start with rule', () => {
      expect(matchesRule('/sport/article', ['/news'], 'startsWith')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(matchesRule('/NEWS/article', ['/news'], 'startsWith')).toBe(true);
    });
  });

  describe('includes matching', () => {
    it('matches values that contain rule', () => {
      expect(matchesRule('/news/article/sport', ['sport'], 'includes')).toBe(true);
    });

    it('does not match values that do not contain rule', () => {
      expect(matchesRule('/news/article', ['sport'], 'includes')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(matchesRule('/news/SPORT/article', ['sport'], 'includes')).toBe(true);
    });
  });
});

describe('isExcluded', () => {
  it('returns false for empty rules', () => {
    expect(isExcluded('anything', [])).toBe(false);
  });

  it('returns true when value matches exclusion rule exactly', () => {
    expect(isExcluded('sport', ['sport', 'puzzles'])).toBe(true);
  });

  it('returns false when value does not match exclusion rule', () => {
    expect(isExcluded('news', ['sport', 'puzzles'])).toBe(false);
  });

  it('uses startsWith matching when specified', () => {
    expect(isExcluded('/puzzles/crossword', ['/puzzles'], 'startsWith')).toBe(true);
    expect(isExcluded('/news/article', ['/puzzles'], 'startsWith')).toBe(false);
  });

  it('uses includes matching when specified', () => {
    expect(isExcluded('/news/puzzles/today', ['puzzles'], 'includes')).toBe(true);
  });
});

describe('evaluateTargeting', () => {
  describe('basic include/exclude', () => {
    it('returns matched when no rules specified', () => {
      const result = evaluateTargeting({}, {}, { zone: 'sport' });
      expect(result.matched).toBe(true);
    });

    it('includes when value matches include rule', () => {
      const result = evaluateTargeting(
        { zone: ['sport', 'news'] },
        {},
        { zone: 'sport' }
      );
      expect(result.matched).toBe(true);
    });

    it('excludes when value does not match include rule', () => {
      const result = evaluateTargeting(
        { zone: ['sport', 'news'] },
        {},
        { zone: 'puzzles' }
      );
      expect(result.matched).toBe(false);
      expect(result.reason).toContain('Not included by zone');
    });

    it('excludes when value matches exclude rule', () => {
      const result = evaluateTargeting(
        {},
        { zone: ['puzzles'] },
        { zone: 'puzzles' }
      );
      expect(result.matched).toBe(false);
      expect(result.reason).toContain('Excluded by zone');
    });

    it('exclude takes precedence over include', () => {
      const result = evaluateTargeting(
        { zone: ['sport', 'puzzles'] },
        { zone: ['puzzles'] },
        { zone: 'puzzles' }
      );
      expect(result.matched).toBe(false);
    });
  });

  describe('with dimensionConfig matchTypes', () => {
    it('uses startsWith for configured dimensions', () => {
      const result = evaluateTargeting(
        { url: ['/news'] },
        {},
        { url: '/news/article/123' },
        { url: { matchType: 'startsWith' } }
      );
      expect(result.matched).toBe(true);
    });

    it('uses exact match by default', () => {
      const result = evaluateTargeting(
        { url: ['/news'] },
        {},
        { url: '/news/article/123' }
      );
      expect(result.matched).toBe(false);
    });
  });

  describe('special functions', () => {
    it('excludes when exclude.special returns true', () => {
      const result = evaluateTargeting(
        { zone: ['all'] },
        { special: () => true },
        { zone: 'sport' }
      );
      expect(result.matched).toBe(false);
      expect(result.reason).toBe('Excluded by special function');
    });

    it('includes when include.special returns true (overrides other rules)', () => {
      const result = evaluateTargeting(
        { special: () => true },
        { zone: ['sport'] },
        { zone: 'sport' }
      );
      expect(result.matched).toBe(true);
      expect(result.reason).toBe('Included by special function');
    });

    it('handles special function errors gracefully', () => {
      const result = evaluateTargeting(
        { special: () => { throw new Error('test'); } },
        {},
        { zone: 'sport' }
      );
      expect(result.matched).toBe(true); // Falls through to normal evaluation
    });
  });

  describe('multiple dimensions', () => {
    it('requires all include dimensions to match', () => {
      const result = evaluateTargeting(
        { zone: ['sport'], pagetype: ['article'] },
        {},
        { zone: 'sport', pagetype: 'gallery' }
      );
      expect(result.matched).toBe(false);
      expect(result.reason).toContain('pagetype');
    });

    it('matches when all dimensions pass', () => {
      const result = evaluateTargeting(
        { zone: ['sport'], pagetype: ['article'] },
        {},
        { zone: 'sport', pagetype: 'article' }
      );
      expect(result.matched).toBe(true);
    });
  });
});

describe('matchesDomain', () => {
  it('returns true for empty domains', () => {
    expect(matchesDomain([])).toBe(true);
  });

  it('returns true when domains includes "all"', () => {
    expect(matchesDomain(['all'], 'example.com')).toBe(true);
  });

  it('returns true when current domain is in list', () => {
    expect(matchesDomain(['example.com', 'test.com'], 'example.com')).toBe(true);
  });

  it('returns false when current domain is not in list', () => {
    expect(matchesDomain(['example.com'], 'other.com')).toBe(false);
  });
});

describe('matchesProperty', () => {
  it('returns true for undefined properties', () => {
    expect(matchesProperty(undefined, 'mysite')).toBe(true);
  });

  it('returns true for empty properties array', () => {
    expect(matchesProperty([], 'mysite')).toBe(true);
  });

  it('returns true when properties includes "all"', () => {
    expect(matchesProperty(['all'], 'mysite')).toBe(true);
  });

  it('returns true when current property is in list', () => {
    expect(matchesProperty(['mysite', 'othersite'], 'mysite')).toBe(true);
  });

  it('returns false when current property is not in list', () => {
    expect(matchesProperty(['othersite'], 'mysite')).toBe(false);
  });
});
