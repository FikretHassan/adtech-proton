/**
 * Optional Module Wrapper: Ad Sequencing
 *
 * When FEATURE_SEQUENCING=true: exports real module
 * When FEATURE_SEQUENCING=false: exports no-op stub (tree-shaken from bundle)
 */

declare const FEATURE_SEQUENCING: boolean;

// Import the real module type for proper typing
import type RealModule from '../adSequencing';

// No-op stub
const stub = {
  init: () => ({}),
  decide: () => false,
  isActive: () => false,
  isEnabled: () => false,
  getReason: () => '',
  getMatchedConfig: () => null,
  getState: () => ({}),
  getConfig: () => ({}),
  addRule: () => true,
  getRules: () => [],
  reset: () => {},
  getPrioritySlotTypes: () => [] as string[],
  getPriorityTimeout: () => 0,
  shouldWaitForRender: () => false,
  isPrioritySlot: () => false,
  markPriorityRequested: () => {},
  markPriorityRendered: () => {},
  allPrioritySlotsRendered: () => true,
  waitForPrioritySlots: async () => ({ success: true, reason: 'disabled' })
} as unknown as typeof RealModule;

// Conditional export - esbuild tree-shakes the unused branch
// @ts-ignore - esbuild handles this at build time
const module: typeof RealModule = FEATURE_SEQUENCING
  // @ts-ignore - dynamic require for esbuild
  ? require('../adSequencing').default
  : stub;

export default module;
