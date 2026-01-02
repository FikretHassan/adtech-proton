/**
 * TMS Entry Point - Streamlined entry for Tag Management System builds
 *
 * This entry point excludes all ad-specific modules for minimal bundle size.
 * Use for marketing, analytics, and tracking scripts that don't need GPT/Prebid.
 */

import Proton, { PubSub } from './index';
import plugins from '../config-tms/partners/index.js';
import partnersConfig from '../config-tms/partners.json';
import hooksConfig from '../config/hooks.js';
import CONFIG from '../config/loader.js';
import dimensionsConfig from '../config/dimensions.json';
import rawPropertiesConfig from '../config/properties.json';
import environment from './environment';
import orchestrator from './orchestrator';
import hooks from './hooks';
import about from './generated/about.js';
import metrics from './metrics';
import consent from '../config/consent.js';
import { resolveConfig } from './propertyConfig';
import { getProperty } from './property';
import { getWindowPath, resolveDimensionValue, clearDimensionCache } from './dimensionResolver';

const LOG_PREFIX = '[Loader]';

/**
 * Get merged dimensions config (common + property-specific)
 */
function getMergedDimensions(): Record<string, any> {
  const common = (dimensionsConfig as any).common || {};
  const properties = (dimensionsConfig as any).properties || {};
  const currentProperty = getProperty();
  const propertyDimensions = properties[currentProperty] || properties.default || {};
  return { ...common, ...propertyDimensions };
}

/**
 * Get or create PubSub instance
 */
function getOrCreatePubSub(): any {
  const externalName = (CONFIG as any).experimentalPubsub;

  if (externalName && typeof externalName === 'string') {
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
window[CONFIG.pubsubGlobal] = pubsub;

// Initialize Hooks System
hooks.init({ hooks: hooksConfig as any });
hooks.executeSync('loader.beforeInit');

// Initialize Metrics
metrics.init({ pubsub });

// Environment detection
environment.init();

// Check if disabled via URL params
const adsDisabled = environment.isAdsDisabled();

if (adsDisabled) {
  console.warn('[Loader] Disabled via URL parameter');
  window[CONFIG.globalName] = {
    disabled: true,
    reason: 'URL parameter override',
    cmd: [],
    log: () => {},
    getPlugin: () => null,
    getContext: () => ({}),
    isDebugEnabled: () => false
  };
}

if (!adsDisabled) {

// TMS mode: minimal initialization
hooks.executeSync('loader.afterInit', ['environment']);
pubsub.publish({
  topic: 'loader.core.ready',
  data: { modules: ['environment'] }
});

// Create loader instance
const loader = new Proton({
  debugParam: CONFIG.debugParam,
  enableParam: CONFIG.enableParam,
  disableParam: CONFIG.disableParam,
  consentCheck: (allowedStates: string[]) => {
    if (!allowedStates || allowedStates.length === 0 || allowedStates.includes('all')) {
      return true;
    }
    const currentState = consent.getState();
    return allowedStates.includes(currentState);
  },
  getConsentState: () => consent.getState()
});

// Preserve pre-queued commands
const preQueuedCommands = window[CONFIG.globalName]?.cmd || [];
if (preQueuedCommands.length > 0) {
  loader.log(`${LOG_PREFIX} Found ${preQueuedCommands.length} pre-queued commands`);
  loader.cmd = [...preQueuedCommands, ...loader.cmd];
}

// Generate testgroup ONCE at boot (used by orchestrator for testRange filtering)
const testgroup = Math.floor(Math.random() * 100);

// Register all plugins
Object.values(plugins).forEach(pluginConfig => {
  loader.register(pluginConfig);
});
loader.log(`${LOG_PREFIX} Registered ${Object.keys(plugins).length} TMS plugins`);

/**
 * Load all configured TMS plugins
 */
function loadPlugins(partnersStartTime: number) {
  loader.log(`${LOG_PREFIX} [TMS] Initializing with ${Object.keys(plugins).length} plugins`);
  loader.log(`${LOG_PREFIX} User testgroup: ${testgroup}`);

  // Initialize orchestrator with TMS config
  orchestrator.init({
    testgroup,
    partnersStartTime,
    partnersConfig: partnersConfig as any,
    onPartnersReady: () => {
      loader.log(`${LOG_PREFIX} TMS partners ready`);
    },
    onAllPartnersReady: () => {
      loader.log(`${LOG_PREFIX} All TMS partners ready`);
      pubsub.publish({ topic: 'loader.tms.ready', data: {} });
    }
  });

  // Load plugins respecting dependencies
  Object.values(plugins).forEach(pluginConfig => {
    const dep = orchestrator.getDependency(pluginConfig.name);

    if (dep) {
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
      loader.load(pluginConfig).then((result: any) => {
        loader.log(`${LOG_PREFIX} ${result.name}: ${result.status}`, result.reason || null);
      });
    }
  });

}

/**
 * Start plugin loading once ready
 */
function startOnReady() {
  if (CONFIG.readyTopic) {
    if (pubsub?.hasPublished?.(CONFIG.readyTopic)) {
      loader.log(`${LOG_PREFIX} ${CONFIG.readyTopic} already published, loading plugins`);
      loadPlugins(Date.now());
    } else {
      loader.log(`${LOG_PREFIX} Waiting for ${CONFIG.readyTopic}`);
      pubsub?.subscribe?.({
        topic: CONFIG.readyTopic,
        func: () => {
          const startTime = Date.now();
          loader.log(`${LOG_PREFIX} ${CONFIG.readyTopic} received, loading plugins`);
          loadPlugins(startTime);
        },
        runIfAlreadyPublished: true
      }) || loadPlugins(Date.now());
    }
  } else {
    loadPlugins(Date.now());
  }
}

function processQueue() {
  setTimeout(() => {
    loader.processCommandQueue();
    loader.log(`${LOG_PREFIX} Command queue processed`);
  }, 0);
}

startOnReady();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', processQueue);
} else {
  processQueue();
}

// Attach modules to loader
(loader as any).environment = environment;
(loader as any).orchestrator = orchestrator;
(loader as any).hooks = hooks;
(loader as any).about = about;
(loader as any).testgroup = testgroup;
(loader as any).clearDimensionCache = clearDimensionCache;

// Expose getDimension
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

// Metrics (TMS mode - simplified)
Object.defineProperty(loader, 'metrics', {
  get: () => ({
    events: metrics.getEvents(),
    vendors: loader.getVendorMetrics()
  }),
  enumerable: true
});

// Config (TMS mode)
Object.defineProperty(loader, 'config', {
  get: () => ({
    globalName: CONFIG.globalName,
    debugParam: CONFIG.debugParam,
    readyTopic: CONFIG.readyTopic,
    pubsubGlobal: CONFIG.pubsubGlobal,
    experimentalPubsub: (CONFIG as any).experimentalPubsub || null,
    ads: null,
    modules: {
      ads: false,
      sequencing: false,
      injection: false,
      customSlots: false,
      experiences: false,
      refresh: false,
      experiments: false,
      customFunctions: false,
      wrappers: false
    },
    property: environment.getProperty(),
    viewport: null,
    debugEnabled: loader.isDebugEnabled(),
    environment: environment.getEnvironment()
  }),
  enumerable: true
});

window[CONFIG.globalName] = loader;

} // End of if (!adsDisabled)

export default window[CONFIG.globalName];
