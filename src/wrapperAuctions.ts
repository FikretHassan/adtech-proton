/**
 * Wrapper Auction Orchestrator
 *
 * Generic orchestrator for header bidding auctions.
 * Wrappers (Prebid, Amazon, etc.) register themselves via registerWrapper().
 * The orchestrator manages auctions without knowing wrapper-specific details.
 *
 * Per-slot state:
 * - [wrapperName]: 'off' | 'pending' | true | false
 * - startTime: timestamp when auction started
 * - timeout: timeout value used
 * - [wrapperName + 'AuctionEnd']: remaining ms when wrapper completed
 * - bidderTiming: { bidderName: { raw: ms, formatted: 'Xms' } }
 */

import rawConfig from '../config/wrappers.json';
import rawPartnersConfig from '../config/partners.json';
import sizemapping from './sizemapping';
import CONFIG from '../config/loader.js';
import { TIMEOUTS } from './constants';
import { safeExecuteAsync } from './errors';
import { evaluateTargeting } from './targeting';
import { dimensions as generatedDimensions, dimensionConfig as generatedDimensionConfig } from './generated/dimensions.js';
import type {
  WrapperAdapter,
  WrapperContext,
  AuctionContext,
  AuctionResult
} from './wrappers/types';

// Cast config to any for dynamic property access
const config = rawConfig as any;
const partnersConfig = rawPartnersConfig as any;

// Logging prefix
const LOG_PREFIX = '[WrapperAuctions]';

// ============================================================================
// Wrapper Registry
// ============================================================================

/** Registered wrapper adapters */
const wrapperRegistry = new Map<string, WrapperAdapter>();

/** Track which wrappers have been initialized */
const initializedWrappers = new Set<string>();

/** Track which partners are ready (readyEvent received) */
const readyPartners = new Set<string>();

// ============================================================================
// Adapter Validation
// ============================================================================

/** Required methods for WrapperAdapter interface */
const REQUIRED_ADAPTER_METHODS = [
  'isLibraryLoaded',
  'init',
  'hasSlotConfig',
  'getAdUnit',
  'requestBids',
  'applyTargeting'
] as const;

/**
 * Validate that an adapter implements the required WrapperAdapter interface
 * Returns array of missing/invalid properties, empty if valid
 */
function validateAdapter(adapter: unknown): string[] {
  const errors: string[] = [];

  if (!adapter || typeof adapter !== 'object') {
    return ['Adapter must be an object'];
  }

  const obj = adapter as Record<string, unknown>;

  // Check name property
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    errors.push('name: must be a non-empty string');
  }

  // Check required methods
  for (const method of REQUIRED_ADAPTER_METHODS) {
    if (typeof obj[method] !== 'function') {
      errors.push(`${method}: must be a function`);
    }
  }

  return errors;
}

// ============================================================================
// Partner Linking (convention: adapter.name === partner.name)
// ============================================================================

interface PartnerConfig {
  name: string;
  active: boolean;
}

/**
 * Find partner config by name
 * Searches blocking, independent, and nonCore arrays
 */
function findPartner(name: string): PartnerConfig | null {
  const allPartners = [
    ...(partnersConfig.blocking || []),
    ...(partnersConfig.independent || []),
    ...(partnersConfig.nonCore || [])
  ];
  return allPartners.find((p: PartnerConfig) => p.name === name) || null;
}

/**
 * Check if partner is active in config
 */
function isPartnerActive(name: string): boolean {
  const partner = findPartner(name);
  return partner?.active === true;
}

/**
 * Check if partner is ready (readyEvent received)
 */
function isPartnerReady(name: string): boolean {
  return readyPartners.has(name);
}

/**
 * Derive ready event from partner name
 * All partners use predictable format: plugin.{name}.complete
 */
function getReadyEvent(name: string): string {
  return `plugin.${name}.complete`;
}

/**
 * Subscribe to partner's readyEvent
 */
