/**
 * Dynamic Injection Module
 * Injects ads into article content based on character counting rules
 * Supports multiple injection modes (dynamic_mpus, liveblogs, etc.)
 *
 * PubSub lifecycle events:
 * - injection.{modeId}.load     - Mode matched and injection executed
 * - injection.{modeId}.ignore   - Mode skipped (targeting didn't match)
 * - injection.{modeId}.inactive - Mode disabled (active: false)
 * - injection.{modeId}.complete - Mode processing finished (always fires)
 */

import injectionConfig from '../config/injection/index.js';
import sizemapping from './sizemapping';
import slots from './slots';
import environment from './environment';
import CONFIG from '../config/loader.js';
import { evaluateTargeting, matchesProperty } from './targeting';
import { getProperty } from './property';
import { applyStyles, getLabelConfig, createLabelElement } from './utils/domStyles';

// Build-time feature flags - set via esbuild --define
declare const FEATURE_INJECTION_CHAR_MODE: boolean;
declare const FEATURE_INJECTION_BLOCK_MODE: boolean;

// URL param override keys for dynamic injection
const URL_OVERRIDE_KEYS = ['firstAd', 'otherAd', 'minParaChars', 'maxAds', 'firstAdBlock', 'otherAdBlock', 'minBlockChars', 'countMode'];

// Debug logging prefix
const LOG_PREFIX = '[DynamicInjection]';

// Content element config interface
interface ContentElementConfig {
  charValue: number;
  canInjectAfter: boolean;
  canInjectBefore: boolean;
  canInjectBetweenSame?: boolean;  // Override: allow injection between adjacent same-type elements
}

/**
 * Get content element config for an element
 * Checks if element matches any selector in contentElements
 * @param {Element} element - Element to check
 * @returns {ContentElementConfig | null} Config if matched, null if not in contentElements
 */
function getContentElementConfig(element: Element | null): ContentElementConfig | null {
  if (!element) return null;

  const { contentElements } = injectionConfig;
  if (!contentElements) return null;

  for (const [selector, config] of Object.entries(contentElements)) {
    try {
      if (element.matches(selector)) {
        return config as ContentElementConfig;
      }
    } catch {
      // Invalid selector, skip
    }
  }

  return null;
}

/**
 * Get the matched selector and config for an element
 * Returns both the selector string and config for comparison
 * @param {Element} element - Element to check
 * @returns {{ selector: string, config: ContentElementConfig } | null}
 */
function getMatchedContentElement(element: Element | null): { selector: string; config: ContentElementConfig } | null {
  if (!element) return null;

  const { contentElements } = injectionConfig;
  if (!contentElements) return null;

  for (const [selector, config] of Object.entries(contentElements)) {
    try {
      if (element.matches(selector)) {
        return { selector, config: config as ContentElementConfig };
      }
    } catch {
      // Invalid selector, skip
    }
  }

  return null;
}

/**
 * Check if injection is allowed at a position based on contentElements config
 * Checks both the current element and its neighbor in the insertion direction
 * Also handles canInjectBetweenSame override for adjacent same-type elements
 * @param {Element} element - The reference element (where we're considering injection)
 * @param {string} position - 'before' or 'after' (where ad would be placed)
 * @returns {{ allowed: boolean, reason: string }}
 */
function canInjectAtPosition(element: Element, position: 'before' | 'after'): { allowed: boolean; reason: string } {
  const { contentElements } = injectionConfig;

  // If no contentElements config, allow all injections
  if (!contentElements || Object.keys(contentElements).length === 0) {
    return { allowed: true, reason: 'No contentElements config' };
  }

  if (position === 'after') {
    // Injecting AFTER element: check element's canInjectAfter AND nextSibling's canInjectBefore
    const elementMatch = getMatchedContentElement(element);
    const nextSibling = element.nextElementSibling;
    const nextMatch = nextSibling ? getMatchedContentElement(nextSibling) : null;

    // Check canInjectBetweenSame override: if both match same selector with canInjectBetweenSame=true
    if (elementMatch && nextMatch &&
        elementMatch.selector === nextMatch.selector &&
        elementMatch.config.canInjectBetweenSame) {
      log(`  Allowed: canInjectBetweenSame=true for adjacent "${elementMatch.selector}" elements`);
      return { allowed: true, reason: `canInjectBetweenSame override for ${elementMatch.selector}` };
    }

    // Normal checks
    if (elementMatch && !elementMatch.config.canInjectAfter) {
      log(`  Blocked: element matches contentElements with canInjectAfter=false`);
      return { allowed: false, reason: `Cannot inject after element (canInjectAfter=false)` };
    }

    if (nextMatch && !nextMatch.config.canInjectBefore) {
      log(`  Blocked: nextSibling matches "${nextMatch.selector}" with canInjectBefore=false`);
      return { allowed: false, reason: `Cannot inject before ${nextMatch.selector} (canInjectBefore=false)` };
    }
  } else {
    // Injecting BEFORE element: check prevSibling's canInjectAfter AND element's canInjectBefore
    const elementMatch = getMatchedContentElement(element);
    const prevSibling = element.previousElementSibling;
    const prevMatch = prevSibling ? getMatchedContentElement(prevSibling) : null;

    // Check canInjectBetweenSame override: if both match same selector with canInjectBetweenSame=true
    if (elementMatch && prevMatch &&
        elementMatch.selector === prevMatch.selector &&
        elementMatch.config.canInjectBetweenSame) {
      log(`  Allowed: canInjectBetweenSame=true for adjacent "${elementMatch.selector}" elements`);
      return { allowed: true, reason: `canInjectBetweenSame override for ${elementMatch.selector}` };
    }

    // Normal checks
    if (elementMatch && !elementMatch.config.canInjectBefore) {
      log(`  Blocked: element matches contentElements with canInjectBefore=false`);
      return { allowed: false, reason: `Cannot inject before element (canInjectBefore=false)` };
    }

    if (prevMatch && !prevMatch.config.canInjectAfter) {
      log(`  Blocked: prevSibling matches "${prevMatch.selector}" with canInjectAfter=false`);
      return { allowed: false, reason: `Cannot inject after ${prevMatch.selector} (canInjectAfter=false)` };
    }
  }

  return { allowed: true, reason: 'No blocking contentElements rules' };
}

/**
 * Calculate additional char value from content elements between paragraphs
 * Walks siblings from prevPara to currentPara and sums charValues from contentElements
 * @param {Element} prevPara - Previous paragraph element (or null for first para)
 * @param {Element} currentPara - Current paragraph element
 * @returns {{ charValue: number, elements: string[] }}
 */
