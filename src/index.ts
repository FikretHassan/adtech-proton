/**
 * Proton
 * Lightweight configurable tag management system
 */

import { timer, createPerformanceTracker, calculateLatency } from './timer';
import { evaluateTargeting, matchesDomain, matchesProperty, normalizeTargetingConfig } from './targeting';
import { dimensions as generatedDimensions, dimensionConfig as generatedDimensionConfig } from './generated/dimensions.js';
import { getProperty } from './property';
import { TIMEOUTS } from './constants';
import CONFIG from '../config/loader.js';

/**
 * Proton - Main class for loading and managing third-party scripts
 */
export class Proton {
  // Class properties
  dimensions: Record<string, () => string | number | boolean>;
  eventPrefix: string;
  _consentCheck: (states: string[]) => boolean;
  getConsentState: () => string;
  dimensionConfig: Record<string, any>;
  experiments: any;
  debugParam: string;
  enableParam: string;
  disableParam: string;
  logs: any[];
  cmd: Array<() => void>;
  plugins: Record<string, any>;
  _vendorMetrics: Record<string, any>;

  /**
   * @param {Object} config
   * @param {Object} [config.dimensions] - Override/extend generated dimension functions
   * @param {string} [config.eventPrefix='plugin'] - Prefix for pub/sub events
   * @param {Function} [config.consentCheck] - Function to check consent state
   * @param {Object} [config.dimensionConfig] - Override/extend generated match type config
   * @param {string} [config.debugParam='adsDebugLog'] - URL param to enable console logging
   * @param {string} [config.enableParam='pluginEnable'] - URL param to enable specific plugins
   * @param {string} [config.disableParam='pluginDisable'] - URL param to disable specific plugins
   */
  constructor(config: any = {}) {
    // Merge generated dimensions with any overrides
    this.dimensions = { ...generatedDimensions, ...config.dimensions };
    this.eventPrefix = config.eventPrefix || 'plugin';
    this._consentCheck = config.consentCheck || (() => true);
    this.getConsentState = config.getConsentState || (() => '');
    // Merge generated dimensionConfig with any overrides
    this.dimensionConfig = { ...generatedDimensionConfig, ...config.dimensionConfig };
    this.experiments = null;

    // Logging and URL params
    this.debugParam = config.debugParam || 'adsDebugLog';
    this.enableParam = config.enableParam || 'pluginEnable';
    this.disableParam = config.disableParam || 'pluginDisable';
    this.logs = [];

    // Command queue - allows external code to safely push commands
    // Commands are executed when processCommandQueue() is called (typically after init)
    this.cmd = [];

    // Storage for loaded plugins and vendor metrics
    this.plugins = {};
    this._vendorMetrics = {};
  }

  /**
   * Check if debug mode is enabled via URL param
   * @returns {boolean}
   */
  isDebugEnabled() {
    if (typeof window === 'undefined') return false;
    return window.location.href.indexOf(this.debugParam) >= 0;
  }

  /**
   * Log a message - always stored, only output to console in debug mode
   * @param {string} msg - Log message
   * @param {*} [data=null] - Optional data to log
   * @param {boolean} [forceConsole=false] - Force output to console regardless of debug mode
   */
  log(msg: string = '', data: unknown = null, forceConsole: boolean = false) {
    const ts = timer();
    const entry = [ts, msg, data];
    this.logs.push(entry);

    if (this.logs.length > 10000) {
      this.logs.shift();
    }

    if (this.isDebugEnabled() || forceConsole) {
      if (data !== null) {
        console.info(`[${ts}]`, msg, data);
      } else {
        console.info(`[${ts}]`, msg);
      }
    }
  }

  /**
   * Search logs for entries containing a string
   * Useful for debugging - filters logs by keyword
   * @param {string} str - String to search for in log messages
   * @param {boolean} [outputToConsole=true] - Whether to output matches to console
   * @returns {Array} Matching log entries
   */
  logSearch(str: string, outputToConsole: boolean = true) {
    const matches: any[] = [];
    this.logs.forEach(entry => {
      const msg = entry[1] || '';
      if (typeof msg === 'string' && msg.indexOf(str) > -1) {
        matches.push(entry);
        if (outputToConsole) {
          console.info(entry);
        }
      }
    });
    return matches;
  }

