/**
 * Partner Configuration Scaffold
 *
 * This file shows ALL available options for a partner configuration.
 * Copy this file and rename it to create a new partner.
 *
 * IMPORTANT: The include/exclude dimension keys (section, pagetype, geo, etc.)
 * are defined by YOU in config/dimensions.json. You can add any custom dimensions
 * there and use them here for targeting. This provides complete flexibility.
 *
 * See docs/partnerOrchestration.md for full documentation.
 */
export default {
  // ============================================================================
  // CORE IDENTIFICATION (Required)
  // ============================================================================

  /**
   * Partner name - must match the entry in config/partners.json
   * @required
   */
  name: 'mypartner',

  /**
   * Enable/disable this partner
   * Can be overridden via URL param: ?adEnablePlugin=mypartner or ?adDisablePlugin=mypartner
   * @required
   */
  active: true,

  // ============================================================================
  // SCRIPT LOADING
  // ============================================================================

  /**
   * URL to the partner's script
   * @required
   */
  url: 'https://example.com/partner-script.js',

  /**
   * Script type attribute
   * @default 'text/javascript'
   */
  type: 'text/javascript',

  /**
   * Load timeout in milliseconds
   * Partner script must load within this time or onerrorFn/timeoutFn is called
   * @default 2000
   */
  timeout: 2000,

  /**
   * Whether to load the script asynchronously
   * @default true
   */
  async: true,

  /**
   * Where to inject the script tag
   * @values 'head' | 'body'
   * @default 'body'
   */
  location: 'body',

  /**
   * Custom attributes to add to the script tag
   * Each entry is [attributeName, attributeValue]
   * @example [['data-cfasync', 'false'], ['crossorigin', 'anonymous']]
   */
  attributes: [],

  // ============================================================================
  // PROPERTY & DOMAIN TARGETING
  // ============================================================================

  /**
   * Which properties this partner should load on
   * Property names are defined in config/properties.json
   * If undefined or empty, partner loads on ALL properties
   * @example ['mysite', 'dev'] - only these properties
   * @example undefined - all properties
   */
  properties: ['mysite', 'dev'],

  /**
   * Domain restrictions for this partner
   * @values ['all'] - loads on all domains
   * @values ['www.example.com', 'subdomain.example.com'] - specific domains only
   * @default ['all']
   */
  domains: ['all'],

  /**
   * Required consent states for this partner to load
   * Values come from your CMP implementation
   * @values ['all'] - load regardless of consent
   * @values ['true'] - only load if consent granted
   * @values ['false'] - only load if consent denied
   * @values [] - load regardless of consent (same as 'all')
   * @default []
   */
  consentState: [],

  // ============================================================================
  // INCLUDE / EXCLUDE RULES
  //
  // IMPORTANT: The dimension keys below (section, pagetype, geo, etc.) come from
  // YOUR config/dimensions.json file. You can define any custom dimensions there
  // and use them here for flexible targeting.
  //
  // Matching logic:
  // 1. exclude.special() evaluated first - if returns true, partner is excluded
  // 2. include.special() evaluated next - if returns true, partner is included
  // 3. For each dimension: check exclude rules, then include rules
  // 4. All rules must pass for partner to load
  // ============================================================================

  /**
   * Include rules - partner loads only when ALL rules match
   * Dimension keys must exist in config/dimensions.json
   */
  include: {
    /**
     * Section targeting (from dimensions.json 'section' definition)
     * @values ['all'] - match any section
     * @values ['sport', 'news', 'business'] - match specific sections
     */
    section: ['all'],

    /**
     * Page type targeting (from dimensions.json 'pagetype' definition)
     * @values ['all'] - match any pagetype
     * @values ['article', 'story', 'gallery', 'live'] - match specific types
     */
    pagetype: ['all'],

    /**
     * Geographic targeting (from dimensions.json 'geo' definition)
     * @values ['all'] - match any geo
     * @values ['gb', 'us', 'au'] - match specific countries
     */
    geo: ['all'],

    /**
     * Viewport targeting (from dimensions.json 'viewport' definition)
     * @values ['all'] - match any viewport
     * @values ['x', 'l', 'm', 's', 'xs'] - match specific breakpoints
     */
    viewport: ['all'],

    /**
     * User state targeting (from dimensions.json 'userState' definition)
     * @values ['all'] - match any user state
     * @values ['loggedIn', 'anonymous', 'subscriber'] - match specific states
     */
    userState: ['all'],

    /**
     * URL path targeting (from dimensions.json 'url' definition)
     * Uses matchType from dimensions.json (e.g., 'startsWith')
     * @values ['all'] - match any URL
     * @values ['/sport/', '/news/'] - match specific paths
     */
    url: ['all'],

    /**
     * Custom special function for complex include logic
     * Overrides all other include rules if present and returns true
     * @returns {boolean} true to include, false to check other rules
     */
    special: function() {
      var response = false;
      // Add any special inclusion logic here if needed
      // if (someCondition) {
      //   response = true;
      // }
      return response;
    }
  },

  /**
   * Exclude rules - partner is excluded if ANY rule matches
   * Same dimension keys as include
   */
  exclude: {
    /**
     * Sections to exclude
     * @example ['sponsored', 'puzzles', 'games']
     */
    section: [],

    /**
     * Page types to exclude
     * @example ['error', 'maintenance']
     */
    pagetype: [],

    /**
     * Geos to exclude
     * @example ['cn', 'ru']
     */
    geo: [],

    /**
     * Viewports to exclude
     * @example ['xs'] - exclude mobile
     */
    viewport: [],

    /**
     * User states to exclude
     * @example ['subscriber'] - don't load for subscribers
     */
    userState: [],

    /**
     * URL paths to exclude
     * @example ['/admin/', '/preview/']
     */
    url: [],

    /**
     * Custom special function for complex exclude logic
     * Evaluated FIRST - if returns true, partner is excluded immediately
     * @returns {boolean} true to exclude, false to check other rules
     */
    special: function() {
      var response = false;
      // Add any special exclusion logic here if needed
      // if (someCondition) {
      //   response = true;
      // }
      return response;
    }
  },

  // ============================================================================
  // LIFECYCLE CALLBACKS
  // ============================================================================

  /**
   * Called BEFORE the partner script is loaded
   * Use this to create stubs, queues, or prepare the environment
   */
  preloadFn: function() {
    // Example: Create command queue for async initialization
    // window.mypartner = window.mypartner || {};
    // window.mypartner.cmd = window.mypartner.cmd || [];
  },

  /**
   * Called AFTER the partner script has loaded successfully
   * Use this to initialize the partner with your configuration
   * IMPORTANT: Must publish 'plugin.{name}.complete' when done if partner is blocking/independent
   */
  onloadFn: function() {
    // Example: Initialize and signal completion
    // window.mypartner.init({ siteId: '12345' });
    // window.PubSub.publish({ topic: 'plugin.mypartner.complete' });
  },

  /**
   * Called if the partner script fails to load (network error, 404, etc.)
   */
  onerrorFn: function() {
    // Example: Log error and signal completion anyway (so we don't block)
    // console.error('Partner failed to load');
    // window.PubSub.publish({ topic: 'plugin.mypartner.complete' });
  },

  /**
   * Called if the partner script times out (exceeds timeout value)
   */
  timeoutFn: function() {
    // Example: Log timeout
    // console.warn('Partner timed out');
  },

  /**
   * Called when the partner is skipped/ignored (due to targeting rules)
   */
  ignoreFn: function() {
    // Example: Clean up any preloadFn setup
    // delete window.mypartner;
  },

  // ============================================================================
  // PRE-REQUEST HOOK (Optional)
  // Used when partner needs to do work before each ad request
  // ============================================================================

  /**
   * Configuration for pre-ad-request hook
   * Only use if partner needs to run code before GAM requests
   */
  beforeRequest: {
    /**
     * Function name on window to call before ad requests
     * Function receives a callback that MUST be called when ready
     * @example 'mypartner.beforeAdRequest'
     */
    readyFn: null,

    /**
     * Timeout for the ready function in milliseconds
     * If readyFn doesn't call back in time, ads proceed anyway
     * @default 500
     */
    timeout: 500
  }
};