function getInterParagraphCharValue(prevPara: Element | null, currentPara: Element): { charValue: number; elements: string[] } {
  const { contentElements } = injectionConfig;

  if (!contentElements || !prevPara) {
    return { charValue: 0, elements: [] };
  }

  let charValue = 0;
  const elements: string[] = [];

  // Walk from prevPara's next sibling to currentPara
  let sibling = prevPara.nextElementSibling;
  while (sibling && sibling !== currentPara) {
    const config = getContentElementConfig(sibling);
    if (config && config.charValue > 0) {
      charValue += config.charValue;
      const matchedSelector = Object.entries(contentElements).find(([sel]) => {
        try { return sibling!.matches(sel); } catch { return false; }
      })?.[0] || sibling.tagName.toLowerCase();
      elements.push(`${matchedSelector}(+${config.charValue})`);
    }
    sibling = sibling.nextElementSibling;
  }

  return { charValue, elements };
}

// State interface - stores dynamic context, not hardcoded dimensions
interface DynamicInjectionState {
  initialized: boolean;
  context: Record<string, any>;
  dimensionConfig: Record<string, any>;
  activeMode: any;
  matchedRule: any;  // Full matched rule object (includes wrapperClass, wrapperStyle, etc.)
  dynCount: number;
  adsInjected: number;
  charCount: number;
  blockCount: number;
  hasFirstAd: boolean;
  injectedSlots: string[];
  waitingForEvent: boolean;  // True when waitForEvent is configured but hasn't fired yet
  injectionStarted: boolean;  // Guard: true once injection has started (prevents duplicate runs)
}

// Module state
let state: DynamicInjectionState = {
  initialized: false,
  context: {},
  dimensionConfig: {},
  activeMode: null,
  matchedRule: null,
  dynCount: 0,
  adsInjected: 0,
  charCount: 0,
  blockCount: 0,
  hasFirstAd: false,
  injectedSlots: [],
  waitingForEvent: false,
  injectionStarted: false
};

// Track waitForEvent subscription token for cleanup
let waitForEventToken: string | null = null;

/**
 * Build slot ID using property prefix and adType
 * Pattern: advert_{propertyPrefix}_{adType}_{index}
 * @param {number} index - Ad index
 * @returns {string} Slot ID
 */
