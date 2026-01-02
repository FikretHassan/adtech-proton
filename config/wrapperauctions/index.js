/**
 * Wrapper Adapters Index
 *
 * Imports all wrapper adapters and registers them with the orchestrator.
 * This file is imported by entry.ts after wrapperAuctions is initialized.
 */

// import wrapperAuctions from '../../src/wrapperAuctions.js';
// import wrappersConfig from '../wrappers.json';

// Import adapters
// import prebidAdapter from './prebid.js';
// import amazonapsAdapter from './amazonaps.js';

/**
 * Register all enabled adapters
 */
export function registerAdapters() {
  // Register adapters here when configured
}

// NOTE: registerAdapters() is called explicitly from entry.ts after PubSub setup
// This ensures experimentalPubsub works correctly (subscriptions use the right instance)

// Legacy exports (backward compatibility)
export default {
};
