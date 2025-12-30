/**
 * Slots Module
 * Discovers ad containers, defines GPT slots, handles lazy loading
 */

import rawPropertiesConfig from '../config/properties.json';
import rawLazyloadConfig from '../config/lazyload.json';

// Cast config to any for dynamic property access
const lazyloadConfig = rawLazyloadConfig as any;
import sizemapping from './sizemapping';
import adTargeting from './adTargeting';
import adRefresh from './optional/adRefresh';
import preRequestHooks from './preRequestHooks';
import environment from './environment';
import wrapperAuctions from './optional/wrapperAuctions';
import CONFIG from '../config/loader.js';
import { timer } from './timer';
import { resolveConfig } from './propertyConfig';
import { safeExecute } from './errors';

/**
 * Get resolved slots config (common + property-specific merged)
 * Now reads from properties.json which contains both domains and slot config
 */
function getSlotsConfig() {
  const common = (rawPropertiesConfig as any).common || {};
  const propertyConfig = resolveConfig((rawPropertiesConfig as any).properties || rawPropertiesConfig) || {};
  return { ...common, ...(propertyConfig as object) };
}

// Resolved config (lazily evaluated on first access)
let _slotsConfig: any = null;
function getResolvedConfig() {
  if (!_slotsConfig) {
    _slotsConfig = getSlotsConfig();
  }
  return _slotsConfig;
}

// Proxy for backwards compatibility - resolves config on property access
const slotsConfig = new Proxy({} as any, {
  get(target, prop) {
    return getResolvedConfig()[prop];
  }
});

// Logging prefix
const LOG_PREFIX = '[Slots]';

// Context interfaces
interface LazyContext {
  // Reserved for future dimension-based targeting
}

interface AdUnitContext {
  site?: string;
  zone?: string;
}

interface RequestAdOptions {
  adcount?: number;
  sizes?: Array<[number, number]>;
}

/**
 * Get the loader instance from the global object
 */
function getLoader() {
  return window[CONFIG.globalName];
}

/**
 * Get hooks module from loader
 */
function getHooks() {
  return getLoader()?.hooks;
}

/**
 * Log helper - uses loader's log system if available
 */
function log(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${message}`, data);
  }
}

/**
 * Warn helper - uses loader's log system if available
 */
function warn(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} WARN: ${message}`, data);
  }
}

// Module state
const state = {
  initialized: false
};

// Track defined GPT slots
const definedSlots = new Map<string, any>();

// Comprehensive slot registry
// Stores all slot data: adunit, sizes, targeting, prebid, etc.
const slotRegistry: Record<string, any> = {};

// Track slot counts per ad type
const slotCounts: Record<string, number> = {};

// Track active observers for cleanup
const activeObservers = new Map<string, IntersectionObserver>();

// Track resolved PPID value
let resolvedPPID: string | null = null;

// ============================================================================
// SRA Batching (optional module)
// Batches above-fold (immediate) slots into fewer requests
// Below-fold (lazy) slots continue to request individually
// ============================================================================

declare const FEATURE_SRA_BATCHING: boolean;

// Get SRA batching config
function getSraBatchingConfig(): { enabled: boolean } {
  if (!FEATURE_SRA_BATCHING) return { enabled: false };
  const adsConfig = CONFIG.ads || {};
  return adsConfig.sraBatching || { enabled: false };
}

let sraBatchingInitialized = false;

/**
 * Check if SRA batching is enabled (build-time + runtime + URL override)
 * URL params: ?adSraOn (force on), ?adSraOff (force off)
 */
export function isSraBatchingEnabled(): boolean {
  if (!FEATURE_SRA_BATCHING) return false;

  // Check URL param overrides (environment must be initialized)
  const urlParams = environment.getUrlParams();
  if (urlParams.adSraOff) {
    return false;
  }
  if (urlParams.adSraOn) {
    return true;
  }

  // Fall back to config
  return getSraBatchingConfig().enabled === true;
}

/**
 * Initialize slots module
 * @returns {Object} Module state
 */
export function init() {
  if (state.initialized) return getState();

  // Ensure googletag command queue exists
  window.googletag = window.googletag || {};
  window.googletag.cmd = window.googletag.cmd || [];

  state.initialized = true;
  log('Initialized');

  // Emit ready event
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic: 'loader.slots.ready', data: getState() });
    log('Published loader.slots.ready');
  }

  return getState();
}

/**
 * Get module state
 * @returns {Object} Copy of module state
 */
export function getState() {
  return { ...state, definedCount: definedSlots.size };
}

/**
 * Discover all ad slots in the DOM
 * @returns {HTMLElement[]} Array of ad container elements
 */
export function discoverSlots() {
  return Array.from(document.querySelectorAll(slotsConfig.selector));
}

/**
 * Get slots that haven't been observed yet
 * @returns {HTMLElement[]} Array of unobserved ad containers
 */
export function getUnobservedSlots() {
  const selector = `${slotsConfig.selector}:not(.${slotsConfig.observedClass})`;
  return Array.from(document.querySelectorAll(selector));
}

/**
 * Mark a slot as observed
 * @param {HTMLElement} element - The slot element
 */
export function markObserved(element: any) {
  element.classList.add(slotsConfig.observedClass);
}

/**
 * Mark a slot as loaded
 * @param {HTMLElement} element - The slot element
 */
export function markLoaded(element: any) {
  element.classList.add(slotsConfig.loadedClass);
}

/**
 * Extract ad type from slot ID
 *
 * Slot ID format: advert_{prefix}_{adType}_{index}
 * - prefix: Property identifier from properties.json (e.g., 'mysite')
 * - adType: Ad format (e.g., 'ban', 'mpu', 'dyn')
 * - index: Optional numeric index for multiple slots of same type
 *
 * Examples: advert_mysite_ban_0, advert_mysite_mpu_1, advert_mysite_dyn_0
 *
 * @param {string} slotId - Full slot ID
 * @returns {string} Ad type at index 2 (e.g., 'ban', 'mpu')
 */
