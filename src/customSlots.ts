/**
 * Custom Slots Module
 * Dimension-targeted ad slot creation with DOM selector-based positioning
 *
 * PubSub lifecycle events:
 * - customSlot.{id}.inject    - Slot injected into DOM
 * - customSlot.{id}.define    - GPT slot defined
 * - customSlot.{id}.ignore    - Targeting didn't match
 * - customSlot.{id}.inactive  - Slot disabled (active: false)
 * - customSlot.{id}.error     - Injection failed
 * - customSlot.{id}.complete  - Processing finished
 * - loader.customSlots.ready  - Module initialized
 */

import globalConfig from '../config/customSlots.json';
import slotConfigs from '../config/customSlots/index.js';
import { evaluateTargeting, matchesProperty } from './targeting';
import { getProperty } from './property';
import sizemapping from './sizemapping';
import slots from './slots';
import wrapperAuctions from './optional/wrapperAuctions';
import CONFIG from '../config/loader.js';
import { validateCustomSlotConfig, validateWithWarning } from './validation';
import { applyStyles, getLabelConfig, createLabelElement } from './utils/domStyles';

// Logging prefix
const LOG_PREFIX = '[CustomSlots]';

// State interface
interface CustomSlotsState {
  initialized: boolean;
  injectedSlots: string[];
  results: Record<string, any>;
}

// Module state
let state: CustomSlotsState = {
  initialized: false,
  injectedSlots: [],
  results: {}
};

/**
 * Get the loader instance from the global object
 */
