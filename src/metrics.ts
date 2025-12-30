/**
 * Metrics Module
 * Centralized metrics tracking for page lifecycle, pubsub events, and ad performance
 */

import { timer } from './timer';
import CONFIG from '../config/loader.js';

// Logging prefix
const LOG_PREFIX = '[Metrics]';

/**
 * Get the loader instance from the global object
 */
function getLoader() {
  return (window as any)[CONFIG.globalName];
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

// Module state
const state = {
  initialized: false
};

// AdStack: page lifecycle and loader milestone timestamps
const adStack: Record<string, number> = {};

// Events: pubsub topic timestamps
const events: Record<string, number> = {};

// PubSub reference
let pubsub: any = null;

// Topics to auto-track (will be prefixed with pubsub_)
const autoTrackTopics = [
  'loader.core.ready',
  'loader.ads.create',
  'loader.ads.requested',
  'loader.ads.priorityRequested',
  'loader.ads.priorityComplete',
  'loader.gptEvents.ready',
  'loader.partners.ready'
];

/**
 * Track a milestone in adStack
 * @param {string} key - Milestone name
 * @param {number} [timestamp] - Optional timestamp (defaults to timer())
 */
export function trackAdStack(key: string, timestamp?: number): void {
  adStack[key] = timestamp ?? timer();
}

/**
 * Track a pubsub event in events
 * @param {string} topic - Topic name
 * @param {number} [timestamp] - Optional timestamp (defaults to timer())
 */
export function trackEvent(topic: string, timestamp?: number): void {
  const key = `pubsub_${topic.replace(/\./g, '_')}`;
  events[key] = timestamp ?? timer();

  // Also add to adStack for unified timeline
  adStack[key] = events[key];
}

/**
 * Get adStack metrics
 * @returns {Object} Copy of adStack
 */
export function getAdStack(): Record<string, number> {
  return { ...adStack };
}

/**
 * Get events metrics
 * @returns {Object} Copy of events
 */
export function getEvents(): Record<string, number> {
  return { ...events };
}

/**
 * Get all metrics aggregated from all sources
 * @returns {Object} Complete metrics object
 */
export function getAll(): Record<string, any> {
  const loader = getLoader();

  // Get ads from gptEvents if available
  const gptEvents = loader?.gptEvents;
  const ads = gptEvents?.getAllMetrics?.() || {};

  // Get vendors from loader metrics
  const vendors = loader?.metrics?.vendors || {};

  return {
    ads,
    adStack: getAdStack(),
    events: getEvents(),
    vendors
  };
}

/**
 * Subscribe to pubsub topics and auto-track timestamps
 */
function setupAutoTracking(): void {
  if (!pubsub?.subscribe) return;

  autoTrackTopics.forEach(topic => {
    pubsub.subscribe({
      topic,
      func: () => {
        trackEvent(topic);
        log(`Auto-tracked: ${topic}`);
      },
      runIfAlreadyPublished: true
    });
  });

  log(`Auto-tracking ${autoTrackTopics.length} topics`);
}

/**
 * Track page lifecycle events
 */
function setupPageTracking(): void {
  // Track current readyState
  trackAdStack(`page_readyState_${document.readyState}`);

  // Track DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      trackAdStack('page_DOMContentLoaded');
      log('page_DOMContentLoaded');
    });
  } else {
    // Already past DOMContentLoaded
    trackAdStack('page_DOMContentLoaded');
  }

  // Track load
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      trackAdStack('page_load');
      trackAdStack('page_readyState_complete');
      log('page_load');
    });
  } else {
    // Already loaded
    trackAdStack('page_load');
    trackAdStack('page_readyState_complete');
  }
}

/**
 * Initialize the metrics module
 * @param {Object} options - Init options
 * @param {Object} options.pubsub - PubSub instance for subscribing to events
 * @returns {Object} Module state
 */
interface MetricsInitOptions {
  pubsub?: any;
}

export function init(options: MetricsInitOptions = {}): Record<string, any> {
  if (state.initialized) return getState();

  if (options.pubsub) {
    pubsub = options.pubsub;
  }

  // Track page lifecycle
  setupPageTracking();

  // Setup auto-tracking for pubsub events
  setupAutoTracking();

  state.initialized = true;
  log('Initialized');

  return getState();
}

/**
 * Get module state
 * @returns {Object} Copy of module state
 */
export function getState(): Record<string, any> {
  return {
    ...state,
    adStackCount: Object.keys(adStack).length,
    eventsCount: Object.keys(events).length
  };
}

/**
 * Reset metrics (for testing or SPA navigation)
 */
export function reset(): void {
  Object.keys(adStack).forEach(key => delete adStack[key]);
  Object.keys(events).forEach(key => delete events[key]);
}

// Default export
export default {
  init,
  getState,
  trackAdStack,
  trackEvent,
  getAdStack,
  getEvents,
  getAll,
  reset
};
