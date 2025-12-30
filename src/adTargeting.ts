/**
 * Ad Targeting Module
 * Builds page-level and slot-level targeting for GPT from configurable sources
 */

import rawConfig from '../config/targeting.json';
import sizemapping from './sizemapping';
import CONFIG from '../config/loader.js';
import coreFunctions, { flushLogs } from './internalFunctions';
import configFunctions from '../config/targetingFunctions/index.js';
import { getProperty } from './property';

// Logging prefix
const LOG_PREFIX = '[AdTargeting]';

/**
 * Get resolved targeting config (common + property-specific merged)
 * Property-specific definitions override common ones for the same key
 */
function getTargetingConfig() {
  const property = getProperty();
  const common = (rawConfig as any).common || {};
  const propertyConfig = (rawConfig as any).properties?.[property] || {};

  return {
    normalization: (rawConfig as any).normalization || {},
    pageLevel: {
      ...(common.pageLevel || {}),
      ...(propertyConfig.pageLevel || {})
    },
    slotLevel: {
      ...(common.slotLevel || {}),
      ...(propertyConfig.slotLevel || {})
    }
  };
}

// Resolved config (lazily evaluated)
let _resolvedConfig: any = null;
function resolvedConfig() {
  if (!_resolvedConfig) {
    _resolvedConfig = getTargetingConfig();
  }
  return _resolvedConfig;
}

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
const state = {
  initialized: false
};

// Internal functions registry - built-ins + core + config
const internalFunctions = {
  // Built-in functions (always available)
  getBreakpoint: () => sizemapping.getBreakpoint(),
  getTestgroup: () => {
    // Will be set via registerInternal when experimentManager is available
    // Uses dynamic key based on CONFIG.globalName for window property fallback
    const fallbackKey = `_${CONFIG.globalName}Testgroup`;
    return (window as any)[fallbackKey] || '0';
  },
  // Merge core functions from src/internalFunctions.ts
  ...coreFunctions,
  // Merge config functions from config/targetingFunctions/ (can override core)
  ...configFunctions
};

/**
 * Initialize adTargeting module
 * @returns {Object} Module state
 */
export function init() {
  if (state.initialized) return getState();

  // Flush any queued logs from internalFunctions config
  flushLogs();

  state.initialized = true;

  const config = resolvedConfig();
  log('Initialized', {
    property: getProperty(),
    pageLevel: Object.keys(config.pageLevel || {}),
    slotLevel: Object.keys(config.slotLevel || {}),
    internalFunctions: Object.keys(internalFunctions)
  });

  // Emit ready event
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic: 'loader.adTargeting.ready', data: getState() });
    log('Published loader.adTargeting.ready');
  }

  return getState();
}

/**
 * Get module state
 * @returns {Object} Copy of module state
 */
export function getState() {
  return { ...state };
}

// ============================================================================
// Normalization Functions (internal)
// ============================================================================

/**
 * Normalize a single value for GPT compatibility
 * @param {*} value - Value to normalize
 * @returns {string|null} Normalized value or null if invalid
 */
function normalizeValue(value: any) {
  if (value === null || value === undefined) return null;

  const normConfig = resolvedConfig().normalization || {};
  const maxLength = normConfig.maxValueLength || 40;

  let normalized = String(value);

  // Trim whitespace
  if (normConfig.trimWhitespace !== false) {
    normalized = normalized.trim();
  }

  // Remove invalid characters if sanitize enabled
  if (normConfig.sanitize) {
    normalized = normalized.replace(/[^a-zA-Z0-9_\-.:]/g, '');
  }

  // Truncate to max length
  if (normalized.length > maxLength) {
    normalized = normalized.substring(0, maxLength);
  }

  return normalized || null;
}

/**
 * Normalize an array of values
 * @param {Array} arr - Array to normalize
 * @returns {Array} Normalized array with nulls filtered out
 */
function normalizeArray(arr: any) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(v => normalizeValue(v))
    .filter(v => v !== null);
}

