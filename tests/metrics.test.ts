import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  getState,
  trackAdStack,
  trackEvent,
  getAdStack,
  getEvents,
  getAll,
  reset
} from '../src/metrics';

// Mock the timer
vi.mock('../src/timer', () => ({
  timer: vi.fn(() => 12345)
}));

// Mock the loader
const mockLoader = {
  log: vi.fn(),
  gptEvents: {
    getAllMetrics: vi.fn(() => ({ slot1: { filled: true } }))
  },
  metrics: {
    vendors: { amazon: { bid: 1.5 } }
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
  reset();
});

describe('metrics', () => {
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

    it('accepts pubsub option', () => {
      const mockPubsub = {
        subscribe: vi.fn()
      };

      init({ pubsub: mockPubsub });

      // Module initializes successfully with pubsub
      expect(getState().initialized).toBe(true);
    });

    it('returns state with counts', () => {
      init();
      const state = getState();

      // State should have count properties
      expect(state).toHaveProperty('adStackCount');
      expect(state).toHaveProperty('eventsCount');
    });
  });

  describe('trackAdStack', () => {
    it('tracks a milestone with auto timestamp', () => {
      trackAdStack('test_milestone');

      const adStack = getAdStack();
      expect(adStack.test_milestone).toBe(12345);
    });

    it('tracks a milestone with custom timestamp', () => {
      trackAdStack('custom_milestone', 99999);

      const adStack = getAdStack();
      expect(adStack.custom_milestone).toBe(99999);
    });

    it('overwrites existing milestone', () => {
      trackAdStack('overwrite_test', 100);
      trackAdStack('overwrite_test', 200);

      const adStack = getAdStack();
      expect(adStack.overwrite_test).toBe(200);
    });
  });

  describe('trackEvent', () => {
    it('tracks event with pubsub_ prefix', () => {
      trackEvent('loader.core.ready');

      const events = getEvents();
      expect(events.pubsub_loader_core_ready).toBe(12345);
    });

    it('also adds to adStack', () => {
      trackEvent('loader.ads.requested');

      const adStack = getAdStack();
      expect(adStack.pubsub_loader_ads_requested).toBe(12345);
    });

    it('accepts custom timestamp', () => {
      trackEvent('custom.event', 55555);

      const events = getEvents();
      expect(events.pubsub_custom_event).toBe(55555);
    });

    it('replaces dots with underscores in topic name', () => {
      trackEvent('a.b.c.d');

      const events = getEvents();
      expect(events.pubsub_a_b_c_d).toBeDefined();
    });
  });

  describe('getAdStack', () => {
    it('returns copy of adStack', () => {
      trackAdStack('test', 100);

      const stack1 = getAdStack();
      const stack2 = getAdStack();

      expect(stack1).not.toBe(stack2);
      expect(stack1).toEqual(stack2);
    });

    it('returns empty object initially', () => {
      const adStack = getAdStack();
      expect(Object.keys(adStack).length).toBe(0);
    });
  });

  describe('getEvents', () => {
    it('returns copy of events', () => {
      trackEvent('test.event');

      const events1 = getEvents();
      const events2 = getEvents();

      expect(events1).not.toBe(events2);
      expect(events1).toEqual(events2);
    });

    it('returns empty object initially', () => {
      const events = getEvents();
      expect(Object.keys(events).length).toBe(0);
    });
  });

  describe('getAll', () => {
    it('returns aggregated metrics', () => {
      trackAdStack('test_stack');
      trackEvent('test.event');

      const all = getAll();

      expect(all).toHaveProperty('ads');
      expect(all).toHaveProperty('adStack');
      expect(all).toHaveProperty('events');
      expect(all).toHaveProperty('vendors');
    });

    it('includes adStack metrics', () => {
      trackAdStack('my_milestone', 100);

      const all = getAll();
      expect(all.adStack.my_milestone).toBe(100);
    });

    it('includes events metrics', () => {
      trackEvent('my.topic', 200);

      const all = getAll();
      expect(all.events.pubsub_my_topic).toBe(200);
    });

    it('includes ads from gptEvents', () => {
      const all = getAll();
      expect(all.ads.slot1).toEqual({ filled: true });
    });

    it('includes vendor metrics from loader', () => {
      const all = getAll();
      expect(all.vendors.amazon).toEqual({ bid: 1.5 });
    });

    it('handles missing loader gracefully', () => {
      delete (window as any).proton;

      const all = getAll();
      expect(all.ads).toEqual({});
      expect(all.vendors).toEqual({});
    });
  });

  describe('getState', () => {
    it('returns initialized state', () => {
      const state = getState();
      expect(state).toHaveProperty('initialized');
    });

    it('includes adStackCount', () => {
      trackAdStack('test1');
      trackAdStack('test2');

      const state = getState();
      expect(state.adStackCount).toBe(2);
    });

    it('includes eventsCount', () => {
      trackEvent('event1');
      trackEvent('event2');
      trackEvent('event3');

      const state = getState();
      expect(state.eventsCount).toBe(3);
    });
  });

  describe('reset', () => {
    it('clears adStack', () => {
      trackAdStack('to_clear');
      reset();

      const adStack = getAdStack();
      expect(Object.keys(adStack).length).toBe(0);
    });

    it('clears events', () => {
      trackEvent('to.clear');
      reset();

      const events = getEvents();
      expect(Object.keys(events).length).toBe(0);
    });

    it('updates state counts', () => {
      trackAdStack('test');
      trackEvent('test');

      reset();

      const state = getState();
      expect(state.adStackCount).toBe(0);
      expect(state.eventsCount).toBe(0);
    });
  });

  describe('tracking functions', () => {
    it('trackAdStack and trackEvent work independently', () => {
      trackAdStack('milestone1', 100);
      trackEvent('topic1', 200);

      expect(getAdStack().milestone1).toBe(100);
      expect(getEvents().pubsub_topic1).toBe(200);
    });

    it('multiple tracks accumulate', () => {
      trackAdStack('a', 1);
      trackAdStack('b', 2);
      trackAdStack('c', 3);

      const adStack = getAdStack();
      expect(Object.keys(adStack).length).toBe(3);
    });
  });
});
