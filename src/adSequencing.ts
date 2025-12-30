/**
 * Ad Sequencing Module (ADT-748)
 * 
 * When a rule matches, priority ad types are loaded FIRST before others.
 * This ensures brand safety by allowing house ads or fallbacks to run
 * before programmatic inventory on sensitive content.
 * 
 * Rules are configured in config/sequencing.json
 * Rules reference keys from the resolved targeting data (from adTargeting.js)
 */

import CONFIG from '../config/loader.js';
import sequencingConfig from '../config/sequencing.json';
import { TIMEOUTS } from './constants';
import { evaluateTargeting, matchesProperty } from './targeting';
import { getProperty } from './property';
import { dimensions as generatedDimensions, dimensionConfig as generatedDimensionConfig } from './generated/dimensions.js';

// Logging prefix
const LOG_PREFIX = '[AdSequencing]';

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

// Module state types
interface SequencingRule {
  name: string;
  description?: string;
  properties?: string[];
  include?: Record<string, string[]>;
  exclude?: Record<string, string[]>;
  prioritySlotTypes?: string[];
  prioritySlotIds?: string[];
  priorityTimeout?: number;
}

interface SequencingState {
  active: boolean;
  reason: string | null;
  matchedConfig: SequencingRule | { name: string } | null;
  evaluatedAt: string | null;
  prioritySlotsRequested: string[];
  prioritySlotsRendered: string[];
  sequenceComplete: boolean;
}

// Module state
let state: SequencingState = {
  active: false,
  reason: null,
  matchedConfig: null,
  evaluatedAt: null,
  prioritySlotsRequested: [],
  prioritySlotsRendered: [],
  sequenceComplete: false
};

// Rules registry - loaded from config/sequencing.json
let rules: SequencingRule[] = (sequencingConfig.rules || []) as SequencingRule[];

/**
 * Build context from current dimension values for include/exclude targeting
 */
function buildDimensionContext(): Record<string, string> {
  const context: Record<string, string> = {};
  for (const [key, fn] of Object.entries(generatedDimensions)) {
    if (typeof fn === 'function') {
      context[key] = String(fn());
    }
  }
  return context;
}

/**
 * Check URL for parameter presence
 * @param {string} param - Parameter name
 * @returns {boolean} True if parameter exists in URL
 */
function hasUrlParam(param: string) {
  return window.location.search.includes(param) ||
         window.location.href.includes(param);
}

/**
 * Decide if ad sequencing should be active based on rules
 * Supports property targeting and dimension-based include/exclude
 * @returns {boolean} True if sequencing is active
 */
export function decide() {
  log(`Processing ${rules.length} AdSequence configurations`);

  // Store evaluation timestamp
  state.evaluatedAt = new Date().toISOString();

  // URL Parameter Override Logic
  if (hasUrlParam('adsequenceoff')) {
    log('AdSequence DISABLED by URL parameter (?adsequenceoff)');
    state.active = false;
    state.reason = 'URL parameter override: ?adsequenceoff';
    state.matchedConfig = null;
    return false;
  }

  if (hasUrlParam('adsequenceon')) {
    log('AdSequence ENABLED by URL parameter (?adsequenceon)');
    state.active = true;
    state.reason = 'URL parameter override: ?adsequenceon';
    state.matchedConfig = { name: 'URL Override' };
    return true;
  }

  const currentProperty = getProperty();
  const dimensionContext = buildDimensionContext();

  log('Evaluating against targeting', { property: currentProperty, dimensionContext });

  // Evaluate each rule in order
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    log(`Evaluating rule "${rule.name}" (${i + 1}/${rules.length})`);

    // Check property targeting first
    if (!matchesProperty(rule.properties, currentProperty)) {
      log(`Rule "${rule.name}" skipped - property mismatch (current: ${currentProperty})`);
      continue;
    }

    let ruleMatched = false;

    // Use include/exclude dimension-based targeting
    if (rule.include || rule.exclude) {
      const result = evaluateTargeting(
        rule.include || {},
        rule.exclude || {},
        dimensionContext,
        generatedDimensionConfig as any
      );
      ruleMatched = result.matched;
      if (!ruleMatched) {
        log(`Rule "${rule.name}" dimension targeting did not match: ${result.reason}`);
      }
    } else {
      // No targeting criteria - matches if property matched
      ruleMatched = true;
    }

    if (ruleMatched) {
      log(`Rule "${rule.name}" MATCHED - enabling AdSequence`);
      state.active = true;
      state.reason = `Rule match: ${rule.name}`;
      state.matchedConfig = rule;
      return true;
    }
  }

  // No rules matched
  log('No rules matched - using default behavior');
  state.active = false;
  state.reason = 'No rule matched';
  state.matchedConfig = null;
  return false;
}