  /**
   * Process command queue - executes all queued commands
   * Call this after loader initialization is complete
   */
  processCommandQueue() {
    while (this.cmd.length > 0) {
      const command = this.cmd.shift();
      if (typeof command === 'function') {
        try {
          command();
          this.log('[Loader] Executed command from queue');
        } catch (err) {
          this.log('[Loader] Command queue error', err);
        }
      }
    }
  }

  /**
   * Set experiment manager (optional)
   * @param {Object} experimentManager - ExperimentManager instance
   */
  setExperiments(experimentManager: any) {
    this.experiments = experimentManager;
  }

  /**
   * Get current context from dimension functions
   * @returns {Object} Current values for all dimensions
   */
  getContext() {
    const context: Record<string, any> = {};
    for (const [key, fn] of Object.entries(this.dimensions)) {
      try {
        context[key] = typeof fn === 'function' ? fn() : fn;
      } catch (e) {
        this.log(`Dimension "${key}" threw error`, e);
        context[key] = undefined;
      }
    }
    return context;
  }

  /**
   * Parse URL parameters for plugin enable/disable overrides
   * @returns {Object} { enable: string[], disable: string[] }
   */
  getUrlOverrides() {
    if (typeof window === 'undefined') {
      return { enable: [], disable: [] };
    }

    const params = new URLSearchParams(window.location.search);
    const enable = (params.get(this.enableParam) || '').split(',').filter(Boolean);
    const disable = (params.get(this.disableParam) || '').split(',').filter(Boolean);

    return { enable, disable };
  }

  /**
   * Check if plugin should be force-enabled/disabled via URL
   * @param {string} name - Plugin name
   * @returns {Object} { override: boolean, enabled: boolean }
   */
  checkUrlOverride(name: string) {
    const { enable, disable } = this.getUrlOverrides();

    // Disable all except enabled
    if (disable.includes('all')) {
      if (enable.includes(name)) {
        return { override: true, enabled: true };
      }
      return { override: true, enabled: false };
    }

    // Explicit enable
    if (enable.includes(name)) {
      return { override: true, enabled: true };
    }

    // Explicit disable
    if (disable.includes(name)) {
      return { override: true, enabled: false };
    }

    return { override: false, enabled: true };
  }

  /**
   * Check consent state
   * @param {Array} allowedStates - Consent states that allow loading (e.g., ['true', 'full'])
   * @returns {boolean}
   */
  checkConsent(allowedStates: string[]) {
    if (!allowedStates || allowedStates.length === 0 || allowedStates.includes('all')) {
      return true;
    }
    return this._consentCheck(allowedStates);
  }

  /**
   * Load a plugin
   * @param {Object} config - Plugin configuration
   * @returns {Promise<Object>} Result with status and performance data
   */
  load(config: any) {
    return new Promise((resolve) => {
      // Use existing registered plugin or create new
      const plugin = this.plugins[config.name] || this.normalizePluginConfig(config);
      this.plugins[plugin.name] = plugin;

      // Check URL override
      const urlOverride = this.checkUrlOverride(plugin.name);
      if (urlOverride.override) {
        if (urlOverride.enabled) {
          // Force enable - bypass all targeting
          plugin.active = true;
          plugin.include = {};
          plugin.exclude = {};
          plugin.domains = ['all'];
          plugin.consentState = ['all'];
          this.publishEvent(plugin.name, 'override.enabled');
        } else {
          // Force disable
          plugin.active = false;
          this.publishEvent(plugin.name, 'override.disabled');
        }
      }

      // Check if active
      if (plugin.active !== true) {
        this.handleInactive(plugin, resolve);
        return;
      }

      // Check property targeting
      if (!matchesProperty(plugin.properties, getProperty())) {
        this.handleIgnore(plugin, 'Property mismatch', resolve);
        return;
      }

      // Check consent - immediate check, no queuing
      if (!this.checkConsent(plugin.consentState)) {
        this.handleInactive(plugin, resolve);
        return;
      }

      // Check domain
      if (!matchesDomain(plugin.domains)) {
        this.handleIgnore(plugin, 'Domain mismatch', resolve);
        return;
      }

      // Apply experiments BEFORE targeting (so they can modify include/exclude)
      if (this.experiments) {
        this.experiments.apply(plugin.name, plugin);
      }

      // Evaluate targeting (after experiments may have modified it)
      const context = this.getContext();
      const targeting = normalizeTargetingConfig({ include: plugin.include, exclude: plugin.exclude });
      const result = evaluateTargeting(
        targeting.include,
        targeting.exclude,
        context,
        this.dimensionConfig
      );

      if (!result.matched) {
        this.handleIgnore(plugin, result.reason, resolve);
        return;
      }

      // All checks passed - load the plugin
      this.executeLoad(plugin, resolve);
    });
  }

