/**
 * Prebid.js Adapter Scaffold
 *
 * Copy this file and customize for your Prebid implementation.
 * See docs/wrapperAuctions.md for full documentation.
 *
 * Required customizations:
 * 1. ADAPTER_NAME - Must match partner name in partners.json
 * 2. bidderConfig - Your publisher credentials per property
 * 3. prebidSetConfig - Your Prebid setConfig options
 * 4. Bidder builders - Add functions for each bidder you use
 */

// ============================================================================
// ADAPTER NAME - Must match partner name in partners.json
// ============================================================================
const ADAPTER_NAME = 'prebid';

import slotResolver from '../../src/optional/wrapperSlotResolver.js';
import adTargeting from '../../src/adTargeting.js';
import CONFIG from '../loader.js';
import { getProperty } from '../../src/property.js';

// ============================================================================
// Publisher Configuration
// ============================================================================

/**
 * Property-keyed bidder configuration
 * Add your credentials for each property/environment
 *
 * Structure:
 * {
 *   [propertyName]: {
 *     [bidderName]: { ...bidderCredentials },
 *     slotPrefix: 'your_slot_prefix'
 *   }
 * }
 */
const bidderConfig = {
  // Example property configuration
  mysite: {
    ozone: {
      publisherId: 'YOUR_PUBLISHER_ID',
      siteId: 'YOUR_SITE_ID'
    },
    criteo: {
      networkId: 0  // Your Criteo network ID
    },
    // Add other bidders as needed
    slotPrefix: 'advert_mysite'
  },

  // Default fallback
  default: {
    ozone: {
      publisherId: 'DEFAULT_PUBLISHER_ID',
      siteId: 'DEFAULT_SITE_ID'
    },
    criteo: {
      networkId: 0
    },
    slotPrefix: 'advert_default'
  }
};

/**
 * Prebid setConfig options
 * Customize these for your implementation
 */
