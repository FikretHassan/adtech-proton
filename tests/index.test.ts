import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Proton } from '../src/index';

// Mock generated dimensions
vi.mock('../src/generated/dimensions.js', () => ({
  dimensions: {
    geo: () => 'uk',
    viewport: () => 'desktop',
    pagetype: () => 'article'
  },
  dimensionConfig: {
    url: { matchType: 'startsWith' }
  }
}));

// Mock property
vi.mock('../src/property', () => ({
  getProperty: vi.fn(() => 'testsite')
}));

// Mock timer
vi.mock('../src/timer', () => ({
  timer: vi.fn(() => 100),
  createPerformanceTracker: vi.fn(() => ({
    status: null,
    preload: null,
    requested: null,
    received: null,
    error: null,
    timeout: null,
    latency: null
  })),
  calculateLatency: vi.fn(() => 50)
}));

// Mock pubsub
const mockPubsub = {
  publish: vi.fn(),
  subscribe: vi.fn()
};

describe('Proton class', () => {
  let proton: Proton;
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();

    // Store original location
    originalLocation = window.location;

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://example.com/page',
        search: '',
        pathname: '/page'
      },
      writable: true,
      configurable: true
    });

    // Mock PubSub
    (window as any).PubSub = mockPubsub;

    proton = new Proton();
  });

  afterEach(() => {
    // Restore location
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true
    });
  });

  describe('constructor', () => {
    it('initializes with default values', () => {
      expect(proton.eventPrefix).toBe('plugin');
      expect(proton.debugParam).toBe('adsDebugLog');
      expect(proton.enableParam).toBe('pluginEnable');
      expect(proton.disableParam).toBe('pluginDisable');
      expect(proton.logs).toEqual([]);
      expect(proton.cmd).toEqual([]);
      expect(proton.plugins).toEqual({});
      expect(proton._vendorMetrics).toEqual({});
    });

    it('accepts custom config', () => {
      const customProton = new Proton({
        eventPrefix: 'custom',
        debugParam: 'customDebug',
        enableParam: 'customEnable',
        disableParam: 'customDisable',
        dimensions: { custom: () => 'value' },
        dimensionConfig: { custom: { matchType: 'exact' } }
      });

      expect(customProton.eventPrefix).toBe('custom');
      expect(customProton.debugParam).toBe('customDebug');
      expect(customProton.enableParam).toBe('customEnable');
      expect(customProton.disableParam).toBe('customDisable');
      expect(customProton.dimensions.custom).toBeDefined();
      expect(customProton.dimensionConfig.custom).toEqual({ matchType: 'exact' });
    });

    it('uses custom consent check function', () => {
      const consentCheck = vi.fn(() => true);
      const customProton = new Proton({ consentCheck });

      expect(customProton.checkConsent(['allowed'])).toBe(true);
      expect(consentCheck).toHaveBeenCalledWith(['allowed']);
    });

    it('uses custom getConsentState function', () => {
      const getConsentState = vi.fn(() => 'full');
      const customProton = new Proton({ getConsentState });

      expect(customProton.getConsentState()).toBe('full');
    });
  });

  describe('isDebugEnabled', () => {
    it('returns false when debug param not in URL', () => {
      expect(proton.isDebugEnabled()).toBe(false);
    });

    it('returns true when debug param is in URL', () => {
      (window as any).location.href = 'https://example.com?adsDebugLog=true';
      expect(proton.isDebugEnabled()).toBe(true);
    });

    it('returns true when debug param is anywhere in URL', () => {
      (window as any).location.href = 'https://example.com/page?foo=bar&adsDebugLog';
      expect(proton.isDebugEnabled()).toBe(true);
    });

    it('uses custom debug param', () => {
      const customProton = new Proton({ debugParam: 'myDebug' });
      (window as any).location.href = 'https://example.com?myDebug=1';
      expect(customProton.isDebugEnabled()).toBe(true);
    });
  });

  describe('log', () => {
    it('stores log entries', () => {
      proton.log('Test message');
      expect(proton.logs.length).toBe(1);
      expect(proton.logs[0][1]).toBe('Test message');
    });

    it('stores log entries with data', () => {
      proton.log('Message', { key: 'value' });
      expect(proton.logs[0][2]).toEqual({ key: 'value' });
    });

    it('outputs to console when debug is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      (window as any).location.href = 'https://example.com?adsDebugLog';

      proton.log('Debug message');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('outputs to console when forceConsole is true', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      proton.log('Forced message', null, true);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('does not output to console in normal mode', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      proton.log('Normal message');
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('handles empty message', () => {
      proton.log();
      expect(proton.logs[0][1]).toBe('');
    });
  });

  describe('logSearch', () => {
    beforeEach(() => {
      proton.log('First message');
      proton.log('Second message with keyword');
      proton.log('Third message');
      proton.log('Another keyword here');
    });

    it('returns matching log entries', () => {
      const matches = proton.logSearch('keyword', false);
      expect(matches.length).toBe(2);
    });

    it('returns empty array when no matches', () => {
      const matches = proton.logSearch('nonexistent', false);
      expect(matches.length).toBe(0);
    });

    it('outputs matches to console by default', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      proton.logSearch('keyword');
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });

    it('does not output to console when outputToConsole is false', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      proton.logSearch('keyword', false);
      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('processCommandQueue', () => {
    it('executes queued commands', () => {
      const command1 = vi.fn();
      const command2 = vi.fn();

      proton.cmd.push(command1);
      proton.cmd.push(command2);

      proton.processCommandQueue();

      expect(command1).toHaveBeenCalled();
      expect(command2).toHaveBeenCalled();
      expect(proton.cmd.length).toBe(0);
    });

    it('handles command errors gracefully', () => {
      const errorCommand = vi.fn(() => { throw new Error('Command error'); });
      const goodCommand = vi.fn();

      proton.cmd.push(errorCommand);
      proton.cmd.push(goodCommand);

      // Should not throw
      expect(() => proton.processCommandQueue()).not.toThrow();
      expect(goodCommand).toHaveBeenCalled();
    });

    it('ignores non-function items', () => {
      proton.cmd.push('not a function' as any);
      proton.cmd.push(null as any);

      expect(() => proton.processCommandQueue()).not.toThrow();
    });

    it('clears the queue after processing', () => {
      proton.cmd.push(vi.fn());
      proton.processCommandQueue();
      expect(proton.cmd.length).toBe(0);
    });
  });

  describe('setExperiments', () => {
    it('sets the experiment manager', () => {
      const experimentManager = { apply: vi.fn() };
      proton.setExperiments(experimentManager);
      expect(proton.experiments).toBe(experimentManager);
    });
  });

  describe('getContext', () => {
    it('returns dimension values', () => {
      const context = proton.getContext();
      expect(context.geo).toBe('uk');
      expect(context.viewport).toBe('desktop');
      expect(context.pagetype).toBe('article');
    });

    it('handles dimension errors gracefully', () => {
      proton.dimensions.broken = () => { throw new Error('Dimension error'); };

      const context = proton.getContext();
      expect(context.broken).toBeUndefined();
    });

    it('handles non-function dimensions', () => {
      proton.dimensions.static = 'static value' as any;

      const context = proton.getContext();
      expect(context.static).toBe('static value');
    });
  });

  describe('getUrlOverrides', () => {
    it('returns empty arrays when no overrides', () => {
      const overrides = proton.getUrlOverrides();
      expect(overrides.enable).toEqual([]);
      expect(overrides.disable).toEqual([]);
    });

    it('parses enable param', () => {
      (window as any).location.search = '?pluginEnable=plugin1,plugin2';
      const overrides = proton.getUrlOverrides();
      expect(overrides.enable).toEqual(['plugin1', 'plugin2']);
    });

    it('parses disable param', () => {
      (window as any).location.search = '?pluginDisable=plugin3';
      const overrides = proton.getUrlOverrides();
      expect(overrides.disable).toEqual(['plugin3']);
    });

    it('handles both enable and disable', () => {
      (window as any).location.search = '?pluginEnable=a,b&pluginDisable=c';
      const overrides = proton.getUrlOverrides();
      expect(overrides.enable).toEqual(['a', 'b']);
      expect(overrides.disable).toEqual(['c']);
    });
  });

  describe('checkUrlOverride', () => {
    it('returns no override when plugin not in URL', () => {
      const result = proton.checkUrlOverride('myPlugin');
      expect(result.override).toBe(false);
      expect(result.enabled).toBe(true);
    });

    it('returns enabled when plugin in enable list', () => {
      (window as any).location.search = '?pluginEnable=myPlugin';
      const result = proton.checkUrlOverride('myPlugin');
      expect(result.override).toBe(true);
      expect(result.enabled).toBe(true);
    });

    it('returns disabled when plugin in disable list', () => {
      (window as any).location.search = '?pluginDisable=myPlugin';
      const result = proton.checkUrlOverride('myPlugin');
      expect(result.override).toBe(true);
      expect(result.enabled).toBe(false);
    });

    it('disables all except enabled when disable=all', () => {
      (window as any).location.search = '?pluginDisable=all';

      const result1 = proton.checkUrlOverride('anyPlugin');
      expect(result1.override).toBe(true);
      expect(result1.enabled).toBe(false);
    });

    it('allows plugin when disable=all but plugin is enabled', () => {
      (window as any).location.search = '?pluginDisable=all&pluginEnable=special';

      const result = proton.checkUrlOverride('special');
      expect(result.override).toBe(true);
      expect(result.enabled).toBe(true);
    });
  });

  describe('checkConsent', () => {
    it('returns true when allowedStates is empty', () => {
      expect(proton.checkConsent([])).toBe(true);
    });

    it('returns true when allowedStates includes "all"', () => {
      expect(proton.checkConsent(['all'])).toBe(true);
    });

    it('returns true when allowedStates is null', () => {
      expect(proton.checkConsent(null as any)).toBe(true);
    });

    it('calls consent check function', () => {
      const consentCheck = vi.fn(() => false);
      const customProton = new Proton({ consentCheck });

      expect(customProton.checkConsent(['required'])).toBe(false);
      expect(consentCheck).toHaveBeenCalledWith(['required']);
    });
  });

  describe('normalizePluginConfig', () => {
    it('normalizes config with defaults', () => {
      const config = { name: 'test', url: 'https://test.com/script.js' };
      const normalized = proton.normalizePluginConfig(config);

      expect(normalized.name).toBe('test');
      expect(normalized.id).toBe('test');
      expect(normalized.url).toBe('https://test.com/script.js');
      expect(normalized.type).toBe('js');
      expect(normalized.active).toBe(true);
      expect(normalized.async).toBe(true);
      expect(normalized.location).toBe('body');
      expect(normalized.domains).toEqual(['all']);
      expect(normalized.consentState).toEqual(['all']);
      expect(normalized.include).toEqual({});
      expect(normalized.exclude).toEqual({});
      expect(normalized.attributes).toEqual([]);
      expect(normalized.status).toBe('init');
    });

    it('uses provided values over defaults', () => {
      const config = {
        name: 'test',
        id: 'custom-id',
        type: 'module',
        active: false,
        async: false,
        location: 'HEAD',
        timeout: 5000,
        domains: ['example.com'],
        consentState: ['full'],
        include: { geo: ['uk'] },
        exclude: { viewport: ['mobile'] },
        attributes: [['data-key', 'value']],
        status: 'ready'
      };

      const normalized = proton.normalizePluginConfig(config);

      expect(normalized.id).toBe('custom-id');
      expect(normalized.type).toBe('module');
      expect(normalized.active).toBe(false);
      expect(normalized.async).toBe(false);
      expect(normalized.location).toBe('head');
      expect(normalized.timeout).toBe(5000);
      expect(normalized.domains).toEqual(['example.com']);
      expect(normalized.consentState).toEqual(['full']);
      expect(normalized.include).toEqual({ geo: ['uk'] });
      expect(normalized.exclude).toEqual({ viewport: ['mobile'] });
      expect(normalized.attributes).toEqual([['data-key', 'value']]);
      expect(normalized.status).toBe('ready');
    });

    it('handles legacy consent field', () => {
      const config = { name: 'test', consent: ['basic'] };
      const normalized = proton.normalizePluginConfig(config);
      expect(normalized.consentState).toEqual(['basic']);
    });

    it('handles legacy function field names', () => {
      const preload = vi.fn();
      const onload = vi.fn();
      const onerror = vi.fn();
      const ontimeout = vi.fn();
      const onignore = vi.fn();

      const config = {
        name: 'test',
        preload,
        onload,
        onerror,
        ontimeout,
        onignore
      };

      const normalized = proton.normalizePluginConfig(config);
      expect(normalized.preloadFn).toBe(preload);
      expect(normalized.onloadFn).toBe(onload);
      expect(normalized.onerrorFn).toBe(onerror);
      expect(normalized.timeoutFn).toBe(ontimeout);
      expect(normalized.ignoreFn).toBe(onignore);
    });
  });

  describe('register', () => {
    it('registers plugin without loading', () => {
      const config = { name: 'myPlugin', url: 'https://test.com/script.js' };
      const result = proton.register(config);

      expect(result.name).toBe('myPlugin');
      expect(proton.plugins.myPlugin).toBe(result);
      expect(result.status).toBe('init');
    });
  });

  describe('publishEvent', () => {
    it('publishes event via PubSub', () => {
      proton.publishEvent('myPlugin', 'load');

      expect(mockPubsub.publish).toHaveBeenCalledWith({
        topic: 'plugin.myPlugin.load',
        data: { name: 'myPlugin', event: 'load' }
      });
    });

    it('includes extra data in event', () => {
      proton.publishEvent('myPlugin', 'error', { code: 500 });

      expect(mockPubsub.publish).toHaveBeenCalledWith({
        topic: 'plugin.myPlugin.error',
        data: { name: 'myPlugin', event: 'error', code: 500 }
      });
    });

    it('uses custom event prefix', () => {
      const customProton = new Proton({ eventPrefix: 'vendor' });
      (window as any).PubSub = mockPubsub;

      customProton.publishEvent('test', 'ready');

      expect(mockPubsub.publish).toHaveBeenCalledWith({
        topic: 'vendor.test.ready',
        data: expect.any(Object)
      });
    });

    it('handles missing PubSub gracefully', () => {
      (window as any).PubSub = undefined;
      expect(() => proton.publishEvent('test', 'load')).not.toThrow();
    });
  });

  describe('getVendorMetrics', () => {
    it('returns copy of vendor metrics', () => {
      proton._vendorMetrics = { plugin1: { latency: 100 } };

      const metrics = proton.getVendorMetrics();
      expect(metrics).toEqual({ plugin1: { latency: 100 } });

      // Verify it's a copy
      metrics.plugin2 = { latency: 200 };
      expect(proton._vendorMetrics.plugin2).toBeUndefined();
    });
  });

  describe('getPlugin', () => {
    it('returns registered plugin', () => {
      proton.plugins.myPlugin = { name: 'myPlugin', status: 'loaded' };
      expect(proton.getPlugin('myPlugin')).toEqual({ name: 'myPlugin', status: 'loaded' });
    });

    it('returns undefined for unregistered plugin', () => {
      expect(proton.getPlugin('unknown')).toBeUndefined();
    });
  });

  describe('handleInactive', () => {
    it('sets plugin status to inactive', () => {
      const plugin = proton.normalizePluginConfig({ name: 'test' });
      const resolve = vi.fn();

      proton.handleInactive(plugin, resolve);

      expect(plugin.status).toBe('inactive');
      expect(plugin.performance.status).toBe('inactive');
    });

    it('publishes inactive and complete events', () => {
      const plugin = proton.normalizePluginConfig({ name: 'test' });
      const resolve = vi.fn();

      proton.handleInactive(plugin, resolve);

      expect(mockPubsub.publish).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'plugin.test.inactive' })
      );
      expect(mockPubsub.publish).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'plugin.test.complete' })
      );
    });

    it('resolves with inactive status', () => {
      const plugin = proton.normalizePluginConfig({ name: 'test' });
      const resolve = vi.fn();

      proton.handleInactive(plugin, resolve);

      expect(resolve).toHaveBeenCalledWith({
        status: 'inactive',
        name: 'test',
        performance: expect.any(Object)
      });
    });
  });

  describe('handleIgnore', () => {
    it('sets plugin status to ignore', () => {
      const plugin = proton.normalizePluginConfig({ name: 'test' });
      const resolve = vi.fn();

      proton.handleIgnore(plugin, 'Domain mismatch', resolve);

      expect(plugin.status).toBe('ignore');
      expect(plugin.active).toBe(false);
      expect(plugin.performance.status).toBe('ignore');
    });

    it('calls ignoreFn with reason', () => {
      const ignoreFn = vi.fn();
      const plugin = proton.normalizePluginConfig({ name: 'test', onignore: ignoreFn });
      const resolve = vi.fn();

      proton.handleIgnore(plugin, 'Test reason', resolve);

      expect(ignoreFn).toHaveBeenCalledWith('Test reason');
    });

    it('publishes ignore event with reason', () => {
      const plugin = proton.normalizePluginConfig({ name: 'test' });
      const resolve = vi.fn();

      proton.handleIgnore(plugin, 'Geo blocked', resolve);

      expect(mockPubsub.publish).toHaveBeenCalledWith({
        topic: 'plugin.test.ignore',
        data: { name: 'test', event: 'ignore', reason: 'Geo blocked' }
      });
    });

    it('resolves with ignore status and reason', () => {
      const plugin = proton.normalizePluginConfig({ name: 'test' });
      const resolve = vi.fn();

      proton.handleIgnore(plugin, 'Not targeted', resolve);

      expect(resolve).toHaveBeenCalledWith({
        status: 'ignore',
        name: 'test',
        reason: 'Not targeted',
        performance: expect.any(Object)
      });
    });
  });

  describe('updateMetrics', () => {
    it('stores plugin performance in vendor metrics', () => {
      const plugin = {
        name: 'test',
        performance: { status: 'loaded', latency: 150 }
      };

      proton.updateMetrics(plugin);

      expect(proton._vendorMetrics.test).toEqual({ status: 'loaded', latency: 150 });
    });

    it('creates a copy of performance', () => {
      const plugin = {
        name: 'test',
        performance: { status: 'loaded' }
      };

      proton.updateMetrics(plugin);
      plugin.performance.status = 'error';

      expect(proton._vendorMetrics.test.status).toBe('loaded');
    });
  });

  describe('load', () => {
    it('handles inactive plugin', async () => {
      const result = await proton.load({ name: 'test', active: false });
      expect(result.status).toBe('inactive');
    });

    it('handles plugin with no URL', async () => {
      const result = await proton.load({ name: 'test', active: true });
      expect(result.status).toBe('ignore');
      expect(result.reason).toBe('No URL provided');
    });

    it('applies URL override to enable plugin', async () => {
      (window as any).location.search = '?pluginEnable=test';

      await proton.load({
        name: 'test',
        active: false,
        url: 'https://test.com/script.js'
      });

      // Plugin should be enabled via URL override
      const plugin = proton.plugins.test;
      expect(plugin.include).toEqual({});
      expect(plugin.exclude).toEqual({});
      expect(plugin.domains).toEqual(['all']);
    });

    it('applies URL override to disable plugin', async () => {
      (window as any).location.search = '?pluginDisable=test';

      const result = await proton.load({
        name: 'test',
        active: true,
        url: 'https://test.com/script.js'
      });

      expect(result.status).toBe('inactive');
    });

    it('applies experiments before targeting evaluation', async () => {
      const experimentManager = {
        apply: vi.fn((name, plugin) => {
          plugin.include = { geo: ['uk'] };
        })
      };
      proton.setExperiments(experimentManager);

      await proton.load({
        name: 'test',
        active: true,
        url: 'https://test.com/script.js'
      });

      expect(experimentManager.apply).toHaveBeenCalled();
    });
  });
});
