/**
 * Partner Orchestrator Module
 * Manages partner timeouts and gates GAM call on blocking partners
 *
 * Timeout model:
 * - Blocking partners: Each has individual timeout, sum calculated via dependency graph
 * - Independent partners: Share a single independentTimeout (gates GAM)
 * - NonCore partners: Share a single nonCoreTimeout (does not gate GAM)
 */

import config from '../config/partners.json';
import CONFIG from '../config/loader.js';
import { TIMEOUTS } from './constants';
import { safeExecute } from './errors';

// Logging prefix
const LOG_PREFIX = '[Orchestrator]';

// Type definitions
interface PartnerStatusEntry {
  status: 'pending' | 'ready' | 'timeout' | 'error' | 'completed';
  startTime: number | null;
  completedTime: number | null;
  timeout?: number;
  dependsOn?: string | null;
}

interface OrchestratorState {
  initialized: boolean;
  startTime: number | null;
  universalTimeout: number;
  independentTimeout: number;
  nonCoreTimeout: number;
  partnersReady: boolean;
  allPartnersReady: boolean;
  nonCoreReady: boolean;
  timeoutFired: boolean;
  independentTimeoutFired: boolean;
  nonCoreTimeoutFired: boolean;
}

interface PartnerConfig {
  name: string;
  active: boolean;
  timeout?: number;
  dependsOn?: string;
}

interface PartnersJsonConfig {
  enabled: boolean;
  blocking: PartnerConfig[];
  independent: PartnerConfig[];
  nonCore: PartnerConfig[];
  defaults?: {
    universalTimeout?: number;
    independentTimeout?: number;
    nonCoreTimeout?: number;
    minTimeout?: number;
  };
}

interface OrchestratorInitOptions {
  onPartnersReady?: () => void;
  onAllPartnersReady?: () => void;
  partnersStartTime?: number;
}

type PartnerReadyCallback = (() => void) | null;

const typedConfig = config as PartnersJsonConfig;

/**
 * Get the loader instance from the global object
 */
function getLoader(): any {
  return window[CONFIG.globalName];
}

/**
 * Get hooks module from loader
 */
