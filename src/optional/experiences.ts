/**
 * Optional Module Wrapper: Experience Loader
 *
 * When FEATURE_EXPERIENCES=true: exports real module
 * When FEATURE_EXPERIENCES=false: exports no-op stub (tree-shaken from bundle)
 */

declare const FEATURE_EXPERIENCES: boolean;

// Import the real module type for proper typing
import type RealModule from '../experienceLoader';

// No-op stub
const stub = {
  init: () => ({}),
  register: () => true,
  execute: () => [],
  wasExecuted: () => false,
  getResult: () => null,
  getResults: () => ({}),
  getState: () => ({}),
  getConfig: () => ({}),
  reset: () => {}
} as unknown as typeof RealModule;

// Conditional export - esbuild tree-shakes the unused branch
// @ts-ignore - esbuild handles this at build time
const module: typeof RealModule = FEATURE_EXPERIENCES
  // @ts-ignore - dynamic require for esbuild
  ? require('../experienceLoader').default
  : stub;

export default module;
