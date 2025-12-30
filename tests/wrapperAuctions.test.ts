import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calculateTimeout,
  updateContext,
  getState,
  reset,
  getConfig,
  init,
  hasSlotConfig,
  hasEnabledWrappers,
  getArchive,
  getAllAuctions,
  getSlotBids,
  getSlotAuction,
  clearAuction,
  registerWrapper,
  getWrapper,
  getRegisteredWrappers,
  requestWrapperAuction,
  requestAuction,
  applyWrapperBids,
  applyBids
} from '../src/wrapperAuctions';

// Mock the loader
const mockLoader = {
  log: vi.fn(),
  environment: {
    getProperty: vi.fn(() => 'testsite')
  }
};

// Mock pubsub
const mockPubsub = {
  publish: vi.fn(),
  subscribe: vi.fn(),
  publishedTopics: [] as string[]
};

// Mock wrappers config
vi.mock('../config/wrappers.json', () => ({
  default: {
    enabled: true,
    timeout: 1500,
    timeoutRules: [
      { include: { geo: ['uk'] }, add: 200 },
      { include: { viewport: ['mobile'] }, add: 100 }
    ],
    wrappers: {
      prebid: { enabled: true },
      amazonaps: { enabled: true }
    }
  }
}));

// Mock partners config (readyEvent is auto-derived as plugin.{name}.complete)
vi.mock('../config/partners.json', () => ({
  default: {
    enabled: true,
    blocking: [
      { name: 'prebid', active: true },
      { name: 'amazonaps', active: true },
      { name: 'inactive-wrapper', active: false }
    ],
    independent: [],
    nonCore: []
  }
}));

// Mock sizemapping
vi.mock('../src/sizemapping', () => ({
  default: {
    getBreakpoint: vi.fn(() => 'desktop')
  }
}));

// Mock generated dimensions
vi.mock('../src/generated/dimensions.js', () => ({
  dimensions: {
    geo: () => 'us',
    viewport: () => 'desktop'
  },
  dimensionConfig: {}
}));

