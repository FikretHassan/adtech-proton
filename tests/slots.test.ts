import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  init,
  getState,
  discoverSlots,
  getUnobservedSlots,
  markObserved,
  markLoaded,
  extractAdType,
  extractIndex,
  shouldLazyLoad,
  getLazyOffset,
  isOutOfPage,
  buildAdUnitPath,
  getSlotCount,
  defineGPTSlot,
  enableServices,
  injectOOPContainers,
  createLazyObserver,
  getDefinedSlots,
  getConfig,
  getLazyloadConfig,
  getSlotCounts,
  getPPID,
  getSlotData,
  getAllSlotData,
  updateSlotData,
  refreshSlot,
  refreshSlots,
  destroySlot,
  destroySlots,
  setSlotTargeting,
  setSlotTargetingBulk,
  getSlotTargeting,
  clearSlotTargeting,
  resetSlotCounts,
  reset,
  disconnectObservers,
  getActiveObservers,
  isSraBatchingEnabled,
  requestAd
} from '../src/slots';

// Mock the loader config
vi.mock('../config/loader.js', () => ({
  default: {
    globalName: 'proton',
    pubsubGlobal: 'PubSub',
    ads: {}
  }
}));

// Mock properties config
vi.mock('../config/properties.json', () => ({
  default: {
    common: {
      selector: '.js-advert',
      observedClass: 'advert--observed',
      loadedClass: 'advert--loaded',
      outOfPageTypes: ['sky', 'int'],
      collapseEmptyDivs: true,
      prefix: 'site',
      adUnitPath: '/12345/{site}/{zone}',
      testAdUnitPath: '/test/unit',
      injectOOP: []
    },
    properties: {}
  }
}));

// Mock lazyload config
vi.mock('../config/lazyload.json', () => ({
  default: {
    l: {
      active: true,
      offset: -300,
      lazy: ['mpu', 'dyn'],
      exempt: ['advert_site_mpu_0'],
      exemptTypes: ['int']
    },
    m: {
      active: true,
      offset: -200,
      lazy: ['all'],
      exempt: []
    },
    s: {
      active: false,
      offset: -100,
      lazy: [],
      exempt: []
    }
  }
}));

// Mock sizemapping
vi.mock('../src/sizemapping', () => ({
  default: {
    getBreakpoint: vi.fn(() => 'l'),
    getSizesForSlot: vi.fn(() => [[300, 250], [300, 600]]),
    buildGPTSizeMappingForSlot: vi.fn(() => []),
    getBreakpoints: vi.fn(() => ({
      l: { minWidth: 1024 },
      m: { minWidth: 768 },
      s: { minWidth: 0 }
    }))
  }
}));

// Mock adTargeting
vi.mock('../src/adTargeting', () => ({
  default: {
    buildTargeting: vi.fn((context, overrides) => ({ ...context, ...overrides })),
    resolveValueDefinition: vi.fn(() => null)
  }
}));

// Mock adRefresh
vi.mock('../src/optional/adRefresh', () => ({
  default: {
    init: vi.fn(),
    scheduleRefresh: vi.fn(() => true),
    cancelRefresh: vi.fn(),
    cancelAllRefreshes: vi.fn()
  }
}));

// Mock preRequestHooks
vi.mock('../src/preRequestHooks', () => ({
  default: {
    wrapWithHooks: vi.fn((slotId, callback) => callback())
  }
}));

// Mock environment
vi.mock('../src/environment', () => ({
  default: {
    getUrlParams: vi.fn(() => ({})),
    useTestAdUnits: vi.fn(() => false)
  }
}));

// Mock wrapperAuctions
vi.mock('../src/optional/wrapperAuctions', () => ({
  default: {
    hasEnabledWrappers: vi.fn(() => false),
    hasSlotConfig: vi.fn(() => false),
    requestAuction: vi.fn(() => Promise.resolve()),
    applyBids: vi.fn()
  }
}));

// Mock propertyConfig
vi.mock('../src/propertyConfig', () => ({
  resolveConfig: vi.fn((config) => config)
}));

// Mock timer
vi.mock('../src/timer', () => ({
  timer: vi.fn(() => 12345)
}));

