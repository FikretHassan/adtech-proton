/**
 * Injection Config Index
 * Aggregates all injection modes from individual files
 *
 * Each mode file exports a complete config object including:
 * - active, properties, match, contentSelectors, rules
 * - Optional: countMode, blockSelector (for block-based injection)
 *
 * To add a new injection mode:
 * 1. Create a new .js file in this directory (see example.scaffold.js)
 * 2. Import and add to the modes object below
 * 3. The mode name becomes the key (e.g., 'dynamic_mpus')
 */

// import customMode from './customMode.js';

/**
 * All injection modes
 * Key becomes the mode identifier used in events (e.g., injection.dynamic_mpus.load)
 */
const modes = {
  // custom_mode: customMode,
};

/**
 * Export combined config matching original injection.json structure
 */
export default {
  // Master switch - set to false to disable all injection
  enabled: true,

  // Event prefix for PubSub topics (e.g., injection.{modeId}.load)
  eventPrefix: 'injection',

  // Slot type identifier used in slot IDs (e.g., advert_site_dyn_0)
  adType: 'dyn',

  // CSS selector for paragraphs (used for character counting)
  paragraphSelector: 'p',

  // CSS class for outer ad container
  containerClass: 'commercial-unit commercial-unit--dynamic',

  // CSS class for inner ad div
  adClass: 'advert advert--dynamic',

  // Data attributes to add to ad slots
  dataAttributes: {
    'data-ad-slot-type': 'dynamic'
  },

  // Default label config (can be overridden per-rule)
  defaultLabel: {
    text: 'Advertisement',
    class: 'advert-label'
  },

  // Content elements with custom char values (for char counting)
  // Key: CSS selector, Value: { charValue, canInjectAfter, canInjectBefore }
  contentElements: {
    // Example: embedded tweets count as 500 chars
    // '.twitter-embed': { charValue: 500, canInjectAfter: true, canInjectBefore: false }
  },

  // Default injection rules (fallback if no mode/rule matches)
  defaults: {
    firstAd: 600,
    otherAd: 1200,
    minParaChars: 100,
    maxAds: 5
  },

  // Injection modes
  modes
};