function buildSlotId(index: number): string {
  const slotsConfig = slots.getConfig();
  const prefix = slotsConfig.prefix || 'site';
  const adType = injectionConfig.adType || 'dyn';
  return `advert_${prefix}_${adType}_${index}`;
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

/**
 * Publish event via PubSub if available
 */
function publish(topic: string, data: unknown): void {
  const pubsub = window[CONFIG.pubsubGlobal];
  if (pubsub?.publish) {
    pubsub.publish({ topic, data });
    log(`Published: ${topic}`, data);
  }
}

/**
 * Handle slot.afterRender hook - applies render styles for injected slots
 * Called by hooks system when any slot renders; filters to only handle our slots
 * Styles are read from mode.onRender config (wrapperStyle, labelStyle, labelText, adStyle)
 *
 * Uses requestAnimationFrame to ensure CSS transitions work properly.
 * The browser needs to paint the initial state (opacity: 0 from CSS) before
 * we set the final state (opacity: 1). Without this delay, the browser
 * optimizes away the transition.
 *
 * @param {string} slotId - The slot element ID
 */
function handleSlotRendered(slotId: string): void {
  // Only handle slots we created
  if (!state.injectedSlots.includes(slotId)) return;

  log(`handleSlotRendered: ${slotId}`);

  // Get onRender config from mode (defaults to empty if not defined)
  const onRender = state.activeMode?.onRender || {};
  if (Object.keys(onRender).length === 0) {
    log('No onRender config defined for mode, skipping render styles');
    return;
  }

  const containerId = `${slotId}_container`;
  const titleId = `${slotId}_title`;
  const container = document.getElementById(containerId);
  const title = document.getElementById(titleId);
  const adSlot = document.getElementById(slotId);

  // Use requestAnimationFrame to ensure browser has painted initial state
  // This allows CSS transitions to animate from opacity:0 to opacity:1
  requestAnimationFrame(() => {
    // Apply wrapper styles from config
    if (container && onRender.wrapperStyle) {
      applyStyles(container, onRender.wrapperStyle);
      log(`Applied onRender.wrapperStyle to container: ${containerId}`);
    }

    // Apply label styles and text from config
    if (title && (onRender.labelStyle || onRender.labelText)) {
      if (onRender.labelStyle) {
        applyStyles(title, onRender.labelStyle);
      }
      if (onRender.labelText) {
        title.innerText = onRender.labelText;
      }
      log(`Applied onRender label config to: ${titleId}`);
    }

    // Apply ad div styles from config
    if (adSlot && onRender.adStyle) {
      applyStyles(adSlot, onRender.adStyle);
      log(`Applied onRender.adStyle to: ${slotId}`);
    }
  });
}

/**
 * Check if context matches a match object using proper dimension evaluation
 * Uses evaluateTargeting for consistent dimension matching across the codebase
 * @param {Object} matchObj - Match criteria { dimension: [values] } (treated as include)
 * @param {Object} context - Current context values
 * @returns {{ matched: boolean, reason: string }}
 */
function evaluateMatch(matchObj: Record<string, any>, context: Record<string, any>) {
  if (!matchObj || Object.keys(matchObj).length === 0) {
    return { matched: true, reason: 'No match criteria (matches all)' };
  }

  // Use evaluateTargeting with match as include rules
  // Use state.dimensionConfig for dynamic dimension configuration
  return evaluateTargeting(
    matchObj,
    {},
    context,
    state.dimensionConfig as any
  );
}

/**
 * Find the matching injection mode based on context dimensions
 * Uses mode-level match to determine if mode applies, then rules for config
 * Detects overlapping modes and warns in debug mode
 * @param {Object} context - Current page context { pagetype, section, geo, viewport, userState, renderertype, ... }
 * @returns {Object|null} Matching mode config or null
 */
export function findMatchingMode(context = {}) {
  log('findMatchingMode called:', { context });

  const { modes } = injectionConfig;
  const eventPrefix = injectionConfig.eventPrefix || 'injection';

  if (!modes) {
    warn('No modes configured in injection config');
    return null;
  }

  log('Available modes:', Object.keys(modes));

  // Track matched mode and overlaps for debug warning
  let matchedMode: { id: string; config: any } | null = null;
  const overlappingModes: string[] = [];

  // Check all modes to detect overlaps
  for (const [modeId, modeConfig] of Object.entries(modes)) {
    log(`Checking mode "${modeId}":`, {
      active: modeConfig.active,
      match: modeConfig.match
    });

    // Check if mode is inactive
    if (!modeConfig.active) {
      log(`  -> Skipped: mode inactive`);
      publish(`${eventPrefix}.${modeId}.inactive`, { modeId });
      publish(`${eventPrefix}.${modeId}.complete`, { modeId, status: 'inactive' });
      continue;
    }

    // Check property targeting
    if (!matchesProperty(modeConfig.properties, getProperty())) {
      log(`  -> Skipped: property mismatch`);
      publish(`${eventPrefix}.${modeId}.ignore`, { modeId, reason: 'Property mismatch' });
      publish(`${eventPrefix}.${modeId}.complete`, { modeId, status: 'ignore' });
      continue;
    }

    // Evaluate mode-level match (all dimensions in match must be satisfied)
    const matchResult = evaluateMatch(modeConfig.match, context);

    log(`  -> Match result:`, matchResult);

    if (!matchResult.matched) {
      log(`  -> Skipped: ${matchResult.reason}`);
      publish(`${eventPrefix}.${modeId}.ignore`, { modeId, reason: matchResult.reason });
      publish(`${eventPrefix}.${modeId}.complete`, { modeId, status: 'ignore' });
      continue;
    }

    // Mode matched!
    if (matchedMode === null) {
      log(`MATCHED mode: "${modeId}"`);
      publish(`${eventPrefix}.${modeId}.load`, { modeId });
      matchedMode = { id: modeId, config: modeConfig };
    } else {
      // Additional match - track for overlap warning
      overlappingModes.push(modeId);
      log(`  -> Would also match mode "${modeId}" (overlap)`);
      publish(`${eventPrefix}.${modeId}.ignore`, { modeId, reason: 'Mode overlap - using earlier match' });
      publish(`${eventPrefix}.${modeId}.complete`, { modeId, status: 'ignore' });
    }
  }

  // Warn about overlapping modes in debug mode
  if (overlappingModes.length > 0 && matchedMode) {
    warn(`Multiple modes match current context. Using "${matchedMode.id}", but [${overlappingModes.join(', ')}] would also match. Consider tightening match criteria.`);
  }

  if (matchedMode) {
    return { id: matchedMode.id, ...matchedMode.config };
  }

  log(`No matching mode for context`, context);
  return null;
}

/**
 * Initialize the dynamic injection module
 * Accepts context and dimensionConfig from loader.getContext() and loader.dimensionConfig
 * This allows dimension names to be configured in dimensions.json rather than hardcoded
 *
 * If the active mode has `waitForEvent`, subscribes to that PubSub topic and
 * automatically calls injectAds() when the event fires (with runIfAlreadyPublished: true).
 *
 * @param {Object} context - Page context from loader.getContext() (all dimensions resolved)
 * @param {Object} dimensionConfig - Dimension match type config from loader.dimensionConfig
 */
export function init(context: Record<string, any> = {}, dimensionConfig: Record<string, any> = {}) {
  log('init() called with context:', context);

  // Store context and dimensionConfig for use in targeting evaluation
  state.context = context;
  state.dimensionConfig = dimensionConfig;

  state.activeMode = findMatchingMode(context);
  state.dynCount = 0;
  state.adsInjected = 0;
  state.charCount = 0;
  state.blockCount = 0;
  state.hasFirstAd = false;
  state.injectedSlots = [];
  state.waitingForEvent = false;
  state.injectionStarted = false;
  state.initialized = true;

  log('Initialized with context:', {
    context: state.context,
    activeMode: state.activeMode?.id || 'none'
  });

  if (!state.activeMode) {
    log('No active mode matched - skipping injection');
  }

  // Check for waitForEvent - subscribe and auto-inject when event fires
  const pubsub = window[CONFIG.pubsubGlobal];
  if (state.activeMode?.waitForEvent && pubsub?.subscribe) {
    const eventTopic = state.activeMode.waitForEvent;
    log(`Mode has waitForEvent: "${eventTopic}" - subscribing`);

    // Clean up any previous subscription
    if (waitForEventToken && pubsub.unsubscribe) {
      pubsub.unsubscribe(waitForEventToken);
      waitForEventToken = null;
    }

    // Set flag to block external injectAds() calls until event fires
    state.waitingForEvent = true;

    // Subscribe to the event - runIfAlreadyPublished ensures we don't miss it
    waitForEventToken = pubsub.subscribe({
      topic: eventTopic,
      func: () => {
        // Guard: prevent duplicate execution (runIfAlreadyPublished can cause multiple fires)
        if (state.injectionStarted) {
          log(`waitForEvent "${eventTopic}" fired but injection already started - skipping duplicate`);
          return;
        }

        log(`waitForEvent "${eventTopic}" fired - running injection`);
        state.waitingForEvent = false;  // Clear flag before injection
        state.injectionStarted = true;  // Mark injection as started (prevents duplicates)

        // Unsubscribe immediately to prevent future duplicate fires
        if (waitForEventToken && pubsub.unsubscribe) {
          pubsub.unsubscribe(waitForEventToken);
          log(`Unsubscribed from "${eventTopic}" after first fire`);
          waitForEventToken = null;
        }

        const result = injectAds();

        // Late injection: Check if loader.ads.ready already fired
        // If so, the event fired AFTER the initial ad request, so we need to
        // manually process the newly injected slots
        if (result.injected > 0) {
          const eventLog = pubsub?.publishedTopics || [];
          const adsReadyIndex = eventLog.indexOf('loader.ads.ready');

          if (adsReadyIndex !== -1) {
            log(`loader.ads.ready already fired (index ${adsReadyIndex}), processing dyn slots`);
            // Defer to next frame to ensure DOM is stable after injection
            requestAnimationFrame(() => {
              // Use processInjectedSlots to only process our dyn slots
              const slotsConfig = slots.getConfig();
              const site = slotsConfig.site || '';
              const zone = state.context?.section || '';
              processInjectedSlots({ site, zone });
            });
          } else {
            log('loader.ads.ready not yet fired, new slots will be processed by initial requestAds()');
          }
        }
      },
      runIfAlreadyPublished: true
    });

    log(`Subscribed to "${eventTopic}" with token: ${waitForEventToken}`);
  }

  // Register slot.afterRender hook to apply render styles
  const loader = getLoader();
  if (loader?.hooks?.register) {
    loader.hooks.register('slot.afterRender', {
      name: 'dynamicInjection.renderStyles',
      fn: handleSlotRendered
    });
    log('Registered slot.afterRender hook');
  }

  // Emit ready event
  if (pubsub?.publish) {
    pubsub.publish({ topic: 'loader.dynamicInjection.ready', data: getState() });
    log('Published loader.dynamicInjection.ready');
  }

  return getState();
}

/**
 * Apply URL param overrides to a rule
 * @param {Object} rule - Base rule object
 * @returns {Object} Rule with URL overrides applied
 */
function applyUrlOverrides(rule: any) {
  const overrides: Record<string, any> = {};
  let hasOverrides = false;

  URL_OVERRIDE_KEYS.forEach(key => {
    const raw = environment.getUrlParamValue(key);
    if (raw !== null) {
      const parsed = environment.parseUrlParamValue(raw);
      if (parsed !== null) {
        overrides[key] = parsed;
        hasOverrides = true;
      }
    }
  });

  if (hasOverrides) {
    log('URL param overrides applied:', overrides);
    return { ...rule, ...overrides };
  }

  return rule;
}

/**
 * Check if a rule matches (include passes AND exclude doesn't block)
 * @param {Object} ruleEntry - Rule with match and optional exclude
 * @param {Object} context - Current context
 * @returns {{ matched: boolean, reason: string }}
 */
function evaluateRuleMatch(ruleEntry: any, context: Record<string, any>) {
  // Check include (match) conditions
  const includeResult = evaluateTargeting(
    ruleEntry.match || {},
    {},
    context,
    state.dimensionConfig as any
  );

  if (!includeResult.matched) {
    return includeResult;
  }

  // Check exclude conditions if present
  if (ruleEntry.exclude && Object.keys(ruleEntry.exclude).length > 0) {
    const excludeResult = evaluateTargeting(
      {},
      ruleEntry.exclude,
      context,
      state.dimensionConfig as any
    );

    if (!excludeResult.matched) {
      return { matched: false, reason: `Excluded: ${excludeResult.reason}` };
    }
  }

  return { matched: true, reason: 'Rule matched' };
}

/**
 * Get the injection rule for current context
 * Uses flat rules array with match/exclude objects for flexible dimension-based matching
 * Stores full matched rule in state for wrapperClass/wrapperStyle support
 * @returns {Object} Rule with firstAd, otherAd, maxAds, etc.
 */
export function getRule() {
  const { context, activeMode } = state;
  const { defaults } = injectionConfig;

  log('getRule() called:', { context, activeMode: activeMode?.id });

  let rule: any;
  state.matchedRule = null;  // Reset matched rule

  // If no active mode, return defaults
  if (!activeMode) {
    warn('No active mode, using defaults');
    rule = defaults;
  } else {
    const rules = activeMode.rules;

    if (!rules || !Array.isArray(rules)) {
      warn('No rules array in active mode, using defaults');
      rule = defaults;
    } else {
      log(`Checking ${rules.length} rules in mode "${activeMode.id}"`);

      // Find first matching rule and track overlaps for debug warning
      let matchedRuleEntry: any = null;
      let matchedRuleIndex: number = -1;
      const overlappingRules: number[] = [];

      for (let i = 0; i < rules.length; i++) {
        const ruleEntry = rules[i];
        log(`  Rule ${i}:`, { match: ruleEntry.match, exclude: ruleEntry.exclude });

        const matchResult = evaluateRuleMatch(ruleEntry, context);

        if (matchResult.matched) {
          if (matchedRuleEntry === null) {
            // First match - this is the rule we'll use
            log(`  -> MATCHED rule ${i}`);
            matchedRuleEntry = ruleEntry;
            matchedRuleIndex = i;
          } else {
            // Additional match - track for overlap warning
            overlappingRules.push(i);
            log(`  -> Would also match rule ${i} (overlap)`);
          }
        } else {
          log(`  -> No match: ${matchResult.reason}`);
        }
      }

      // Warn about overlapping rules in debug mode
      if (overlappingRules.length > 0) {
        warn(`Multiple rules match in mode "${activeMode.id}". Using rule ${matchedRuleIndex}, but rules [${overlappingRules.join(', ')}] would also match. Consider adding exclude conditions.`);
      }

      if (matchedRuleEntry) {
        state.matchedRule = matchedRuleEntry;  // Store full rule for wrapperClass/wrapperStyle
        rule = { ...defaults, ...(matchedRuleEntry.config as object) };
        log('Rule found:', { ruleIndex: matchedRuleIndex, config: rule, wrapperClass: matchedRuleEntry.wrapperClass, wrapperStyle: matchedRuleEntry.wrapperStyle });
      } else {
        warn(`No matching rule found in mode ${activeMode.id}, using defaults`);
        rule = defaults;
      }
    }
  }

  // Apply URL param overrides (e.g., ?firstAd=3&maxAds=5)
  return applyUrlOverrides(rule);
}

/**
 * Find content containers in the DOM
 * @returns {NodeList|Array} Content container elements
 */
export function findContentContainers() {
  log('findContentContainers() called');

  const { activeMode } = state;

  if (!activeMode) {
    log('No active mode, skipping container search');
    return [];
  }

  const contentSelectors = activeMode.contentSelectors || [];
  log('Searching with selectors:', contentSelectors);

  for (const selector of contentSelectors) {
    log(`  Trying selector: "${selector}"`);
    try {
      const nodes = document.querySelectorAll(selector);
      log(`    -> Found ${nodes.length} elements`);
      if (nodes.length > 0) {
        log(`MATCHED container with selector: "${selector}"`, nodes[0]);
        return nodes;
      }
    } catch (e) {
      warn(`    -> Invalid selector: "${selector}"`, e instanceof Error ? e.message : String(e));
    }
  }

  warn('No content containers found with any selector');
  return [];
}

/**
 * Get all paragraphs from content containers
 * @param {NodeList|Array} containers - Content containers
 * @returns {Array} Array of paragraph elements with char counts
 */
export function getParagraphs(containers: NodeListOf<Element> | Element[]) {
  log(`getParagraphs() called with ${containers.length} containers`);

  const { paragraphSelector, defaults } = injectionConfig;
  const minParaChars = defaults.minParaChars || 150;
  const paragraphs: Array<{ element: Element; charCount: number; container: Element }> = [];

  log(`Using paragraph selector: "${paragraphSelector}", minParaChars: ${minParaChars}`);

  let totalParas = 0;
  let skippedParas = 0;

  containers.forEach((container, containerIndex) => {
    const paras = container.querySelectorAll(paragraphSelector);
    log(`Container ${containerIndex}: found ${paras.length} paragraph elements`);

    paras.forEach((p, paraIndex) => {
      totalParas++;
      const text = (p as HTMLElement).innerText || p.textContent || '';
      const charCount = text.length;

      // Only include paragraphs that meet minimum char requirement
      if (charCount >= minParaChars) {
        paragraphs.push({
          element: p,
          charCount,
          container
        });
        log(`  Para ${paraIndex}: ${charCount} chars (included)`);
      } else {
        skippedParas++;
        log(`  Para ${paraIndex}: ${charCount} chars (skipped, < ${minParaChars})`);
      }
    });
  });

  log(`Paragraph summary: ${totalParas} total, ${paragraphs.length} valid, ${skippedParas} skipped`);
  return paragraphs;
}

/**
 * Get all blocks from content containers (for block-based counting mode)
 * @param {NodeList|Array} containers - Content containers
 * @param {string} blockSelector - CSS selector for blocks
 * @param {number} minBlockChars - Minimum chars for block to count (0 = no minimum)
 * @returns {Array} Array of block elements with char counts
 */
export function getBlocks(
  containers: NodeListOf<Element> | Element[],
  blockSelector: string,
  minBlockChars: number = 0
) {
  log(`getBlocks() called with ${containers.length} containers, selector: "${blockSelector}"`);

  const blocks: Array<{ element: Element; charCount: number; container: Element }> = [];
  let totalBlocks = 0;
  let skippedBlocks = 0;

  containers.forEach((container, containerIndex) => {
    const blockElements = container.querySelectorAll(blockSelector);
    log(`Container ${containerIndex}: found ${blockElements.length} block elements`);

    blockElements.forEach((block, blockIndex) => {
      totalBlocks++;
      const text = (block as HTMLElement).innerText || block.textContent || '';
      const charCount = text.length;

      // If minBlockChars is set, only include blocks that meet threshold
      if (minBlockChars === 0 || charCount >= minBlockChars) {
        blocks.push({
          element: block,
          charCount,
          container
        });
        log(`  Block ${blockIndex}: ${charCount} chars (included)`);
      } else {
        skippedBlocks++;
        log(`  Block ${blockIndex}: ${charCount} chars (skipped, < ${minBlockChars})`);
      }
    });
  });

  log(`Block summary: ${totalBlocks} total, ${blocks.length} valid, ${skippedBlocks} skipped`);
  return blocks;
}

/**
 * Create an ad container element
 * Supports mode-level defaults and per-rule overrides for styling
 * Style hierarchy: globals < mode defaults < rule overrides
 * Structure: container > title > ad div
 * @param {number} index - Ad index
 * @returns {HTMLElement} The ad container div
 */
export function createAdContainer(index: number) {
  const { containerClass, adClass, dataAttributes, defaultLabel } = injectionConfig;
  const { matchedRule, activeMode } = state;
  const slotId = buildSlotId(index);
  const containerId = `${slotId}_container`;

  // Create outer container
  const container = document.createElement('div');
  container.className = containerClass;
  container.id = containerId;

  // Container data attributes
  container.setAttribute('data-js', 'dynamicMpu-ad');
  container.setAttribute('data-adtype', `dyn_${index}`);
  container.setAttribute('data-ad-slot-hidden', 'false');
  container.setAttribute('data-ad-slot-id', containerId);
  container.setAttribute('data-perf', `commercial-perf-${index}`);

  // Add injection mode as data attribute for CSS targeting (CLS placeholder styling)
  if (activeMode?.id) {
    container.setAttribute('data-injection-mode', activeMode.id);
  }

  // Apply rule-specific wrapperClass (additive to default containerClass)
  if (matchedRule?.wrapperClass) {
    container.className += ` ${matchedRule.wrapperClass}`;
    log(`Applied wrapperClass: ${matchedRule.wrapperClass}`);
  }

  // Apply wrapperStyle: mode default + rule override
  if (activeMode?.defaultWrapperStyle) {
    applyStyles(container, activeMode.defaultWrapperStyle);
  }
  if (matchedRule?.wrapperStyle) {
    applyStyles(container, matchedRule.wrapperStyle);
    log(`Applied wrapperStyle:`, matchedRule.wrapperStyle);
  }

  // Create label/title if configured (before ad div)
  const labelConfig = getLabelConfig(matchedRule, defaultLabel);
  if (labelConfig) {
    // Add ID to label config ({slotId}_title pattern)
    const labelWithId = { ...labelConfig, id: `${slotId}_title` };

    // Apply mode-level defaultLabelStyle, then rule-level labelStyle override
    if (activeMode?.defaultLabelStyle) {
      labelWithId.style = { ...(labelWithId.style as Record<string, string> || {}), ...activeMode.defaultLabelStyle };
    }
    if (matchedRule?.labelStyle) {
      labelWithId.style = { ...(labelWithId.style as Record<string, string> || {}), ...matchedRule.labelStyle };
    }

    // Set label text from onRender config if available (ensures text is there when label becomes visible)
    if (activeMode?.onRender?.labelText && !labelWithId.text) {
      labelWithId.text = activeMode.onRender.labelText;
    }

    const labelElement = createLabelElement(labelWithId);
    container.appendChild(labelElement);
    log(`Applied label with id: ${labelWithId.id}`);
  }

  // Create inner ad div
  const adDiv = document.createElement('div');
  adDiv.className = adClass;
  adDiv.id = slotId;

  // Apply rule-specific adClass (additive)
  if (matchedRule?.adClass) {
    adDiv.className += ` ${matchedRule.adClass}`;
    log(`Applied adClass: ${matchedRule.adClass}`);
  }

  // Apply adStyle: mode default + rule override
  if (activeMode?.defaultAdStyle) {
    applyStyles(adDiv, activeMode.defaultAdStyle);
  }
  if (matchedRule?.adStyle) {
    applyStyles(adDiv, matchedRule.adStyle);
    log(`Applied adStyle:`, matchedRule.adStyle);
  }

  // Apply data attributes from config (for ad div)
  Object.entries(dataAttributes).forEach(([key, value]) => {
    adDiv.setAttribute(key, value);
  });

  container.appendChild(adDiv);

  return container;
}

/**
 * Insert ad container before a reference element
 * @param {HTMLElement} referenceNode - Element to insert before
 * @param {HTMLElement} adContainer - Ad container to insert
 */
export function insertAdBefore(referenceNode: Element, adContainer: HTMLElement) {
  if (referenceNode && referenceNode.parentNode) {
    referenceNode.parentNode.insertBefore(adContainer, referenceNode);
  }
}

/**
 * Insert ad container after a reference element
 * @param {HTMLElement} referenceNode - Element to insert after
 * @param {HTMLElement} adContainer - Ad container to insert
 */
export function insertAdAfter(referenceNode: Element, adContainer: HTMLElement) {
  if (referenceNode && referenceNode.parentNode) {
    referenceNode.parentNode.insertBefore(adContainer, referenceNode.nextSibling);
  }
}

/**
 * Inject ads into content based on counting rules (character or block mode)
 * @param {Object} options - { position: 'before'|'after' }
 * @returns {Object} Results { injected, slots }
 */
interface InjectAdsOptions {
  position?: 'before' | 'after';
}

export function injectAds(options: InjectAdsOptions = {}) {
  log('injectAds() called with options:', options);

  if (!injectionConfig.enabled) {
    warn('Injection disabled in config (enabled: false)');
    return { injected: 0, slots: [] };
  }

  if (!state.initialized) {
    log('Not initialized, calling init()');
    init();
  }

  // If mode has waitForEvent configured, only allow injection from the event callback
  // External calls should be blocked until the event fires
  if (state.waitingForEvent) {
    log('Waiting for event - skipping premature injection call');
    return { injected: 0, slots: [] };
  }

  // Default 'after' - ad appears AFTER the element that pushed count over threshold
  const { position = 'after' } = options;
  const rule = getRule();
  const { activeMode, context } = state;

  log('Using rule:', rule);

  // Check for customInjector function in mode config
  if (activeMode?.customInjector && typeof activeMode.customInjector === 'function') {
    // Guard: prevent duplicate customInjector runs
    if (state.injectionStarted && state.adsInjected > 0) {
      log('customInjector already ran - skipping duplicate call');
      return { injected: state.adsInjected, slots: state.injectedSlots };
    }
    state.injectionStarted = true;

    log('Using customInjector from mode config');

    // Provide helpers for the custom injector
    const helpers = {
      createAdContainer,
      insertAdBefore,
      insertAdAfter,
      buildSlotId,
      findContentContainers,
      log,
      warn,
      publish,
      getState: () => state,
      setState: (updates: Partial<DynamicInjectionState>) => {
        Object.assign(state, updates);
      },
      trackSlot: (slotId: string) => {
        state.injectedSlots.push(slotId);
      },
      finishInjection
    };

    try {
      const result = activeMode.customInjector(context, rule, helpers);
      // If customInjector returns a result, use it; otherwise return default
      return result || { injected: state.adsInjected, slots: state.injectedSlots };
    } catch (e) {
      warn('customInjector threw an error:', e instanceof Error ? e.message : String(e));
      return { injected: 0, slots: [] };
    }
  }

  // Determine counting mode from active mode config
  const countMode = activeMode?.countMode || 'chars';
  const blockSelector = activeMode?.blockSelector || '.block';

  log(`Count mode: ${countMode}`);

  const containers = findContentContainers();

  if (containers.length === 0) {
    warn('No containers found, cannot inject ads');
    return { injected: 0, slots: [] };
  }

  // Use block-based or character-based injection
  // Compile-time feature flags allow tree-shaking of unused modes
  if (countMode === 'blocks') {
    if (FEATURE_INJECTION_BLOCK_MODE) {
      return injectAdsByBlocks(containers, rule, blockSelector, position);
    } else {
      warn('Block mode requested but FEATURE_INJECTION_BLOCK_MODE is disabled at build time');
      return { injected: 0, slots: [] };
    }
  } else {
    if (FEATURE_INJECTION_CHAR_MODE) {
      return injectAdsByChars(containers, rule, position);
    } else {
      warn('Char mode requested but FEATURE_INJECTION_CHAR_MODE is disabled at build time');
      return { injected: 0, slots: [] };
    }
  }
}

/**
 * Inject ads using character counting
 * Iterates ALL elements in containers, counting only:
 * - Paragraphs: use text length (if >= minParaChars)
 * - contentElements: use configured charValue
 * - Other elements: skip entirely (no counting, no injection)
 *
 * Injection points are determined by canInjectAfter/canInjectBefore rules
 */
function injectAdsByChars(
  containers: NodeListOf<Element> | Element[],
  rule: any,
  position: 'before' | 'after'
) {
  const { paragraphSelector, defaults, contentElements } = injectionConfig;
  const minParaChars = rule.minParaChars ?? defaults.minParaChars ?? 150;

  log(`Thresholds: firstAd=${rule.firstAd}, otherAd=${rule.otherAd}, maxAds=${rule.maxAds}, minParaChars=${minParaChars}`);
  log(`contentElements config:`, contentElements || 'none');

  // Build selector for all relevant elements (paragraphs + contentElements)
  const contentElementSelectors = Object.keys(contentElements || {});
  const allSelectors = [paragraphSelector, ...contentElementSelectors].join(',');

  // Collect ALL matching descendants from all containers
  const allElements: Element[] = [];
  containers.forEach((container, containerIndex) => {
    const elements = Array.from(container.querySelectorAll(allSelectors));
    log(`Container ${containerIndex}: ${elements.length} matching elements (selector: ${allSelectors})`);
    elements.forEach(el => allElements.push(el));
  });

  if (allElements.length === 0) {
    warn('No elements found in containers, cannot inject ads');
    return { injected: 0, slots: [] };
  }

  log(`Total elements to process: ${allElements.length}`);

  const results: { injected: number; slots: string[] } = { injected: 0, slots: [] };
  let charCount = 0;
  let hasFirstAd = false;
  let relevantElementIndex = 0; // Track index among relevant elements only

  // Track the immediately previous element and whether it was valid for injection
  let prevElement: Element | null = null;
  let prevElementIndex = -1;
  let prevElementWasValid = false;

  log('--- Starting element iteration loop ---');

  for (let i = 0; i < allElements.length; i++) {
    const element = allElements[i];
    const tagName = element.tagName.toLowerCase();

    // Check if this is a paragraph
    let isParagraph = false;
    try {
      isParagraph = element.matches(paragraphSelector);
    } catch {
      // Invalid selector
    }

    // Check if this element is in contentElements
    const contentConfig = getContentElementConfig(element);

    // Get matched selector name for logging
    const matchedSelector = contentConfig
      ? Object.entries(contentElements || {}).find(([sel]) => {
          try { return element.matches(sel); } catch { return false; }
        })?.[0] || tagName
      : null;

    // Skip if neither paragraph nor in contentElements
    if (!isParagraph && !contentConfig) {
      log(`  [${i}] ${tagName}: SKIP (not paragraph, not in contentElements)`);
      continue;
    }

    // Calculate character contribution
    let charContribution = 0;
    let elementType = '';
    let isValidInjectionPoint = false;  // Track if this element could be an injection point

    if (isParagraph) {
      // Paragraph: use text length
      const text = (element as HTMLElement).innerText || element.textContent || '';
      charContribution = text.length;
      elementType = 'paragraph';

      // Use strictly greater than (not >=) for minParaChars
      isValidInjectionPoint = charContribution > minParaChars;
    } else if (contentConfig) {
      // contentElement: use configured charValue
      charContribution = contentConfig.charValue;
      elementType = `contentElement[${matchedSelector}]`;
      isValidInjectionPoint = contentConfig.canInjectAfter !== false;
    }

    // Add to running total (count ALL paragraphs including short ones)
    charCount += charContribution;
    relevantElementIndex++;

    // Determine threshold based on first ad or subsequent
    const threshold = hasFirstAd ? rule.otherAd : rule.firstAd;
    const thresholdType = hasFirstAd ? 'otherAd' : 'firstAd';

    // Log element info
    const validPointStr = isValidInjectionPoint ? 'yes' : `no (${charContribution} <= ${minParaChars})`;
    log(`  [${i}] ${elementType}: +${charContribution} chars = ${charCount} total (threshold: ${threshold} [${thresholdType}]) validPoint=${validPointStr}`);

    // Check if threshold met AND the immediately previous element was valid
    if (charCount >= threshold && prevElement && prevElementWasValid) {
      // Check if we've hit maxAds limit
      if (state.dynCount >= rule.maxAds) {
        warn(`Max ads limit reached: ${rule.maxAds}, stopping`);
        break;
      }

      // Check if injection is allowed based on contentElements rules at the PREVIOUS element
      const injectionCheck = canInjectAtPosition(prevElement, position);
      if (!injectionCheck.allowed) {
        log(`    -> Skipping injection at [${prevElementIndex}]: ${injectionCheck.reason}`);
        // Don't reset charCount - keep accumulating until we find a valid position
        // Update prev tracking for next iteration
        prevElement = element;
        prevElementIndex = i;
        prevElementWasValid = isValidInjectionPoint;
        continue;
      }

      // Check if container already exists (prevents duplicates on repeated calls)
      const slotId = buildSlotId(state.dynCount);
      const containerId = `${slotId}_container`;
      if (document.getElementById(containerId)) {
        log(`    -> Container ${containerId} already exists, skipping`);
        state.dynCount++;
        prevElement = element;
        prevElementIndex = i;
        prevElementWasValid = isValidInjectionPoint;
        continue;
      }

      // Create and insert ad after the previous element
      const adContainer = createAdContainer(state.dynCount);

      log(`    -> INJECTING AD: ${slotId} after [${prevElementIndex}] (charCount=${charCount} >= ${threshold})`);

      if (position === 'before') {
        insertAdBefore(prevElement, adContainer);
      } else {
        insertAdAfter(prevElement, adContainer);
      }

      state.dynCount++;
      state.adsInjected++;
      state.injectedSlots.push(slotId);
      results.slots.push(slotId);
      results.injected++;
      hasFirstAd = true;

      // Reset char count after injection
      log(`    -> Resetting charCount from ${charCount} to 0`);
      charCount = 0;
    }

    // Update previous element tracking for next iteration
    prevElement = element;
    prevElementIndex = i;
    prevElementWasValid = isValidInjectionPoint;
  }

  state.hasFirstAd = hasFirstAd;
  state.charCount = charCount;

  log(`--- Element iteration complete: processed ${relevantElementIndex} relevant elements ---`);

  return finishInjection(results);
}

/**
 * Inject ads using block counting (new mode for live blogs, galleries, etc.)
 * Uses contentElements for injection rules
 */
function injectAdsByBlocks(
  containers: NodeListOf<Element> | Element[],
  rule: any,
  blockSelector: string,
  position: 'before' | 'after'
) {
  const firstAdBlock = rule.firstAdBlock || 3;
  const otherAdBlock = rule.otherAdBlock || 5;
  const minBlockChars = rule.minBlockChars || 0;

  log(`Block thresholds: firstAdBlock=${firstAdBlock}, otherAdBlock=${otherAdBlock}, maxAds=${rule.maxAds}`);
  log(`contentElements config:`, injectionConfig.contentElements || 'none');

  const blocks = getBlocks(containers, blockSelector, minBlockChars);

  if (blocks.length === 0) {
    warn(`No valid blocks found with selector "${blockSelector}", cannot inject ads`);
    return { injected: 0, slots: [] };
  }

  const results: { injected: number; slots: string[] } = { injected: 0, slots: [] };
  let blockCount = 0;
  let hasFirstAd = false;

  log('--- Starting block counting loop ---');

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    blockCount++;

    // Determine threshold based on first ad or subsequent
    const threshold = hasFirstAd ? otherAdBlock : firstAdBlock;
    const thresholdType = hasFirstAd ? 'otherAdBlock' : 'firstAdBlock';

    log(`Block ${i}: count=${blockCount} (threshold: ${threshold} [${thresholdType}])`);

    // Check if we've accumulated enough blocks
    if (blockCount >= threshold) {
      // Check if we've hit maxAds limit
      if (state.dynCount >= rule.maxAds) {
        warn(`Max ads limit reached: ${rule.maxAds}, stopping`);
        break;
      }

      // Don't inject after the last block (ad shouldn't be final element)
      const isLastBlock = i === blocks.length - 1;
      if (position === 'after' && isLastBlock) {
        log(`Skipping injection: would place ad after final block`);
        break;
      }

      // Check if injection is allowed based on contentElements rules
      const injectionCheck = canInjectAtPosition(block.element, position);
      if (!injectionCheck.allowed) {
        log(`Skipping injection at block ${i}: ${injectionCheck.reason}`);
        // Don't reset blockCount - keep accumulating until we find a valid position
        continue;
      }

      // Check if container already exists (prevents duplicates on repeated calls)
      const slotId = buildSlotId(state.dynCount);
      const containerId = `${slotId}_container`;
      if (document.getElementById(containerId)) {
        log(`Container ${containerId} already exists, skipping`);
        state.dynCount++;
        continue;
      }

      // Create and insert ad
      const adContainer = createAdContainer(state.dynCount);

      log(`INJECTING AD: ${slotId} ${position} block ${i} (blockCount=${blockCount} >= ${threshold})`);

      if (position === 'before') {
        insertAdBefore(block.element, adContainer);
      } else {
        insertAdAfter(block.element, adContainer);
      }

      state.dynCount++;
      state.adsInjected++;
      state.injectedSlots.push(slotId);
      results.slots.push(slotId);
      results.injected++;
      hasFirstAd = true;

      // Reset block count after injection
      log(`  -> Resetting blockCount from ${blockCount} to 0`);
      blockCount = 0;
    }
  }

  state.hasFirstAd = hasFirstAd;
  state.blockCount = blockCount;

  return finishInjection(results);
}

