/**
 * Ad Refresh Module
 * Handles timer-based ad refresh with visibility and user activity checks
 */

import config from '../config/refresh.json';
import slots from './slots';
import sizemapping from './sizemapping';
import wrapperAuctions from './optional/wrapperAuctions';
import hooks from './hooks';
import CONFIG from '../config/loader.js';
import { TIMEOUTS, INTERVALS } from './constants';
import { evaluateTargeting, matchesProperty } from './targeting';
import { getProperty } from './property';
import { dimensions as generatedDimensions, dimensionConfig as generatedDimensionConfig } from './generated/dimensions.js';

// Logging prefix
const LOG_PREFIX = '[AdRefresh]';

// Type definitions
interface RefreshTimer {
  slotId: string;
  adType: string;
  pagetype: string;
  viewport: string;
  duration: number;
  currentCount: number;
  refreshCycle: number;
  adcount: number;
  refreshing: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  isSlotVisible: boolean;
}

interface RefreshInitOptions {
  pagetype?: string;
}

interface ScheduleRefreshOptions {
  adType?: string;
  pagetype?: string;
  viewport?: string;
}

interface ActivityHandlers {
  [key: string]: (event: Event) => void;
}

/**
 * Get the loader instance from the global object
 */
function getLoader(): ProtonInstance | undefined {
  return window[CONFIG.globalName] as ProtonInstance | undefined;
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

// State
const state = {
  initialized: false,
  isTabVisible: true,
  pagetype: 'default',
  activityListenersAdded: false
};

// Refresh timers per slot
const refreshTimers: Record<string, RefreshTimer> = {};

// Slot visibility observers per slot
const slotObservers: Record<string, IntersectionObserver> = {};

// Activity event handlers (stored for cleanup)
let activityHandlers: ActivityHandlers | null = null;

/**
 * Initialize the refresh module
 * @param {Object} options - Init options
 * @param {string} options.pagetype - Current page type for rule matching
 * @returns {Object} Module state
 */
export function init(options: RefreshInitOptions = {}) {
  if (state.initialized) return getModuleState();

  state.pagetype = options.pagetype || 'default';

  // Set up visibility detection
  setupVisibilityListeners();

  state.initialized = true;
  log('Initialized', { pagetype: state.pagetype });

  // Emit ready event
  const pubsub = window[CONFIG.pubsubGlobal] as PubSubInstance | undefined;
  if (pubsub?.publish) {
    pubsub.publish({ topic: 'loader.adRefresh.ready', data: getModuleState() });
    log('Published loader.adRefresh.ready');
  }

  return getModuleState();
}

/**
 * Get module state (overall state, not per-slot)
 * @returns {Object} Module state
 */
export function getModuleState() {
  return { ...state, activeTimers: Object.keys(refreshTimers).length };
}

/**
 * Set up tab visibility listeners
 */
function setupVisibilityListeners() {
  window.addEventListener('focus', () => {
    state.isTabVisible = true;
    log('Tab visible');
  });

  window.addEventListener('blur', () => {
    state.isTabVisible = false;
    log('Tab hidden');
  });

  // Also use document.hidden for more accurate detection
  document.addEventListener('visibilitychange', () => {
    state.isTabVisible = !document.hidden;
    log(`Visibility changed: ${state.isTabVisible}`);
  });
}

/**
 * Set up user activity listeners for a slot
 * Activity triggers refresh when countdown reaches 0
 * @param {string} slotId - Slot ID
 */
function setupActivityListeners(slotId: string): void {
  if (activityHandlers) return; // Already set up

  const handleActivity = (event: Event): void => {
    // Don't trigger refresh on click events (can inflate delivery)
    if (event.type === 'click') return;

    // Check all timers for slots ready to refresh
    Object.keys(refreshTimers).forEach(id => {
      const timer = refreshTimers[id];
      if (timer && timer.currentCount === 0 && !timer.refreshing) {
        triggerRefresh(id);
      }
    });
  };

  activityHandlers = {
    scroll: handleActivity,
    mousemove: handleActivity,
    keydown: handleActivity,
    touchstart: handleActivity,
    resize: handleActivity
  };

  // Add listeners
  Object.entries(activityHandlers).forEach(([event, handler]) => {
    const options = event === 'scroll' || event === 'touchstart' ? { passive: true } : undefined;
    document.addEventListener(event, handler as EventListener, options);
  });

  state.activityListenersAdded = true;
  log('Activity listeners added');
}

/**
 * Remove activity listeners
 */
function removeActivityListeners(): void {
  if (!activityHandlers) return;

  Object.entries(activityHandlers).forEach(([event, handler]) => {
    document.removeEventListener(event, handler as EventListener);
  });

  activityHandlers = null;
  state.activityListenersAdded = false;
  log('Activity listeners removed');
}

/**
 * Set up IntersectionObserver for slot visibility tracking
 * @param {string} slotId - Slot ID to observe
 * @param {number} configuredThreshold - Visibility threshold from rule (0.5 to 1.0)
 */
function setupSlotVisibilityObserver(slotId: string, configuredThreshold: number = 0.5): void {
  // Clean up existing observer if any
  if (slotObservers[slotId]) {
    slotObservers[slotId].disconnect();
    delete slotObservers[slotId];
  }

  const element = document.getElementById(slotId);
  if (!element) {
    log(`setupSlotVisibilityObserver: element not found for ${slotId}`);
    return;
  }

  // Clamp threshold (default 0.5, min 0.5, max 1.0)
  const threshold = Math.min(1.0, Math.max(0.5, configuredThreshold));

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        const timer = refreshTimers[slotId];
        if (timer) {
          const wasVisible = timer.isSlotVisible;
          timer.isSlotVisible = entry.isIntersecting;

          // Only log on change
          if (wasVisible !== timer.isSlotVisible) {
            log(`Slot ${slotId} visibility: ${timer.isSlotVisible}`);
          }
        }
      });
    },
    {
      threshold
    }
  );

  observer.observe(element);
  slotObservers[slotId] = observer;
  log(`setupSlotVisibilityObserver: observing ${slotId}`);
}

