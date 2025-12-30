/**
 * Tests for dimensionResolver module
 * Tests dimension value resolution from cookies, meta tags, window paths, URLs, etc.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getWindowPath,
  getMetaContent,
  resolveSource,
  applyTransform,
  resolveDimensionValue
} from '../src/dimensionResolver';

// Mock sizemapping module
vi.mock('../src/sizemapping', () => ({
  default: {
    getBreakpoint: vi.fn(() => 'desktop')
  }
}));

describe('dimensionResolver', () => {
  // Store original values
  let originalCookie: string;
  let originalLocation: Location;

  beforeEach(() => {
    // Save original values
    originalCookie = document.cookie;
    originalLocation = window.location;

    // Clear any existing mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up meta tags
    document.querySelectorAll('meta[name^="test"]').forEach(el => el.remove());
    document.querySelectorAll('meta[name="og:site_name"]').forEach(el => el.remove());
    document.querySelectorAll('meta[name="page:section"]').forEach(el => el.remove());

    // Clean up window properties
    delete (window as any).testApp;
    delete (window as any).myConfig;
    delete (window as any).nested;

    // Clear cookies by expiring them
    document.cookie.split(';').forEach(cookie => {
      const name = cookie.split('=')[0].trim();
      if (name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });
  });

  // ==========================================================================
  // getWindowPath Tests
  // ==========================================================================
  describe('getWindowPath', () => {
    it('returns value from simple window property', () => {
      (window as any).testApp = 'test-value';
      expect(getWindowPath('testApp')).toBe('test-value');
    });

    it('returns value from nested window path', () => {
      (window as any).testApp = {
        config: {
          value: 'nested-value'
        }
      };
      expect(getWindowPath('testApp.config.value')).toBe('nested-value');
    });

    it('returns undefined for non-existent property', () => {
      expect(getWindowPath('nonExistent')).toBeUndefined();
    });

    it('returns null for non-existent nested path', () => {
      (window as any).testApp = { config: {} };
      expect(getWindowPath('testApp.config.missing.deep')).toBeNull();
    });

    it('returns null when intermediate path is null', () => {
      (window as any).testApp = { config: null };
      expect(getWindowPath('testApp.config.value')).toBeNull();
    });

    it('returns null when intermediate path is undefined', () => {
      (window as any).testApp = { config: undefined };
      expect(getWindowPath('testApp.config.value')).toBeNull();
    });

    it('handles empty string path', () => {
      // Empty string splits to [''], which accesses window[''] which is undefined
      expect(getWindowPath('')).toBeUndefined();
    });

    it('returns object reference for object paths', () => {
      const configObj = { key: 'value' };
      (window as any).testApp = { config: configObj };
      expect(getWindowPath('testApp.config')).toBe(configObj);
    });

    it('returns array values', () => {
      (window as any).testApp = { items: ['a', 'b', 'c'] };
      expect(getWindowPath('testApp.items')).toEqual(['a', 'b', 'c']);
    });

    it('handles array index access', () => {
      (window as any).testApp = { items: ['first', 'second'] };
      expect(getWindowPath('testApp.items.0')).toBe('first');
      expect(getWindowPath('testApp.items.1')).toBe('second');
    });

    it('returns boolean values correctly', () => {
      (window as any).testApp = { enabled: true, disabled: false };
      expect(getWindowPath('testApp.enabled')).toBe(true);
      expect(getWindowPath('testApp.disabled')).toBe(false);
    });

    it('returns numeric values correctly', () => {
      (window as any).testApp = { count: 42, zero: 0 };
      expect(getWindowPath('testApp.count')).toBe(42);
      expect(getWindowPath('testApp.zero')).toBe(0);
    });

    it('handles deeply nested paths', () => {
      (window as any).nested = { a: { b: { c: { d: { e: 'deep' } } } } };
      expect(getWindowPath('nested.a.b.c.d.e')).toBe('deep');
    });
  });

  // ==========================================================================
  // getMetaContent Tests
  // ==========================================================================
  describe('getMetaContent', () => {
    it('returns content from existing meta tag', () => {
      const meta = document.createElement('meta');
      meta.name = 'test-meta';
      meta.content = 'meta-value';
      document.head.appendChild(meta);

      expect(getMetaContent('test-meta')).toBe('meta-value');
    });

    it('returns null for non-existent meta tag', () => {
      expect(getMetaContent('non-existent-meta')).toBeNull();
    });

    it('returns empty string for meta tag with empty content', () => {
      const meta = document.createElement('meta');
      meta.name = 'test-empty';
      meta.content = '';
      document.head.appendChild(meta);

      // Empty content is distinct from missing tag - return empty string, not null
      expect(getMetaContent('test-empty')).toBe('');
    });

    it('handles meta tags in body', () => {
      const meta = document.createElement('meta');
      meta.name = 'test-body-meta';
      meta.content = 'body-value';
      document.body.appendChild(meta);

      expect(getMetaContent('test-body-meta')).toBe('body-value');

      // Clean up
      meta.remove();
    });

    it('returns first match when multiple meta tags exist', () => {
      const meta1 = document.createElement('meta');
      meta1.name = 'test-duplicate';
      meta1.content = 'first-value';
      document.head.appendChild(meta1);

      const meta2 = document.createElement('meta');
      meta2.name = 'test-duplicate';
      meta2.content = 'second-value';
      document.head.appendChild(meta2);

      expect(getMetaContent('test-duplicate')).toBe('first-value');

      // Clean up
      meta1.remove();
      meta2.remove();
    });

    it('handles special characters in meta name', () => {
      const meta = document.createElement('meta');
      meta.name = 'og:site_name';
      meta.content = 'Site Name';
      document.head.appendChild(meta);

      expect(getMetaContent('og:site_name')).toBe('Site Name');
    });

    it('handles special characters in meta content', () => {
      const meta = document.createElement('meta');
      meta.name = 'test-special';
      meta.content = 'Value with "quotes" & <special> chars';
      document.head.appendChild(meta);

      expect(getMetaContent('test-special')).toBe('Value with "quotes" & <special> chars');

      // Clean up
      meta.remove();
    });
  });

  // ==========================================================================
  // resolveSource Tests
  // ==========================================================================
  describe('resolveSource', () => {
    describe('meta source', () => {
      it('resolves meta tag value', () => {
        const meta = document.createElement('meta');
        meta.name = 'page:section';
        meta.content = 'news';
        document.head.appendChild(meta);

        expect(resolveSource({ source: 'meta', key: 'page:section' })).toBe('news');
      });

      it('returns null for missing meta tag', () => {
        expect(resolveSource({ source: 'meta', key: 'missing-meta' })).toBeNull();
      });
    });

    describe('window source', () => {
      it('resolves window path using path property', () => {
        (window as any).myConfig = { geo: 'US' };
        expect(resolveSource({ source: 'window', path: 'myConfig.geo' })).toBe('US');
      });

      it('resolves window path using key property (fallback)', () => {
        (window as any).myConfig = { region: 'EU' };
        expect(resolveSource({ source: 'window', key: 'myConfig.region' })).toBe('EU');
      });

      it('prefers path over key', () => {
        (window as any).myConfig = { fromPath: 'path-value', fromKey: 'key-value' };
        expect(resolveSource({
          source: 'window',
          path: 'myConfig.fromPath',
          key: 'myConfig.fromKey'
        })).toBe('path-value');
      });

      it('returns null for missing window path', () => {
        expect(resolveSource({ source: 'window', path: 'missing.path' })).toBeNull();
      });
    });

    describe('cookie source', () => {
      it('resolves cookie value', () => {
        document.cookie = 'testCookie=cookie-value; path=/';
        expect(resolveSource({ source: 'cookie', key: 'testCookie' })).toBe('cookie-value');
      });

      it('handles URL-encoded cookie values', () => {
        document.cookie = 'encodedCookie=' + encodeURIComponent('value with spaces') + '; path=/';
        expect(resolveSource({ source: 'cookie', key: 'encodedCookie' })).toBe('value with spaces');
      });

      it('returns null for missing cookie', () => {
        expect(resolveSource({ source: 'cookie', key: 'missingCookie' })).toBeNull();
      });

      it('handles cookie at start of string', () => {
        // Clear all cookies first
        document.cookie.split(';').forEach(c => {
          const name = c.split('=')[0].trim();
          if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        });

        document.cookie = 'firstCookie=first-value; path=/';
        expect(resolveSource({ source: 'cookie', key: 'firstCookie' })).toBe('first-value');
      });

      it('handles cookie in middle of string', () => {
        document.cookie = 'aCookie=a-value; path=/';
        document.cookie = 'bCookie=b-value; path=/';
        document.cookie = 'cCookie=c-value; path=/';
        expect(resolveSource({ source: 'cookie', key: 'bCookie' })).toBe('b-value');
      });

      it('handles special characters in cookie values', () => {
        document.cookie = 'specialCookie=' + encodeURIComponent('value=with;special') + '; path=/';
        expect(resolveSource({ source: 'cookie', key: 'specialCookie' })).toBe('value=with;special');
      });
    });

    describe('url source', () => {
      it('resolves URL parameter value', () => {
        // Mock location.search
        Object.defineProperty(window, 'location', {
          value: { ...originalLocation, search: '?testParam=url-value' },
          writable: true
        });

        expect(resolveSource({ source: 'url', key: 'testParam' })).toBe('url-value');
      });

      it('returns null for missing URL parameter', () => {
        Object.defineProperty(window, 'location', {
          value: { ...originalLocation, search: '?other=value' },
          writable: true
        });

        expect(resolveSource({ source: 'url', key: 'missingParam' })).toBeNull();
      });

      it('handles URL-encoded parameter values', () => {
        Object.defineProperty(window, 'location', {
          value: { ...originalLocation, search: '?encoded=' + encodeURIComponent('hello world') },
          writable: true
        });

        expect(resolveSource({ source: 'url', key: 'encoded' })).toBe('hello world');
      });

      it('handles empty URL parameter', () => {
        Object.defineProperty(window, 'location', {
          value: { ...originalLocation, search: '?empty=' },
          writable: true
        });

        expect(resolveSource({ source: 'url', key: 'empty' })).toBe('');
      });

      it('handles multiple URL parameters', () => {
        Object.defineProperty(window, 'location', {
          value: { ...originalLocation, search: '?a=1&b=2&c=3' },
          writable: true
        });

        expect(resolveSource({ source: 'url', key: 'b' })).toBe('2');
      });
    });

    describe('static source', () => {
      it('returns static string value', () => {
        expect(resolveSource({ source: 'static', value: 'static-string' })).toBe('static-string');
      });

      it('returns static number value', () => {
        expect(resolveSource({ source: 'static', value: 42 })).toBe(42);
      });

      it('returns static boolean value', () => {
        expect(resolveSource({ source: 'static', value: true })).toBe(true);
        expect(resolveSource({ source: 'static', value: false })).toBe(false);
      });

      it('returns static object value', () => {
        const obj = { key: 'value' };
        expect(resolveSource({ source: 'static', value: obj })).toBe(obj);
      });

      it('returns undefined for missing value property', () => {
        expect(resolveSource({ source: 'static' })).toBeUndefined();
      });
    });

    describe('internal source', () => {
      it('resolves sizemapping.getBreakpoint', () => {
        expect(resolveSource({ source: 'internal', fn: 'sizemapping.getBreakpoint' })).toBe('desktop');
      });

      it('returns null for unknown internal function', () => {
        expect(resolveSource({ source: 'internal', fn: 'unknown.function' })).toBeNull();
      });

      it('returns null when fn is missing', () => {
        expect(resolveSource({ source: 'internal' })).toBeNull();
      });
    });

    describe('invalid inputs', () => {
      it('returns null for null input', () => {
        expect(resolveSource(null)).toBeNull();
      });

      it('returns null for undefined input', () => {
        expect(resolveSource(undefined)).toBeNull();
      });

      it('returns null for empty object', () => {
        expect(resolveSource({})).toBeNull();
      });

      it('returns null for unknown source type', () => {
        expect(resolveSource({ source: 'unknown', key: 'test' })).toBeNull();
      });

      it('returns null for missing source property', () => {
        expect(resolveSource({ key: 'test' })).toBeNull();
      });
    });
  });

  // ==========================================================================
  // applyTransform Tests
  // ==========================================================================
  describe('applyTransform', () => {
    describe('lowercase transform', () => {
      it('converts string to lowercase', () => {
        expect(applyTransform('HELLO WORLD', 'lowercase')).toBe('hello world');
      });

      it('handles mixed case', () => {
        expect(applyTransform('HeLLo WoRLD', 'lowercase')).toBe('hello world');
      });

      it('handles already lowercase', () => {
        expect(applyTransform('already lowercase', 'lowercase')).toBe('already lowercase');
      });
    });

    describe('uppercase transform', () => {
      it('converts string to uppercase', () => {
        expect(applyTransform('hello world', 'uppercase')).toBe('HELLO WORLD');
      });

      it('handles mixed case', () => {
        expect(applyTransform('HeLLo WoRLD', 'uppercase')).toBe('HELLO WORLD');
      });

      it('handles already uppercase', () => {
        expect(applyTransform('ALREADY UPPERCASE', 'uppercase')).toBe('ALREADY UPPERCASE');
      });
    });

    describe('trim transform', () => {
      it('removes leading whitespace', () => {
        expect(applyTransform('   hello', 'trim')).toBe('hello');
      });

      it('removes trailing whitespace', () => {
        expect(applyTransform('hello   ', 'trim')).toBe('hello');
      });

      it('removes both leading and trailing whitespace', () => {
        expect(applyTransform('   hello world   ', 'trim')).toBe('hello world');
      });

      it('handles tabs and newlines', () => {
        expect(applyTransform('\t\nhello\n\t', 'trim')).toBe('hello');
      });

      it('handles already trimmed string', () => {
        expect(applyTransform('no whitespace', 'trim')).toBe('no whitespace');
      });
    });

    describe('removeTrailingColon transform', () => {
      it('removes trailing colon', () => {
        expect(applyTransform('value:', 'removeTrailingColon')).toBe('value');
      });

      it('does not remove colon in middle', () => {
        expect(applyTransform('key:value', 'removeTrailingColon')).toBe('key:value');
      });

      it('handles no colon', () => {
        expect(applyTransform('no colon', 'removeTrailingColon')).toBe('no colon');
      });

      it('handles multiple colons, only removes trailing', () => {
        expect(applyTransform('a:b:c:', 'removeTrailingColon')).toBe('a:b:c');
      });
    });

    describe('unknown transform', () => {
      it('returns value unchanged for unknown transform', () => {
        expect(applyTransform('value', 'unknownTransform')).toBe('value');
      });
    });

    describe('non-string values', () => {
      it('returns null unchanged', () => {
        expect(applyTransform(null, 'lowercase')).toBeNull();
      });

      it('returns undefined unchanged', () => {
        expect(applyTransform(undefined, 'lowercase')).toBeUndefined();
      });

      it('returns number unchanged', () => {
        expect(applyTransform(42, 'lowercase')).toBe(42);
      });

      it('returns boolean unchanged', () => {
        expect(applyTransform(true, 'lowercase')).toBe(true);
      });

      it('returns object unchanged', () => {
        const obj = { key: 'value' };
        expect(applyTransform(obj, 'lowercase')).toBe(obj);
      });

      it('returns array unchanged', () => {
        const arr = ['a', 'b', 'c'];
        expect(applyTransform(arr, 'lowercase')).toBe(arr);
      });
    });
  });

  // ==========================================================================
  // resolveDimensionValue Tests
  // ==========================================================================
  describe('resolveDimensionValue', () => {
    describe('string input', () => {
      it('returns string value directly', () => {
        expect(resolveDimensionValue('static-value')).toBe('static-value');
      });

      it('handles empty string', () => {
        expect(resolveDimensionValue('')).toBe('');
      });
    });

    describe('null/undefined input', () => {
      it('returns null for null input', () => {
        expect(resolveDimensionValue(null)).toBeNull();
      });

      it('returns null for undefined input', () => {
        expect(resolveDimensionValue(undefined)).toBeNull();
      });
    });

    describe('single source (legacy format)', () => {
      it('resolves single static source', () => {
        expect(resolveDimensionValue({ source: 'static', value: 'test' })).toBe('test');
      });

      it('resolves single window source', () => {
        (window as any).testApp = { value: 'window-value' };
        expect(resolveDimensionValue({ source: 'window', path: 'testApp.value' })).toBe('window-value');
      });

      it('returns default when source is empty', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: null,
          default: 'fallback'
        })).toBe('fallback');
      });
    });

    describe('sources array (fallback chain)', () => {
      it('returns first truthy value', () => {
        (window as any).testApp = { value: 'first-value' };
        expect(resolveDimensionValue({
          sources: [
            { source: 'window', path: 'testApp.value' },
            { source: 'static', value: 'second-value' }
          ]
        })).toBe('first-value');
      });

      it('falls back to second source when first is null', () => {
        expect(resolveDimensionValue({
          sources: [
            { source: 'window', path: 'missing.path' },
            { source: 'static', value: 'fallback-value' }
          ]
        })).toBe('fallback-value');
      });

      it('falls back to third source when first two are null', () => {
        expect(resolveDimensionValue({
          sources: [
            { source: 'window', path: 'missing.path1' },
            { source: 'window', path: 'missing.path2' },
            { source: 'static', value: 'third-value' }
          ]
        })).toBe('third-value');
      });

      it('skips empty string values in fallback chain', () => {
        const meta = document.createElement('meta');
        meta.name = 'test-empty-meta';
        meta.content = '';
        document.head.appendChild(meta);

        expect(resolveDimensionValue({
          sources: [
            { source: 'meta', key: 'test-empty-meta' },
            { source: 'static', value: 'fallback' }
          ]
        })).toBe('fallback');

        meta.remove();
      });

      it('returns null when all sources fail and no default', () => {
        expect(resolveDimensionValue({
          sources: [
            { source: 'window', path: 'missing1' },
            { source: 'window', path: 'missing2' }
          ]
        })).toBeNull();
      });

      it('returns default when all sources fail', () => {
        expect(resolveDimensionValue({
          sources: [
            { source: 'window', path: 'missing1' },
            { source: 'window', path: 'missing2' }
          ],
          default: 'default-value'
        })).toBe('default-value');
      });
    });

    describe('transforms', () => {
      it('applies transform to resolved value', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: 'UPPERCASE',
          transform: 'lowercase'
        })).toBe('uppercase');
      });

      it('applies transform before mapping', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: 'KEY',
          transform: 'lowercase',
          mapping: { key: 'mapped-value' }
        })).toBe('mapped-value');
      });

      it('skips transform when value is null', () => {
        expect(resolveDimensionValue({
          source: 'window',
          path: 'missing.path',
          transform: 'lowercase',
          default: 'DEFAULT'
        })).toBe('DEFAULT');
      });
    });

    describe('mappings', () => {
      it('applies mapping to resolved value', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: 'uk',
          mapping: { uk: 'GB', us: 'US' }
        })).toBe('GB');
      });

      it('returns raw value when mapping not found', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: 'fr',
          mapping: { uk: 'GB', us: 'US' }
        })).toBe('fr');
      });

      it('handles mapping to falsy values', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: 'key',
          mapping: { key: '' }
        })).toBe('');

        expect(resolveDimensionValue({
          source: 'static',
          value: 'key',
          mapping: { key: 0 }
        })).toBe(0);

        expect(resolveDimensionValue({
          source: 'static',
          value: 'key',
          mapping: { key: false }
        })).toBe(false);
      });

      it('does not apply mapping when value is null', () => {
        expect(resolveDimensionValue({
          source: 'window',
          path: 'missing.path',
          mapping: { key: 'value' },
          default: 'default'
        })).toBe('default');
      });
    });

    describe('combined transform and mapping', () => {
      it('applies transform then mapping', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: '  UK  ',
          transform: 'trim',
          mapping: { UK: 'United Kingdom' }
        })).toBe('United Kingdom');
      });

      it('handles transform + mapping + default', () => {
        expect(resolveDimensionValue({
          source: 'static',
          value: '  UNKNOWN  ',
          transform: 'trim',
          mapping: { UK: 'United Kingdom' },
          default: 'Other'
        })).toBe('UNKNOWN'); // Raw value returned when mapping not found
      });
    });

    describe('edge cases', () => {
      it('returns null for object without source or sources', () => {
        expect(resolveDimensionValue({ transform: 'lowercase' })).toBeNull();
      });

      it('handles empty sources array', () => {
        expect(resolveDimensionValue({ sources: [], default: 'fallback' })).toBe('fallback');
      });

      it('handles sources array with empty objects', () => {
        expect(resolveDimensionValue({
          sources: [{}, { source: 'static', value: 'valid' }]
        })).toBe('valid');
      });
    });

    describe('real-world scenarios', () => {
      it('resolves geo from cookie with fallback to window', () => {
        document.cookie = 'geo=US; path=/';

        expect(resolveDimensionValue({
          sources: [
            { source: 'cookie', key: 'geo' },
            { source: 'window', path: 'geoData.country' }
          ],
          transform: 'uppercase'
        })).toBe('US');
      });

      it('resolves pagetype from meta tag with mapping', () => {
        const meta = document.createElement('meta');
        meta.name = 'test-page-type';
        meta.content = 'article';
        document.head.appendChild(meta);

        expect(resolveDimensionValue({
          source: 'meta',
          key: 'test-page-type',
          mapping: {
            article: 'content',
            homepage: 'front',
            section: 'index'
          }
        })).toBe('content');

        meta.remove();
      });

      it('resolves debug flag from URL parameter', () => {
        Object.defineProperty(window, 'location', {
          value: { ...originalLocation, search: '?debug=true' },
          writable: true
        });

        expect(resolveDimensionValue({
          source: 'url',
          key: 'debug',
          default: 'false'
        })).toBe('true');
      });

      it('handles complex fallback chain with transforms', () => {
        // No meta, no cookie, no window - should use static fallback
        expect(resolveDimensionValue({
          sources: [
            { source: 'meta', key: 'test-missing-meta' },
            { source: 'cookie', key: 'missingCookie' },
            { source: 'window', path: 'missing.path' },
            { source: 'static', value: 'fallback' }
          ],
          transform: 'uppercase'
        })).toBe('FALLBACK');
      });
    });
  });
});