// Mock IntersectionObserver
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

(globalThis as any).IntersectionObserver = MockIntersectionObserver;

describe('slots', () => {
  let mockGoogletag: any;
  let mockPubsub: any;
  let mockSlot: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset DOM
    document.body.innerHTML = '';

    // Create mock GPT slot
    mockSlot = {
      addService: vi.fn().mockReturnThis(),
      setCollapseEmptyDiv: vi.fn().mockReturnThis(),
      defineSizeMapping: vi.fn().mockReturnThis(),
      setTargeting: vi.fn().mockReturnThis(),
      clearTargeting: vi.fn().mockReturnThis(),
      getTargeting: vi.fn(() => []),
      getTargetingKeys: vi.fn(() => [])
    };

    // Create mock googletag
    mockGoogletag = {
      cmd: [],
      defineSlot: vi.fn(() => mockSlot),
      defineOutOfPageSlot: vi.fn(() => mockSlot),
      pubads: vi.fn(() => ({
        enableSingleRequest: vi.fn(),
        disableInitialLoad: vi.fn(),
        setPublisherProvidedId: vi.fn(),
        refresh: vi.fn()
      })),
      enableServices: vi.fn(),
      display: vi.fn(),
      destroySlots: vi.fn(),
      sizeMapping: vi.fn(() => ({
        addSize: vi.fn().mockReturnThis(),
        build: vi.fn(() => [])
      }))
    };

    // Execute cmd queue synchronously for testing
    mockGoogletag.cmd.push = function(fn: () => void) {
      fn();
      return Array.prototype.push.call(this, fn);
    };

    (window as any).googletag = mockGoogletag;

    // Create mock PubSub
    mockPubsub = {
      publish: vi.fn()
    };
    (window as any).PubSub = mockPubsub;

    // Create mock loader
    (window as any).proton = {
      log: vi.fn(),
      hooks: null
    };

    // Reset module state
    reset();
  });

  afterEach(() => {
    delete (window as any).googletag;
    delete (window as any).PubSub;
    delete (window as any).proton;
  });

  describe('init', () => {
    it('initializes the module', () => {
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('returns state on subsequent calls', () => {
      init();
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('sets initialized state to true', () => {
      init();
      expect(getState().initialized).toBe(true);
    });
  });

  describe('getState', () => {
    it('returns state object', () => {
      const state = getState();
      expect(state).toHaveProperty('initialized');
      expect(state).toHaveProperty('definedCount');
    });

    it('returns copy of state', () => {
      const state1 = getState();
      const state2 = getState();
      expect(state1).not.toBe(state2);
    });
  });

  describe('discoverSlots', () => {
    it('finds slots matching selector', () => {
      document.body.innerHTML = `
        <div class="js-advert" id="slot1"></div>
        <div class="js-advert" id="slot2"></div>
        <div class="other" id="other"></div>
      `;
      const slots = discoverSlots();
      expect(slots).toHaveLength(2);
    });

    it('returns empty array when no slots', () => {
      document.body.innerHTML = '<div class="other"></div>';
      const slots = discoverSlots();
      expect(slots).toHaveLength(0);
    });
  });

  describe('getUnobservedSlots', () => {
    it('excludes observed slots', () => {
      document.body.innerHTML = `
        <div class="js-advert" id="slot1"></div>
        <div class="js-advert advert--observed" id="slot2"></div>
      `;
      const slots = getUnobservedSlots();
      expect(slots).toHaveLength(1);
      expect(slots[0].id).toBe('slot1');
    });
  });

  describe('markObserved', () => {
    it('adds observed class to element', () => {
      const el = document.createElement('div');
      markObserved(el);
      expect(el.classList.contains('advert--observed')).toBe(true);
    });
  });

  describe('markLoaded', () => {
    it('adds loaded class to element', () => {
      const el = document.createElement('div');
      markLoaded(el);
      expect(el.classList.contains('advert--loaded')).toBe(true);
    });
  });

  describe('extractAdType', () => {
    it('extracts ad type from slot ID', () => {
      expect(extractAdType('advert_site_mpu_0')).toBe('mpu');
      expect(extractAdType('advert_site_ban_1')).toBe('ban');
      expect(extractAdType('dfp_ad_nat_2')).toBe('nat');
    });

    it('returns "nat" for short IDs', () => {
      expect(extractAdType('short_id')).toBe('nat');
      expect(extractAdType('single')).toBe('nat');
    });

    it('handles empty string', () => {
      expect(extractAdType('')).toBe('nat');
    });

    it('handles slot IDs with extra parts', () => {
      expect(extractAdType('dfp_ad_mpu_0_extra')).toBe('mpu');
    });
  });

  describe('extractIndex', () => {
    it('extracts index from slot ID', () => {
      expect(extractIndex('advert_site_mpu_0')).toBe(0);
      expect(extractIndex('advert_site_ban_5')).toBe(5);
      expect(extractIndex('dfp_ad_mpu_10')).toBe(10);
    });

    it('returns null for missing index', () => {
      expect(extractIndex('advert_site_mpu')).toBeNull();
      expect(extractIndex('short')).toBeNull();
    });
  });

  describe('shouldLazyLoad', () => {
    it('returns true for lazy ad types', () => {
      expect(shouldLazyLoad('mpu', 'advert_site_mpu_1', 'l')).toBe(true);
      expect(shouldLazyLoad('dyn', 'advert_site_dyn_0', 'l')).toBe(true);
    });

    it('returns false for non-lazy ad types', () => {
      expect(shouldLazyLoad('ban', 'advert_site_ban_0', 'l')).toBe(false);
    });

    it('returns false for exempt slots', () => {
      expect(shouldLazyLoad('mpu', 'advert_site_mpu_0', 'l')).toBe(false);
    });

    it('returns false for exempt types', () => {
      expect(shouldLazyLoad('int', 'advert_site_int_0', 'l')).toBe(false);
    });

    it('returns false when breakpoint is inactive', () => {
      expect(shouldLazyLoad('mpu', 'advert_site_mpu_0', 's')).toBe(false);
    });

    it('handles "all" in lazy list', () => {
      expect(shouldLazyLoad('anytype', 'advert_site_anytype_0', 'm')).toBe(true);
    });
  });

  describe('getLazyOffset', () => {
    it('returns offset for breakpoint', () => {
      expect(getLazyOffset('l')).toBe(-300);
      expect(getLazyOffset('m')).toBe(-200);
      expect(getLazyOffset('s')).toBe(-100);
    });

    it('returns default for unknown breakpoint', () => {
      expect(getLazyOffset('unknown')).toBe(-250);
    });
  });

  describe('isOutOfPage', () => {
    it('returns true for OOP types', () => {
      expect(isOutOfPage('sky')).toBe(true);
      expect(isOutOfPage('int')).toBe(true);
    });

    it('returns false for regular types', () => {
      expect(isOutOfPage('mpu')).toBe(false);
      expect(isOutOfPage('ban')).toBe(false);
    });
  });

  describe('buildAdUnitPath', () => {
    it('builds path with context', () => {
      const path = buildAdUnitPath({ site: 'mysite', zone: 'homepage' });
      expect(path).toBe('/12345/mysite/homepage');
    });

    it('uses defaults when context missing', () => {
      const path = buildAdUnitPath();
      expect(path).toBe('/12345/default/ros');
    });
  });

  describe('getSlotCount', () => {
    it('returns incremented count', () => {
      expect(getSlotCount('mpu')).toBe(0);
      expect(getSlotCount('mpu')).toBe(1);
      expect(getSlotCount('mpu')).toBe(2);
    });

    it('tracks different ad types separately', () => {
      expect(getSlotCount('mpu')).toBe(0);
      expect(getSlotCount('ban')).toBe(0);
      expect(getSlotCount('mpu')).toBe(1);
    });
  });

  describe('defineGPTSlot', () => {
    it('defines a GPT slot', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/12345/site/zone',
        sizes: [[300, 250]]
      });

      expect(mockGoogletag.defineSlot).toHaveBeenCalled();
      expect(mockSlot.addService).toHaveBeenCalled();
    });

    it('returns null if googletag not available', () => {
      delete (window as any).googletag;
      const result = defineGPTSlot({
        slotId: 'test',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });
      expect(result).toBeNull();
    });

    it('returns existing slot if already defined', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      expect(mockGoogletag.defineSlot).toHaveBeenCalledTimes(1);
    });

    it('defines out-of-page slot for OOP types', () => {
      defineGPTSlot({
        slotId: 'advert_site_sky_0',
        adType: 'sky',
        adUnitPath: '/test',
        sizes: []
      });

      expect(mockGoogletag.defineOutOfPageSlot).toHaveBeenCalled();
    });

    it('stores slot in registry', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: [[300, 250]]
      });

      const data = getSlotData('advert_site_mpu_0');
      expect(data).not.toBeNull();
      expect(data.adtype).toBe('mpu');
    });
  });

  describe('enableServices', () => {
    it('calls googletag.enableServices', () => {
      enableServices();
      expect(mockGoogletag.enableServices).toHaveBeenCalled();
    });

    it('handles missing googletag', () => {
      delete (window as any).googletag;
      expect(() => enableServices()).not.toThrow();
    });
  });

  describe('createLazyObserver', () => {
    it('creates IntersectionObserver', () => {
      const callback = vi.fn();
      const observer = createLazyObserver(callback, 'l');
      expect(observer).toBeInstanceOf(IntersectionObserver);
    });
  });

  describe('getDefinedSlots', () => {
    it('returns Map of defined slots', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      const slots = getDefinedSlots();
      expect(slots).toBeInstanceOf(Map);
      expect(slots.has('advert_site_mpu_0')).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('returns slots config', () => {
      const config = getConfig();
      expect(config).toHaveProperty('selector');
      expect(config.selector).toBe('.js-advert');
    });
  });

  describe('getLazyloadConfig', () => {
    it('returns lazyload config', () => {
      const config = getLazyloadConfig();
      expect(config).toHaveProperty('l');
      expect(config.l.active).toBe(true);
    });
  });

  describe('getSlotCounts', () => {
    it('returns copy of slot counts', () => {
      getSlotCount('mpu');
      getSlotCount('mpu');
      getSlotCount('ban');

      const counts = getSlotCounts();
      expect(counts.mpu).toBe(2);
      expect(counts.ban).toBe(1);
    });
  });

  describe('getPPID', () => {
    it('returns null when not set', () => {
      expect(getPPID()).toBeNull();
    });
  });

  describe('slot data functions', () => {
    beforeEach(() => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: [[300, 250]]
      });
    });

    describe('getSlotData', () => {
      it('returns slot data', () => {
        const data = getSlotData('advert_site_mpu_0');
        expect(data).not.toBeNull();
        expect(data.slotid).toBe('advert_site_mpu_0');
      });

      it('returns null for unknown slot', () => {
        expect(getSlotData('unknown')).toBeNull();
      });
    });

    describe('getAllSlotData', () => {
      it('returns all slot data', () => {
        const all = getAllSlotData();
        expect(Object.keys(all)).toContain('advert_site_mpu_0');
      });
    });

    describe('updateSlotData', () => {
      it('updates slot data', () => {
        const result = updateSlotData('advert_site_mpu_0', { custom: 'value' });
        expect(result).toBe(true);
        expect(getSlotData('advert_site_mpu_0').custom).toBe('value');
      });

      it('returns false for unknown slot', () => {
        const result = updateSlotData('unknown', { foo: 'bar' });
        expect(result).toBe(false);
      });

      it('merges customvars', () => {
        updateSlotData('advert_site_mpu_0', { customvars: { newKey: 'newVal' } });
        const data = getSlotData('advert_site_mpu_0');
        expect(data.customvars.newKey).toBe('newVal');
      });
    });
  });

  describe('targeting functions', () => {
    beforeEach(() => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });
    });

    describe('setSlotTargeting', () => {
      it('sets targeting on slot', () => {
        const result = setSlotTargeting('advert_site_mpu_0', 'key', 'value');
        expect(result).toBe(true);
        expect(mockSlot.setTargeting).toHaveBeenCalledWith('key', 'value');
      });

      it('returns false for unknown slot', () => {
        const result = setSlotTargeting('unknown', 'key', 'value');
        expect(result).toBe(false);
      });

      it('handles array values', () => {
        setSlotTargeting('advert_site_mpu_0', 'key', ['a', 'b']);
        expect(mockSlot.setTargeting).toHaveBeenCalledWith('key', ['a', 'b']);
      });
    });

    describe('setSlotTargetingBulk', () => {
      it('sets multiple targeting keys', () => {
        // Clear previous calls from defineGPTSlot
        mockSlot.setTargeting.mockClear();

        const result = setSlotTargetingBulk('advert_site_mpu_0', {
          key1: 'val1',
          key2: 'val2'
        });
        expect(result).toBe(true);
        expect(mockSlot.setTargeting).toHaveBeenCalledTimes(2);
      });

      it('returns false for unknown slot', () => {
        const result = setSlotTargetingBulk('unknown', { key: 'val' });
        expect(result).toBe(false);
      });

      it('returns true for empty targeting', () => {
        const result = setSlotTargetingBulk('advert_site_mpu_0', {});
        expect(result).toBe(true);
      });
    });

    describe('getSlotTargeting', () => {
      it('returns null for unknown slot', () => {
        expect(getSlotTargeting('unknown')).toBeNull();
      });

      it('calls getTargeting with key', () => {
        getSlotTargeting('advert_site_mpu_0', 'somekey');
        expect(mockSlot.getTargeting).toHaveBeenCalledWith('somekey');
      });

      it('returns all targeting when no key provided', () => {
        mockSlot.getTargetingKeys.mockReturnValue(['key1', 'key2']);
        mockSlot.getTargeting.mockReturnValue(['value']);

        const result = getSlotTargeting('advert_site_mpu_0');
        expect(result).toHaveProperty('key1');
        expect(result).toHaveProperty('key2');
      });
    });

    describe('clearSlotTargeting', () => {
      it('clears all targeting', () => {
        clearSlotTargeting('advert_site_mpu_0');
        expect(mockSlot.clearTargeting).toHaveBeenCalled();
      });

      it('clears specific keys', () => {
        clearSlotTargeting('advert_site_mpu_0', ['key1', 'key2']);
        expect(mockSlot.clearTargeting).toHaveBeenCalledTimes(2);
      });

      it('returns false for unknown slot', () => {
        const result = clearSlotTargeting('unknown');
        expect(result).toBe(false);
      });
    });
  });

  describe('refresh functions', () => {
    beforeEach(() => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });
      defineGPTSlot({
        slotId: 'advert_site_ban_0',
        adType: 'ban',
        adUnitPath: '/test',
        sizes: []
      });
    });

    describe('refreshSlot', () => {
      it('refreshes a slot', () => {
        const result = refreshSlot('advert_site_mpu_0');
        expect(result).toBe(true);
      });

      it('returns false for unknown slot', () => {
        const result = refreshSlot('unknown');
        expect(result).toBe(false);
      });

      it('increments adcount', () => {
        refreshSlot('advert_site_mpu_0');
        const data = getSlotData('advert_site_mpu_0');
        expect(data.adcount).toBe(2);
      });
    });

    describe('refreshSlots', () => {
      it('refreshes by exact ID', () => {
        const count = refreshSlots('advert_site_mpu_0');
        expect(count).toBe(1);
      });

      it('refreshes all slots', () => {
        const count = refreshSlots('all');
        expect(count).toBe(2);
      });

      it('refreshes by ad type', () => {
        const count = refreshSlots({ adType: 'mpu' });
        expect(count).toBe(1);
      });

      it('returns 0 for no filter', () => {
        const count = refreshSlots(null);
        expect(count).toBe(0);
      });
    });
  });

  describe('destroy functions', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div class="js-advert advert--observed advert--loaded" id="advert_site_mpu_0"></div>
        <div class="js-advert advert--observed advert--loaded" id="advert_site_ban_0"></div>
      `;

      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });
      defineGPTSlot({
        slotId: 'advert_site_ban_0',
        adType: 'ban',
        adUnitPath: '/test',
        sizes: []
      });
    });

    describe('destroySlot', () => {
      it('destroys a slot', () => {
        const result = destroySlot('advert_site_mpu_0');
        expect(result).toBe(true);
        expect(getDefinedSlots().has('advert_site_mpu_0')).toBe(false);
      });

      it('returns false for unknown slot', () => {
        const result = destroySlot('unknown');
        expect(result).toBe(false);
      });

      it('removes slot from registry', () => {
        destroySlot('advert_site_mpu_0');
        expect(getSlotData('advert_site_mpu_0')).toBeNull();
      });

      it('removes classes from element', () => {
        destroySlot('advert_site_mpu_0');
        const el = document.getElementById('advert_site_mpu_0');
        expect(el?.classList.contains('advert--observed')).toBe(false);
        expect(el?.classList.contains('advert--loaded')).toBe(false);
      });
    });

    describe('destroySlots', () => {
      it('destroys all slots', () => {
        const count = destroySlots('all');
        expect(count).toBe(2);
        expect(getDefinedSlots().size).toBe(0);
      });

      it('destroys by exact ID', () => {
        const count = destroySlots('advert_site_mpu_0');
        expect(count).toBe(1);
      });

      it('destroys by ad type', () => {
        const count = destroySlots({ adType: 'mpu' });
        expect(count).toBe(1);
      });

      it('returns 0 for no filter', () => {
        const count = destroySlots(null);
        expect(count).toBe(0);
      });
    });
  });

  describe('observer functions', () => {
    describe('disconnectObservers', () => {
      it('returns 0 for no filter', () => {
        const count = disconnectObservers(null);
        expect(count).toBe(0);
      });

      it('disconnects all observers', () => {
        const count = disconnectObservers('all');
        expect(count).toBe(0); // No observers registered
      });
    });

    describe('getActiveObservers', () => {
      it('returns Map of observers', () => {
        const observers = getActiveObservers();
        expect(observers).toBeInstanceOf(Map);
      });
    });
  });

  describe('resetSlotCounts', () => {
    it('resets all slot counts', () => {
      getSlotCount('mpu');
      getSlotCount('mpu');
      getSlotCount('ban');

      resetSlotCounts();

      expect(getSlotCounts()).toEqual({});
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      reset();

      expect(getDefinedSlots().size).toBe(0);
      expect(getAllSlotData()).toEqual({});
      expect(getSlotCounts()).toEqual({});
    });

    it('preserves initialized state after reset', () => {
      init();
      reset();
      const state = getState();
      // reset() clears slots but preserves the initialized flag
      expect(state.initialized).toBe(true);
    });
  });

  describe('isSraBatchingEnabled', () => {
    it('returns false by default', () => {
      expect(isSraBatchingEnabled()).toBe(false);
    });
  });

  describe('requestAd', () => {
    it('returns promise', async () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      const result = requestAd('advert_site_mpu_0');
      expect(result).toBeInstanceOf(Promise);
      await expect(result).resolves.toBeUndefined();
    });

    it('resolves when googletag not available', async () => {
      delete (window as any).googletag;
      const result = await requestAd('advert_site_mpu_0');
      expect(result).toBeUndefined();
    });
  });

  describe('injectOOPContainers', () => {
    it('creates OOP containers', () => {
      injectOOPContainers();

      // Should create containers for OOP types: sky, int
      const sky = document.getElementById('advert_site_sky');
      const int = document.getElementById('advert_site_int');
      expect(sky).not.toBeNull();
      expect(int).not.toBeNull();
    });

    it('skips existing containers', () => {
      document.body.innerHTML = '<div id="advert_site_sky"></div>';

      injectOOPContainers();

      const containers = document.querySelectorAll('#advert_site_sky');
      expect(containers).toHaveLength(1);
    });

    it('sets correct attributes on containers', () => {
      injectOOPContainers();

      const sky = document.getElementById('advert_site_sky');
      expect(sky?.getAttribute('data-adType')).toBe('sky');
      expect(sky?.getAttribute('data-ad-slot-id')).toBe('advert_site_sky');
    });
  });

  describe('buildAdUnitPath edge cases', () => {
    it('handles partial context', () => {
      const path = buildAdUnitPath({ site: 'mysite' });
      expect(path).toBe('/12345/mysite/ros');
    });

    it('handles empty context zone', () => {
      const path = buildAdUnitPath({ zone: 'homepage' });
      expect(path).toBe('/12345/default/homepage');
    });
  });

  describe('defineGPTSlot with custom sizemapping', () => {
    it('applies custom sizemapping', () => {
      const customSizemapping = {
        l: [[300, 250], [300, 600]],
        m: [[300, 250]],
        s: [[300, 250]]
      };

      defineGPTSlot({
        slotId: 'custom_slot_0',
        adType: 'custom',
        adUnitPath: '/custom/path',
        sizes: [[300, 250]],
        customSizemapping
      });

      expect(mockGoogletag.sizeMapping).toHaveBeenCalled();
    });

    it('handles empty custom sizemapping', () => {
      defineGPTSlot({
        slotId: 'custom_slot_1',
        adType: 'custom',
        adUnitPath: '/custom/path',
        sizes: [[300, 250]],
        customSizemapping: {}
      });

      expect(mockGoogletag.defineSlot).toHaveBeenCalled();
    });

    it('applies targeting overrides', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_1',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: [[300, 250]],
        targeting: { customKey: 'customValue' }
      });

      expect(mockSlot.setTargeting).toHaveBeenCalled();
    });
  });

  describe('refreshSlot with targeting', () => {
    beforeEach(() => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });
    });

    it('applies new targeting on refresh', () => {
      mockSlot.setTargeting.mockClear();

      refreshSlot('advert_site_mpu_0', { newKey: 'newValue' });

      expect(mockSlot.setTargeting).toHaveBeenCalledWith('newKey', 'newValue');
    });

    it('handles missing googletag on refresh', () => {
      delete (window as any).googletag;
      const result = refreshSlot('advert_site_mpu_0');
      expect(result).toBe(false);
    });
  });

  describe('destroySlot edge cases', () => {
    it('handles missing googletag', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      delete (window as any).googletag;
      const result = destroySlot('advert_site_mpu_0');
      expect(result).toBe(false);
    });

    it('removes injected slot container', () => {
      document.body.innerHTML = `
        <div class="advert-container">
          <div class="js-advert advert--observed" id="dyn_mpu_0"></div>
        </div>
      `;

      defineGPTSlot({
        slotId: 'dyn_mpu_0',
        adType: 'dyn',
        adUnitPath: '/test',
        sizes: []
      });

      destroySlot('dyn_mpu_0');

      // Container should be removed for injected slots
      const container = document.querySelector('.advert-container');
      expect(container).toBeNull();
    });

    it('handles element without parent', () => {
      defineGPTSlot({
        slotId: 'orphan_slot',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      // Slot element doesn't exist in DOM
      const result = destroySlot('orphan_slot');
      expect(result).toBe(true);
    });
  });

  describe('disconnectObservers detailed tests', () => {
    it('disconnects observer by exact ID', () => {
      // Add an observer to the map
      const mockObserver = new MockIntersectionObserver(() => {});
      const observers = getActiveObservers();
      observers.set('advert_site_mpu_0', mockObserver as any);

      document.body.innerHTML = '<div id="advert_site_mpu_0"></div>';

      const count = disconnectObservers('advert_site_mpu_0');
      expect(count).toBe(1);
      expect(observers.has('advert_site_mpu_0')).toBe(false);
    });

    it('disconnects observers by ad type', () => {
      const mockObserver = new MockIntersectionObserver(() => {});
      const observers = getActiveObservers();
      observers.set('advert_site_mpu_0', mockObserver as any);
      observers.set('advert_site_mpu_1', mockObserver as any);
      observers.set('advert_site_ban_0', mockObserver as any);

      document.body.innerHTML = `
        <div id="advert_site_mpu_0"></div>
        <div id="advert_site_mpu_1"></div>
        <div id="advert_site_ban_0"></div>
      `;

      const count = disconnectObservers({ adType: 'mpu' });
      expect(count).toBe(2);
    });
  });

  describe('requestAd edge cases', () => {
    beforeEach(() => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });
    });

    it('accepts adcount option', async () => {
      await requestAd('advert_site_mpu_0', { adcount: 5 });
      // Should complete without error
    });

    it('accepts skipRefresh option', async () => {
      await requestAd('advert_site_mpu_0', { skipRefresh: true });
      // Should complete without error
    });
  });

  describe('hooks integration', () => {
    it('executes beforeDefine hooks', () => {
      const mockHooks = {
        executeSync: vi.fn()
      };
      (window as any).proton.hooks = mockHooks;

      defineGPTSlot({
        slotId: 'hook_test_slot',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      expect(mockHooks.executeSync).toHaveBeenCalledWith(
        'slot.beforeDefine',
        'hook_test_slot',
        'mpu',
        []
      );
    });

    it('executes afterDefine hooks', () => {
      const mockHooks = {
        executeSync: vi.fn()
      };
      (window as any).proton.hooks = mockHooks;

      defineGPTSlot({
        slotId: 'hook_test_slot_2',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      expect(mockHooks.executeSync).toHaveBeenCalledWith(
        'slot.afterDefine',
        'hook_test_slot_2',
        expect.anything()
      );
    });

    it('handles hook errors gracefully', () => {
      const mockHooks = {
        executeSync: vi.fn(() => { throw new Error('Hook error'); })
      };
      (window as any).proton.hooks = mockHooks;

      // Should not throw
      expect(() => {
        defineGPTSlot({
          slotId: 'error_hook_slot',
          adType: 'mpu',
          adUnitPath: '/test',
          sizes: []
        });
      }).not.toThrow();
    });
  });

  describe('lazy observer callback', () => {
    it('observer callback fires on intersection', () => {
      const callback = vi.fn();
      const observer = createLazyObserver(callback, 'l');

      // Simulate intersection
      const mockEntry = {
        isIntersecting: true,
        target: document.createElement('div')
      };

      (observer as any).callback([mockEntry]);

      expect(callback).toHaveBeenCalledWith(mockEntry.target);
    });

    it('observer does not fire when not intersecting', () => {
      const callback = vi.fn();
      const observer = createLazyObserver(callback, 'l');

      const mockEntry = {
        isIntersecting: false,
        target: document.createElement('div')
      };

      (observer as any).callback([mockEntry]);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('state persistence', () => {
    it('init returns state with initialized true', () => {
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('getState includes defined count', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      const state = getState();
      expect(state.definedCount).toBe(1);
    });
  });

  describe('slot registry', () => {
    it('stores slot metadata correctly', () => {
      document.body.innerHTML = '<div id="advert_site_mpu_0"></div>';

      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/custom/path',
        sizes: [[300, 250], [300, 600]]
      });

      const data = getSlotData('advert_site_mpu_0');
      expect(data.adunit).toBe('/custom/path');
      expect(data.adtype).toBe('mpu');
      expect(data.sizes).toHaveLength(2);
      expect(data.outofpage).toBe(false);
    });

    it('tracks adcount in registry', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      const data = getSlotData('advert_site_mpu_0');
      expect(data.adcount).toBe(1);
    });
  });

  describe('SRA batching', () => {
    it('returns false when feature is disabled', () => {
      // FEATURE_SRA_BATCHING is false in tests
      expect(isSraBatchingEnabled()).toBe(false);
    });

    it('checks environment for URL params', () => {
      // SRA batching is disabled at build time in tests
      // so even with URL params, it returns false
      expect(isSraBatchingEnabled()).toBe(false);
    });
  });

  describe('bulk operations', () => {
    it('refreshSlots applies new targeting to all slots', () => {
      defineGPTSlot({
        slotId: 'advert_site_mpu_0',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });
      defineGPTSlot({
        slotId: 'advert_site_mpu_1',
        adType: 'mpu',
        adUnitPath: '/test',
        sizes: []
      });

      mockSlot.setTargeting.mockClear();
      refreshSlots('all', { refresh: 'true' });

      expect(mockSlot.setTargeting).toHaveBeenCalled();
    });
  });
});