export function extractAdType(slotId: string) {
  // Split: advert_mysite_ban_0 → ['advert', 'mysite', 'ban', '0']
  const parts = slotId.split('_');
  return parts[2] || 'nat'; // index 2 = adType
}

/**
 * Extract slot index from slot ID
 * @param {string} slotId - Full slot ID (see extractAdType for format)
 * @returns {number|null} Slot index at position 3, or null
 */
export function extractIndex(slotId: string) {
  // Split: advert_mysite_ban_0 → ['advert', 'mysite', 'ban', '0']
  const parts = slotId.split('_');
  return parts[3] ? parseInt(parts[3], 10) : null; // index 3 = slot index
}

/**
 * Check if slot should be lazy loaded
 * @param {string} adType - Ad type
 * @param {string} slotId - Full slot ID
 * @param {string} breakpoint - Current breakpoint
 * @param {Object} context - Reserved for future use
 * @returns {boolean}
 */
export function shouldLazyLoad(adType: string, slotId: string, breakpoint: string, context: LazyContext = {}) {
  const config = lazyloadConfig[breakpoint];

  if (!config || !config.active) {
    return false;
  }

  // Check exemptTypes (ad types that should NEVER be lazy loaded, e.g., OOP slots)
  if (config.exemptTypes?.length > 0 && config.exemptTypes.includes(adType)) {
    return false;
  }

  // Check if ad type is in lazy list
  const isLazy = config.lazy.includes('all') || config.lazy.includes(adType);
  if (!isLazy) {
    return false;
  }

  // Check exemptions (specific slot IDs that should NOT be lazy loaded)
  if (config.exempt?.includes(slotId)) {
    return false;
  }

  return true;
}

/**
 * Get lazy load offset for current breakpoint
 * @param {string} breakpoint - Current breakpoint
 * @returns {number} Offset in pixels
 */
export function getLazyOffset(breakpoint: string) {
  const config = lazyloadConfig[breakpoint];
  return config ? config.offset : -250;
}

/**
 * Check if ad type is out-of-page
 * @param {string} adType - Ad type
 * @returns {boolean}
 */
export function isOutOfPage(adType: string) {
  return slotsConfig.outOfPageTypes.includes(adType);
}

/**
 * Build GPT ad unit path
 * @param {Object} context - { site, zone }
 * @returns {string} Ad unit path
 */
export function buildAdUnitPath(context: AdUnitContext = {}) {
  // Check if ?adteston forces test ad units
  if (environment.useTestAdUnits() && slotsConfig.testAdUnitPath) {
    log('Using test ad unit path (adteston)');
    return slotsConfig.testAdUnitPath;
  }

  const site = context.site || 'default';
  const zone = context.zone || 'ros';

  let path = slotsConfig.adUnitPath;
  path = path.replaceAll('{site}', site);
  path = path.replaceAll('{zone}', zone);
  return path;
}

/**
 * Increment and get slot count for ad type
 * @param {string} adType - Ad type
 * @returns {number} Current count (0-indexed)
 */
export function getSlotCount(adType: string) {
  if (typeof slotCounts[adType] === 'undefined') {
    slotCounts[adType] = 0;
  }
  return slotCounts[adType]++;
}

/**
 * Define a GPT slot
 * @param {Object} options - Slot options
 * @param {string} options.slotId - DOM element ID
 * @param {string} options.adType - Ad type
 * @param {string} options.adUnitPath - Full ad unit path
 * @param {Array} options.sizes - Array of sizes
 * @param {Object} options.targeting - Custom targeting key-values (overrides)
 * @param {Object} options.customSizemapping - Optional per-breakpoint sizemapping (for custom slots)
 * @returns {Object|null} GPT slot or null if googletag not available
 */
interface DefineGPTSlotOptions {
  slotId: string;
  adType: string;
  adUnitPath: string;
  sizes: any[];
  targeting?: Record<string, any>;
  customSizemapping?: Record<string, any[]> | null;
}