  /**
   * Normalize plugin configuration with defaults
   * @param {Object} config - Raw config
   * @returns {Object} Normalized config
   */
  normalizePluginConfig(config: any) {
    return {
      name: config.name,
      id: config.id || config.name,
      url: config.url,
      type: config.type || 'js',
      active: config.active !== false,
      async: config.async !== false,
      location: (config.location || 'body').toLowerCase(),
      timeout: config.timeout || TIMEOUTS.PARTNER,
      domains: config.domains || ['all'],
      properties: config.properties, // undefined = all properties
      consentState: config.consentState || config.consent || ['all'],
      include: config.include || {},
      exclude: config.exclude || {},
      attributes: config.attributes || [],
      preloadFn: config.preloadFn || config.preload || (() => {}),
      onloadFn: config.onloadFn || config.onload || (() => {}),
      onerrorFn: config.onerrorFn || config.onerror || (() => {}),
      timeoutFn: config.timeoutFn || config.ontimeout || (() => {}),
      ignoreFn: config.ignoreFn || config.onignore || (() => {}),
      performance: createPerformanceTracker(),
      eventTitle: `${this.eventPrefix}.${config.name}`,
      tag: null,
      timeoutProc: null,
      status: config.status || 'init'
    };
  }

  /**
   * Register a plugin without loading it
   * Stores plugin config with status 'init' for visibility before consent/loading
   * @param {Object} config - Plugin configuration
   * @returns {Object} Normalized plugin config
   */
  register(config: any) {
    const plugin = this.normalizePluginConfig(config);
    this.plugins[plugin.name] = plugin;
    return plugin;
  }

  /**
   * Execute the actual script load
   * @param {Object} plugin - Normalized plugin config
   * @param {Function} resolve - Promise resolver
   */
  executeLoad(plugin: any, resolve: (value: any) => void) {
    // Set up timeout
    plugin.timeoutProc = setTimeout(() => {
      if (plugin.status === 'requested') {
        plugin.status = 'timeout';
        plugin.performance.status = 'timeout';
        plugin.performance.timeout = timer();
        plugin.performance.latency = calculateLatency(plugin.performance);

        this.updateMetrics(plugin);
        try {
          plugin.timeoutFn();
        } catch (err) {
          console.warn(`[Proton] timeoutFn error for ${plugin.name}:`, err);
        }

        this.publishEvent(plugin.name, 'timeout');
        this.publishEvent(plugin.name, 'complete');

        resolve({
          status: 'timeout',
          name: plugin.name,
          performance: plugin.performance
        });
      }
    }, plugin.timeout);

    // Preload phase
    plugin.performance.preload = timer();
    try {
      plugin.preloadFn();
    } catch (err) {
      if (plugin.timeoutProc) {
        clearTimeout(plugin.timeoutProc);
      }
      plugin.status = 'error';
      plugin.performance.status = 'error';
      plugin.performance.error = timer();
      plugin.performance.latency = calculateLatency(plugin.performance);

      this.updateMetrics(plugin);
      plugin.onerrorFn?.(err);

      this.publishEvent(plugin.name, 'error', { phase: 'preload' });
      this.publishEvent(plugin.name, 'complete');

      resolve({
        status: 'error',
        name: plugin.name,
        error: err,
        performance: plugin.performance
      });
      return;
    }

    // Create script tag
    const script = document.createElement('script');
    script.type = plugin.type === 'module' ? 'module' : 'text/javascript';
    script.id = plugin.id;
    script.async = plugin.async;

    // Apply custom attributes
    for (const [key, value] of plugin.attributes) {
      script.setAttribute(key, value);
    }

    // Handle load success
    script.onload = () => {
      if (plugin.status === 'requested') {
        clearTimeout(plugin.timeoutProc);

        plugin.status = 'loaded';
        plugin.performance.status = 'loaded';
        plugin.performance.received = timer();
        plugin.performance.latency = calculateLatency(plugin.performance);

        this.updateMetrics(plugin);
        try {
          plugin.onloadFn();
        } catch (err) {
          console.warn(`[Proton] onloadFn error for ${plugin.name}:`, err);
        }

        this.publishEvent(plugin.name, 'load');
        this.publishEvent(plugin.name, 'complete');

        resolve({
          status: 'loaded',
          name: plugin.name,
          performance: plugin.performance
        });
      }
    };

    // Handle load error
    script.onerror = (err) => {
      if (plugin.status === 'requested') {
        clearTimeout(plugin.timeoutProc);

        plugin.status = 'error';
        plugin.performance.status = 'error';
        plugin.performance.error = timer();
        plugin.performance.latency = calculateLatency(plugin.performance);

        this.updateMetrics(plugin);
        try {
          plugin.onerrorFn(err);
        } catch (callbackErr) {
          console.warn(`[Proton] onerrorFn error for ${plugin.name}:`, callbackErr);
        }

        this.publishEvent(plugin.name, 'error');
        this.publishEvent(plugin.name, 'complete');

        resolve({
          status: 'error',
          name: plugin.name,
          error: err,
          performance: plugin.performance
        });
      }
    };

    // Store reference and load
    plugin.tag = script;

    if (plugin.url) {
      script.src = plugin.url;
      plugin.status = 'requested';
      plugin.performance.status = 'requested';
      plugin.performance.requested = timer();

      const target = document.getElementsByTagName(plugin.location)[0] || document.body;
      target.appendChild(script);
    } else {
      this.handleIgnore(plugin, 'No URL provided', resolve);
    }
  }