/**
 * Validate and normalize a targeting key
 * @param {string} key - Key to validate
 * @returns {string|null} Valid key or null
 */
function normalizeKey(key: any) {
  if (!key || typeof key !== 'string') return null;

  const normConfig = resolvedConfig().normalization || {};
  const maxLength = normConfig.maxKeyLength || 20;

  let normalized = key.trim().toLowerCase();

  // Keys should be alphanumeric + underscore only
  normalized = normalized.replace(/[^a-z0-9_]/g, '');

  if (normalized.length > maxLength) {
    normalized = normalized.substring(0, maxLength);
  }

  return normalized || null;
}

/**
 * Normalize an entire targeting object
 * @param {Object} targeting - Raw targeting object
 * @returns {Object} Normalized targeting object
 */
function normalizeTargeting(targeting: any) {
  if (!resolvedConfig().normalization?.enabled) return targeting;

  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(targeting)) {
    const normKey = normalizeKey(key);
    if (!normKey) continue;

    if (Array.isArray(value)) {
      const normArr = normalizeArray(value);
      if (normArr.length > 0) {
        normalized[normKey] = normArr;
      }
    } else {
      const normValue = normalizeValue(value);
      if (normValue !== null) {
        normalized[normKey] = normValue;
      }
    }
  }

  return normalized;
}

// Dynamic page targeting storage
let dynamicPageTargeting = {};

/**
 * Register an internal function for targeting resolution
 * @param {string} name - Function name
 * @param {Function} fn - Function to call
 */
export function registerInternal(name: string, fn: any) {
  (internalFunctions as any)[name] = fn;
}

/**
 * Get a value from a nested window path
 * @param {string} path - Dot-separated path (e.g., 'navigator.language')
 * @returns {*} Value at path or null
 */
function getWindowPath(path: string): any {
  try {
    const parts = path.split('.');
    let value: any = window;
    for (const part of parts) {
      if (value === null || value === undefined) return null;
      value = value[part];
    }
    return value;
  } catch (e) {
    return null;
  }
}

/**
 * Get a meta tag value
 * @param {string} key - Meta tag name or property
 * @returns {string|null} Meta tag content or null
 */
function getMetaValue(key: string) {
  const meta = document.querySelector(`meta[name="${key}"]`) ||
               document.querySelector(`meta[property="${key}"]`);
  return meta ? meta.getAttribute('content') : null;
}

/**
 * Get a cookie value
 * @param {string} name - Cookie name
 * @returns {string|null} Cookie value or null
 */
function getCookieValue(name: string) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

/**
 * Get a URL parameter value
 * @param {string} param - Parameter name
 * @returns {string|null} Parameter value or null
 */
function getUrlParam(param: string) {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get(param);
}

/**
 * Apply transform to a value
 * @param {*} value - Value to transform
 * @param {string} transform - Transform type
 * @returns {*} Transformed value
 */
function applyTransform(value: any, transform: any) {
  if (value === null || value === undefined) return value;

  switch (transform) {
    case 'lowercase':
      return typeof value === 'string' ? value.toLowerCase() : value;
    case 'uppercase':
      return typeof value === 'string' ? value.toUpperCase() : value;
    case 'trim':
      return typeof value === 'string' ? value.trim() : value;
    case 'removeTrailingColon':
      return typeof value === 'string' ? value.replace(/:$/, '') : value;
    case 'toString':
      return String(value);
    default:
      return value;
  }
}

/**
 * Apply value mapping
 * @param {*} value - Value to map
 * @param {Object} mapping - Mapping object { sourceValue: targetValue }
 * @param {*} defaultValue - Default if no mapping found
 * @returns {*} Mapped value or original if no mapping
 */
