/**
 * Prebid.js Adapter Scaffold
 *
 * Copy this file to prebid.js and configure for your site.
 * Implements WrapperAdapter interface for the wrapperAuctions orchestrator.
 *
 * Setup:
 * 1. Set ADAPTER_NAME to match your partner name in partners.json
 * 2. Configure bidderConfig with your credentials
 * 3. Configure prebidSetConfig with your Prebid settings
 * 4. Implement getAdUnits() for your slot taxonomy
 * 5. Register in config/wrapperauctions/index.js
 */

// ============================================================================
// ADAPTER NAME - Must match partner name in partners.json
// ============================================================================
const ADAPTER_NAME = 'prebid';

import sizemapping from '../../src/sizemapping.js';
import adTargeting from '../../src/adTargeting.js';
import CONFIG from '../loader.js';
import { getProperty } from '../../src/property.js';

// ============================================================================
// Publisher Configuration
// ============================================================================

/**
 * Property-keyed bidder configuration
 * Add your credentials here for each property/environment
 */
const bidderConfig = {
  // Example property
  mysite: {
    appnexus: {
      placementId: 'YOUR_PLACEMENT_ID'
    },
    rubicon: {
      accountId: 'YOUR_ACCOUNT_ID',
      siteId: 'YOUR_SITE_ID',
      zoneId: 'YOUR_ZONE_ID'
    },
    slotPrefix: 'advert'
  },

  // Fallback for unknown properties
  default: {
    appnexus: {
      placementId: 'YOUR_DEFAULT_PLACEMENT_ID'
    },
    slotPrefix: 'advert'
  }
};

/**
 * Prebid setConfig options
 * Applied once when adapter initializes
 */
const prebidSetConfig = {
  debug: false,

  priceGranularity: {
    buckets: [
      { precision: 2, max: 5, increment: 0.05 },
      { precision: 2, max: 20, increment: 0.10 },
      { precision: 2, max: 100, increment: 1.00 }
    ]
  },

  consentManagement: {
    cmpApi: 'iab',
    timeout: 800,
    allowAuctionWithoutConsent: false
  },

  userSync: {
    syncEnabled: true,
    syncDelay: 3000,
    syncsPerBidder: 5,
    filterSettings: {
      all: { bidders: '*', filter: 'include' }
    }
  },

  userIds: [
    // { name: 'sharedId', storage: { name: '_sharedID', type: 'cookie', expires: 30 } }
  ]
};

// ============================================================================
// Internal Helpers
// ============================================================================

let configApplied = false;

function getBidderConfig() {
  const property = getProperty();
  return bidderConfig[property] || bidderConfig.default;
}