export function defineGPTSlot({ slotId, adType, adUnitPath, sizes, targeting = {}, customSizemapping = null }: DefineGPTSlotOptions) {
  if (!window.googletag || !window.googletag.cmd) {
    warn('googletag not available');
    return null;
  }

  // Check if already defined
  if (definedSlots.has(slotId)) {
    log(`defineGPTSlot: ${slotId} already defined, returning existing`);
    return definedSlots.get(slotId);
  }

  // Execute slot.beforeDefine hooks
  const hooks = getHooks();
  if (hooks) {
    safeExecute(
      () => hooks.executeSync('slot.beforeDefine', slotId, adType, sizes),
      undefined,
      (err) => warn(`Hook slot.beforeDefine failed: ${err.message}`)
    );
  }

  // Get slot count for this ad type
  const slotCount = getSlotCount(adType);
  const outofpage = isOutOfPage(adType);

  // Capture tsor (time start of request) at slot definition
  const tsor = String(timer());

  // Build combined targeting (page + slot) - matches monolith behavior
  const slotContext = {
    id: slotId,
    adType: adType,
    count: String(slotCount),
    adcount: '1',  // Initial ad count (increments on refresh)
    tsor: tsor     // Time start of request
  };
  const combinedTargeting = adTargeting.buildTargeting(slotContext, targeting);

  // Initialize slot registry entry
  slotRegistry[slotId] = {
    slotid: slotId,
    adunit: adUnitPath,
    adtype: adType,
    pos: slotCount,
    sizes: sizes || [],
    outofpage: outofpage,
    customvars: { ...combinedTargeting },
    adcount: 1,
    refreshable: false,  // Updated when refresh is scheduled
    div: document.getElementById(slotId),
    adslot: null  // Set after GPT slot is created
  };

  let gptSlot: any = null;

  window.googletag.cmd.push(() => {
    if (outofpage) {
      // Out-of-page slot
      gptSlot = window.googletag.defineOutOfPageSlot(adUnitPath, slotId);
    } else {
      // Standard display slot
      gptSlot = window.googletag.defineSlot(adUnitPath, sizes, slotId);
    }

    if (gptSlot) {
      gptSlot.addService(window.googletag.pubads());

      // Collapse empty divs if configured (native GPT empty handling)
      if (slotsConfig.collapseEmptyDivs) {
        gptSlot.setCollapseEmptyDiv(true);
      }

      // Apply size mapping if available
      // Use custom sizemapping if provided (for custom slots), otherwise use global config
      let sizeMapping: Array<{ viewport: any[]; sizes: any }> = [];
      if (customSizemapping) {
        // Build GPT size mapping from custom slot's sizemapping config
        const breakpoints = sizemapping.getBreakpoints();
        const sorted = Object.entries(breakpoints)
          .sort((a, b) => (b[1] as any).minWidth - (a[1] as any).minWidth);

        for (const [key, bp] of sorted) {
          const sizesForBreakpoint = customSizemapping[key];
          if (sizesForBreakpoint && Array.isArray(sizesForBreakpoint)) {
            // Filter to only array sizes (exclude 'fluid' string for GPT size mapping)
            const gptSizes = sizesForBreakpoint.filter((s: any) => Array.isArray(s));
            sizeMapping.push({
              viewport: [(bp as any).minWidth, 0],
              sizes: gptSizes.length > 0 ? gptSizes : [[1, 1]]
            });
          }
        }
        log(`defineGPTSlot: ${slotId} using CUSTOM sizemapping, ${sizeMapping.length} mappings`);
      } else {
        sizeMapping = sizemapping.buildGPTSizeMappingForSlot(slotId);
      }

      if (sizeMapping.length > 0) {
        const mapping = window.googletag.sizeMapping();
        sizeMapping.forEach((m: any) => {
          mapping.addSize(m.viewport, m.sizes);
        });
        gptSlot.defineSizeMapping(mapping.build());
      }

      // Apply all targeting (page + slot) - matches monolith behavior
      Object.entries(combinedTargeting).forEach(([key, value]) => {
        if (value !== null && value !== undefined && value !== '') {
          gptSlot.setTargeting(key, Array.isArray(value) ? value : String(value));
        }
      });

      definedSlots.set(slotId, gptSlot);

      // Update registry with GPT slot reference
      if (slotRegistry[slotId]) {
        slotRegistry[slotId].adslot = gptSlot;
      }

      // Execute slot.afterDefine hooks
      const hooksAfter = getHooks();
      if (hooksAfter) {
        safeExecute(
          () => hooksAfter.executeSync('slot.afterDefine', slotId, gptSlot),
          undefined,
          (err) => warn(`Hook slot.afterDefine failed: ${err.message}`)
        );
      }

      log(`defineGPTSlot: ${slotId} defined`, { adType, adUnitPath, sizes: sizes?.length || 0 });
    }
  });

  return gptSlot;
}

/**
 * Internal function to display a slot after auctions complete
 * For lazy slots in SRA mode: display() registers, then refresh() fetches individually
 * For non-SRA mode: display() handles everything
 * @param {string} slotId - Slot ID
 * @param {Object} options - Display options
 * @param {boolean} options.skipRefresh - If true, skip refresh (used for batch processing)
 */
function displaySlot(slotId: string, options: { skipRefresh?: boolean } = {}) {
  // Execute slot.beforeRequest hooks
  const hooks = getHooks();
  const slot = definedSlots.get(slotId);
  if (hooks) {
    safeExecute(
      () => hooks.executeSync('slot.beforeRequest', slotId, slot),
      undefined,
      (err) => warn(`Hook slot.beforeRequest failed: ${err.message}`)
    );
  }

  const sraBatching = isSraBatchingEnabled();

  // Run pre-request hooks, then display
  preRequestHooks.wrapWithHooks(slotId, () => {
    window.googletag.cmd.push(() => {
      const gptSlot = definedSlots.get(slotId);
      if (!gptSlot) {
        warn(`requestAd: Slot not defined: ${slotId}`);
        return;
      }

      // Always call display() to register the slot
      window.googletag.display(slotId);

      if (sraBatching && !options.skipRefresh) {
        // SRA mode for lazy slots: display() registered, now refresh individually
        window.googletag.pubads().refresh([gptSlot]);
        log(`requestAd: ${slotId} (lazy, individual refresh)`);
      } else if (!sraBatching) {
        // Traditional mode: display() already fetched the ad
        log(`requestAd: ${slotId}`);
      }
      // If skipRefresh, the caller will batch refresh later

      // Execute slot.afterRequest hooks
      const hooksAfter = getHooks();
      if (hooksAfter) {
        safeExecute(
          () => hooksAfter.executeSync('slot.afterRequest', slotId),
          undefined,
          (err) => warn(`Hook slot.afterRequest failed: ${err.message}`)
        );
      }
    });
  });
}

/**
 * Request ad for a slot
 * Fire-and-forget pattern - auctions run in parallel, display on completion
 * @param {string} slotId - Slot ID
 * @param {Object} options - Options
 * @param {number} options.adcount - Ad count (for refresh tracking)
 * @param {boolean} options.skipRefresh - Skip refresh (for SRA batch processing)
 * @returns {Promise<void>} Resolves when auction completes (if any)
 */
export function requestAd(slotId: string, options: RequestAdOptions & { skipRefresh?: boolean } = {}): Promise<void> {
  if (!window.googletag || !window.googletag.cmd) {
    warn(`requestAd: googletag not available`);
    return Promise.resolve();
  }

  const adcount = options.adcount || 1;
  const skipRefresh = options.skipRefresh || false;

  // Check if wrapper auctions are enabled AND this slot has config
  if (wrapperAuctions.hasEnabledWrappers() && wrapperAuctions.hasSlotConfig(slotId)) {
    log(`requestAd: ${slotId} running auction first`);

    // Return promise for batch processing coordination
    return wrapperAuctions.requestAuction(slotId, { adcount }).then(() => {
      // Apply bids to GPT slot
      wrapperAuctions.applyBids(slotId);
      // Display the ad
      displaySlot(slotId, { skipRefresh });
    });
  } else {
    // No auction needed, display immediately
    displaySlot(slotId, { skipRefresh });
    return Promise.resolve();
  }
}