function subscribeToPartnerReady(name: string): void {
  const partner = findPartner(name);
  if (!partner) return;

  const pubsub = window[CONFIG.pubsubGlobal];
  if (!pubsub?.subscribe) return;

  const readyEvent = getReadyEvent(name);

  // Check if already published
  if (pubsub.publishedTopics?.includes(readyEvent)) {
    readyPartners.add(name);
    log(`Partner already ready: ${name}`);
    return;
  }

  // Subscribe to readyEvent
  pubsub.subscribe({
    topic: readyEvent,
    func: () => {
      readyPartners.add(name);
      log(`Partner ready: ${name}`);
    }
  });
}

/**
 * Register a wrapper adapter
 * Called by wrapper configs (prebid.js, amazon.js, etc.) to register themselves
 * Convention: adapter.name should match partner.name in partners.json
 */
export function registerWrapper(adapter: WrapperAdapter): void {
  // Validate adapter implements required interface
  const validationErrors = validateAdapter(adapter);
  if (validationErrors.length > 0) {
    warn(`Invalid adapter - missing required interface: ${validationErrors.join(', ')}`);
    warn(`Required interface: name (string), ${REQUIRED_ADAPTER_METHODS.join('(), ')}()`);
    return; // Don't register invalid adapters
  }

  if (wrapperRegistry.has(adapter.name)) {
    warn(`Wrapper "${adapter.name}" already registered, replacing`);
  }

  // Check for matching partner (convention-based linking)
  const partner = findPartner(adapter.name);
  if (!partner) {
    warn(
      `No partner found matching adapter name "${adapter.name}" in partners.json. ` +
      `For partner linking, add a partner with name: "${adapter.name}" to partners.json, ` +
      `or rename the adapter to match an existing partner name.`
    );
  } else if (!partner.active) {
    log(`Partner "${adapter.name}" is inactive - adapter will be skipped`);
  } else {
    // Subscribe to partner's readyEvent
    subscribeToPartnerReady(adapter.name);
  }

  wrapperRegistry.set(adapter.name, adapter);
  log(`Registered wrapper: ${adapter.name}`, { hasPartner: !!partner, partnerActive: partner?.active });

  // If orchestrator already initialized, init this wrapper too
  if (state.initialized) {
    initWrapper(adapter);
  }
}

/**
 * Get a registered wrapper by name
 */
export function getWrapper(name: string): WrapperAdapter | undefined {
  return wrapperRegistry.get(name);
}

/**
 * Get all registered wrapper names
 */
export function getRegisteredWrappers(): string[] {
  return Array.from(wrapperRegistry.keys());
}

// ============================================================================
// State
// ============================================================================

interface WrapperAuctionsState {
  initialized: boolean;
  dimensions: Record<string, string | null>;
  currentViewport: string | null;
  currentPagetype: string | null;
  currentSite: string | null;
  currentZone: string | null;
}

interface WrapperInitOptions {
  /** All dimensions (flexible - not just geo/viewport/pagetype) */
  dimensions?: Record<string, string | null>;
  /** Convenience: current viewport (also available in dimensions) */
  viewport?: string;
  /** Convenience: current pagetype (also available in dimensions) */
  pagetype?: string;
  /** Site context for ad unit path */
  site?: string;
  /** Zone context for ad unit path */
  zone?: string;
  /** Legacy: geo dimension */
  geo?: string;
}

interface AuctionOptions {
  adcount?: number;
  sizes?: Array<[number, number]>;
  pagetype?: string;
}

const state: WrapperAuctionsState = {
  initialized: false,
  dimensions: {},
  currentViewport: null,
  currentPagetype: null,
  currentSite: null,
  currentZone: null
};

// Per-slot auction state
const auctions: Record<string, Record<string, unknown>> = {};

// Archived auction data
const archive: Record<string, unknown[]> = {};

// Timeout handles
const timeouts: Record<string, ReturnType<typeof setTimeout>> = {};

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

function publish(topic: string, data: unknown = {}): void {
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic, data });
  }
}

function getTimestamp(): number {
  return Date.now();
}

