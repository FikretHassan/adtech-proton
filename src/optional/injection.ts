/**
 * Optional Module Wrapper: Dynamic Injection
 *
 * When FEATURE_INJECTION=true: exports real module
 * When FEATURE_INJECTION=false: exports no-op stub (tree-shaken from bundle)
 */

declare const FEATURE_INJECTION: boolean;

// Import the real module type for proper typing
import type RealModule from '../dynamicInjection';

// No-op stub
const stub = {
  init: () => ({}),
  findMatchingMode: () => null,
  getRule: () => null,
  findContentContainers: () => [],
  getParagraphs: () => [],
  createAdContainer: () => document.createElement('div'),
  insertAdBefore: () => {},
  insertAdAfter: () => {},
  injectAds: () => ({ injected: 0, slots: [] as string[] }),
  processInjectedSlots: () => ({ processed: 0, slots: [] as string[] }),
  getState: () => ({}),
  getInjectedSlots: () => [] as string[],
  removeInjectedAds: () => {},
  reset: () => {},
  getConfig: () => ({}),
  debug: () => ({})
} as unknown as typeof RealModule;

// Conditional export - esbuild tree-shakes the unused branch
// @ts-ignore - esbuild handles this at build time
const module: typeof RealModule = FEATURE_INJECTION
  // @ts-ignore - dynamic require for esbuild
  ? require('../dynamicInjection').default
  : stub;

export default module;
