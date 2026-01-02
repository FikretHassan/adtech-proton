/**
 * Wrapper Slot Resolver
 *
 * Shared utility for resolving slot configuration from slots.json.
 * Used by wrapper adapters (prebid.js, amazonaps.js) to get slot config
 * without hardcoding slot definitions in JS.
 *
 * Features:
 * - Declarative slot rules with match patterns (adType, slotId, slotPattern)
 * - Dimension-based targeting (include/exclude using evaluateTargeting)
 * - Explicit size definitions per rule (bid request sizes, not GPT sizemapping)
 * - Property merging (common + property-specific)
 */

import rawConfig from '../../config/wrapperauctions/slots.json';
import CONFIG from '../../config/loader.js';
import { getProperty } from '../property';
import { evaluateTargeting } from '../targeting';
import { dimensions as generatedDimensions, dimensionConfig as generatedDimensionConfig } from '../generated/dimensions.js';
import sizemapping from '../sizemapping';
import type { AuctionContext } from '../wrappers/types';

// Cast config to any for dynamic property access
const config = rawConfig as any;

// Logging prefix
const LOG_PREFIX = '[WrapperSlotResolver]';

// ============================================================================
// Types
// ============================================================================

export interface SlotMatch {
  adType?: string;
  slotId?: string;
  slotPattern?: string;
}

export interface PrebidWrapperConfig {
  bidders: Record<string, true | Record<string, unknown>>;
}

export interface SlotRule {
  match: SlotMatch;
  include?: Record<string, string[]>;
  exclude?: Record<string, string[]>;
  sizes: Array<[number, number]>;
  video?: boolean;
  wrappers: {
    prebid?: PrebidWrapperConfig;
    amazonaps?: true | Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface ResolvedSlotConfig {
  sizes: Array<[number, number]>;
  video: boolean;
  wrapperConfig: Record<string, unknown> | true | null;
  rule: SlotRule;
}

/** For Prebid, returns bidder configs */
export interface ResolvedPrebidConfig {
  sizes: Array<[number, number]>;
  video: boolean;
  wrapperConfig: PrebidWrapperConfig;
  bidders: Record<string, true | Record<string, unknown>>;
  rule: SlotRule;
}

// ============================================================================
// Helpers
// ============================================================================

function getLoader() {
  return window[CONFIG.globalName];
}

function log(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${message}`, data);
  }
}

function warn(message: string, data: unknown = null): void {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} WARN: ${message}`, data);
  }
}

// ============================================================================
// Config Resolution
// ============================================================================

/**
 * Get merged rules config (common + property-specific)
 */
function getResolvedRules(): SlotRule[] {
  const property = getProperty();

  // Start with common rules
  const commonRules = config.common?.rules || [];

  // Get property-specific rules (if any)
  const propertyRules = config.properties?.[property]?.rules || [];

  // Property rules come first (higher priority), then common
  const merged = [...propertyRules, ...commonRules];

  log(`Resolved ${merged.length} rules for property "${property}"`);
  return merged;
}

// ============================================================================
// AdType Extraction
// ============================================================================

/**
 * Extract ad type from slot ID
 * Uses sizemapping's extractAdType which handles the slot prefix pattern
 *
 * @example
 * extractAdType('advert_mysite_ban') -> 'ban'
 * extractAdType('advert_mysite_bin_0') -> 'bin'
 * extractAdType('advert_mysite_dyn_article_1') -> 'dyn'
 */
export function extractAdType(slotId: string): string {
  return sizemapping.extractAdType(slotId);
}

// ============================================================================
// Context Building
// ============================================================================

/**
 * Build context from dimensions for targeting evaluation
 */
function buildContext(auctionContext: Partial<AuctionContext>): Record<string, string> {
  const context: Record<string, string> = {};

  // Get values from generated dimensions
  for (const [key, fn] of Object.entries(generatedDimensions)) {
    if (typeof fn === 'function') {
      const value = fn();
      if (value != null) {
        context[key] = String(value);
      }
    }
  }

  // Apply auction context overrides
  if (auctionContext.viewport) context.viewport = auctionContext.viewport;
  if (auctionContext.pagetype) context.pagetype = auctionContext.pagetype;
  if (auctionContext.dimensions) {
    for (const [key, value] of Object.entries(auctionContext.dimensions)) {
      if (value != null) {
        context[key] = String(value);
      }
    }
  }

  return context;
}

