/**
 * Demo Lifecycle Hooks
 *
 * This file demonstrates the hooks system by logging a message at every lifecycle point.
 * Enable debug mode with ?hooksDebug to see colored console output.
 *
 * To use: Import and spread into your hooks config, or register at runtime.
 */

import { PRIORITIES } from '../../src/constants';

// Console styling for demo output
const DEMO_STYLE = 'background: #1a1a2e; color: #00ff88; padding: 2px 6px; border-radius: 3px;';

/**
 * Create a demo hook that logs when it executes
 * @param {string} point - Lifecycle point name
 * @param {string} [suffix=''] - Optional suffix for multiple hooks at same point
 * @returns {Object} Hook configuration
 */
function createDemoHook(point, suffix = '') {
  const name = suffix ? `demo_${point}_${suffix}` : `demo_${point}`;
  return {
    name,
    priority: PRIORITIES.DEBUG,
    fn: (...args) => {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
      console.info(
        `%cADTECH HOOK: ${point}`,
        DEMO_STYLE,
        `@ ${timestamp}`,
        args.length > 0 ? { args } : ''
      );
    }
  };
}

/**
 * Demo hooks for all lifecycle points
 * Shows a console message when each hook fires
 */
export const demoHooks = {
  // =========================================================================
  // INIT PHASE
  // =========================================================================
  'loader.beforeInit': [
    createDemoHook('loader.beforeInit'),
    // Example of multiple hooks at same point
    {
      name: 'demo_beforeInit_timestamp',
      priority: PRIORITIES.DEBUG,
      fn: () => {
        window.__adtechInitStart = performance.now();
        console.info('%cADTECH HOOK: loader.beforeInit (timestamp set)', DEMO_STYLE);
      }
    }
  ],

  'loader.afterInit': [
    createDemoHook('loader.afterInit')
  ],

  // =========================================================================
  // PARTNERS PHASE
  // =========================================================================
  'partners.afterReady': [
    createDemoHook('partners.afterReady'),
    // Example: Multiple hooks - one logs, one tracks timing
    {
      name: 'demo_afterReady_timing',
      priority: PRIORITIES.DEBUG,
      fn: (status, elapsed) => {
        const initTime = window.__adtechInitStart
          ? (performance.now() - window.__adtechInitStart).toFixed(2)
          : 'N/A';
        console.info(
          '%cADTECH HOOK: partners.afterReady (timing)',
          DEMO_STYLE,
          `Partners: ${elapsed}ms, Total init: ${initTime}ms`
        );
      }
    }
  ],

  'partners.onTimeout': [
    createDemoHook('partners.onTimeout')
  ],

  // =========================================================================
  // SLOTS PHASE
  // =========================================================================
  'slot.beforeDefine': [
    createDemoHook('slot.beforeDefine')
  ],

  'slot.afterDefine': [
    createDemoHook('slot.afterDefine')
  ],

  // =========================================================================
  // ADS PHASE
  // =========================================================================
  'ads.beforeRequest': [
    createDemoHook('ads.beforeRequest')
  ],

  'slot.beforeRequest': [
    createDemoHook('slot.beforeRequest')
  ],

  'slot.afterRequest': [
    createDemoHook('slot.afterRequest')
  ],

  'ads.afterRequest': [
    createDemoHook('ads.afterRequest')
  ],

  // =========================================================================
  // RENDER PHASE
  // =========================================================================
  'slot.beforeRender': [
    createDemoHook('slot.beforeRender')
  ],

  'slot.afterRender': [
    createDemoHook('slot.afterRender'),
    // Example: Multiple hooks - track rendered slots
    {
      name: 'demo_afterRender_counter',
      priority: PRIORITIES.DEBUG,
      fn: (slotId) => {
        window.__adtechRenderedSlots = window.__adtechRenderedSlots || [];
        window.__adtechRenderedSlots.push(slotId);
        console.info(
          '%cADTECH HOOK: slot.afterRender (counter)',
          DEMO_STYLE,
          `Total rendered: ${window.__adtechRenderedSlots.length}`
        );
      }
    }
  ],

  'slot.onEmpty': [
    createDemoHook('slot.onEmpty')
  ],

  // =========================================================================
  // REFRESH PHASE
  // =========================================================================
  'slot.beforeRefresh': [
    createDemoHook('slot.beforeRefresh')
  ],

  'slot.afterRefresh': [
    createDemoHook('slot.afterRefresh')
  ],

  // =========================================================================
  // INJECTION PHASE
  // =========================================================================
  'injection.beforeInject': [
    createDemoHook('injection.beforeInject')
  ],

  'injection.afterInject': [
    createDemoHook('injection.afterInject')
  ]
};

/**
 * Register all demo hooks at runtime
 * Call this to enable demo logging without modifying config/hooks.js
 *
 * Usage:
 *   import { registerDemoHooks } from './config/demoHooks.js';
 *   registerDemoHooks(proton.hooks);
 */
export function registerDemoHooks(hooksModule) {
  if (!hooksModule || typeof hooksModule.register !== 'function') {
    console.error('Invalid hooks module provided to registerDemoHooks');
    return;
  }

  let count = 0;
  Object.entries(demoHooks).forEach(([point, hooks]) => {
    hooks.forEach(hook => {
      hooksModule.register(point, hook);
      count++;
    });
  });

  console.info(
    '%cADTECH: Registered %d demo hooks across %d lifecycle points',
    DEMO_STYLE,
    count,
    Object.keys(demoHooks).length
  );
}

/**
 * Unregister all demo hooks
 */
export function unregisterDemoHooks(hooksModule) {
  if (!hooksModule || typeof hooksModule.unregister !== 'function') {
    console.error('Invalid hooks module provided to unregisterDemoHooks');
    return;
  }

  Object.entries(demoHooks).forEach(([point, hooks]) => {
    hooks.forEach(hook => {
      hooksModule.unregister(point, hook.name);
    });
  });

  console.info('%cADTECH: Demo hooks unregistered', DEMO_STYLE);
}

export default demoHooks;
