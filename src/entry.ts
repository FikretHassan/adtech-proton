/**
 * Entry point - Auto-initializes the plugin loader with configured plugins
 */

import Proton, { PubSub } from './index';
import { ExperimentManager } from './optional/experiments';
import plugins from '../config/partners/index.js';
import experiments from '../config/experiments.js';
import hooksConfig from '../config/hooks.js';
import CONFIG from '../config/loader.js';
import dimensionsConfig from '../config/dimensions.json';
import rawPropertiesConfig from '../config/properties.json';
import sizemapping from './sizemapping';
import slots from './slots';
import adTargeting from './adTargeting';
import gptEvents from './gptEvents';
import environment from './environment';
import adRefresh from './optional/adRefresh';
import dynamicInjection from './optional/injection';
import orchestrator from './orchestrator';
import preRequestHooks from './preRequestHooks';
import hooks from './hooks';
import adSequencing from './optional/sequencing';
import experienceLoader from './optional/experiences';
import wrapperAuctions from './optional/wrapperAuctions';
import functions from './functions';
import customSlots from './optional/customSlots';
import customFunctions from '../config/customFunctions/index.js';
import about from './generated/about.js';
import metrics from './metrics';
import { TIMEOUTS } from './constants';
import consent from '../config/consent.js';
import { resolveConfig } from './propertyConfig';
import { getProperty } from './property';
import { getWindowPath, resolveDimensionValue } from './dimensionResolver';

// Build-time feature flags (set by esbuild --define)
declare const FEATURE_SEQUENCING: boolean;
declare const FEATURE_INJECTION: boolean;
declare const FEATURE_CUSTOM_SLOTS: boolean;
declare const FEATURE_EXPERIENCES: boolean;
declare const FEATURE_REFRESH: boolean;
declare const FEATURE_EXPERIMENTS: boolean;
declare const FEATURE_CUSTOM_FUNCTIONS: boolean;
declare const FEATURE_WRAPPERS: boolean;

// Logging prefix
const LOG_PREFIX = '[Loader]';

// Helper functions imported from dimensionResolver module

/**
 * Get merged dimensions config (common + property-specific)
 * Same pattern as targeting.json and properties.json
 */
function getMergedDimensions(): Record<string, any> {
  const common = (dimensionsConfig as any).common || {};
  const properties = (dimensionsConfig as any).properties || {};
  const currentProperty = getProperty();
  const propertyDimensions = properties[currentProperty] || properties.default || {};
  return { ...common, ...propertyDimensions };
}

// Validate and get PubSub instance
// Supports experimental external PubSub via CONFIG.experimentalPubsub
// Accepts dot-notation paths (e.g., 'myApp.pubsub' resolves to window.myApp.pubsub)
function getOrCreatePubSub(): any {
  const externalName = (CONFIG as any).experimentalPubsub;

  if (externalName && typeof externalName === 'string') {
    // Support dot-notation paths (e.g., 'myApp.pubsub' -> window.myApp.pubsub)
    const external = getWindowPath(externalName);
    const requiredMethods = ['subscribe', 'unsubscribe', 'publish'];
    const missingMethods = requiredMethods.filter(m => typeof external?.[m] !== 'function');
    const missingArrays = ['topics', 'publishedTopics'].filter(a => !Array.isArray(external?.[a]));

    if (missingMethods.length === 0 && missingArrays.length === 0) {
      console.log(`[Proton] Using external PubSub: ${externalName}`);
      return external;
    }

    const missing = [...missingMethods, ...missingArrays];
    console.warn(`[Proton] experimentalPubsub: ${externalName} invalid (missing: ${missing.join(', ')}). Creating internal PubSub.`);
  }

  return (window as any)[CONFIG.pubsubGlobal] || new PubSub();
}

// Get or create PubSub instance
const pubsub = getOrCreatePubSub();

// Always assign to window for module access (aliases external when using experimentalPubsub)
window[CONFIG.pubsubGlobal] = pubsub;

// ============================================================================
// Initialize Hooks System (must be first to catch all lifecycle events)
// ============================================================================
hooks.init({ hooks: hooksConfig as any });

// Execute beforeInit hooks (opportunity for early setup)
hooks.executeSync('loader.beforeInit');

// ============================================================================
// Initialize Metrics (early to capture page lifecycle)
// ============================================================================
metrics.init({ pubsub });