/**
 * Finish injection and publish events
 * Note: Slot processing (GPT define + request) is handled by the caller based on timing
 */
function finishInjection(results: { injected: number; slots: string[] }) {

  log('--- Injection complete ---');
  log(`Results: ${results.injected} ads injected`, results.slots);

  // Publish event for each injected slot
  results.slots.forEach(slotId => {
    publish('dynamicInjection.slotCreated', { slotId, mode: state.activeMode?.id });
  });

  // Publish summary event
  if (results.injected > 0) {
    publish('dynamicInjection.complete', {
      injected: results.injected,
      slots: results.slots,
      mode: state.activeMode?.id
    });
  }

  return results;
}

/**
 * Get current injection state
 * @returns {Object} Current state
 */
export function getState() {
  return { ...state };
}

/**
 * Get injected slot IDs
 * @returns {Array} Array of slot IDs
 */
export function getInjectedSlots() {
  return [...state.injectedSlots];
}

/**
 * Remove all injected ad containers
 */
export function removeInjectedAds() {
  log('removeInjectedAds() called');

  state.injectedSlots.forEach(slotId => {
    const container = document.getElementById(`${slotId}_container`);
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
      log(`  Removed: ${slotId}`);
    }
  });

  log(`Removed ${state.injectedSlots.length} injected ads`);
  state.injectedSlots = [];
  state.adsInjected = 0;
}

