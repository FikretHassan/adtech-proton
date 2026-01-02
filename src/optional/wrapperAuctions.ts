/**
 * Optional Module Wrapper: Wrapper Auctions
 *
 * When FEATURE_WRAPPERS=true: exports real module + registers adapters
 * When FEATURE_WRAPPERS=false: exports no-op stub (tree-shaken from bundle)
 */

declare const FEATURE_WRAPPERS: boolean;

// Import the real module type for proper typing
import type RealModule from '../wrapperAuctions';

// No-op stub - all functions return safe defaults
const stub = {
  // Registry
  registerWrapper: () => {},
  getWrapper: () => undefined,
  getRegisteredWrappers: () => [],

  // Core API
  init: () => ({
    initialized: false,
    enabled: false,
    timeout: 0,
    dimensions: {},
    viewport: null,
    wrappers: []
  }),
  hasSlotConfig: () => false,
  calculateTimeout: () => 0,
  getSlotAuction: () => ({
    startTime: null,
    timeout: null,
    bidderTiming: {}
  }),
  requestWrapperAuction: async () => ({ success: false, reason: 'Wrappers disabled', bids: [] }),
  requestAuction: async () => ({ success: false, reason: 'Wrappers disabled' }),
  applyWrapperBids: () => {},
  applyBids: () => {},
  clearAuction: () => {},
  getArchive: () => ({}),
  updateContext: () => {},
  hasEnabledWrappers: () => false,
  getAllAuctions: () => ({}),
  getState: () => ({
    initialized: false,
    enabled: false,
    timeout: 0,
    dimensions: {},
    viewport: null,
    wrappers: []
  }),
  getConfig: () => ({ enabled: false }),
  reset: () => {}
} as unknown as typeof RealModule;

// Conditional export - esbuild tree-shakes the unused branch
let module: typeof RealModule;
let adapterRegistration: { registerAdapters: () => void } | null = null;

if (FEATURE_WRAPPERS) {
  // @ts-ignore - dynamic require for esbuild
  module = require('../wrapperAuctions').default;

  // Import adapter registration module (but don't auto-register)
  // @ts-ignore - dynamic require for esbuild
  adapterRegistration = require('../../config/wrapperauctions/index.js');
} else {
  module = stub;
}

/**
 * Register wrapper adapters with the orchestrator
 * Must be called after PubSub is set up (for experimentalPubsub compatibility)
 */
export function registerAdapters(): void {
  adapterRegistration?.registerAdapters();
}

export default module;