// ============================================================================
// Internal Module Initialization Chain (Phase 1: Core synchronous)
// ============================================================================
// Order matters - each module emits a ready event when done

// 1. Environment detection (server type, URL params, debug mode)
environment.init();

// Check if ads are disabled via URL params (adsDisableStack, adkill, adgptoff)
const adsDisabled = environment.isAdsDisabled();

if (adsDisabled) {
  console.warn('[Loader] Ads disabled via URL parameter');
  // Expose disabled stub - initialization continues below but is gated
  window[CONFIG.globalName] = {
    disabled: true,
    reason: 'URL parameter override',
    ads: {},
    cmd: [],
    log: () => {},
    getPlugin: () => null,
    getContext: () => ({}),
    isDebugEnabled: () => false
  };
}

// Gate all initialization on ads not being disabled
if (!adsDisabled) {

// 2. Sizemapping (breakpoints, ad sizes)
sizemapping.init();

// 3. Ad targeting (internal functions, targeting config)
adTargeting.init();

// 4. Slots (GPT setup)
slots.init();

// 5. GPT event handlers (depends on slots for googletag)
gptEvents.init({ pubsub: pubsub });

// 6. Wrapper auctions (header bidding orchestration)
const dimensions = getMergedDimensions();
wrapperAuctions.init({
  geo: resolveDimensionValue(dimensions.geo) || null,
  viewport: sizemapping.getBreakpoint()
});

// 7. Functions utility (scroll handlers, SPA support)
functions.init();

// 8. Custom slots (dimension-targeted slot injection)
customSlots.init();

// 9. Custom functions ready (config-based, no init needed)
if (FEATURE_CUSTOM_FUNCTIONS) {
  pubsub.publish({
    topic: 'loader.customFunctions.ready',
    data: { functions: Object.keys(customFunctions) }
  });
}

// Execute afterInit hooks
hooks.executeSync('loader.afterInit', ['environment', 'sizemapping', 'adTargeting', 'slots', 'gptEvents', 'wrapperAuctions', 'functions', 'customSlots', 'customFunctions']);

// Emit core ready event after all Phase 1 modules initialized
pubsub.publish({
  topic: 'loader.core.ready',
  data: { modules: ['environment', 'sizemapping', 'adTargeting', 'slots', 'gptEvents', 'wrapperAuctions', 'functions', 'customSlots', 'customFunctions'] }
});

// ============================================================================
// Plugin Loader Setup
// ============================================================================

// Create loader instance
const loader = new Proton({
  debugParam: CONFIG.debugParam,
  enableParam: CONFIG.enableParam,
  disableParam: CONFIG.disableParam,
  consentCheck: (allowedStates: string[]) => {
    // Empty array or ['all'] means no consent check required
    if (!allowedStates || allowedStates.length === 0 || allowedStates.includes('all')) {
      return true;
    }
    // Check if current consent state is in the allowed list
    const currentState = consent.getState();
    return allowedStates.includes(currentState);
  },
  getConsentState: () => consent.getState()
});

// ============================================================================
// Experience Loader Setup
// ============================================================================

// Initialize experience loader (execution deferred until cmp.ready)
experienceLoader.init();

// Preserve any commands queued before loader was created
// This allows external code to push commands before the script loads:
// window.proton = window.proton || { cmd: [] };
// window.proton.cmd.push(function() { ... });
const preQueuedCommands = window[CONFIG.globalName]?.cmd || [];
if (preQueuedCommands.length > 0) {
  loader.log(`${LOG_PREFIX} Found ${preQueuedCommands.length} pre-queued commands`);
  loader.cmd = [...preQueuedCommands, ...loader.cmd];
}

// Create experiment manager with same context and config as loader
const experimentManager = new ExperimentManager({
  getContext: () => loader.getContext(),
  dimensionConfig: loader.dimensionConfig
});

// Register experiments from config
(experiments as any[]).forEach((exp: any) => {
  experimentManager.register(exp);
  loader.log(`${LOG_PREFIX} Registered experiment: ${exp.id}`, { active: exp.active, testRange: exp.testRange });
});

// Connect experiments to loader
loader.setExperiments(experimentManager);

// Register testgroup getter for adTargeting
adTargeting.registerInternal('getTestgroup', () => experimentManager.testgroup);

// Register all plugins immediately (visible with status: 'init')
Object.values(plugins).forEach(pluginConfig => {
  loader.register(pluginConfig);
});
loader.log(`${LOG_PREFIX} Registered ${Object.keys(plugins).length} plugins`);

// Initialize pre-request hooks and register from plugins with beforeRequest config
preRequestHooks.init(loader);
Object.values(plugins).forEach((pluginConfig: any) => {
  if (pluginConfig.beforeRequest) {
    preRequestHooks.registerHook(pluginConfig.name, pluginConfig.beforeRequest);
  }
});

/**
 * Get resolved property config (common + property-specific merged)
 */
function getPropertyConfig() {
  const common = (rawPropertiesConfig as any).common || {};
  const propertyConfig = resolveConfig((rawPropertiesConfig as any).properties || rawPropertiesConfig) || {};
  return { ...common, ...(propertyConfig as object) };
}

/**
 * Resolve an ad unit mapping value
 * @param {string|Object} dimConfig - Mapping config from adUnitMappings
 * @returns {string|null} Resolved value
 */
function resolveAdUnitMapping(dimConfig: any): string | null {
  if (!dimConfig) return null;

  // Object with 'static' key - return static value directly
  if (typeof dimConfig === 'object' && dimConfig.static !== undefined) {
    return dimConfig.static;
  }

  // String - look up dimension name in merged dimensions and resolve it
  if (typeof dimConfig === 'string') {
    const mergedDims = getMergedDimensions();
    const dimensionDef = mergedDims[dimConfig];
    if (dimensionDef) {
      return resolveDimensionValue(dimensionDef);
    }
    // If not found in dimensions, treat as static value
    return dimConfig;
  }

  // Object with source definition - resolve directly
  if (typeof dimConfig === 'object' && dimConfig.source) {
    return resolveDimensionValue(dimConfig);
  }

  return null;
}

/**
 * Build ad context from property adUnitMappings
 * Maps dimension values to ad unit path variables ({site}, {zone}, {pagetype})
 * @returns {Object} Ad context { site, zone, pagetype }
 */
function buildAdContext(): { site: string; zone: string; pagetype: string } {
  const propertyConfig = getPropertyConfig();
  const mappings = propertyConfig.adUnitMappings || {};

  return {
    site: resolveAdUnitMapping(mappings.site) || 'default',
    zone: resolveAdUnitMapping(mappings.zone) || 'ros',
    pagetype: resolveAdUnitMapping(mappings.pagetype) || 'default'
  };
}

/**
 * Request ads for all slots on the page
 * Called automatically when blocking partners are ready
 * 
 * When adSequencing is active, priority slots (OOP types) are
 * loaded first and we wait for their render before loading other slots.
 */
async function requestAds() {
  const context = buildAdContext();
  const adsConfig = CONFIG.ads || {};

  // Update wrapper auctions with context for slot config lookups
  wrapperAuctions.updateContext({
    pagetype: context.pagetype,
    site: context.site,
    zone: context.zone
  });

  // Execute ads.beforeRequest hooks
  await hooks.execute('ads.beforeRequest', context);

  // Decide if ad sequencing should be active based on rules
  const sequencingActive = adSequencing.isEnabled() && adSequencing.decide();
  
  loader.log(`${LOG_PREFIX} Ad sequencing: ${sequencingActive ? 'ACTIVE' : 'inactive'}`, 
    sequencingActive ? { reason: adSequencing.getReason() } : null);

  // Emit create event before first ad request
  pubsub.publish({
    topic: 'loader.ads.create',
    data: { context, sequencingActive }
  });

  loader.log(`${LOG_PREFIX} Requesting ads`, context);

  if (sequencingActive) {
    // SEQUENCED LOADING: Priority slots first, then others
    await requestAdsSequenced(context, adsConfig);
  } else {
    // NORMAL LOADING: All slots together
    await requestAdsNormal(context, adsConfig);
  }
}

/**
 * Normal ad request flow - all slots processed together
 */
async function requestAdsNormal(context: Record<string, any>, adsConfig: Record<string, any>) {
  // Process existing slots in DOM
  const result = slots.processSlots(context, {
    enableLazy: adsConfig.enableLazy !== false,
    enableRefresh: adsConfig.enableRefresh !== false,
    pagetype: context.pagetype
  });

  loader.log(`${LOG_PREFIX} Ads requested`, {
    processed: result.processed,
    immediate: result.immediate,
    lazy: result.lazy
  });

  // Execute injection.beforeInject hooks
  await hooks.execute('injection.beforeInject', { pagetype: context.pagetype });

  // Dynamic injection - inject ads into article content
  // Pass full context and dimensionConfig for dynamic dimension matching (like customSlots)
  const injectionContext = loader.getContext();
  dynamicInjection.init(injectionContext, loader.dimensionConfig);
  const injectionResult = dynamicInjection.injectAds();

  if (injectionResult.injected > 0) {
    loader.log(`${LOG_PREFIX} Dynamic ads injected`, {
      injected: injectionResult.injected,
      mode: (injectionResult as any).mode
    });

    // Execute injection.afterInject hooks
    await hooks.execute('injection.afterInject', injectionResult.slots || []);

    // Process the injected slots
    dynamicInjection.processInjectedSlots(context);
  }

  // Custom slots - inject dimension-targeted slots into DOM
  const customSlotsContext = loader.getContext();
  const customSlotsResult = customSlots.inject(customSlotsContext, loader.dimensionConfig);
  const customSlotsInjected = customSlotsResult.filter(r => r.status === 'injected');

  if (customSlotsInjected.length > 0) {
    loader.log(`${LOG_PREFIX} Custom slots injected`, {
      injected: customSlotsInjected.length,
      slots: customSlotsInjected.map(r => r.slotId)
    });

    // Process the custom slots (define GPT + request ads)
    customSlots.processInjectedSlots(context);
  }

  // Execute ads.afterRequest hooks
  await hooks.execute('ads.afterRequest', { result, injectionResult, customSlotsResult });

  // Emit ads requested event (after slots processed)
  pubsub.publish({
    topic: 'loader.ads.requested',
    data: { context, result, injectionResult, customSlotsResult }
  });
}

/**
 * Sequenced ad request flow - priority slots first, wait for render, then others
 */
async function requestAdsSequenced(context: Record<string, any>, adsConfig: Record<string, any>) {
  const priorityTypes = adSequencing.getPrioritySlotTypes();
  
  loader.log(`${LOG_PREFIX} Sequenced loading: priority types = [${priorityTypes.join(', ')}]`);

  // Inject OOP containers first (these are the priority slots)
  slots.injectOOPContainers();

  // Get all unobserved slots and separate into priority vs regular
  const allSlotElements = slots.getUnobservedSlots();
  const prioritySlots: Array<{ element: Element; slotId: string; adType: string }> = [];
  const regularSlots: Array<{ element: Element; slotId: string; adType: string }> = [];

  allSlotElements.forEach(el => {
    const slotId = el.id;
    const adType = slots.extractAdType(slotId);
    if (priorityTypes.includes(adType)) {
      prioritySlots.push({ element: el, slotId, adType });
    } else {
      regularSlots.push({ element: el, slotId, adType });
    }
  });

  loader.log(`${LOG_PREFIX} Sequencing: ${prioritySlots.length} priority, ${regularSlots.length} regular slots`);

  // PHASE 1: Define and request priority slots
  if (prioritySlots.length > 0) {
    const adUnitPath = slots.buildAdUnitPath(context);
    
    prioritySlots.forEach(({ element, slotId, adType }) => {
      slots.markObserved(element);
      
      const sizes = slots.isOutOfPage(adType) ? [] : sizemapping.getSizesForSlot(slotId, sizemapping.getBreakpoint());
      
      slots.defineGPTSlot({
        slotId,
        adType,
        adUnitPath,
        sizes,
        targeting: {}
      });
      
      // Track this slot for sequencing
      adSequencing.markPriorityRequested(slotId);
    });

    // Enable GPT services
    slots.enableServices();

    // Request the priority slots
    prioritySlots.forEach(({ slotId, element }) => {
      slots.requestAd(slotId);
      slots.markLoaded(element);
      loader.log(`${LOG_PREFIX} Priority slot requested: ${slotId}`);
    });

    // Emit event for priority slots
    pubsub.publish({
      topic: 'loader.ads.priorityRequested',
      data: { 
        slots: prioritySlots.map(s => s.slotId),
        timeout: adSequencing.getPriorityTimeout()
      }
    });

    // PHASE 2: Wait for priority slots to render (or timeout)
    loader.log(`${LOG_PREFIX} Waiting for priority slots to render...`);
    const waitResult: any = await adSequencing.waitForPrioritySlots();

    loader.log(`${LOG_PREFIX} Priority slots complete`, {
      success: waitResult.success,
      timedOut: waitResult.timedOut,
      rendered: waitResult.rendered
    });

    // Emit event for priority complete
    pubsub.publish({
      topic: 'loader.ads.priorityComplete',
      data: waitResult
    });
  }

  // PHASE 3: Now process regular slots (same as normal flow)
  loader.log(`${LOG_PREFIX} Processing ${regularSlots.length} regular slots`);

  const result = slots.processSlots(context, {
    enableLazy: adsConfig.enableLazy !== false,
    enableRefresh: adsConfig.enableRefresh !== false,
    pagetype: context.pagetype
  });

  loader.log(`${LOG_PREFIX} Regular ads requested`, {
    processed: result.processed,
    immediate: result.immediate,
    lazy: result.lazy
  });

  // Execute injection.beforeInject hooks
  await hooks.execute('injection.beforeInject', { pagetype: context.pagetype });

  // Dynamic injection - inject ads into article content
  // Pass full context and dimensionConfig for dynamic dimension matching (like customSlots)
  const injectionContext = loader.getContext();
  dynamicInjection.init(injectionContext, loader.dimensionConfig);
  const injectionResult = dynamicInjection.injectAds();

  if (injectionResult.injected > 0) {
    loader.log(`${LOG_PREFIX} Dynamic ads injected`, {
      injected: injectionResult.injected,
      mode: (injectionResult as any).mode
    });

    // Execute injection.afterInject hooks
    await hooks.execute('injection.afterInject', injectionResult.slots || []);

    // Process the injected slots
    dynamicInjection.processInjectedSlots(context);
  }

  // Custom slots - inject dimension-targeted slots into DOM
  const customSlotsContext = loader.getContext();
  const customSlotsResult = customSlots.inject(customSlotsContext, loader.dimensionConfig);
  const customSlotsInjected = customSlotsResult.filter(r => r.status === 'injected');

  if (customSlotsInjected.length > 0) {
    loader.log(`${LOG_PREFIX} Custom slots injected`, {
      injected: customSlotsInjected.length,
      slots: customSlotsInjected.map(r => r.slotId)
    });

    // Process the custom slots (define GPT + request ads)
    customSlots.processInjectedSlots(context);
  }

  // Execute ads.afterRequest hooks
  await hooks.execute('ads.afterRequest', { result, injectionResult, customSlotsResult, sequenced: true });

  // Emit ads requested event (after slots processed)
  pubsub.publish({
    topic: 'loader.ads.requested',
    data: {
      context,
      result,
      injectionResult,
      customSlotsResult,
      sequencing: adSequencing.getState()
    }
  });
}

/**
 * Re-evaluate partners that didn't load on initial evaluation
 * Called on SPA navigation when context may have changed (consent, targeting, etc.)
 * Skips partners that already loaded/tried (status: loaded, timeout, error)
 */
async function reevaluatePartners() {
  const results: { name: string; previousStatus: string; newStatus: string }[] = [];
  const skipStatuses = ['loaded', 'timeout', 'error', 'requested'];

  for (const pluginConfig of Object.values(plugins)) {
    const plugin = loader.getPlugin(pluginConfig.name);
    if (!plugin) continue;

    const previousStatus = plugin.status;

    // Skip partners that already loaded or tried to load
    if (skipStatuses.includes(previousStatus)) {
      loader.log(`${LOG_PREFIX} reevaluate: ${plugin.name} - skip (${previousStatus})`);
      continue;
    }

    // Reset plugin state for re-evaluation
    if (plugin.timeoutProc) {
      clearTimeout(plugin.timeoutProc);
      plugin.timeoutProc = null;
    }

    // Rebuild plugin state and performance tracker to avoid stale metrics/timeouts
    const refreshedPlugin = loader.normalizePluginConfig(pluginConfig);
    loader.plugins[plugin.name] = refreshedPlugin;
    loader.clearVendorMetrics(plugin.name);

    // Re-evaluate the plugin
    const result = await loader.load(pluginConfig) as { status: string; name: string };
    results.push({
      name: plugin.name,
      previousStatus,
      newStatus: result.status
    });

    loader.log(`${LOG_PREFIX} reevaluate: ${plugin.name} - ${previousStatus} -> ${result.status}`);
  }

  // Emit reevaluation complete event
  pubsub.publish({
    topic: 'loader.partners.reevaluated',
    data: {
      evaluated: results.length,
      loaded: results.filter(r => r.newStatus === 'loaded').length,
      results
    }
  });

  loader.log(`${LOG_PREFIX} Partner reevaluation complete`, {
    evaluated: results.length,
    loaded: results.filter(r => r.newStatus === 'loaded').map(r => r.name)
  });

  return results;
}

// Load all configured plugins
// partnersStartTime: when we were cleared to start (readyTopic fired or immediate)
function loadPlugins(partnersStartTime: number) {
  loader.log(`${LOG_PREFIX} Initializing with ${Object.keys(plugins).length} plugins`);
  loader.log(`${LOG_PREFIX} User testgroup: ${experimentManager.testgroup}`);

  const adsConfig = CONFIG.ads || {};

  // Initialize orchestrator to track partner completion
  // - 'loader.partners.ready' fires when blocking partners complete or timeout
  // - 'loader.ads.ready' fires when ALL partners (blocking + independent) complete or timeout
  orchestrator.init({
    partnersStartTime, // Pass start time so orchestrator can subtract elapsed time
    onPartnersReady: () => {
      loader.log(`${LOG_PREFIX} Blocking partners ready`);
    },
    onAllPartnersReady: () => {
      loader.log(`${LOG_PREFIX} All partners ready - safe to call GAM`);

      // Auto-request ads if enabled
      if (adsConfig.autoRequest !== false) {
        requestAds();
      }
    }
  });

  // Execute experiences now that consent is available
  // This runs after cmp.ready so consentState checks are meaningful
  const experienceContext = loader.getContext();
  const experienceResults = experienceLoader.execute(experienceContext, loader.dimensionConfig);
  loader.log(`${LOG_PREFIX} Experiences executed`, {
    total: experienceResults.length,
    loaded: experienceResults.filter(r => r.status === 'load').length,
    ignored: experienceResults.filter(r => r.status === 'ignore').length
  });

  // Load plugins respecting dependencies
  // Partners with dependsOn wait for their dependency to complete before loading
  Object.values(plugins).forEach(pluginConfig => {
    const dep = orchestrator.getDependency(pluginConfig.name);

    if (dep) {
      // Wait for dependency to complete before loading
      const depEvent = `plugin.${dep}.complete`;
      loader.log(`${LOG_PREFIX} ${pluginConfig.name}: waiting for ${dep}`);

      pubsub.subscribe({
        topic: depEvent,
        func: () => {
          loader.log(`${LOG_PREFIX} ${pluginConfig.name}: dependency ${dep} ready, loading`);
          loader.load(pluginConfig).then((result: any) => {
            loader.log(`${LOG_PREFIX} ${result.name}: ${result.status}`, result.reason || null);
          });
        },
        runIfAlreadyPublished: true
      });
    } else {
      // No dependency - load immediately
      loader.load(pluginConfig).then((result: any) => {
        loader.log(`${LOG_PREFIX} ${result.name}: ${result.status}`, result.reason || null);
      });
    }
  });

  // Log experiment status after all plugins loaded (debounced)
  setTimeout(() => {
    const expStatus = experimentManager.getStatus();
    loader.log(`${LOG_PREFIX} Experiment status`, expStatus);
  }, TIMEOUTS.DEBOUNCE);
}

/**
 * Start plugin loading once CMP (or readyTopic) is ready
 * Matches monolith behavior: subscribe to CMP immediately, don't wait for DOMContentLoaded
 */
function startOnReady() {
  if (CONFIG.readyTopic) {
    // Check if already published
    if (pubsub?.hasPublished?.(CONFIG.readyTopic)) {
      loader.log(`${LOG_PREFIX} ${CONFIG.readyTopic} already published, loading plugins`);
      loadPlugins(Date.now());
    } else {
      // Wait for ready topic - subscribe immediately (don't wait for DOMContentLoaded)
      loader.log(`${LOG_PREFIX} Waiting for ${CONFIG.readyTopic}`);
      pubsub?.subscribe?.({
        topic: CONFIG.readyTopic,
        func: () => {
          const startTime = Date.now(); // Capture when we're cleared to start
          loader.log(`${LOG_PREFIX} ${CONFIG.readyTopic} received, loading plugins`);
          loadPlugins(startTime);
        },
        runIfAlreadyPublished: true
      }) || loadPlugins(Date.now());
    }
  } else {
    // No ready topic configured - load immediately
    loadPlugins(Date.now());
  }
}

/**
 * Process command queue - needs DOM to be ready
 */
function processQueue() {
  setTimeout(() => {
    loader.processCommandQueue();
    loader.log(`${LOG_PREFIX} Command queue processed`);
  }, 0);
}

// Subscribe to CMP/readyTopic immediately
// This ensures we start loading plugins as soon as CMP is ready, not waiting for DOMContentLoaded
startOnReady();

// Process command queue when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processQueue);
} else {
  processQueue();
}

