/**
 * Dimension Resolver Module
 * Helper functions for resolving dimension values from various sources
 * (meta tags, window paths, cookies, URLs, static values)
 */

import sizemapping from './sizemapping';

/**
 * Get a value from a nested window path
 * @param {string} path - Dot-separated path (e.g., 'myApp.config.value')
 * @returns {*} Value at path, null if intermediate path is null/undefined, or undefined if property doesn't exist
 */
export function getWindowPath(path: string): any {
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
 * Get a value from a meta tag
 * @param {string} name - Meta tag name attribute
 * @returns {string|null} Meta tag content or null
 */
export function getMetaContent(name: string): string | null {
  const meta = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  return meta ? meta.content : null;
}

/**
 * Resolve a single source to a raw value
 * @param {Object} src - Source configuration { source, key/path/value/fn }
 * @returns {*} Raw value or null
 */
export function resolveSource(src: any): any {
  if (!src || !src.source) return null;

  switch (src.source) {
    case 'meta':
      return getMetaContent(src.key);
    case 'window':
      return getWindowPath(src.path || src.key);
    case 'cookie': {
      const match = document.cookie.match(new RegExp('(^| )' + src.key + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    }
    case 'url': {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get(src.key);
    }
    case 'static':
      return src.value;
    case 'internal':
      if (src.fn === 'sizemapping.getBreakpoint') {
        return sizemapping.getBreakpoint();
      }
      return null;
    default:
      return null;
  }
}

/**
 * Apply transform to a dimension value
 * @param {*} value - Value to transform
 * @param {string} transform - Transform type (lowercase, uppercase, trim, removeTrailingColon)
 * @returns {*} Transformed value
 */
export function applyTransform(value: any, transform: string): any {
  if (value === null || value === undefined || typeof value !== 'string') return value;

  switch (transform) {
    case 'lowercase':
      return value.toLowerCase();
    case 'uppercase':
      return value.toUpperCase();
    case 'trim':
      return value.trim();
    case 'removeTrailingColon':
      return value.replace(/:$/, '');
    default:
      return value;
  }
}

/**
 * Resolve a dimension value from configured source(s)
 * Supports: meta, window, cookie, url, static, internal
 * Supports fallback chains via sources array - first truthy value wins
 * Supports transforms: lowercase, uppercase, trim, removeTrailingColon
 * @param {Object|string} sourceConfig - Source configuration or string (static value)
 * @returns {*} Resolved value or null
 */
export function resolveDimensionValue(sourceConfig: any): any {
  if (typeof sourceConfig === 'string') {
    return sourceConfig;
  }
  if (!sourceConfig) {
    return null;
  }

  let rawValue: any = null;

  // Handle sources array (fallback chain) - try each until truthy value found
  if (Array.isArray(sourceConfig.sources)) {
    for (const src of sourceConfig.sources) {
      const val = resolveSource(src);
      if (val != null && val !== '') {
        rawValue = val;
        break;
      }
    }
  } else if (sourceConfig.source) {
    // Single source (legacy format)
    rawValue = resolveSource(sourceConfig);
  } else {
    return null;
  }

  // Apply transform if defined (before mapping)
  if (sourceConfig.transform && rawValue != null) {
    rawValue = applyTransform(rawValue, sourceConfig.transform);
  }

  // Apply mapping if defined
  if (sourceConfig.mapping && rawValue != null) {
    const mapped = sourceConfig.mapping[rawValue];
    if (mapped !== undefined) {
      return mapped;
    }
  }

  // Return raw value if found, otherwise default
  if (rawValue != null) {
    return rawValue;
  }

  return sourceConfig.default ?? null;
}