/**
 * Remove slot visibility observer
 * @param {string} slotId - Slot ID
 */
function removeSlotVisibilityObserver(slotId: string): void {
  if (slotObservers[slotId]) {
    slotObservers[slotId].disconnect();
    delete slotObservers[slotId];
    log(`removeSlotVisibilityObserver: stopped observing ${slotId}`);
  }
}

interface RefreshRule {
  properties?: string[];
  include?: Record<string, string[]>;
  exclude?: Record<string, string[]>;
  adType?: string;
  slotIds?: string[];
  refreshRate?: number;
  refreshCycle?: number;
  slotVisibleThreshold?: number;
}

interface RefreshConfigJson {
  enabled: boolean;
  rules?: RefreshRule[];
  defaults: {
    refreshRate: number;
    refreshCycle: number;
  };
  requireUserActivity?: boolean;
  pauseOnHidden?: boolean;
  fadeOutDuration?: number;
}

const typedConfig = config as RefreshConfigJson;

/**
 * Build context from current dimension values
 */
function buildContext(): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key, fn] of Object.entries(generatedDimensions)) {
    if (typeof fn === 'function') {
      context[key] = String(fn());
    }
  }
  return context;
}

/**
 * Get refresh config that matches current dimensions and property
 * Uses evaluateTargeting for proper dimension matching
 * @returns {Object|null} Matching rule or null (first match, ignoring adType/slotIds)
 */
export function getRefreshConfig(): RefreshRule | null {
  if (!typedConfig.enabled) return null;

  const rules = typedConfig.rules;
  if (!rules || !Array.isArray(rules)) return null;

  const context = buildContext();
  const currentProperty = getProperty();

  // Find first matching rule using dimension evaluation
  for (const rule of rules) {
    // Check property targeting first
    if (!matchesProperty(rule.properties, currentProperty)) {
      continue;
    }

    const result = evaluateTargeting(
      rule.include || {},
      rule.exclude || {},
      context,
      generatedDimensionConfig as any
    );

    if (result.matched) {
      return rule;
    }
  }

  return null;
}

/**
 * Get refresh config that matches a specific slot
 * Considers property, dimensions, adType, AND slotIds
 * @param {string} slotId - Slot ID to find rule for
 * @param {string} adType - Ad type of the slot
 * @returns {Object|null} Matching rule or null
 */
export function getRefreshConfigForSlot(slotId: string, adType: string): RefreshRule | null {
  if (!typedConfig.enabled) return null;

  const rules = typedConfig.rules;
  if (!rules || !Array.isArray(rules)) return null;

  const context = buildContext();
  const currentProperty = getProperty();

  // Find first rule that matches property AND dimensions AND adType AND slotIds
  for (const rule of rules) {
    // Check property targeting first
    if (!matchesProperty(rule.properties, currentProperty)) continue;

    // Check dimensions
    const result = evaluateTargeting(
      rule.include || {},
      rule.exclude || {},
      context,
      generatedDimensionConfig as any
    );

    if (!result.matched) continue;

    // Check adType match
    if (rule.adType && rule.adType !== adType) continue;

    // Check slotIds match
    if (rule.slotIds && rule.slotIds.length > 0 && !rule.slotIds.includes(slotId)) continue;

    // All criteria matched
    return rule;
  }

  return null;
}