interface SequencingInitOptions {
  rules?: SequencingRule[];
}

/**
 * Initialize the ad sequencing module
 * @param {Object} options - Init options
 * @param {Array} options.rules - Rules array (from config/sequencing.json)
 * @returns {Object} Module state
 */
export function init(options: SequencingInitOptions = {}) {
  if (options.rules && Array.isArray(options.rules)) {
    rules = options.rules;
  }

  log('Initialized', { rulesCount: rules.length });
  return getState();
}

/**
 * Check if ad sequencing is currently active
 * @returns {boolean}
 */
export function isActive() {
  return state.active;
}

/**
 * Get the reason for current state
 * @returns {string|null}
 */
export function getReason() {
  return state.reason;
}

/**
 * Get the matched rule
 * @returns {Object|null}
 */
export function getMatchedConfig() {
  return state.matchedConfig;
}

/**
 * Get priority slot types from matched rule or global config
 * Rule-level prioritySlotTypes override global config
 * @returns {string[]}
 */
export function getPrioritySlotTypes(): string[] {
  // Check if matched rule has its own prioritySlotTypes
  const matchedRule = state.matchedConfig as SequencingRule | null;
  if (matchedRule?.prioritySlotTypes && matchedRule.prioritySlotTypes.length > 0) {
    return matchedRule.prioritySlotTypes;
  }
  // Fall back to global config
  return (sequencingConfig as any).prioritySlotTypes || ['oop1', 'oop2'];
}

/**
 * Get priority slot IDs from matched rule or global config
 * Rule-level prioritySlotIds override global config
 * @returns {string[]}
 */
export function getPrioritySlotIds(): string[] {
  // Check if matched rule has its own prioritySlotIds
  const matchedRule = state.matchedConfig as SequencingRule | null;
  if (matchedRule?.prioritySlotIds && matchedRule.prioritySlotIds.length > 0) {
    return matchedRule.prioritySlotIds;
  }
  // Fall back to global config
  return (sequencingConfig as any).prioritySlotIds || [];
}

/**
 * Get priority timeout from matched rule or global config
 * Rule-level priorityTimeout overrides global config
 * @returns {number}
 */
export function getPriorityTimeout(): number {
  // Check if matched rule has its own priorityTimeout
  const matchedRule = state.matchedConfig as SequencingRule | null;
  if (matchedRule?.priorityTimeout !== undefined) {
    return matchedRule.priorityTimeout;
  }
  // Fall back to global config
  return (sequencingConfig as any).priorityTimeout || TIMEOUTS.PRIORITY;
}

/**
 * Check if we should wait for render before loading other slots
 * @returns {boolean}
 */
export function shouldWaitForRender(): boolean {
  return (sequencingConfig as any).waitForRender !== false;
}

/**
 * Check if a slot is a priority slot based on its adType or slotId
 * Checks both prioritySlotTypes (by ad type) and prioritySlotIds (by exact ID)
 * @param {string} slotId - The slot ID (e.g., "advert_mysite_oop")
 * @param {string} [adType] - Optional adType override
 * @returns {boolean}
 */
export function isPrioritySlot(slotId: string, adType?: string): boolean {
  // Check if slot ID is in prioritySlotIds
  const priorityIds = getPrioritySlotIds();
  if (priorityIds.includes(slotId)) {
    return true;
  }

  // Check if ad type is in prioritySlotTypes
  const priorityTypes = getPrioritySlotTypes();
  const type = adType || slotId.split('_')[2] || '';
  return priorityTypes.includes(type);
}

/**
 * Mark a priority slot as requested
 * @param {string} slotId
 */
export function markPriorityRequested(slotId: string) {
  if (!state.prioritySlotsRequested.includes(slotId)) {
    state.prioritySlotsRequested.push(slotId);
    log(`Priority slot requested: ${slotId}`);
  }
}

/**
 * Mark a priority slot as rendered (received slotRenderEnded)
 * @param {string} slotId
 */
export function markPriorityRendered(slotId: string) {
  if (!state.prioritySlotsRendered.includes(slotId)) {
    state.prioritySlotsRendered.push(slotId);
    log(`Priority slot rendered: ${slotId}`, {
      requested: state.prioritySlotsRequested.length,
      rendered: state.prioritySlotsRendered.length
    });
  }
}

/**
 * Check if all priority slots have rendered
 * @returns {boolean}
 */
export function allPrioritySlotsRendered() {
  if (state.prioritySlotsRequested.length === 0) {
    return true;
  }
  return state.prioritySlotsRequested.every(id => 
    state.prioritySlotsRendered.includes(id)
  );
}

/**
 * Wait for priority slots to render or timeout
 * @returns {Promise<{success: boolean, timedOut: boolean, rendered: string[]}>}
 */
