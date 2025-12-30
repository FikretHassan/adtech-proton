/**
 * Targeting - Configurable include/exclude evaluation engine
 */

export type MatchType = 'exact' | 'startsWith' | 'includes';

export interface DimensionConfig {
  matchType?: MatchType;
}

export interface TargetingResult {
  matched: boolean;
  reason: string;
}

export interface TargetingRules {
  [dimension: string]: string[] | (() => boolean) | undefined;
}

export interface TargetingContext {
  [dimension: string]: string | number | boolean;
}

export interface DimensionConfigMap {
  [dimension: string]: DimensionConfig;
}

export interface NormalizedTargetingConfig {
  include: TargetingRules;
  exclude: TargetingRules;
}

/**
 * Check if a value matches against a rule array
 */
export function matchesRule(value: unknown, rules: string[], matchType: MatchType = 'exact'): boolean {
  if (!rules || rules.length === 0) {
    return true; // No rules = allow all
  }

  if (rules.indexOf('all') === 0 || rules.includes('all')) {
    return true;
  }

  const normalizedValue = String(value).toLowerCase();

  switch (matchType) {
    case 'startsWith':
      return rules.some(rule => normalizedValue.startsWith(String(rule).toLowerCase()));
    case 'includes':
      return rules.some(rule => normalizedValue.includes(String(rule).toLowerCase()));
    case 'exact':
    default:
      return rules.some(rule => normalizedValue === String(rule).toLowerCase());
  }
}

/**
 * Check if a value is excluded by rule array
 */
export function isExcluded(value: unknown, rules: string[], matchType: MatchType = 'exact'): boolean {
  if (!rules || rules.length === 0) {
    return false; // No exclusion rules = not excluded
  }

  const normalizedValue = String(value).toLowerCase();

  switch (matchType) {
    case 'startsWith':
      return rules.some(rule => normalizedValue.startsWith(String(rule).toLowerCase()));
    case 'includes':
      return rules.some(rule => normalizedValue.includes(String(rule).toLowerCase()));
    case 'exact':
    default:
      return rules.some(rule => normalizedValue === String(rule).toLowerCase());
  }
}

/**
 * Evaluate targeting rules against current context
 *
 * @example
 * const result = evaluateTargeting(
 *   { zone: ['sport', 'news'], pagetype: ['all'] },
 *   { zone: ['puzzles'] },
 *   { zone: 'sport', pagetype: 'article', geo: 'gb' },
 *   { zone: { matchType: 'startsWith' } }  // zone uses startsWith matching
 * );
 */
export function evaluateTargeting(
  include: TargetingRules = {},
  exclude: TargetingRules = {},
  context: TargetingContext = {},
  dimensionConfig: DimensionConfigMap = {}
): TargetingResult {
  // 1. Check exclude.special() first - custom exclusion function
  if (typeof exclude.special === 'function') {
    try {
      if (exclude.special() === true) {
        return { matched: false, reason: 'Excluded by special function' };
      }
    } catch (e) {
      console.warn('exclude.special() threw error:', e);
    }
  }

  // 2. Check include.special() - custom inclusion function (overrides other rules)
  if (typeof include.special === 'function') {
    try {
      if (include.special() === true) {
        return { matched: true, reason: 'Included by special function' };
      }
    } catch (e) {
      console.warn('include.special() threw error:', e);
    }
  }

  // 3. Evaluate each dimension in context
  for (const dimension of Object.keys(context)) {
    const currentValue = context[dimension];
    const config = dimensionConfig[dimension] || {};
    const matchType = config.matchType || 'exact';

    // Check exclusion first
    const excludeRules = exclude[dimension];
    if (excludeRules && Array.isArray(excludeRules) && excludeRules.length > 0) {
      if (isExcluded(currentValue, excludeRules, matchType)) {
        return { matched: false, reason: `Excluded by ${dimension}: ${currentValue}` };
      }
    }

    // Check inclusion
    const includeRules = include[dimension];
    if (includeRules && Array.isArray(includeRules) && includeRules.length > 0) {
      if (!matchesRule(currentValue, includeRules, matchType)) {
        return { matched: false, reason: `Not included by ${dimension}: ${currentValue}` };
      }
    }
  }

  // 3.5. STRICT VALIDATION: Verify all dimensions in include/exclude rules exist in context
  // This catches typos and misconfigurations (e.g., 'rendertype' vs 'renderertype')
  for (const dimension of Object.keys(include)) {
    // Skip special function
    if (dimension === 'special') continue;

    // If dimension has rules but doesn't exist in context, fail
    const includeRules = include[dimension];
    if (includeRules && Array.isArray(includeRules) && includeRules.length > 0) {
      if (!(dimension in context)) {
        return {
          matched: false,
          reason: `Include rule references unknown dimension: "${dimension}" (not in context). Check for typos in dimension names.`
        };
      }
    }
  }

  // Also validate exclude rules reference known dimensions
  for (const dimension of Object.keys(exclude)) {
    // Skip special function
    if (dimension === 'special') continue;

    // If dimension has rules but doesn't exist in context, fail
    const excludeRules = exclude[dimension];
    if (excludeRules && Array.isArray(excludeRules) && excludeRules.length > 0) {
      if (!(dimension in context)) {
        return {
          matched: false,
          reason: `Exclude rule references unknown dimension: "${dimension}" (not in context). Check for typos in dimension names.`
        };
      }
    }
  }

  // 4. All checks passed
  return { matched: true, reason: 'All targeting rules passed' };
}

/**
 * Check if current domain matches allowed domains
 */
export function matchesDomain(domains: string[], currentDomain?: string): boolean {
  if (!domains || domains.length === 0) {
    return true;
  }

  const host = currentDomain || (typeof window !== 'undefined' ? window.location.host : '');

  if (domains.includes('all')) {
    return true;
  }

  return domains.includes(host);
}

/**
 * Check if current property matches allowed properties
 * Used for property-based filtering of partners, hooks, experiences, etc.
 *
 * @param properties - Array of property IDs, or undefined/empty/['all'] for all
 * @param currentProperty - Current property ID from property.ts
 * @returns true if item should run on this property
 *
 * @example
 * // Runs on all properties
 * matchesProperty(undefined, 'mysite') // true
 * matchesProperty([], 'mysite') // true
 * matchesProperty(['all'], 'mysite') // true
 *
 * // Runs only on specified properties
 * matchesProperty(['mysite'], 'mysite') // true
 * matchesProperty(['mysite'], 'siteB') // false
 * matchesProperty(['mysite', 'siteB'], 'siteB') // true
 */
export function matchesProperty(
  properties: string[] | undefined,
  currentProperty: string
): boolean {
  // No properties specified = runs everywhere
  if (!properties || properties.length === 0) {
    return true;
  }

  // 'all' means all properties
  if (properties.includes('all')) {
    return true;
  }

  // Check if current property is in the list
  return properties.includes(currentProperty);
}

/**
 * Normalize targeting config with defaults
 */
export function normalizeTargetingConfig(config: Partial<NormalizedTargetingConfig> = {}): NormalizedTargetingConfig {
  return {
    include: {
      special: config.include?.special || (() => false),
      ...config.include
    },
    exclude: {
      special: config.exclude?.special || (() => false),
      ...config.exclude
    }
  };
}

export default {
  matchesRule,
  isExcluded,
  evaluateTargeting,
  matchesDomain,
  matchesProperty,
  normalizeTargetingConfig
};