function getHooks(): any {
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
let state: OrchestratorState = {
  initialized: false,
  startTime: null,
  universalTimeout: 0,
  independentTimeout: 0,
  nonCoreTimeout: 0,
  partnersReady: false,
  allPartnersReady: false,
  nonCoreReady: false,
  timeoutFired: false,
  independentTimeoutFired: false,
  nonCoreTimeoutFired: false
};

// Partner status tracking
const partnerStatus: {
  blocking: Record<string, PartnerStatusEntry>;
  independent: Record<string, PartnerStatusEntry>;
  nonCore: Record<string, PartnerStatusEntry>;
} = {
  blocking: {},
  independent: {},
  nonCore: {}
};

// Timeout handles
let universalTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let independentTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
let nonCoreTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

// Callback to execute when blocking partners ready
let onPartnersReadyCallback: PartnerReadyCallback = null;

// Callback to execute when ALL partners ready (blocking + independent)
let onAllPartnersReadyCallback: PartnerReadyCallback = null;

/**
 * Initialize the orchestrator
 * @param {Object} options - Init options
 * @param {Function} options.onPartnersReady - Callback when all blocking partners ready
 * @param {Function} options.onAllPartnersReady - Callback when ALL partners ready (blocking + independent)
 * @param {number} options.partnersStartTime - Timestamp when partners started loading
 * @returns {Object} Module state
 */
export function init(options: OrchestratorInitOptions = {}) {
  if (state.initialized) return getState();

  if (!typedConfig.enabled) {
    log('Orchestrator disabled in config');
    // Fire both callbacks immediately if disabled
    if (options.onPartnersReady) {
      options.onPartnersReady();
    }
    if (options.onAllPartnersReady) {
      options.onAllPartnersReady();
    }
    return getState();
  }

  state.startTime = Date.now();
  onPartnersReadyCallback = options.onPartnersReady || null;
  onAllPartnersReadyCallback = options.onAllPartnersReady || null;

  // Calculate universal timeout from active blocking partners
  const baseTimeout = calculateUniversalTimeout();

  // Subtract elapsed time since partners started loading
  // Partners may have started before orchestrator.init() (e.g., waiting for CMP)
  if (options.partnersStartTime && options.partnersStartTime < state.startTime) {
    const elapsed = state.startTime - options.partnersStartTime;
    const adjusted = baseTimeout - elapsed;

    // Ensure minimum timeout (don't go below 500ms or configured minimum)
    const minTimeout = typedConfig.defaults?.minTimeout || TIMEOUTS.MIN_PARTNER;
    state.universalTimeout = Math.max(adjusted, minTimeout);

    log('Adjusted timeout for elapsed time', {
      base: baseTimeout + 'ms',
      elapsed: elapsed + 'ms',
      adjusted: state.universalTimeout + 'ms'
    });
  } else {
    state.universalTimeout = baseTimeout;
  }

  // Initialize blocking partner status
  typedConfig.blocking.forEach(partner => {
    if (partner.active) {
      partnerStatus.blocking[partner.name] = {
        status: 'pending',
        timeout: partner.timeout,
        dependsOn: partner.dependsOn || null,
        startTime: state.startTime,
        completedTime: null
      };
    }
  });

  // Initialize independent partner status
  typedConfig.independent.forEach(partner => {
    if (partner.active) {
      partnerStatus.independent[partner.name] = {
        status: 'pending',
        startTime: state.startTime,
        completedTime: null
      };
    }
  });

  // Set independent timeout from config
  state.independentTimeout = typedConfig.defaults?.independentTimeout || typedConfig.defaults?.universalTimeout || TIMEOUTS.INDEPENDENT;

  // Initialize nonCore partner status
  typedConfig.nonCore.forEach(partner => {
    if (partner.active) {
      partnerStatus.nonCore[partner.name] = {
        status: 'pending',
        startTime: state.startTime,
        completedTime: null
      };
    }
  });

  // Set nonCore timeout from config
  state.nonCoreTimeout = typedConfig.defaults?.nonCoreTimeout || TIMEOUTS.NON_CORE;

  // Subscribe to partner ready events
  subscribeToPartnerEvents();

  // Set universal timeout only if there are blocking partners
  const hasBlockingPartners = Object.keys(partnerStatus.blocking).length > 0;

  if (hasBlockingPartners && state.universalTimeout > 0) {
    universalTimeoutHandle = setTimeout(() => {
      handleUniversalTimeout();
    }, state.universalTimeout);

    log('Universal timeout set', { timeout: state.universalTimeout + 'ms' });
  } else {
    // No blocking partners - fire ready immediately
    log('No blocking partners active, firing ready immediately');
    firePartnersReady();

    // Start independent timeout for independent partners (if any exist)
    const hasIndependentPartners = Object.keys(partnerStatus.independent).length > 0;
    if (hasIndependentPartners) {
      startIndependentTimeout();
    }
  }

  state.initialized = true;
  log('Initialized', {
    universalTimeout: state.universalTimeout,
    blockingPartners: Object.keys(partnerStatus.blocking),
    independentPartners: Object.keys(partnerStatus.independent),
    nonCorePartners: Object.keys(partnerStatus.nonCore)
  });

  // Start nonCore timeout (runs independently of GAM)
  const hasNonCorePartners = Object.keys(partnerStatus.nonCore).length > 0;
  if (hasNonCorePartners) {
    startNonCoreTimeout();
  }

  // Emit ready event
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic: 'loader.orchestrator.ready', data: getState() });
    log('Published loader.orchestrator.ready');
  }

  return getState();
}

/**
 * Calculate universal timeout from active blocking partners
 * Supports dependency chains: partners with dependsOn load sequentially
 * Partners without dependencies load in parallel
 * Timeout = MAX of all critical paths through dependency graph
 * @returns {number} Total timeout in ms
 */
