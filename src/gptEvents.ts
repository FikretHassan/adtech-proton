/**
 * GPT Events Module
 * Handles GPT event listeners for slot lifecycle, metrics, and UI updates
 */

import config from '../config/gptEvents.json';
import CONFIG from '../config/loader.js';

// Logging prefix
const LOG_PREFIX = '[GPTEvents]';

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

// Metrics storage per slot
const slotMetrics: Record<string, any> = {};

// Track first ad requested
let firstAdRequested = false;

// Track first ad rendered
let firstAdRendered = false;

// Timer function (can be overridden)
let getTimestamp = () => performance.now();

// PubSub reference (set via init)
let pubsub: any = null;

/**
 * Initialize metrics object for a slot
 * @param {string} slotId - Slot ID
 */
function initSlotMetrics(slotId: string) {
  if (!config.metrics.enabled) return;

  slotMetrics[slotId] = {
    slotRequested: null,
    slotResponseReceived: null,
    slotOnload: null,
    slotRenderEnded: null,
    impressionViewable: null,
    // Targeting snapshot at request time
    targetingMap: null,
    // GAM response data
    advertiserId: null,
    campaignId: null,
    lineItemId: null,
    creativeId: null,
    isEmpty: null,
    isBackfill: null,
    size: null,
    sizeW: null,
    sizeH: null,
    googleQueryId: null,
    // Viewability
    inViewPercentage: null,
    isViewable: false,
    isViewableAchieved: false,
    isViewableTimeFirst: 0,
    isViewableTimeStart: 0,
    isViewableTimeEnd: 0,
    isViewableTimeInView: 0,
    // Latency calculations
    latency_slotResponseReceived: null,
    latency_slotOnload: null,
    latency_slotRenderEnded: null,
    latency_impressionViewable: null
  };
}

/**
 * Get metrics for a slot
 * @param {string} slotId - Slot ID
 * @returns {Object|null} Slot metrics or null
 */
export function getSlotMetrics(slotId: string) {
  return slotMetrics[slotId] || null;
}

/**
 * Get all slot metrics
 * @returns {Object} All slot metrics
 */
export function getAllMetrics() {
  return { ...slotMetrics };
}

/**
 * Publish a PubSub event if available
 * @param {string} topic - Topic template with {slotId} placeholder
 * @param {string} slotId - Slot ID to substitute
 * @param {Object} data - Optional data to include
 */
function publish(topic: string, slotId: string, data: Record<string, unknown> = {}): void {
  if (!pubsub) return;

  const resolvedTopic = topic.replace('{slotId}', slotId);
  pubsub.publish({
    topic: resolvedTopic,
    data: { slotId, ...data }
  });
}

/**
 * Handle slotRequested event
 * @param {Object} event - GPT event
 */
function handleSlotRequested(event: any) {
  const timestamp = getTimestamp();
  const slotId = event.slot.getSlotElementId();

  initSlotMetrics(slotId);

  if (slotMetrics[slotId]) {
    slotMetrics[slotId].slotRequested = timestamp;
    // Capture targeting snapshot at request time
    try {
      slotMetrics[slotId].targetingMap = event.slot.getTargetingMap();
    } catch (e) {
      // getTargetingMap may not be available
    }
  }

  // Publish slot requested event
  if (config.pubsub.slotRequested) {
    publish(config.pubsub.slotRequested, slotId, { timestamp });
  }

  // Track first ad requested
  if (!firstAdRequested) {
    firstAdRequested = true;
    if (config.pubsub.firstAdRequested && pubsub) {
      pubsub.publish({
        topic: config.pubsub.firstAdRequested,
        data: { slotId, timestamp }
      });
    }
    log(`First ad requested: ${slotId}`);
  }

  log(`slotRequested: ${slotId}`);
}

/**
 * Handle slotResponseReceived event
 * @param {Object} event - GPT event
 */
function handleSlotResponseReceived(event: any) {
  const timestamp = getTimestamp();
  const slotId = event.slot.getSlotElementId();

  if (slotMetrics[slotId]) {
    slotMetrics[slotId].slotResponseReceived = timestamp;
    // Calculate latency from request
    if (slotMetrics[slotId].slotRequested) {
      slotMetrics[slotId].latency_slotResponseReceived = timestamp - slotMetrics[slotId].slotRequested;
    }
  }

  // Publish slot response received event
  if (config.pubsub.slotResponseReceived) {
    publish(config.pubsub.slotResponseReceived, slotId, { timestamp });
  }

  log(`slotResponseReceived: ${slotId}`);
}

/**
 * Handle slotOnload event
 * @param {Object} event - GPT event
 */
function handleSlotOnload(event: any) {
  const timestamp = getTimestamp();
  const slotId = event.slot.getSlotElementId();

  if (slotMetrics[slotId]) {
    slotMetrics[slotId].slotOnload = timestamp;
    // Calculate latency from request
    if (slotMetrics[slotId].slotRequested) {
      slotMetrics[slotId].latency_slotOnload = timestamp - slotMetrics[slotId].slotRequested;
    }
  }

  log(`slotOnload: ${slotId}`);
}

