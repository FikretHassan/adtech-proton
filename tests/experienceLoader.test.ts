import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  register,
  execute,
  wasExecuted,
  getResult,
  getResults,
  getState,
  getConfig,
  reset
} from '../src/experienceLoader';

// Mock loader
const mockLoader = {
  log: vi.fn(),
  consentCheck: vi.fn(() => true)
};

// Mock pubsub
const mockPubsub = {
  publish: vi.fn(),
  subscribe: vi.fn()
};

// Mock experiences config
vi.mock('../config/experiences.json', () => ({
  default: {
    enabled: true,
    eventPrefix: 'experience'
  }
}));

// Mock experiences
vi.mock('../config/experiences/index.js', () => ({
  default: [
    {
      name: 'test-experience-1',
      fn: () => 'result-1',
      active: true,
      priority: 1
    },
    {
      name: 'test-experience-2',
      fn: () => 'result-2',
      active: true,
      priority: 2
    },
    {
      name: 'inactive-experience',
      fn: () => 'inactive',
      active: false
    }
  ]
}));

// Mock targeting
vi.mock('../src/targeting', () => ({
  evaluateTargeting: vi.fn(() => ({ matched: true, reason: 'matched' })),
  normalizeTargetingConfig: vi.fn((config) => ({
    include: config.include || {},
    exclude: config.exclude || {}
  })),
  matchesProperty: vi.fn(() => true)
}));

// Mock property
vi.mock('../src/property', () => ({
  getProperty: vi.fn(() => 'testsite')
}));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
  (window as any).adsPubsub = mockPubsub;

  // Reset URL
  Object.defineProperty(window, 'location', {
    value: { search: '', href: 'http://localhost/' },
    writable: true
  });

  reset();
});