/**
 * Schedule refresh for a slot
 * @param {string} slotId - Slot ID to schedule
 * @param {Object} options - Schedule options
 * @param {string} options.adType - Ad type for rule matching
 * @returns {boolean} True if scheduled successfully
 */
export function scheduleRefresh(slotId: string, options: ScheduleRefreshOptions = {}): boolean {
  if (!typedConfig.enabled) {
    log('scheduleRefresh: disabled in config');
    return false;
  }

  const adType = options.adType || slots.extractAdType(slotId);

  // Get matching rule for this specific slot (considers dimensions, adType, AND slotIds)
  const rule = getRefreshConfigForSlot(slotId, adType);
  if (!rule) {
    log(`scheduleRefresh: no matching rule for ${slotId} (${adType})`);
    return false;
  }

  const refreshRate = rule.refreshRate || typedConfig.defaults.refreshRate;
  const refreshCycle = rule.refreshCycle ?? typedConfig.defaults.refreshCycle;

  // Cancel existing timer if any
  if (refreshTimers[slotId]) {
    cancelRefresh(slotId);
  }

  // Create timer entry
  refreshTimers[slotId] = {
    slotId,
    adType,
    pagetype: '',
    viewport: '',
    duration: refreshRate / 1000,
    currentCount: refreshRate / 1000,
    refreshCycle,
    adcount: 1,
    refreshing: false,
    intervalId: null,
    isSlotVisible: true // Assume visible initially, observer will update
  };

  // Set up activity listeners if needed
  if (typedConfig.requireUserActivity && !state.activityListenersAdded) {
    setupActivityListeners(slotId);
  }

  // Set up slot visibility observer (always enabled - refresh requires viewability)
  const slotVisibleThreshold = rule.slotVisibleThreshold ?? 0.5;
  setupSlotVisibilityObserver(slotId, slotVisibleThreshold);

  // Start countdown interval
  refreshTimers[slotId].intervalId = setInterval(() => {
    countdown(slotId);
  }, INTERVALS.REFRESH_COUNTDOWN);

  log(`scheduleRefresh: ${slotId} scheduled`, {
    refreshRate: refreshRate / 1000 + 's',
    refreshCycle,
    adType,
    slotVisibleThreshold
  });

  return true;
}

/**
 * Countdown tick for a slot
 * @param {string} slotId - Slot ID
 */
function countdown(slotId: string): void {
  const timer = refreshTimers[slotId];
  if (!timer) return;

  // Only countdown if tab is visible (when pauseOnHidden is enabled)
  if (typedConfig.pauseOnHidden && !state.isTabVisible) {
    // Only log occasionally to reduce noise
    if (timer.currentCount % 10 === 0) {
      log(`countdown: ${slotId} paused (tab hidden) - ${timer.currentCount}s remaining`);
    }
    return;
  }

  // Only countdown if slot is visible (refresh requires viewability)
  if (!timer.isSlotVisible) {
    // Only log occasionally to reduce noise
    if (timer.currentCount % 10 === 0) {
      log(`countdown: ${slotId} paused (slot not visible) - ${timer.currentCount}s remaining`);
    }
    return;
  }

  if (timer.currentCount > 0) {
    timer.currentCount--;

    // Log every 10 seconds to reduce noise (or at key points)
    if (timer.currentCount % 10 === 0 || timer.currentCount === 5 || timer.currentCount === 1) {
      log(`countdown: ${slotId} ${timer.currentCount}s`);
    }
  } else if (!typedConfig.requireUserActivity) {
    // If user activity not required, trigger immediately when countdown reaches 0
    triggerRefresh(slotId);
  }
  // If requireUserActivity is true, wait for activity event to trigger refresh
}

/**
 * Trigger refresh for a slot
 * Runs wrapper auction if enabled before refreshing
 * @param {string} slotId - Slot ID
 */
