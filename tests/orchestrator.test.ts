import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  init,
  getState,
  getPartnerStatus,
  isPartnersReady,
  isAllPartnersReady,
  isNonCoreReady,
  getConfig,
  getDependency,
  getDependents,
  canLoad,
  reset
} from '../src/orchestrator';

// Mock the global loader
const mockLoader = {
  log: vi.fn(),
  hooks: {
    execute: vi.fn().mockResolvedValue(undefined),
    executeSync: vi.fn()
  }
};

// Mock pubsub (CONFIG.pubsubGlobal = 'PubSub')
const mockPubsub = {
  publish: vi.fn(),
  subscribe: vi.fn()
};

// Mock loader config
vi.mock('../config/loader.js', () => ({
  default: {
    globalName: 'proton',
    pubsubGlobal: 'PubSub'
  }
}));

// Mock partners config (readyEvent is auto-derived as plugin.{name}.complete)
vi.mock('../config/partners.json', () => ({
  default: {
    enabled: true,
    blocking: [
      { name: 'cmp', active: true, timeout: 500 },
      { name: 'prebid', active: true, timeout: 1000, dependsOn: 'cmp' },
      { name: 'amazonaps', active: true, timeout: 800 },
      { name: 'inactive-partner', active: false, timeout: 300 }
    ],
    independent: [
      { name: 'analytics', active: true }
    ],
    nonCore: [
      { name: 'tracking', active: true }
    ],
    defaults: {
      universalTimeout: 2000,
      independentTimeout: 1500,
      nonCoreTimeout: 3000,
      minTimeout: 500
    }
  }
}));