/**
 * Reset module state
 */
export function reset() {
  log('reset() called');

  // Clean up waitForEvent subscription
  if (waitForEventToken) {
    const pubsub = window[CONFIG.pubsubGlobal];
    if (pubsub?.unsubscribe) {
      pubsub.unsubscribe(waitForEventToken);
      log(`Unsubscribed waitForEvent token: ${waitForEventToken}`);
    }
    waitForEventToken = null;
  }

  removeInjectedAds();
  state = {
    initialized: false,
    context: {},
    dimensionConfig: {},
    activeMode: null,
    matchedRule: null,
    dynCount: 0,
    adsInjected: 0,
    charCount: 0,
    blockCount: 0,
    hasFirstAd: false,
    injectedSlots: [],
    waitingForEvent: false,
    injectionStarted: false
  };
  log('Reset complete');
}

/**
 * Get config
 * @returns {Object} Injection config
 */
export function getConfig() {
  return injectionConfig;
}

/**
 * Process injected slots through the slots module (define GPT slots + set up lazy loading)
 * Uses lazyload.json config rules to determine lazy loading eligibility
 * @param {Object} context - Page context { site, zone }
 * @param {Object} options - Options passed to slots.defineGPTSlot
 * @param {boolean} options.enableLazy - Enable lazy loading (default: true)
 * @returns {Object} Results { processed, slots, lazy, immediate }
 */