function getLoader() {
  return window[CONFIG.globalName];
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
 * Warn helper
 */
function warn(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} WARN: ${message}`, data);
  }
}

/**
 * Publish PubSub event
 */
function publish(topic: string, data: unknown = {}): void {
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic, data });
    log(`Published: ${topic}`, data);
  }
}

/**
 * Get URL parameter overrides for custom slots
 * @returns {{ enable: string[], disable: string[] }}
 */
function getUrlOverrides() {
  if (typeof window === 'undefined') {
    return { enable: [], disable: [] };
  }

  const params = new URLSearchParams(window.location.search);
  const enable = (params.get('customSlotEnable') || '').split(',').filter(Boolean);
  const disable = (params.get('customSlotDisable') || '').split(',').filter(Boolean);

  return { enable, disable };
}

/**
 * Check if slot should be force-enabled/disabled via URL
 * @param {string} id - Slot ID
 * @returns {{ override: boolean, enabled: boolean }}
 */
function checkUrlOverride(id: any) {
  const { enable, disable } = getUrlOverrides();

  // Disable all except enabled
  if (disable.includes('all')) {
    if (enable.includes(id)) {
      return { override: true, enabled: true };
    }
    return { override: true, enabled: false };
  }

  // Explicit enable
  if (enable.includes(id)) {
    return { override: true, enabled: true };
  }

  // Explicit disable
  if (disable.includes(id)) {
    return { override: true, enabled: false };
  }

  return { override: false, enabled: true };
}

/**
 * Create the slot container element
 * Supports per-slot wrapperClass, wrapperStyle, adClass, adStyle, and label
 * @param {Object} slotConfig - Slot configuration
 * @returns {{ container: HTMLElement, slotId: string }}
 */
function createSlotElement(slotConfig: any) {
  const { id, adtype, injection } = slotConfig;
  const prefix = slots.getConfig().prefix || 'custom';
  const defaults = globalConfig.defaults;

  // Generate slot ID: advert_{prefix}_custom_{id}
  const slotId = `advert_${prefix}_custom_${id}`;

  // Create outer container
  const container = document.createElement('div');
  container.className = `${globalConfig.containerClass} ${injection.wrapperClass || defaults.wrapperClass}`.trim();
  container.id = `${slotId}_container`;

  // Apply wrapperStyle (inline styles)
  const wrapperStyle = injection.wrapperStyle || defaults.wrapperStyle;
  if (wrapperStyle) {
    applyStyles(container, wrapperStyle);
  }

  // Create label if configured (before ad div)
  const labelConfig = getLabelConfig(injection, defaults.label);
  if (labelConfig) {
    const labelElement = createLabelElement(labelConfig);
    container.appendChild(labelElement);
  }

  // Create inner ad div
  const adDiv = document.createElement('div');
  adDiv.className = `${globalConfig.adClass} advert--${adtype}`;
  adDiv.id = slotId;

  // Apply slot-specific adClass (additive)
  const adClass = injection.adClass || defaults.adClass;
  if (adClass) {
    adDiv.className += ` ${adClass}`;
  }

  // Apply slot-specific adStyle
  const adStyle = injection.adStyle || defaults.adStyle;
  if (adStyle) {
    applyStyles(adDiv, adStyle);
  }

  // Apply data attributes
  Object.entries(globalConfig.dataAttributes).forEach(([key, value]) => {
    adDiv.setAttribute(key, value);
  });
  adDiv.setAttribute('data-adtype', adtype);
  adDiv.setAttribute('data-ad-slot-id', slotId);
  adDiv.setAttribute('data-custom-slot', id);

  container.appendChild(adDiv);

  return { container, slotId, adDiv };
}

/**
 * Insert element relative to reference element
 * @param {HTMLElement} element - Element to insert
 * @param {HTMLElement} reference - Reference element
 * @param {string} position - Position: 'before' | 'after' | 'prepend' | 'append' | 'replace'
 */
function insertElement(element: any, reference: any, position: any) {
  switch (position) {
    case 'before':
      reference.parentNode?.insertBefore(element, reference);
      break;
    case 'after':
      reference.parentNode?.insertBefore(element, reference.nextSibling);
      break;
    case 'prepend':
      reference.insertBefore(element, reference.firstChild);
      break;
    case 'append':
      reference.appendChild(element);
      break;
    case 'replace':
      reference.parentNode?.replaceChild(element, reference);
      break;
    default:
      warn(`Unknown position: ${position}, defaulting to 'after'`);
      reference.parentNode?.insertBefore(element, reference.nextSibling);
  }
}

/**
 * Get sizes for a custom slot
 * Uses slot's sizemapping if provided, otherwise falls back to adtype default
 * @param {Object} slotConfig - Slot configuration
 * @param {string} breakpoint - Current breakpoint
 * @returns {Array} Array of sizes
 */
function getSizesForSlot(slotConfig: any, breakpoint: string) {
  const { sizemapping: slotSizemapping, adtype } = slotConfig;

  // If slot has custom sizemapping, use it
  if (slotSizemapping && slotSizemapping[breakpoint]) {
    const sizes = slotSizemapping[breakpoint];
    // Normalize sizes - convert string 'fluid' to actual format
    return sizes.map((size: any) => {
      if (size === 'fluid') return 'fluid';
      if (Array.isArray(size)) return size;
      return size;
    });
  }

  // Fall back to default sizemapping for adtype
  return sizemapping.getSizes(adtype, breakpoint);
}

/**
 * Initialize the custom slots module
 * @returns {Object} Module state
 */
export function init() {
  if (state.initialized) return getState();

  if (!globalConfig.enabled) {
    log('Custom slots disabled in config');
    return getState();
  }

  state.initialized = true;

  log('Initialized', { slotCount: slotConfigs.length });

  // Emit ready event
  publish('loader.customSlots.ready', {
    enabled: globalConfig.enabled,
    slots: slotConfigs.map((s: any) => s.id)
  });

  return getState();
}

/**
 * Inject a single slot into the DOM
 * @param {Object} slotConfig - Slot configuration
 * @param {Object} context - Page context for targeting
 * @param {Object} dimensionConfig - Dimension match type configuration
 * @param {number} configIndex - Index of this config in slotConfigs array
 * @returns {Object} Result { id, status, reason?, slotId? }
 */
function injectSlot(slotConfig: any, context: any, dimensionConfig: any, configIndex: number) {
  const { id, active, include, exclude, injection, properties } = slotConfig;
  const eventPrefix = globalConfig.eventPrefix || 'customSlot';

  // Validate config
  const isValid = validateWithWarning(
    () => validateCustomSlotConfig(slotConfig),
    (msg) => warn(msg)
  );
  if (!isValid) {
    publish(`${eventPrefix}.${id || 'unknown'}.error`, { id, error: 'Invalid config' });
    return { id: id || 'unknown', status: 'error', reason: 'Invalid slot configuration' };
  }

  // Check URL override
  const urlOverride = checkUrlOverride(id);
  if (urlOverride.override && !urlOverride.enabled) {
    return { id, status: 'inactive', reason: 'URL override disabled' };
  }

  // Check if active (unless force enabled via URL)
  if (active === false && !urlOverride.override) {
    return { id, status: 'inactive', reason: 'Slot disabled (active: false)' };
  }

  // Check property targeting
  const currentProperty = getProperty();
  if (!matchesProperty(properties, currentProperty)) {
    return { id, status: 'ignore', reason: `Property mismatch (property: ${currentProperty})` };
  }

  // Evaluate targeting (uses include.special/exclude.special for custom functions)
  // Skip if force enabled via URL override
  if (!urlOverride.override) {
    const targetingResult = evaluateTargeting(
      include || {},
      exclude || {},
      context,
      dimensionConfig
    );

    if (!targetingResult.matched) {
      return { id, status: 'ignore', reason: targetingResult.reason };
    }
  }

  // Find DOM element using selector and poscount
  const { selector, poscount = 0, position = 'after' } = injection;

  let elements;
  try {
    elements = document.querySelectorAll(selector);
  } catch (e) {
    return { id, status: 'error', reason: `Invalid selector: ${selector}` };
  }

  const targetElement = elements[poscount];
  if (!targetElement) {
    return { id, status: 'error', reason: `Selector not found: ${selector} (poscount: ${poscount}, found: ${elements.length})` };
  }

  // Create and inject the slot element
  const { container, slotId, adDiv } = createSlotElement(slotConfig);

  // Store config index for later retrieval during processing
  adDiv.setAttribute('data-config-index', String(configIndex));

  insertElement(container, targetElement, position);

  state.injectedSlots.push(slotId);

  log(`Injected: ${slotId}`, { selector, poscount, position });

  publish(`${eventPrefix}.${id}.inject`, { id, slotId, selector, position });

  return { id, status: 'injected', slotId, selector, position };
}

/**
 * Inject all custom slots that match current context
 * @param {Object} context - Page context from loader.getContext()
 * @param {Object} dimensionConfig - Dimension match type configuration
 * @returns {Array} Results for each slot config
 */
export function inject(context = {}, dimensionConfig = {}) {
  if (!state.initialized) {
    init();
  }

  if (!globalConfig.enabled) {
    warn('Custom slots disabled, skipping injection');
    return [];
  }

  log('Injecting custom slots', { context, configCount: slotConfigs.length });

  const results: Array<{ id: any; status: string; reason?: string; slotId?: string; selector?: any; position?: any }> = [];

  slotConfigs.forEach((slotConfig: any, configIndex: number) => {
    try {
      const result = injectSlot(slotConfig, context, dimensionConfig, configIndex);
      results.push(result);
      state.results[`${slotConfig.id}_${results.length}`] = result;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errorResult = { id: slotConfig.id, status: 'error', reason: `Exception: ${errMsg}` };
      results.push(errorResult);
      state.results[`${slotConfig.id}_${results.length}`] = errorResult;
      warn(`Failed to inject slot ${slotConfig.id}: ${errMsg}`);
    }
  });

  const injected = results.filter(r => r.status === 'injected');
  const ignored = results.filter(r => r.status === 'ignore');
  const inactive = results.filter(r => r.status === 'inactive');
  const errors = results.filter(r => r.status === 'error');

  log('Injection complete', {
    total: results.length,
    injected: injected.length,
    ignored: ignored.length,
    inactive: inactive.length,
    errors: errors.length
  });

  // Emit summary event
  publish('loader.customSlots.injected', {
    total: results.length,
    injected: injected.map(r => r.slotId),
    ignored: ignored.length,
    inactive: inactive.length,
    errors: errors.length
  });

  return results;
}

/**
 * Define GPT slots and set up lazy loading for injected custom slots
 * Uses lazyload.json config rules to determine lazy loading eligibility
 * @param {Object} context - Page context { site, zone }
 * @param {Object} options - Options for slot definition
 * @param {boolean} options.enableLazy - Enable lazy loading (default: true)
 * @returns {Object} Results { processed, slots, lazy, immediate }
 */
export function processInjectedSlots(context: Record<string, any> = {}, options: Record<string, any> = {}) {
  log('processInjectedSlots() called');

  const { enableLazy = true } = options;
  const injectedSlots = state.injectedSlots;

  if (injectedSlots.length === 0) {
    warn('No injected slots to process');
    return { processed: 0, slots: [], lazy: 0, immediate: 0 };
  }

  const results: { processed: number; slots: string[]; lazy: number; immediate: number } = {
    processed: 0,
    slots: [],
    lazy: 0,
    immediate: 0
  };
  const adUnitPath = slots.buildAdUnitPath(context);
  const breakpoint = sizemapping.getBreakpoint();
  const eventPrefix = globalConfig.eventPrefix || 'customSlot';

  // Create lazy observer using slots module helper (respects lazyload.json config)
  // Returns null if IntersectionObserver is not supported
  const lazyObserver = slots.createLazyObserver((element: HTMLElement) => {
    const slotId = element.id;
    lazyObserver?.unobserve(element);
    slots.requestAd(slotId);
    slots.markLoaded(element);
    log(`Lazy loaded custom slot: ${slotId}`);
  }, breakpoint);

  // Track slots that need lazy vs immediate loading
  const slotsToProcess: Array<{ element: HTMLElement; slotId: string; adType: string; isLazy: boolean }> = [];

  // First pass: define all GPT slots
  injectedSlots.forEach((slotId) => {
    const element = document.getElementById(slotId);
    if (!element) {
      warn(`Element not found for slot: ${slotId}`);
      return;
    }

    // Extract custom slot ID and config index from data attributes
    const customSlotId = element.getAttribute('data-custom-slot');
    const configIndexStr = element.getAttribute('data-config-index');
    const configIndex = configIndexStr !== null ? parseInt(configIndexStr, 10) : -1;

    // Get the exact config that was used during injection (by index)
    const slotConfig = configIndex >= 0 && configIndex < slotConfigs.length
      ? slotConfigs[configIndex]
      : slotConfigs.find((c: any) => c.id === customSlotId);

    if (!slotConfig) {
      warn(`Config not found for custom slot: ${customSlotId}`);
      return;
    }

    const { adtype, targeting: customTargeting, sizemapping: customSizemapping } = slotConfig;
    const sizes = getSizesForSlot(slotConfig, breakpoint);

    // Merge custom targeting with any options targeting
    const combinedTargeting = {
      ...options.targeting,
      ...customTargeting
    };

    log(`Defining GPT slot: ${slotId}`, { adtype, sizes, targeting: combinedTargeting });

    // Define the GPT slot with custom sizemapping for responsive ads
    slots.defineGPTSlot({
      slotId,
      adType: adtype,
      adUnitPath,
      sizes,
      targeting: combinedTargeting,
      customSizemapping: customSizemapping || null
    });

    publish(`${eventPrefix}.${customSlotId}.define`, { id: customSlotId, slotId });

    // Check lazy load eligibility using lazyload.json config rules
    const isLazy = enableLazy && slots.shouldLazyLoad(adtype, slotId, breakpoint, context);

    results.processed++;
    results.slots.push(slotId);
    slotsToProcess.push({ element, slotId, adType: adtype, isLazy });
  });

  // Enable services if we processed any slots
  if (results.processed > 0) {
    slots.enableServices();

    // Second pass: set up lazy loading or request immediately based on config
    slotsToProcess.forEach(({ element, slotId, isLazy }) => {
      // Fall back to immediate if observer not available (no IntersectionObserver support)
      if (isLazy && lazyObserver) {
        lazyObserver.observe(element);
        slots.getActiveObservers().set(slotId, lazyObserver);
        results.lazy++;
        log(`Observing custom slot for lazy load: ${slotId}`);
      } else {
        slots.requestAd(slotId);
        slots.markLoaded(element);
        results.immediate++;
        log(`Requested custom slot immediately: ${slotId}`);
      }
    });

    publish('loader.customSlots.processed', {
      processed: results.processed,
      slots: results.slots,
      lazy: results.lazy,
      immediate: results.immediate
    });
  }

  log(`Processed ${results.processed} custom slots (${results.lazy} lazy, ${results.immediate} immediate)`);
  return results;
}

/**
 * Check if a custom slot was injected
 * @param {string} id - Custom slot ID
 * @returns {boolean}
 */
export function wasInjected(id: string) {
  return state.injectedSlots.some(slotId => slotId.includes(`_${id}_`));
}

/**
 * Get injected slot IDs
 * @returns {Array} Array of slot IDs
 */
export function getInjectedSlots() {
  return [...state.injectedSlots];
}

/**
 * Get result for a specific slot
 * @param {string} id - Custom slot ID
 * @returns {Object|null}
 */
export function getResult(id: string) {
  const key = Object.keys(state.results).find(k => k.startsWith(id));
  return key ? state.results[key] : null;
}

/**
 * Get all results
 * @returns {Object}
 */
export function getResults() {
  return { ...state.results };
}

/**
 * Get current module state
 * @returns {Object}
 */
export function getState() {
  return {
    initialized: state.initialized,
    enabled: globalConfig.enabled,
    injectedSlots: [...state.injectedSlots],
    results: { ...state.results }
  };
}

/**
 * Get config
 * @returns {Object}
 */
export function getConfig() {
  return globalConfig;
}

/**
 * Get all slot configs
 * @returns {Array}
 */
export function getSlotConfigs() {
  return slotConfigs;
}

/**
 * Remove all injected custom slot containers
 */
export function removeInjectedSlots() {
  log('removeInjectedSlots() called');

  state.injectedSlots.forEach(slotId => {
    const container = document.getElementById(`${slotId}_container`);
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      log(`Removed: ${slotId}`);
    }
  });

  log(`Removed ${state.injectedSlots.length} custom slots`);
  state.injectedSlots = [];
}

/**
 * Reset module state
 */
export function reset() {
  log('reset() called');
  removeInjectedSlots();
  state = {
    initialized: false,
    injectedSlots: [],
    results: {}
  };
  log('Reset complete');
}

/**
 * Debug helper
 */
export function debug() {
  log('Debug - State', state);
  log('Debug - Config', globalConfig);
  log('Debug - Slot configs', slotConfigs);
  return { state: { ...state }, config: globalConfig, slots: slotConfigs };
}

export default {
  init,
  inject,
  processInjectedSlots,
  wasInjected,
  getInjectedSlots,
  getResult,
  getResults,
  getState,
  getConfig,
  getSlotConfigs,
  removeInjectedSlots,
  reset,
  debug
};