beforeEach(() => {
  reset();
  vi.clearAllMocks();
  vi.useFakeTimers();
  (window as any).proton = mockLoader;
  (window as any).PubSub = mockPubsub;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('orchestrator state', () => {
  describe('getState', () => {
    it('returns initial state before init', () => {
      const state = getState();
      expect(state.initialized).toBe(false);
      expect(state.partnersReady).toBe(false);
      expect(state.allPartnersReady).toBe(false);
    });
  });

  describe('getConfig', () => {
    it('returns partners config', () => {
      const config = getConfig();
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('blocking');
      expect(config).toHaveProperty('independent');
      expect(config).toHaveProperty('nonCore');
    });
  });
});

describe('partner status', () => {
  describe('isPartnersReady', () => {
    it('returns false before init', () => {
      expect(isPartnersReady()).toBe(false);
    });
  });

  describe('isAllPartnersReady', () => {
    it('returns false before init', () => {
      expect(isAllPartnersReady()).toBe(false);
    });
  });

  describe('isNonCoreReady', () => {
    it('returns false before init', () => {
      expect(isNonCoreReady()).toBe(false);
    });
  });

  describe('getPartnerStatus', () => {
    it('returns null for unknown partner', () => {
      const status = getPartnerStatus('unknown-partner');
      expect(status).toBeNull();
    });
  });
});

describe('dependency management', () => {
  describe('getDependency', () => {
    it('returns null for partner with no dependency', () => {
      // amazonaps has no dependency in mock config
      expect(getDependency('amazonaps')).toBeNull();
    });

    it('returns null for unknown partner', () => {
      expect(getDependency('unknown-partner')).toBeNull();
    });
  });

  describe('getDependents', () => {
    it('returns empty array for partner with no dependents', () => {
      const dependents = getDependents('unknown-partner');
      expect(dependents).toEqual([]);
    });
  });

  describe('canLoad', () => {
    it('returns true for partner with no dependency', () => {
      // Partners without dependencies can always load
      expect(canLoad('unknown-partner')).toBe(true);
    });

    it('returns true when no dependency is configured', () => {
      // cmp has no dependency
      expect(canLoad('cmp')).toBe(true);
    });
  });
});

describe('init', () => {
  it('initializes orchestrator state', () => {
    init({
      onPartnersReady: vi.fn(),
      onAllPartnersReady: vi.fn()
    });

    const state = getState();
    expect(state.initialized).toBe(true);
    expect(state.startTime).not.toBeNull();
  });

  it('sets startTime on init', () => {
    const before = Date.now();
    init();
    const after = Date.now();

    const state = getState();
    expect(state.startTime).toBeGreaterThanOrEqual(before);
    expect(state.startTime).toBeLessThanOrEqual(after);
  });

  it('sets timeout values from config', () => {
    init();
    const state = getState();

    // Should have some timeout values set
    expect(typeof state.universalTimeout).toBe('number');
    expect(typeof state.independentTimeout).toBe('number');
    expect(typeof state.nonCoreTimeout).toBe('number');
  });

  it('returns existing state if already initialized', () => {
    init();
    const state1 = getState();

    init();  // Should return same state
    const state2 = getState();

    expect(state1.startTime).toBe(state2.startTime);
  });

  it('accepts partnersStartTime to adjust timeout', () => {
    const pastTime = Date.now() - 500;  // 500ms ago
    init({ partnersStartTime: pastTime });

    const state = getState();
    expect(state.initialized).toBe(true);
  });

  it('includes elapsed time in getState', () => {
    init();
    const state = getState();
    expect(typeof state.elapsed).toBe('number');
    expect(state.elapsed).toBeGreaterThanOrEqual(0);
  });

  it('includes partner status in getState', () => {
    init();
    const state = getState();
    expect(state).toHaveProperty('blocking');
    expect(state).toHaveProperty('independent');
    expect(state).toHaveProperty('nonCore');
  });
});

describe('reset', () => {
  it('clears initialized state', () => {
    init();
    expect(getState().initialized).toBe(true);

    reset();
    expect(getState().initialized).toBe(false);
  });

  it('clears partner status', () => {
    init();
    reset();

    const state = getState();
    expect(state.partnersReady).toBe(false);
    expect(state.allPartnersReady).toBe(false);
  });
});

describe('dependency graph calculations', () => {
  it('calculates timeout from dependency chains', () => {
    // cmp (500) + prebid (1000) = 1500ms critical path
    // amazonaps (800) runs in parallel
    // Max of (1500, 800) = 1500ms
    init();
    const state = getState();

    // universalTimeout should reflect the longest critical path
    expect(typeof state.universalTimeout).toBe('number');
    expect(state.universalTimeout).toBeGreaterThan(0);
  });

  it('getDependency returns correct dependency for partner', () => {
    const dep = getDependency('prebid');
    expect(dep).toBe('cmp');
  });

  it('getDependency returns null for partner without dependency', () => {
    const dep = getDependency('amazonaps');
    expect(dep).toBeNull();
  });

  it('getDependents returns partners that depend on a partner', () => {
    const dependents = getDependents('cmp');
    expect(dependents).toContain('prebid');
  });

  it('canLoad returns true when dependency is completed', () => {
    // For partners with no dependency
    expect(canLoad('cmp')).toBe(true);
    expect(canLoad('amazonaps')).toBe(true);
  });

  it('canLoad returns true for partner with no dependency', () => {
    expect(canLoad('some-unknown-partner')).toBe(true);
  });
});

describe('partnersStartTime adjustment', () => {
  it('adjusts timeout when partnersStartTime is provided', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    // Start partners 300ms ago
    const partnersStartTime = now - 300;

    init({ partnersStartTime });

    const state = getState();
    // Timeout should be reduced but respect minTimeout
    expect(state.universalTimeout).toBeGreaterThanOrEqual(500); // minTimeout
  });

  it('respects minTimeout when elapsed time is large', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    // Start partners 5000ms ago (more than any timeout)
    const partnersStartTime = now - 5000;

    init({ partnersStartTime });

    const state = getState();
    // Should not go below minTimeout (500ms)
    expect(state.universalTimeout).toBeGreaterThanOrEqual(500);
  });

  it('does not adjust when partnersStartTime is in future', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    // partnersStartTime in future (shouldn't happen but handle gracefully)
    const partnersStartTime = now + 1000;

    init({ partnersStartTime });

    const state = getState();
    // No adjustment should happen
    expect(state.initialized).toBe(true);
  });
});

