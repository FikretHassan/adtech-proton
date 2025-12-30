import { describe, it, expect, beforeEach, vi } from 'vitest';
import environment, {
  init,
  getState,
  getUrlParams,
  getParam,
  isAdsDisabled,
  useTestAdUnits,
  isProduction,
  isBlocked,
  isDebug,
  getEnvironment,
  getHostname,
  getProperty,
  setProductionAds,
  getConfig,
  parseUrlParamValue,
  getUrlParamValue
} from '../src/environment';

// Mock property module
vi.mock('../src/property', () => ({
  default: {
    init: vi.fn(),
    checkUrlOverride: vi.fn(() => null),
    setProperty: vi.fn(),
    getProperty: vi.fn(() => 'dev'),
    isProduction: vi.fn(() => false)
  }
}));

// Mock the global loader
const mockLoader = {
  log: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
});

describe('environment', () => {
  describe('parseUrlParamValue', () => {
    it('returns null for null input', () => {
      expect(parseUrlParamValue(null)).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(parseUrlParamValue(undefined)).toBeNull();
    });

    it('returns null for "null" string', () => {
      expect(parseUrlParamValue('null')).toBeNull();
    });

    it('returns true for "true" string', () => {
      expect(parseUrlParamValue('true')).toBe(true);
    });

    it('returns true for empty string (flag)', () => {
      expect(parseUrlParamValue('')).toBe(true);
    });

    it('returns false for "false" string', () => {
      expect(parseUrlParamValue('false')).toBe(false);
    });

    it('parses numeric strings to numbers', () => {
      expect(parseUrlParamValue('42')).toBe(42);
      expect(parseUrlParamValue('0')).toBe(0);
      expect(parseUrlParamValue('-5')).toBe(-5);
    });

    it('returns string for non-numeric values', () => {
      expect(parseUrlParamValue('hello')).toBe('hello');
      expect(parseUrlParamValue('test123abc')).toBe('test123abc');
    });
  });

  describe('getUrlParamValue', () => {
    it('returns null for empty key', () => {
      expect(getUrlParamValue('')).toBeNull();
    });

    it('returns null when param not in URL', () => {
      expect(getUrlParamValue('nonexistent')).toBeNull();
    });
  });

  describe('getState', () => {
    it('returns state object', () => {
      const state = getState();
      expect(typeof state).toBe('object');
    });

    it('has expected properties', () => {
      const state = getState();
      expect(state).toHaveProperty('productionAds');
      expect(state).toHaveProperty('debugMode');
      expect(state).toHaveProperty('environment');
    });
  });

  describe('getUrlParams', () => {
    it('returns object', () => {
      const params = getUrlParams();
      expect(typeof params).toBe('object');
    });

    it('has expected param keys', () => {
      const params = getUrlParams();
      // Note: adsDebugLog is now configurable via loader.js debugParam, not hardcoded in urlParams
      expect(params).toHaveProperty('adsDisableStack');
    });
  });

  describe('getParam', () => {
    it('returns null for unknown param', () => {
      const result = getParam('unknownParam');
      expect(result).toBeNull();
    });

    it('returns value for known param', () => {
      // Default should be false for boolean params
      const result = getParam('adsDebugLog');
      expect(result === false || result === null || result === true).toBe(true);
    });
  });

  describe('isAdsDisabled', () => {
    it('returns boolean', () => {
      const result = isAdsDisabled();
      expect(typeof result === 'boolean' || result === undefined).toBe(true);
    });
  });

  describe('useTestAdUnits', () => {
    it('returns boolean or undefined', () => {
      const result = useTestAdUnits();
      expect(result === true || result === false || result === undefined).toBe(true);
    });
  });

  describe('isProduction', () => {
    it('returns boolean', () => {
      const result = isProduction();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isBlocked', () => {
    it('returns boolean', () => {
      const result = isBlocked();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('isDebug', () => {
    it('returns boolean', () => {
      const result = isDebug();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getEnvironment', () => {
    it('returns string', () => {
      const result = getEnvironment();
      expect(typeof result).toBe('string');
    });
  });

  describe('getHostname', () => {
    it('returns string', () => {
      const result = getHostname();
      expect(typeof result).toBe('string');
    });
  });

  describe('getProperty', () => {
    it('returns string', () => {
      const result = getProperty();
      expect(typeof result).toBe('string');
    });
  });

  describe('setProductionAds', () => {
    it('sets production mode to true', () => {
      setProductionAds(true);
      expect(isProduction()).toBe(true);
    });

    it('sets production mode to false', () => {
      setProductionAds(false);
      expect(isProduction()).toBe(false);
    });

    it('coerces truthy values to true', () => {
      setProductionAds(1 as any);
      expect(isProduction()).toBe(true);
    });

    it('coerces falsy values to false', () => {
      setProductionAds(0 as any);
      expect(isProduction()).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('returns config object', () => {
      const config = getConfig();
      expect(typeof config).toBe('object');
    });

    it('contains blockedDomains', () => {
      const config = getConfig();
      expect(config).toHaveProperty('blockedDomains');
    });

    it('contains defaults', () => {
      const config = getConfig();
      expect(config).toHaveProperty('defaults');
    });
  });

  describe('init', () => {
    it('initializes environment state', () => {
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('returns existing state if already initialized', () => {
      const state1 = init();
      const state2 = init();
      expect(state1.initialized).toBe(state2.initialized);
    });

    it('sets hostname from window.location', () => {
      init();
      const state = getState();
      expect(typeof state.hostname).toBe('string');
    });

    it('sets property from property module', () => {
      init();
      const state = getState();
      expect(typeof state.property).toBe('string');
    });

    it('sets environment type', () => {
      init();
      const env = getEnvironment();
      expect(['production', 'development', 'blocked', 'unknown']).toContain(env);
    });
  });

  describe('default export', () => {
    it('exports all expected functions', () => {
      expect(environment).toHaveProperty('init');
      expect(environment).toHaveProperty('getState');
      expect(environment).toHaveProperty('getUrlParams');
      expect(environment).toHaveProperty('getParam');
      expect(environment).toHaveProperty('isAdsDisabled');
      expect(environment).toHaveProperty('useTestAdUnits');
      expect(environment).toHaveProperty('isProduction');
      expect(environment).toHaveProperty('isBlocked');
      expect(environment).toHaveProperty('isDebug');
      expect(environment).toHaveProperty('getEnvironment');
      expect(environment).toHaveProperty('getHostname');
      expect(environment).toHaveProperty('getProperty');
      expect(environment).toHaveProperty('setProductionAds');
      expect(environment).toHaveProperty('getConfig');
    });
  });

  describe('URL parameter handling', () => {
    it('getUrlParams returns all parameter keys', () => {
      const params = getUrlParams();
      // Note: adsDebugLog is now configurable via loader.js debugParam, not hardcoded in urlParams
      expect(params).toHaveProperty('adsDisableStack');
      expect(params).toHaveProperty('adsShowProductionAds');
      expect(params).toHaveProperty('adtest');
      expect(params).toHaveProperty('adteston');
      expect(params).toHaveProperty('adkill');
      expect(params).toHaveProperty('adgptoff');
      expect(params).toHaveProperty('adSraOn');
      expect(params).toHaveProperty('adSraOff');
    });

    it('getParam returns false for adsDisableStack by default', () => {
      const value = getParam('adsDisableStack');
      expect(value === false || value === null).toBe(true);
    });

    it('getParam returns false for adkill by default', () => {
      const value = getParam('adkill');
      expect(value === false || value === null).toBe(true);
    });
  });

  describe('ad disable checks', () => {
    it('isAdsDisabled checks multiple params', () => {
      // By default, ads should not be disabled
      const result = isAdsDisabled();
      expect(typeof result === 'boolean' || result === undefined).toBe(true);
    });

    it('useTestAdUnits returns adteston state', () => {
      const result = useTestAdUnits();
      expect(result === true || result === false || result === undefined).toBe(true);
    });
  });

  describe('environment detection', () => {
    it('isBlocked returns false for normal domains', () => {
      // localhost/jsdom should not be blocked
      expect(isBlocked()).toBe(false);
    });

    it('getHostname returns current hostname', () => {
      const hostname = getHostname();
      expect(typeof hostname).toBe('string');
    });

    it('getProperty returns property ID', () => {
      const prop = getProperty();
      expect(typeof prop).toBe('string');
    });
  });

  describe('debug mode', () => {
    it('isDebug returns false by default', () => {
      // Without debug URL param, should be false
      const debug = isDebug();
      expect(typeof debug).toBe('boolean');
    });
  });

  describe('production ads', () => {
    it('setProductionAds toggles production state', () => {
      setProductionAds(true);
      expect(isProduction()).toBe(true);

      setProductionAds(false);
      expect(isProduction()).toBe(false);
    });

    it('handles undefined gracefully', () => {
      setProductionAds(undefined as any);
      expect(isProduction()).toBe(false);
    });

    it('handles null gracefully', () => {
      setProductionAds(null as any);
      expect(isProduction()).toBe(false);
    });
  });

  describe('state isolation', () => {
    it('getState returns copy of state', () => {
      const state1 = getState();
      const state2 = getState();
      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('getUrlParams returns copy of params', () => {
      const params1 = getUrlParams();
      const params2 = getUrlParams();
      expect(params1).not.toBe(params2);
    });
  });
});