async function triggerRefresh(slotId: string): Promise<void> {
  const timer = refreshTimers[slotId];
  if (!timer || timer.refreshing) return;

  timer.refreshing = true;

  // Check refresh cycle limit
  const refreshCycle = timer.refreshCycle;
  if (refreshCycle > 0 && timer.adcount >= refreshCycle) {
    log(`triggerRefresh: ${slotId} reached limit (${refreshCycle})`);
    cancelRefresh(slotId);
    return;
  }

  // Increment adcount first (need it for auction)
  timer.adcount++;

  log(`triggerRefresh: ${slotId} starting (adcount: ${timer.adcount})`);

  // Fade out if configured
  const element = document.getElementById(slotId);
  const fadeOutDuration = typedConfig.fadeOutDuration || 0;
  if (element && fadeOutDuration > 0) {
    element.style.transition = `opacity ${fadeOutDuration}ms`;
    element.style.opacity = '0';
  }

  // Wait for fade out
  await new Promise<void>(resolve => setTimeout(resolve, fadeOutDuration || TIMEOUTS.FADE_OUT));

  // Run auction if wrapper auctions enabled
  if (wrapperAuctions.hasEnabledWrappers()) {
    log(`triggerRefresh: ${slotId} running auction for refresh`);

    // Clear previous auction state for this slot
    wrapperAuctions.clearAuction(slotId);

    // Run new auction with current adcount
    await wrapperAuctions.requestAuction(slotId, { adcount: timer.adcount });

    // Apply bids to GPT slot
    wrapperAuctions.applyBids(slotId);
  }

  // Execute slot.beforeRefresh hooks (for custom targeting like prebidBidDetails)
  hooks.executeSync('slot.beforeRefresh', slotId, timer.adcount);

  // Perform refresh with adcount targeting
  const success = slots.refreshSlot(slotId, { adcount: String(timer.adcount) });

  if (success) {
    log(`triggerRefresh: ${slotId} refreshed (adcount: ${timer.adcount})`);

    // Fade back in
    if (element && fadeOutDuration > 0) {
      element.style.opacity = '1';
    }

    // Execute slot.afterRefresh hooks
    hooks.executeSync('slot.afterRefresh', slotId, timer.adcount);

    // Reset countdown
    timer.currentCount = timer.duration;
    timer.refreshing = false;
  } else {
    warn(`triggerRefresh: ${slotId} refresh failed`);
    cancelRefresh(slotId);
  }
}

/**
 * Cancel refresh for a slot
 * @param {string} slotId - Slot ID
 * @returns {boolean} True if cancelled
 */
export function cancelRefresh(slotId: string): boolean {
  const timer = refreshTimers[slotId];
  if (!timer) return false;

  if (timer.intervalId) {
    clearInterval(timer.intervalId);
  }

  // Remove slot visibility observer
  removeSlotVisibilityObserver(slotId);

  delete refreshTimers[slotId];
  log(`cancelRefresh: ${slotId} cancelled`);

  // Remove activity listeners if no more timers
  if (Object.keys(refreshTimers).length === 0) {
    removeActivityListeners();
  }

  return true;
}

/**
 * Cancel all refresh timers
 */
export function cancelAllRefreshes(): void {
  const count = Object.keys(refreshTimers).length;
  Object.keys(refreshTimers).forEach(slotId => {
    cancelRefresh(slotId);
  });
  log(`cancelAllRefreshes: ${count} timers cancelled`);
}

interface RefreshTimerState {
  slotId: string;
  adType: string;
  countdown: number;
  adcount: number;
  refreshCycle: number;
  refreshing: boolean;
  isSlotVisible: boolean;
}

/**
 * Get refresh state for a slot
 * @param {string} slotId - Slot ID
 * @returns {Object|null} Timer state or null
 */
export function getState(slotId: string): RefreshTimerState | null {
  const timer = refreshTimers[slotId];
  if (!timer) return null;

  return {
    slotId: timer.slotId,
    adType: timer.adType,
    countdown: timer.currentCount,
    adcount: timer.adcount,
    refreshCycle: timer.refreshCycle,
    refreshing: timer.refreshing,
    isSlotVisible: timer.isSlotVisible
  };
}

/**
 * Get all active refresh timers
 * @returns {Object} All timer states
 */
export function getAllStates(): Record<string, RefreshTimerState | null> {
  const states: Record<string, RefreshTimerState | null> = {};
  Object.keys(refreshTimers).forEach(slotId => {
    states[slotId] = getState(slotId);
  });
  return states;
}

/**
 * Set page type for rule matching
 * @param {string} pagetype - New page type
 */
export function setPagetype(pagetype: string): void {
  state.pagetype = pagetype;
  log(`setPagetype: ${pagetype}`);
}

/**
 * Get current page type
 * @returns {string} Current page type
 */
export function getPagetype() {
  return state.pagetype;
}

/**
 * Check if tab is currently visible
 * @returns {boolean} True if visible
 */
export function isTabVisible() {
  return state.isTabVisible;
}

/**
 * Full reset - cancels all timers and resets state
 */
export function reset() {
  cancelAllRefreshes();
  state.pagetype = 'default';
  state.initialized = false;
  log('reset: complete');
}

/**
 * Get config
 * @returns {Object} Refresh configuration
 */
export function getConfig() {
  return config;
}

export default {
  init,
  getModuleState,
  getRefreshConfig,
  getRefreshConfigForSlot,
  scheduleRefresh,
  cancelRefresh,
  cancelAllRefreshes,
  getState,
  getAllStates,
  setPagetype,
  getPagetype,
  isTabVisible,
  reset,
  getConfig
};
