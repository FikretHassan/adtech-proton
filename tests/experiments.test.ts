import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExperimentManager } from '../src/experiments';

// Mock targeting module
vi.mock('../src/targeting', () => ({
  evaluateTargeting: vi.fn(() => ({ matched: true, reason: 'matched' })),
  normalizeTargetingConfig: vi.fn((config) => ({
    include: config.include || {},
    exclude: config.exclude || {}
  })),
  matchesProperty: vi.fn(() => true)
}));

// Mock property module
vi.mock('../src/property', () => ({
  getProperty: vi.fn(() => 'testsite')
}));

describe('ExperimentManager', () => {
  let manager: ExperimentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new ExperimentManager();
  });

  describe('constructor', () => {
    it('creates instance with default config', () => {
      const mgr = new ExperimentManager();
      expect(mgr).toBeInstanceOf(ExperimentManager);
    });

    it('accepts getContext function', () => {
      const getContext = () => ({ pagetype: 'article' });
      const mgr = new ExperimentManager({ getContext });
      expect(mgr.getContext()).toEqual({ pagetype: 'article' });
    });

    it('accepts dimensionConfig', () => {
      const dimensionConfig = { geo: { matchType: 'exact' } };
      const mgr = new ExperimentManager({ dimensionConfig });
      expect(mgr.dimensionConfig).toEqual(dimensionConfig);
    });

    it('initializes experiments array', () => {
      expect(manager.experiments).toEqual([]);
    });

    it('initializes applied record', () => {
      expect(manager.applied).toEqual({});
    });

    it('generates testgroup between 0-99', () => {
      expect(manager.testgroup).toBeGreaterThanOrEqual(0);
      expect(manager.testgroup).toBeLessThanOrEqual(99);
    });
  });

  describe('_generateTestgroup', () => {
    it('returns number between 0-99', () => {
      for (let i = 0; i < 100; i++) {
        const mgr = new ExperimentManager();
        expect(mgr.testgroup).toBeGreaterThanOrEqual(0);
        expect(mgr.testgroup).toBeLessThanOrEqual(99);
      }
    });
  });

  describe('register', () => {
    it('registers experiment with id', () => {
      manager.register({ id: 'test-exp' });
      expect(manager.experiments.length).toBe(1);
      expect(manager.experiments[0].id).toBe('test-exp');
    });

    it('ignores null experiment', () => {
      manager.register(null);
      expect(manager.experiments.length).toBe(0);
    });

    it('ignores experiment without id', () => {
      manager.register({ active: true });
      expect(manager.experiments.length).toBe(0);
    });

    it('sets default active to true', () => {
      manager.register({ id: 'test' });
      expect(manager.experiments[0].active).toBe(true);
    });

    it('respects active: false', () => {
      manager.register({ id: 'test', active: false });
      expect(manager.experiments[0].active).toBe(false);
    });

    it('sets default testRange to [0, 99]', () => {
      manager.register({ id: 'test' });
      expect(manager.experiments[0].testRange).toEqual([0, 99]);
    });

    it('accepts custom testRange', () => {
      manager.register({ id: 'test', testRange: [0, 24] });
      expect(manager.experiments[0].testRange).toEqual([0, 24]);
    });

    it('sets default plugin to null', () => {
      manager.register({ id: 'test' });
      expect(manager.experiments[0].plugin).toBeNull();
    });

    it('accepts plugin targeting', () => {
      manager.register({ id: 'test', plugin: 'amazon' });
      expect(manager.experiments[0].plugin).toBe('amazon');
    });

    it('accepts properties array', () => {
      manager.register({ id: 'test', properties: ['site1', 'site2'] });
      expect(manager.experiments[0].properties).toEqual(['site1', 'site2']);
    });

    it('sets default include to empty object', () => {
      manager.register({ id: 'test' });
      expect(manager.experiments[0].include).toEqual({});
    });

    it('sets default exclude to empty object', () => {
      manager.register({ id: 'test' });
      expect(manager.experiments[0].exclude).toEqual({});
    });

    it('accepts include targeting', () => {
      manager.register({ id: 'test', include: { geo: ['us'] } });
      expect(manager.experiments[0].include).toEqual({ geo: ['us'] });
    });

    it('accepts exclude targeting', () => {
      manager.register({ id: 'test', exclude: { geo: ['uk'] } });
      expect(manager.experiments[0].exclude).toEqual({ geo: ['uk'] });
    });

    it('sets default apply function', () => {
      manager.register({ id: 'test' });
      expect(typeof manager.experiments[0].apply).toBe('function');
    });

    it('accepts apply function', () => {
      const apply = vi.fn();
      manager.register({ id: 'test', apply });
      expect(manager.experiments[0].apply).toBe(apply);
    });
  });

  describe('isInRange', () => {
    it('returns true when testgroup in range', () => {
      // Force testgroup to known value
      manager.testgroup = 50;
      expect(manager.isInRange([0, 99])).toBe(true);
      expect(manager.isInRange([50, 50])).toBe(true);
      expect(manager.isInRange([25, 75])).toBe(true);
    });

    it('returns false when testgroup below range', () => {
      manager.testgroup = 10;
      expect(manager.isInRange([50, 99])).toBe(false);
    });

    it('returns false when testgroup above range', () => {
      manager.testgroup = 90;
      expect(manager.isInRange([0, 49])).toBe(false);
    });

    it('returns false for invalid range (not array)', () => {
      expect(manager.isInRange(null as any)).toBe(false);
      expect(manager.isInRange(50 as any)).toBe(false);
    });

    it('returns false for invalid range (wrong length)', () => {
      expect(manager.isInRange([0] as any)).toBe(false);
      expect(manager.isInRange([0, 50, 100] as any)).toBe(false);
    });

    it('includes boundaries', () => {
      manager.testgroup = 0;
      expect(manager.isInRange([0, 99])).toBe(true);

      manager.testgroup = 99;
      expect(manager.isInRange([0, 99])).toBe(true);
    });
  });

  describe('apply', () => {
    it('returns false when no experiments registered', () => {
      const result = manager.apply('amazon', {});
      expect(result).toBe(false);
    });

    it('returns false when experiment inactive', () => {
      manager.register({ id: 'test', active: false });
      const result = manager.apply('amazon', {});
      expect(result).toBe(false);
    });

    it('returns false when plugin does not match', () => {
      manager.register({ id: 'test', plugin: 'prebid' });
      const result = manager.apply('amazon', {});
      expect(result).toBe(false);
    });

    it('returns true when experiment applied', () => {
      manager.testgroup = 50;
      manager.register({
        id: 'test',
        testRange: [0, 99],
        apply: vi.fn()
      });
      const result = manager.apply('amazon', {});
      expect(result).toBe(true);
    });

    it('calls apply function with config', () => {
      manager.testgroup = 50;
      const apply = vi.fn();
      manager.register({ id: 'test', testRange: [0, 99], apply });

      const config = { timeout: 1000 };
      manager.apply('amazon', config);

      expect(apply).toHaveBeenCalledWith(config);
    });

    it('records applied experiment', () => {
      manager.testgroup = 50;
      manager.register({ id: 'test-exp', testRange: [0, 99], apply: vi.fn() });
      manager.apply('amazon', {});

      expect(manager.applied['test-exp']).toBeDefined();
      expect(manager.applied['test-exp'].plugin).toBe('amazon');
      expect(manager.applied['test-exp'].testgroup).toBe(50);
    });

    it('applies experiment targeting null plugin to any plugin', () => {
      manager.testgroup = 50;
      manager.register({ id: 'test', plugin: null, testRange: [0, 99], apply: vi.fn() });

      const result = manager.apply('any-plugin', {});
      expect(result).toBe(true);
    });

    it('skips experiment when testgroup out of range', () => {
      manager.testgroup = 90;
      manager.register({ id: 'test', testRange: [0, 24], apply: vi.fn() });

      const result = manager.apply('amazon', {});
      expect(result).toBe(false);
    });

    it('handles apply function throwing error', () => {
      manager.testgroup = 50;
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      manager.register({
        id: 'test',
        testRange: [0, 99],
        apply: () => { throw new Error('Apply error'); }
      });

      // Should not throw
      expect(() => manager.apply('amazon', {})).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('applies multiple experiments', () => {
      manager.testgroup = 50;
      const apply1 = vi.fn();
      const apply2 = vi.fn();

      manager.register({ id: 'exp1', testRange: [0, 99], apply: apply1 });
      manager.register({ id: 'exp2', testRange: [0, 99], apply: apply2 });

      manager.apply('amazon', {});

      expect(apply1).toHaveBeenCalled();
      expect(apply2).toHaveBeenCalled();
    });
  });

  describe('getStatus', () => {
    it('returns status object', () => {
      const status = manager.getStatus();
      expect(status).toHaveProperty('testgroup');
      expect(status).toHaveProperty('registered');
      expect(status).toHaveProperty('applied');
    });

    it('includes testgroup', () => {
      manager.testgroup = 42;
      const status = manager.getStatus();
      expect(status.testgroup).toBe(42);
    });

    it('includes registered experiments', () => {
      manager.register({ id: 'exp1' });
      manager.register({ id: 'exp2' });

      const status = manager.getStatus();
      expect(status.registered.length).toBe(2);
    });

    it('registered includes experiment info', () => {
      manager.register({
        id: 'test',
        active: true,
        testRange: [0, 49],
        plugin: 'amazon'
      });

      const status = manager.getStatus();
      expect(status.registered[0]).toEqual({
        id: 'test',
        active: true,
        testRange: [0, 49],
        plugin: 'amazon'
      });
    });

    it('includes applied experiments', () => {
      manager.testgroup = 50;
      manager.register({ id: 'test', testRange: [0, 99], apply: vi.fn() });
      manager.apply('amazon', {});

      const status = manager.getStatus();
      expect(status.applied['test']).toBeDefined();
    });

    it('returns copy of applied', () => {
      const status = manager.getStatus();
      expect(status.applied).not.toBe(manager.applied);
    });
  });
});
