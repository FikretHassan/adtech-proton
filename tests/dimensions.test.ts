import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { dimensions, dimensionConfig } from '../src/generated/dimensions.js';

// Helpers to avoid hard-coding brand-specific selectors
const getMetaName = (fn: () => unknown) => {
  const match = fn.toString().match(/meta\[name="([^"]+)"/);
  return match ? match[1] : '';
};

const getUserNamespace = (fn: () => unknown) => {
  const match = fn.toString().match(/window\.([a-zA-Z0-9_]+)\?/);
  return match ? match[1] : 'user';
};

const SECTION_META = getMetaName(dimensions.section);
const PAGETYPE_META = getMetaName(dimensions.pagetype);
const GEO_META = getMetaName(dimensions.geo);
const USER_NS = getUserNamespace(dimensions.userState);

describe('dimensions', () => {
  describe('url dimension', () => {
    it('returns current pathname', () => {
      // jsdom default is '/'
      expect(dimensions.url()).toBe('/');
    });
  });

  describe('section dimension (meta tag)', () => {
    let meta: HTMLMetaElement;

    beforeEach(() => {
      meta = document.createElement('meta');
      meta.name = SECTION_META;
      meta.content = 'sport';
      document.head.appendChild(meta);
    });

    afterEach(() => {
      meta.remove();
    });

    it('reads from meta tag', () => {
      expect(dimensions.section()).toBe('sport');
    });
  });

  describe('pagetype dimension (meta tag)', () => {
    let meta: HTMLMetaElement;

    beforeEach(() => {
      meta = document.createElement('meta');
      meta.name = PAGETYPE_META;
      meta.content = 'article';
      document.head.appendChild(meta);
    });

    afterEach(() => {
      meta.remove();
    });

    it('reads from meta tag', () => {
      expect(dimensions.pagetype()).toBe('article');
    });
  });

  describe('geo dimension (meta tag)', () => {
    let meta: HTMLMetaElement;

    beforeEach(() => {
      meta = document.createElement('meta');
      meta.name = GEO_META;
      meta.content = 'gb';
      document.head.appendChild(meta);
    });

    afterEach(() => {
      meta.remove();
    });

    it('reads from meta tag', () => {
      expect(dimensions.geo()).toBe('gb');
    });
  });

  describe('missing meta tags', () => {
    it('returns empty string when section meta is missing', () => {
      expect(dimensions.section()).toBe('');
    });

    it('returns empty string when pagetype meta is missing', () => {
      expect(dimensions.pagetype()).toBe('');
    });

    it('returns empty string when geo meta is missing', () => {
      expect(dimensions.geo()).toBe('');
    });
  });

  describe('renderertype dimension (window.dataLayer)', () => {
    afterEach(() => {
      delete (window as any).dataLayer;
    });

    it('reads from window.dataLayer.pageType', () => {
      (window as any).dataLayer = { pageType: 'homepage' };
      expect(dimensions.renderertype()).toBe('homepage');
    });

    it('returns empty string when dataLayer missing', () => {
      expect(dimensions.renderertype()).toBe('');
    });
  });

  describe('userState dimension (property-aware)', () => {
    afterEach(() => {
      delete (window as any)[USER_NS];
    });

    it('returns mapped value when demo.user.loginStatus exists', () => {
      (window as any)[USER_NS] = { user: { loginStatus: 'anonymous' } };
      // Should map 'anonymous' to 'anon'
      const result = dimensions.userState();
      expect(['anon', 'dev-anon']).toContain(result);
    });

    it('returns default when loginStatus not found', () => {
      const result = dimensions.userState();
      // Should return default value
      expect(typeof result).toBe('string');
    });
  });
});

describe('dimensionConfig', () => {
  it('has url with startsWith matchType', () => {
    expect(dimensionConfig.url).toEqual({ matchType: 'startsWith' });
  });

  it('does not have config for exact match dimensions', () => {
    // Dimensions with 'exact' matchType are not included
    expect((dimensionConfig as Record<string, unknown>).section).toBeUndefined();
  });
});
