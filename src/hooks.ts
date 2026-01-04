/**
 * Lifecycle Hooks Module
 * Allows publishers to inject custom code at key points in the ad lifecycle
 * 
 * Hooks can be registered via:
 * 1. config/hooks.js - Static configuration
 * 2. Runtime API - loader.hooks.register()
 * 
 * Each hook point can have multiple functions that execute in priority order.
 */

import CONFIG from '../config/loader.js';
import { matchesProperty, evaluateTargeting } from './targeting';
import { getProperty } from './property';
import { PRIORITIES } from './constants';

// Logging prefix
const LOG_PREFIX = '[Hooks]';

// ANSI-style console colors for lifecycle visualization
const COLORS = {
  lifecycle: 'color: #9b59b6; font-weight: bold;',  // Purple for lifecycle events
  hook: 'color: #3498db;',                           // Blue for hook execution
  success: 'color: #27ae60;',                        // Green for success
  warn: 'color: #f39c12;',                           // Orange for warnings
  error: 'color: #e74c3c;',                          // Red for errors
  info: 'color: #7f8c8d;'                            // Gray for info
};

/**
 * Get the loader instance from the global object
 */
function getLoader() {
  return window[CONFIG.globalName];
}

/**
 * Check if hook matches current page dimensions
 * @param hook - Hook with optional match/exclude rules
 * @returns true if hook should execute on this page
 */