function applyMapping(value: any, mapping: any, defaultValue: any = null) {
  if (!mapping || typeof mapping !== 'object') return value;
  if (value === null || value === undefined) return defaultValue;

  const strValue = String(value);

  // Direct match
  if (mapping.hasOwnProperty(strValue)) {
    return mapping[strValue];
  }

  // Case-insensitive match
  const lowerValue = strValue.toLowerCase();
  for (const [key, mappedValue] of Object.entries(mapping)) {
    if (key.toLowerCase() === lowerValue) {
      return mappedValue;
    }
  }

  // No match - return default if provided, otherwise original value
  return defaultValue !== null ? defaultValue : value;
}

/**
 * Resolve a single source to a raw value (no transforms/mappings)
 * @param {Object} src - Source configuration { source, key/path/value/fn/property }
 * @param {Object} slotContext - Slot context (for slot-level targeting)
 * @returns {*} Raw value or null
 */
function resolveSourceValue(src: any, slotContext: Record<string, any> = {}): any {
  if (!src || !src.source) return null;

  switch (src.source) {
    case 'meta':
      return getMetaValue(src.key);
    case 'cookie':
      return getCookieValue(src.key);
    case 'window':
      return getWindowPath(src.path);
    case 'url':
      return getUrlParam(src.key);
    case 'internal':
      if ((internalFunctions as any)[src.fn]) {
        return (internalFunctions as any)[src.fn]();
      }
      return null;
    case 'static':
      return src.value;
    case 'slot':
      return slotContext[src.property];
    default:
      return null;
  }
}

/**
 * Resolve a single targeting value from config
 * Supports fallback chains via sources array - first truthy value wins
 * @param {Object} def - Targeting definition
 * @param {Object} slotContext - Slot context (for slot-level targeting)
 * @returns {*} Resolved value
 */
function resolveValue(def: any, slotContext: Record<string, any> = {}): any {
  let value: any = null;

  // Handle sources array (fallback chain) - try each until truthy value found
  if (Array.isArray(def.sources)) {
    for (const src of def.sources) {
      const val = resolveSourceValue(src, slotContext);
      if (val != null && val !== '') {
        value = val;
        break;
      }
    }
  } else if (def.source) {
    // Single source (legacy format)
    value = resolveSourceValue(def, slotContext);
    if (value === null && def.source !== 'static' && def.source !== 'slot') {
      // Only warn for unknown sources, not for null values
    }
  }

  // Handle array type
  if (def.type === 'array' && typeof value === 'string') {
    const delimiter = def.delimiter || ',';
    value = value.split(delimiter).map(s => s.trim()).filter(Boolean);
  }

  // Apply transform
  if (def.transform) {
    value = applyTransform(value, def.transform);
  }

  // Apply mapping if defined
  if (def.mapping) {
    value = applyMapping(value, def.mapping, def.default);
  } else if (value === null && def.default !== undefined) {
    // Apply default if no value and no mapping
    value = def.default;
  }

  return value;
}

/**
 * Internal function to build page-level targeting
 * @returns {Object} Page-level targeting key-values (normalized)
 */
function buildPageTargetingInternal() {
  const targeting: Record<string, any> = {};
  const config = resolvedConfig();

  for (const [key, def] of Object.entries(config.pageLevel || {})) {
    const value = resolveValue(def);
    if (value !== null && value !== undefined && value !== '') {
      targeting[key] = value;
    }
  }

  return normalizeTargeting(targeting);
}

/**
 * Build page-level targeting object
 * @param {Object} overrides - Optional overrides
 * @returns {Object} Page-level targeting key-values (normalized)
 */
export function buildPageTargeting(overrides = {}) {
  const baseTargeting = buildPageTargetingInternal();

  // Include dynamic targeting (always fresh - set at runtime)
  Object.assign(baseTargeting, dynamicPageTargeting);

  // Apply overrides
  Object.assign(baseTargeting, overrides);

  log(`buildPageTargeting: ${Object.keys(baseTargeting).length} keys`, baseTargeting);
  return baseTargeting;
}

/**
 * Build slot-level targeting object
 * @param {Object} slotContext - Slot context { id, adType, count }
 * @param {Object} overrides - Optional overrides
 * @returns {Object} Slot-level targeting key-values (normalized)
 */
