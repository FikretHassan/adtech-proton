import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isWildcard,
  matchesDomain,
  matchesExactDomain,
  matchesWildcardDomain,
  matchesDomains,
  init,
  getProperty,
  getPropertyConfig,
  getPropertyIds,
  isValidProperty,
  setProperty,
  reset
} from '../src/property';

describe('isWildcard', () => {
  it('returns true for wildcard domains', () => {
    expect(isWildcard('*.example.com')).toBe(true);
    expect(isWildcard('*.example.co.uk')).toBe(true);
  });

  it('returns false for non-wildcard domains', () => {
    expect(isWildcard('example.com')).toBe(false);
    expect(isWildcard('www.example.com')).toBe(false);
  });
});

describe('matchesDomain', () => {
  it('returns true for "all"', () => {
    expect(matchesDomain('anything.com', 'all')).toBe(true);
  });

  it('matches exact domains', () => {
    expect(matchesDomain('example.com', 'example.com')).toBe(true);
    expect(matchesDomain('example.com', 'other.com')).toBe(false);
  });

  it('matches wildcard domains', () => {
    expect(matchesDomain('sub.example.com', '*.example.com')).toBe(true);
    expect(matchesDomain('deep.sub.example.com', '*.example.com')).toBe(true);
    expect(matchesDomain('example.com', '*.example.com')).toBe(true);
    expect(matchesDomain('other.com', '*.example.com')).toBe(false);
  });
});

describe('matchesExactDomain', () => {
  it('returns false for empty domains', () => {
    expect(matchesExactDomain('example.com', [])).toBe(false);
  });

  it('matches only exact domains, ignores wildcards', () => {
    expect(matchesExactDomain('example.com', ['example.com', '*.other.com'])).toBe(true);
    expect(matchesExactDomain('sub.other.com', ['example.com', '*.other.com'])).toBe(false);
  });
});

describe('matchesWildcardDomain', () => {
  it('returns false for empty domains', () => {
    expect(matchesWildcardDomain('sub.example.com', [])).toBe(false);
  });

  it('matches only wildcard domains, ignores exact', () => {
    expect(matchesWildcardDomain('sub.example.com', ['other.com', '*.example.com'])).toBe(true);
    expect(matchesWildcardDomain('other.com', ['other.com', '*.example.com'])).toBe(false);
  });
});

describe('matchesDomains', () => {
  it('returns false for empty domains', () => {
    expect(matchesDomains('example.com', [])).toBe(false);
  });

  it('matches against any domain in list', () => {
    expect(matchesDomains('example.com', ['example.com', 'other.com'])).toBe(true);
    expect(matchesDomains('sub.example.com', ['*.example.com', 'other.com'])).toBe(true);
    expect(matchesDomains('nomatch.com', ['example.com', 'other.com'])).toBe(false);
  });
});

describe('property detection', () => {
  beforeEach(() => {
    reset();
  });

  describe('init', () => {
    it('returns a valid property ID', () => {
      const result = init();
      expect(getPropertyIds()).toContain(result);
    });

    it('caches result after first init', () => {
      const first = init();
      const second = init();
      expect(first).toBe(second);
    });
  });

  describe('getProperty', () => {
    it('initializes if not already done', () => {
      const result = getProperty();
      expect(typeof result).toBe('string');
    });

    it('returns cached value on subsequent calls', () => {
      const first = getProperty();
      const second = getProperty();
      expect(first).toBe(second);
    });
  });

  describe('setProperty', () => {
    it('overrides the current property', () => {
      init();
      setProperty('default');
      expect(getProperty()).toBe('default');
    });

    it('ignores invalid property IDs', () => {
      init();
      const before = getProperty();
      setProperty('nonexistent-property-id');
      expect(getProperty()).toBe(before);
    });
  });

  describe('getPropertyConfig', () => {
    it('returns config for current property', () => {
      init();
      const config = getPropertyConfig();
      expect(config).toBeDefined();
    });

    it('returns config for specified property', () => {
      const config = getPropertyConfig('default');
      expect(config).toBeDefined();
    });

    it('returns null for invalid property', () => {
      const config = getPropertyConfig('nonexistent');
      expect(config).toBeNull();
    });
  });

  describe('getPropertyIds', () => {
    it('returns array of property IDs', () => {
      const ids = getPropertyIds();
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).toContain('default');
    });
  });

  describe('isValidProperty', () => {
    it('returns true for valid properties', () => {
      expect(isValidProperty('default')).toBe(true);
    });

    it('returns false for invalid properties', () => {
      expect(isValidProperty('nonexistent')).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears cached property and re-initializes', () => {
      init();
      reset();
      // After reset, getProperty will re-initialize
      const result = getProperty();
      expect(getPropertyIds()).toContain(result);
    });
  });
});