function calculateUniversalTimeout() {
  // Build map of active partners
  const partners: Record<string, { timeout: number; dependsOn: string | null }> = {};
  typedConfig.blocking.forEach(partner => {
    if (partner.active && typeof partner.timeout === 'number') {
      partners[partner.name] = {
        timeout: partner.timeout,
        dependsOn: partner.dependsOn || null
      };
    }
  });

  // Calculate critical path for each partner (sum of its chain)
  function getPathDuration(name: string, visited: Set<string> = new Set()): number {
    if (!partners[name]) return 0;
    if (visited.has(name)) {
      warn(`Circular dependency detected: ${name}`);
      return 0;
    }
    visited.add(name);

    const partner = partners[name];
    const ownTimeout = partner.timeout;
    const depTimeout = partner.dependsOn ? getPathDuration(partner.dependsOn, visited) : 0;

    return ownTimeout + depTimeout;
  }

  // Find the longest critical path (max of all paths)
  let maxPath = 0;
  Object.keys(partners).forEach(name => {
    const pathDuration = getPathDuration(name);
    if (pathDuration > maxPath) {
      maxPath = pathDuration;
    }
  });

  log('Calculated timeout from dependency graph', {
    partners: Object.keys(partners),
    maxCriticalPath: maxPath + 'ms'
  });

  // Apply defaults if no active partners
  if (maxPath === 0 && typedConfig.defaults?.universalTimeout) {
    maxPath = typedConfig.defaults.universalTimeout;
  }

  return maxPath;
}

/**
 * Derive ready event from partner name
 * All partners use predictable format: plugin.{name}.complete
 */
function getReadyEvent(name: string): string {
  return `plugin.${name}.complete`;
}

/**
 * Subscribe to partner completion events
 */
function subscribeToPartnerEvents() {
  const pubsub = window[CONFIG.pubsubGlobal];
  if (!pubsub?.subscribe) {
    warn('PubSub not available for partner event subscriptions');
    return;
  }

  // Subscribe to blocking partner events
  Object.keys(partnerStatus.blocking).forEach(name => {
    const readyEvent = getReadyEvent(name);
    pubsub.subscribe({
      topic: readyEvent,
      func: () => handlePartnerComplete(name, 'blocking'),
      runIfAlreadyPublished: true
    });
    log(`Subscribed to ${readyEvent}`);
  });

  // Subscribe to independent partner events
  Object.keys(partnerStatus.independent).forEach(name => {
    const readyEvent = getReadyEvent(name);
    pubsub.subscribe({
      topic: readyEvent,
      func: () => handlePartnerComplete(name, 'independent'),
      runIfAlreadyPublished: true
    });
    log(`Subscribed to ${readyEvent}`);
  });

  // Subscribe to nonCore partner events
  Object.keys(partnerStatus.nonCore).forEach(name => {
    const readyEvent = getReadyEvent(name);
    pubsub.subscribe({
      topic: readyEvent,
      func: () => handlePartnerComplete(name, 'nonCore'),
      runIfAlreadyPublished: true
    });
    log(`Subscribed to ${readyEvent}`);
  });
}

/**
 * Handle partner completion
 * @param {string} name - Partner name
 * @param {string} category - 'blocking', 'independent', or 'nonCore'
 */
function handlePartnerComplete(name: string, category: 'blocking' | 'independent' | 'nonCore') {
  const partner = partnerStatus[category]?.[name];
  if (!partner || partner.status !== 'pending') return;

  partner.status = 'completed';
  partner.completedTime = Date.now();

  const elapsed = partner.completedTime - (partner.startTime || partner.completedTime);
  log(`Partner complete: ${name}`, { elapsed: elapsed + 'ms', category });

  // Note: We don't emit a separate loader.partner.{name}.ready event here
  // because plugin.{name}.complete already serves this purpose and is
  // what we subscribe to in subscribeToPartnerEvents()

  // Check if all blocking partners are ready
  if (category === 'blocking') {
    checkBlockingPartnersReady();
  } else if (category === 'independent') {
    // Check if all partners (blocking + independent) are ready
    checkAllPartnersReady();
  } else if (category === 'nonCore') {
    // Check if all nonCore partners are ready
    checkNonCorePartnersReady();
  }
}

/**
 * Check if all blocking partners have completed
 */
function checkBlockingPartnersReady() {
  const allComplete = Object.values(partnerStatus.blocking).every(
    p => p.status === 'completed' || p.status === 'timeout'
  );

  if (allComplete && !state.partnersReady) {
    log('All blocking partners ready');
    firePartnersReady();
  }
}

/**
 * Handle universal timeout firing
 */
