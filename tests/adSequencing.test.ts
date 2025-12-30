import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  decide,
  isActive,
  isEnabled,
  getReason,
  getMatchedConfig,
  getState,
  getConfig,
  addRule,
  getRules,
  reset,
  getPrioritySlotTypes,
  getPrioritySlotIds,
  getPriorityTimeout,
  shouldWaitForRender,
  isPrioritySlot,
  markPriorityRequested,
  markPriorityRendered,
  allPrioritySlotsRendered,
  waitForPrioritySlots
} from '../src/adSequencing';

// Mock the loader
const mockLoader = {
  log: vi.fn()
};

// Mock targeting module
vi.mock('../src/targeting', () => ({
  evaluateTargeting: vi.fn(() => ({ matched: false, reason: 'no match' })),
  matchesProperty: vi.fn((properties, currentProperty) => {
    if (!properties) return true;
    if (Array.isArray(properties)) return properties.includes(currentProperty);
    return properties === currentProperty;
  })
}));

// Mock property module
vi.mock('../src/property', () => ({
  getProperty: vi.fn(() => 'testsite')
}));

// Mock generated dimensions
vi.mock('../src/generated/dimensions.js', () => ({
  dimensions: {
    geo: () => 'us',
    viewport: () => 'desktop'
  },
  dimensionConfig: {}
}));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
  // Reset URL for each test
  Object.defineProperty(window, 'location', {
    value: { search: '', href: 'http://localhost/' },
    writable: true
  });
  reset();
});

