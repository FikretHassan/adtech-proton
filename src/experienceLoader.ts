/**
 * Experience Loader Module
 *
 * Executes targeted functions based on page context (dimensions).
 * Uses the same targeting evaluation system as the plugin loader.
 *
 * PubSub lifecycle events:
 * - experience.{name}.load     - Experience function executed successfully
 * - experience.{name}.ignore   - Experience skipped (targeting didn't match)
 * - experience.{name}.inactive - Experience disabled (active: false)
 * - experience.{name}.complete - Experience processing finished (always fires)
 */

import config from '../config/experiences.json';
import experiences from '../config/experiences/index.js';
import { evaluateTargeting, normalizeTargetingConfig, matchesProperty } from './targeting';
import { getProperty } from './property';
import CONFIG from '../config/loader.js';
import { PRIORITIES } from './constants';

// Logging prefix
const LOG_PREFIX = '[ExperienceLoader]';

// Subscription interface for conditional PubSub subscriptions
interface SubscriptionConfig {
  topic: string;
  fn: (data?: unknown) => void;
  runIfAlreadyPublished?: boolean;
}

// Experience interface
interface ExperienceConfig {
  name: string;
  fn?: (context: any) => any;
  subscriptions?: SubscriptionConfig[];
  active?: boolean;
  priority?: number;
  include?: any;
  exclude?: any;
  consentState?: string[];
  properties?: string[];
  status?: string;
}

// Result interface
interface ExperienceResult {
  name: any;
  status: string;
  reason?: string;
  result?: any;
  subscriptions?: string[];
  duration?: number;
  error?: string;
}

// Module state
let state: {
  initialized: boolean;
  experiences: Record<string, any>;
  results: Record<string, any>;
  pending: ExperienceConfig[];
} = {
  initialized: false,
  experiences: {},
  results: {},
  pending: []
};

// Function registry - for runtime-registered experiences
const registry = {};

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
 * Get URL parameter overrides for experiences
 * @returns {{ enable: string[], disable: string[] }}
 */
function getUrlOverrides() {
  if (typeof window === 'undefined') {
    return { enable: [], disable: [] };
  }

  const params = new URLSearchParams(window.location.search);
  const enable = (params.get('experienceEnable') || '').split(',').filter(Boolean);
  const disable = (params.get('experienceDisable') || '').split(',').filter(Boolean);

  return { enable, disable };
}

/**
 * Check if experience should be force-enabled/disabled via URL
 * @param {string} name - Experience name
 * @returns {{ override: boolean, enabled: boolean }}
 */
function checkUrlOverride(name: string) {
  const { enable, disable } = getUrlOverrides();

  // Disable all except enabled
  if (disable.includes('all')) {
    if (enable.includes(name)) {
      return { override: true, enabled: true };
    }
    return { override: true, enabled: false };
  }

  // Explicit enable
  if (enable.includes(name)) {
    return { override: true, enabled: true };
  }

  // Explicit disable
  if (disable.includes(name)) {
    return { override: true, enabled: false };
  }

  return { override: false, enabled: true };
}

/**
 * Check consent state
 * @param {Array} requiredStates - Required consent states
 * @returns {boolean}
 */
function checkConsent(requiredStates: string[]) {
  if (!requiredStates || requiredStates.length === 0 || requiredStates.includes('all')) {
    return true;
  }

  const loader = getLoader();
  if (loader?.consentCheck) {
    return loader.consentCheck(requiredStates);
  }

  return true; // Default: assume consent
}

/**
 * Initialize the experience loader
 * @returns {Object} Module state
 */
export function init() {
  if (state.initialized) return getState();

  if (!config.enabled) {
    log('Experience loader disabled in config');
    return getState();
  }

  log('Initializing');

  // Sort experiences by priority (lower = earlier)
  const sorted = [...experiences].sort(
    (a, b) => (a.priority || PRIORITIES.DEFAULT) - (b.priority || PRIORITIES.DEFAULT)
  );

  // Register experiences
  sorted.forEach(exp => {
    state.experiences[exp.name] = {
      ...exp,
      status: 'pending'
    };
  });

  state.pending = sorted.filter(exp => exp.active !== false);
  state.initialized = true;

  log('Registered experiences', state.pending.map(e => e.name));

  // Emit ready event
  publish('loader.experiences.ready', { experiences: state.pending.map(e => e.name) });

  return getState();
}