function handleUniversalTimeout() {
  if (state.partnersReady) return;

  state.timeoutFired = true;
  const elapsed = Date.now() - (state.startTime || Date.now());

  log('Universal timeout fired', { elapsed: elapsed + 'ms' });

  // Collect timed out partners
  const timedOutPartners: string[] = [];

  // Mark any pending blocking partners as timed out
  Object.entries(partnerStatus.blocking).forEach(([name, partner]) => {
    if (partner.status === 'pending') {
      partner.status = 'timeout';
      timedOutPartners.push(name);
      warn(`Partner timed out: ${name}`);

      // Emit partner timeout event
      const pubsub = window[CONFIG.pubsubGlobal];
      if (pubsub?.publish) {
        pubsub.publish({
          topic: `loader.partner.${name}.timeout`,
          data: { name, elapsed }
        });
      }
    }
  });

  // Execute partners.onTimeout hooks
  const hooks = getHooks();
  if (hooks) {
    safeExecute(
      () => hooks.executeSync('partners.onTimeout', timedOutPartners),
      undefined,
      (err) => warn(`Hook partners.onTimeout failed: ${err.message}`)
    );
  }

  // Fire partners ready anyway
  firePartnersReady();

  // Give independent partners their own timeout
  startIndependentTimeout();
}

/**
 * Fire partners ready event and callback
 */
function firePartnersReady() {
  if (state.partnersReady) return;

  state.partnersReady = true;

  // Clear universal timeout if still running
  if (universalTimeoutHandle) {
    clearTimeout(universalTimeoutHandle);
    universalTimeoutHandle = null;
  }

  const elapsed = Date.now() - (state.startTime || Date.now());
  log('Partners ready', { elapsed: elapsed + 'ms' });

  // Execute partners.afterReady hooks (before GAM call)
  const hooks = getHooks();
  if (hooks) {
    safeExecute(
      () => hooks.executeSync('partners.afterReady', partnerStatus, elapsed),
      undefined,
      (err) => warn(`Hook partners.afterReady failed: ${err.message}`)
    );
  }

  // Emit partners ready event
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({
      topic: 'loader.partners.ready',
      data: {
        elapsed,
        blocking: { ...partnerStatus.blocking },
        timeoutFired: state.timeoutFired
      }
    });
  }

  // Execute callback
  if (onPartnersReadyCallback) {
    safeExecute(
      onPartnersReadyCallback,
      undefined,
      (err) => warn(`onPartnersReady callback failed: ${err instanceof Error ? err.message : String(err)}`)
    );
  }

  // Check if independent partners are already complete (or none exist)
  checkAllPartnersReady();
}

/**
 * Check if ALL partners (blocking + independent) are ready
 * Independent partners must complete OR independent timeout must fire
 */
function checkAllPartnersReady() {
  // Blocking partners must be ready first
  if (!state.partnersReady) return;

  // Check if all independent are done
  const independentKeys = Object.keys(partnerStatus.independent);

  if (independentKeys.length === 0) {
    // No independent partners - fire immediately
    fireAllPartnersReady();
    return;
  }

  const allNonBlockingComplete = Object.values(partnerStatus.independent).every(
    p => p.status === 'completed' || p.status === 'timeout'
  );

  if (allNonBlockingComplete) {
    log('All independent partners completed before timeout');
    fireAllPartnersReady();
  }
}

/**
 * Fire all partners ready event and callback
 * Called when all partners (blocking + independent) are ready
 */
function fireAllPartnersReady() {
  if (state.allPartnersReady) return;

  state.allPartnersReady = true;

  const elapsed = Date.now() - (state.startTime || Date.now());
  log('All partners ready (blocking + independent)', {
    elapsed: elapsed + 'ms',
    independentTimeoutFired: state.independentTimeoutFired
  });

  // Execute partners.allReady hooks
  const hooks = getHooks();
  if (hooks) {
    safeExecute(
      () => hooks.executeSync('partners.allReady', partnerStatus, elapsed),
      undefined,
      (err) => warn(`Hook partners.allReady failed: ${err.message}`)
    );
  }

  // Emit independent partners ready event
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({
      topic: 'loader.partners.independent.ready',
      data: {
        elapsed,
        independent: { ...partnerStatus.independent },
        independentTimeoutFired: state.independentTimeoutFired
      }
    });

    // Emit all partners ready event
    pubsub.publish({
      topic: 'loader.ads.ready',
      data: {
        elapsed,
        blocking: { ...partnerStatus.blocking },
        independent: { ...partnerStatus.independent },
        timeoutFired: state.timeoutFired,
        independentTimeoutFired: state.independentTimeoutFired
      }
    });
    log('Published loader.ads.ready');
  }

  // Execute callback
  if (onAllPartnersReadyCallback) {
    safeExecute(
      onAllPartnersReadyCallback,
      undefined,
      (err) => warn(`onAllPartnersReady callback failed: ${err instanceof Error ? err.message : String(err)}`)
    );
  }
}

