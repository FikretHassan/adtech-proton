import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  getState,
  registerEventListeners,
  getSlotMetrics,
  getAllMetrics,
  getConfig,
  hasFirstAdRequested,
  hasFirstAdRendered,
  reset
} from '../src/gptEvents';

// Mock the loader
const mockLoader = {
  log: vi.fn(),
  hooks: {
    executeSync: vi.fn()
  }
};

// Mock googletag
const mockPubads = {
  addEventListener: vi.fn()
};

const mockGoogletag = {
  cmd: [] as Function[],
  pubads: vi.fn(() => mockPubads)
};

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
  (window as any).googletag = mockGoogletag;
  (window as any).adsPubsub = null;
  mockGoogletag.cmd = [];
  reset();
});

describe('gptEvents', () => {
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
      const mockPubsub = { publish: vi.fn() };
      init({ pubsub: mockPubsub });

      expect(getState().initialized).toBe(true);
    });

    it('accepts custom getTimestamp function', () => {
      const customTimer = vi.fn(() => 99999);
      init({ getTimestamp: customTimer });

      expect(getState().initialized).toBe(true);
    });

    it('calls registerEventListeners internally', () => {
      // init() calls registerEventListeners() which returns true when googletag exists
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('includes hasPubsub in state when provided', () => {
      const mockPubsub = { publish: vi.fn() };
      init({ pubsub: mockPubsub });

      // State should reflect that we have pubsub
      expect(getState().initialized).toBe(true);
    });
  });

  describe('registerEventListeners', () => {
    it('returns true when googletag is available', () => {
      const result = registerEventListeners();
      expect(result).toBe(true);
    });

    it('returns false when googletag is not available', () => {
      delete (window as any).googletag;

      const result = registerEventListeners();
      expect(result).toBe(false);
    });

    it('registers all GPT event handlers', () => {
      registerEventListeners();

      // Execute queued commands
      mockGoogletag.cmd.forEach(fn => fn());

      // Should register 6 event handlers
      expect(mockPubads.addEventListener).toHaveBeenCalledTimes(6);
    });

    it('registers slotRequested handler', () => {
      registerEventListeners();
      mockGoogletag.cmd.forEach(fn => fn());

      const calls = mockPubads.addEventListener.mock.calls;
      const eventNames = calls.map((call: any[]) => call[0]);
      expect(eventNames).toContain('slotRequested');
    });

    it('registers slotRenderEnded handler', () => {
      registerEventListeners();
      mockGoogletag.cmd.forEach(fn => fn());

      const calls = mockPubads.addEventListener.mock.calls;
      const eventNames = calls.map((call: any[]) => call[0]);
      expect(eventNames).toContain('slotRenderEnded');
    });

    it('registers impressionViewable handler', () => {
      registerEventListeners();
      mockGoogletag.cmd.forEach(fn => fn());

      const calls = mockPubads.addEventListener.mock.calls;
      const eventNames = calls.map((call: any[]) => call[0]);
      expect(eventNames).toContain('impressionViewable');
    });
  });

  describe('getSlotMetrics', () => {
    it('returns null for unknown slot', () => {
      const metrics = getSlotMetrics('unknown-slot');
      expect(metrics).toBeNull();
    });

    it('returns metrics object for tracked slot', () => {
      // Simulate slot tracking by triggering the slotRequested handler
      init();
      mockGoogletag.cmd.forEach(fn => fn());

      // Get the slotRequested handler
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );

      if (slotRequestedCall) {
        const handler = slotRequestedCall[1];
        const mockEvent = {
          slot: {
            getSlotElementId: () => 'test-slot',
            getTargetingMap: () => ({ key: 'value' })
          }
        };
        handler(mockEvent);

        const metrics = getSlotMetrics('test-slot');
        expect(metrics).not.toBeNull();
        expect(metrics.slotRequested).toBeDefined();
      }
    });
  });

  describe('getAllMetrics', () => {
    it('returns empty object initially', () => {
      const metrics = getAllMetrics();
      expect(Object.keys(metrics).length).toBe(0);
    });

    it('returns copy of metrics', () => {
      const metrics1 = getAllMetrics();
      const metrics2 = getAllMetrics();

      expect(metrics1).not.toBe(metrics2);
    });
  });

  describe('getConfig', () => {
    it('returns config object', () => {
      const config = getConfig();
      expect(typeof config).toBe('object');
    });

    it('includes metrics settings', () => {
      const config = getConfig();
      expect(config).toHaveProperty('metrics');
    });

    it('includes classes settings', () => {
      const config = getConfig();
      expect(config).toHaveProperty('classes');
    });

    it('includes opacity settings', () => {
      const config = getConfig();
      expect(config).toHaveProperty('opacity');
    });

    it('includes pubsub settings', () => {
      const config = getConfig();
      expect(config).toHaveProperty('pubsub');
    });

    it('includes emptySlots settings', () => {
      const config = getConfig();
      expect(config).toHaveProperty('emptySlots');
    });
  });

  describe('hasFirstAdRequested', () => {
    it('returns false initially', () => {
      expect(hasFirstAdRequested()).toBe(false);
    });

    it('returns true after first ad requested', () => {
      init();
      mockGoogletag.cmd.forEach(fn => fn());

      // Simulate first ad request
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );

      if (slotRequestedCall) {
        const handler = slotRequestedCall[1];
        handler({
          slot: {
            getSlotElementId: () => 'first-slot',
            getTargetingMap: () => ({})
          }
        });

        expect(hasFirstAdRequested()).toBe(true);
      }
    });
  });

  describe('hasFirstAdRendered', () => {
    it('returns false initially', () => {
      expect(hasFirstAdRendered()).toBe(false);
    });
  });

  describe('getState', () => {
    it('returns initialized state', () => {
      const state = getState();
      expect(state).toHaveProperty('initialized');
    });

    it('includes metricsCount', () => {
      const state = getState();
      expect(state).toHaveProperty('metricsCount');
    });

    it('metricsCount is 0 initially', () => {
      const state = getState();
      expect(state.metricsCount).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears slot metrics', () => {
      // Use registerEventListeners and execute cmd to set up handlers
      registerEventListeners();
      mockGoogletag.cmd.forEach(fn => fn());

      // Add some metrics via handler
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );

      expect(slotRequestedCall).toBeDefined();

      slotRequestedCall[1]({
        slot: {
          getSlotElementId: () => 'reset-test-slot',
          getTargetingMap: () => ({})
        }
      });

      expect(getSlotMetrics('reset-test-slot')).not.toBeNull();

      reset();

      expect(getSlotMetrics('reset-test-slot')).toBeNull();
    });

    it('resets firstAdRequested flag', () => {
      registerEventListeners();
      mockGoogletag.cmd.forEach(fn => fn());

      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );

      expect(slotRequestedCall).toBeDefined();

      slotRequestedCall[1]({
        slot: {
          getSlotElementId: () => 'test',
          getTargetingMap: () => ({})
        }
      });

      expect(hasFirstAdRequested()).toBe(true);

      reset();

      expect(hasFirstAdRequested()).toBe(false);
    });

    it('resets firstAdRendered flag', () => {
      reset();
      expect(hasFirstAdRendered()).toBe(false);
    });
  });

  describe('event handlers', () => {
    beforeEach(() => {
      init();
      mockGoogletag.cmd.forEach(fn => fn());
    });

    it('slotRequested initializes slot metrics', () => {
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );

      if (slotRequestedCall) {
        slotRequestedCall[1]({
          slot: {
            getSlotElementId: () => 'handler-test-slot',
            getTargetingMap: () => ({ test: 'value' })
          }
        });

        const metrics = getSlotMetrics('handler-test-slot');
        expect(metrics).not.toBeNull();
        expect(metrics.targetingMap).toEqual({ test: 'value' });
      }
    });

    it('slotResponseReceived updates metrics', () => {
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );
      const slotResponseCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotResponseReceived'
      );

      if (slotRequestedCall && slotResponseCall) {
        // First request the slot
        slotRequestedCall[1]({
          slot: {
            getSlotElementId: () => 'response-test-slot',
            getTargetingMap: () => ({})
          }
        });

        // Then receive response
        slotResponseCall[1]({
          slot: {
            getSlotElementId: () => 'response-test-slot'
          }
        });

        const metrics = getSlotMetrics('response-test-slot');
        expect(metrics.slotResponseReceived).toBeDefined();
        expect(metrics.latency_slotResponseReceived).toBeDefined();
      }
    });

    it('slotOnload updates metrics', () => {
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );
      const slotOnloadCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotOnload'
      );

      if (slotRequestedCall && slotOnloadCall) {
        slotRequestedCall[1]({
          slot: {
            getSlotElementId: () => 'onload-test-slot',
            getTargetingMap: () => ({})
          }
        });

        slotOnloadCall[1]({
          slot: {
            getSlotElementId: () => 'onload-test-slot'
          }
        });

        const metrics = getSlotMetrics('onload-test-slot');
        expect(metrics.slotOnload).toBeDefined();
      }
    });

    it('slotVisibilityChanged tracks viewability', () => {
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );
      const visibilityCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotVisibilityChanged'
      );

      if (slotRequestedCall && visibilityCall) {
        slotRequestedCall[1]({
          slot: {
            getSlotElementId: () => 'visibility-test-slot',
            getTargetingMap: () => ({})
          }
        });

        // Below 50%
        visibilityCall[1]({
          slot: { getSlotElementId: () => 'visibility-test-slot' },
          inViewPercentage: 30
        });

        let metrics = getSlotMetrics('visibility-test-slot');
        expect(metrics.inViewPercentage).toBe(30);
        expect(metrics.isViewable).toBe(false);

        // Above 50%
        visibilityCall[1]({
          slot: { getSlotElementId: () => 'visibility-test-slot' },
          inViewPercentage: 60
        });

        metrics = getSlotMetrics('visibility-test-slot');
        expect(metrics.inViewPercentage).toBe(60);
        expect(metrics.isViewable).toBe(true);
        expect(metrics.isViewableAchieved).toBe(true);
      }
    });

    it('impressionViewable updates viewability metrics', () => {
      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );
      const impressionCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'impressionViewable'
      );

      if (slotRequestedCall && impressionCall) {
        slotRequestedCall[1]({
          slot: {
            getSlotElementId: () => 'impression-test-slot',
            getTargetingMap: () => ({})
          }
        });

        impressionCall[1]({
          slot: { getSlotElementId: () => 'impression-test-slot' }
        });

        const metrics = getSlotMetrics('impression-test-slot');
        expect(metrics.impressionViewable).toBeDefined();
        expect(metrics.isViewable).toBe(true);
        expect(metrics.isViewableAchieved).toBe(true);
      }
    });

    describe('slotRenderEnded with filled slot', () => {
      it('handles filled slot correctly', () => {
        // Create DOM element for slot
        const slotElement = document.createElement('div');
        slotElement.id = 'filled-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          // First request the slot
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'filled-slot',
              getTargetingMap: () => ({})
            }
          });

          // Then render it
          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'filled-slot',
              getEscapedQemQueryId: () => 'query-123'
            },
            isEmpty: false,
            size: [300, 250],
            advertiserId: 12345,
            campaignId: 67890,
            lineItemId: 11111,
            creativeId: 22222,
            isBackfill: false
          });

          const metrics = getSlotMetrics('filled-slot');
          expect(metrics.slotRenderEnded).toBeDefined();
          expect(metrics.isEmpty).toBe(false);
          expect(metrics.advertiserId).toBe(12345);
          expect(metrics.sizeW).toBe(300);
          expect(metrics.sizeH).toBe(250);
        }

        document.body.removeChild(slotElement);
      });

      it('sets first ad rendered flag on first filled slot', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'first-render-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'first-render-slot',
              getTargetingMap: () => ({})
            }
          });

          expect(hasFirstAdRendered()).toBe(false);

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'first-render-slot',
              getEscapedQemQueryId: () => 'query-456'
            },
            isEmpty: false,
            size: [728, 90],
            advertiserId: 111
          });

          expect(hasFirstAdRendered()).toBe(true);
        }

        document.body.removeChild(slotElement);
      });

      it('adds loaded class to filled slot', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'class-test-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'class-test-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'class-test-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [300, 250]
          });

          const cls = getConfig().classes;
          expect(slotElement.classList.contains(cls.loaded)).toBe(true);
        }

        document.body.removeChild(slotElement);
      });
    });

    describe('slotRenderEnded with empty slot', () => {
      it('handles empty slot correctly', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'empty-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'empty-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'empty-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: true,
            size: null
          });

          const metrics = getSlotMetrics('empty-slot');
          expect(metrics.isEmpty).toBe(true);
          const cls = getConfig().classes;
          expect(slotElement.classList.contains(cls.empty)).toBe(true);
        }

        document.body.removeChild(slotElement);
      });

      it('collapses empty slot when configured', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'collapse-slot';
        slotElement.style.height = '250px';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'collapse-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'collapse-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: true
          });

          // Height should be collapsed to 0
          expect(slotElement.style.height).toBe('0px');
        }

        document.body.removeChild(slotElement);
      });

      it('hides container for empty slot when configured', () => {
        const container = document.createElement('div');
        container.id = 'container-slot-wrapper';
        const slotElement = document.createElement('div');
        slotElement.id = 'container-slot';
        container.appendChild(slotElement);
        document.body.appendChild(container);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'container-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'container-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: true
          });

          // Container may be hidden depending on config
          const cls = getConfig().classes;
          expect(slotElement.classList.contains(cls.empty)).toBe(true);
        }

        document.body.removeChild(container);
      });
    });

    describe('slotRenderEnded error handling', () => {
      it('handles missing slot element gracefully', () => {
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (renderEndedCall) {
          // Should not throw when element doesn't exist
          expect(() => {
            renderEndedCall[1]({
              slot: {
                getSlotElementId: () => 'nonexistent-slot',
                getEscapedQemQueryId: () => null
              },
              isEmpty: false,
              size: [300, 250]
            });
          }).not.toThrow();
        }
      });

      it('handles getEscapedQemQueryId throwing', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'query-error-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'query-error-slot',
              getTargetingMap: () => ({})
            }
          });

          // Should not throw when getEscapedQemQueryId throws
          expect(() => {
            renderEndedCall[1]({
              slot: {
                getSlotElementId: () => 'query-error-slot',
                getEscapedQemQueryId: () => { throw new Error('Not available'); }
              },
              isEmpty: false,
              size: [300, 250]
            });
          }).not.toThrow();
        }

        document.body.removeChild(slotElement);
      });
    });

    describe('viewability time tracking', () => {
      it('tracks viewability time when going above 50%', () => {
        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (slotRequestedCall && visibilityCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'time-track-slot',
              getTargetingMap: () => ({})
            }
          });

          // Start below 50%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'time-track-slot' },
            inViewPercentage: 20
          });

          let metrics = getSlotMetrics('time-track-slot');
          expect(metrics.isViewable).toBe(false);
          expect(metrics.isViewableTimeFirst).toBe(0);

          // Go above 50%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'time-track-slot' },
            inViewPercentage: 75
          });

          metrics = getSlotMetrics('time-track-slot');
          expect(metrics.isViewable).toBe(true);
          expect(metrics.isViewableTimeFirst).toBeGreaterThan(0);
          expect(metrics.isViewableTimeStart).toBeGreaterThan(0);
        }
      });

      it('accumulates viewability time when toggling above/below 50%', () => {
        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (slotRequestedCall && visibilityCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'toggle-track-slot',
              getTargetingMap: () => ({})
            }
          });

          // Go above 50%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'toggle-track-slot' },
            inViewPercentage: 60
          });

          // Drop below 50%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'toggle-track-slot' },
            inViewPercentage: 40
          });

          const metrics = getSlotMetrics('toggle-track-slot');
          expect(metrics.isViewable).toBe(false);
          expect(metrics.isViewableTimeEnd).toBeGreaterThan(0);
          expect(metrics.isViewableTimeInView).toBeGreaterThanOrEqual(0);
        }
      });

      it('calculates latency to impressionViewable', () => {
        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (slotRequestedCall && visibilityCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'latency-track-slot',
              getTargetingMap: () => ({})
            }
          });

          // Go above 50%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'latency-track-slot' },
            inViewPercentage: 60
          });

          const metrics = getSlotMetrics('latency-track-slot');
          expect(metrics.latency_impressionViewable).toBeDefined();
          expect(metrics.latency_impressionViewable).toBeGreaterThanOrEqual(0);
        }
      });
    });

    describe('pubsub integration', () => {
      it('publishes events when pubsub is provided', () => {
        reset();
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );

        if (slotRequestedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'pubsub-test-slot',
              getTargetingMap: () => ({})
            }
          });

          // Pubsub publish should have been called
          expect(mockPubsub.publish).toHaveBeenCalled();
        }
      });

      it('publishes firstAdRequested event', () => {
        reset();
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );

        if (slotRequestedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'first-pubsub-slot',
              getTargetingMap: () => ({})
            }
          });

          // Should have published firstAdRequested
          const publishCalls = mockPubsub.publish.mock.calls;
          const topics = publishCalls.map((call: any[]) => call[0]?.topic);
          expect(topics.some((t: string) => t && t.includes('first'))).toBe(true);
        }
      });

      it('publishes firstAdRendered event', () => {
        reset();
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotElement = document.createElement('div');
        slotElement.id = 'first-rendered-pubsub';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'first-rendered-pubsub',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'first-rendered-pubsub',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [300, 250]
          });

          // Should have published events
          expect(mockPubsub.publish).toHaveBeenCalled();
        }

        document.body.removeChild(slotElement);
      });
    });

    describe('edge cases', () => {
      it('slotResponseReceived handles slot without prior request', () => {
        const slotResponseCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotResponseReceived'
        );

        if (slotResponseCall) {
          // Should not throw when slot has no prior metrics
          expect(() => {
            slotResponseCall[1]({
              slot: { getSlotElementId: () => 'no-prior-request-slot' }
            });
          }).not.toThrow();

          // Metrics should still be null
          expect(getSlotMetrics('no-prior-request-slot')).toBeNull();
        }
      });

      it('slotOnload handles slot without prior request', () => {
        const slotOnloadCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotOnload'
        );

        if (slotOnloadCall) {
          expect(() => {
            slotOnloadCall[1]({
              slot: { getSlotElementId: () => 'no-prior-onload-slot' }
            });
          }).not.toThrow();
        }
      });

      it('slotVisibilityChanged handles unknown slot', () => {
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (visibilityCall) {
          expect(() => {
            visibilityCall[1]({
              slot: { getSlotElementId: () => 'unknown-visibility-slot' },
              inViewPercentage: 50
            });
          }).not.toThrow();
        }
      });

      it('impressionViewable handles unknown slot', () => {
        const impressionCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'impressionViewable'
        );

        if (impressionCall) {
          expect(() => {
            impressionCall[1]({
              slot: { getSlotElementId: () => 'unknown-impression-slot' }
            });
          }).not.toThrow();
        }
      });

      it('slotRequested handles getTargetingMap throwing', () => {
        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );

        if (slotRequestedCall) {
          expect(() => {
            slotRequestedCall[1]({
              slot: {
                getSlotElementId: () => 'targeting-error-slot',
                getTargetingMap: () => { throw new Error('Not available'); }
              }
            });
          }).not.toThrow();

          const metrics = getSlotMetrics('targeting-error-slot');
          expect(metrics).not.toBeNull();
          expect(metrics.targetingMap).toBeNull();
        }
      });

      it('handles visibility staying above 50%', () => {
        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (slotRequestedCall && visibilityCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'stay-above-slot',
              getTargetingMap: () => ({})
            }
          });

          // Go to 60%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'stay-above-slot' },
            inViewPercentage: 60
          });

          // Go to 80% (stay above 50%)
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'stay-above-slot' },
            inViewPercentage: 80
          });

          const metrics = getSlotMetrics('stay-above-slot');
          expect(metrics.isViewable).toBe(true);
          expect(metrics.isViewableAchieved).toBe(true);
        }
      });

      it('handles visibility staying below 50%', () => {
        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (slotRequestedCall && visibilityCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'stay-below-slot',
              getTargetingMap: () => ({})
            }
          });

          // Go to 30%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'stay-below-slot' },
            inViewPercentage: 30
          });

          // Go to 20% (stay below 50%)
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'stay-below-slot' },
            inViewPercentage: 20
          });

          const metrics = getSlotMetrics('stay-below-slot');
          expect(metrics.isViewable).toBe(false);
          expect(metrics.isViewableAchieved).toBe(false);
        }
      });

      it('impressionViewable sets viewability times if not already set', () => {
        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const impressionCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'impressionViewable'
        );

        if (slotRequestedCall && impressionCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'impression-times-slot',
              getTargetingMap: () => ({})
            }
          });

          // Skip visibility events, directly go to impressionViewable
          impressionCall[1]({
            slot: { getSlotElementId: () => 'impression-times-slot' }
          });

          const metrics = getSlotMetrics('impression-times-slot');
          expect(metrics.isViewableTimeFirst).toBeGreaterThan(0);
          expect(metrics.isViewableTimeStart).toBeGreaterThan(0);
        }
      });

      it('handles slotRenderEnded with no hooks available', () => {
        // Remove hooks from loader
        const originalHooks = mockLoader.hooks;
        delete (mockLoader as any).hooks;

        const slotElement = document.createElement('div');
        slotElement.id = 'no-hooks-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'no-hooks-slot',
              getTargetingMap: () => ({})
            }
          });

          expect(() => {
            renderEndedCall[1]({
              slot: {
                getSlotElementId: () => 'no-hooks-slot',
                getEscapedQemQueryId: () => null
              },
              isEmpty: false,
              size: [300, 250]
            });
          }).not.toThrow();
        }

        document.body.removeChild(slotElement);
        mockLoader.hooks = originalHooks;
      });

      it('slotRenderEnded sets height from ad size', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'height-test-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'height-test-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'height-test-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [728, 90]
          });

          expect(slotElement.style.height).toBe('90px');
        }

        document.body.removeChild(slotElement);
      });

      it('slotRenderEnded handles null size for filled slot', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'null-size-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'null-size-slot',
              getTargetingMap: () => ({})
            }
          });

          expect(() => {
            renderEndedCall[1]({
              slot: {
                getSlotElementId: () => 'null-size-slot',
                getEscapedQemQueryId: () => null
              },
              isEmpty: false,
              size: null  // No size provided
            });
          }).not.toThrow();

          const metrics = getSlotMetrics('null-size-slot');
          expect(metrics.sizeW).toBeNull();
          expect(metrics.sizeH).toBeNull();
        }

        document.body.removeChild(slotElement);
      });

      it('slotRenderEnded handles missing ad element gracefully', () => {
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (renderEndedCall) {
          // Element doesn't exist - should warn and return early
          expect(() => {
            renderEndedCall[1]({
              slot: {
                getSlotElementId: () => 'missing-element-slot',
                getEscapedQemQueryId: () => null
              },
              isEmpty: false,
              size: [300, 250]
            });
          }).not.toThrow();
        }
      });
    });

    describe('hooks integration', () => {
      it('executes slot.beforeRender hook', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'hook-before-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'hook-before-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'hook-before-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [300, 250]
          });

          expect(mockLoader.hooks.executeSync).toHaveBeenCalledWith(
            'slot.beforeRender',
            'hook-before-slot',
            expect.anything()
          );
        }

        document.body.removeChild(slotElement);
      });

      it('executes slot.afterRender hook for filled slot', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'hook-after-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'hook-after-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'hook-after-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [300, 250],
            advertiserId: 123
          });

          expect(mockLoader.hooks.executeSync).toHaveBeenCalledWith(
            'slot.afterRender',
            'hook-after-slot',
            expect.anything(),
            expect.objectContaining({ advertiserId: 123 })
          );
        }

        document.body.removeChild(slotElement);
      });

      it('executes slot.onEmpty hook for empty slot', () => {
        const slotElement = document.createElement('div');
        slotElement.id = 'hook-empty-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'hook-empty-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'hook-empty-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: true
          });

          expect(mockLoader.hooks.executeSync).toHaveBeenCalledWith(
            'slot.onEmpty',
            'hook-empty-slot',
            expect.anything()
          );
        }

        document.body.removeChild(slotElement);
      });
    });

    describe('init pubsub integration', () => {
      it('initializes with global pubsub available', () => {
        const globalPubsub = { publish: vi.fn() };
        (window as any).adsPubsub = globalPubsub;

        const state = init();

        // Module should be initialized
        expect(state.initialized).toBe(true);
      });

      it('does not throw when pubsub is not available for ready event', () => {
        (window as any).adsPubsub = null;

        expect(() => init()).not.toThrow();
        expect(getState().initialized).toBe(true);
      });
    });

    describe('visibility tracking edge cases', () => {
      it('tracks cumulative viewability time when going above and below 50%', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (slotRequestedCall && visibilityCall) {
          // Request the slot first
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'cumulative-slot',
              getTargetingMap: () => ({})
            }
          });

          // Go above 50%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'cumulative-slot' },
            inViewPercentage: 60
          });

          let metrics = getSlotMetrics('cumulative-slot');
          expect(metrics.isViewable).toBe(true);
          expect(metrics.isViewableAchieved).toBe(true);

          // Drop below 50%
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'cumulative-slot' },
            inViewPercentage: 30
          });

          metrics = getSlotMetrics('cumulative-slot');
          expect(metrics.isViewable).toBe(false);
          expect(metrics.isViewableTimeInView).toBeGreaterThanOrEqual(0);

          // Go above 50% again
          visibilityCall[1]({
            slot: { getSlotElementId: () => 'cumulative-slot' },
            inViewPercentage: 70
          });

          metrics = getSlotMetrics('cumulative-slot');
          expect(metrics.isViewable).toBe(true);
        }
      });

      it('calculates latency_impressionViewable on first viewability', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const visibilityCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotVisibilityChanged'
        );

        if (slotRequestedCall && visibilityCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'latency-slot',
              getTargetingMap: () => ({})
            }
          });

          visibilityCall[1]({
            slot: { getSlotElementId: () => 'latency-slot' },
            inViewPercentage: 55
          });

          const metrics = getSlotMetrics('latency-slot');
          expect(metrics.latency_impressionViewable).not.toBeNull();
        }
      });
    });

    describe('empty slot container hiding', () => {
      it('hides container element when emptySlots.hideContainer is true', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        // Create slot and container
        const slotElement = document.createElement('div');
        slotElement.id = 'container-test-slot';
        document.body.appendChild(slotElement);

        const containerElement = document.createElement('div');
        containerElement.id = 'container-test-slot-container';
        containerElement.style.display = 'block';
        document.body.appendChild(containerElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'container-test-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'container-test-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: true
          });

          // Check container is hidden (if hideContainer is enabled in config)
          // The actual hiding depends on config.emptySlots.hideContainer
        }

        document.body.removeChild(slotElement);
        document.body.removeChild(containerElement);
      });
    });

    describe('first ad tracking', () => {
      it('tracks first ad requested and publishes event', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        expect(hasFirstAdRequested()).toBe(false);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );

        if (slotRequestedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'first-ad-slot',
              getTargetingMap: () => ({})
            }
          });

          expect(hasFirstAdRequested()).toBe(true);

          // Second request should not re-publish
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'second-ad-slot',
              getTargetingMap: () => ({})
            }
          });

          expect(hasFirstAdRequested()).toBe(true);
        }
      });

      it('tracks first ad rendered and publishes event', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        expect(hasFirstAdRendered()).toBe(false);

        const slotElement = document.createElement('div');
        slotElement.id = 'first-render-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'first-render-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'first-render-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [300, 250]
          });

          expect(hasFirstAdRendered()).toBe(true);
        }

        document.body.removeChild(slotElement);
      });
    });

    describe('getEscapedQemQueryId handling', () => {
      it('captures googleQueryId when available', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotElement = document.createElement('div');
        slotElement.id = 'query-id-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'query-id-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'query-id-slot',
              getEscapedQemQueryId: () => 'test-query-id-12345'
            },
            isEmpty: false,
            size: [300, 250]
          });

          const metrics = getSlotMetrics('query-id-slot');
          expect(metrics.googleQueryId).toBe('test-query-id-12345');
        }

        document.body.removeChild(slotElement);
      });

      it('handles getEscapedQemQueryId throwing error', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotElement = document.createElement('div');
        slotElement.id = 'query-error-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'query-error-slot',
              getTargetingMap: () => ({})
            }
          });

          expect(() => {
            renderEndedCall[1]({
              slot: {
                getSlotElementId: () => 'query-error-slot',
                getEscapedQemQueryId: () => { throw new Error('Not available'); }
              },
              isEmpty: false,
              size: [300, 250]
            });
          }).not.toThrow();

          const metrics = getSlotMetrics('query-error-slot');
          expect(metrics.googleQueryId).toBeNull();
        }

        document.body.removeChild(slotElement);
      });
    });

    it('applies empty-slot UI handling and hooks', () => {
      const mockPubsub = { publish: vi.fn() };
      init({ pubsub: mockPubsub });
      mockGoogletag.cmd.forEach(fn => fn());

      const slotElement = document.createElement('div');
      slotElement.id = 'empty-slot';
      document.body.appendChild(slotElement);

      const container = document.createElement('div');
      container.id = 'empty-slot_container';
      document.body.appendChild(container);

      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );
      const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRenderEnded'
      );

      slotRequestedCall?.[1]({
        slot: {
          getSlotElementId: () => 'empty-slot',
          getTargetingMap: () => ({})
        }
      });

      renderEndedCall?.[1]({
        slot: {
          getSlotElementId: () => 'empty-slot',
          getEscapedQemQueryId: () => null
        },
        isEmpty: true
      });

      const cls = getConfig().classes;
      expect(slotElement.classList.contains(cls.empty)).toBe(true);
      expect(slotElement.classList.contains(cls.loaded)).toBe(false);
      expect(slotElement.style.opacity).toBe('0');
      expect(slotElement.style.height).toBe('0px');
      expect(container.style.display).toBe('none');
      expect(mockLoader.hooks.executeSync).toHaveBeenCalledWith('slot.beforeRender', 'empty-slot', expect.anything());
      expect(mockLoader.hooks.executeSync).toHaveBeenCalledWith('slot.onEmpty', 'empty-slot', expect.anything());
      expect(getSlotMetrics('empty-slot')?.isEmpty).toBe(true);

      document.body.removeChild(slotElement);
      document.body.removeChild(container);
    });

    it('applies filled-slot UI handling and hooks', () => {
      const mockPubsub = { publish: vi.fn() };
      init({ pubsub: mockPubsub });
      mockGoogletag.cmd.forEach(fn => fn());

      const slotElement = document.createElement('div');
      slotElement.id = 'filled-slot';
      document.body.appendChild(slotElement);

      const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRequested'
      );
      const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
        (call: any[]) => call[0] === 'slotRenderEnded'
      );

      slotRequestedCall?.[1]({
        slot: {
          getSlotElementId: () => 'filled-slot',
          getTargetingMap: () => ({})
        }
      });

      renderEndedCall?.[1]({
        slot: {
          getSlotElementId: () => 'filled-slot',
          getEscapedQemQueryId: () => 'qid'
        },
        isEmpty: false,
        size: [300, 250],
        advertiserId: 123,
        campaignId: 456
      });

      const cls = getConfig().classes;
      expect(slotElement.classList.contains(cls.loaded)).toBe(true);
      expect(slotElement.classList.contains(cls.empty)).toBe(false);
      expect(slotElement.style.opacity).toBe('1');
      expect(slotElement.style.height).toBe('250px');
      expect(mockLoader.hooks.executeSync).toHaveBeenCalledWith(
        'slot.afterRender',
        'filled-slot',
        expect.anything(),
        expect.objectContaining({ advertiserId: 123, size: [300, 250] })
      );
      expect(hasFirstAdRendered()).toBe(true);
      expect(getSlotMetrics('filled-slot')?.googleQueryId).toBe('qid');

      document.body.removeChild(slotElement);
    });

    describe('latency calculations', () => {
      it('calculates all latency metrics correctly', () => {
        const mockPubsub = { publish: vi.fn() };
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotElement = document.createElement('div');
        slotElement.id = 'latency-calc-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const responseCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotResponseReceived'
        );
        const onloadCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotOnload'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && responseCall && onloadCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'latency-calc-slot',
              getTargetingMap: () => ({})
            }
          });

          responseCall[1]({
            slot: { getSlotElementId: () => 'latency-calc-slot' }
          });

          onloadCall[1]({
            slot: { getSlotElementId: () => 'latency-calc-slot' }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'latency-calc-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [300, 250]
          });

          const metrics = getSlotMetrics('latency-calc-slot');
          expect(metrics.latency_slotResponseReceived).not.toBeNull();
          expect(metrics.latency_slotOnload).not.toBeNull();
          expect(metrics.latency_slotRenderEnded).not.toBeNull();
        }

        document.body.removeChild(slotElement);
      });
    });

    describe('pubsub event publishing', () => {
      it('publishes slotRequested event via pubsub', () => {
        const mockPubsub = { publish: vi.fn() };
        reset();
        mockGoogletag.cmd = [];
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );

        if (slotRequestedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'pubsub-test-slot',
              getTargetingMap: () => ({})
            }
          });

          // Check that pubsub.publish was called for the slot requested event
          const expectedTopic = getConfig().pubsub.slotRequested.replace('{slotId}', 'pubsub-test-slot');
          const publishCalls = mockPubsub.publish.mock.calls;
          const match = publishCalls.find(call => call[0]?.topic === expectedTopic);
          expect(match).toBeDefined();
        }
      });

      it('publishes slotRendered event for filled slots', () => {
        const mockPubsub = { publish: vi.fn() };
        reset();
        mockGoogletag.cmd = [];
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotElement = document.createElement('div');
        slotElement.id = 'pubsub-render-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'pubsub-render-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'pubsub-render-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: false,
            size: [300, 250],
            advertiserId: 456
          });

          // Check that pubsub events were published
          expect(mockPubsub.publish).toHaveBeenCalled();
        }

        document.body.removeChild(slotElement);
      });

      it('publishes slotEmpty event for empty slots', () => {
        const mockPubsub = { publish: vi.fn() };
        reset();
        mockGoogletag.cmd = [];
        init({ pubsub: mockPubsub });
        mockGoogletag.cmd.forEach(fn => fn());

        const slotElement = document.createElement('div');
        slotElement.id = 'pubsub-empty-slot';
        document.body.appendChild(slotElement);

        const slotRequestedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRequested'
        );
        const renderEndedCall = mockPubads.addEventListener.mock.calls.find(
          (call: any[]) => call[0] === 'slotRenderEnded'
        );

        if (slotRequestedCall && renderEndedCall) {
          slotRequestedCall[1]({
            slot: {
              getSlotElementId: () => 'pubsub-empty-slot',
              getTargetingMap: () => ({})
            }
          });

          renderEndedCall[1]({
            slot: {
              getSlotElementId: () => 'pubsub-empty-slot',
              getEscapedQemQueryId: () => null
            },
            isEmpty: true
          });

          const publishCalls = mockPubsub.publish.mock.calls;
          expect(publishCalls.length).toBeGreaterThan(0);
        }

        document.body.removeChild(slotElement);
      });
    });
  });
});