export function buildSlotTargeting(slotContext: any, overrides = {}) {
  const targeting: Record<string, any> = {};
  const config = resolvedConfig();

  for (const [key, def] of Object.entries(config.slotLevel || {})) {
    const value = resolveValue(def, slotContext);
    if (value !== null && value !== undefined && value !== '') {
      targeting[key] = value;
    }
  }

  // Apply overrides
  Object.assign(targeting, overrides);

  // Normalize before returning
  const normalized = normalizeTargeting(targeting);
  log(`buildSlotTargeting: ${slotContext.id || 'unknown'} -> ${Object.keys(normalized).length} keys`);
  return normalized;
}

/**
 * Build combined targeting (page + slot)
 * @param {Object} slotContext - Slot context { id, adType, count }
 * @param {Object} overrides - Optional overrides
 * @returns {Object} Combined targeting key-values
 */
export function buildTargeting(slotContext: Record<string, any> = {}, overrides = {}) {
  const pageTargeting = buildPageTargeting();
  const slotTargeting = buildSlotTargeting(slotContext);

  const combined = {
    ...pageTargeting,
    ...slotTargeting,
    ...overrides
  };

  log(`buildTargeting: combined ${Object.keys(combined).length} keys for ${slotContext.id || 'page'}`);
  return combined;
}

/**
 * Get targeting config (resolved for current property)
 * @returns {Object} Targeting configuration
 */
export function getConfig() {
  return resolvedConfig();
}

/**
 * Set a page-level targeting value dynamically
 * @param {string} key - Targeting key
 * @param {*} value - Value to set
 */
export function setPageTargeting(key: string, value: any) {
  (dynamicPageTargeting as any)[key] = value;
  log(`setPageTargeting: ${key}=${value}`);
}

/**
 * Set multiple page-level targeting values
 * @param {Object} targeting - Key-value pairs to set
 */
export function setPageTargetingBulk(targeting: any) {
  Object.assign(dynamicPageTargeting, targeting);
  log(`setPageTargetingBulk: ${Object.keys(targeting).length} keys`, targeting);
}

/**
 * Get all dynamic page targeting
 * @returns {Object} Dynamic page targeting
 */
export function getDynamicPageTargeting() {
  return { ...dynamicPageTargeting };
}

/**
 * Clear dynamic page targeting
 */
export function clearDynamicPageTargeting() {
  const count = Object.keys(dynamicPageTargeting).length;
  dynamicPageTargeting = {};
  log(`clearDynamicPageTargeting: cleared ${count} keys`);
}

/**
 * Remove a specific dynamic targeting key
 * @param {string} key - Key to remove
 */
export function removeDynamicTargeting(key: string) {
  delete (dynamicPageTargeting as any)[key];
  log(`removeDynamicTargeting: removed "${key}"`);
}

/**
 * Get a single raw value by key (no normalization)
 * @param {string} key - Targeting key from pageLevel config
 * @returns {*} Raw resolved value or null
 */
export function getValue(key: string) {
  const config = resolvedConfig();
  const def = config.pageLevel?.[key];
  if (!def) return null;
  return resolveValue(def);
}

/**
 * Resolve a value from a definition object
 * Used by other modules (e.g., slots.ts for PPID resolution)
 * @param {Object} def - Value definition { source, fn/path/key/value, ... }
 * @returns {*} Resolved value or null
 */
export function resolveValueDefinition(def: any): any {
  if (!def || typeof def !== 'object') return null;
  return resolveValue(def);
}

// Utils namespace for normalization functions
const utils = {
  normalizeValue,
  normalizeArray,
  normalizeKey,
  normalizeTargeting
};

// Default export with all functions
export default {
  init,
  getState,
  registerInternal,
  buildPageTargeting,
  buildSlotTargeting,
  buildTargeting,
  getConfig,
  getValue,
  resolveValueDefinition,
  setPageTargeting,
  setPageTargetingBulk,
  getDynamicPageTargeting,
  clearDynamicPageTargeting,
  removeDynamicTargeting,
  utils
};