/**
 * Start timeout for independent partners
 * Uses dedicated independentTimeout from config
 */
function startIndependentTimeout() {
  const timeout = state.independentTimeout;
  const minTimeout = typedConfig.defaults?.minTimeout || TIMEOUTS.MIN_PARTNER;
  const effectiveTimeout = Math.max(timeout, minTimeout);

  log('Starting independent timeout', { timeout: effectiveTimeout + 'ms' });

  // Set timeout for independent partners
  independentTimeoutHandle = setTimeout(() => {
    // Skip if partners already completed before timeout
    if (state.allPartnersReady) return;

    state.independentTimeoutFired = true;

    const timedOutPartners: string[] = [];
    Object.entries(partnerStatus.independent).forEach(([name, partner]) => {
      if (partner.status === 'pending') {
        partner.status = 'timeout';
        timedOutPartners.push(name);
        warn(`Independent partner timed out: ${name}`);
      }
    });

    // Only emit timeout event if partners actually timed out
    if (timedOutPartners.length > 0) {
      const pubsub = window[CONFIG.pubsubGlobal];
      if (pubsub?.publish) {
        pubsub.publish({
          topic: 'loader.partners.independent.timeout',
          data: { partners: timedOutPartners }
        });
      }
    }

    // Fire all partners ready (independent timeout expired)
    fireAllPartnersReady();
  }, effectiveTimeout);
}

/**
 * Start timeout for nonCore partners
 * Uses dedicated nonCoreTimeout from config
 * Does NOT gate GAM - just for tracking/cleanup
 */
function startNonCoreTimeout() {
  const timeout = state.nonCoreTimeout;
  const minTimeout = typedConfig.defaults?.minTimeout || TIMEOUTS.MIN_PARTNER;
  const effectiveTimeout = Math.max(timeout, minTimeout);

  log('Starting nonCore timeout', { timeout: effectiveTimeout + 'ms' });

  // Set timeout for nonCore partners
  nonCoreTimeoutHandle = setTimeout(() => {
    // Skip if partners already completed before timeout
    if (state.nonCoreReady) return;

    state.nonCoreTimeoutFired = true;

    const timedOutPartners: string[] = [];
    Object.entries(partnerStatus.nonCore).forEach(([name, partner]) => {
      if (partner.status === 'pending') {
        partner.status = 'timeout';
        timedOutPartners.push(name);
        warn(`NonCore partner timed out: ${name}`);
      }
    });

    // Only emit timeout event if partners actually timed out
    if (timedOutPartners.length > 0) {
      const pubsub = window[CONFIG.pubsubGlobal];
      if (pubsub?.publish) {
        pubsub.publish({
          topic: 'loader.partners.nonCore.timeout',
          data: { partners: timedOutPartners }
        });
      }
    }

    // Fire nonCore ready (timeout expired)
    fireNonCoreReady();
  }, effectiveTimeout);
}

/**
 * Check if all nonCore partners have completed
 */
function checkNonCorePartnersReady() {
  const allComplete = Object.values(partnerStatus.nonCore).every(
    p => p.status === 'completed' || p.status === 'timeout'
  );

  if (allComplete && !state.nonCoreReady) {
    log('All nonCore partners completed before timeout');
    fireNonCoreReady();
  }
}

/**
 * Fire nonCore ready event
 * This does NOT gate GAM - just for tracking/cleanup
 */
