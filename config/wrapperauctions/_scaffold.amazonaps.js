/**
 * Amazon APS (TAM) Adapter Scaffold
 *
 * Copy this file and customize for your Amazon APS implementation.
 * See docs/wrapperAuctions.md for full documentation.
 *
 * Required customizations:
 * 1. ADAPTER_NAME - Must match partner name in partners.json
 * 2. apsConfig - Your publisher credentials per property
 * 3. Slot name/path building for your site structure
 */

// ============================================================================
// ADAPTER NAME - Must match partner name in partners.json
// ============================================================================
const ADAPTER_NAME = 'amazonaps';

import slotResolver from '../../src/optional/wrapperSlotResolver.js';
import adTargeting from '../../src/adTargeting.js';
import CONFIG from '../loader.js';
import { getProperty } from '../../src/property.js';

// ============================================================================
// Publisher Configuration
// ============================================================================

/**
 * Property-keyed APS configuration
 * Add your credentials for each property/environment
 */
const apsConfig = {
  // Example property configuration
  mysite: {
    pubID: 'YOUR_AMAZON_PUB_ID',
    adServer: 'googletag'
  },

  // Default fallback
  default: {
    pubID: 'DEFAULT_AMAZON_PUB_ID',
    adServer: 'googletag'
  }
};

// ============================================================================
// Internal Helpers
// ============================================================================

let apsInitialized = false;

function getApsConfig() {
  const property = getProperty();
  return apsConfig[property] || apsConfig.default;
}

/**
 * Build slot name for Amazon
 * Customize this for your site's ad unit path structure
 */
function buildSlotName(context = {}) {
  const loader = window[CONFIG.globalName];
  if (loader?.slots?.buildAdUnitPath) {
    return loader.slots.buildAdUnitPath({
      site: context.site || 'default',
      zone: context.zone || 'ros'
    });
  }
  return null;
}

/**
 * Build custom data for slot (targeting key-values)
 */
function getCustomData(slotId) {
  const targeting = adTargeting.buildPageTargeting();
  return { ...targeting, div: slotId };
}

// ============================================================================
// WrapperAdapter Implementation
// ============================================================================

const amazonAdapter = {
  name: ADAPTER_NAME,

  isLibraryLoaded() {
    return typeof window.apstag !== 'undefined';
  },

  init(_context) {
    if (apsInitialized) return;
    if (!this.isLibraryLoaded()) return;

    const config = getApsConfig();
    window.apstag.init({
      pubID: config.pubID,
      adServer: config.adServer
    });

    apsInitialized = true;
  },

  hasSlotConfig(slotId, context) {
    return slotResolver.hasSlotConfig(slotId, ADAPTER_NAME, context);
  },

  getAdUnit(slotId, context) {
    const resolvedConfig = slotResolver.resolveSlotConfigForAmazonAps(slotId, context);
    if (!resolvedConfig) {
      return null;
    }

    return {
      slotID: slotId,
      slotName: buildSlotName(context),
      sizes: resolvedConfig.sizes,
      slotParams: getCustomData(slotId)
    };
  },

  async requestBids(slotId, context, timeout) {
    if (!this.isLibraryLoaded()) {
      return { success: false, reason: 'apstag not loaded', bids: [] };
    }

    const adUnitConfig = this.getAdUnit(slotId, context);
    if (!adUnitConfig) {
      return { success: false, reason: 'No adUnit config', bids: [] };
    }

    if (!apsInitialized) {
      this.init(context);
    }

    return new Promise((resolve) => {
      window.apstag.fetchBids(
        { slots: [adUnitConfig], timeout },
        (bids) => {
          const bidResults = bids.map(bid => ({
            slotId,
            hasBid: !!bid.amznbid,
            cpm: bid.amzniid ? parseFloat(bid.amzniid) : 0,
            bidder: ADAPTER_NAME,
            raw: bid
          }));

          if (bidResults.length === 0) {
            bidResults.push({ slotId, hasBid: false });
          }

          resolve({
            success: true,
            bids: bidResults
          });
        }
      );
    });
  },

  applyTargeting(slotId) {
    if (!this.isLibraryLoaded()) return;
    window.apstag.setDisplayBids();
  },

  clearSlot(slotId) {
    // Amazon doesn't require explicit cleanup
  },

  getState() {
    return {
      initialized: apsInitialized,
      libraryLoaded: this.isLibraryLoaded(),
      property: getProperty()
    };
  }
};

// ============================================================================
// Exports
// ============================================================================

export const apsConfigExport = apsConfig;
export const hasAdUnit = (slotId, context) => amazonAdapter.hasSlotConfig(slotId, context);
export const getAdUnit = (slotId, context) => amazonAdapter.getAdUnit(slotId, context);
export { getApsConfig };

export default amazonAdapter;