/**
 * Enable GPT services (must be called after defining slots, before requesting)
 * When SRA batching is enabled, uses disableInitialLoad so display() only registers
 * slots and refresh() is used to actually request ads in batches.
 */
export function enableServices() {
  if (!window.googletag || !window.googletag.cmd) {
    warn('enableServices: googletag not available');
    return;
  }

  const sraBatching = isSraBatchingEnabled();

  window.googletag.cmd.push(() => {
    // Enable SRA batching mode
    // - enableSingleRequest(): tells GPT to batch slots into single requests
    // - disableInitialLoad(): makes display() only register, refresh() fetches
    // Together: we control when batches are sent via refresh([slots])
    if (sraBatching && !sraBatchingInitialized) {
      window.googletag.pubads().enableSingleRequest();
      window.googletag.pubads().disableInitialLoad();
      sraBatchingInitialized = true;
      log('enableServices: SRA batching mode - enableSingleRequest + disableInitialLoad');
    }

    // Set PPID if configured and available
    let ppid: string | null = null;

    if (slotsConfig.ppid && typeof slotsConfig.ppid === 'object') {
      ppid = adTargeting.resolveValueDefinition(slotsConfig.ppid);
    }

    if (ppid && typeof ppid === 'string' && ppid.length > 0) {
      window.googletag.pubads().setPublisherProvidedId(ppid);
      resolvedPPID = ppid;
      log('enableServices: PPID set', ppid);
    }

    window.googletag.enableServices();
    log('enableServices: GPT services enabled', { sraBatching });
  });
}

/**
 * Inject OOP (out-of-page) containers if missing
 * First injects explicitly configured containers from injectOOP,
 * then auto-generates containers for any outOfPageTypes not yet in DOM
 */
export function injectOOPContainers() {
  if (!document.body) {
    warn('injectOOPContainers: document.body not available');
    return;
  }

  const injected: string[] = [];

  // First: inject explicitly configured OOP containers
  slotsConfig.injectOOP.forEach((config: any) => {
    if (!document.getElementById(config.id)) {
      const div = document.createElement('div');
      div.id = config.id;
      div.className = config.className;

      if (config.style) {
        div.style.cssText = config.style;
      }

      Object.entries(config.dataAttributes || {}).forEach(([key, value]) => {
        div.setAttribute(key, value as string);
      });

      document.body.appendChild(div);
      injected.push(config.id);
    }
  });

  // Second: auto-generate containers for any outOfPageTypes not yet in DOM
  const prefix = slotsConfig.prefix || 'site';
  const configuredIds = slotsConfig.injectOOP.map((c: any) => c.id);

  slotsConfig.outOfPageTypes.forEach((adType: string) => {
    const slotId = `advert_${prefix}_${adType}`;
    
    // Skip if already in DOM or was just injected via explicit config
    if (document.getElementById(slotId) || configuredIds.includes(slotId)) {
      return;
    }

    // Auto-generate container for this OOP type
    const div = document.createElement('div');
    div.id = slotId;
    div.className = `js-advert advert advert--${adType}`;
    div.setAttribute('data-adType', adType);
    div.setAttribute('data-ad-slot-hidden', 'false');
    div.setAttribute('data-ad-slot-id', slotId);

    document.body.appendChild(div);
    injected.push(slotId);
    log(`injectOOPContainers: auto-generated ${slotId}`);
  });

  if (injected.length > 0) {
    log(`injectOOPContainers: injected ${injected.length} containers`, injected);
  }
}

/**
 * Create IntersectionObserver for lazy loading
 * @param {Function} callback - Called when slot enters viewport
 * @param {string} breakpoint - Current breakpoint
 * @returns {IntersectionObserver | null} Returns null if IntersectionObserver not supported
 */
export function createLazyObserver(callback: (element: HTMLElement) => void, breakpoint: string): IntersectionObserver | null {
  // Check if IntersectionObserver is supported
  if (typeof IntersectionObserver === 'undefined') {
    // Return null if not supported - caller should handle gracefully
    return null;
  }

  const offset = getLazyOffset(breakpoint);

  return new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        callback(entry.target as HTMLElement);
      }
    });
  }, {
    rootMargin: `${Math.abs(offset)}px 0px`
  });
}

/**
 * Get all defined slots
 * @returns {Map} Map of slotId -> GPT slot
 */
export function getDefinedSlots() {
  return definedSlots;
}

/**
 * Get slot data from registry
 * @param {string} slotId - Slot ID
 * @returns {Object|null} Slot data or null if not found
 */
export function getSlotData(slotId: string) {
  return slotRegistry[slotId] || null;
}

/**
 * Get all slot data
 * @returns {Object} Complete slot registry
 */
export function getAllSlotData() {
  return slotRegistry;
}

/**
 * Update slot registry data (for prebid, targeting updates, etc.)
 * @param {string} slotId - Slot ID
 * @param {Object} data - Data to merge into slot registry
 * @returns {boolean} Success
 */
export function updateSlotData(slotId: string, data: any) {
  if (!slotRegistry[slotId]) {
    warn(`updateSlotData: slot not in registry: ${slotId}`);
    return false;
  }

  // Merge data into registry entry
  Object.assign(slotRegistry[slotId], data);

  // If customvars provided, merge them specially
  if (data.customvars) {
    slotRegistry[slotId].customvars = {
      ...slotRegistry[slotId].customvars,
      ...data.customvars
    };
  }

  log(`updateSlotData: ${slotId} updated`, data);
  return true;
}

/**
 * Get slot config (resolved for current property)
 * @returns {Object} Slots configuration
 */
export function getConfig() {
  return getResolvedConfig();
}

/**
 * Get lazyload config
 * @returns {Object} Lazyload configuration
 */
export function getLazyloadConfig() {
  return lazyloadConfig;
}

/**
 * Get resolved PPID value
 * @returns {string|null} PPID value or null if not set
 */
