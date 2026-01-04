import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  register,
  unregister,
  execute,
  executeSync,
  getState,
  getHooks,
  getLifecyclePoints,
  clear,
  reset,
  setDebug,
  getExecutionHistory,
  clearExecutionHistory
} from '../src/hooks';

// Mock the loader
const mockLoader = {
  log: vi.fn()
};

// Mock targeting module
vi.mock('../src/targeting', () => ({
  matchesProperty: vi.fn((properties, currentProperty) => {
    if (!properties) return true;
    if (Array.isArray(properties)) return properties.includes(currentProperty);
    return properties === currentProperty;
  })
}));

// Mock property module
vi.mock('../src/property', () => ({
  getProperty: vi.fn(() => 'testsite')
}));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;
  reset();
});

describe('hooks', () => {
  describe('init', () => {
    it('initializes the module', () => {
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('returns state if already initialized', () => {
      init();
      const state = init();
      expect(state.initialized).toBe(true);
    });

    it('initializes with debug mode from URL', () => {
      const originalHref = window.location.href;
      Object.defineProperty(window, 'location', {
        value: { href: 'http://localhost?hooksDebug=1' },
        writable: true
      });

      reset();
      const state = init();
      expect(state.initialized).toBe(true);

      Object.defineProperty(window, 'location', {
        value: { href: originalHref },
        writable: true
      });
    });

    it('accepts hooks config on init', () => {
      const hookFn = vi.fn();
      init({
        hooks: {
          'loader.beforeInit': [
            { name: 'testHook', fn: hookFn }
          ]
        }
      });

      const hooks = getHooks('loader.beforeInit');
      expect(hooks.length).toBe(1);
      expect(hooks[0].name).toBe('testHook');
    });

    it('accepts multiple hooks per lifecycle point', () => {
      init({
        hooks: {
          'loader.afterInit': [
            { name: 'hook1', fn: vi.fn() },
            { name: 'hook2', fn: vi.fn() }
          ]
        }
      });

      const hooks = getHooks('loader.afterInit');
      expect(hooks.length).toBe(2);
    });
  });

  describe('register', () => {
    beforeEach(() => {
      init();
    });

    it('registers a hook at a lifecycle point', () => {
      const result = register('loader.beforeInit', {
        name: 'myHook',
        fn: vi.fn()
      });

      expect(result).toBe(true);
      const hooks = getHooks('loader.beforeInit');
      expect(hooks.length).toBe(1);
    });

    it('returns false for unknown lifecycle point', () => {
      const result = register('unknown.point', {
        name: 'myHook',
        fn: vi.fn()
      });

      expect(result).toBe(false);
    });

    it('returns false for invalid hook config without name', () => {
      const result = register('loader.beforeInit', {
        fn: vi.fn()
      });

      expect(result).toBe(false);
    });

    it('returns false for invalid hook config without fn', () => {
      const result = register('loader.beforeInit', {
        name: 'myHook'
      });

      expect(result).toBe(false);
    });

    it('replaces duplicate hook names', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      register('loader.beforeInit', { name: 'duplicateHook', fn: fn1 });
      register('loader.beforeInit', { name: 'duplicateHook', fn: fn2 });

      const hooks = getHooks('loader.beforeInit');
      expect(hooks.length).toBe(1);
      expect(hooks[0].fn).toBe(fn2);
    });

    it('sorts hooks by priority', () => {
      register('loader.beforeInit', { name: 'low', fn: vi.fn(), priority: 10 });
      register('loader.beforeInit', { name: 'high', fn: vi.fn(), priority: 1 });
      register('loader.beforeInit', { name: 'medium', fn: vi.fn(), priority: 5 });

      const hooks = getHooks('loader.beforeInit');
      expect(hooks[0].name).toBe('high');
      expect(hooks[1].name).toBe('medium');
      expect(hooks[2].name).toBe('low');
    });

    it('uses default priority when not specified', () => {
      register('loader.beforeInit', { name: 'defaultPriority', fn: vi.fn() });

      const hooks = getHooks('loader.beforeInit');
      expect(hooks[0].priority).toBe(8); // PRIORITIES.DEFAULT
    });

    it('accepts async flag', () => {
      register('loader.beforeInit', { name: 'asyncHook', fn: vi.fn(), async: true });

      const hooks = getHooks('loader.beforeInit');
      expect(hooks[0].async).toBe(true);
    });

    it('accepts once flag', () => {
      register('loader.beforeInit', { name: 'onceHook', fn: vi.fn(), once: true });

      const hooks = getHooks('loader.beforeInit');
      expect(hooks[0].once).toBe(true);
    });

    it('accepts properties filter', () => {
      register('loader.beforeInit', {
        name: 'propertyHook',
        fn: vi.fn(),
        properties: ['site1', 'site2']
      });

      const hooks = getHooks('loader.beforeInit');
      expect(hooks[0].properties).toEqual(['site1', 'site2']);
    });
  });

  describe('unregister', () => {
    beforeEach(() => {
      init();
    });

    it('removes a registered hook', () => {
      register('loader.beforeInit', { name: 'toRemove', fn: vi.fn() });
      expect(getHooks('loader.beforeInit').length).toBe(1);

      const result = unregister('loader.beforeInit', 'toRemove');
      expect(result).toBe(true);
      expect(getHooks('loader.beforeInit').length).toBe(0);
    });

    it('returns false for non-existent hook', () => {
      const result = unregister('loader.beforeInit', 'nonexistent');
      expect(result).toBe(false);
    });

    it('returns false for non-existent lifecycle point', () => {
      const result = unregister('unknown.point', 'anyHook');
      expect(result).toBe(false);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      init();
    });

    it('executes hooks for a lifecycle point', async () => {
      const fn = vi.fn();
      register('loader.beforeInit', { name: 'execTest', fn });

      await execute('loader.beforeInit');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('passes arguments to hook functions', async () => {
      const fn = vi.fn();
      register('loader.afterInit', { name: 'argsTest', fn });

      await execute('loader.afterInit', 'arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('returns results from hooks', async () => {
      register('loader.beforeInit', {
        name: 'resultTest',
        fn: () => 'myResult'
      });

      const result = await execute('loader.beforeInit');

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].result).toBe('myResult');
    });

    it('handles async hooks', async () => {
      const asyncFn = vi.fn().mockResolvedValue('asyncResult');
      register('loader.beforeInit', {
        name: 'asyncTest',
        fn: asyncFn,
        async: true
      });

      const result = await execute('loader.beforeInit');

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].result).toBe('asyncResult');
    });

    it('handles hook errors gracefully', async () => {
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('Hook error');
      });
      register('loader.beforeInit', { name: 'errorTest', fn: errorFn });

      const result = await execute('loader.beforeInit');

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBeInstanceOf(Error);
    });

    it('removes one-time hooks after execution', async () => {
      const onceFn = vi.fn();
      register('loader.beforeInit', { name: 'onceTest', fn: onceFn, once: true });

      await execute('loader.beforeInit');
      expect(getHooks('loader.beforeInit').length).toBe(0);
    });

    it('returns empty results for lifecycle point with no hooks', async () => {
      const result = await execute('loader.beforeInit');

      expect(result.point).toBe('loader.beforeInit');
      expect(result.hooks).toEqual([]);
      expect(result.results).toEqual([]);
    });

    it('executes hooks in priority order', async () => {
      const order: string[] = [];
      register('loader.beforeInit', {
        name: 'last',
        fn: () => order.push('last'),
        priority: 10
      });
      register('loader.beforeInit', {
        name: 'first',
        fn: () => order.push('first'),
        priority: 1
      });

      await execute('loader.beforeInit');

      expect(order).toEqual(['first', 'last']);
    });
  });

  describe('executeSync', () => {
    beforeEach(() => {
      init();
    });

    it('executes hooks synchronously', () => {
      const fn = vi.fn();
      register('loader.beforeInit', { name: 'syncTest', fn });

      const result = executeSync('loader.beforeInit');

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result.results[0].success).toBe(true);
    });

    it('passes arguments to hook functions', () => {
      const fn = vi.fn();
      register('loader.afterInit', { name: 'syncArgsTest', fn });

      executeSync('loader.afterInit', 'arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('handles errors gracefully', () => {
      const errorFn = vi.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });
      register('loader.beforeInit', { name: 'syncErrorTest', fn: errorFn });

      const result = executeSync('loader.beforeInit');

      expect(result.results[0].success).toBe(false);
    });

    it('removes one-time hooks after execution', () => {
      register('loader.beforeInit', {
        name: 'onceSync',
        fn: vi.fn(),
        once: true
      });

      executeSync('loader.beforeInit');

      expect(getHooks('loader.beforeInit').length).toBe(0);
    });

    it('returns empty results for lifecycle point with no hooks', () => {
      const result = executeSync('loader.beforeInit');

      expect(result.point).toBe('loader.beforeInit');
      expect(result.hooks).toEqual([]);
    });
  });

  describe('getState', () => {
    it('returns initialized false before init', () => {
      const state = getState();
      expect(state.initialized).toBe(false);
    });

    it('returns initialized true after init', () => {
      init();
      const state = getState();
      expect(state.initialized).toBe(true);
    });

    it('includes registered hooks in state', () => {
      init();
      register('loader.beforeInit', { name: 'stateTest', fn: vi.fn() });

      const state = getState();
      expect(state.registeredHooks['loader.beforeInit']).toBeDefined();
      expect(state.registeredHooks['loader.beforeInit'][0].name).toBe('stateTest');
    });
  });

  describe('getHooks', () => {
    beforeEach(() => {
      init();
    });

    it('returns empty array for lifecycle point with no hooks', () => {
      const hooks = getHooks('loader.beforeInit');
      expect(hooks).toEqual([]);
    });

    it('returns copy of hooks array', () => {
      register('loader.beforeInit', { name: 'test', fn: vi.fn() });

      const hooks1 = getHooks('loader.beforeInit');
      const hooks2 = getHooks('loader.beforeInit');

      expect(hooks1).not.toBe(hooks2);
      expect(hooks1).toEqual(hooks2);
    });

    it('returns empty array for unknown lifecycle point', () => {
      const hooks = getHooks('unknown.point');
      expect(hooks).toEqual([]);
    });
  });

  describe('getLifecyclePoints', () => {
    it('returns all lifecycle points', () => {
      const points = getLifecyclePoints();

      expect(points).toHaveProperty('loader.beforeInit');
      expect(points).toHaveProperty('loader.afterInit');
      expect(points).toHaveProperty('slot.beforeDefine');
      expect(points).toHaveProperty('slot.afterRender');
    });

    it('returns copy of lifecycle points', () => {
      const points1 = getLifecyclePoints();
      const points2 = getLifecyclePoints();

      expect(points1).not.toBe(points2);
    });

    it('includes descriptions for each point', () => {
      const points = getLifecyclePoints();

      expect(points['loader.beforeInit'].description).toBeDefined();
      expect(points['loader.beforeInit'].phase).toBe('init');
    });
  });

  describe('clear', () => {
    beforeEach(() => {
      init();
    });

    it('removes all registered hooks', () => {
      register('loader.beforeInit', { name: 'hook1', fn: vi.fn() });
      register('loader.afterInit', { name: 'hook2', fn: vi.fn() });

      clear();

      expect(getHooks('loader.beforeInit').length).toBe(0);
      expect(getHooks('loader.afterInit').length).toBe(0);
    });

    it('keeps module initialized', () => {
      clear();
      expect(getState().initialized).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all hooks and resets state', () => {
      init();
      register('loader.beforeInit', { name: 'test', fn: vi.fn() });

      reset();

      expect(getState().initialized).toBe(false);
    });
  });

  describe('setDebug', () => {
    beforeEach(() => {
      init();
    });

    it('enables debug mode', () => {
      setDebug(true);
      const state = getState();
      expect(state.debugMode).toBe(true);
    });

    it('disables debug mode', () => {
      setDebug(true);
      setDebug(false);
      const state = getState();
      expect(state.debugMode).toBe(false);
    });
  });

  describe('execution history', () => {
    beforeEach(() => {
      init();
    });

    it('records executed hooks', async () => {
      register('loader.beforeInit', { name: 'executedHook', fn: vi.fn() });

      await execute('loader.beforeInit');

      const history = getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].hook).toBe('executedHook');
      expect(history[0].status).toBe('executed');
      expect(history[0].point).toBe('loader.beforeInit');
      expect(history[0].timestamp).toBeDefined();
    });

    it('records executed hooks in executeSync', () => {
      register('loader.beforeInit', { name: 'syncExecutedHook', fn: vi.fn() });

      executeSync('loader.beforeInit');

      const history = getExecutionHistory();
      expect(history.length).toBe(1);
      expect(history[0].hook).toBe('syncExecutedHook');
      expect(history[0].status).toBe('executed');
    });

    it('records errors with reason', async () => {
      register('loader.beforeInit', {
        name: 'errorHook',
        fn: () => { throw new Error('Test error'); }
      });

      await execute('loader.beforeInit');

      const history = getExecutionHistory();
      expect(history[0].status).toBe('error');
      expect(history[0].reason).toContain('Test error');
    });

    it('filters by hook name', async () => {
      register('loader.beforeInit', { name: 'hook1', fn: vi.fn() });
      register('loader.beforeInit', { name: 'hook2', fn: vi.fn() });

      await execute('loader.beforeInit');

      const filtered = getExecutionHistory('hook1');
      expect(filtered.length).toBe(1);
      expect(filtered[0].hook).toBe('hook1');
    });

    it('returns copy of history array', () => {
      const history1 = getExecutionHistory();
      const history2 = getExecutionHistory();
      expect(history1).not.toBe(history2);
    });

    it('clears execution history', async () => {
      register('loader.beforeInit', { name: 'toBeCleared', fn: vi.fn() });
      await execute('loader.beforeInit');

      expect(getExecutionHistory().length).toBe(1);

      clearExecutionHistory();

      expect(getExecutionHistory().length).toBe(0);
    });

    it('reset() clears execution history', async () => {
      register('loader.beforeInit', { name: 'resetTest', fn: vi.fn() });
      await execute('loader.beforeInit');

      expect(getExecutionHistory().length).toBe(1);

      reset();

      expect(getExecutionHistory().length).toBe(0);
    });

    it('tracks multiple executions across lifecycle points', async () => {
      register('loader.beforeInit', { name: 'initHook', fn: vi.fn() });
      register('loader.afterInit', { name: 'afterHook', fn: vi.fn() });

      await execute('loader.beforeInit');
      await execute('loader.afterInit', ['modules']);

      const history = getExecutionHistory();
      expect(history.length).toBe(2);
      expect(history[0].point).toBe('loader.beforeInit');
      expect(history[1].point).toBe('loader.afterInit');
    });
  });

  describe('lifecycle points', () => {
    beforeEach(() => {
      init();
    });

    it('supports slot.beforeDefine hook', async () => {
      const fn = vi.fn();
      register('slot.beforeDefine', { name: 'slotHook', fn });

      await execute('slot.beforeDefine', 'slotId', 'mpu', [[300, 250]]);

      expect(fn).toHaveBeenCalledWith('slotId', 'mpu', [[300, 250]]);
    });

    it('supports ads.beforeRequest hook', async () => {
      const fn = vi.fn();
      register('ads.beforeRequest', { name: 'adsHook', fn });

      await execute('ads.beforeRequest', { site: 'test', zone: 'home' });

      expect(fn).toHaveBeenCalledWith({ site: 'test', zone: 'home' });
    });

    it('supports injection hooks', async () => {
      const beforeFn = vi.fn();
      const afterFn = vi.fn();

      register('injection.beforeInject', { name: 'before', fn: beforeFn });
      register('injection.afterInject', { name: 'after', fn: afterFn });

      await execute('injection.beforeInject', { pagetype: 'article' });
      await execute('injection.afterInject', ['slot1', 'slot2']);

      expect(beforeFn).toHaveBeenCalledWith({ pagetype: 'article' });
      expect(afterFn).toHaveBeenCalledWith(['slot1', 'slot2']);
    });
  });
});