  /**
   * Handle inactive plugin
   */
  handleInactive(plugin: any, resolve: (value: any) => void) {
    plugin.status = 'inactive';
    plugin.performance.status = 'inactive';
    plugin.performance.latency = calculateLatency(plugin.performance);

    this.updateMetrics(plugin);
    this.publishEvent(plugin.name, 'inactive');
    this.publishEvent(plugin.name, 'complete');

    resolve({
      status: 'inactive',
      name: plugin.name,
      performance: plugin.performance
    });
  }

  /**
   * Handle ignored plugin (targeting didn't match)
   */
  handleIgnore(plugin: any, reason: string, resolve: (value: any) => void) {
    plugin.active = false;
    plugin.status = 'ignore';
    plugin.performance.status = 'ignore';
    plugin.performance.latency = calculateLatency(plugin.performance);

    this.updateMetrics(plugin);
    try {
      plugin.ignoreFn(reason);
    } catch (err) {
      console.warn(`[Proton] ignoreFn error for ${plugin.name}:`, err);
    }

    this.publishEvent(plugin.name, 'ignore', { reason });
    this.publishEvent(plugin.name, 'complete');

    resolve({
      status: 'ignore',
      name: plugin.name,
      reason: reason,
      performance: plugin.performance
    });
  }

  /**
   * Update vendor metrics storage
   */
  updateMetrics(plugin: any) {
    this._vendorMetrics[plugin.name] = { ...plugin.performance };
  }

  /**
   * Clear vendor metrics for a specific plugin
   * Used during SPA re-evaluation to remove stale metrics
   * @param {string} name - Plugin name
   */
  clearVendorMetrics(name: string) {
    delete this._vendorMetrics[name];
  }

  /**
   * Publish pub/sub event
   */
  publishEvent(name: string, event: string, data: Record<string, unknown> = {}) {
    const pubsub = (window as any)[CONFIG.pubsubGlobal];
    if (pubsub?.publish) {
      pubsub.publish({
        topic: `${this.eventPrefix}.${name}.${event}`,
        data: { name, event, ...data }
      });
    }
  }

  /**
   * Get vendor metrics (plugin load performance)
   * @returns {Object} Metrics for all plugins/vendors
   */
  getVendorMetrics() {
    return { ...this._vendorMetrics };
  }

  /**
   * Get specific plugin
   * @param {string} name - Plugin name
   * @returns {Object|undefined}
   */
  getPlugin(name: string) {
    return this.plugins[name];
  }
}

// Re-export modules for standalone use
export { PubSub } from './pubsub';
export { timer, createPerformanceTracker } from './timer';
export { evaluateTargeting, matchesDomain, matchesProperty, matchesRule, isExcluded } from './targeting';
export { ExperimentManager } from './optional/experiments';

// Default export
export default Proton;