function getAdUnitPath(context = {}) {
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
 * Build ortb2Imp (OpenRTB 2.x impression-level data)
 * Passes through all targeting key-values, adding only the slot identifier
 */
function buildOrtb2Imp(slotId, context = {}) {
  const adUnitPath = getAdUnitPath(context);
  const targeting = adTargeting.buildPageTargeting();

  return {
    ext: {
      gpid: adUnitPath ? `${adUnitPath}-${slotId}` : slotId,
      data: {
        ...targeting,
        div: slotId
      }
    }
  };
}

/**
 * Build bidders array for a slot
 * Each bidder has its own params structure - configure per your SSP contracts
 */
function buildBids(slotId, placementKey) {
  const config = getBidderConfig();
  return [
    // Example: AppNexus/Xandr
    // {
    //   bidder: 'appnexus',
    //   params: {
    //     placementId: config.appnexus?.placementId
    //   }
    // },

    // Example: Rubicon/Magnite
    // {
    //   bidder: 'rubicon',
    //   params: {
    //     accountId: config.rubicon?.accountId,
    //     siteId: config.rubicon?.siteId,
    //     zoneId: config.rubicon?.zoneId
    //   }
    // }
  ];
}

// ============================================================================
// Bidder-Specific Helpers (optional)
// Some bidders require targeting in proprietary formats beyond standard ortb2.
// Add helper functions here to transform targeting for specific bidders.
// ============================================================================

// Example: Bidder requiring targeting in a custom wrapper format
// function buildCustomBidderTargeting(slotId) {
//   const targeting = adTargeting.buildPageTargeting();
//   return [{
//     settings: {},
//     targeting: { ...targeting, div: slotId }
//   }];
// }
//
// Then use in buildBids():
// {
//   bidder: 'customBidder',
//   params: {
//     publisherId: config.customBidder?.publisherId,
//     customData: buildCustomBidderTargeting(slotId)
//   }
// }

// ============================================================================
// AdUnit Configuration
// ============================================================================

/**
 * Get adUnits for current context
 * Uses sizemapping breakpoint to determine appropriate sizes
 */
function getAdUnits(context = {}) {
  const config = getBidderConfig();
  const prefix = config.slotPrefix;
  const viewport = context.viewport || sizemapping.getBreakpoint();
  const adUnits = [];

  // Example: Use viewport to determine sizes
  // const isDesktop = viewport === 'x' || viewport === 'l';
  // const bannerSizes = isDesktop ? [[970, 250], [728, 90]] : [[320, 50]];
  //
  // adUnits.push({
  //   code: `${prefix}_ban`,
  //   ortb2Imp: buildOrtb2Imp(`${prefix}_ban`, context),
  //   mediaTypes: { banner: { sizes: bannerSizes } },
  //   bids: buildBids(`${prefix}_ban`, 'ban')
  // });

  return adUnits;
}

// ============================================================================
// WrapperAdapter Implementation
// ============================================================================

const prebidAdapter = {
  name: ADAPTER_NAME,

  isLibraryLoaded() {
    return typeof window.pbjs !== 'undefined';
  },

  init(context) {
    if (configApplied) return;
    if (!this.isLibraryLoaded()) return;

    window.pbjs.que = window.pbjs.que || [];
    window.pbjs.que.push(() => {
      window.pbjs.setConfig({ debug: prebidSetConfig.debug });
      window.pbjs.setConfig({ consentManagement: prebidSetConfig.consentManagement });
      window.pbjs.setConfig({ userSync: prebidSetConfig.userSync });
      window.pbjs.setConfig({ priceGranularity: prebidSetConfig.priceGranularity });
      if (prebidSetConfig.userIds?.length) {
        window.pbjs.setConfig({ userSync: { userIds: prebidSetConfig.userIds } });
      }
    });

    configApplied = true;
  },

  hasSlotConfig(slotId, context) {
    const adUnits = getAdUnits(context);
    return adUnits.some(unit => unit.code === slotId);
  },

  getAdUnit(slotId, context) {
    const adUnits = getAdUnits(context);
    return adUnits.find(unit => unit.code === slotId) || null;
  },

  async requestBids(slotId, context, timeout) {
    if (!this.isLibraryLoaded()) {
      return { success: false, reason: 'pbjs not loaded', bids: [] };
    }

    const adUnitConfig = this.getAdUnit(slotId, context);
    if (!adUnitConfig) {
      return { success: false, reason: 'No adUnit config', bids: [] };
    }

    if (!configApplied) {
      this.init(context);
    }

    return new Promise((resolve) => {
      const existingUnits = window.pbjs.adUnits || [];
      if (!existingUnits.some(u => u.code === slotId)) {
        window.pbjs.que.push(() => {
          window.pbjs.addAdUnits([adUnitConfig]);
        });
      }

      window.pbjs.que.push(() => {
        window.pbjs.requestBids({
          adUnitCodes: [slotId],
          timeout,
          bidsBackHandler: (bidsResponse) => {
            const slotBids = bidsResponse?.[slotId]?.bids || [];
            const bidResults = slotBids.map(bid => ({
              slotId,
              hasBid: true,
              cpm: bid.cpm,
              bidder: bid.bidder,
              responseTime: bid.timeToRespond,
              raw: bid
            }));

            if (bidResults.length === 0) {
              bidResults.push({ slotId, hasBid: false });
            }

            resolve({ success: true, bids: bidResults });
          }
        });
      });
    });
  },

  applyTargeting(slotId) {
    if (!this.isLibraryLoaded()) return;
    window.pbjs.que.push(() => {
      window.pbjs.setTargetingForGPTAsync([slotId]);
    });
  },

  clearSlot(slotId) {
    // Optional: pbjs.removeAdUnit(slotId) can be called here
    // See: https://docs.prebid.org/dev-docs/publisher-api-reference/removeAdUnit.html
  },

  getState() {
    return {
      configApplied,
      libraryLoaded: this.isLibraryLoaded(),
      property: getProperty()
    };
  }
};

// ============================================================================
// Exports
// ============================================================================

export default prebidAdapter;