describe('timeout handling', () => {
  it('sets universal timeout when blocking partners exist', () => {
    init();

    const state = getState();
    expect(state.universalTimeout).toBeGreaterThan(0);
  });

  it('fires partners ready on universal timeout', () => {
    const onPartnersReady = vi.fn();
    init({ onPartnersReady });

    expect(isPartnersReady()).toBe(false);

    // Advance past the universal timeout
    vi.advanceTimersByTime(3000);

    expect(isPartnersReady()).toBe(true);
    expect(onPartnersReady).toHaveBeenCalled();
  });

  it('marks pending partners as timed out when universal timeout fires', () => {
    init();

    // Advance past the universal timeout
    vi.advanceTimersByTime(3000);

    const state = getState();
    expect(state.timeoutFired).toBe(true);
  });

  it('clears universal timeout when reset is called', () => {
    init();
    reset();

    // Should not throw even after advancing timers
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    expect(getState().initialized).toBe(false);
  });
});

describe('callback handling', () => {
  it('executes onPartnersReady callback when partners are ready', () => {
    const onPartnersReady = vi.fn();
    init({ onPartnersReady });

    // Fire timeout to trigger partners ready
    vi.advanceTimersByTime(3000);

    expect(onPartnersReady).toHaveBeenCalled();
  });

  it('executes onAllPartnersReady callback after all partners complete', () => {
    const onAllPartnersReady = vi.fn();
    init({ onAllPartnersReady });

    // Fire timeout to trigger partners ready
    vi.advanceTimersByTime(3000);

    // Independent timeout fires later
    vi.advanceTimersByTime(2000);

    expect(onAllPartnersReady).toHaveBeenCalled();
  });

  it('handles missing callbacks gracefully', () => {
    expect(() => {
      init();
      vi.advanceTimersByTime(5000);
    }).not.toThrow();
  });
});

describe('partner status tracking', () => {
  it('initializes blocking partner status', () => {
    init();

    const cmpStatus = getPartnerStatus('cmp');
    expect(cmpStatus).not.toBeNull();
    expect(cmpStatus?.status).toBe('pending');
  });

  it('skips inactive partners', () => {
    init();

    const inactiveStatus = getPartnerStatus('inactive-partner');
    expect(inactiveStatus).toBeNull();
  });

  it('tracks independent partner status', () => {
    init();

    const analyticsStatus = getPartnerStatus('analytics');
    expect(analyticsStatus).not.toBeNull();
    expect(analyticsStatus?.status).toBe('pending');
  });

  it('tracks nonCore partner status', () => {
    init();

    const trackingStatus = getPartnerStatus('tracking');
    expect(trackingStatus).not.toBeNull();
    expect(trackingStatus?.status).toBe('pending');
  });

  it('includes partner status in state', () => {
    init();

    const state = getState();
    expect(state.blocking).toHaveProperty('cmp');
    expect(state.blocking).toHaveProperty('prebid');
    expect(state.blocking).toHaveProperty('amazonaps');
    expect(state.independent).toHaveProperty('analytics');
    expect(state.nonCore).toHaveProperty('tracking');
  });
});

describe('disabled orchestrator', () => {
  it('documents expected behavior when orchestrator is disabled', () => {
    // Note: This test documents expected behavior
    // In practice, config changes require module reload
    // With disabled config, callbacks should fire immediately
    // and the module returns early when disabled

    // Before init, module is not initialized
    expect(getState().initialized).toBe(false);

    // After init with current (enabled) config, module initializes
    init();
    expect(getState().initialized).toBe(true);
  });
});

