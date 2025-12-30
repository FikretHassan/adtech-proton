/**
 * Functions Utility Module
 * Runtime utility functions for slot lifecycle management
 *
 * Filter pattern:
 *   - 'all': all slots
 *   - string: exact slot ID (e.g., 'advert_mysite_dyn_5')
 *   - object: { adtype: 'dyn' } to match all slots of that type
 */

import CONFIG from '../config/loader.js';
import rawPropertiesConfig from '../config/properties.json';
import { resolveConfig } from './propertyConfig';

const LOG_PREFIX = '[Functions]';

/**
 * Get resolved slots config (common + property-specific merged)
 * Now reads from properties.json which contains both domains and slot config
 */
function getSlotsConfig() {
  const common = (rawPropertiesConfig as any).common || {};
  const propertyConfig = resolveConfig((rawPropertiesConfig as any).properties || rawPropertiesConfig) || {};
  return { ...common, ...(propertyConfig as object) };
}

// Resolved config (lazily evaluated on first access)
let _slotsConfig: any = null;
function getResolvedConfig() {
  if (!_slotsConfig) {
    _slotsConfig = getSlotsConfig();
  }
  return _slotsConfig;
}

// Proxy for config access - resolves config on property access
const slotsConfig = new Proxy({} as any, {
  get(target, prop) {
    return getResolvedConfig()[prop];
  }
});

function getLoader() {
  return window[CONFIG.globalName];
}

function log(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${message}`, data);
  }
}

/**
 * Get all slot IDs currently in DOM
 */
function getAllSlotIds() {
  return Array.from(document.querySelectorAll(slotsConfig.selector)).map(el => el.id).filter(Boolean);
}

/**
 * Get slot ID prefix from config (e.g., "advert_mysite_" from prefix "mysite")
 */
function getSlotPrefix() {
  return `advert_${slotsConfig.prefix}_`;
}

/**
 * Disconnect lazy observers matching filter
 * Prevents orphaned observers from firing after slot destruction
 * @param {string|Object} filter - 'all', exact slot ID, or { adtype: 'dyn' }
 */
export function disconnectObservers(filter: string | { adtype?: string }) {
  if (!filter) {
    log('disconnectObservers: no filter provided');
    return;
  }

  const loader = getLoader();
  if (!loader?.slots?.disconnectObservers) {
    log('disconnectObservers: slots module not available');
    return;
  }

  // Convert adtype filter to adType for slots module
  const slotsFilter = typeof filter === 'object' && filter?.adtype ? { adType: filter.adtype } : filter;
  const count = loader.slots.disconnectObservers(slotsFilter);
  log(`disconnectObservers: disconnected ${count}`, { filter });
}

/**
 * Destroy ad slots matching filter
 * Cleans up: GPT slot, refresh timers, observers, wrapper auction state
 * @param {string|Object} filter - 'all', exact slot ID, or { adtype: 'dyn' }
 */
export function destroySlots(filter: string | { adtype?: string }) {
  if (!filter) {
    log('destroySlots: no filter provided');
    return;
  }

  const loader = getLoader();
  if (!loader) return;

  const validIds = getAllSlotIds();
  const prefix = getSlotPrefix();
  const allSlots = loader.ads || {};

  const isAll = filter === 'all';
  const isExactId = typeof filter === 'string' && filter !== 'all';
  const adtype = !isExactId && !isAll && filter?.adtype ? filter.adtype : null;

  // Validate filter matches something (skip for 'all')
  if (isExactId && !validIds.includes(filter)) {
    log('destroySlots: no matching div id found', filter);
    return;
  }
  if (adtype && !validIds.some(id => id.includes(`${prefix}${adtype}_`))) {
    log('destroySlots: no matching adtype found', adtype);
    return;
  }

  let destroyedCount = 0;

  for (const slotId in allSlots) {
    let shouldDestroy = false;

    if (isAll) {
      shouldDestroy = true;
    } else if (isExactId) {
      shouldDestroy = (slotId === filter);
    } else if (adtype) {
      shouldDestroy = slotId.includes(`${prefix}${adtype}_`);
    }

    if (shouldDestroy) {
      // Clear wrapper auction state
      if (loader.wrapperAuctions?.clearAuction) {
        loader.wrapperAuctions.clearAuction(slotId);
      }

      // Destroy the GPT slot (this also cancels refresh timer and removes observer)
      if (loader.slots?.destroySlot) {
        loader.slots.destroySlot(slotId);
        destroyedCount++;
      }
    }
  }

  log(`destroySlots: destroyed ${destroyedCount}`, { filter });
}

/**
 * Recreate ad slots matching filter
 * 1. Disconnects observers for filter
 * 2. Destroys slots for filter
 * 3. Clears observed class so slots can be re-processed
 * 4. Calls requestAds to recreate
 *
 * @param {string|Object} filter - 'all', exact slot ID, or { adtype: 'dyn' }
 */
export function recreate(filter: string | { adtype?: string }) {
  if (!filter) {
    log('recreate: no filter provided');
    return;
  }

  const loader = getLoader();
  if (!loader) return;

  const validIds = getAllSlotIds();
  const prefix = getSlotPrefix();

  const isAll = filter === 'all';
  const isExactId = typeof filter === 'string' && filter !== 'all';
  const adtype = !isExactId && !isAll && filter?.adtype ? filter.adtype : null;

  log('recreate: starting', { filter });

  // 1. Disconnect observers (prevents orphaned callbacks)
  disconnectObservers(filter);

  // 2. Destroy slots
  destroySlots(filter);

  // 3. Clear observed class on matching elements so they can be re-processed
  const observedClass = slotsConfig.observedClass;
  const loadedClass = slotsConfig.loadedClass;

  validIds.forEach(slotId => {
    let shouldClear = false;

    if (isAll) {
      shouldClear = true;
    } else if (isExactId) {
      shouldClear = (slotId === filter);
    } else if (adtype) {
      shouldClear = slotId.includes(`${prefix}${adtype}_`);
    }

    if (shouldClear) {
      const el = document.getElementById(slotId);
      if (el) {
        el.classList.remove(observedClass);
        el.classList.remove(loadedClass);
      }
    }
  });

  // 4. Re-process slots (will pick up unobserved ones)
  if (loader.requestAds) {
    loader.requestAds();
  }

  log('recreate: complete', { filter });
}

// ============================================================================
// Module Init
// ============================================================================

let initialized = false;

export function init() {
  if (initialized) return;
  initialized = true;
  log('Initialized');
}

// ============================================================================
// Default Export
// ============================================================================

export default {
  init,
  disconnectObservers,
  destroySlots,
  recreate
};