// Attach modules to loader (using any cast for extension)
(loader as any).sizemapping = sizemapping;
(loader as any).slots = slots;
(loader as any).adTargeting = adTargeting;
(loader as any).gptEvents = gptEvents;
(loader as any).environment = environment;
(loader as any).environment.buildContext = buildAdContext;
(loader as any).adRefresh = adRefresh;
(loader as any).dynamicInjection = dynamicInjection;
(loader as any).orchestrator = orchestrator;
(loader as any).preRequestHooks = preRequestHooks;
(loader as any).hooks = hooks;
(loader as any).adSequencing = adSequencing;
(loader as any).experienceLoader = experienceLoader;
(loader as any).wrapperAuctions = wrapperAuctions;
(loader as any).functions = functions;
(loader as any).customSlots = customSlots;

// Attach custom functions if enabled
if (FEATURE_CUSTOM_FUNCTIONS) {
  (loader as any).customFunctions = customFunctions;
}

// Attach build metadata
(loader as any).about = about;

// Expose slot registry
// Returns comprehensive slot data: adunit, sizes, targeting, prebid, etc.
Object.defineProperty(loader, 'ads', {
  get: () => slots.getAllSlotData(),
  enumerable: true
});

// Expose requestAds for manual invocation (SPA navigation, etc)
(loader as any).requestAds = requestAds;