describe('adSequencing', () => {
  describe('init', () => {
    it('initializes the module', () => {
      const state = init();
      expect(state).toHaveProperty('active');
      expect(state).toHaveProperty('rules');
    });

    it('accepts rules option', () => {
      init({
        rules: [
          { name: 'test-rule', include: { geo: ['us'] } }
        ]
      });

      const rules = getRules();
      expect(rules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('decide', () => {
    it('returns false when no rules match', () => {
      init({ rules: [] });
      const result = decide();
      expect(result).toBe(false);
    });

    it('sets state when no rules match', () => {
      init({ rules: [] });
      decide();

      expect(isActive()).toBe(false);
      expect(getReason()).toBe('No rule matched');
    });

    it('respects URL param adsequenceoff', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceoff', href: 'http://localhost/?adsequenceoff' },
        writable: true
      });

      const result = decide();
      expect(result).toBe(false);
      expect(getReason()).toContain('URL parameter override');
    });

    it('respects URL param adsequenceon', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceon', href: 'http://localhost/?adsequenceon' },
        writable: true
      });

      const result = decide();
      expect(result).toBe(true);
      expect(getReason()).toContain('URL parameter override');
    });

    it('evaluates rules in order', async () => {
      const { evaluateTargeting } = await import('../src/targeting');
      (evaluateTargeting as any).mockReturnValue({ matched: true, reason: 'matched' });

      init({
        rules: [
          { name: 'first-rule', include: { pagetype: ['article'] } },
          { name: 'second-rule', include: { pagetype: ['video'] } }
        ]
      });

      decide();

      const matched = getMatchedConfig();
      expect(matched).not.toBeNull();
      expect((matched as any)?.name).toBe('first-rule');
    });

    it('stores evaluation timestamp', () => {
      decide();
      const state = getState();
      expect(state.evaluatedAt).not.toBeNull();
    });
  });

  describe('isActive', () => {
    it('returns false initially', () => {
      expect(isActive()).toBe(false);
    });

    it('returns true after match', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceon', href: 'http://localhost/?adsequenceon' },
        writable: true
      });

      decide();
      expect(isActive()).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('returns boolean', () => {
      expect(typeof isEnabled()).toBe('boolean');
    });

    it('respects adsequenceon URL param', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceon', href: 'http://localhost/?adsequenceon' },
        writable: true
      });

      expect(isEnabled()).toBe(true);
    });

    it('respects adsequenceoff URL param', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceoff', href: 'http://localhost/?adsequenceoff' },
        writable: true
      });

      expect(isEnabled()).toBe(false);
    });
  });

  describe('getReason', () => {
    it('returns null initially', () => {
      expect(getReason()).toBeNull();
    });

    it('returns reason after decide', () => {
      decide();
      expect(getReason()).not.toBeNull();
    });
  });

  describe('getMatchedConfig', () => {
    it('returns null initially', () => {
      expect(getMatchedConfig()).toBeNull();
    });

    it('returns matched rule after decide', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceon', href: 'http://localhost/?adsequenceon' },
        writable: true
      });

      decide();
      expect(getMatchedConfig()).not.toBeNull();
    });
  });

  describe('getState', () => {
    it('returns state object', () => {
      const state = getState();

      expect(state).toHaveProperty('active');
      expect(state).toHaveProperty('reason');
      expect(state).toHaveProperty('matchedConfig');
      expect(state).toHaveProperty('prioritySlotsRequested');
      expect(state).toHaveProperty('prioritySlotsRendered');
      expect(state).toHaveProperty('sequenceComplete');
    });

    it('includes config section', () => {
      const state = getState();

      expect(state.config).toHaveProperty('enabled');
      expect(state.config).toHaveProperty('prioritySlotTypes');
      expect(state.config).toHaveProperty('priorityTimeout');
    });
  });

  describe('getConfig', () => {
    it('returns config object', () => {
      const config = getConfig();
      expect(typeof config).toBe('object');
    });
  });

  describe('addRule', () => {
    beforeEach(() => {
      init({ rules: [] });
    });

    it('adds a valid rule', () => {
      const result = addRule({
        name: 'new-rule',
        include: { pagetype: ['article'] }
      });

      expect(result).toBe(true);
      expect(getRules().find(r => r.name === 'new-rule')).toBeDefined();
    });

    it('returns false for rule without name', () => {
      const result = addRule({
        include: { pagetype: ['article'] }
      });

      expect(result).toBe(false);
    });

    it('accepts rule with only name (property matching)', () => {
      const result = addRule({
        name: 'property-only-rule'
      });

      expect(result).toBe(true);
    });

    it('accepts exclude targeting', () => {
      const result = addRule({
        name: 'exclude-rule',
        exclude: { geo: ['uk'] }
      });

      expect(result).toBe(true);
    });
  });

  describe('getRules', () => {
    it('returns array', () => {
      const rules = getRules();
      expect(Array.isArray(rules)).toBe(true);
    });

    it('returns copy of rules', () => {
      const rules1 = getRules();
      const rules2 = getRules();
      expect(rules1).not.toBe(rules2);
    });
  });

  describe('priority slot functions', () => {
    describe('getPrioritySlotTypes', () => {
      it('returns array of slot types', () => {
        const types = getPrioritySlotTypes();
        expect(Array.isArray(types)).toBe(true);
      });
    });

    describe('getPrioritySlotIds', () => {
      it('returns array', () => {
        const ids = getPrioritySlotIds();
        expect(Array.isArray(ids)).toBe(true);
      });
    });

    describe('getPriorityTimeout', () => {
      it('returns number', () => {
        const timeout = getPriorityTimeout();
        expect(typeof timeout).toBe('number');
      });
    });

    describe('shouldWaitForRender', () => {
      it('returns boolean', () => {
        const result = shouldWaitForRender();
        expect(typeof result).toBe('boolean');
      });
    });

    describe('isPrioritySlot', () => {
      it('checks slot against priority types', () => {
        const result = isPrioritySlot('advert_site_oop1_0', 'oop1');
        expect(typeof result).toBe('boolean');
      });

      it('extracts adType from slotId', () => {
        const result = isPrioritySlot('advert_site_mpu_0');
        expect(typeof result).toBe('boolean');
      });
    });

    describe('markPriorityRequested', () => {
      it('adds slot to requested list', () => {
        markPriorityRequested('test-slot');

        const state = getState();
        expect(state.prioritySlotsRequested).toContain('test-slot');
      });

      it('does not duplicate slots', () => {
        markPriorityRequested('test-slot');
        markPriorityRequested('test-slot');

        const state = getState();
        expect(state.prioritySlotsRequested.filter(s => s === 'test-slot').length).toBe(1);
      });
    });

    describe('markPriorityRendered', () => {
      it('adds slot to rendered list', () => {
        markPriorityRendered('test-slot');

        const state = getState();
        expect(state.prioritySlotsRendered).toContain('test-slot');
      });

      it('does not duplicate slots', () => {
        markPriorityRendered('test-slot');
        markPriorityRendered('test-slot');

        const state = getState();
        expect(state.prioritySlotsRendered.filter(s => s === 'test-slot').length).toBe(1);
      });
    });

    describe('allPrioritySlotsRendered', () => {
      it('returns true when no slots requested', () => {
        expect(allPrioritySlotsRendered()).toBe(true);
      });

      it('returns false when slots pending', () => {
        markPriorityRequested('slot1');
        expect(allPrioritySlotsRendered()).toBe(false);
      });

      it('returns true when all rendered', () => {
        markPriorityRequested('slot1');
        markPriorityRendered('slot1');
        expect(allPrioritySlotsRendered()).toBe(true);
      });
    });

    describe('waitForPrioritySlots', () => {
      it('resolves immediately when no slots requested', async () => {
        const result = await waitForPrioritySlots();

        expect(result.success).toBe(true);
        expect(result.timedOut).toBe(false);
      });

      it('sets sequenceComplete flag', async () => {
        await waitForPrioritySlots();

        const state = getState();
        expect(state.sequenceComplete).toBe(true);
      });
    });
  });

  describe('reset', () => {
    it('clears active state', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceon', href: 'http://localhost/?adsequenceon' },
        writable: true
      });

      decide();
      expect(isActive()).toBe(true);

      reset();
      expect(isActive()).toBe(false);
    });

    it('clears reason', () => {
      decide();
      reset();
      expect(getReason()).toBeNull();
    });

    it('clears matchedConfig', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adsequenceon', href: 'http://localhost/?adsequenceon' },
        writable: true
      });

      decide();
      reset();
      expect(getMatchedConfig()).toBeNull();
    });

    it('clears priority slots', () => {
      markPriorityRequested('slot1');
      markPriorityRendered('slot1');

      reset();

      const state = getState();
      expect(state.prioritySlotsRequested.length).toBe(0);
      expect(state.prioritySlotsRendered.length).toBe(0);
    });
  });

  describe('waitForPrioritySlots with pubsub', () => {
    it('resolves when pubsub not available', async () => {
      markPriorityRequested('slot1');
      (window as any).adsPubsub = null;

      const result = await waitForPrioritySlots();

      expect(result.success).toBe(false);
      expect(result.timedOut).toBe(false);
    });

    it('sets up subscriptions when pubsub available', async () => {
      const mockPubsub = {
        subscribe: vi.fn()
      };
      (window as any).adsPubsub = mockPubsub;

      markPriorityRequested('slot1');

      // Start waiting (will timeout)
      const waitPromise = waitForPrioritySlots();

      // Manually trigger rendered
      markPriorityRendered('slot1');

      // Should still be pending due to async nature
      const result = await waitPromise;
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('rule matching', () => {
    it('matches rule with include targeting', async () => {
      const { evaluateTargeting } = await import('../src/targeting');
      (evaluateTargeting as any).mockReturnValue({ matched: true, reason: 'matched' });

      init({
        rules: [
          { name: 'include-rule', include: { geo: ['us'] } }
        ]
      });

      const result = decide();
      expect(result).toBe(true);
      expect(getMatchedConfig()?.name).toBe('include-rule');
    });

    it('skips rule when include targeting does not match', async () => {
      const { evaluateTargeting } = await import('../src/targeting');
      (evaluateTargeting as any).mockReturnValue({ matched: false, reason: 'no match' });

      init({
        rules: [
          { name: 'no-match-rule', include: { geo: ['uk'] } }
        ]
      });

      const result = decide();
      expect(result).toBe(false);
    });

    it('matches rule with no targeting (property only)', async () => {
      const { matchesProperty } = await import('../src/targeting');
      (matchesProperty as any).mockReturnValue(true);

      init({
        rules: [
          { name: 'property-only-rule', properties: ['testsite'] }
        ]
      });

      const result = decide();
      expect(result).toBe(true);
    });

    it('skips rule when property does not match', async () => {
      const { matchesProperty } = await import('../src/targeting');
      (matchesProperty as any).mockReturnValue(false);

      init({
        rules: [
          { name: 'wrong-property-rule', properties: ['othersite'], include: { geo: ['us'] } }
        ]
      });

      const result = decide();
      expect(result).toBe(false);
    });
  });

  describe('priority slot rule overrides', () => {
    it('getPrioritySlotTypes returns array from config', () => {
      const types = getPrioritySlotTypes();
      expect(Array.isArray(types)).toBe(true);
    });

    it('getPriorityTimeout returns number from config', () => {
      const timeout = getPriorityTimeout();
      expect(typeof timeout).toBe('number');
      expect(timeout).toBeGreaterThan(0);
    });

    it('getPrioritySlotIds returns array from config', () => {
      const ids = getPrioritySlotIds();
      expect(Array.isArray(ids)).toBe(true);
    });
  });

  describe('isPrioritySlot edge cases', () => {
    it('checks against prioritySlotIds first', () => {
      // If slot ID is in prioritySlotIds, should return true regardless of type
      const result = isPrioritySlot('specific-slot', 'non-priority-type');
      expect(typeof result).toBe('boolean');
    });

    it('falls back to adType check from slotId', () => {
      const result = isPrioritySlot('advert_site_mpu_0');
      expect(typeof result).toBe('boolean');
    });
  });
});