export function getPPID() {
  return resolvedPPID;
}

// ============================================================================
// Lifecycle Functions (refresh, destroy, reset)
// ============================================================================

/**
 * Refresh multiple slots by filter
 * @param {string|Object} filter - Slot ID string, { adType: 'ban' }, or 'all'
 * @param {Object} newTargeting - Optional new targeting to apply before refresh
 * @returns {number} Number of slots refreshed
 */
export function refreshSlots(filter: any, newTargeting: any = {}) {
  if (!filter) {
    warn('refreshSlots: No filter provided');
    return 0;
  }

  log('refreshSlots: called with filter', filter);

  const isAll = filter === 'all';
  const isExactId = typeof filter === 'string' && filter !== 'all';
  const adType = !isExactId && !isAll && filter.adType ? filter.adType : null;

  let refreshed = 0;

  if (isExactId) {
    if (refreshSlot(filter, newTargeting)) {
      refreshed++;
    }
  } else if (isAll) {
    definedSlots.forEach((slot, slotId) => {
      if (refreshSlot(slotId, newTargeting)) {
        refreshed++;
      }
    });
  } else if (adType) {
    definedSlots.forEach((slot, slotId) => {
      if (slotId.includes(`_${adType}_`)) {
        if (refreshSlot(slotId, newTargeting)) {
          refreshed++;
        }
      }
    });
  }

  log(`refreshSlots: refreshed ${refreshed} slots`, { filter });
  return refreshed;
}

/**
 * Refresh a single slot
 * Runs pre-request hooks (e.g., DoubleVerify readiness) before refresh
 * Uses requestAnimationFrame for best practice
 * @param {string} slotId - Slot ID to refresh
 * @param {Object} newTargeting - Optional new targeting to apply before refresh
 * @returns {boolean} Success
 */
export function refreshSlot(slotId: string, newTargeting: any = {}) {
  const slot = definedSlots.get(slotId);
  if (!slot) {
    warn(`refreshSlot: slot not defined: ${slotId}`);
    return false;
  }

  if (!window.googletag || !window.googletag.cmd) {
    warn('refreshSlot: googletag not available');
    return false;
  }

  // Increment adcount in registry
  if (slotRegistry[slotId]) {
    slotRegistry[slotId].adcount = (slotRegistry[slotId].adcount || 1) + 1;

    // Update customvars with new adcount
    slotRegistry[slotId].customvars.adcount = String(slotRegistry[slotId].adcount);

    // Merge new targeting into customvars
    if (Object.keys(newTargeting).length > 0) {
      Object.assign(slotRegistry[slotId].customvars, newTargeting);
    }
  }

  // Run pre-request hooks, then requestAnimationFrame, then refresh
  preRequestHooks.wrapWithHooks(slotId, () => {
    window.googletag.cmd.push(() => {
      // Apply new targeting if provided
      const targetingKeys = Object.keys(newTargeting);
      if (targetingKeys.length > 0) {
        log(`refreshSlot: ${slotId} applying targeting`, newTargeting);
      }
      Object.entries(newTargeting).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          slot.setTargeting(key, Array.isArray(value) ? value : String(value));
        }
      });

      // Update adcount targeting on the slot
      if (slotRegistry[slotId]) {
        slot.setTargeting('adcount', String(slotRegistry[slotId].adcount));
      }

      window.googletag.pubads().refresh([slot]);
      log(`refreshSlot: ${slotId} refreshed`, { adcount: slotRegistry[slotId]?.adcount });
    });
  });

  return true;
}

/**
 * Destroy a single slot
 * @param {string} slotId - Slot ID to destroy
 * @returns {boolean} Success
 */
export function destroySlot(slotId: string) {
  const slot = definedSlots.get(slotId);
  if (!slot) {
    warn(`destroySlot: slot not defined: ${slotId}`);
    return false;
  }

  if (!window.googletag || !window.googletag.cmd) {
    warn('destroySlot: googletag not available');
    return false;
  }

  // Cancel any active refresh timer
  adRefresh.cancelRefresh(slotId);

  window.googletag.cmd.push(() => {
    window.googletag.destroySlots([slot]);
    definedSlots.delete(slotId);
    log(`destroySlot: ${slotId} destroyed`);
  });

  // Remove from slot registry
  if (slotRegistry[slotId]) {
    delete slotRegistry[slotId];
    log(`destroySlot: ${slotId} removed from registry`);
  }

  // Remove observer if exists
  if (activeObservers.has(slotId)) {
    const observer = activeObservers.get(slotId);
    const element = document.getElementById(slotId);
    if (element && observer) {
      observer.unobserve(element);
    }
    activeObservers.delete(slotId);
    log(`destroySlot: ${slotId} observer removed`);
  }

  // Remove observed/loaded class so slot can be re-discovered
  const element = document.getElementById(slotId);
  if (element) {
    // Check if this is a dynamically injected slot (parent is injection container)
    const parent = element.parentElement;
    const isInjectedSlot = parent?.classList.contains('advert-container') ||
                           parent?.classList.contains('dynamicMpu');

    if (isInjectedSlot && parent) {
      // Remove entire container for injected slots to prevent duplicates on re-injection
      parent.remove();
      log(`destroySlot: ${slotId} container removed (injected slot)`);
    } else {
      // Just remove classes for hardcoded slots
      element.classList.remove(slotsConfig.observedClass);
      element.classList.remove(slotsConfig.loadedClass);
      log(`destroySlot: ${slotId} classes removed`);
    }
  }

  return true;
}

/**
 * Destroy multiple slots by filter
 * @param {string|Object} filter - 'all', slot ID string, or { adType: 'ban' }
 * @returns {number} Number of slots destroyed
 */
