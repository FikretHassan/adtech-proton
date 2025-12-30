/**
 * Amazon APS (TAM) Adapter Scaffold
 *
 * Copy this file to amazonaps.js and configure for your site.
 * Implements WrapperAdapter interface for the wrapperAuctions orchestrator.
 *
 * Setup:
 * 1. Set ADAPTER_NAME to match your partner name in partners.json
 * 2. Configure apsPropertyConfig with your Amazon credentials
 * 3. Implement getSlotConfigs() for your slot taxonomy
 * 4. Register in config/wrapperauctions/index.js
 */

// ============================================================================
// ADAPTER NAME - Must match partner name in partners.json
// ============================================================================
const ADAPTER_NAME = 'amazonaps';

import sizemapping from '../../src/sizemapping.js';
import adTargeting from '../../src/adTargeting.js';
import CONFIG from '../loader.js';
import { getProperty } from '../../src/property.js';

// ============================================================================
// Publisher Configuration
// ============================================================================

/**
 * Property-keyed APS configuration
 * Add your credentials here for each property/environment
 */
const apsPropertyConfig = {
  // Example property
  mysite: {
    pubID: 'YOUR_AMAZON_PUB_ID',
    adServer: 'googletag',
    slotPrefix: 'advert'
  },

  // Fallback for unknown properties
  default: {
    pubID: 'YOUR_DEFAULT_PUB_ID',
    adServer: 'googletag',
    slotPrefix: 'advert'
  }
};

// ============================================================================
// Internal Helpers
// ============================================================================

let apsInitialized = false;

function getApsConfig() {
  const property = getProperty();
  return apsPropertyConfig[property] || apsPropertyConfig.default;
}

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
 * Build slot params - passes through targeting with slot identifier
 */
function getCustomData(slotId) {
  const targeting = adTargeting.buildPageTargeting();
  return { ...targeting, div: slotId };
}

// ============================================================================
// Slot Configuration
// ============================================================================

/**
 * Get slot configs for current context
 * Uses sizemapping breakpoint to determine appropriate sizes
 */
function getSlotConfigs(context = {}) {
  const config = getApsConfig();
  const prefix = config.slotPrefix;
  const slotName = buildSlotName(context);
  const viewport = context.viewport || sizemapping.getBreakpoint();
  const slots = [];

  // Example: Use viewport to determine sizes
  // const isDesktop = viewport === 'x' || viewport === 'l';
  // const bannerSizes = isDesktop ? [[970, 250], [728, 90]] : [[320, 50]];
  //
  // slots.push({
  //   slotID: `${prefix}_ban`,
  //   slotName: slotName,
  //   sizes: bannerSizes,
  //   slotParams: getCustomData(`${prefix}_ban`)
  // });

  return slots;
}

// ============================================================================
// WrapperAdapter Implementation
// ============================================================================

const amazonAdapter = {
  name: ADAPTER_NAME,

  isLibraryLoaded() {
    return typeof window.apstag !== 'undefined';
  },

  init(context) {
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
    const slots = getSlotConfigs(context);
    return slots.some(s => s.slotID === slotId);
  },

  getAdUnit(slotId, context) {
    const slots = getSlotConfigs(context);
    return slots.find(s => s.slotID === slotId) || null;
  },

  async requestBids(slotId, context, timeout) {
    if (!this.isLibraryLoaded()) {
      return { success: false, reason: 'apstag not loaded', bids: [] };
    }

    const slotConfig = this.getAdUnit(slotId, context);
    if (!slotConfig) {
      return { success: false, reason: 'No slot config', bids: [] };
    }

    if (!apsInitialized) {
      this.init(context);
    }

    return new Promise((resolve) => {
      window.apstag.fetchBids({
        slots: [{
          slotID: slotId,
          slotName: slotConfig.slotName,
          sizes: slotConfig.sizes,
          slotParams: slotConfig.slotParams
        }],
        timeout: timeout
      }, (bids) => {
        const slotBids = bids.filter(b => b.slotID === slotId);

        const bidResults = slotBids.map(bid => ({
          slotId,
          hasBid: true,
          cpm: parseFloat(bid.amzniid_cpm) || 0,
          bidder: ADAPTER_NAME,
          responseTime: undefined,
          raw: bid
        }));

        if (bidResults.length === 0) {
          bidResults.push({ slotId, hasBid: false });
        }

        resolve({ success: true, bids: bidResults });
      });
    });
  },

  applyTargeting(slotId) {
    if (!this.isLibraryLoaded()) return;
    window.apstag.setDisplayBids();
  },

  clearSlot(slotId) {
    // Amazon APS handles slot state internally
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

export default amazonAdapter;