export function waitForPrioritySlots() {
  return new Promise((resolve) => {
    // If no priority slots requested, resolve immediately
    if (state.prioritySlotsRequested.length === 0) {
      log('No priority slots to wait for');
      state.sequenceComplete = true;
      resolve({ success: true, timedOut: false, rendered: [] });
      return;
    }

    const timeout = getPriorityTimeout();
    const startTime = Date.now();
    let resolved = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const elapsed = Date.now() - startTime;
        log(`Priority slots TIMEOUT after ${elapsed}ms`, {
          requested: state.prioritySlotsRequested,
          rendered: state.prioritySlotsRendered
        });
        state.sequenceComplete = true;
        resolve({
          success: false,
          timedOut: true,
          rendered: [...state.prioritySlotsRendered]
        });
      }
    }, timeout);

    // Subscribe to slotRenderEnded events
    const pubsub = window[CONFIG.pubsubGlobal];
    if (!pubsub) {
      clearTimeout(timeoutId);
      log('PubSub not available, cannot wait for priority slots');
      state.sequenceComplete = true;
      resolve({ success: false, timedOut: false, rendered: [] });
      return;
    }

    // Check function - called on each render event
    const checkComplete = () => {
      if (resolved) return;
      
      if (allPrioritySlotsRendered()) {
        resolved = true;
        clearTimeout(timeoutId);
        const elapsed = Date.now() - startTime;
        log(`All priority slots rendered in ${elapsed}ms`, {
          rendered: state.prioritySlotsRendered
        });
        state.sequenceComplete = true;
        resolve({
          success: true,
          timedOut: false,
          rendered: [...state.prioritySlotsRendered]
        });
      }
    };

    // Subscribe to render events for each priority slot
    state.prioritySlotsRequested.forEach(slotId => {
      const topic = `ads.slot.${slotId}.rendered`;
      pubsub.subscribe({
        topic,
        func: () => {
          markPriorityRendered(slotId);
          checkComplete();
        },
        runIfAlreadyPublished: true
      });

      // Also listen for empty slots
      const emptyTopic = `ads.slot.${slotId}.empty`;
      pubsub.subscribe({
        topic: emptyTopic,
        func: () => {
          markPriorityRendered(slotId); // Empty counts as rendered
          checkComplete();
        },
        runIfAlreadyPublished: true
      });
    });

    log(`Waiting for ${state.prioritySlotsRequested.length} priority slots`, {
      slots: state.prioritySlotsRequested,
      timeout: timeout + 'ms'
    });
  });
}

/**
 * Get full module state
 * @returns {Object}
 */
export function getState() {
  return {
    active: state.active,
    reason: state.reason,
    matchedConfig: state.matchedConfig,
    evaluatedAt: state.evaluatedAt,
    prioritySlotsRequested: [...state.prioritySlotsRequested],
    prioritySlotsRendered: [...state.prioritySlotsRendered],
    sequenceComplete: state.sequenceComplete,
    rules: rules,
    config: {
      enabled: (sequencingConfig as any).enabled,
      prioritySlotTypes: getPrioritySlotTypes(),
      prioritySlotIds: getPrioritySlotIds(),
      priorityTimeout: getPriorityTimeout(),
      waitForRender: shouldWaitForRender()
    }
  };
}

/**
 * Add a rule at runtime
 * @param {Object} rule - Rule with name and include/exclude object
 */
export function addRule(rule: any) {
  if (!rule.name) {
    log('Cannot add rule without name');
    return false;
  }

  rules.push(rule);
  log(`Rule added: ${rule.name}`);
  return true;
}

/**
 * Get all rules
 * @returns {Array}
 */
export function getRules() {
  return [...rules];
}

/**
 * Get the config
 * @returns {Object}
 */
export function getConfig() {
  return sequencingConfig;
}

/**
 * Check if sequencing is enabled (URL params override config)
 * @returns {boolean}
 */
export function isEnabled() {
  if (hasUrlParam('adsequenceon')) return true;
  if (hasUrlParam('adsequenceoff')) return false;
  return sequencingConfig.enabled !== false;
}

/**
 * Reset module state
 */
export function reset() {
  state = {
    active: false,
    reason: null,
    matchedConfig: null,
    evaluatedAt: null,
    prioritySlotsRequested: [],
    prioritySlotsRendered: [],
    sequenceComplete: false
  };
  log('Reset complete');
}

export default {
  init,
  decide,
  isActive,
  isEnabled,
  getReason,
  getMatchedConfig,
  getState,
  getConfig,
  addRule,
  getRules,
  reset,
  // Priority slot methods
  getPrioritySlotTypes,
  getPrioritySlotIds,
  getPriorityTimeout,
  shouldWaitForRender,
  isPrioritySlot,
  markPriorityRequested,
  markPriorityRendered,
  allPrioritySlotsRendered,
  waitForPrioritySlots
};