export function destroySlots(filter: any) {
  if (!filter) {
    warn('destroySlots: No filter provided');
    return 0;
  }

  log('destroySlots: called with filter', filter);

  const isAll = filter === 'all';
  const isExactId = typeof filter === 'string' && filter !== 'all';
  const adType = !isExactId && !isAll && filter.adType ? filter.adType : null;

  let destroyed = 0;

  if (isAll) {
    // Destroy all defined slots
    const slotsToDestroy = Array.from(definedSlots.keys());
    slotsToDestroy.forEach(slotId => {
      if (destroySlot(slotId)) {
        destroyed++;
      }
    });
  } else if (isExactId) {
    // Destroy single slot by ID
    if (destroySlot(filter)) {
      destroyed++;
    }
  } else if (adType) {
    // Destroy all slots matching adType
    const slotsToDestroy: string[] = [];
    definedSlots.forEach((slot, slotId) => {
      if (slotId.includes(`_${adType}_`)) {
        slotsToDestroy.push(slotId);
      }
    });

    slotsToDestroy.forEach(slotId => {
      if (destroySlot(slotId)) {
        destroyed++;
      }
    });
  }

  log(`destroySlots: destroyed ${destroyed} slots`, { filter });
  return destroyed;
}

/**
 * Clear targeting on a slot
 * @param {string} slotId - Slot ID
 * @param {string[]} keys - Optional specific keys to clear (all if omitted)
 * @returns {boolean} Success
 */
export function clearSlotTargeting(slotId: string, keys: string[] = []) {
  const slot = definedSlots.get(slotId);
  if (!slot) {
    warn(`clearSlotTargeting: slot not defined: ${slotId}`);
    return false;
  }

  window.googletag.cmd.push(() => {
    if (keys.length === 0) {
      slot.clearTargeting();
      log(`clearSlotTargeting: ${slotId} cleared all targeting`);
    } else {
      keys.forEach(key => {
        slot.clearTargeting(key);
      });
      log(`clearSlotTargeting: ${slotId} cleared keys [${keys.join(', ')}]`);
    }
  });

  return true;
}

/**
 * Set targeting on a defined slot
 * @param {string} slotId - Slot ID
 * @param {string} key - Targeting key
 * @param {string|string[]} value - Value (string or array)
 * @returns {boolean} Success
 */
export function setSlotTargeting(slotId: string, key: string, value: string | string[]): boolean {
  const slot = definedSlots.get(slotId);
  if (!slot) {
    warn(`setSlotTargeting: slot not defined: ${slotId}`);
    return false;
  }

  window.googletag.cmd.push(() => {
    slot.setTargeting(key, Array.isArray(value) ? value : String(value));
  });

  // Sync with slotRegistry customvars
  if (slotRegistry[slotId]) {
    slotRegistry[slotId].customvars[key] = value;
  }

  log(`setSlotTargeting: ${slotId} ${key}=${Array.isArray(value) ? value.join(',') : value}`);
  return true;
}

/**
 * Set multiple targeting keys on a defined slot
 * @param {string} slotId - Slot ID
 * @param {Object} targeting - Key-value pairs
 * @returns {boolean} Success
 */
export function setSlotTargetingBulk(slotId: string, targeting: Record<string, string | string[]>): boolean {
  const slot = definedSlots.get(slotId);
  if (!slot) {
    warn(`setSlotTargetingBulk: slot not defined: ${slotId}`);
    return false;
  }

  const keys = Object.keys(targeting);
  if (keys.length === 0) {
    return true;
  }

  window.googletag.cmd.push(() => {
    keys.forEach(key => {
      const value = targeting[key];
      if (value !== null && value !== undefined) {
        slot.setTargeting(key, Array.isArray(value) ? value : String(value));
      }
    });
  });

  // Sync with slotRegistry customvars
  if (slotRegistry[slotId]) {
    Object.assign(slotRegistry[slotId].customvars, targeting);
  }

  log(`setSlotTargetingBulk: ${slotId} set ${keys.length} keys`, targeting);
  return true;
}

/**
 * Get current targeting value(s) for a key on a slot
 * @param {string} slotId - Slot ID
 * @param {string} key - Targeting key (optional - returns all if omitted)
 * @returns {string[]|Record<string,string[]>|null} Current values or null if slot not found
 */
export function getSlotTargeting(slotId: string, key?: string): string[] | Record<string, string[]> | null {
  const slot = definedSlots.get(slotId);
  if (!slot) {
    warn(`getSlotTargeting: slot not defined: ${slotId}`);
    return null;
  }

  if (key) {
    return slot.getTargeting(key);
  }

  // Return all targeting keys
  const keys = slot.getTargetingKeys();
  const result: Record<string, string[]> = {};
  keys.forEach((k: string) => {
    result[k] = slot.getTargeting(k);
  });
  return result;
}

/**
 * Disconnect lazy observers matching filter
 * Prevents orphaned observers from firing after slot destruction
 * @param {string|Object} filter - 'all', exact slot ID, or { adType: 'dyn' }
 * @returns {number} Number of observers disconnected
 */
export function disconnectObservers(filter: any) {
  if (!filter) {
    warn('disconnectObservers: No filter provided');
    return 0;
  }

  const isAll = filter === 'all';
  const isExactId = typeof filter === 'string' && filter !== 'all';
  const adType = !isExactId && !isAll && filter?.adType ? filter.adType : null;

  let disconnected = 0;

  if (isAll) {
    activeObservers.forEach((observer, slotId) => {
      const element = document.getElementById(slotId);
      if (element && observer) {
        observer.unobserve(element);
      }
      disconnected++;
    });
    activeObservers.clear();
  } else if (isExactId) {
    if (activeObservers.has(filter)) {
      const observer = activeObservers.get(filter);
      const element = document.getElementById(filter);
      if (element && observer) {
        observer.unobserve(element);
      }
      activeObservers.delete(filter);
      disconnected++;
    }
  } else if (adType) {
    const toRemove: string[] = [];
    activeObservers.forEach((observer, slotId) => {
      if (slotId.includes(`_${adType}_`)) {
        const element = document.getElementById(slotId);
        if (element && observer) {
          observer.unobserve(element);
        }
        toRemove.push(slotId);
        disconnected++;
      }
    });
    toRemove.forEach(slotId => activeObservers.delete(slotId));
  }

  log(`disconnectObservers: disconnected ${disconnected}`, { filter });
  return disconnected;
}