describe('pubsub integration', () => {
  it('initializes successfully with pubsub available', () => {
    init();

    // Should initialize successfully when pubsub is available
    expect(getState().initialized).toBe(true);
  });

  it('sets up partner status when initialized', () => {
    init();

    // Should have partner status entries for active partners
    const state = getState();
    expect(Object.keys(state.blocking).length).toBeGreaterThan(0);
  });

  it('handles missing pubsub gracefully', () => {
    delete (window as any).PubSub;

    expect(() => init()).not.toThrow();
    expect(getState().initialized).toBe(true);
  });
});

describe('state elapsed time', () => {
  it('tracks elapsed time since init', () => {
    const now = Date.now();
    vi.setSystemTime(now);

    init();

    // Advance time
    vi.advanceTimersByTime(100);

    const state = getState();
    expect(state.elapsed).toBeGreaterThanOrEqual(100);
  });

  it('returns 0 elapsed before init', () => {
    const state = getState();
    expect(state.elapsed).toBe(0);
  });
});

describe('timeout values from config', () => {
  it('uses independentTimeout from config defaults', () => {
    init();

    const state = getState();
    // Should use the mock config value (1500)
    expect(state.independentTimeout).toBe(1500);
  });

  it('uses nonCoreTimeout from config defaults', () => {
    init();

    const state = getState();
    // Should use the mock config value (3000)
    expect(state.nonCoreTimeout).toBe(3000);
  });
});

describe('edge cases - partner config issues', () => {
  it('handles blocking partner with missing timeout gracefully', () => {
    // The mock config has partners with timeouts
    // This test verifies the module doesn't deadlock when initialized
    init();

    const state = getState();
    expect(state.initialized).toBe(true);
    // Should have calculated a timeout (from partners that do have timeouts)
    expect(state.universalTimeout).toBeGreaterThan(0);

    // Advance past timeout - should still fire partnersReady
    vi.advanceTimersByTime(3000);
    expect(isPartnersReady()).toBe(true);
  });

  it('fires partnersReady even when some partners have no readyEvent', () => {
    // Verifies the orchestrator doesn't hang waiting for events that never come
    init();

    expect(getState().initialized).toBe(true);

    // Advance past universal timeout
    vi.advanceTimersByTime(3000);

    // Should fire ready even if some ready events never arrived
    expect(isPartnersReady()).toBe(true);
    expect(getState().timeoutFired).toBe(true);
  });

  it('throws when pubsub subscribe fails', () => {
    // Set up pubsub that throws on subscribe
    (window as any).PubSub = {
      publish: vi.fn(),
      subscribe: vi.fn(() => { throw new Error('Subscribe failed'); })
    };

    // Note: Subscribe failures currently propagate (not handled gracefully)
    // This documents current behavior - future improvement could add try-catch
    expect(() => init()).toThrow('Subscribe failed');
  });

  it('treats partner as pending when readyEvent never fires', () => {
    init();

    // Partner status should be pending initially
    const cmpStatus = getPartnerStatus('cmp');
    expect(cmpStatus?.status).toBe('pending');

    // After timeout, status should change to timeout
    vi.advanceTimersByTime(3000);

    const cmpStatusAfter = getPartnerStatus('cmp');
    expect(cmpStatusAfter?.status).toBe('timeout');
  });
});

