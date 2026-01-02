/**
 * Loader Configuration
 * Site-specific settings for the plugin loader
 */

export default {
  // Window object name (e.g., window.proton)
  globalName: 'proton',

  // URL param to enable console logging (e.g., ?adsDebugLog)
  debugParam: 'adsDebugLog',

  // URL param to disable plugins (e.g., ?pluginDisable=prebid,amazonaps or ?pluginDisable=all)
  disableParam: 'adDisablePlugin',

  // URL param to enable plugins (e.g., ?pluginEnable=prebid - useful with pluginDisable=all)
  enableParam: 'adEnablePlugin',

  // PubSub topic to wait for before loading plugins
  // Set to null to load immediately without waiting
  readyTopic: 'cmp.ready',

  // Name of global PubSub instance (for sites using inline pubsub.min.js)
  pubsubGlobal: 'PubSub',

  // If you already use an existing unique page instance ID (commonly used to sync log level data across systems)
  // Set the below to a string path to use an existing global value
  // Otherwise, set to null/undefined to auto-generate UUID (default behavior)
  // When set, this ID is used for PubSub instanceId and targeting
  instanceId: null,

  // EXPERIMENTAL: Use an existing global PubSub instead of creating one
  // Set to null/undefined to create window.PubSub (default behavior)
  // Set to a string to use that existing global (e.g., 'MyEventBus' or 'site.pubsub')
  // Supports dot-notation paths (e.g., 'site.pubsub' resolves to window.site.pubsub)
  //
  // Requirements for external PubSub:
  // - Must exist at the specified path BEFORE Proton loads
  // - Must implement: subscribe(), unsubscribe(), publish()
  // - Must have topics[] and publishedTopics[] arrays
  // - See: npm run build:pubsub:dev for reference implementation
  //
  // If validation fails, Proton creates its own PubSub and logs a warning
  experimentalPubsub: null,

  // Ad request configuration
  ads: {
    // Automatically request ads when partners are ready
    autoRequest: true,

    // Processing options
    enableLazy: true,
    enableRefresh: true,

    // SRA Batching: Batch above-fold slots into fewer requests
    // Above-fold (immediate) slots are batched together after all auctions complete
    // Below-fold (lazy) slots continue to request individually as they enter viewport
    // Uses googletag.pubads().refresh([slots]) to batch immediate slots
    sraBatching: {
      enabled: false    // Set to true to enable SRA batching for immediate slots
    }
  },

  // Optional modules - set to false to exclude from build (reduces bundle size)
  // These are evaluated at build time, not runtime
  optionalModules: {
    sequencing: true,      // Ad sequencing (priority slots load first for brand safety)
    injection: {           // Dynamic article ad injection
      enabled: true,       // Master switch - set to false to exclude all injection
      charMode: true,      // Character-based counting (firstAd, otherAd, minParaChars)
      blockMode: true      // Block-based counting (firstAdBlock, otherAdBlock, blockSelector)
    },
    customSlots: true,     // Dimension-targeted slot injection
    experiences: true,     // Experience loader (dimension-targeted code execution)
    refresh: true,         // Ad refresh timer and viewability tracking
    experiments: true,     // A/B testing experiment manager
    customFunctions: true, // Custom utility functions (e.g., buildVideoUrl)
    wrappers: true,        // Header bidding wrapper auctions (Prebid, Amazon APS)
    sraBatching: true      // SRA micro-batching (batch lazy slots into fewer requests)
  }
};