// ============================================================================
// Matching Logic
// ============================================================================

/**
 * Check if a slot ID matches a rule's match criteria
 */
function matchesSlot(slotId: string, match: SlotMatch): boolean {
  // Match by exact slot ID
  if (match.slotId) {
    return slotId === match.slotId;
  }

  // Match by slot pattern (wildcard)
  if (match.slotPattern) {
    const pattern = match.slotPattern.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(slotId);
  }

  // Match by ad type
  if (match.adType) {
    const adType = extractAdType(slotId);
    return adType === match.adType;
  }

  return false;
}

/**
 * Find the first matching rule for a slot + wrapper + context
 *
 * @param slotId - Slot ID to match
 * @param wrapperName - Wrapper name to check in rule's wrappers (e.g., 'prebid', 'amazonaps')
 * @param context - Auction context for targeting evaluation
 * @returns Matching rule or null
 */
export function findMatchingRule(
  slotId: string,
  wrapperName: string,
  context: Partial<AuctionContext> = {}
): SlotRule | null {
  const rules = getResolvedRules();
  const evalContext = buildContext(context);

  for (const rule of rules) {
    // 1. Check slot match
    if (!matchesSlot(slotId, rule.match)) {
      continue;
    }

    // 2. Check wrapper is in this rule
    if (!rule.wrappers || !(wrapperName in rule.wrappers)) {
      continue;
    }

    // Wrapper explicitly disabled
    if (rule.wrappers[wrapperName] === false) {
      continue;
    }

    // 3. Evaluate include/exclude targeting
    const result = evaluateTargeting(
      rule.include || {},
      rule.exclude || {},
      evalContext,
      generatedDimensionConfig as any
    );

    if (result.matched) {
      log(`Rule matched for "${slotId}" + "${wrapperName}"`, {
        match: rule.match,
        include: rule.include,
        exclude: rule.exclude,
        context: evalContext
      });
      return rule;
    }
  }

  log(`No rule matched for "${slotId}" + "${wrapperName}"`, { context: evalContext });
  return null;
}

// ============================================================================
// Size Resolution
// ============================================================================

/**
 * Get sizes from rule (always explicit)
 */
