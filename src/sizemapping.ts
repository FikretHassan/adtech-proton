/**
 * Sizemapping Module
 * Provides responsive ad sizes based on viewport breakpoints
 * Supports property-specific configurations with common/properties pattern
 */

import rawConfig from '../config/sizemapping.json';
import CONFIG from '../config/loader.js';
import { getProperty } from './property';

// Cast config to any for dynamic property access
const config = rawConfig as any;

// Cached resolved config for current property
let resolvedAdTypes: Record<string, any> | null = null;
let resolvedSlotOverrides: Record<string, any> | null = null;
let resolvedForProperty: string | null = null;

// Logging prefix
const LOG_PREFIX = '[Sizemapping]';

/**
 * Get the loader instance from the global object
 */
function getLoader() {
  return window[CONFIG.globalName];
}

/**
 * Log helper - uses loader's log system if available
 */
function log(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${message}`, data);
  }
}

/**
 * Warn helper - uses loader's log system if available
 */
function warn(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} WARN: ${message}`, data);
  }
}

// Module state
interface SizemappingState {
  initialized: boolean;
  currentBreakpoint: string | null;
}

const state: SizemappingState = {
  initialized: false,
  currentBreakpoint: null
};

/**
 * Resolve adTypes config with property merging
 * Priority: property-specific > common > flat (backward compatible)
 * @returns {Object} Merged adTypes config
 */
function getResolvedAdTypes(): Record<string, any> {
  const currentProperty = getProperty();

  // Return cached if still valid
  if (resolvedAdTypes && resolvedForProperty === currentProperty) {
    return resolvedAdTypes;
  }

  // Start with flat config (backward compatible)
  let merged: Record<string, any> = { ...(config.adTypes || {}) };

  // Merge common adTypes
  if (config.common?.adTypes) {
    merged = { ...merged, ...config.common.adTypes };
  }

  // Merge property-specific adTypes
  if (config.properties?.[currentProperty]?.adTypes) {
    merged = { ...merged, ...config.properties[currentProperty].adTypes };
  }

  resolvedAdTypes = merged;
  resolvedForProperty = currentProperty;

  log(`Resolved adTypes for property "${currentProperty}"`, { keys: Object.keys(merged) });
  return merged;
}

/**
 * Resolve slotOverrides config with property merging
 * Priority: property-specific > common > flat (backward compatible)
 * @returns {Object} Merged slotOverrides config
 */
function getResolvedSlotOverrides(): Record<string, any> {
  const currentProperty = getProperty();

  // Use same cache as adTypes (they're resolved together)
  if (resolvedSlotOverrides && resolvedForProperty === currentProperty) {
    return resolvedSlotOverrides;
  }

  // Start with flat config (backward compatible)
  let merged: Record<string, any> = { ...(config.slotOverrides || {}) };

  // Merge common slotOverrides
  if (config.common?.slotOverrides) {
    merged = { ...merged, ...config.common.slotOverrides };
  }

  // Merge property-specific slotOverrides
  if (config.properties?.[currentProperty]?.slotOverrides) {
    merged = { ...merged, ...config.properties[currentProperty].slotOverrides };
  }

  resolvedSlotOverrides = merged;

  log(`Resolved slotOverrides for property "${currentProperty}"`, { keys: Object.keys(merged) });
  return merged;
}

/**
 * Clear resolved config cache (for testing or property changes)
 */
export function clearCache(): void {
  resolvedAdTypes = null;
  resolvedSlotOverrides = null;
  resolvedForProperty = null;
  log('Config cache cleared');
}

/**
 * Get the smallest breakpoint key from config (used as fallback)
 * Breakpoint names are user-defined - this finds whichever has minWidth: 0
 * @returns {string} Smallest breakpoint key
 */
function getSmallestBreakpoint(): string {
  const breakpoints = config.breakpoints;
  const sorted = Object.entries(breakpoints)
    .sort((a, b) => (a[1] as any).minWidth - (b[1] as any).minWidth);
  return sorted[0]?.[0] || Object.keys(breakpoints)[0];
}

/**
 * Initialize sizemapping module
 * @returns {Object} Module state
 */
