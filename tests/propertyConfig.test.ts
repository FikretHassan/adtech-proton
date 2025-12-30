import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  resolveConfig,
  getConfigValue,
  mergeWithDefaults,
  hasPropertyConfig,
  getAvailableProperties
} from '../src/propertyConfig';
import propertyConfigDefault from '../src/propertyConfig';

// Mock property module
vi.mock('../src/property', () => ({
  getProperty: vi.fn(() => 'testsite')
}));

// Mock loader
const mockLoader = {
  log: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
});

describe('propertyConfig', () => {
  describe('default export', () => {
    it('exports resolveConfig', () => {
      expect(typeof propertyConfigDefault.resolveConfig).toBe('function');
    });

    it('exports getConfigValue', () => {
      expect(typeof propertyConfigDefault.getConfigValue).toBe('function');
    });

    it('exports mergeWithDefaults', () => {
      expect(typeof propertyConfigDefault.mergeWithDefaults).toBe('function');
    });

    it('exports hasPropertyConfig', () => {
      expect(typeof propertyConfigDefault.hasPropertyConfig).toBe('function');
    });

    it('exports getAvailableProperties', () => {
      expect(typeof propertyConfigDefault.getAvailableProperties).toBe('function');
    });

    it('exports isPropertyKeyed', () => {
      expect(typeof propertyConfigDefault.isPropertyKeyed).toBe('function');
    });
  });

  describe('resolveConfig', () => {
    it('returns null for null config', () => {
      expect(resolveConfig(null)).toBeNull();
    });

    it('returns undefined for undefined config', () => {
      expect(resolveConfig(undefined)).toBeUndefined();
    });

    it('resolves from properties wrapper', () => {
      const config = {
        properties: {
          testsite: { value: 'testsite-value' },
          default: { value: 'default-value' }
        }
      };
      const result = resolveConfig(config);
      expect(result).toEqual({ value: 'testsite-value' });
    });

    it('falls back to default in properties wrapper', () => {
      const config = {
        properties: {
          othersite: { value: 'other-value' },
          default: { value: 'default-value' }
        }
      };
      const result = resolveConfig(config);
      expect(result).toEqual({ value: 'default-value' });
    });

    it('resolves from direct property key', () => {
      const config = {
        testsite: { value: 'direct-value' },
        othersite: { value: 'other-value' }
      };
      const result = resolveConfig(config);
      expect(result).toEqual({ value: 'direct-value' });
    });

    it('falls back to default key', () => {
      const config = {
        default: { value: 'default-value' }
      };
      const result = resolveConfig(config);
      expect(result).toEqual({ value: 'default-value' });
    });

    it('returns flat config as-is', () => {
      const config = {
        selector: '.ads',
        breakpoints: { desktop: 1024 }
      };
      const result = resolveConfig(config);
      expect(result).toEqual(config);
    });

    it('accepts optional propertyId override', () => {
      const config = {
        properties: {
          customsite: { value: 'custom-value' },
          testsite: { value: 'test-value' }
        }
      };
      const result = resolveConfig(config, 'customsite');
      expect(result).toEqual({ value: 'custom-value' });
    });
  });

  describe('getConfigValue', () => {
    it('gets value from resolved config', () => {
      const config = {
        properties: {
          testsite: { timeout: 1000, enabled: true }
        }
      };
      expect(getConfigValue(config, 'timeout')).toBe(1000);
      expect(getConfigValue(config, 'enabled')).toBe(true);
    });

    it('returns undefined for missing key', () => {
      const config = {
        properties: {
          testsite: { timeout: 1000 }
        }
      };
      expect(getConfigValue(config, 'nonexistent')).toBeUndefined();
    });

    it('accepts propertyId override', () => {
      const config = {
        properties: {
          site1: { value: 'site1-value' },
          site2: { value: 'site2-value' }
        }
      };
      expect(getConfigValue(config, 'value', 'site2')).toBe('site2-value');
    });
  });

  describe('mergeWithDefaults', () => {
    it('merges property config with defaults', () => {
      const config = {
        properties: {
          testsite: { timeout: 2000 }
        }
      };
      const defaults = { timeout: 1000, enabled: true };
      const result = mergeWithDefaults(config, defaults);
      expect(result).toEqual({ timeout: 2000, enabled: true });
    });

    it('uses defaults when property config missing', () => {
      const config = {};
      const defaults = { timeout: 1000, enabled: true };
      const result = mergeWithDefaults(config, defaults);
      expect(result).toEqual({ timeout: 1000, enabled: true });
    });

    it('accepts propertyId override', () => {
      const config = {
        properties: {
          customsite: { timeout: 3000 }
        }
      };
      const defaults = { timeout: 1000, enabled: true };
      const result = mergeWithDefaults(config, defaults, 'customsite');
      expect(result).toEqual({ timeout: 3000, enabled: true });
    });
  });

  describe('hasPropertyConfig', () => {
    it('returns false for null config', () => {
      expect(hasPropertyConfig(null)).toBe(false);
    });

    it('returns false for undefined config', () => {
      expect(hasPropertyConfig(undefined)).toBe(false);
    });

    it('returns true when property exists in properties wrapper', () => {
      const config = {
        properties: {
          testsite: { value: 'test' }
        }
      };
      expect(hasPropertyConfig(config)).toBe(true);
    });

    it('returns false when property missing from properties wrapper', () => {
      const config = {
        properties: {
          othersite: { value: 'other' }
        }
      };
      expect(hasPropertyConfig(config)).toBe(false);
    });

    it('returns true for direct property key', () => {
      const config = {
        testsite: { value: 'test' }
      };
      expect(hasPropertyConfig(config)).toBe(true);
    });

    it('accepts propertyId override', () => {
      const config = {
        properties: {
          customsite: { value: 'custom' }
        }
      };
      expect(hasPropertyConfig(config, 'customsite')).toBe(true);
      expect(hasPropertyConfig(config, 'testsite')).toBe(false);
    });
  });

  describe('getAvailableProperties', () => {
    it('returns empty array for null config', () => {
      expect(getAvailableProperties(null)).toEqual([]);
    });

    it('returns empty array for undefined config', () => {
      expect(getAvailableProperties(undefined)).toEqual([]);
    });

    it('returns properties from properties wrapper', () => {
      const config = {
        properties: {
          site1: {},
          site2: {},
          default: {}
        }
      };
      const result = getAvailableProperties(config);
      expect(result).toContain('site1');
      expect(result).toContain('site2');
      expect(result).toContain('default');
    });

    it('returns known property keys', () => {
      const config = {
        default: { value: 1 },
        dev: { value: 2 },
        staging: { value: 3 },
        production: { value: 4 }
      };
      const result = getAvailableProperties(config);
      expect(result).toContain('default');
      expect(result).toContain('dev');
      expect(result).toContain('staging');
      expect(result).toContain('production');
    });

    it('deduplicates properties', () => {
      const config = {
        properties: {
          default: { a: 1 }
        },
        default: { b: 2 }
      };
      const result = getAvailableProperties(config);
      const defaultCount = result.filter(p => p === 'default').length;
      expect(defaultCount).toBe(1);
    });
  });

  describe('isPropertyKeyed', () => {
    it('returns false for null', () => {
      expect(propertyConfigDefault.isPropertyKeyed(null)).toBe(false);
    });

    it('returns false for non-object', () => {
      expect(propertyConfigDefault.isPropertyKeyed('string')).toBe(false);
      expect(propertyConfigDefault.isPropertyKeyed(123)).toBe(false);
    });

    it('returns true for properties wrapper', () => {
      expect(propertyConfigDefault.isPropertyKeyed({
        properties: { site1: {} }
      })).toBe(true);
    });

    it('returns true for known property markers', () => {
      expect(propertyConfigDefault.isPropertyKeyed({
        default: { value: 1 }
      })).toBe(true);
    });

    it('returns false for flat config', () => {
      expect(propertyConfigDefault.isPropertyKeyed({
        selector: '.ads',
        breakpoints: {}
      })).toBe(false);
    });
  });
});