const prebidSetConfig = {
  debug: false,

  priceGranularity: {
    buckets: [
      { precision: 2, max: 3, increment: 0.01 },
      { precision: 2, max: 20, increment: 0.05 },
      { precision: 2, max: 1000, increment: 1 }
    ]
  },

  consentManagement: {
    cmpApi: 'iab',
    timeout: 800,
    allowAuctionWithoutConsent: true
  },

  userSync: {
    syncEnabled: true,
    syncDelay: 10000,
    syncsPerBidder: 5,
    filterSettings: {
      all: {
        bidders: '*',
        filter: 'include'
      }
    },
    enableOverride: true
  },

  userIds: [
    {
      name: 'sharedId',
      storage: {
        name: '_sharedID',
        type: 'cookie',
        expires: 30
      }
    }
    // Add other userId modules as needed
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

// ============================================================================
// Bidder-Specific Builders
// Add a builder function for each bidder you integrate
// ============================================================================

/**
 * Build Ozone-specific customData format
 */
function buildOzoneCustomData(slotId) {
  const targeting = adTargeting.buildPageTargeting();
  return [{
    settings: {},
    targeting: { ...targeting, div: slotId }
  }];
}

/**
 * Build Ozone bidder config for setBidderConfig
 */
function buildOzoneBidderConfig() {
  const targeting = adTargeting.buildPageTargeting();
  return {
    bidders: ['ozone'],
    config: {
      ortb2: {
        site: {
          ext: {
            data: targeting
          }
        }
      }
    }
  };
}

/**
 * Build Ozone bid params
 * @param slotId - Slot ID
 * @param bidderParams - Params from slots.json (placementId, etc.)
 * @param video - Whether this is a video slot
 */
function buildOzoneBid(slotId, bidderParams, video = false) {
  const config = getBidderConfig();

  const bid = {
    bidder: 'ozone',
    params: {
      publisherId: config.ozone.publisherId,
      siteId: config.ozone.siteId,
      placementId: bidderParams.placementId,
      customData: buildOzoneCustomData(slotId)
    }
  };

  if (video) {
    bid.params.video = {
      skippable: true,
      playback_method: ['auto_play_sound_off']
    };
  }

  return bid;
}

/**
 * Build Criteo bid params
 */
function buildCriteoBid() {
  const config = getBidderConfig();
  return {
    bidder: 'criteo',
    params: {
      networkId: config.criteo.networkId
    }
  };
}

// Add more bidder builders as needed:
// function buildAppnexusBid(slotId, bidderParams) { ... }
// function buildRubiconBid(slotId, bidderParams) { ... }

/**
 * Build all bids for a slot from resolved config
 * Maps bidder names from slots.json to their builder functions
 */
function buildBids(slotId, resolvedConfig) {
  const bids = [];
  const bidders = resolvedConfig.bidders;

  // Ozone
  if (bidders.ozone) {
    const ozoneParams = bidders.ozone === true ? {} : bidders.ozone;
    bids.push(buildOzoneBid(slotId, ozoneParams, resolvedConfig.video));
  }

  // Criteo
  if (bidders.criteo) {
    bids.push(buildCriteoBid());
  }

  // Add more bidders here:
  // if (bidders.appnexus) { bids.push(buildAppnexusBid(slotId, bidders.appnexus)); }

  return bids;
}

/**
 * Build mediaTypes from resolved config
 */
function buildMediaTypes(resolvedConfig) {
  const mediaTypes = {
    banner: { sizes: resolvedConfig.sizes }
  };

  if (resolvedConfig.video) {
    mediaTypes.video = {
      playerSize: [640, 360],
      mimes: ['video/mp4'],
      context: 'outstream'
    };
  }

  return mediaTypes;
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
      window.pbjs.setConfig({ userSync: { userIds: prebidSetConfig.userIds } });
      window.pbjs.setBidderConfig(buildOzoneBidderConfig());
    });

    configApplied = true;
  },

  hasSlotConfig(slotId, context) {
    return slotResolver.hasSlotConfig(slotId, ADAPTER_NAME, context);
  },

  getAdUnit(slotId, context) {
    const resolvedConfig = slotResolver.resolveSlotConfigForPrebid(slotId, context);
    if (!resolvedConfig) {
      return null;
    }

    return {
      code: slotId,
      ortb2Imp: buildOrtb2Imp(slotId, context),
      mediaTypes: buildMediaTypes(resolvedConfig),
      bids: buildBids(slotId, resolvedConfig)
    };
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
      const bidsBackHandler = (bidsResponse) => {
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

        resolve({
          success: true,
          bids: bidResults
        });
      };

      window.pbjs.que = window.pbjs.que || [];
      window.pbjs.que.push(() => {
        const existingUnits = window.pbjs.adUnits || [];
        if (!existingUnits.some(u => u.code === slotId)) {
          window.pbjs.addAdUnits([adUnitConfig]);
        }

        window.pbjs.requestBids({
          adUnitCodes: [slotId],
          timeout,
          bidsBackHandler
        });
      });
    });
  },

  applyTargeting(slotId) {
    if (!this.isLibraryLoaded()) return;

    window.pbjs.que = window.pbjs.que || [];
    window.pbjs.que.push(() => {
      window.pbjs.setTargetingForGPTAsync([slotId]);
    });
  },

  clearSlot(slotId) {
    // Optional: window.pbjs.removeAdUnit(slotId)
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

export const prebidConfig = prebidSetConfig;
export const applyPrebidConfig = () => prebidAdapter.init({});
export const hasAdUnit = (slotId, context) => prebidAdapter.hasSlotConfig(slotId, context);
export const getAdUnit = (slotId, context) => prebidAdapter.getAdUnit(slotId, context);
export { buildOzoneBidderConfig, getBidderConfig, bidderConfig };

export default prebidAdapter;