export function init() {
  if (state.initialized) return getState();

  // Calculate initial breakpoint
  state.currentBreakpoint = getBreakpoint();

  state.initialized = true;
  log('Initialized', { breakpoint: state.currentBreakpoint });

  // Emit ready event
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic: 'loader.sizemapping.ready', data: getState() });
    log('Published loader.sizemapping.ready');
  }

  return getState();
}

/**
 * Get module state
 * @returns {Object} Copy of module state
 */
export function getState() {
  return { ...state, currentBreakpoint: getBreakpoint() };
}

/**
 * Get current breakpoint based on viewport width
 * @returns {string} Breakpoint key (x, l, m, s, xs)
 */
export function getBreakpoint() {
  const width = window.innerWidth;
  const breakpoints = config.breakpoints;

  // Sort breakpoints by minWidth descending
  const sorted = Object.entries(breakpoints)
    .sort((a, b) => (b[1] as any).minWidth - (a[1] as any).minWidth);

  for (const [key, bpValue] of sorted) {
    const bp = bpValue as any;
    if (width >= bp.minWidth) {
      log(`getBreakpoint: ${width}px -> "${key}"`, { width, minWidth: bp.minWidth });
      return key;
    }
  }

  const smallest = getSmallestBreakpoint();
  log(`getBreakpoint: ${width}px -> "${smallest}" (fallback)`);
  return smallest;
}

/**
 * Get viewport dimensions
 * @returns {{ width: number, height: number }}
 */
