/**
 * Pre-Request Hooks
 * Allows partners to register callbacks that must complete before ad requests
 * Resilient to partner timeouts, errors, and exclusions
 */

import { TIMEOUTS } from './constants';

const LOG_PREFIX = '[PreRequestHooks]';

// Hook configuration type
interface HookConfig {
  readyFn: string;
  timeout: number;
}

// Registry of hooks from plugins with beforeRequest config
const hooks = new Map<string, HookConfig>();

// Reference to loader (set during init)
let loaderRef: any = null;

// Default timeout per hook (ms)
const DEFAULT_HOOK_TIMEOUT = TIMEOUTS.HOOK;

/**
 * Log helper - uses loader.log if available
 */
function log(msg: string, data: unknown = null): void {
  if (loaderRef?.log) {
    loaderRef.log(`${LOG_PREFIX} ${msg}`, data);
  }
}

/**
 * Warning helper - logs AND console.warn for visibility
 */
function warn(msg: string, data: unknown = null): void {
  log(msg, data);
  if (data !== null) {
    console.warn(`${LOG_PREFIX} ${msg}`, data);
  } else {
    console.warn(`${LOG_PREFIX} ${msg}`);
  }
}

/**
 * Initialize with loader reference
 * @param {Object} loader - Proton instance
 */
export function init(loader: any) {
  loaderRef = loader;
  log('Initialized');
}

/**
 * Register a pre-request hook for a plugin
 * Called automatically for plugins with beforeRequest config
 * @param {string} pluginName - Plugin name
 * @param {Object} config - { readyFn: string, timeout?: number }
 */
export function registerHook(pluginName: string, config: { readyFn: string; timeout?: number }) {
  if (!config || !config.readyFn) {
    warn(`registerHook: Invalid config for ${pluginName}`, config);
    return;
  }

  hooks.set(pluginName, {
    readyFn: config.readyFn,
    timeout: config.timeout || DEFAULT_HOOK_TIMEOUT
  });

  log(`Registered hook: ${pluginName}`, {
    readyFn: config.readyFn,
    timeout: config.timeout || DEFAULT_HOOK_TIMEOUT
  });
}

/**
 * Unregister a hook
 * @param {string} pluginName - Plugin name
 */
export function unregisterHook(pluginName: string) {
  if (hooks.has(pluginName)) {
    hooks.delete(pluginName);
    log(`Unregistered hook: ${pluginName}`);
  }
}

/**
 * Get window function by path (e.g., "onVendorReady" or "window.vendor.ready")
 * @param {string} path - Function path
 * @returns {Function|null}
 */
function getWindowFunction(path: string) {
  if (!path || typeof window === 'undefined') return null;

  // Remove "window." prefix if present
  const cleanPath = path.replace(/^window\./, '');

  // Handle nested paths like "some.nested.fn"
  const parts = cleanPath.split('.');
  let obj: any = window;

  for (const part of parts) {
    if (obj && typeof obj === 'object' && part in obj) {
      obj = obj[part];
    } else {
      return null;
    }
  }

  return typeof obj === 'function' ? obj : null;
}

/**
 * Run all registered pre-request hooks
 * Only waits for plugins that are 'loaded'
 * @param {string} slotId - Slot ID (for logging)
 * @returns {Promise} Resolves when all applicable hooks complete (or timeout)
 */
export async function runHooks(slotId: string): Promise<void> {
  if (hooks.size === 0) {
    return; // No hooks registered
  }

  const promises: Promise<void>[] = [];
  const hookResults: Array<{ plugin: string; result: string; reason?: string; elapsed?: number; error?: string }> = [];

  for (const [pluginName, config] of hooks) {
    // Check plugin status via loader
    const plugin = loaderRef?.getPlugin?.(pluginName);
    const status = plugin?.status;

    // Only wait for plugins that loaded successfully
    if (status !== 'loaded') {
      log(`${pluginName}: skipped (status=${status || 'unknown'})`);
      hookResults.push({ plugin: pluginName, result: 'skipped', reason: status || 'unknown' });
      continue;
    }

    // Get the ready function from window
    const readyFn = getWindowFunction(config.readyFn);

    if (typeof readyFn !== 'function') {
      log(`${pluginName}: skipped (${config.readyFn} not found)`);
      hookResults.push({ plugin: pluginName, result: 'skipped', reason: 'readyFn not found' });
      continue;
    }

    // Create promise that either resolves via callback or times out
    const hookPromise = new Promise<void>((resolve) => {
      let resolved = false;
      const startTime = performance.now();

      // Timeout safety net
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const elapsed = Math.round(performance.now() - startTime);
          warn(`${pluginName}: TIMEOUT after ${elapsed}ms waiting for ${config.readyFn}`, {
            slotId,
            timeout: config.timeout,
            readyFn: config.readyFn
          });
          hookResults.push({ plugin: pluginName, result: 'timeout', elapsed });
          resolve();
        }
      }, config.timeout);

      // Call the ready function with callback
      try {
        readyFn(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            const elapsed = Math.round(performance.now() - startTime);
            log(`${pluginName}: ready (${elapsed}ms)`);
            hookResults.push({ plugin: pluginName, result: 'ready', elapsed });
            resolve();
          }
        });
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          warn(`${pluginName}: error calling ${config.readyFn}`, err);
          hookResults.push({ plugin: pluginName, result: 'error', error: err instanceof Error ? err.message : String(err) });
          resolve();
        }
      }
    });

    promises.push(hookPromise);
  }

  if (promises.length > 0) {
    log(`Running ${promises.length} hook(s) for ${slotId}`);
    await Promise.all(promises);
    log(`All hooks complete for ${slotId}`, hookResults);
  }
}

/**
 * Wrap a display function with hooks and requestAnimationFrame
 * @param {string} slotId - Slot ID
 * @param {Function} displayFn - Function to call after hooks (e.g., googletag.display)
 * @returns {Promise}
 */
export async function wrapWithHooks(slotId: string, displayFn: () => void): Promise<void> {
  // Run all applicable hooks first
  await runHooks(slotId);

  // Use requestAnimationFrame for best practice (defers to next repaint)
  return new Promise<void>((resolve) => {
    const raf = window.requestAnimationFrame || ((cb: FrameRequestCallback) => setTimeout(cb, 0));
    raf(() => {
      try {
        displayFn();
        resolve();
      } catch (err) {
        warn(`Error in display function for ${slotId}`, err);
        resolve();
      }
    });
  });
}

/**
 * Get registered hooks (for debugging)
 * @returns {Object}
 */
export function getHooks() {
  const result: Record<string, HookConfig> = {};
  for (const [name, config] of hooks) {
    result[name] = { ...config };
  }
  return result;
}

/**
 * Check if any hooks are registered
 * @returns {boolean}
 */
export function hasHooks() {
  return hooks.size > 0;
}

/**
 * Reset all hooks (for testing/SPA navigation)
 */
export function reset() {
  hooks.clear();
  log('Reset - all hooks cleared');
}

export default {
  init,
  registerHook,
  unregisterHook,
  runHooks,
  wrapWithHooks,
  getHooks,
  hasHooks,
  reset
};
