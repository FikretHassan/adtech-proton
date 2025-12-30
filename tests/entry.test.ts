import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const orchestratorInit = vi.fn();
const orchestratorGetDependency = vi.fn(() => null);

const mockEnvironment = {
  init: vi.fn(),
  isAdsDisabled: vi.fn(() => false),
  getProperty: vi.fn(() => 'default'),
  getEnvironment: vi.fn(() => 'prod')
};

const mockHooks = {
  init: vi.fn(),
  executeSync: vi.fn(),
  execute: vi.fn()
};

const mockAdTargeting = {
  init: vi.fn(),
  buildPageTargeting: vi.fn(() => ({})),
  registerInternal: vi.fn()
};

const mockSlots = {
  init: vi.fn(),
  processSlots: vi.fn(() => ({ processed: 0, immediate: 0, lazy: 0 })),
  getAllSlotData: vi.fn(() => ({})),
  getUnobservedSlots: vi.fn(() => []),
  injectOOPContainers: vi.fn(),
  extractAdType: vi.fn(() => 'oop'),
  buildAdUnitPath: vi.fn(() => '/123'),
  markObserved: vi.fn(),
  isOutOfPage: vi.fn(() => false),
  defineGPTSlot: vi.fn(),
  enableServices: vi.fn(),
  requestAd: vi.fn()
};

const mockPubsubHasPublished = vi.fn(() => false);

vi.mock('../src/index', () => {
  class MockProton {
    cmd: Array<() => void> = [];
    dimensionConfig: Record<string, any> = {};
    plugins: Record<string, any> = {};
    _vendorMetrics: Record<string, any> = {};
    log = vi.fn();
    registerInternal = vi.fn();
    getContext = vi.fn(() => ({}));
    setExperiments = vi.fn();
    register = vi.fn((cfg: any) => { this.plugins[cfg.name] = cfg; });
    load = vi.fn(async (cfg: any) => ({ name: cfg.name, status: 'loaded' }));
    getPlugin = vi.fn((name: string) => this.plugins[name]);
    processCommandQueue = vi.fn();
    getVendorMetrics = vi.fn(() => this._vendorMetrics);
    isDebugEnabled = vi.fn(() => false);
  }

  class MockPubSub {
    topics: any[] = [];
    publishedTopics: string[] = [];
    publish = vi.fn(({ topic }: any) => { this.publishedTopics.push(topic); return true; });
    subscribe = vi.fn(({ topic, func, runIfAlreadyPublished }: any) => {
      this.topics.push(topic);
      if (runIfAlreadyPublished && mockPubsubHasPublished(topic)) {
        func();
      }
      return true;
    });
    unsubscribe = vi.fn();
    hasPublished = vi.fn((topic: string) => mockPubsubHasPublished(topic));
  }

  return { __esModule: true, default: MockProton, PubSub: MockPubSub };
});

vi.mock('../config/loader.js', () => ({
  __esModule: true,
  default: {
    globalName: 'proton',
    debugParam: 'adDebugLogs',
    enableParam: 'adEnablePlugin',
    disableParam: 'adDisablePlugin',
    readyTopic: 'cmp.ready',
    pubsubGlobal: 'PubSub',
    experimentalPubsub: null,
    ads: {
      autoRequest: false,
      enableLazy: true,
      enableRefresh: true,
      sraBatching: { enabled: false }
    },
    optionalModules: {
      sequencing: true,
      injection: { enabled: true, charMode: true, blockMode: true },
      customSlots: true,
      experiences: true,
      refresh: true,
      experiments: true,
      customFunctions: true,
      wrappers: true,
      sraBatching: true
    }
  }
}));

