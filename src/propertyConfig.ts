/**
 * Property Config Helper
 *
 * Resolves property-specific configuration from property-keyed config objects.
 * Falls back through: currentProperty -> 'default' -> flat config (legacy support)
 */

import { getProperty } from './property';
import CONFIG from '../config/loader.js';

const LOG_PREFIX = '[PropertyConfig]';

/**
 * Get the loader instance from the global object
 */
function getLoader() {
  return (window as any)[CONFIG.globalName];
}

/**
 * Log helper
 */
function log(message: string, data: any = null) {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${message}`, data);
  }
}

/**
 * Check if config is property-keyed (has property IDs as top-level keys)
 * Property-keyed configs have a 'properties' wrapper or known property IDs at root
 */
function isPropertyKeyed(config: any): boolean {
  if (!config || typeof config !== 'object') return false;

  // Check for explicit 'properties' wrapper
  if (config.properties && typeof config.properties === 'object') {
    return true;
  }

  // Check if has known property structure markers
  // Property-keyed configs typically have property IDs as top-level keys
  const knownMarkers = ['default', 'dev', 'staging', 'production'];
  const hasPropertyKeys = knownMarkers.some(key => key in config);

  // Also check it doesn't look like a flat config (has typical slot/sizemapping keys)
  const flatConfigMarkers = ['selector', 'breakpoints', 'adTypes', 'prebidConfig', 'apsConfig'];
  const looksFlat = flatConfigMarkers.some(key => key in config);

  return hasPropertyKeys && !looksFlat;
}

/**
 * Resolve property-specific config from a property-keyed config object
 *
 * @param config - Config object (may be property-keyed or flat)
 * @param propertyId - Optional property ID override (defaults to current property)
 * @returns Resolved config for the property
 *
 * Resolution order:
 * 1. config.properties[propertyId]
 * 2. config[propertyId] (direct property key)
 * 3. config.properties.default
 * 4. config.default
 * 5. config itself (flat config, backward compatible)
 */
export function resolveConfig<T>(config: any, propertyId?: string): T {
  if (!config) return config;

  const property = propertyId || getProperty();

  // Check for 'properties' wrapper
  if (config.properties) {
    if (config.properties[property]) {
      log(`Resolved config for property: ${property} (from properties wrapper)`);
      return config.properties[property];
    }
    if (config.properties.default) {
      log(`Using default config (property ${property} not found in properties wrapper)`);
      return config.properties.default;
    }
  }

  // Check for direct property key
  if (config[property] && typeof config[property] === 'object') {
    // Make sure it's not a flat config marker
    const flatMarkers = ['selector', 'breakpoints', 'adTypes', 'prebidConfig', 'apsConfig', 'enabled'];
    if (!flatMarkers.includes(property)) {
      log(`Resolved config for property: ${property} (direct key)`);
      return config[property];
    }
  }

  // Check for default key
  if (config.default && typeof config.default === 'object') {
    log(`Using default config (property ${property} not found)`);
    return config.default;
  }

  // Return flat config as-is (backward compatibility)
  return config as T;
}

/**
 * Get a specific value from property-keyed config
 * Useful for getting nested values: getConfigValue(slotsConfig, 'adUnitPath')
 */
export function getConfigValue<T>(config: any, key: string, propertyId?: string): T | undefined {
  const resolved = resolveConfig<Record<string, T>>(config, propertyId);
  return resolved?.[key];
}

/**
 * Merge property config with defaults
 * Property-specific values override defaults
 */
export function mergeWithDefaults<T extends object>(
  config: any,
  defaults: Partial<T>,
  propertyId?: string
): T {
  const resolved = resolveConfig<Partial<T>>(config, propertyId);
  return { ...defaults, ...resolved } as T;
}

/**
 * Check if config has property-specific overrides
 */
export function hasPropertyConfig(config: any, propertyId?: string): boolean {
  if (!config) return false;

  const property = propertyId || getProperty();

  if (config.properties?.[property]) return true;
  if (config[property] && !['selector', 'breakpoints', 'adTypes'].includes(property)) return true;

  return false;
}

/**
 * Get all available property IDs from a config
 */
export function getAvailableProperties(config: any): string[] {
  if (!config) return [];

  const properties: Set<string> = new Set();

  if (config.properties) {
    Object.keys(config.properties).forEach(key => properties.add(key));
  }

  // Check direct keys that look like property IDs
  const knownProperties = ['default', 'dev', 'staging', 'production'];
  knownProperties.forEach(key => {
    if (config[key] && typeof config[key] === 'object') {
      properties.add(key);
    }
  });

  return Array.from(properties);
}

export default {
  resolveConfig,
  getConfigValue,
  mergeWithDefaults,
  hasPropertyConfig,
  getAvailableProperties,
  isPropertyKeyed
};