// ============================================================================
// Wrapper Initialization
// ============================================================================

/**
 * Initialize a single wrapper adapter
 */
function initWrapper(adapter: WrapperAdapter): void {
  if (initializedWrappers.has(adapter.name)) return;

  const context: WrapperContext = {
    dimensions: state.dimensions,
    property: getLoader()?.environment?.getProperty?.() || 'default',
    viewport: state.currentViewport || sizemapping.getBreakpoint()
  };

  try {
    const result = adapter.init(context);
    if (result instanceof Promise) {
      result.catch(err => warn(`${adapter.name} init failed: ${err.message}`));
    }
    initializedWrappers.add(adapter.name);
    log(`Initialized wrapper: ${adapter.name}`);
  } catch (err: any) {
    warn(`${adapter.name} init exception: ${err.message}`);
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the wrapper auctions orchestrator
 */
export function init(options: WrapperInitOptions = {}) {
  if (state.initialized) return getState();

  if (!config.enabled) {
    log('Wrapper auctions disabled in config');
    return getState();
  }

  // Build dimensions object (support both new and legacy API)
  state.dimensions = options.dimensions || {};
  if (options.geo && !state.dimensions.geo) {
    state.dimensions.geo = options.geo;
  }
  if (options.viewport && !state.dimensions.viewport) {
    state.dimensions.viewport = options.viewport;
  }
  if (options.pagetype && !state.dimensions.pagetype) {
    state.dimensions.pagetype = options.pagetype;
  }

  state.currentViewport = options.viewport || sizemapping.getBreakpoint();
  state.currentPagetype = options.pagetype || null;
  state.initialized = true;

  // Initialize all registered wrappers
  for (const adapter of wrapperRegistry.values()) {
    initWrapper(adapter);
  }

  const wrapperNames = getRegisteredWrappers();
  log('Initialized', {
    dimensions: state.dimensions,
    viewport: state.currentViewport,
    pagetype: state.currentPagetype,
    wrappers: wrapperNames
  });

  publish('wrapper.ready', { wrappers: wrapperNames });

  return getState();
}

/**
 * Check if a slot has auction config for any registered wrapper
 */
export function hasSlotConfig(slotId: string, context: Partial<AuctionContext> = {}): boolean {
  const ctx = buildAuctionContext(slotId, context);

  for (const adapter of wrapperRegistry.values()) {
    if (!isWrapperEnabled(adapter.name)) continue;
    if (adapter.hasSlotConfig(slotId, ctx)) {
      return true;
    }
  }

  return false;
}

/**
 * Build context from current dimension values
 * Merges generated dimensions with runtime state overrides
 */
function buildContext(): Record<string, string> {
  const context: Record<string, string> = {};

  // Start with generated dimensions
  for (const [key, fn] of Object.entries(generatedDimensions)) {
    if (typeof fn === 'function') {
      context[key] = String(fn());
    }
  }

  // Apply all runtime dimension overrides (from updateContext)
  for (const [key, value] of Object.entries(state.dimensions)) {
    if (value != null) {
      context[key] = String(value);
    }
  }

  // Apply specific state overrides (highest priority)
  if (state.currentPagetype) context.pagetype = state.currentPagetype;
  if (state.currentSite) context.site = state.currentSite;
  if (state.currentZone) context.zone = state.currentZone;
  if (state.currentViewport) context.viewport = state.currentViewport;

  return context;
}

/**
 * Calculate auction timeout for current context
 * Uses timeoutRules with dimension evaluation for modifiers
 */
export function calculateTimeout(): number {
  let timeout = config.timeout || TIMEOUTS.AUCTION;

  const timeoutRules = config.timeoutRules;
  if (!timeoutRules || !Array.isArray(timeoutRules)) {
    return timeout;
  }

  const context = buildContext();

  // Apply all matching rules (additive)
  for (const rule of timeoutRules) {
    const result = evaluateTargeting(
      rule.include || {},
      rule.exclude || {},
      context,
      generatedDimensionConfig as any
    );

    if (result.matched && typeof rule.add === 'number') {
      timeout += rule.add;
    }
  }

  return timeout;
}

/**
 * Get or create auction state for a slot
 */
export function getSlotAuction(slotId: string): Record<string, unknown> {
  if (!auctions[slotId]) {
    const auctionState: Record<string, unknown> = {
      startTime: null,
      timeout: null,
      bidderTiming: {},
      bids: [] // Store raw bid data for hooks to access
    };

    // Add status field for each registered wrapper
    for (const name of wrapperRegistry.keys()) {
      auctionState[name] = 'off';
      auctionState[`${name}AuctionEnd`] = null;
    }

    auctions[slotId] = auctionState;
  }
  return auctions[slotId];
}

/**
 * Request auction from a specific wrapper
 */
export async function requestWrapperAuction(
  wrapperName: string,
  slotId: string,
  options: AuctionOptions = {}
): Promise<AuctionResult> {
  const adapter = wrapperRegistry.get(wrapperName);

  if (!adapter) {
    return { success: false, reason: `Wrapper "${wrapperName}" not registered`, bids: [] };
  }

  if (!isWrapperEnabled(wrapperName)) {
    return { success: false, reason: `${wrapperName} disabled`, bids: [] };
  }

  // Check partner is ready (has published readyEvent)
  if (!isPartnerReady(wrapperName)) {
    return { success: false, reason: `${wrapperName} partner not ready`, bids: [] };
  }

  if (!adapter.isLibraryLoaded()) {
    return { success: false, reason: `${wrapperName} library not loaded`, bids: [] };
  }

  const ctx = buildAuctionContext(slotId, options);

  if (!adapter.hasSlotConfig(slotId, ctx)) {
    return { success: false, reason: 'No slot config', bids: [] };
  }

  const auction = getSlotAuction(slotId);
  const timeout = calculateTimeout();
  const adcount = options.adcount || 1;
  const topicSuffix = adcount > 1 ? `.${adcount}` : '';

  // Set timing info
  const startTime = getTimestamp();
  if (!auction.startTime) {
    auction.startTime = startTime;
    auction.timeout = timeout;
  }

  auction[wrapperName] = 'pending';
  log(`${wrapperName} auction starting: ${slotId}`, { timeout, adcount });

  publish(`wrapper.${wrapperName}.auction.start.${slotId}${topicSuffix}`, { slotId, timeout, adcount });

  // Set fallback timeout
  const timeoutKey = `${wrapperName}_${slotId}`;
  const fallbackTimeout = setTimeout(() => {
    if (auction[wrapperName] === 'pending') {
      auction[wrapperName] = false;
      auction[`${wrapperName}AuctionEnd`] = 0;
      log(`${wrapperName} timeout: ${slotId}`);
      publish(`wrapper.${wrapperName}.timeout.${slotId}${topicSuffix}`, { slotId, adcount });
    }
  }, timeout + TIMEOUTS.AUCTION_BUFFER);
  timeouts[timeoutKey] = fallbackTimeout;

  try {
    const result = await adapter.requestBids(slotId, ctx, timeout);

    // Clear fallback timeout
    if (timeouts[timeoutKey]) {
      clearTimeout(timeouts[timeoutKey]);
      delete timeouts[timeoutKey];
    }

    const currentTime = getTimestamp();
    auction[`${wrapperName}AuctionEnd`] = ((auction.startTime as number) + (auction.timeout as number)) - currentTime;

    // Store bidder timing
    const bidderTiming = auction.bidderTiming as Record<string, unknown>;
    result.bids.forEach(bid => {
      if (bid.bidder && bid.responseTime) {
        bidderTiming[bid.bidder] = {
          raw: bid.responseTime,
          formatted: `${bid.responseTime}ms`
        };
      }
    });

    const hasBids = result.bids.some(b => b.hasBid);
    auction[wrapperName] = hasBids;

    // Store raw bids for hooks to access (includes adserverTargeting)
    if (hasBids) {
      const auctionBids = auction.bids as any[];
      result.bids.forEach(bid => {
        if (bid.hasBid && bid.raw) {
          auctionBids.push(bid.raw);
        }
      });
    }

    if (hasBids) {
      log(`${wrapperName} bids received: ${slotId}`, { count: result.bids.length });
      publish(`wrapper.${wrapperName}.bids.${slotId}${topicSuffix}`, { slotId, bids: result.bids, adcount });
    } else {
      log(`${wrapperName} no bids: ${slotId}`);
      publish(`wrapper.${wrapperName}.nobid.${slotId}${topicSuffix}`, { slotId, adcount });
    }

    return result;
  } catch (err: any) {
    // Clear fallback timeout on exception
    if (timeouts[timeoutKey]) {
      clearTimeout(timeouts[timeoutKey]);
      delete timeouts[timeoutKey];
    }
    warn(`${wrapperName} auction exception: ${err.message}`);
    auction[wrapperName] = false;
    return { success: false, reason: err.message, bids: [] };
  }
}

/**
 * Request auctions from all enabled wrappers (parallel)
 */
export async function requestAuction(slotId: string, options: AuctionOptions = {}) {
  if (!config.enabled) {
    return { success: false, reason: 'Wrappers disabled' };
  }

  const wrapperNames = getRegisteredWrappers();
  if (wrapperNames.length === 0) {
    return { success: true, reason: 'No wrappers registered' };
  }

  const promises: Promise<AuctionResult>[] = [];
  const defaultFailure: AuctionResult = { success: false, reason: 'Exception caught', bids: [] };

  for (const name of wrapperNames) {
    if (!isWrapperEnabled(name)) continue;

    promises.push(
      safeExecuteAsync(
        () => requestWrapperAuction(name, slotId, options),
        defaultFailure,
        (err) => warn(`${name} auction exception: ${err.message}`)
      )
    );
  }

  if (promises.length === 0) {
    return { success: true, reason: 'No wrappers enabled' };
  }

  const results = await Promise.all(promises);

  // Build result object with wrapper names as keys
  const resultObj: Record<string, unknown> = { success: true };
  const enabledWrappers = wrapperNames.filter(n => isWrapperEnabled(n));
  enabledWrappers.forEach((name, i) => {
    resultObj[name] = results[i];
  });

  return resultObj;
}

/**
 * Apply targeting from a specific wrapper
 */
export function applyWrapperBids(wrapperName: string, slotId: string): void {
  const adapter = wrapperRegistry.get(wrapperName);
  if (!adapter) return;

  const auction = getSlotAuction(slotId);
  if (auction[wrapperName] !== true) return;

  adapter.applyTargeting(slotId);
  log(`${wrapperName} targeting applied: ${slotId}`);
}

/**
 * Apply all bids to GPT slot
 */
export function applyBids(slotId: string): void {
  for (const name of wrapperRegistry.keys()) {
    applyWrapperBids(name, slotId);
  }
}

/**
 * Archive and clear auction state for a slot
 */
export function clearAuction(slotId: string): void {
  if (auctions[slotId]) {
    if (!archive[slotId]) {
      archive[slotId] = [];
    }
    archive[slotId].push({
      timestamp: getTimestamp(),
      data: { ...auctions[slotId] }
    });
    delete auctions[slotId];
  }

  // Clear any pending timeouts for this slot
  for (const name of wrapperRegistry.keys()) {
    const timeoutKey = `${name}_${slotId}`;
    if (timeouts[timeoutKey]) {
      clearTimeout(timeouts[timeoutKey]);
      delete timeouts[timeoutKey];
    }
  }

  // Notify adapters
  for (const adapter of wrapperRegistry.values()) {
    adapter.clearSlot?.(slotId);
  }

  log(`Cleared auction: ${slotId}`);
}

/**
 * Get archived auction data
 */
export function getArchive() {
  return { ...archive };
}

/**
 * Update context (dimensions, viewport, pagetype, site, zone)
 */
export function updateContext(context: WrapperInitOptions = {}): void {
  if (context.dimensions) {
    state.dimensions = { ...state.dimensions, ...context.dimensions };
  }
  if (context.geo) state.dimensions.geo = context.geo;
  if (context.viewport) {
    state.dimensions.viewport = context.viewport;
    state.currentViewport = context.viewport;
  }
  if (context.pagetype) {
    state.dimensions.pagetype = context.pagetype;
    state.currentPagetype = context.pagetype;
  }
  if (context.site) {
    state.dimensions.site = context.site;
    state.currentSite = context.site;
  }
  if (context.zone) {
    state.dimensions.zone = context.zone;
    state.currentZone = context.zone;
  }
}

/**
 * Check if any wrappers are enabled
 */
export function hasEnabledWrappers(): boolean {
  if (!config.enabled) return false;
  for (const name of wrapperRegistry.keys()) {
    if (isWrapperEnabled(name)) return true;
  }
  return false;
}

/**
 * Get all auction states
 */
export function getAllAuctions() {
  return { ...auctions };
}

/**
 * Get stored bids for a slot (raw Prebid bid objects with adserverTargeting)
 * @param {string} slotId - Slot ID
 * @returns {Array} Array of raw bid objects
 */
export function getSlotBids(slotId: string): any[] {
  const auction = auctions[slotId];
  if (!auction) return [];
  return (auction.bids as any[]) || [];
}

/**
 * Get module state
 */
export function getState() {
  const wrapperStates: Record<string, boolean> = {};
  for (const name of wrapperRegistry.keys()) {
    wrapperStates[`${name}Enabled`] = isWrapperEnabled(name);
  }

  return {
    initialized: state.initialized,
    enabled: config.enabled,
    ...wrapperStates,
    timeout: calculateTimeout(),
    dimensions: state.dimensions,
    viewport: state.currentViewport,
    wrappers: getRegisteredWrappers()
  };
}

/**
 * Get config
 */
export function getConfig() {
  return config;
}

/**
 * Reset module state
 */
export function reset(): void {
  Object.keys(auctions).forEach(k => delete auctions[k]);
  Object.keys(archive).forEach(k => delete archive[k]);
  Object.keys(timeouts).forEach(k => {
    clearTimeout(timeouts[k]);
    delete timeouts[k];
  });

  state.initialized = false;
  state.dimensions = {};
  state.currentViewport = null;
  state.currentPagetype = null;
  state.currentSite = null;
  state.currentZone = null;

  initializedWrappers.clear();
  readyPartners.clear();

  log('Reset complete');
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Check if a wrapper is enabled
 * Checks both wrappers.json config AND partner active status
 */
function isWrapperEnabled(name: string): boolean {
  // Check wrappers.json config
  const wrapperConfig = config.wrappers?.[name] || config[name];
  if (wrapperConfig?.enabled === false) {
    return false;
  }

  // Check partner is active (convention-based linking)
  if (!isPartnerActive(name)) {
    return false;
  }

  return true;
}

/**
 * Build auction context from options
 */
function buildAuctionContext(slotId: string, options: Partial<AuctionContext>): AuctionContext {
  return {
    slotId,
    dimensions: state.dimensions,
    viewport: state.currentViewport || sizemapping.getBreakpoint(),
    pagetype: options.pagetype || state.currentPagetype || 'default',
    site: state.currentSite || 'default',
    zone: state.currentZone || 'ros',
    adCount: (options as any).adcount || 1,
    sizes: (options as any).sizes
  };
}

// ============================================================================
// Export
// ============================================================================

export default {
  // Registry
  registerWrapper,
  getWrapper,
  getRegisteredWrappers,

  // Core API
  init,
  hasSlotConfig,
  calculateTimeout,
  getSlotAuction,
  requestWrapperAuction,
  requestAuction,
  applyWrapperBids,
  applyBids,
  clearAuction,
  getArchive,
  updateContext,
  hasEnabledWrappers,
  getAllAuctions,
  getSlotBids,
  getState,
  getConfig,
  reset
};
