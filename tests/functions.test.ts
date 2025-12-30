import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  disconnectObservers,
  destroySlots,
  recreate
} from '../src/functions';

// Mock the loader
const mockSlots = {
  disconnectObservers: vi.fn(() => 2),
  destroySlot: vi.fn()
};

const mockWrapperAuctions = {
  clearAuction: vi.fn()
};

const mockLoader = {
  log: vi.fn(),
  slots: mockSlots,
  wrapperAuctions: mockWrapperAuctions,
  ads: {
    'advert_test_dyn_0': { adType: 'dyn' },
    'advert_test_dyn_1': { adType: 'dyn' },
    'advert_test_mpu_0': { adType: 'mpu' }
  },
  requestAds: vi.fn()
};

// Mock propertyConfig
vi.mock('../src/propertyConfig', () => ({
  resolveConfig: vi.fn(() => ({
    selector: '[id^="advert_"]',
    prefix: 'test',
    observedClass: 'observed',
    loadedClass: 'loaded'
  }))
}));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;

  // Setup DOM elements
  document.body.innerHTML = `
    <div id="advert_test_dyn_0" class="observed loaded"></div>
    <div id="advert_test_dyn_1" class="observed loaded"></div>
    <div id="advert_test_mpu_0" class="observed loaded"></div>
  `;
});

describe('functions', () => {
  describe('init', () => {
    it('initializes the module', () => {
      expect(() => init()).not.toThrow();
    });

    it('only initializes once', () => {
      init();
      init();
      // Should not throw or cause issues
    });
  });

  describe('disconnectObservers', () => {
    it('returns early when no filter provided', () => {
      disconnectObservers(null as any);
      expect(mockSlots.disconnectObservers).not.toHaveBeenCalled();
    });

    it('returns early when loader not available', () => {
      delete (window as any).proton;
      disconnectObservers('all');
      // Should not throw
    });

    it('calls slots.disconnectObservers with filter', () => {
      disconnectObservers('all');
      expect(mockSlots.disconnectObservers).toHaveBeenCalledWith('all');
    });

    it('converts adtype filter to adType', () => {
      disconnectObservers({ adtype: 'dyn' });
      expect(mockSlots.disconnectObservers).toHaveBeenCalledWith({ adType: 'dyn' });
    });
  });

  describe('destroySlots', () => {
    it('returns early when no filter provided', () => {
      destroySlots(null as any);
      expect(mockSlots.destroySlot).not.toHaveBeenCalled();
    });

    it('returns early when loader not available', () => {
      delete (window as any).proton;
      destroySlots('all');
      // Should not throw
    });

    it('destroys all slots when filter is "all"', () => {
      destroySlots('all');
      expect(mockSlots.destroySlot).toHaveBeenCalledTimes(3);
    });

    it('destroys specific slot by ID', () => {
      destroySlots('advert_test_dyn_0');
      expect(mockSlots.destroySlot).toHaveBeenCalledWith('advert_test_dyn_0');
    });

    it('destroys slots matching adtype', () => {
      destroySlots({ adtype: 'dyn' });
      expect(mockSlots.destroySlot).toHaveBeenCalledTimes(2);
    });

    it('clears wrapper auction state', () => {
      destroySlots('advert_test_dyn_0');
      expect(mockWrapperAuctions.clearAuction).toHaveBeenCalledWith('advert_test_dyn_0');
    });

    it('logs when slot ID not found in DOM', () => {
      destroySlots('nonexistent_slot');
      expect(mockLoader.log).toHaveBeenCalled();
    });
  });

  describe('recreate', () => {
    it('returns early when no filter provided', () => {
      recreate(null as any);
      expect(mockSlots.disconnectObservers).not.toHaveBeenCalled();
    });

    it('returns early when loader not available', () => {
      delete (window as any).proton;
      recreate('all');
      // Should not throw
    });

    it('disconnects observers before destroying', () => {
      recreate('all');
      expect(mockSlots.disconnectObservers).toHaveBeenCalled();
    });

    it('removes observed class from elements', () => {
      recreate('all');

      const el = document.getElementById('advert_test_dyn_0');
      expect(el?.classList.contains('observed')).toBe(false);
    });

    it('removes loaded class from elements', () => {
      recreate('all');

      const el = document.getElementById('advert_test_dyn_0');
      expect(el?.classList.contains('loaded')).toBe(false);
    });

    it('calls requestAds after cleanup', () => {
      recreate('all');
      expect(mockLoader.requestAds).toHaveBeenCalled();
    });

    it('only recreates matching adtype', () => {
      recreate({ adtype: 'dyn' });

      const dynEl = document.getElementById('advert_test_dyn_0');
      const mpuEl = document.getElementById('advert_test_mpu_0');

      expect(dynEl?.classList.contains('observed')).toBe(false);
      expect(mpuEl?.classList.contains('observed')).toBe(true);
    });

    it('only recreates specific slot ID', () => {
      recreate('advert_test_dyn_0');

      const targetEl = document.getElementById('advert_test_dyn_0');
      const otherEl = document.getElementById('advert_test_dyn_1');

      expect(targetEl?.classList.contains('observed')).toBe(false);
      expect(otherEl?.classList.contains('observed')).toBe(true);
    });
  });
});