/**
 * Handle slotRenderEnded event - main handler for opacity, classes, metrics
 * @param {Object} event - GPT event
 */
function handleSlotRenderEnded(event: any) {
  const timestamp = getTimestamp();
  const slotId = event.slot.getSlotElementId();
  const adSlot = document.getElementById(slotId);

  if (!adSlot) {
    warn(`slotRenderEnded: element not found: ${slotId}`);
    return;
  }

  // Execute slot.beforeRender hooks
  const hooks = getHooks();
  if (hooks) {
    hooks.executeSync('slot.beforeRender', slotId, event);
  }

  // Update metrics
  if (slotMetrics[slotId]) {
    slotMetrics[slotId].slotRenderEnded = timestamp;
    slotMetrics[slotId].advertiserId = event.advertiserId;
    slotMetrics[slotId].campaignId = event.campaignId;
    slotMetrics[slotId].lineItemId = event.lineItemId;
    slotMetrics[slotId].creativeId = event.creativeId;
    slotMetrics[slotId].isEmpty = event.isEmpty;
    slotMetrics[slotId].isBackfill = event.isBackfill;
    slotMetrics[slotId].size = event.size;

    if (event.size) {
      slotMetrics[slotId].sizeW = event.size[0];
      slotMetrics[slotId].sizeH = event.size[1];
    }

    // Capture Google Query ID
    try {
      slotMetrics[slotId].googleQueryId = event.slot.getEscapedQemQueryId();
    } catch (e) {
      // getEscapedQemQueryId may not be available
    }

    // Calculate latency
    if (slotMetrics[slotId].slotRequested) {
      slotMetrics[slotId].latency_slotRenderEnded = timestamp - slotMetrics[slotId].slotRequested;
    }
  }

  if (!event.isEmpty) {
    // Slot filled - show it
    adSlot.classList.add(config.classes.loaded);
    adSlot.classList.remove(config.classes.empty);
    adSlot.style.opacity = String(config.opacity.filled);

    // Set height from ad size
    if (event.size && event.size[1]) {
      adSlot.style.height = event.size[1] + 'px';
    }

    // Publish slot rendered event
    if (config.pubsub.slotRendered) {
      publish(config.pubsub.slotRendered, slotId, {
        size: event.size,
        advertiserId: event.advertiserId
      });
    }

    // Track first ad rendered
    if (!firstAdRendered) {
      firstAdRendered = true;
      if (config.pubsub.firstAdRendered && pubsub) {
        pubsub.publish({
          topic: config.pubsub.firstAdRendered,
          data: { slotId, timestamp }
        });
      }
      log(`First ad rendered: ${slotId}`);
    }

    // Execute slot.afterRender hooks
    if (hooks) {
      hooks.executeSync('slot.afterRender', slotId, event, {
        advertiserId: event.advertiserId,
        campaignId: event.campaignId,
        lineItemId: event.lineItemId,
        creativeId: event.creativeId,
        size: event.size
      });
    }

    const sizeLabel = Array.isArray(event.size) ? `${event.size[0]}x${event.size[1]}` : 'unknown';
    log(`slotRenderEnded: ${slotId} FILLED ${sizeLabel}`, {
      advertiserId: event.advertiserId,
      lineItemId: event.lineItemId
    });
  } else {
    // Slot empty - hide it
    adSlot.classList.add(config.classes.empty);
    adSlot.classList.remove(config.classes.loaded);
    adSlot.style.opacity = String(config.opacity.empty);

    if (config.emptySlots.collapse) {
      adSlot.style.height = '0';
    }

    // Hide container if configured
    if (config.emptySlots.hideContainer) {
      const containerId = slotId + config.emptySlots.containerSuffix;
      const container = document.getElementById(containerId);
      if (container) {
        container.style.display = 'none';
      }
    }

    // Execute slot.onEmpty hooks
    if (hooks) {
      hooks.executeSync('slot.onEmpty', slotId, event);
    }

    // Publish slot empty event
    if (config.pubsub.slotEmpty) {
      publish(config.pubsub.slotEmpty, slotId);
    }

    log(`slotRenderEnded: ${slotId} EMPTY`);
  }
}

/**
 * Handle slotVisibilityChanged event
 * Tracks viewability time: starts timer when >= 50%, stops when < 50%
 * @param {Object} event - GPT event
 */