/**
 * Register a custom experience function at runtime
 * @param {string} name - Function name
 * @param {Function} fn - Function to register
 * @returns {boolean} Success
 */
export function register(name: string, fn: (...args: any[]) => any) {
  if (typeof fn !== 'function') {
    warn(`Cannot register ${name}: not a function`);
    return false;
  }

  (registry as any)[name] = fn;
  log(`Registered function: ${name}`);
  return true;
}

/**
 * Execute all experiences that match current context
 * @param {Object} context - Page context from loader.getContext()
 * @param {Object} dimensionConfig - Dimension match type configuration
 * @returns {Array} Results for each experience
 */
export function execute(context: Record<string, any>, dimensionConfig: Record<string, any> = {}) {
  if (!state.initialized) {
    init();
  }

  log('Executing experiences', { context });

  const results: ExperienceResult[] = [];

  state.pending.forEach(experience => {
    const result = executeSingle(experience, context, dimensionConfig);
    results.push(result);
    state.results[experience.name] = result;
  });

  // Emit complete event
  publish('loader.experiences.complete', {
    total: results.length,
    loaded: results.filter(r => r.status === 'load').length,
    ignored: results.filter(r => r.status === 'ignore').length,
    inactive: results.filter(r => r.status === 'inactive').length,
    errors: results.filter(r => r.status === 'error').length
  });

  return results;
}

/**
 * Execute a single experience if targeting matches
 * @param {Object} experience - Experience config
 * @param {Object} context - Page context
 * @param {Object} dimensionConfig - Dimension match type config
 * @returns {Object} Result
 */
