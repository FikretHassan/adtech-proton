/**
 * Environment Detection Module
 * Determines production/dev/staging environment and controls ad serving mode
 * Handles URL parameter overrides from the monolith
 */

import config from '../config/properties.json';
import CONFIG from '../config/loader.js';
import property from './property';

// Logging prefix
const LOG_PREFIX = '[Environment]';

/**
 * Get the loader instance from the global object
 */
function getLoader(): any {
  return (window as any)[CONFIG.globalName];
}

/**
 * Log helper - uses loader's log system if available
 */
function log(message: string, data: any = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${message}`, data);
  }
}

// Environment state
const state = {
  productionAds: config.defaults?.productionAds ?? false,
  debugMode: config.defaults?.debugMode ?? false,
  environment: 'unknown',
  property: 'dev',
  hostname: '',
  initialized: false
};

// URL parameter state
const urlParams: Record<string, boolean | string | null> = {
  // Debug/testing
  adsDisableStack: false,     // Disable all ad loading
  adsShowProductionAds: false, // Force production ads on non-prod

  // Ad testing
  adtest: null,               // Set adtest targeting key value
  adteston: false,            // Force test ad units
  adkill: false,              // Kill all ads
  adgptoff: false,            // Disable GPT

  // SRA batching
  adSraOn: false,             // Force SRA batching on
  adSraOff: false             // Force SRA batching off
};

/**
 * Check if hostname matches any domain in a list
 * Supports exact match and wildcard patterns (*.example.com)
 * @param hostname - Current hostname
 * @param domains - List of domains to match
 * @returns True if hostname matches any domain
 */
function matchesDomain(hostname: string, domains: string[]): boolean {
  if (!Array.isArray(domains)) return false;

  return domains.some(domain => {
    if (domain === 'all') return true;
    if (domain.startsWith('*.')) {
      const suffix = domain.slice(1); // Remove *
      return hostname.endsWith(suffix) || hostname === domain.slice(2);
    }
    return hostname === domain;
  });
}

/**
 * Check URL for parameter (presence check, no value needed)
 * @param param - Parameter name to check
 * @returns True if param exists in URL
 */
function hasUrlParam(param: string): boolean {
  if (!param) return false;
  return window.location.search.indexOf(param) >= 0 ||
         window.location.href.indexOf(param) >= 0;
}

/**
 * Get URL parameter value
 * @param key - Parameter name
 * @returns Parameter value or null if not found
 */
export function getUrlParamValue(key: string): string | null {
  if (!key) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get(key);
  } catch (e) {
    // Fallback for older browsers
    const match = window.location.search.match(new RegExp('[?&]' + key + '=([^&]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/**
 * Parse URL param value with type coercion
 * @param raw - Raw string value
 * @returns Parsed value (boolean, number, or string)
 */
export function parseUrlParamValue(raw: string | null | undefined): boolean | number | string | null {
  if (raw === null || raw === undefined) return null;
  if (raw === 'null') return null;
  if (raw === 'true' || raw === '') return true; // Empty value = true for flags
  if (raw === 'false') return false;
  const num = parseInt(raw, 10);
  return isNaN(num) ? raw : num;
}

/**
 * Parse all URL parameters from the monolith
 */
function parseUrlParams() {
  const search = window.location.search;
  const href = window.location.href;

  // Debug/testing - presence check (no value needed)
  urlParams.adsDisableStack = hasUrlParam('adsDisableStack');
  urlParams.adsShowProductionAds = hasUrlParam('adsShowProductionAds');
  
  // Ad testing
  urlParams.adtest = getUrlParamValue('adtest');
  urlParams.adteston = hasUrlParam('adteston');
  urlParams.adkill = hasUrlParam('adkill');
  urlParams.adgptoff = hasUrlParam('adgptoff');

  // SRA batching
  urlParams.adSraOn = hasUrlParam('adSraOn');
  urlParams.adSraOff = hasUrlParam('adSraOff');

  // Log active overrides
  const activeParams = Object.entries(urlParams)
    .filter(([k, v]) => v !== false && v !== null)
    .map(([k, v]) => `${k}=${v}`);
  
  if (activeParams.length > 0) {
    log('URL params detected', activeParams);
  }
}

/**
 * Initialize environment detection
 * @returns {Object} Environment state
 */
export function init() {
  if (state.initialized) return getState();

  const hostname = window.location.hostname;
  state.hostname = hostname;

  // Parse URL parameters first
  parseUrlParams();

  // Initialize property detection (checks for URL override)
  const propertyOverride = property.checkUrlOverride();
  if (propertyOverride) {
    property.setProperty(propertyOverride);
    log(`Property override via URL: ${propertyOverride}`);
  } else {
    property.init();
  }
  state.property = property.getProperty();

  // Set production ads from property config
  state.productionAds = property.isProduction();

  // Determine environment type (blocked overrides production)
  if (matchesDomain(hostname, config.blockedDomains)) {
    state.environment = 'blocked';
    state.productionAds = false;
    log(`Detected: BLOCKED domain "${hostname}"`);
  } else if (state.productionAds) {
    state.environment = 'production';
    log(`Detected: PRODUCTION (property: ${state.property})`);
  } else {
    state.environment = 'development';
    log(`Detected: DEVELOPMENT (property: ${state.property})`);
  }

  // URL param overrides for production ads
  if (urlParams.adsShowProductionAds) {
    state.productionAds = true;
    log('URL override: adsShowProductionAds - forcing production ads');
  }

  // Debug mode check - uses configurable param from loader.js
  if (hasUrlParam(CONFIG.debugParam)) {
    state.debugMode = true;
    log('Debug mode enabled via URL param');
  }

  state.initialized = true;
  log('Initialized', {
    environment: state.environment,
    property: state.property,
    productionAds: state.productionAds,
    debugMode: state.debugMode
  });

  // Emit ready event
  const pubsub = (window as any)[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic: 'loader.environment.ready', data: getState() });
    log('Published loader.environment.ready');
  }

  return getState();
}

/**
 * Get current environment state
 * @returns {Object} Copy of environment state
 */
export function getState() {
  return { ...state };
}

/**
 * Get all URL parameters
 * @returns {Object} Copy of URL parameters
 */
export function getUrlParams() {
  return { ...urlParams };
}

/**
 * Check if a specific URL param is set
 * @param key - Parameter key
 * @returns Parameter value or false/null
 */
export function getParam(key: string): boolean | string | null {
  return urlParams[key] ?? null;
}

/**
 * Check if ads should be disabled (adsDisableStack or adkill)
 * @returns {boolean} True if ads should be disabled
 */
export function isAdsDisabled() {
  return urlParams.adsDisableStack || urlParams.adkill || urlParams.adgptoff;
}

/**
 * Check if test ad units should be used
 * @returns {boolean} True if adteston is set
 */
export function useTestAdUnits() {
  return urlParams.adteston;
}

/**
 * Check if production ads should be served
 * @returns {boolean} True if production ads enabled
 */
export function isProduction() {
  return state.productionAds;
}

/**
 * Check if current environment is blocked
 * @returns {boolean} True if ads should be blocked
 */
export function isBlocked() {
  return state.environment === 'blocked';
}

/**
 * Check if debug mode is enabled
 * @returns {boolean} True if debug mode on
 */
export function isDebug() {
  return state.debugMode;
}

/**
 * Get environment type
 * @returns {string} Environment type (production, app, staging, development, blocked)
 */
export function getEnvironment() {
  return state.environment;
}

/**
 * Get current hostname
 * @returns {string} Current hostname
 */
export function getHostname() {
  return state.hostname;
}

/**
 * Get current property ID
 * @returns {string} Current property ID (e.g., 'mysite', 'dev', 'default')
 */
export function getProperty() {
  return state.property;
}

/**
 * Force production ads mode (for testing)
 * @param enabled - Whether to enable production ads
 */
export function setProductionAds(enabled: boolean): void {
  state.productionAds = !!enabled;
  log(`setProductionAds: ${state.productionAds}`);
}

/**
 * Get configuration
 * @returns {Object} Environment configuration
 */
export function getConfig() {
  return config;
}

export default {
  init,
  getState,
  getUrlParams,
  getParam,
  isAdsDisabled,
  useTestAdUnits,
  isProduction,
  isBlocked,
  isDebug,
  getEnvironment,
  getHostname,
  getProperty,
  setProductionAds,
  getConfig,
  getUrlParamValue,
  parseUrlParamValue
};
