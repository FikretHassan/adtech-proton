/**
 * Optional Module Wrapper: Custom Slots
 *
 * When FEATURE_CUSTOM_SLOTS=true: exports real module
 * When FEATURE_CUSTOM_SLOTS=false: exports no-op stub (tree-shaken from bundle)
 */

declare const FEATURE_CUSTOM_SLOTS: boolean;

// Import the real module type for proper typing
import type RealModule from '../customSlots';

// No-op stub
const stub = {
  init: () => ({}),
  inject: () => [],
  processInjectedSlots: () => ({ processed: 0, slots: [] as string[], lazy: 0 }),
  wasInjected: () => false,
  getInjectedSlots: () => [] as string[],
  getResult: () => null,
  getResults: () => ({}),
  getState: () => ({}),
  getConfig: () => ({}),
  getSlotConfigs: () => [],
  removeInjectedSlots: () => {},
  reset: () => {},
  debug: () => ({})
} as unknown as typeof RealModule;

// Conditional export - esbuild tree-shakes the unused branch
// @ts-ignore - esbuild handles this at build time
const module: typeof RealModule = FEATURE_CUSTOM_SLOTS
  // @ts-ignore - dynamic require for esbuild
  ? require('../customSlots').default
  : stub;

export default module;