function matchesDimensions(hook: any): boolean {
  // If no match/exclude rules, hook applies to all pages
  if (!hook.match && !hook.exclude) {
    return true;
  }

  const loader = getLoader();
  if (!loader?.getContext || !loader?.dimensionConfig) {
    // Can't evaluate without context - default to matching
    return true;
  }

  const context = loader.getContext();
  const dimensionConfig = loader.dimensionConfig;

  const result = evaluateTargeting(
    hook.match || {},
    hook.exclude || {},
    context,
    dimensionConfig
  );

  return result.matched;
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
let state = {
  initialized: false,
  debugMode: false
};

// Registry of hooks by lifecycle point
const registry: Record<string, any[]> = {};

// Execution history - tracks which hooks ran and which were skipped
interface ExecutionRecord {
  point: string;
  hook: string;
  status: 'executed' | 'skipped:dimensions' | 'skipped:property' | 'error';
  timestamp: number;
  reason?: string;
}
const executionHistory: ExecutionRecord[] = [];
const MAX_EXECUTION_HISTORY = 1000;

/**
 * Record an execution event with automatic cap to prevent unbounded growth
 */
function recordExecution(record: ExecutionRecord): void {
  executionHistory.push(record);
  if (executionHistory.length > MAX_EXECUTION_HISTORY) {
    executionHistory.shift();
  }
}

// Available lifecycle points with descriptions
const LIFECYCLE_POINTS: Record<string, { description: string; phase: string; args: string[] }> = {
  // Initialization phase
  'loader.beforeInit': {
    description: 'Before any modules initialize',
    phase: 'init',
    args: []
  },
  'loader.afterInit': {
    description: 'After core modules initialized',
    phase: 'init',
    args: ['modules']
  },
  'loader.ready': {
    description: 'After loader is fully initialized and exposed to window',
    phase: 'init',
    args: ['loader']
  },

  // Partner orchestration phase
  'partners.afterReady': {
    description: 'After all blocking partners ready, before GAM call',
    phase: 'partners',
    args: ['partnerStatus', 'elapsed']
  },
  'partners.onTimeout': {
    description: 'When partner timeout fires',
    phase: 'partners',
    args: ['timedOutPartners']
  },
  'partners.allReady': {
    description: 'After all partners ready (blocking + independent), GAM call triggered',
    phase: 'partners',
    args: ['partnerStatus', 'elapsed']
  },
  'partners.nonCoreReady': {
    description: 'After all nonCore partners complete (does not gate GAM)',
    phase: 'partners',
    args: ['nonCoreStatus', 'elapsed']
  },

  // Slot definition phase
  'slot.beforeDefine': {
    description: 'Before a GPT slot is defined',
    phase: 'slots',
    args: ['slotId', 'adType', 'sizes']
  },
  'slot.afterDefine': {
    description: 'After a GPT slot is defined',
    phase: 'slots',
    args: ['slotId', 'gptSlot']
  },

  // Ad request phase
  'ads.beforeRequest': {
    description: 'Before any ad requests are made',
    phase: 'ads',
    args: ['context']
  },
  'slot.beforeRequest': {
    description: 'Before googletag.display() for a slot',
    phase: 'ads',
    args: ['slotId', 'gptSlot']
  },
  'slot.afterRequest': {
    description: 'After googletag.display() for a slot',
    phase: 'ads',
    args: ['slotId']
  },
  'ads.afterRequest': {
    description: 'After all initial ad requests complete',
    phase: 'ads',
    args: ['results']
  },

  // Render phase
  'slot.beforeRender': {
    description: 'Before slot render event fires (slotRenderEnded)',
    phase: 'render',
    args: ['slotId', 'event']
  },
  'slot.afterRender': {
    description: 'After slot renders successfully',
    phase: 'render',
    args: ['slotId', 'event', 'advertiserInfo']
  },
  'slot.onEmpty': {
    description: 'When a slot renders empty (no fill)',
    phase: 'render',
    args: ['slotId', 'event']
  },

  // Refresh phase
  'slot.beforeRefresh': {
    description: 'Before a slot refresh',
    phase: 'refresh',
    args: ['slotId', 'refreshCount']
  },
  'slot.afterRefresh': {
    description: 'After a slot refresh completes',
    phase: 'refresh',
    args: ['slotId', 'refreshCount']
  },

  // Dynamic injection phase
  'injection.beforeInject': {
    description: 'Before dynamic ads are injected into content',
    phase: 'injection',
    args: ['config']
  },
  'injection.afterInject': {
    description: 'After dynamic ads are injected',
    phase: 'injection',
    args: ['injectedSlots']
  }
};

// Init options interface
interface HooksInitOptions {
  debug?: boolean;
  hooks?: Record<string, any[]>;
}

/**
 * Initialize the hooks module
 * @param {Object} options - Init options
 * @param {boolean} options.debug - Enable debug console output
 * @param {Object} options.hooks - Initial hooks configuration
 * @returns {Object} Module state
 */
export function init(options: HooksInitOptions = {}) {
  if (state.initialized) return getState();

  state.debugMode = options.debug || window.location.href.includes('hooksDebug');

  // Initialize registry for all lifecycle points
  Object.keys(LIFECYCLE_POINTS).forEach(point => {
    registry[point] = [];
  });

  // Register hooks from config if provided
  if (options.hooks) {
    Object.entries(options.hooks).forEach(([point, hooks]) => {
      if (Array.isArray(hooks)) {
        hooks.forEach(hook => register(point, hook));
      }
    });
  }

  state.initialized = true;
  log('Initialized', { points: Object.keys(LIFECYCLE_POINTS).length });

  // Log available lifecycle points in debug mode
  if (state.debugMode) {
    logLifecyclePoints();
  }

  return getState();
}

/**
 * Log all available lifecycle points to console (for debugging/documentation)
 */
function logLifecyclePoints() {
  console.groupCollapsed('%c[Hooks] Available Lifecycle Points', COLORS.lifecycle);

  const phases: Record<string, any[]> = {};
  Object.entries(LIFECYCLE_POINTS).forEach(([point, config]) => {
    if (!phases[config.phase]) phases[config.phase] = [];
    phases[config.phase].push({ point, ...config });
  });

  Object.entries(phases).forEach(([phase, points]) => {
    console.group(`%c${phase.toUpperCase()} Phase`, COLORS.hook);
    (points as any[]).forEach((p: any) => {
      console.log(`%c${p.point}`, COLORS.info, `- ${p.description}`);
      if (p.args.length > 0) {
        console.log(`  Args: (${p.args.join(', ')})`);
      }
    });
    console.groupEnd();
  });

  console.groupEnd();
}

/**
 * Register a hook function for a lifecycle point
 * @param {string} point - Lifecycle point name
 * @param {Object} hookConfig - Hook configuration
 * @param {string} hookConfig.name - Unique hook name
 * @param {Function} hookConfig.fn - Function to execute
 * @param {number} [hookConfig.priority=8] - Execution order 1-16 (lower = earlier, matches GAM)
 * @param {boolean} [hookConfig.async=false] - Whether to await this hook
 * @param {boolean} [hookConfig.once=false] - Execute only once then unregister
 * @returns {boolean} Success
 */
export function register(point: string, hookConfig: any) {
  if (!LIFECYCLE_POINTS[point]) {
    console.warn(`%c[Hooks] Unknown lifecycle point: ${point}`, COLORS.warn);
    console.log('%cAvailable points:', COLORS.info, Object.keys(LIFECYCLE_POINTS));
    return false;
  }

  if (!hookConfig.name || typeof hookConfig.fn !== 'function') {
    console.warn(`%c[Hooks] Invalid hook config - requires name and fn`, COLORS.warn);
    return false;
  }

  // Check for duplicate
  const existing = registry[point].find(h => h.name === hookConfig.name);
  if (existing) {
    log(`Hook already registered: ${hookConfig.name} at ${point}, replacing`);
    unregister(point, hookConfig.name);
  }

  const hook = {
    name: hookConfig.name,
    fn: hookConfig.fn,
    priority: hookConfig.priority ?? PRIORITIES.DEFAULT,
    async: hookConfig.async ?? false,
    once: hookConfig.once ?? false,
    properties: hookConfig.properties, // undefined = all properties
    match: hookConfig.match,           // dimension matching rules (e.g., { renderertype: ['app/next/live'] })
    exclude: hookConfig.exclude        // dimension exclusion rules
  };

  registry[point].push(hook);
  
  // Sort by priority
  registry[point].sort((a, b) => a.priority - b.priority);

  log(`Registered hook: ${hook.name} at ${point}`, { priority: hook.priority });

  if (state.debugMode) {
    console.log(
      `%c[Hooks] ✓ Registered: %c${hook.name}%c at %c${point}`,
      COLORS.success, COLORS.hook, COLORS.info, COLORS.lifecycle
    );
  }

  return true;
}

/**
 * Unregister a hook
 * @param {string} point - Lifecycle point
 * @param {string} name - Hook name
 * @returns {boolean} Success
 */
export function unregister(point: string, name: string) {
  if (!registry[point]) return false;

  const index = registry[point].findIndex(h => h.name === name);
  if (index > -1) {
    registry[point].splice(index, 1);
    log(`Unregistered hook: ${name} from ${point}`);
    return true;
  }
  return false;
}

/**
 * Execute all hooks for a lifecycle point
 * @param {string} point - Lifecycle point name
 * @param {...*} args - Arguments to pass to hook functions
 * @returns {Promise<Object>} Results from all hooks
 */
export async function execute(point: string, ...args: any[]) {
  if (!registry[point] || registry[point].length === 0) {
    // No hooks registered - just log the lifecycle point in debug mode
    if (state.debugMode) {
      console.log(
        `%c[Hooks] ▸ ${point}%c (no hooks)`,
        COLORS.lifecycle, COLORS.info
      );
    }
    return { point, hooks: [], results: [] };
  }

  // Filter hooks by property and dimensions, tracking skipped hooks
  const currentProperty = getProperty();
  const applicableHooks: any[] = [];

  for (const hook of registry[point]) {
    // First check property
    if (!matchesProperty(hook.properties, currentProperty)) {
      recordExecution({
        point,
        hook: hook.name,
        status: 'skipped:property',
        timestamp: Date.now(),
        reason: `Property mismatch: ${currentProperty}`
      });
      continue;
    }
    // Then check dimensions (match/exclude rules)
    if (!matchesDimensions(hook)) {
      recordExecution({
        point,
        hook: hook.name,
        status: 'skipped:dimensions',
        timestamp: Date.now(),
        reason: 'Dimension match/exclude rules not satisfied'
      });
      if (state.debugMode) {
        log(`Hook ${hook.name} skipped - dimensions not matched`);
      }
      continue;
    }
    applicableHooks.push(hook);
  }

  if (applicableHooks.length === 0) {
    if (state.debugMode) {
      console.log(
        `%c[Hooks] ▸ ${point}%c (no hooks for property: ${currentProperty})`,
        COLORS.lifecycle, COLORS.info
      );
    }
    return { point, hooks: [], results: [] };
  }

  const startTime = performance.now();
  const results: Array<{ name: any; success: boolean; result?: any; error?: unknown }> = [];
  const hooksToRemove: string[] = [];

  if (state.debugMode) {
    console.group(`%c[Hooks] ▸ ${point}`, COLORS.lifecycle);
    console.log(`%cExecuting ${applicableHooks.length} hook(s) for ${currentProperty}`, COLORS.info);
  }

  for (const hook of applicableHooks) {
    try {
      if (state.debugMode) {
        console.log(`%c  → ${hook.name}`, COLORS.hook, hook.async ? '(async)' : '');
      }

      let result;
      if (hook.async) {
        result = await hook.fn(...args);
      } else {
        result = hook.fn(...args);
      }

      results.push({ name: hook.name, success: true, result });
      recordExecution({
        point,
        hook: hook.name,
        status: 'executed',
        timestamp: Date.now()
      });

      if (hook.once) {
        hooksToRemove.push(hook.name);
      }

      if (state.debugMode) {
        console.log(`%c    ✓ Complete`, COLORS.success);
      }
    } catch (error) {
      results.push({ name: hook.name, success: false, error });
      recordExecution({
        point,
        hook: hook.name,
        status: 'error',
        timestamp: Date.now(),
        reason: String(error)
      });

      console.error(
        `%c[Hooks] Error in ${hook.name} at ${point}:`,
        COLORS.error,
        error
      );
    }
  }

  // Remove one-time hooks
  hooksToRemove.forEach(name => unregister(point, name));

  const elapsed = (performance.now() - startTime).toFixed(2);

  if (state.debugMode) {
    console.log(`%cCompleted in ${elapsed}ms`, COLORS.info);
    console.groupEnd();
  }

  log(`Executed ${point}`, { hooks: results.length, elapsed: elapsed + 'ms' });

  return { point, hooks: registry[point].map(h => h.name), results, elapsed };
}

/**
 * Execute hooks synchronously (for critical path where async not allowed)
 * @param {string} point - Lifecycle point name
 * @param {...*} args - Arguments to pass to hook functions
 * @returns {Object} Results from all hooks
 */
export function executeSync(point: string, ...args: any[]) {
  if (!registry[point] || registry[point].length === 0) {
    if (state.debugMode) {
      console.log(
        `%c[Hooks] ▸ ${point}%c (no hooks, sync)`,
        COLORS.lifecycle, COLORS.info
      );
    }
    return { point, hooks: [], results: [] };
  }

  // Filter hooks by property and dimensions, tracking skipped hooks
  const currentProperty = getProperty();
  const applicableHooks: any[] = [];

  for (const hook of registry[point]) {
    // First check property
    if (!matchesProperty(hook.properties, currentProperty)) {
      recordExecution({
        point,
        hook: hook.name,
        status: 'skipped:property',
        timestamp: Date.now(),
        reason: `Property mismatch: ${currentProperty}`
      });
      continue;
    }
    // Then check dimensions (match/exclude rules)
    if (!matchesDimensions(hook)) {
      recordExecution({
        point,
        hook: hook.name,
        status: 'skipped:dimensions',
        timestamp: Date.now(),
        reason: 'Dimension match/exclude rules not satisfied'
      });
      if (state.debugMode) {
        log(`Hook ${hook.name} skipped - dimensions not matched (sync)`);
      }
      continue;
    }
    applicableHooks.push(hook);
  }

  if (applicableHooks.length === 0) {
    if (state.debugMode) {
      console.log(
        `%c[Hooks] ▸ ${point}%c (no hooks for environment: ${currentProperty}, sync)`,
        COLORS.lifecycle, COLORS.info
      );
    }
    return { point, hooks: [], results: [] };
  }

  const startTime = performance.now();
  const results: Array<{ name: any; success: boolean; result?: any; error?: unknown }> = [];
  const hooksToRemove: string[] = [];

  if (state.debugMode) {
    console.group(`%c[Hooks] ▸ ${point} (sync)`, COLORS.lifecycle);
    console.log(`%cExecuting ${applicableHooks.length} hook(s) for ${currentProperty}`, COLORS.info);
  }

  for (const hook of applicableHooks) {
    try {
      if (state.debugMode) {
        console.log(`%c  → ${hook.name}`, COLORS.hook);
      }

      const result = hook.fn(...args);
      results.push({ name: hook.name, success: true, result });
      recordExecution({
        point,
        hook: hook.name,
        status: 'executed',
        timestamp: Date.now()
      });

      if (hook.once) {
        hooksToRemove.push(hook.name);
      }
    } catch (error) {
      results.push({ name: hook.name, success: false, error });
      recordExecution({
        point,
        hook: hook.name,
        status: 'error',
        timestamp: Date.now(),
        reason: String(error)
      });
      console.error(`%c[Hooks] Error in ${hook.name}:`, COLORS.error, error);
    }
  }

  hooksToRemove.forEach(name => unregister(point, name));

  const elapsed = (performance.now() - startTime).toFixed(2);

  if (state.debugMode) {
    console.log(`%cCompleted in ${elapsed}ms`, COLORS.info);
    console.groupEnd();
  }

  log(`Executed ${point}`, { hooks: results.length, elapsed: elapsed + 'ms' });

  return { point, hooks: registry[point].map(h => h.name), results, elapsed };
}

/**
 * Get module state
 * @returns {Object} Copy of module state
 */
export function getState() {
  return {
    ...state,
    registeredHooks: Object.fromEntries(
      Object.entries(registry).map(([point, hooks]) => [
        point,
        (hooks as any[]).map(h => ({ name: h.name, priority: h.priority }))
      ]).filter(([, hooks]) => (hooks as any[]).length > 0)
    )
  };
}

/**
 * Get all registered hooks for a lifecycle point
 * @param {string} point - Lifecycle point
 * @returns {Array} Registered hooks
 */
export function getHooks(point: string) {
  return registry[point] ? [...registry[point]] : [];
}

/**
 * Get all available lifecycle points
 * @returns {Object} Lifecycle points with descriptions
 */
export function getLifecyclePoints() {
  return { ...LIFECYCLE_POINTS };
}

/**
 * Clear all hooks (useful for testing or SPA navigation)
 */
export function clear() {
  Object.keys(registry).forEach(point => {
    registry[point] = [];
  });
  log('All hooks cleared');
}

/**
 * Reset module state
 */
export function reset() {
  clear();
  clearExecutionHistory();
  state = {
    initialized: false,
    debugMode: false
  };
  log('Reset complete');
}

/**
 * Enable/disable debug mode
 * @param {boolean} enabled - Enable debug output
 */
export function setDebug(enabled: boolean) {
  state.debugMode = enabled;
  if (enabled) {
    logLifecyclePoints();
  }
}

/**
 * Get execution history - shows which hooks ran and which were skipped
 * @param {string} [hookName] - Optional filter by hook name
 * @returns {Array} Execution history records
 */
export function getExecutionHistory(hookName?: string) {
  if (hookName) {
    return executionHistory.filter(r => r.hook === hookName);
  }
  return [...executionHistory];
}

/**
 * Clear execution history
 */
export function clearExecutionHistory() {
  executionHistory.length = 0;
}

export default {
  init,
  register,
  unregister,
  execute,
  executeSync,
  getState,
  getHooks,
  getLifecyclePoints,
  clear,
  reset,
  setDebug,
  getExecutionHistory,
  clearExecutionHistory
};