vi.mock('../src/environment', () => ({ __esModule: true, default: mockEnvironment }));
vi.mock('../src/sizemapping', () => ({ __esModule: true, default: { init: vi.fn(), getBreakpoint: vi.fn(() => 'l'), getSizesForSlot: vi.fn(() => []) } }));
vi.mock('../src/adTargeting', () => ({ __esModule: true, default: mockAdTargeting, registerInternal: mockAdTargeting.registerInternal }));
vi.mock('../src/gptEvents', () => ({ __esModule: true, default: { init: vi.fn() } }));
vi.mock('../src/optional/wrapperAuctions', () => ({ __esModule: true, default: { init: vi.fn(), updateContext: vi.fn() } }));
vi.mock('../src/functions', () => ({ __esModule: true, default: { init: vi.fn() } }));
vi.mock('../src/optional/customSlots', () => ({ __esModule: true, default: { init: vi.fn(), inject: vi.fn(() => []), processInjectedSlots: vi.fn() } }));
vi.mock('../src/optional/injection', () => ({ __esModule: true, default: { init: vi.fn(), injectAds: vi.fn(() => ({ injected: 0, slots: [] })), processInjectedSlots: vi.fn() } }));
vi.mock('../src/optional/adRefresh', () => ({ __esModule: true, default: { init: vi.fn(), start: vi.fn(), pause: vi.fn() } }));
vi.mock('../src/optional/sequencing', () => ({ __esModule: true, default: { init: vi.fn(), isEnabled: vi.fn(() => false), decide: vi.fn(() => false), getPrioritySlotTypes: vi.fn(() => []), markPriorityRequested: vi.fn(), getState: vi.fn(() => ({})), getReason: vi.fn(() => '') } }));
vi.mock('../src/optional/experiences', () => ({ __esModule: true, default: { init: vi.fn(), execute: vi.fn(() => []) } }));
vi.mock('../src/optional/experiments', () => ({
  __esModule: true,
  ExperimentManager: class {
    testgroup = '0';
    registered: any[] = [];
    constructor(public args?: any) {}
    register = vi.fn((exp: any) => { this.registered.push(exp); });
    getStatus = vi.fn(() => ({ active: this.registered.length }));
  }
}));
vi.mock('../src/preRequestHooks', () => ({ __esModule: true, default: { init: vi.fn(), registerHook: vi.fn() } }));
vi.mock('../src/metrics', () => ({ __esModule: true, default: { init: vi.fn(), getAdStack: vi.fn(() => []), getEvents: vi.fn(() => []), getVendors: vi.fn(() => []) } }));
vi.mock('../src/hooks', () => ({ __esModule: true, default: mockHooks }));
vi.mock('../src/orchestrator', () => ({ __esModule: true, default: { init: orchestratorInit, getDependency: orchestratorGetDependency } }));
vi.mock('../src/wrapperAuctions', () => ({ __esModule: true, default: { init: vi.fn(), updateContext: vi.fn() } }));
vi.mock('../src/slots', () => ({ __esModule: true, default: mockSlots }));
vi.mock('../src/propertyConfig', () => ({ __esModule: true, resolveConfig: vi.fn(() => ({})) }));
vi.mock('../src/property', () => ({ __esModule: true, getProperty: vi.fn(() => 'default') }));
vi.mock('../config/partners/index.js', () => ({ __esModule: true, default: { gpt: { name: 'gpt', active: true }, header: { name: 'header', active: true } } }));
vi.mock('../config/experiments.js', () => ({ __esModule: true, default: [{ id: 'exp-1', active: true, testRange: [0, 100] }] }));
vi.mock('../config/customFunctions/index.js', () => ({ __esModule: true, default: {} }));
vi.mock('../config/consent.js', () => ({ __esModule: true, default: { getState: vi.fn(() => 'true') } }));

describe('entry (auto init)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (window as any).proton;
    delete (window as any).PubSub;
    mockEnvironment.isAdsDisabled.mockReturnValue(false);
    mockPubsubHasPublished.mockReturnValue(false);
  });

  afterEach(() => {
    delete (window as any).proton;
    delete (window as any).PubSub;
  });

  it('exposes a disabled stub when ads are disabled', async () => {
    mockEnvironment.isAdsDisabled.mockReturnValue(true);
    const entry = await import('../src/entry');

    expect((window as any).proton).toBeDefined();
    expect((window as any).proton.disabled).toBe(true);
    expect(entry.default.disabled).toBe(true);
    expect(orchestratorInit).not.toHaveBeenCalled();
  });

  it('starts plugin loading immediately when ready topic already published', async () => {
    mockPubsubHasPublished.mockReturnValue(true);
    const entry = await import('../src/entry');

    expect(entry.default.disabled).toBeUndefined();
    expect(orchestratorInit).toHaveBeenCalledTimes(1);
    const initArgs = orchestratorInit.mock.calls[0][0];
    expect(typeof initArgs.onAllPartnersReady).toBe('function');
    // Ensure plugins were registered on the loader
    expect(entry.default.register).toBeDefined();
  });
});