export function getViewport() {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

/**
 * Get sizes for an ad type at a specific breakpoint
 * Uses property-merged configuration
 * @param {string} adType - Ad type (ban, mpu, etc.)
 * @param {string} [breakpoint] - Breakpoint key (defaults to current)
 * @returns {Array} Array of sizes
 */
export function getSizes(adType: string, breakpoint?: string) {
  const bp = breakpoint || getBreakpoint();
  const resolvedAdTypes = getResolvedAdTypes();
  const adConfig = resolvedAdTypes[adType];

  if (!adConfig) {
    warn(`Unknown ad type: ${adType}, returning [1,1]`);
    return [[1, 1]];
  }

  const sizes = adConfig[bp] || adConfig[getSmallestBreakpoint()] || [[1, 1]];
  log(`getSizes: adType="${adType}", bp="${bp}"`, sizes);
  return sizes;
}

/**
 * Get sizes for a specific slot ID (handles overrides)
 * Uses property-merged configuration
 * @param {string} slotId - Full slot ID (e.g., advert_mysite_ban_1)
 * @param {string} [breakpoint] - Breakpoint key (defaults to current)
 * @returns {Array} Array of sizes
 */
export function getSizesForSlot(slotId: string, breakpoint?: string) {
  const bp = breakpoint || getBreakpoint();
  const resolvedSlotOverrides = getResolvedSlotOverrides();

  // Check for slot-specific override first
  if (resolvedSlotOverrides[slotId]) {
    const sizes = resolvedSlotOverrides[slotId][bp] || resolvedSlotOverrides[slotId][getSmallestBreakpoint()] || [[1, 1]];
    log(`getSizesForSlot: "${slotId}" using OVERRIDE, bp="${bp}"`, sizes);
    return sizes;
  }

  // Extract ad type from slot ID (e.g., advert_mysite_ban_1 → ban)
  const adType = extractAdType(slotId);
  log(`getSizesForSlot: "${slotId}" using adType="${adType}"`);
  return getSizes(adType, bp);
}

/**
 * Extract ad type from slot ID
 * @param {string} slotId - Full slot ID (e.g., advert_mysite_ban_1)
 * @returns {string} Ad type (e.g., ban)
 */
export function extractAdType(slotId: string) {
  // Split by underscore: advert_mysite_ban_1 -> ['advert', 'mysite', 'ban', '1']
  const parts = slotId.split('_');
  return parts[2] || 'nat'; // index 2 is the ad type
}

/**
 * Build GPT size mapping for an ad type
 * Uses property-merged configuration
 * @param {string} adType - Ad type (ban, mpu, etc.)
 * @returns {Array} GPT-compatible size mapping array
 */
export function buildGPTSizeMapping(adType: string) {
  const mapping: Array<{ viewport: number[]; sizes: any }> = [];
  const breakpoints = config.breakpoints;
  const resolvedAdTypes = getResolvedAdTypes();
  const adConfig = resolvedAdTypes[adType];

  if (!adConfig) {
    warn(`buildGPTSizeMapping: Unknown ad type: ${adType}`);
    return [];
  }

  // Sort breakpoints by minWidth descending (GPT requires this order)
  const sorted = Object.entries(breakpoints)
    .sort((a, b) => (b[1] as any).minWidth - (a[1] as any).minWidth);

  for (const [key, bpValue] of sorted) {
    const bp = bpValue as any;
    const sizes = adConfig[key];
    if (sizes) {
      // Filter out "fluid" strings, convert to GPT format
      const gptSizes = sizes
        .filter((s: any) => Array.isArray(s))
        .map((s: any) => s);

      // Add fluid if present
      if (sizes.includes('fluid')) {
        gptSizes.push('fluid');
      }

      mapping.push({
        viewport: [bp.minWidth, bp.minHeight || 0],
        sizes: gptSizes
      });
    }
  }

  log(`buildGPTSizeMapping: adType="${adType}", ${mapping.length} breakpoint mappings`);
  return mapping;
}

/**
 * Build GPT size mapping for a specific slot (handles overrides)
 * Uses property-merged configuration
 * @param {string} slotId - Full slot ID
 * @returns {Array} GPT-compatible size mapping array
 */
export function buildGPTSizeMappingForSlot(slotId: string) {
  const resolvedSlotOverrides = getResolvedSlotOverrides();

  // Check for slot-specific override
  if (resolvedSlotOverrides[slotId]) {
    const mapping: Array<{ viewport: number[]; sizes: any }> = [];
    const breakpoints = config.breakpoints;
    const slotConfig = resolvedSlotOverrides[slotId];

    const sorted = Object.entries(breakpoints)
      .sort((a, b) => (b[1] as any).minWidth - (a[1] as any).minWidth);

    for (const [key, bpValue] of sorted) {
      const bp = bpValue as any;
      const sizes = slotConfig[key];
      if (sizes) {
        const gptSizes = sizes
          .filter((s: any) => Array.isArray(s))
          .map((s: any) => s);

        if (sizes.includes('fluid')) {
          gptSizes.push('fluid');
        }

        mapping.push({
          viewport: [bp.minWidth, bp.minHeight || 0],
          sizes: gptSizes
        });
      }
    }

    log(`buildGPTSizeMappingForSlot: "${slotId}" using OVERRIDE, ${mapping.length} mappings`);
    return mapping;
  }

  // Fall back to ad type
  const adType = extractAdType(slotId);
  log(`buildGPTSizeMappingForSlot: "${slotId}" using adType="${adType}"`);
  return buildGPTSizeMapping(adType);
}

/**
 * Get all configured breakpoints
 * @returns {Object} Breakpoints config
 */
export function getBreakpoints() {
  return config.breakpoints;
}

/**
 * Get all configured ad types
 * Uses property-merged configuration
 * @returns {Array} List of ad type names
 */
export function getAdTypes() {
  return Object.keys(getResolvedAdTypes());
}

/**
 * Get raw config (for debugging)
 * @returns {Object} Full sizemapping config
 */
export function getConfig() {
  return config;
}

/**
 * Get resolved config for current property (for debugging)
 * @returns {Object} Resolved adTypes and slotOverrides
 */
export function getResolvedConfig() {
  return {
    breakpoints: config.breakpoints,
    adTypes: getResolvedAdTypes(),
    slotOverrides: getResolvedSlotOverrides(),
    property: getProperty()
  };
}

// Default export with all functions
export default {
  init,
  getState,
  getBreakpoint,
  getViewport,
  getSizes,
  getSizesForSlot,
  extractAdType,
  buildGPTSizeMapping,
  buildGPTSizeMappingForSlot,
  getBreakpoints,
  getAdTypes,
  getConfig,
  getResolvedConfig,
  clearCache
};