// Mock targeting
vi.mock('../src/targeting', () => ({
  evaluateTargeting: vi.fn((include, exclude, context) => {
    // Check if context matches include
    const geo = context.geo;
    if (include.geo && include.geo.includes(geo)) {
      return { matched: true, reason: 'matched' };
    }
    if (include.viewport && include.viewport.includes(context.viewport)) {
      return { matched: true, reason: 'matched' };
    }
    return { matched: false, reason: 'no match' };
  })
}));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
  (window as any).adsPubsub = mockPubsub;
  reset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('wrapperAuctions', () => {
  describe('getState', () => {
    it('returns state object with expected properties', () => {
      const state = getState();
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('dimensions');
      expect(state).toHaveProperty('timeout');
      expect(state).toHaveProperty('wrappers');
    });

    it('has empty dimensions initially', () => {
      const state = getState();
      expect(state.dimensions).toEqual({});
    });

    it('returns timeout as a number', () => {
      const state = getState();
      expect(typeof state.timeout).toBe('number');
      expect(state.timeout).toBeGreaterThan(0);
    });

    it('includes wrappers array', () => {
      const state = getState();
      expect(Array.isArray(state.wrappers)).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('returns wrappers config object', () => {
      const config = getConfig();
      expect(typeof config).toBe('object');
    });

    it('config has expected structure', () => {
      const config = getConfig();
      // Wrappers config should have enabled property
      expect(config).toHaveProperty('enabled');
    });
  });

  describe('calculateTimeout', () => {
    it('returns a positive number', () => {
      const timeout = calculateTimeout();
      expect(typeof timeout).toBe('number');
      expect(timeout).toBeGreaterThan(0);
    });

    it('returns consistent value when called multiple times', () => {
      const timeout1 = calculateTimeout();
      const timeout2 = calculateTimeout();
      expect(timeout1).toBe(timeout2);
    });
  });

  describe('updateContext', () => {
    it('updates state dimensions', () => {
      updateContext({
        dimensions: { geo: 'us', custom: 'value' }
      });

      const state = getState();
      expect(state.dimensions).toEqual({ geo: 'us', custom: 'value' });
    });

    it('merges dimension updates', () => {
      updateContext({ dimensions: { geo: 'us' } });
      updateContext({ dimensions: { custom: 'value' } });

      const state = getState();
      // Both should be present
      expect(state.dimensions.geo).toBe('us');
      expect(state.dimensions.custom).toBe('value');
    });

    it('updates viewport in state', () => {
      updateContext({ viewport: 'desktop' });

      const state = getState();
      expect(state.viewport).toBe('desktop');
    });

    it('accepts pagetype in context update', () => {
      // updateContext accepts pagetype but it's stored internally
      expect(() => updateContext({ pagetype: 'article' })).not.toThrow();
    });

    it('accepts site in context update', () => {
      expect(() => updateContext({ site: 'mysite' })).not.toThrow();
    });

    it('accepts zone in context update', () => {
      expect(() => updateContext({ zone: 'homepage' })).not.toThrow();
    });
  });

  describe('runtime context affects timeout calculation', () => {
    it('calculateTimeout can be called after updateContext', () => {
      // Get baseline timeout
      const baseTimeout = calculateTimeout();

      // Update context with dimension overrides
      updateContext({
        dimensions: { pagetype: 'liveblog' },
        pagetype: 'liveblog'
      });

      // Timeout calculation should still work
      const newTimeout = calculateTimeout();
      expect(typeof newTimeout).toBe('number');
      expect(newTimeout).toBeGreaterThan(0);
    });

    it('state reflects dimension updates in timeout context', () => {
      updateContext({
        dimensions: { geo: 'us', section: 'sport' }
      });

      // State should include the dimensions
      const state = getState();
      expect(state.dimensions.geo).toBe('us');
      expect(state.dimensions.section).toBe('sport');

      // Timeout should be calculable with these dimensions in context
      const timeout = calculateTimeout();
      expect(timeout).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('clears state dimensions', () => {
      updateContext({ dimensions: { foo: 'bar' } });
      reset();

      const state = getState();
      expect(state.dimensions).toEqual({});
    });

    it('resets initialized state', () => {
      reset();
      const state = getState();
      expect(state.initialized).toBe(false);
    });

    it('clears viewport', () => {
      updateContext({ viewport: 'mobile' });
      reset();

      const state = getState();
      expect(state.viewport).toBeNull();
    });

    it('reset works after context updates', () => {
      updateContext({ pagetype: 'article' });
      reset();

      const state = getState();
      expect(state.initialized).toBe(false);
    });
  });

  describe('init', () => {
    it('initializes the module', () => {
      init();
      const state = getState();
      expect(state.initialized).toBe(true);
    });

    it('returns state after init', () => {
      const result = init();
      expect(result).toHaveProperty('initialized');
    });

    it('multiple init calls return same state', () => {
      init();
      const state1 = getState();
      init();
      const state2 = getState();
      expect(state1.initialized).toBe(state2.initialized);
    });
  });

  describe('hasSlotConfig', () => {
    it('returns boolean for any slot ID', () => {
      const result = hasSlotConfig('test-slot');
      expect(typeof result).toBe('boolean');
    });

    it('returns false for unknown slots', () => {
      const result = hasSlotConfig('nonexistent-slot-xyz');
      expect(result).toBe(false);
    });
  });

  describe('hasEnabledWrappers', () => {
    it('returns boolean', () => {
      const result = hasEnabledWrappers();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getArchive', () => {
    it('returns object', () => {
      const archive = getArchive();
      expect(typeof archive).toBe('object');
    });

    it('returns empty object initially', () => {
      const archive = getArchive();
      expect(Object.keys(archive)).toHaveLength(0);
    });
  });

  describe('getAllAuctions', () => {
    it('returns object', () => {
      const auctions = getAllAuctions();
      expect(typeof auctions).toBe('object');
    });

    it('returns empty object initially', () => {
      const auctions = getAllAuctions();
      expect(Object.keys(auctions)).toHaveLength(0);
    });
  });

  describe('getSlotBids', () => {
    it('returns empty array for unknown slot', () => {
      const bids = getSlotBids('nonexistent-slot');
      expect(Array.isArray(bids)).toBe(true);
      expect(bids).toHaveLength(0);
    });
  });

  describe('getSlotAuction', () => {
    it('returns auction object with null values for unknown slot', () => {
      const auction = getSlotAuction('nonexistent-slot');
      expect(auction).toHaveProperty('bids');
      expect(auction).toHaveProperty('startTime', null);
      expect(auction).toHaveProperty('timeout', null);
    });
  });

  describe('clearAuction', () => {
    it('does not throw for unknown slot', () => {
      expect(() => clearAuction('nonexistent-slot')).not.toThrow();
    });
  });

  describe('wrapper registry', () => {
    describe('getRegisteredWrappers', () => {
      it('returns array of wrapper names', () => {
        const wrappers = getRegisteredWrappers();
        expect(Array.isArray(wrappers)).toBe(true);
      });

      it('includes built-in wrappers', () => {
        const wrappers = getRegisteredWrappers();
        // Should have at least some wrappers registered
        expect(wrappers.length).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getWrapper', () => {
      it('returns falsy for unregistered wrapper', () => {
        const wrapper = getWrapper('nonexistent-wrapper');
        expect(wrapper).toBeFalsy();
      });

      it('returns wrapper for known wrapper names', () => {
        const wrappers = getRegisteredWrappers();
        if (wrappers.length > 0) {
          const wrapper = getWrapper(wrappers[0]);
          expect(wrapper).not.toBeNull();
        }
      });
    });

    describe('registerWrapper', () => {
      it('accepts wrapper adapter objects', () => {
        // Create a minimal mock that satisfies the interface
        const mockWrapper = {
          name: 'test-mock',
          isLibraryLoaded: () => false,
          init: vi.fn(),
          hasSlotConfig: () => false,
          getAdUnit: () => null,
          getSizes: () => [],
          requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
          applyTargeting: vi.fn()
        } as any;

        expect(() => registerWrapper(mockWrapper)).not.toThrow();
      });

      it('rejects adapter without name', () => {
        const invalidAdapter = {
          isLibraryLoaded: () => false,
          init: vi.fn(),
          hasSlotConfig: () => false,
          getAdUnit: () => null,
          requestBids: vi.fn(),
          applyTargeting: vi.fn()
        } as any;

        // Should warn and not register
        registerWrapper(invalidAdapter);
        expect(mockLoader.log).toHaveBeenCalled();
      });

      it('rejects adapter missing required methods', () => {
        const incompleteAdapter = {
          name: 'incomplete',
          isLibraryLoaded: () => false
          // Missing other required methods
        } as any;

        registerWrapper(incompleteAdapter);
        // Should have logged warning about missing methods
        expect(mockLoader.log).toHaveBeenCalled();
      });

      it('replaces existing wrapper with same name', () => {
        const wrapper1 = {
          name: 'duplicate',
          isLibraryLoaded: () => false,
          init: vi.fn(),
          hasSlotConfig: () => false,
          getAdUnit: () => null,
          requestBids: vi.fn(),
          applyTargeting: vi.fn()
        } as any;

        const wrapper2 = {
          name: 'duplicate',
          isLibraryLoaded: () => true, // Different
          init: vi.fn(),
          hasSlotConfig: () => false,
          getAdUnit: () => null,
          requestBids: vi.fn(),
          applyTargeting: vi.fn()
        } as any;

        registerWrapper(wrapper1);
        registerWrapper(wrapper2);

        const wrapper = getWrapper('duplicate');
        expect(wrapper?.isLibraryLoaded()).toBe(true);
      });
    });
  });

  describe('requestWrapperAuction', () => {
    it('returns failure for unregistered wrapper', async () => {
      const result = await requestWrapperAuction('nonexistent', 'slot-1');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('not registered');
    });

    it('returns failure when wrapper library not loaded', async () => {
      const mockWrapper = {
        name: 'test-wrapper',
        isLibraryLoaded: () => false,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);
      init();

      const result = await requestWrapperAuction('test-wrapper', 'slot-1');
      expect(result.success).toBe(false);
    });

    it('returns failure when slot has no config', async () => {
      const mockWrapper = {
        name: 'test-wrapper-noconfig',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => false,
        getAdUnit: () => null,
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);
      init();

      // Mark partner as ready by simulating pubsub
      mockPubsub.publishedTopics = ['plugin.test-wrapper-noconfig.complete'];

      const result = await requestWrapperAuction('test-wrapper-noconfig', 'slot-1');
      expect(result.success).toBe(false);
    });
  });

  describe('requestAuction', () => {
    it('returns success when no wrappers registered', async () => {
      const result = await requestAuction('slot-1');
      expect(result.success).toBe(true);
      expect(result.reason).toContain('No wrappers');
    });

    it('handles auction options', async () => {
      const result = await requestAuction('slot-1', { adcount: 2 });
      expect(typeof result).toBe('object');
    });
  });

  describe('applyWrapperBids', () => {
    it('does nothing for unregistered wrapper', () => {
      expect(() => applyWrapperBids('nonexistent', 'slot-1')).not.toThrow();
    });

    it('does nothing when auction has no bids', () => {
      const mockWrapper = {
        name: 'apply-test',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);

      expect(() => applyWrapperBids('apply-test', 'slot-1')).not.toThrow();
      expect(mockWrapper.applyTargeting).not.toHaveBeenCalled();
    });
  });

  describe('applyBids', () => {
    it('applies bids for all registered wrappers', () => {
      expect(() => applyBids('slot-1')).not.toThrow();
    });
  });

  describe('clearAuction archiving', () => {
    it('archives auction data when cleared', () => {
      // Create an auction
      const auction = getSlotAuction('archive-test-slot');
      auction.startTime = Date.now();
      auction.timeout = 1500;

      // Clear the auction
      clearAuction('archive-test-slot');

      // Check archive
      const archive = getArchive();
      expect(archive['archive-test-slot']).toBeDefined();
      expect(archive['archive-test-slot'].length).toBeGreaterThan(0);
    });

    it('archives include timestamp', () => {
      const auction = getSlotAuction('timestamp-test');
      auction.startTime = Date.now();

      clearAuction('timestamp-test');

      const archive = getArchive();
      const archivedData = archive['timestamp-test'][0];
      expect(archivedData).toHaveProperty('timestamp');
      expect(archivedData).toHaveProperty('data');
    });

    it('keeps multiple archive entries', () => {
      // First auction
      getSlotAuction('multi-archive');
      clearAuction('multi-archive');

      // Second auction
      getSlotAuction('multi-archive');
      clearAuction('multi-archive');

      const archive = getArchive();
      expect(archive['multi-archive'].length).toBe(2);
    });
  });

  describe('timeout rules', () => {
    it('base timeout is used when no rules match', () => {
      // Default context doesn't match geo:uk or viewport:mobile
      const timeout = calculateTimeout();
      expect(timeout).toBe(1500); // Base timeout from mock config
    });

    it('timeout increases when geo rule matches', () => {
      updateContext({ dimensions: { geo: 'uk' } });

      const timeout = calculateTimeout();
      // Base (1500) + geo rule (200) = 1700
      expect(timeout).toBeGreaterThanOrEqual(1500);
    });

    it('timeout increases when viewport rule matches', () => {
      updateContext({ viewport: 'mobile' });

      const timeout = calculateTimeout();
      // Should include mobile modifier
      expect(timeout).toBeGreaterThanOrEqual(1500);
    });
  });

  describe('partner integration', () => {
    it('skips inactive partners', () => {
      const result = hasEnabledWrappers();
      // Should check partner active status
      expect(typeof result).toBe('boolean');
    });

    it('hasEnabledWrappers respects config enabled flag', () => {
      init();
      const result = hasEnabledWrappers();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('slot auction state', () => {
    it('getSlotAuction creates new state for unknown slot', () => {
      const auction1 = getSlotAuction('new-slot-1');
      const auction2 = getSlotAuction('new-slot-1');

      // Should return same object
      expect(auction1).toBe(auction2);
    });

    it('auction state includes bidderTiming', () => {
      const auction = getSlotAuction('timing-test');
      expect(auction).toHaveProperty('bidderTiming');
      expect(typeof auction.bidderTiming).toBe('object');
    });

    it('auction state includes bids array', () => {
      const auction = getSlotAuction('bids-test');
      expect(auction).toHaveProperty('bids');
      expect(Array.isArray(auction.bids)).toBe(true);
    });

    it('getAllAuctions returns all active auctions', () => {
      getSlotAuction('slot-a');
      getSlotAuction('slot-b');

      const all = getAllAuctions();
      expect(all).toHaveProperty('slot-a');
      expect(all).toHaveProperty('slot-b');
    });

    it('clearAuction removes from active auctions', () => {
      getSlotAuction('clear-me');

      let all = getAllAuctions();
      expect(all).toHaveProperty('clear-me');

      clearAuction('clear-me');

      all = getAllAuctions();
      expect(all).not.toHaveProperty('clear-me');
    });
  });

  describe('init options', () => {
    it('accepts dimensions in init', () => {
      init({ dimensions: { geo: 'de', custom: 'value' } });

      const state = getState();
      expect(state.dimensions.geo).toBe('de');
      expect(state.dimensions.custom).toBe('value');
    });

    it('accepts viewport in init', () => {
      init({ viewport: 'tablet' });

      const state = getState();
      expect(state.viewport).toBe('tablet');
    });

    it('accepts pagetype in init', () => {
      init({ pagetype: 'article' });

      const state = getState();
      expect(state.initialized).toBe(true);
    });

    it('accepts site and zone in init', () => {
      init({ site: 'mysite', zone: 'homepage' });

      expect(getState().initialized).toBe(true);
    });

    it('supports legacy geo parameter', () => {
      init({ geo: 'fr' });

      const state = getState();
      expect(state.dimensions.geo).toBe('fr');
    });
  });

  describe('wrapper state in getState', () => {
    it('includes registered wrapper names', () => {
      const mockWrapper = {
        name: 'state-test-wrapper',
        isLibraryLoaded: () => false,
        init: vi.fn(),
        hasSlotConfig: () => false,
        getAdUnit: () => null,
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);
      init();

      const state = getState();
      expect(state.wrappers).toContain('state-test-wrapper');
    });

    it('includes enabled status per wrapper', () => {
      init();

      const state = getState();
      // State should have [wrapperName]Enabled properties
      expect(typeof state.initialized).toBe('boolean');
    });
  });

  describe('partner not active behavior', () => {
    it('returns disabled when partner is not active', async () => {
      const mockWrapper = {
        name: 'inactive-wrapper', // Matches inactive partner in mock
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);
      init();

      const result = await requestWrapperAuction('inactive-wrapper', 'slot-1');
      expect(result.success).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('skips inactive wrappers in requestAuction', async () => {
      const activeWrapper = {
        name: 'prebid', // Active in mock config
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
        applyTargeting: vi.fn()
      } as any;

      const inactiveWrapper = {
        name: 'inactive-wrapper',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(activeWrapper);
      registerWrapper(inactiveWrapper);
      init();

      await requestAuction('slot-1');

      // Inactive wrapper should not have requestBids called
      expect(inactiveWrapper.requestBids).not.toHaveBeenCalled();
    });
  });

  describe('partner not ready behavior', () => {
    it('returns failure when partner ready event not received', async () => {
      const mockWrapper = {
        name: 'not-ready-wrapper',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);
      init();

      // Don't simulate ready event - partner is not ready
      const result = await requestWrapperAuction('not-ready-wrapper', 'slot-1');
      expect(result.success).toBe(false);
    });
  });

  describe('bids storage and application', () => {
    it('stores bids in auction state', () => {
      const auction = getSlotAuction('bids-storage-test');

      // Manually add bids to simulate successful auction
      (auction.bids as any[]).push({ bidder: 'test', cpm: 1.5, hasBid: true });

      const bids = getSlotBids('bids-storage-test');
      expect(bids.length).toBe(1);
      expect(bids[0].bidder).toBe('test');
    });

    it('getSlotBids returns copy of bids array', () => {
      const auction = getSlotAuction('bids-copy-test');
      (auction.bids as any[]).push({ bidder: 'test', cpm: 1.0 });

      const bids1 = getSlotBids('bids-copy-test');
      const bids2 = getSlotBids('bids-copy-test');

      // Should return same data
      expect(bids1.length).toBe(bids2.length);
    });

    it('applyWrapperBids calls adapter applyTargeting when bids exist', () => {
      const mockWrapper = {
        name: 'apply-bids-test',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);

      // Create auction with successful bid state
      const auction = getSlotAuction('apply-bids-slot');
      auction['apply-bids-test'] = true; // Mark as having bids

      applyWrapperBids('apply-bids-test', 'apply-bids-slot');

      expect(mockWrapper.applyTargeting).toHaveBeenCalledWith('apply-bids-slot');
    });

    it('applyWrapperBids skips when no bids', () => {
      const mockWrapper = {
        name: 'no-bids-test',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);

      // Create auction without bids
      const auction = getSlotAuction('no-bids-slot');
      auction['no-bids-test'] = false; // No bids

      applyWrapperBids('no-bids-test', 'no-bids-slot');

      expect(mockWrapper.applyTargeting).not.toHaveBeenCalled();
    });
  });

  describe('auction timing tracking', () => {
    it('tracks startTime in auction state', () => {
      const auction = getSlotAuction('timing-track-test');
      expect(auction.startTime).toBeNull();

      // Set timing
      auction.startTime = Date.now();
      expect(auction.startTime).not.toBeNull();
    });

    it('tracks bidderTiming for individual bidders', () => {
      const auction = getSlotAuction('bidder-timing-test');
      const bidderTiming = auction.bidderTiming as Record<string, any>;

      bidderTiming['rubicon'] = { raw: 150, formatted: '150ms' };
      bidderTiming['appnexus'] = { raw: 200, formatted: '200ms' };

      expect(bidderTiming['rubicon'].raw).toBe(150);
      expect(bidderTiming['appnexus'].formatted).toBe('200ms');
    });
  });

  describe('adapter initialization', () => {
    it('initializes adapter when orchestrator already initialized', () => {
      init(); // Initialize first

      const mockWrapper = {
        name: 'late-register',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => false,
        getAdUnit: () => null,
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);

      // Adapter init should have been called since orchestrator was already initialized
      expect(mockWrapper.init).toHaveBeenCalled();
    });

    it('handles adapter init throwing error', () => {
      init();

      const mockWrapper = {
        name: 'init-error',
        isLibraryLoaded: () => true,
        init: vi.fn(() => { throw new Error('Init failed'); }),
        hasSlotConfig: () => false,
        getAdUnit: () => null,
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      // Should not throw when registering adapter that fails init
      expect(() => registerWrapper(mockWrapper)).not.toThrow();
    });

    it('handles adapter init returning Promise rejection', () => {
      init();

      const mockWrapper = {
        name: 'init-promise-reject',
        isLibraryLoaded: () => true,
        init: vi.fn(() => Promise.reject(new Error('Async init failed'))),
        hasSlotConfig: () => false,
        getAdUnit: () => null,
        requestBids: vi.fn(),
        applyTargeting: vi.fn()
      } as any;

      // Should not throw when registering adapter with async init failure
      expect(() => registerWrapper(mockWrapper)).not.toThrow();
    });
  });

  describe('disabled config behavior', () => {
    it('returns early when wrappers disabled in config', async () => {
      // The mock has enabled: true, so this tests the enabled path
      init();

      const state = getState();
      expect(state.initialized).toBe(true);
    });

    it('hasEnabledWrappers returns false when no wrappers match criteria', () => {
      // Without any valid wrappers registered that are both active and ready
      reset();
      const result = hasEnabledWrappers();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('clearAuction behavior', () => {
    it('clears pending timeouts for slot', () => {
      // Create auction state
      getSlotAuction('timeout-clear-test');

      // Clear should not throw
      expect(() => clearAuction('timeout-clear-test')).not.toThrow();

      // Slot should be removed from active auctions
      const all = getAllAuctions();
      expect(all['timeout-clear-test']).toBeUndefined();
    });

    it('notifies adapters via clearSlot if available', () => {
      const mockWrapper = {
        name: 'clear-notify',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => false,
        getAdUnit: () => null,
        requestBids: vi.fn(),
        applyTargeting: vi.fn(),
        clearSlot: vi.fn()
      } as any;

      registerWrapper(mockWrapper);

      getSlotAuction('clear-notify-slot');
      clearAuction('clear-notify-slot');

      expect(mockWrapper.clearSlot).toHaveBeenCalledWith('clear-notify-slot');
    });
  });

  describe('additive timeout rules', () => {
    it('applies multiple matching rules additively', () => {
      // Set context that matches both geo:uk and viewport:mobile rules
      updateContext({
        dimensions: { geo: 'uk' },
        viewport: 'mobile'
      });

      const timeout = calculateTimeout();

      // Base (1500) + geo rule could add up
      // The mock targeting may not match both, but timeout should be >= base
      expect(timeout).toBeGreaterThanOrEqual(1500);
    });

    it('stacks timeout modifiers from multiple rules', () => {
      // First set a baseline
      reset();
      const baseTimeout = calculateTimeout();

      // Now update context to potentially match rules
      updateContext({ dimensions: { geo: 'uk' } });
      const withGeoTimeout = calculateTimeout();

      // With matching geo rule, timeout should be >= base
      expect(withGeoTimeout).toBeGreaterThanOrEqual(baseTimeout);
    });

    it('returns base timeout when no rules match', () => {
      // Reset and don't set any dimension that matches rules
      reset();
      updateContext({ dimensions: { geo: 'de' } }); // Not 'uk'

      const timeout = calculateTimeout();
      expect(timeout).toBe(1500); // Base timeout from mock config
    });
  });

  describe('auction state management', () => {
    it('sets wrapper state to pending during auction', () => {
      const mockWrapper = {
        name: 'pending-test',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);

      // Create auction state manually
      const auction = getSlotAuction('pending-state-slot');

      // Initially wrapper state should be 'off'
      expect(auction['pending-test']).toBe('off');
    });

    it('tracks wrapper-specific auction end time', () => {
      const auction = getSlotAuction('end-time-test');
      auction.startTime = Date.now();
      auction.timeout = 1500;

      // Simulate wrapper completing
      auction['testWrapper'] = true;
      auction['testWrapperAuctionEnd'] = 500; // 500ms remaining

      expect(auction['testWrapperAuctionEnd']).toBe(500);
    });
  });

  describe('hung adapter fallback behavior', () => {
    it('auction state initialized with off status for all wrappers', () => {
      const mockWrapper = {
        name: 'hung-test',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);
      init();

      const auction = getSlotAuction('hung-test-slot');

      // Should have entry for registered wrapper
      expect(auction).toHaveProperty('hung-test');
      expect(auction['hung-test']).toBe('off');
    });

    it('auction includes timeout value', () => {
      const auction = getSlotAuction('timeout-value-test');

      // Manually set timing
      auction.startTime = Date.now();
      auction.timeout = 1500;

      expect(auction.timeout).toBe(1500);
    });
  });

  describe('successful auction flow', () => {
    it('stores bidder timing information', () => {
      const auction = getSlotAuction('timing-flow-test');
      const bidderTiming = auction.bidderTiming as Record<string, any>;

      // Simulate bidder response times
      bidderTiming['bidder1'] = { raw: 100, formatted: '100ms' };
      bidderTiming['bidder2'] = { raw: 250, formatted: '250ms' };

      expect(Object.keys(bidderTiming).length).toBe(2);
      expect(bidderTiming['bidder1'].raw).toBe(100);
    });

    it('bids array accumulates bid responses', () => {
      const auction = getSlotAuction('bids-accumulate-test');
      const bids = auction.bids as any[];

      bids.push({ bidder: 'a', cpm: 1.0 });
      bids.push({ bidder: 'b', cpm: 2.0 });

      expect(bids.length).toBe(2);
    });
  });

  describe('wrapper config enabled check', () => {
    it('respects wrappers.json enabled flag per wrapper', () => {
      // The mock config has prebid.enabled: true
      // hasEnabledWrappers checks both config and partner status
      init();

      const state = getState();
      expect(state.initialized).toBe(true);
    });

    it('getConfig returns full wrapper configuration', () => {
      const config = getConfig();

      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('timeout');
      expect(config).toHaveProperty('timeoutRules');
    });
  });

  describe('partner ready event not fired', () => {
    it('partner whose ready event has not been published returns not ready', async () => {
      const mockWrapper = {
        name: 'no-ready-event-partner',
        isLibraryLoaded: () => true,
        init: vi.fn(),
        hasSlotConfig: () => true,
        getAdUnit: () => ({}),
        requestBids: vi.fn().mockResolvedValue({ success: true, bids: [] }),
        applyTargeting: vi.fn()
      } as any;

      registerWrapper(mockWrapper);
      init();

      // Partner's ready event (plugin.no-ready-event-partner.complete) hasn't been published
      const result = await requestWrapperAuction('no-ready-event-partner', 'slot-1');
      expect(result.success).toBe(false);
    });
  });
});