function resolveSizes(rule: SlotRule): Array<[number, number]> {
  return rule.sizes;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a slot has configuration for a specific wrapper
 */
export function hasSlotConfig(
  slotId: string,
  wrapperName: string,
  context: Partial<AuctionContext> = {}
): boolean {
  const rule = findMatchingRule(slotId, wrapperName, context);
  return rule !== null;
}

/**
 * Resolve slot configuration for a wrapper (generic)
 *
 * @param slotId - Slot ID
 * @param wrapperName - Wrapper name (e.g., 'prebid', 'amazonaps')
 * @param context - Auction context
 * @returns Resolved config or null if no matching rule
 */
export function resolveSlotConfig(
  slotId: string,
  wrapperName: string,
  context: Partial<AuctionContext> = {}
): ResolvedSlotConfig | null {
  const rule = findMatchingRule(slotId, wrapperName, context);
  if (!rule) {
    return null;
  }

  const sizes = resolveSizes(rule);
  const wrapperConfig = rule.wrappers[wrapperName];

  return {
    sizes,
    video: rule.video || false,
    wrapperConfig: wrapperConfig === true ? true : wrapperConfig as Record<string, unknown>,
    rule
  };
}

/**
 * Find ALL matching rules for a slot + wrapper + context
 * Used for additive bidder merging (e.g., Prebid where multiple rules can contribute bidders)
 *
 * @param slotId - Slot ID to match
 * @param wrapperName - Wrapper name to check in rule's wrappers
 * @param context - Auction context for targeting evaluation
 * @returns Array of matching rules
 */
export function findAllMatchingRules(
  slotId: string,
  wrapperName: string,
  context: Partial<AuctionContext> = {}
): SlotRule[] {
  const rules = getResolvedRules();
  const evalContext = buildContext(context);
  const matchedRules: SlotRule[] = [];

  for (const rule of rules) {
    // 1. Check slot match
    if (!matchesSlot(slotId, rule.match)) {
      continue;
    }

    // 2. Check wrapper is in this rule
    if (!rule.wrappers || !(wrapperName in rule.wrappers)) {
      continue;
    }

    // Wrapper explicitly disabled
    if (rule.wrappers[wrapperName] === false) {
      continue;
    }

    // 3. Evaluate include/exclude targeting
    const result = evaluateTargeting(
      rule.include || {},
      rule.exclude || {},
      evalContext,
      generatedDimensionConfig as any
    );

    if (result.matched) {
      log(`Rule matched for "${slotId}" + "${wrapperName}"`, {
        match: rule.match,
        include: rule.include,
        exclude: rule.exclude,
        context: evalContext
      });
      matchedRules.push(rule);
    }
  }

  if (matchedRules.length === 0) {
    log(`No rule matched for "${slotId}" + "${wrapperName}"`, { context: evalContext });
  }

  return matchedRules;
}

/**
 * Resolve slot configuration for Prebid specifically
 * Finds ALL matching rules and merges their bidders together
 * This allows separate rules for different bidders (e.g., Teads with geo conditions)
 *
 * @param slotId - Slot ID
 * @param context - Auction context
 * @returns Resolved config with merged bidders or null
 */
export function resolveSlotConfigForPrebid(
  slotId: string,
  context: Partial<AuctionContext> = {}
): ResolvedPrebidConfig | null {
  const matchedRules = findAllMatchingRules(slotId, 'prebid', context);
  if (matchedRules.length === 0) {
    return null;
  }

  // Use first rule for sizes/video (they should be consistent across rules for same slot)
  const primaryRule = matchedRules[0];
  const sizes = resolveSizes(primaryRule);

  // Merge bidders from all matching rules
  const mergedBidders: Record<string, true | Record<string, unknown>> = {};
  let hasVideo = false;

  for (const rule of matchedRules) {
    const prebidConfig = rule.wrappers.prebid;
    if (prebidConfig && typeof prebidConfig === 'object') {
      const bidders = (prebidConfig as PrebidWrapperConfig).bidders || {};
      for (const [bidderName, bidderConfig] of Object.entries(bidders)) {
        mergedBidders[bidderName] = bidderConfig;
      }
    }
    if (rule.video) {
      hasVideo = true;
    }
  }

  if (Object.keys(mergedBidders).length === 0) {
    return null;
  }

  log(`Merged ${Object.keys(mergedBidders).length} bidders from ${matchedRules.length} rules for "${slotId}"`, {
    bidders: Object.keys(mergedBidders)
  });

  return {
    sizes,
    video: hasVideo,
    wrapperConfig: { bidders: mergedBidders },
    bidders: mergedBidders,
    rule: primaryRule
  };
}

/**
 * Resolve slot configuration for Amazon APS
 *
 * @param slotId - Slot ID
 * @param context - Auction context
 * @returns Resolved config or null
 */
export function resolveSlotConfigForAmazonAps(
  slotId: string,
  context: Partial<AuctionContext> = {}
): ResolvedSlotConfig | null {
  return resolveSlotConfig(slotId, 'amazonaps', context);
}

/**
 * Get all ad types that have configuration for a wrapper
 *
 * @param wrapperName - Wrapper name
 * @returns Array of ad types that have rules for this wrapper
 */
export function getConfiguredAdTypes(wrapperName: string): string[] {
  const rules = getResolvedRules();
  const adTypes = new Set<string>();

  for (const rule of rules) {
    if (rule.wrappers && wrapperName in rule.wrappers && rule.wrappers[wrapperName] !== false) {
      if (rule.match.adType) {
        adTypes.add(rule.match.adType);
      }
    }
  }

  return Array.from(adTypes);
}

/**
 * Get raw config (for debugging)
 */
export function getConfig() {
  return config;
}

/**
 * Get resolved rules for current property (for debugging)
 */
export function getResolvedConfig() {
  return {
    rules: getResolvedRules(),
    property: getProperty()
  };
}

// ============================================================================
// Export
// ============================================================================

export default {
  extractAdType,
  findMatchingRule,
  findAllMatchingRules,
  hasSlotConfig,
  resolveSlotConfig,
  resolveSlotConfigForPrebid,
  resolveSlotConfigForAmazonAps,
  getConfiguredAdTypes,
  getConfig,
  getResolvedConfig
};