/**
 * Get active observers (for external access via proton.slots.getActiveObservers())
 * @returns {Map} Map of slotId -> IntersectionObserver
 */
export function getActiveObservers() {
  return activeObservers;
}

/**
 * Reset slot counts (for SPA navigation)
 */
export function resetSlotCounts() {
  Object.keys(slotCounts).forEach(key => {
    delete slotCounts[key];
  });
  log('resetSlotCounts: all counts reset');
}

/**
 * Get current slot counts
 * @returns {Object} Slot counts by ad type
 */
export function getSlotCounts() {
  return { ...slotCounts };
}

/**
 * Full reset - destroys all slots, clears counts, removes observers, cancels refreshes
 * Use before SPA navigation or for complete cleanup
 */
export function reset() {
  // Cancel all ad refresh timers
  adRefresh.cancelAllRefreshes();

  // Destroy all GPT slots
  if (window.googletag && window.googletag.cmd) {
    const allSlots = Array.from(definedSlots.values());
    if (allSlots.length > 0) {
      window.googletag.cmd.push(() => {
        window.googletag.destroySlots(allSlots);
      });
    }
  }

  // Clear observers
  activeObservers.forEach((observer, slotId) => {
    const element = document.getElementById(slotId);
    if (element && observer) {
      observer.unobserve(element);
    }
  });
  activeObservers.clear();

  // Clear tracking maps
  definedSlots.clear();

  // Clear slot registry
  Object.keys(slotRegistry).forEach(key => {
    delete slotRegistry[key];
  });

  // Reset slot counts
  resetSlotCounts();

  // Reset SRA batching state
  if (FEATURE_SRA_BATCHING) {
    sraBatchingInitialized = false;
  }

  // Remove observed/loaded classes from DOM elements
  document.querySelectorAll(`.${slotsConfig.observedClass}`).forEach(el => {
    el.classList.remove(slotsConfig.observedClass);
    el.classList.remove(slotsConfig.loadedClass);
  });

  log('reset: full reset complete');
}

/**
 * Process all discovered slots - defines GPT slots and requests ads
 * @param {Object} context - Page context { site, zone }
 * @param {Object} options - Processing options
 * @param {boolean} options.enableLazy - Enable lazy loading (default: true)
 * @param {boolean} options.enableRefresh - Enable auto-refresh scheduling (default: true)
 * @param {string} options.pagetype - Page type for refresh rule matching
 * @param {Object} options.targeting - Additional targeting key-values
 * @returns {Object} Results { processed: number, lazy: number, immediate: number }
 */
interface ProcessSlotsOptions {
  enableLazy?: boolean;
  enableRefresh?: boolean;
  pagetype?: string;
  targeting?: Record<string, any>;
}

