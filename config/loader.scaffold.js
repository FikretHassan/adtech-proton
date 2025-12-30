/**
 * Loader Configuration Scaffold
 *
 * Copy this file to loader.js and configure for your site.
 *
 * This file controls:
 * - Global namespace for the plugin loader
 * - PubSub integration and ready topic
 * - Ad request behavior and context resolution
 * - Optional modules for build-time tree-shaking
 *
 * @see types/config.d.ts for type definitions
 */

/**
 * @type {import('../types/config').LoaderConfig}
 */
export default {
  // ===========================================================================
  // Global Settings
  // ===========================================================================

  /**
   * Window object name
   * The loader will be accessible at window[globalName]
   * Example: 'proton' -> window.proton
   */
  globalName: 'proton',

  /**
   * URL parameter to enable debug logging
   * Add ?adsDebugLog to URL to see console logs
   */
  debugParam: 'adsDebugLog',

  /**
   * URL parameter to disable specific plugins
   * Examples:
   * - ?adDisablePlugin=headerBidderA,headerBidderB - Disable specific plugins
   * - ?adDisablePlugin=all - Disable all plugins (use with enableParam)
   */
  disableParam: 'adDisablePlugin',

  /**
   * URL parameter to enable specific plugins
   * Useful with adDisablePlugin=all to test individual plugins
   * Example: ?adDisablePlugin=all&adEnablePlugin=gpt
   */
  enableParam: 'adEnablePlugin',

  /**
   * PubSub topic to wait for before loading plugins
   *
   * Common patterns:
   * - 'cmp.ready' - Wait for consent management platform
   * - 'page.ready' - Wait for page initialization
   * - null - Load immediately without waiting
   */
  readyTopic: 'cmp.ready',

  /**
   * Name of the global PubSub instance
   * Must match the name used in your PubSub script
   */
  pubsubGlobal: 'PubSub',

  /**
   * EXPERIMENTAL: Use an existing global PubSub instead of creating one
   * Set to null/undefined to create window.PubSub (default behavior)
   * Set to a string to use that existing global (e.g., 'MyEventBus' or 'myApp.pubsub')
   * Supports dot-notation paths (e.g., 'myApp.pubsub' resolves to window.myApp.pubsub)
   *
   * Requirements for external PubSub:
   * - Must exist at the specified path BEFORE Proton loads
   * - Must implement: subscribe(), unsubscribe(), publish()
   * - Must have topics[] and publishedTopics[] arrays
   */
  experimentalPubsub: null,

  // ===========================================================================
  // Ad Request Configuration
  // ===========================================================================

  ads: {
    /**
     * Automatically request ads when partners are ready
     * Set to false if you want to manually trigger ad requests
     */
    autoRequest: true,

    /**
     * Enable lazy loading of ads
     * Slots load when they enter the viewport
     */
    enableLazy: true,

    /**
     * Enable ad refresh
     * Slots can refresh after configurable intervals
     */
    enableRefresh: true,

    /**
     * SRA Batching: Batch above-fold slots into fewer requests
     * Above-fold (immediate) slots are batched together after all auctions complete
     * Below-fold (lazy) slots continue to request individually as they enter viewport
     */
    sraBatching: {
      enabled: false    // Set to true to enable SRA batching for immediate slots
    }
  },

  // ===========================================================================
  // Optional Modules (Build-time tree-shaking)
  // ===========================================================================

  /**
   * Optional modules - set to false to exclude from build (reduces bundle size)
   * These are evaluated at build time, not runtime
   */
  optionalModules: {
    /** Ad sequencing - priority slots load first for brand safety */
    sequencing: true,

    /** Dynamic article ad injection */
    injection: {
      enabled: true,       // Master switch - set to false to exclude all injection
      charMode: true,      // Character-based counting (firstAd, otherAd, minParaChars)
      blockMode: true      // Block-based counting (firstAdBlock, otherAdBlock, blockSelector)
    },

    /** Dimension-targeted slot injection */
    customSlots: true,

    /** Experience loader - dimension-targeted code execution */
    experiences: true,

    /** Ad refresh timer and viewability tracking */
    refresh: true,

    /** A/B testing experiment manager */
    experiments: true,

    /** Custom utility functions (e.g., buildVideoUrl) */
    customFunctions: true,

    /** Header bidding wrapper auctions (Prebid, Amazon APS) */
    wrappers: true,

    /** SRA micro-batching - batch lazy slots into fewer requests */
    sraBatching: true
  }
};