function handleSlotVisibilityChanged(event: any) {
  const timestamp = getTimestamp();
  const slotId = event.slot.getSlotElementId();

  if (!slotMetrics[slotId]) return;

  slotMetrics[slotId].inViewPercentage = event.inViewPercentage;

  // Track viewability time based on 50% threshold
  if (event.inViewPercentage < 50) {
    // Dropped below 50% - stop counting if we were counting
    if (slotMetrics[slotId].isViewable === true) {
      slotMetrics[slotId].isViewable = false;
      slotMetrics[slotId].isViewableTimeEnd = timestamp;
      // Add elapsed time to cumulative total
      const elapsed = slotMetrics[slotId].isViewableTimeEnd - slotMetrics[slotId].isViewableTimeStart;
      slotMetrics[slotId].isViewableTimeInView += elapsed;
    }
  } else {
    // At or above 50% - start counting if not already
    if (slotMetrics[slotId].isViewable === false) {
      slotMetrics[slotId].isViewable = true;
      slotMetrics[slotId].isViewableAchieved = true;
      slotMetrics[slotId].isViewableTimeEnd = 0; // Reset end time
      slotMetrics[slotId].isViewableTimeStart = timestamp;
      // Track first time viewable
      if (slotMetrics[slotId].isViewableTimeFirst === 0) {
        slotMetrics[slotId].isViewableTimeFirst = timestamp;
      }
      // Calculate latency to viewable if not already set
      if (slotMetrics[slotId].latency_impressionViewable === null && slotMetrics[slotId].slotRequested) {
        slotMetrics[slotId].latency_impressionViewable = timestamp - slotMetrics[slotId].slotRequested;
      }
    }
  }
}

/**
 * Handle impressionViewable event
 * Fired when IAB viewability threshold is met (50% visible for 1 second)
 * @param {Object} event - GPT event
 */
function handleImpressionViewable(event: any) {
  const timestamp = getTimestamp();
  const slotId = event.slot.getSlotElementId();

  if (slotMetrics[slotId]) {
    slotMetrics[slotId].impressionViewable = timestamp;
    slotMetrics[slotId].isViewable = true;
    slotMetrics[slotId].isViewableAchieved = true;

    // Set viewability time tracking if not already set
    if (slotMetrics[slotId].isViewableTimeFirst === 0) {
      slotMetrics[slotId].isViewableTimeFirst = timestamp;
      slotMetrics[slotId].isViewableTimeStart = timestamp;
    }

    // Calculate latency from request to viewable
    if (slotMetrics[slotId].slotRequested) {
      slotMetrics[slotId].latency_impressionViewable = timestamp - slotMetrics[slotId].slotRequested;
    }
  }

  log(`impressionViewable: ${slotId}`, {
    latency: slotMetrics[slotId]?.latency_impressionViewable
  });
}

/**
 * Register all GPT event listeners
 * Must be called after googletag is available
 */
export function registerEventListeners() {
  if (!window.googletag || !window.googletag.cmd) {
    warn('registerEventListeners: googletag not available');
    return false;
  }

  window.googletag.cmd.push(() => {
    const pubads = window.googletag.pubads();

    pubads.addEventListener('slotRequested', handleSlotRequested);
    pubads.addEventListener('slotResponseReceived', handleSlotResponseReceived);
    pubads.addEventListener('slotOnload', handleSlotOnload);
    pubads.addEventListener('slotRenderEnded', handleSlotRenderEnded);
    pubads.addEventListener('slotVisibilityChanged', handleSlotVisibilityChanged);
    pubads.addEventListener('impressionViewable', handleImpressionViewable);

    log('Event listeners registered (6 handlers)');
  });

  return true;
}

/**
 * Initialize the GPT events module
 * @param {Object} options - Init options
 * @param {Object} options.pubsub - PubSub instance for publishing events
 * @param {Function} options.getTimestamp - Custom timestamp function
 * @returns {Object} Module state
 */
interface GptEventsInitOptions {
  pubsub?: any;
  getTimestamp?: () => number;
}

export function init(options: GptEventsInitOptions = {}) {
  if (state.initialized) return getState();

  if (options.pubsub) {
    pubsub = options.pubsub;
  }

  if (options.getTimestamp) {
    getTimestamp = options.getTimestamp;
  }

  registerEventListeners();

  state.initialized = true;
  log('Initialized', { hasPubsub: !!pubsub });

  // Emit ready event
  const ps = window[CONFIG.pubsubGlobal];
  if (ps?.publish) {
    ps.publish({ topic: 'loader.gptEvents.ready', data: getState() });
    log('Published loader.gptEvents.ready');
  }

  return getState();
}

/**
 * Get module state
 * @returns {Object} Copy of module state
 */
export function getState() {
  return { ...state, metricsCount: Object.keys(slotMetrics).length };
}

/**
 * Get config
 * @returns {Object} GPT events configuration
 */
export function getConfig() {
  return config;
}

/**
 * Check if first ad has been requested
 * @returns {boolean}
 */
export function hasFirstAdRequested() {
  return firstAdRequested;
}

/**
 * Check if first ad has rendered
 * @returns {boolean}
 */
export function hasFirstAdRendered() {
  return firstAdRendered;
}

/**
 * Reset state (for testing or SPA navigation)
 */
export function reset() {
  Object.keys(slotMetrics).forEach(key => delete slotMetrics[key]);
  firstAdRequested = false;
  firstAdRendered = false;
  pubsub = null;
  getTimestamp = () => performance.now();
  state.initialized = false;
}

// Default export with all functions
export default {
  init,
  getState,
  registerEventListeners,
  getSlotMetrics,
  getAllMetrics,
  getConfig,
  hasFirstAdRequested,
  hasFirstAdRendered,
  reset
};