export function processSlots(context: Record<string, any> = {}, options: ProcessSlotsOptions = {}) {
  const { enableLazy = true, enableRefresh = true, pagetype = 'default', targeting = {} } = options;
  const breakpoint = sizemapping.getBreakpoint();
  const adUnitPath = buildAdUnitPath(context);

  const results: { processed: number; lazy: number; immediate: number; refreshScheduled: number; slots: string[] } = { processed: 0, lazy: 0, immediate: 0, refreshScheduled: 0, slots: [] };

  // Initialize adRefresh if refresh is enabled
  if (enableRefresh) {
    adRefresh.init({ pagetype });
  }

  // Inject OOP containers first
  injectOOPContainers();

  // Get unobserved slots
  const slots = getUnobservedSlots();

  if (slots.length === 0) {
    log('processSlots: no unobserved slots found');
    return results;
  }

  log(`processSlots: found ${slots.length} unobserved slots`);

  // Create lazy observer if enabled
  let lazyObserver: IntersectionObserver | null = null;
  if (enableLazy) {
    lazyObserver = createLazyObserver((element: HTMLElement) => {
      const slotId = element.id;
      const adType = extractAdType(slotId);
      lazyObserver!.unobserve(element);

      // requestAd handles auctions automatically if slot has config
      // Fire-and-forget pattern - no await needed
      requestAd(slotId);

      markLoaded(element);
      log(`processSlots: lazy loaded ${slotId}`);

      // Schedule refresh if enabled
      if (enableRefresh) {
        const scheduled = adRefresh.scheduleRefresh(slotId, { adType, pagetype });
        if (scheduled) {
          results.refreshScheduled++;
          // Update registry
          if (slotRegistry[slotId]) {
            slotRegistry[slotId].refreshable = true;
          }
        }
      }
    }, breakpoint);
  }

  // First pass: define all slots
  const slotsToProcess: Array<{ element: Element; slotId: string; adType: any; isLazy: any }> = [];
  slots.forEach(element => {
    const slotId = element.id;
    const adType = extractAdType(slotId);
    const sizes = sizemapping.getSizesForSlot(slotId, breakpoint);

    // Mark as observed
    markObserved(element);

    // Define the GPT slot
    defineGPTSlot({
      slotId,
      adType,
      adUnitPath,
      sizes,
      targeting
    });

    results.processed++;
    results.slots.push(slotId);

    // Check lazy load eligibility
    const isLazy = enableLazy && shouldLazyLoad(adType, slotId, breakpoint, context);
    slotsToProcess.push({ element, slotId, adType, isLazy });
  });

  // Enable services after all slots are defined
  enableServices();

  // Separate immediate and lazy slots
  // For SRA batching: slots currently in viewport are "immediate" even if lazy-configured
  const immediateSlots: Array<{ element: Element; slotId: string; adType: any }> = [];
  const lazySlots: Array<{ element: Element; slotId: string; adType: any }> = [];

  const sraBatching = isSraBatchingEnabled();

  slotsToProcess.forEach(({ element, slotId, adType, isLazy }) => {
    if (isLazy && lazyObserver) {
      // For SRA batching: check if this "lazy" slot is actually visible in viewport now
      if (sraBatching) {
        const rect = element.getBoundingClientRect();
        const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
        if (inViewport) {
          // Visible now - batch with immediate slots
          immediateSlots.push({ element, slotId, adType });
          log(`processSlots: ${slotId} (lazy config, but in viewport - batching)`);
        } else {
          // Below fold - true lazy loading
          lazySlots.push({ element, slotId, adType });
        }
      } else {
        lazySlots.push({ element, slotId, adType });
      }
    } else {
      immediateSlots.push({ element, slotId, adType });
    }
  });

  // Set up lazy loading observers
  lazySlots.forEach(({ element, slotId }) => {
    lazyObserver!.observe(element);
    activeObservers.set(slotId, lazyObserver!);
    results.lazy++;
    log(`processSlots: ${slotId} queued for lazy load`);
  });

  // Process immediate slots
  if (sraBatching && immediateSlots.length > 0) {
    // SRA batch mode: separate auction vs non-auction slots to avoid delays
    // Non-auction slots can refresh immediately, auction slots wait for bids
    const auctionSlots: Array<{ element: Element; slotId: string; adType: any }> = [];
    const nonAuctionSlots: Array<{ element: Element; slotId: string; adType: any }> = [];

    immediateSlots.forEach((slot) => {
      if (wrapperAuctions.hasEnabledWrappers() && wrapperAuctions.hasSlotConfig(slot.slotId)) {
        auctionSlots.push(slot);
      } else {
        nonAuctionSlots.push(slot);
      }
    });

    log(`processSlots: SRA batch mode - ${nonAuctionSlots.length} non-auction, ${auctionSlots.length} auction slots`);

    // Batch 1: Non-auction slots - display and refresh immediately
    if (nonAuctionSlots.length > 0) {
      nonAuctionSlots.forEach(({ slotId }) => {
        displaySlot(slotId, { skipRefresh: true });
      });

      window.googletag.cmd.push(() => {
        const gptSlots: any[] = [];
        const slotIds: string[] = [];

        nonAuctionSlots.forEach(({ slotId }) => {
          const gptSlot = definedSlots.get(slotId);
          if (gptSlot) {
            gptSlots.push(gptSlot);
            slotIds.push(slotId);
          }
        });

        if (gptSlots.length > 0) {
          window.googletag.pubads().refresh(gptSlots);
          log(`processSlots: SRA batch refresh (non-auction) - ${gptSlots.length} slots`, slotIds);
        }
      });
    }

    // Batch 2: Auction slots - run auctions in parallel, then batch refresh
    if (auctionSlots.length > 0) {
      const auctionPromises = auctionSlots.map(({ slotId }) => {
        return requestAd(slotId, { skipRefresh: true });
      });

      Promise.all(auctionPromises).then(() => {
        window.googletag.cmd.push(() => {
          const gptSlots: any[] = [];
          const slotIds: string[] = [];

          auctionSlots.forEach(({ slotId }) => {
            const gptSlot = definedSlots.get(slotId);
            if (gptSlot) {
              gptSlots.push(gptSlot);
              slotIds.push(slotId);
            }
          });

          if (gptSlots.length > 0) {
            window.googletag.pubads().refresh(gptSlots);
            log(`processSlots: SRA batch refresh (auction) - ${gptSlots.length} slots`, slotIds);

            // Emit batch event
            const pubsub = window[CONFIG.pubsubGlobal];
            if (pubsub?.publish) {
              pubsub.publish({
                topic: 'loader.ads.batchRefresh',
                data: { slotIds, count: slotIds.length }
              });
            }
          }
        });
      });
    }

    // Mark immediate slots as loaded and schedule refresh
    immediateSlots.forEach(({ element, slotId, adType }) => {
      markLoaded(element);
      results.immediate++;
      log(`processSlots: ${slotId} (SRA batch)`);

      if (enableRefresh) {
        const scheduled = adRefresh.scheduleRefresh(slotId, { adType, pagetype });
        if (scheduled) {
          results.refreshScheduled++;
          if (slotRegistry[slotId]) {
            slotRegistry[slotId].refreshable = true;
          }
        }
      }
    });
  } else {
    // Traditional mode: request each immediate slot individually
    immediateSlots.forEach(({ element, slotId, adType }) => {
      requestAd(slotId);
      markLoaded(element);
      results.immediate++;
      log(`processSlots: ${slotId} requested immediately`);

      if (enableRefresh) {
        const scheduled = adRefresh.scheduleRefresh(slotId, { adType, pagetype });
        if (scheduled) {
          results.refreshScheduled++;
          if (slotRegistry[slotId]) {
            slotRegistry[slotId].refreshable = true;
          }
        }
      }
    });
  }

  log(`processSlots: complete`, {
    processed: results.processed,
    immediate: results.immediate,
    lazy: results.lazy,
    refreshScheduled: results.refreshScheduled,
    sraBatching
  });
  return results;
}

// Default export with all functions
export default {
  // Lifecycle
  init,
  getState,
  // Discovery
  discoverSlots,
  getUnobservedSlots,
  markObserved,
  markLoaded,
  extractAdType,
  extractIndex,
  // Lazy loading
  shouldLazyLoad,
  getLazyOffset,
  isOutOfPage,
  // Slot definition
  buildAdUnitPath,
  getSlotCount,
  defineGPTSlot,
  requestAd,
  enableServices,
  injectOOPContainers,
  createLazyObserver,
  // Getters
  getDefinedSlots,
  getConfig,
  getLazyloadConfig,
  getSlotCounts,
  getPPID,
  // Slot registry
  getSlotData,
  getAllSlotData,
  updateSlotData,
  // Processing
  processSlots,
  // Slot lifecycle
  refreshSlot,
  refreshSlots,
  destroySlot,
  destroySlots,
  // Slot targeting
  setSlotTargeting,
  setSlotTargetingBulk,
  getSlotTargeting,
  clearSlotTargeting,
  resetSlotCounts,
  reset,
  // Observer management
  disconnectObservers,
  getActiveObservers,
  // SRA Batching
  isSraBatchingEnabled
};