export function processInjectedSlots(context: Record<string, any> = {}, options: Record<string, any> = {}) {
  log('processInjectedSlots() called');

  const { enableLazy = true, targeting = {} } = options;
  const injectedSlots = state.injectedSlots;

  if (injectedSlots.length === 0) {
    warn('No injected slots to process');
    return { processed: 0, slots: [], lazy: 0, immediate: 0 };
  }

  const results: { processed: number; slots: string[]; lazy: number; immediate: number } = {
    processed: 0,
    slots: [],
    lazy: 0,
    immediate: 0
  };
  const adUnitPath = slots.buildAdUnitPath(context);
  const breakpoint = sizemapping.getBreakpoint();

  // Create lazy observer using slots module helper (respects lazyload.json config)
  // Returns null if IntersectionObserver is not supported
  const lazyObserver = slots.createLazyObserver((element: HTMLElement) => {
    const slotId = element.id;
    lazyObserver?.unobserve(element);
    slots.requestAd(slotId);
    slots.markLoaded(element);
    log(`Lazy loaded dynamic slot: ${slotId}`);
  }, breakpoint);

  // Track slots that need lazy vs immediate loading
  const slotsToProcess: Array<{ element: HTMLElement; slotId: string; adType: string; isLazy: boolean }> = [];

  // First pass: define all GPT slots and determine lazy eligibility
  injectedSlots.forEach((slotId, index) => {
    const element = document.getElementById(slotId);
    if (!element) {
      warn(`Element not found for slot: ${slotId}`);
      return;
    }

    // Idempotent: skip slots already defined in GPT (prevents duplicate auctions)
    if (slots.getDefinedSlots().has(slotId)) {
      log(`Slot ${slotId} already defined in GPT - skipping`);
      return;
    }

    const adType = injectionConfig.adType || 'dyn';
    const sizes = sizemapping.getSizes(adType, breakpoint);

    // Add dynid targeting for dynamic slots (identifies dynamically injected ads)
    const dynamicTargeting = {
      ...targeting,
      dynid: String(index)
    };

    log(`Defining GPT slot: ${slotId}`, { adType, sizes, dynid: index });

    slots.defineGPTSlot({
      slotId,
      adType,
      adUnitPath,
      sizes,
      targeting: dynamicTargeting
    });

    // Check lazy load eligibility using lazyload.json config rules
    const isLazy = enableLazy && slots.shouldLazyLoad(adType, slotId, breakpoint, context);

    results.processed++;
    results.slots.push(slotId);
    slotsToProcess.push({ element, slotId, adType, isLazy });
  });

  // Enable services if we processed any slots
  if (results.processed > 0) {
    slots.enableServices();

    // Second pass: set up lazy loading or request immediately based on config
    slotsToProcess.forEach(({ element, slotId, isLazy }) => {
      // Fall back to immediate if observer not available (no IntersectionObserver support)
      if (isLazy && lazyObserver) {
        lazyObserver.observe(element);
        slots.getActiveObservers().set(slotId, lazyObserver);
        results.lazy++;
        log(`Observing dynamic slot for lazy load: ${slotId}`);
      } else {
        slots.requestAd(slotId);
        slots.markLoaded(element);
        results.immediate++;
        log(`Requested dynamic slot immediately: ${slotId}`);
      }
    });

    publish('dynamicInjection.slotsProcessed', {
      processed: results.processed,
      slots: results.slots,
      lazy: results.lazy,
      immediate: results.immediate
    });
  }

  log(`Processed ${results.processed} injected slots (${results.lazy} lazy, ${results.immediate} immediate)`);
  return results;
}

/**
 * Debug helper - logs current state and config via loader's log system
 */
export function debug() {
  log('Debug - State', state);
  log('Debug - Config', injectionConfig);
  log('Debug - Active mode', state.activeMode);
  if (state.activeMode) {
    log('Debug - Mode selectors', state.activeMode.contentSelectors);
    log('Debug - Mode rules', state.activeMode.rules);
  }
  return { state: { ...state }, config: injectionConfig };
}

export default {
  init,
  findMatchingMode,
  getRule,
  findContentContainers,
  getParagraphs,
  createAdContainer,
  insertAdBefore,
  insertAdAfter,
  injectAds,
  processInjectedSlots,
  getState,
  getInjectedSlots,
  removeInjectedAds,
  reset,
  getConfig,
  debug
};