function executeSingle(experience: ExperienceConfig, context: Record<string, any>, dimensionConfig: Record<string, any>) {
  const { name, fn, include, exclude, consentState, active, properties } = experience;
  const eventPrefix = config.eventPrefix || 'experience';
  const startTime = performance.now();

  // Check URL override
  const urlOverride = checkUrlOverride(name);
  if (urlOverride.override) {
    if (!urlOverride.enabled) {
      // Force disabled
      state.experiences[name].status = 'inactive';
      publish(`${eventPrefix}.${name}.inactive`, { name, reason: 'URL override' });
      publish(`${eventPrefix}.${name}.complete`, { name, status: 'inactive' });

      return {
        name,
        status: 'inactive',
        reason: 'URL override disabled'
      };
    }
    // Force enabled - skip targeting check
    log(`${name}: Force enabled via URL override`);
  }

  // Check if active
  if (active === false && !urlOverride.override) {
    state.experiences[name].status = 'inactive';
    publish(`${eventPrefix}.${name}.inactive`, { name });
    publish(`${eventPrefix}.${name}.complete`, { name, status: 'inactive' });

    return {
      name,
      status: 'inactive',
      reason: 'Experience disabled (active: false)'
    };
  }

  // Check property targeting
  if (!matchesProperty(properties, getProperty())) {
    state.experiences[name].status = 'ignore';
    publish(`${eventPrefix}.${name}.ignore`, { name, reason: 'Property mismatch' });
    publish(`${eventPrefix}.${name}.complete`, { name, status: 'ignore' });

    return {
      name,
      status: 'ignore',
      reason: 'Property mismatch'
    };
  }

  // Check consent
  if (!checkConsent(consentState || [])) {
    state.experiences[name].status = 'ignore';
    publish(`${eventPrefix}.${name}.ignore`, { name, reason: 'Consent not granted' });
    publish(`${eventPrefix}.${name}.complete`, { name, status: 'ignore' });

    return {
      name,
      status: 'ignore',
      reason: 'Consent not granted'
    };
  }

  // Check targeting (unless force enabled)
  if (!urlOverride.override || !urlOverride.enabled) {
    const targeting = normalizeTargetingConfig({ include, exclude });
    const targetingResult = evaluateTargeting(
      targeting.include,
      targeting.exclude,
      context,
      dimensionConfig
    );

    if (!targetingResult.matched) {
      state.experiences[name].status = 'ignore';
      publish(`${eventPrefix}.${name}.ignore`, { name, reason: targetingResult.reason });
      publish(`${eventPrefix}.${name}.complete`, { name, status: 'ignore' });

      return {
        name,
        status: 'ignore',
        reason: targetingResult.reason
      };
    }
  }

  // Get subscriptions from experience config
  const subscriptions = experience.subscriptions || [];

  // Get function - either from experience config or runtime registry
  const func = fn ? (typeof fn === 'function' ? fn : (registry as any)[fn]) : null;

  // Must have either fn or subscriptions
  if (!func && subscriptions.length === 0) {
    state.experiences[name].status = 'error';
    publish(`${eventPrefix}.${name}.error`, { name, error: 'Experience has no fn or subscriptions' });
    publish(`${eventPrefix}.${name}.complete`, { name, status: 'error' });

    return {
      name,
      status: 'error',
      reason: 'Experience has no fn or subscriptions'
    };
  }

  // Register conditional subscriptions (targeting already passed)
  const registeredSubscriptions: string[] = [];
  if (subscriptions.length > 0) {
    const pubsub = window[CONFIG.pubsubGlobal];
    if (pubsub?.subscribe) {
      subscriptions.forEach((sub: SubscriptionConfig) => {
        if (sub.topic && typeof sub.fn === 'function') {
          pubsub.subscribe({
            topic: sub.topic,
            func: sub.fn,
            runIfAlreadyPublished: sub.runIfAlreadyPublished ?? true
          });
          registeredSubscriptions.push(sub.topic);
          log(`Subscribed to: ${sub.topic}`, { experience: name });
        } else {
          warn(`Invalid subscription in ${name}`, sub);
        }
      });
    }
  }

  // Execute the function if present
  let fnResult = null;
  if (func) {
    try {
      log(`Executing: ${name}`);
      fnResult = func(context);
    } catch (error) {
      const duration = performance.now() - startTime;
      state.experiences[name].status = 'error';

      warn(`Error executing ${name}`, error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      publish(`${eventPrefix}.${name}.error`, {
        name,
        error: errorMessage,
        duration,
        subscriptions: registeredSubscriptions
      });
      publish(`${eventPrefix}.${name}.complete`, {
        name,
        status: 'error',
        duration
      });

      return {
        name,
        status: 'error',
        error: errorMessage,
        duration,
        subscriptions: registeredSubscriptions
      };
    }
  }

  const duration = performance.now() - startTime;
  state.experiences[name].status = 'load';

  publish(`${eventPrefix}.${name}.load`, {
    name,
    result: fnResult,
    subscriptions: registeredSubscriptions,
    duration
  });
  publish(`${eventPrefix}.${name}.complete`, {
    name,
    status: 'load',
    duration
  });

  log(`Completed: ${name}`, {
    duration: `${duration.toFixed(2)}ms`,
    result: fnResult,
    subscriptions: registeredSubscriptions
  });

  return {
    name,
    status: 'load',
    result: fnResult,
    subscriptions: registeredSubscriptions,
    duration
  };
}

/**
 * Check if an experience was executed (loaded)
 * @param {string} name - Experience name
 * @returns {boolean}
 */
export function wasExecuted(name: string) {
  return state.experiences[name]?.status === 'load';
}

/**
 * Get result for an experience
 * @param {string} name - Experience name
 * @returns {Object|null}
 */
export function getResult(name: string) {
  return state.results[name] || null;
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
    experiences: Object.keys(state.experiences).map(name => ({
      name,
      status: state.experiences[name].status
    })),
    results: { ...state.results }
  };
}

/**
 * Get config
 * @returns {Object}
 */
export function getConfig() {
  return config;
}

/**
 * Reset module state (for testing)
 */
export function reset() {
  state = {
    initialized: false,
    experiences: {},
    results: {},
    pending: []
  };
  log('Reset complete');
}

export default {
  init,
  register,
  execute,
  wasExecuted,
  getResult,
  getResults,
  getState,
  getConfig,
  reset
};