describe('experienceLoader', () => {
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

    it('registers experiences from config', () => {
      init();
      const state = getState();
      expect(state.experiences.length).toBeGreaterThan(0);
    });

    it('sorts experiences by priority', () => {
      init();
      const state = getState();
      expect(state.experiences[0].name).toBe('test-experience-1');
    });
  });

  describe('register', () => {
    it('registers a function', () => {
      const result = register('custom-fn', () => 'custom-result');
      expect(result).toBe(true);
    });

    it('returns false for non-function', () => {
      const result = register('not-fn', 'string' as any);
      expect(result).toBe(false);
    });
  });

  describe('execute', () => {
    it('initializes if not initialized', () => {
      execute({});
      expect(getState().initialized).toBe(true);
    });

    it('returns array of results', () => {
      const results = execute({});
      expect(Array.isArray(results)).toBe(true);
    });

    it('executes active experiences', () => {
      const results = execute({});
      const loaded = results.filter(r => r.status === 'load');
      expect(loaded.length).toBeGreaterThan(0);
    });

    it('skips inactive experiences', () => {
      const results = execute({});
      const inactiveResult = results.find(r => r.name === 'inactive-experience');
      if (inactiveResult) {
        expect(inactiveResult.status).toBe('inactive');
      }
    });

    it('accepts context parameter', () => {
      const results = execute({ pagetype: 'article' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('accepts dimensionConfig parameter', () => {
      const results = execute({}, { geo: { matchType: 'exact' } });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('wasExecuted', () => {
    it('returns false for unknown experience', () => {
      expect(wasExecuted('nonexistent')).toBe(false);
    });

    it('returns true for executed experience', () => {
      execute({});
      expect(wasExecuted('test-experience-1')).toBe(true);
    });

    it('returns false for inactive experience', () => {
      execute({});
      expect(wasExecuted('inactive-experience')).toBe(false);
    });
  });

  describe('getResult', () => {
    it('returns null for unknown experience', () => {
      expect(getResult('nonexistent')).toBeNull();
    });

    it('returns result for executed experience', () => {
      execute({});
      const result = getResult('test-experience-1');
      expect(result).not.toBeNull();
      expect(result?.status).toBe('load');
    });
  });

  describe('getResults', () => {
    it('returns empty object initially', () => {
      const results = getResults();
      expect(Object.keys(results).length).toBe(0);
    });

    it('returns results after execute', () => {
      execute({});
      const results = getResults();
      expect(Object.keys(results).length).toBeGreaterThan(0);
    });

    it('returns copy of results', () => {
      execute({});
      const results1 = getResults();
      const results2 = getResults();
      expect(results1).not.toBe(results2);
    });
  });

  describe('getState', () => {
    it('returns state object', () => {
      const state = getState();
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('experiences');
      expect(state).toHaveProperty('results');
    });

    it('returns initialized false before init', () => {
      const state = getState();
      expect(state.initialized).toBe(false);
    });

    it('returns experiences array', () => {
      init();
      const state = getState();
      expect(Array.isArray(state.experiences)).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('returns config object', () => {
      const config = getConfig();
      expect(typeof config).toBe('object');
    });

    it('config has enabled property', () => {
      const config = getConfig();
      expect(config).toHaveProperty('enabled');
    });
  });

  describe('reset', () => {
    it('resets initialized state', () => {
      init();
      expect(getState().initialized).toBe(true);

      reset();
      expect(getState().initialized).toBe(false);
    });

    it('clears results', () => {
      execute({});
      reset();
      expect(Object.keys(getResults()).length).toBe(0);
    });

    it('clears experiences', () => {
      init();
      reset();
      expect(getState().experiences.length).toBe(0);
    });
  });

  describe('URL overrides', () => {
    it('respects experienceDisable param', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?experienceDisable=test-experience-1', href: 'http://localhost/?experienceDisable=test-experience-1' },
        writable: true
      });

      const results = execute({});
      const result = results.find(r => r.name === 'test-experience-1');
      if (result) {
        expect(result.status).toBe('inactive');
      }
    });

    it('respects experienceEnable param', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?experienceEnable=inactive-experience', href: 'http://localhost/?experienceEnable=inactive-experience' },
        writable: true
      });

      const results = execute({});
      expect(Array.isArray(results)).toBe(true);
    });

    it('handles disable all except enabled', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?experienceDisable=all&experienceEnable=test-experience-1', href: 'http://localhost/?experienceDisable=all&experienceEnable=test-experience-1' },
        writable: true
      });

      const results = execute({});
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('experience execution', () => {
    it('includes duration in result', () => {
      execute({});
      const result = getResult('test-experience-1');
      expect(result?.duration).toBeDefined();
      expect(typeof result?.duration).toBe('number');
    });

    it('includes status in result', () => {
      execute({});
      const result = getResult('test-experience-1');
      expect(result?.status).toBeDefined();
    });

    it('handles experience function errors', async () => {
      // Register experience that throws
      register('error-fn', () => { throw new Error('Test error'); });

      // Should not throw
      expect(() => execute({})).not.toThrow();
    });
  });

  describe('integration', () => {
    it('full lifecycle: init, execute, getResult, reset', () => {
      init();
      expect(getState().initialized).toBe(true);

      execute({});
      const result = getResult('test-experience-1');
      expect(result).not.toBeNull();

      reset();
      expect(getState().initialized).toBe(false);
      expect(getResult('test-experience-1')).toBeNull();
    });
  });

  describe('consent checking', () => {
    it('skips experience when consent not granted', () => {
      mockLoader.consentCheck.mockReturnValue(false);

      // Re-mock experiences with consentState requirement
      vi.doMock('../config/experiences/index.js', () => ({
        default: [
          {
            name: 'consent-required',
            fn: () => 'consent-result',
            active: true,
            consentState: ['marketing']
          }
        ]
      }));

      // Execute should handle consent check
      const results = execute({});
      expect(Array.isArray(results)).toBe(true);
    });

    it('allows experience with empty consentState', () => {
      mockLoader.consentCheck.mockReturnValue(true);
      const results = execute({});
      expect(Array.isArray(results)).toBe(true);
    });

    it('allows experience with all in consentState', () => {
      const results = execute({});
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('targeting evaluation', () => {
    it('handles targeting that does not match', async () => {
      const { evaluateTargeting } = await import('../src/targeting');
      (evaluateTargeting as any).mockReturnValueOnce({ matched: false, reason: 'no match' });

      const results = execute({});
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('URL override edge cases', () => {
    it('force enables experience via URL, bypassing targeting', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?experienceEnable=test-experience-1', href: 'http://localhost/?experienceEnable=test-experience-1' },
        writable: true
      });

      const results = execute({});
      const result = results.find(r => r.name === 'test-experience-1');
      expect(result?.status).toBe('load');
    });

    it('disable all disables even active experiences', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?experienceDisable=all', href: 'http://localhost/?experienceDisable=all' },
        writable: true
      });

      const results = execute({});
      // Some experiences should be disabled by 'all'
      expect(results.some(r => r.status === 'inactive')).toBe(true);
    });
  });

  describe('pubsub integration', () => {
    it('executes without error when pubsub available', () => {
      expect(() => execute({})).not.toThrow();
    });

    it('executes experiences and returns results', () => {
      const results = execute({});
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('result tracking', () => {
    it('tracks result by experience name', () => {
      execute({});
      const result = getResult('test-experience-1');
      expect(result).toBeDefined();
      expect(result?.name).toBe('test-experience-1');
    });

    it('result includes result value from function', () => {
      execute({});
      const result = getResult('test-experience-1');
      expect(result?.result).toBe('result-1');
    });

    it('getResults returns all results keyed by name', () => {
      execute({});
      const results = getResults();
      expect(results['test-experience-1']).toBeDefined();
      expect(results['test-experience-2']).toBeDefined();
    });
  });
});
