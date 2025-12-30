/**
 * Plugin Definitions Scaffold
 *
 * Copy this file to plugins.js and configure for your site.
 *
 * Each plugin represents a third-party script (partner) that the loader manages.
 * Plugins are loaded based on targeting rules, consent state, and dependency order.
 *
 * @see config/partners.json for partner orchestration (blocking, interdependent, nonCore)
 */

/**
 * @typedef {Object} PluginConfig
 * @property {string} name - Unique identifier (must match key name)
 * @property {boolean} active - Enable/disable this plugin
 * @property {string[]} [properties] - Property targeting. undefined/[] = all, ['mysite'] = specific
 * @property {string} url - Script URL to load
 * @property {string[]} domains - Domain targeting. ['all'] or specific domains ['example.com']
 * @property {string[]} consentState - Required consent states. ['all'] = no consent needed, ['1','5'] = specific states
 * @property {number} timeout - Max time (ms) to wait for script load before timeout
 * @property {Object} include - Targeting rules (ALL must match). Dimensions from dimensions.json
 * @property {string[]} [include.section] - Sections to include. ['all'] or specific ['news','sport']
 * @property {string[]} [include.pagetype] - Pagetypes to include. ['all'] or specific ['story','index']
 * @property {string[]} [include.geo] - Geos to include. ['all'] or specific ['gb','us']
 * @property {Object} exclude - Exclusion rules (ANY match = skip). Same dimensions as include
 * @property {Function} [preloadFn] - Runs immediately before script loads. Use to set up globals/stubs
 * @property {Function} [onloadFn] - Runs after script loads successfully
 * @property {Object} [beforeRequest] - Pre-request hook config. { readyFn: 'windowFnName', timeout: 5000 }
 */

/**
 * Plugin definitions
 * @type {Object.<string, PluginConfig>}
 */
export default {

  /**
   * GPT - Google Publisher Tag (Required)
   * Core ad serving - should be active for all implementations
   */
  gpt: {
    /** Unique identifier - must match object key */
    name: 'gpt',

    /** Enable this plugin */
    active: true,

    /** Property targeting - run on these properties only. undefined = all */
    properties: ['mysite', 'dev'],

    /** Script URL */
    url: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js',

    /** Domain targeting - ['all'] matches all domains */
    domains: ['all'],

    /** Consent requirements - [] means no consent check needed */
    consentState: [],

    /** Timeout in milliseconds */
    timeout: 2000,

    /** Include targeting - ALL conditions must match */
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['all']
    },

    /** Exclude targeting - ANY match skips this plugin */
    exclude: {},

    /** Pre-load setup - initialize globals before script loads */
    preloadFn: function() {
      window.googletag = window.googletag || {};
      window.googletag.cmd = window.googletag.cmd || [];
    },

    /** Post-load callback - runs after script successfully loads */
    onloadFn: function() {}
  },

  /**
   * Header Bidder A
   * Example configuration - set active: true to enable
   */
  headerBidderA: {
    name: 'headerBidderA',
    active: false,
    properties: ['mysite'],
    url: 'https://your-cdn.com/bidder-a.js',
    domains: ['all'],
    /** Consent states that allow loading - values from consent.getState() */
    consentState: ['true'],
    timeout: 2000,
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {},
    /** Initialize command queue before script loads */
    preloadFn: function() {
      window.bidderA = window.bidderA || {};
      window.bidderA.cmd = window.bidderA.cmd || [];
    },
    onloadFn: function() {}
  },

  /**
   * Header Bidder B
   * Example configuration - set active: true to enable
   */
  headerBidderB: {
    name: 'headerBidderB',
    active: false,
    properties: ['mysite'],
    url: 'https://your-cdn.com/bidder-b.js',
    domains: ['all'],
    consentState: ['true'],
    timeout: 1000,
    include: {
      section: ['all'],
      pagetype: ['all'],
      geo: ['all']
    },
    exclude: {},
    /** Initialize command queue before script loads */
    preloadFn: function() {
      window.bidderB = window.bidderB || {};
      window.bidderB.cmd = window.bidderB.cmd || [];
    },
    onloadFn: function() {}
  }

  /**
   * Add more plugins as needed. Common types:
   *
   * - Header bidding wrappers
   * - Audience/identity providers
   * - Brand safety/viewability
   * - Analytics
   *
   * See config/partners/*.js for pre-built partner configurations
   */

};