// Expose reevaluatePartners for SPA navigation (re-check partners that didn't load)
(loader as any).reevaluatePartners = reevaluatePartners;

// Expose getDimension for debugging/inspection
// Call with no args to get all dimensions, or with name to get specific one
(loader as any).getDimension = (name?: string) => {
  const dims = getMergedDimensions();
  if (!name) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(dims)) {
      result[key] = resolveDimensionValue(dims[key]);
    }
    return result;
  }
  if (!dims[name]) return null;
  return resolveDimensionValue(dims[name]);
};

// Override loader.metrics with unified getter that aggregates all sources
// Structure: { ads, adStack, events, vendors }
Object.defineProperty(loader, 'metrics', {
  get: () => ({
    ads: gptEvents.getAllMetrics(),
    adStack: metrics.getAdStack(),
    events: metrics.getEvents(),
    vendors: loader.getVendorMetrics()
  }),
  enumerable: true
});

// Build config object with runtime settings and build-time feature flags
Object.defineProperty(loader, 'config', {
  get: () => ({
    // Runtime settings
    globalName: CONFIG.globalName,
    debugParam: CONFIG.debugParam,
    readyTopic: CONFIG.readyTopic,
    pubsubGlobal: CONFIG.pubsubGlobal,
    experimentalPubsub: (CONFIG as any).experimentalPubsub || null,
    ads: { ...CONFIG.ads },

    // Build-time feature flags (what's compiled in)
    modules: {
      sequencing: FEATURE_SEQUENCING,
      injection: FEATURE_INJECTION,
      customSlots: FEATURE_CUSTOM_SLOTS,
      experiences: FEATURE_EXPERIENCES,
      refresh: FEATURE_REFRESH,
      experiments: FEATURE_EXPERIMENTS,
      customFunctions: FEATURE_CUSTOM_FUNCTIONS,
      wrappers: FEATURE_WRAPPERS
    },

    // Runtime state
    property: environment.getProperty(),
    viewport: sizemapping.getBreakpoint(),
    debugEnabled: loader.isDebugEnabled(),
    environment: environment.getEnvironment()
  }),
  enumerable: true
});

// Expose globally with configurable name
window[CONFIG.globalName] = loader;

} // End of if (!adsDisabled) block

export default window[CONFIG.globalName];