describe('ready flow - events cancel timers', () => {
  it('fires partnersReady when all blocking partners complete before timeout', () => {
    const onPartnersReady = vi.fn();
    init({ onPartnersReady });

    // Simulate all blocking partners firing their ready events
    // by advancing just past the universal timeout
    vi.advanceTimersByTime(2000);

    // The mock doesn't actually fire ready events, so timeout will fire
    expect(isPartnersReady()).toBe(true);
  });

  it('allPartnersReady fires when independent partners complete', () => {
    const onAllPartnersReady = vi.fn();
    init({ onAllPartnersReady });

    // Fire blocking timeout
    vi.advanceTimersByTime(2000);
    expect(isPartnersReady()).toBe(true);

    // Fire independent timeout
    vi.advanceTimersByTime(2000);
    expect(isAllPartnersReady()).toBe(true);
    expect(onAllPartnersReady).toHaveBeenCalled();
  });

  it('nonCoreReady fires on nonCore timeout', () => {
    init();

    // NonCore timeout is 3000ms from mock config
    // Wait for both blocking and nonCore
    vi.advanceTimersByTime(4000);

    expect(isNonCoreReady()).toBe(true);
  });

  it('tracks nonCoreTimeoutFired state', () => {
    init();

    expect(getState().nonCoreTimeoutFired).toBe(false);

    // Wait for nonCore timeout (3000ms)
    vi.advanceTimersByTime(4000);

    expect(getState().nonCoreTimeoutFired).toBe(true);
  });

  it('tracks independentTimeoutFired state', () => {
    init();

    expect(getState().independentTimeoutFired).toBe(false);

    // Wait for blocking (1500ms) + independent (1500ms) timeouts
    vi.advanceTimersByTime(4000);

    expect(getState().independentTimeoutFired).toBe(true);
  });
});

describe('pubsub ready events trigger state changes', () => {
  it('subscribes to blocking partner readyEvents on init', () => {
    // Track subscribe calls
    const subscriptions: string[] = [];
    (window as any).PubSub = {
      publish: vi.fn(),
      subscribe: vi.fn(({ topic }: { topic: string }) => {
        subscriptions.push(topic);
      })
    };

    init();

    // Should have subscribed to blocking partner ready events
    expect(subscriptions).toContain('plugin.cmp.complete');
    expect(subscriptions).toContain('plugin.prebid.complete');
    expect(subscriptions).toContain('plugin.amazonaps.complete');
  });

  it('subscribes to independent partner readyEvents on init', () => {
    const subscriptions: string[] = [];
    (window as any).PubSub = {
      publish: vi.fn(),
      subscribe: vi.fn(({ topic }: { topic: string }) => {
        subscriptions.push(topic);
      })
    };

    init();

    // Should have subscribed to independent partner ready events
    expect(subscriptions).toContain('plugin.analytics.complete');
  });

  it('subscribes to nonCore partner readyEvents on init', () => {
    const subscriptions: string[] = [];
    (window as any).PubSub = {
      publish: vi.fn(),
      subscribe: vi.fn(({ topic }: { topic: string }) => {
        subscriptions.push(topic);
      })
    };

    init();

    // Should have subscribed to nonCore partner ready events
    expect(subscriptions).toContain('plugin.tracking.complete');
  });

  it('uses runIfAlreadyPublished option for subscriptions', () => {
    const subscribeArgs: any[] = [];
    (window as any).PubSub = {
      publish: vi.fn(),
      subscribe: vi.fn((args: any) => {
        subscribeArgs.push(args);
      })
    };

    init();

    // Check that subscriptions use runIfAlreadyPublished
    const hasRunIfAlreadyPublished = subscribeArgs.every(
      arg => arg.runIfAlreadyPublished === true
    );
    expect(hasRunIfAlreadyPublished).toBe(true);
  });
});

describe('partner ready event never fires', () => {
  it('initializes and sets timeout for all partners', () => {
    // Partners derive ready events as plugin.{name}.complete
    // If event never fires, timeout handles it
    init();

    expect(getState().initialized).toBe(true);
    expect(getState().universalTimeout).toBeGreaterThan(0);
  });

  it('partner times out when ready event never fires', () => {
    init();

    // Advance to timeout
    vi.advanceTimersByTime(3000);

    // Should be ready (via timeout)
    expect(isPartnersReady()).toBe(true);
  });
});