function fireNonCoreReady() {
  if (state.nonCoreReady) return;

  state.nonCoreReady = true;

  const elapsed = Date.now() - (state.startTime || Date.now());
  log('NonCore partners ready', {
    elapsed: elapsed + 'ms',
    nonCoreTimeoutFired: state.nonCoreTimeoutFired
  });

  // Execute partners.nonCoreReady hooks
  const hooks = getHooks();
  if (hooks) {
    hooks.executeSync('partners.nonCoreReady', partnerStatus.nonCore, elapsed);
  }

  // Emit nonCore ready event
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({
      topic: 'loader.partners.nonCore.ready',
      data: {
        elapsed,
        nonCore: { ...partnerStatus.nonCore },
        nonCoreTimeoutFired: state.nonCoreTimeoutFired
      }
    });
  }
}

/**
 * Get current state
 * @returns {Object} Module state
 */
export function getState() {
  return {
    ...state,
    elapsed: state.startTime ? Date.now() - state.startTime : 0,
    blocking: { ...partnerStatus.blocking },
    independent: { ...partnerStatus.independent },
    nonCore: { ...partnerStatus.nonCore }
  };
}

/**
 * Get status of a specific partner
 * @param {string} name - Partner name
 * @returns {Object|null} Partner status or null
 */
export function getPartnerStatus(name: string) {
  return partnerStatus.blocking[name] || partnerStatus.independent[name] || partnerStatus.nonCore[name] || null;
}

/**
 * Check if blocking partners are ready
 * @returns {boolean} True if blocking partners ready (complete or timeout)
 */
export function isPartnersReady() {
  return state.partnersReady;
}

/**
 * Check if ALL partners are ready (blocking + independent)
 * @returns {boolean} True if all partners ready (complete or timeout)
 */
export function isAllPartnersReady() {
  return state.allPartnersReady;
}

/**
 * Check if nonCore partners are ready
 * @returns {boolean} True if nonCore partners ready (complete or timeout)
 */
export function isNonCoreReady() {
  return state.nonCoreReady;
}

/**
 * Get config
 * @returns {Object} Partners config
 */
export function getConfig() {
  return config;
}

/**
 * Get dependency info for a partner
 * @param {string} name - Partner name
 * @returns {string|null} Name of dependency or null
 */
export function getDependency(name: string) {
  const partner = typedConfig.blocking.find(p => p.name === name);
  return partner?.dependsOn || null;
}

/**
 * Check if a partner's dependency is satisfied
 * @param {string} name - Partner name
 * @returns {boolean} True if no dependency or dependency is completed
 */
export function canLoad(name: string) {
  const dep = getDependency(name);
  if (!dep) return true; // No dependency

  const depStatus = partnerStatus.blocking[dep];
  return depStatus?.status === 'completed';
}

/**
 * Get all partners that depend on a given partner
 * @param {string} name - Partner name
 * @returns {string[]} List of dependent partner names
 */
export function getDependents(name: string) {
  return typedConfig.blocking
    .filter(p => p.active && p.dependsOn === name)
    .map(p => p.name);
}

/**
 * Reset module state
 */
export function reset() {
  if (universalTimeoutHandle) {
    clearTimeout(universalTimeoutHandle);
    universalTimeoutHandle = null;
  }
  if (independentTimeoutHandle) {
    clearTimeout(independentTimeoutHandle);
    independentTimeoutHandle = null;
  }
  if (nonCoreTimeoutHandle) {
    clearTimeout(nonCoreTimeoutHandle);
    nonCoreTimeoutHandle = null;
  }

  state = {
    initialized: false,
    startTime: null,
    universalTimeout: 0,
    independentTimeout: 0,
    nonCoreTimeout: 0,
    partnersReady: false,
    allPartnersReady: false,
    nonCoreReady: false,
    timeoutFired: false,
    independentTimeoutFired: false,
    nonCoreTimeoutFired: false
  };

  Object.keys(partnerStatus.blocking).forEach(key => {
    delete partnerStatus.blocking[key];
  });
  Object.keys(partnerStatus.independent).forEach(key => {
    delete partnerStatus.independent[key];
  });
  Object.keys(partnerStatus.nonCore).forEach(key => {
    delete partnerStatus.nonCore[key];
  });

  onPartnersReadyCallback = null;
  onAllPartnersReadyCallback = null;
  log('Reset complete');
}

export default {
  init,
  getState,
  getPartnerStatus,
  isPartnersReady,
  isAllPartnersReady,
  isNonCoreReady,
  getConfig,
  getDependency,
  canLoad,
  getDependents,
  reset
};
