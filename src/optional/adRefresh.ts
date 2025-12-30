/**
 * Optional Module Wrapper: Ad Refresh
 *
 * When FEATURE_REFRESH=true: exports real module
 * When FEATURE_REFRESH=false: exports no-op stub (tree-shaken from bundle)
 */

declare const FEATURE_REFRESH: boolean;

// Import the real module type for proper typing
import type RealModule from '../adRefresh';

// No-op stub
const stub = {
  init: () => ({}),
  getModuleState: () => ({}),
  getRefreshConfig: () => null,
  isExempt: () => false,
  scheduleRefresh: () => false,
  cancelRefresh: () => false,
  cancelAllRefreshes: () => {},
  getState: () => null,
  getAllStates: () => ({}),
  setPagetype: () => {},
  getPagetype: () => '',
  isTabVisible: () => true,
  reset: () => {},
  getConfig: () => ({})
} as unknown as typeof RealModule;

// Conditional export - esbuild tree-shakes the unused branch
// @ts-ignore - esbuild handles this at build time
const module: typeof RealModule = FEATURE_REFRESH
  // @ts-ignore - dynamic require for esbuild
  ? require('../adRefresh').default
  : stub;

export default module;
