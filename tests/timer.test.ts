import { describe, it, expect, beforeEach, vi } from 'vitest';
import { timer, createPerformanceTracker, calculateLatency, PerformanceTracker } from '../src/timer';

describe('timer', () => {
  describe('timer()', () => {
    it('returns a number', () => {
      const result = timer();
      expect(typeof result).toBe('number');
    });

    it('returns a non-negative value', () => {
      const result = timer();
      expect(result).toBeGreaterThanOrEqual(0);
    });

    it('returns an integer (rounded)', () => {
      const result = timer();
      expect(Number.isInteger(result)).toBe(true);
    });

    it('returns increasing values over time', async () => {
      const first = timer();
      await new Promise(resolve => setTimeout(resolve, 10));
      const second = timer();
      expect(second).toBeGreaterThan(first);
    });

    it('uses performance.now when available', () => {
      const perfSpy = vi.spyOn(window.performance, 'now');
      timer();
      expect(perfSpy).toHaveBeenCalled();
      perfSpy.mockRestore();
    });
  });

  describe('createPerformanceTracker()', () => {
    it('returns PerformanceTracker object', () => {
      const tracker = createPerformanceTracker();
      expect(typeof tracker).toBe('object');
    });

    it('initializes status to init', () => {
      const tracker = createPerformanceTracker();
      expect(tracker.status).toBe('init');
    });

    it('sets init timestamp', () => {
      const before = timer();
      const tracker = createPerformanceTracker();
      const after = timer();

      expect(tracker.init).toBeGreaterThanOrEqual(before);
      expect(tracker.init).toBeLessThanOrEqual(after);
    });

    it('initializes requested to 0', () => {
      const tracker = createPerformanceTracker();
      expect(tracker.requested).toBe(0);
    });

    it('initializes received to 0', () => {
      const tracker = createPerformanceTracker();
      expect(tracker.received).toBe(0);
    });

    it('initializes preload to 0', () => {
      const tracker = createPerformanceTracker();
      expect(tracker.preload).toBe(0);
    });

    it('initializes error to -1', () => {
      const tracker = createPerformanceTracker();
      expect(tracker.error).toBe(-1);
    });

    it('initializes timeout to -1', () => {
      const tracker = createPerformanceTracker();
      expect(tracker.timeout).toBe(-1);
    });

    it('initializes latency to 0', () => {
      const tracker = createPerformanceTracker();
      expect(tracker.latency).toBe(0);
    });
  });

  describe('calculateLatency()', () => {
    it('returns a number', () => {
      const tracker = createPerformanceTracker();
      const latency = calculateLatency(tracker);
      expect(typeof latency).toBe('number');
    });

    it('returns non-negative value', () => {
      const tracker = createPerformanceTracker();
      const latency = calculateLatency(tracker);
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it('increases over time', async () => {
      const tracker = createPerformanceTracker();
      const latency1 = calculateLatency(tracker);
      await new Promise(resolve => setTimeout(resolve, 10));
      const latency2 = calculateLatency(tracker);
      expect(latency2).toBeGreaterThan(latency1);
    });

    it('calculates difference from init time', () => {
      const tracker: PerformanceTracker = {
        status: 'init',
        init: timer() - 100, // 100ms ago
        requested: 0,
        received: 0,
        preload: 0,
        error: -1,
        timeout: -1,
        latency: 0
      };

      const latency = calculateLatency(tracker);
      expect(latency).toBeGreaterThanOrEqual(100);
    });
  });

  describe('PerformanceTracker interface', () => {
    it('can be modified', () => {
      const tracker = createPerformanceTracker();

      tracker.status = 'requested';
      tracker.requested = timer();

      expect(tracker.status).toBe('requested');
      expect(tracker.requested).toBeGreaterThan(0);
    });

    it('tracks full lifecycle', () => {
      const tracker = createPerformanceTracker();

      // Simulate request
      tracker.status = 'requested';
      tracker.requested = timer();

      // Simulate receive
      tracker.status = 'received';
      tracker.received = timer();
      tracker.latency = tracker.received - tracker.init;

      expect(tracker.status).toBe('received');
      expect(tracker.received).toBeGreaterThanOrEqual(tracker.requested);
      expect(tracker.latency).toBeGreaterThanOrEqual(0);
    });

    it('tracks error state', () => {
      const tracker = createPerformanceTracker();

      tracker.status = 'error';
      tracker.error = timer();

      expect(tracker.status).toBe('error');
      expect(tracker.error).toBeGreaterThan(0);
    });

    it('tracks timeout state', () => {
      const tracker = createPerformanceTracker();

      tracker.status = 'timeout';
      tracker.timeout = timer();

      expect(tracker.status).toBe('timeout');
      expect(tracker.timeout).toBeGreaterThan(0);
    });
  });
});
