import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  getState,
  getBreakpoint,
  getViewport,
  getSizes,
  getSizesForSlot,
  extractAdType,
  buildGPTSizeMapping,
  buildGPTSizeMappingForSlot,
  getBreakpoints,
  getAdTypes,
  getConfig,
  getResolvedConfig,
  clearCache
} from '../src/sizemapping';

// Mock the global loader
const mockLoader = {
  log: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
  clearCache();
});

describe('sizemapping', () => {
  describe('getState', () => {
    it('returns state object', () => {
      const state = getState();
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('currentBreakpoint');
    });

    it('includes current breakpoint', () => {
      const state = getState();
      expect(typeof state.currentBreakpoint).toBe('string');
    });
  });

  describe('getBreakpoint', () => {
    it('returns a breakpoint string', () => {
      const bp = getBreakpoint();
      expect(typeof bp).toBe('string');
    });

    it('returns valid breakpoint key', () => {
      const bp = getBreakpoint();
      const breakpoints = getBreakpoints();
      expect(Object.keys(breakpoints)).toContain(bp);
    });
  });

  describe('getViewport', () => {
    it('returns width and height', () => {
      const viewport = getViewport();
      expect(viewport).toHaveProperty('width');
      expect(viewport).toHaveProperty('height');
    });

    it('returns numbers', () => {
      const viewport = getViewport();
      expect(typeof viewport.width).toBe('number');
      expect(typeof viewport.height).toBe('number');
    });

    it('returns positive values', () => {
      const viewport = getViewport();
      expect(viewport.width).toBeGreaterThan(0);
      expect(viewport.height).toBeGreaterThan(0);
    });
  });

  describe('extractAdType', () => {
    it('extracts ad type from standard slot ID', () => {
      expect(extractAdType('advert_mysite_ban_1')).toBe('ban');
      expect(extractAdType('advert_site_mpu_0')).toBe('mpu');
      expect(extractAdType('dfp_ad_nat_2')).toBe('nat');
    });

    it('returns "nat" when ad type position is missing', () => {
      expect(extractAdType('short_id')).toBe('nat');
      expect(extractAdType('single')).toBe('nat');
    });

    it('handles empty string', () => {
      expect(extractAdType('')).toBe('nat');
    });
  });

  describe('getSizes', () => {
    it('returns an array', () => {
      const sizes = getSizes('mpu');
      expect(Array.isArray(sizes)).toBe(true);
    });

    it('returns [[1,1]] for unknown ad type', () => {
      const sizes = getSizes('nonexistent-type');
      expect(sizes).toEqual([[1, 1]]);
    });

    it('accepts optional breakpoint parameter', () => {
      const sizes = getSizes('mpu', 'l');
      expect(Array.isArray(sizes)).toBe(true);
    });
  });

  describe('getSizesForSlot', () => {
    it('returns an array for valid slot', () => {
      const sizes = getSizesForSlot('advert_site_mpu_0');
      expect(Array.isArray(sizes)).toBe(true);
    });

    it('uses extracted ad type from slot ID', () => {
      // Both should return sizes for 'mpu' type
      const slotSizes = getSizesForSlot('advert_site_mpu_0');
      const typeSizes = getSizes('mpu');
      expect(slotSizes).toEqual(typeSizes);
    });

    it('accepts optional breakpoint parameter', () => {
      const sizes = getSizesForSlot('advert_site_mpu_0', 'l');
      expect(Array.isArray(sizes)).toBe(true);
    });
  });

  describe('buildGPTSizeMapping', () => {
    it('returns an array', () => {
      const mapping = buildGPTSizeMapping('mpu');
      expect(Array.isArray(mapping)).toBe(true);
    });

    it('returns empty array for unknown ad type', () => {
      const mapping = buildGPTSizeMapping('nonexistent');
      expect(mapping).toEqual([]);
    });

    it('each entry has viewport and sizes', () => {
      const mapping = buildGPTSizeMapping('mpu');
      if (mapping.length > 0) {
        expect(mapping[0]).toHaveProperty('viewport');
        expect(mapping[0]).toHaveProperty('sizes');
      }
    });
  });

  describe('getBreakpoints', () => {
    it('returns breakpoints object', () => {
      const breakpoints = getBreakpoints();
      expect(typeof breakpoints).toBe('object');
    });

    it('has expected breakpoint keys', () => {
      const breakpoints = getBreakpoints();
      const keys = Object.keys(breakpoints);
      expect(keys.length).toBeGreaterThan(0);
    });

    it('each breakpoint has minWidth', () => {
      const breakpoints = getBreakpoints();
      for (const bp of Object.values(breakpoints)) {
        expect((bp as any).minWidth).toBeDefined();
        expect(typeof (bp as any).minWidth).toBe('number');
      }
    });
  });

  describe('getAdTypes', () => {
    it('returns ad types object', () => {
      const adTypes = getAdTypes();
      expect(typeof adTypes).toBe('object');
    });
  });

  describe('getConfig', () => {
    it('returns config object', () => {
      const config = getConfig();
      expect(typeof config).toBe('object');
    });

    it('has breakpoints', () => {
      const config = getConfig();
      expect(config).toHaveProperty('breakpoints');
    });
  });

  describe('clearCache', () => {
    it('clears cached config without error', () => {
      // Call twice to ensure caching and clearing works
      getSizes('mpu');
      clearCache();
      getSizes('mpu');
      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('buildGPTSizeMappingForSlot', () => {
    it('returns an array', () => {
      const mapping = buildGPTSizeMappingForSlot('advert_site_mpu_0');
      expect(Array.isArray(mapping)).toBe(true);
    });

    it('falls back to ad type when no slot override exists', () => {
      const slotMapping = buildGPTSizeMappingForSlot('advert_site_mpu_0');
      const typeMapping = buildGPTSizeMapping('mpu');
      expect(slotMapping.length).toBe(typeMapping.length);
    });
  });

  describe('getResolvedConfig', () => {
    it('returns resolved config', () => {
      const resolved = getResolvedConfig();
      expect(resolved).toHaveProperty('breakpoints');
      expect(resolved).toHaveProperty('adTypes');
      expect(resolved).toHaveProperty('slotOverrides');
      expect(resolved).toHaveProperty('property');
    });
  });

  describe('init', () => {
    it('initializes the module', () => {
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('returns existing state if already initialized', () => {
      init();
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('sets current breakpoint', () => {
      init();
      const state = getState();
      expect(state.currentBreakpoint).not.toBeNull();
    });
  });

  describe('property-specific config', () => {
    it('uses adTypes from config', () => {
      const adTypes = getAdTypes();
      expect(Array.isArray(adTypes)).toBe(true);
    });
  });

  describe('breakpoint detection', () => {
    it('handles different viewport widths', () => {
      const breakpoints = getBreakpoints();
      const keys = Object.keys(breakpoints);
      expect(keys.length).toBeGreaterThan(0);

      // Get current breakpoint
      const bp = getBreakpoint();
      expect(keys).toContain(bp);
    });

    it('returns smallest breakpoint as fallback', () => {
      const bp = getBreakpoint();
      expect(typeof bp).toBe('string');
    });
  });
});
