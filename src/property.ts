/**
 * Property Detection Module
 * Detects current property/environment from hostname using config/properties.json
 */

import config from '../config/properties.json';
import CONFIG from '../config/loader.js';

const LOG_PREFIX = '[Property]';

// Module state
let currentProperty: string | null = null;
let initialized = false;

interface PropertyConfig {
  domains?: string[];
  description?: string;
  production?: boolean;
}

interface PropertiesConfig {
  [key: string]: PropertyConfig;
}

/**
 * Get the loader instance from the global object
 */
function getLoader() {
  return (window as any)[CONFIG.globalName];
}

/**
 * Log helper - uses loader's log system if available
 */
function log(message: string, data: any = null) {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${message}`, data);
  }
}

/**
 * Check if a domain pattern is a wildcard
 */
export function isWildcard(domain: string): boolean {
  return domain.startsWith('*.');
}

/**
 * Check if hostname matches a domain pattern
 * Supports exact match and wildcard patterns (*.example.com)
 */
export function matchesDomain(hostname: string, domain: string): boolean {
  if (domain === 'all') return true;

  if (isWildcard(domain)) {
    const suffix = domain.slice(1); // Remove *, keep .example.com
    return hostname.endsWith(suffix) || hostname === domain.slice(2);
  }

  return hostname === domain;
}

/**
 * Check if hostname matches any exact (non-wildcard) domain in a list
 */
export function matchesExactDomain(hostname: string, domains: string[]): boolean {
  if (!domains || domains.length === 0) return false;
  return domains.some(domain => !isWildcard(domain) && hostname === domain);
}

/**
 * Check if hostname matches any wildcard domain in a list
 */
export function matchesWildcardDomain(hostname: string, domains: string[]): boolean {
  if (!domains || domains.length === 0) return false;
  return domains.some(domain => isWildcard(domain) && matchesDomain(hostname, domain));
}

/**
 * Check if hostname matches any domain in a list
 */
export function matchesDomains(hostname: string, domains: string[]): boolean {
  if (!domains || domains.length === 0) return false;
  return domains.some(domain => matchesDomain(hostname, domain));
}

/**
 * Initialize property detection
 * Detects current property from hostname using two-pass matching:
 * 1. First pass: exact domain matches (takes priority)
 * 2. Second pass: wildcard matches
 * 3. Fallback: 'default' property
 */
export function init(): string {
  if (initialized && currentProperty) {
    return currentProperty;
  }

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const typedProperties = config.properties as PropertiesConfig;

  // First pass: check for exact domain matches (priority over wildcards)
  for (const [propertyId, propConfig] of Object.entries(typedProperties)) {
    if (propertyId === 'default') continue; // Only skip 'default' - it's the fallback
    if (!propConfig.domains) continue;

    if (matchesExactDomain(hostname, propConfig.domains)) {
      currentProperty = propertyId;
      initialized = true;
      log(`Detected property (exact match): ${propertyId}`, { hostname, domains: propConfig.domains });
      return propertyId;
    }
  }

  // Second pass: check for wildcard domain matches
  for (const [propertyId, propConfig] of Object.entries(typedProperties)) {
    if (propertyId === 'default') continue;
    if (!propConfig.domains) continue;

    if (matchesWildcardDomain(hostname, propConfig.domains)) {
      currentProperty = propertyId;
      initialized = true;
      log(`Detected property (wildcard match): ${propertyId}`, { hostname, domains: propConfig.domains });
      return propertyId;
    }
  }

  // Fall back to default
  currentProperty = 'default';
  initialized = true;
  log(`Using default property`, { hostname });
  return 'default';
}

/**
 * Get current property ID
 * Initializes if not already done
 */
export function getProperty(): string {
  if (!initialized) {
    return init();
  }
  return currentProperty || 'default';
}

/**
 * Get property config for current or specified property
 */
export function getPropertyConfig(propertyId?: string): PropertyConfig | null {
  const id = propertyId || getProperty();
  const typedProperties = config.properties as PropertiesConfig;
  return typedProperties[id] || null;
}

/**
 * Get all property IDs
 */
export function getPropertyIds(): string[] {
  return Object.keys(config.properties);
}

/**
 * Check if a property ID is valid
 */
export function isValidProperty(propertyId: string): boolean {
  return propertyId in config.properties;
}

/**
 * Check if current property is a production property
 * Returns the production flag from properties.json, defaults to false
 */
export function isProduction(propertyId?: string): boolean {
  const config = getPropertyConfig(propertyId);
  return config?.production ?? false;
}

/**
 * Force set property (for testing/override)
 */
export function setProperty(propertyId: string): void {
  if (isValidProperty(propertyId)) {
    currentProperty = propertyId;
    initialized = true;
    log(`Property overridden to: ${propertyId}`);
  } else {
    log(`Invalid property ID: ${propertyId}`, { valid: getPropertyIds() });
  }
}

/**
 * Check URL for property override parameter
 */
export function checkUrlOverride(): string | null {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const override = params.get('propertyOverride');

  if (override && isValidProperty(override)) {
    return override;
  }

  return null;
}

/**
 * Get module state
 */
export function getState() {
  return {
    initialized,
    currentProperty,
    hostname: typeof window !== 'undefined' ? window.location.hostname : ''
  };
}

/**
 * Reset module state (for testing)
 */
export function reset(): void {
  currentProperty = null;
  initialized = false;
}

export default {
  init,
  getProperty,
  getPropertyConfig,
  getPropertyIds,
  isValidProperty,
  isProduction,
  setProperty,
  checkUrlOverride,
  isWildcard,
  matchesDomain,
  matchesExactDomain,
  matchesWildcardDomain,
  matchesDomains,
  getState,
  reset
};
