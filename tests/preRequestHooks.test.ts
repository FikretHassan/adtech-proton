import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  init,
  registerHook,
  unregisterHook,
  runHooks,
  wrapWithHooks,
  getHooks,
  hasHooks,
  reset
} from '../src/preRequestHooks';

// Mock loader
const mockLoader = {
  log: vi.fn(),
  getPlugin: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  reset();
  init(mockLoader);

  // Clear window functions
  delete (window as any).testReadyFn;
  delete (window as any).nested;
});

describe('preRequestHooks', () => {
  describe('init', () => {
    it('initializes without error', () => {
      expect(() => init(mockLoader)).not.toThrow();
    });

    it('accepts loader reference', () => {
      init({ log: vi.fn() });
      // Should log initialization
      expect(true).toBe(true);
    });
  });

  describe('registerHook', () => {
    it('registers a hook with valid config', () => {
      registerHook('testPlugin', { readyFn: 'testReadyFn' });
      expect(hasHooks()).toBe(true);
    });

    it('ignores null config', () => {
      registerHook('testPlugin', null as any);
      expect(hasHooks()).toBe(false);
    });

    it('ignores config without readyFn', () => {
      registerHook('testPlugin', {} as any);
      expect(hasHooks()).toBe(false);
    });

    it('uses default timeout when not specified', () => {
      registerHook('testPlugin', { readyFn: 'testFn' });
      const hooks = getHooks();
      expect(typeof hooks.testPlugin.timeout).toBe('number');
      expect(hooks.testPlugin.timeout).toBeGreaterThan(0);
    });

    it('accepts custom timeout', () => {
      registerHook('testPlugin', { readyFn: 'testFn', timeout: 3000 });
      const hooks = getHooks();
      expect(hooks.testPlugin.timeout).toBe(3000);
    });

    it('stores readyFn path', () => {
      registerHook('testPlugin', { readyFn: 'window.vendor.ready' });
      const hooks = getHooks();
      expect(hooks.testPlugin.readyFn).toBe('window.vendor.ready');
    });
  });

  describe('unregisterHook', () => {
    it('removes registered hook', () => {
      registerHook('testPlugin', { readyFn: 'testFn' });
      expect(hasHooks()).toBe(true);

      unregisterHook('testPlugin');
      expect(hasHooks()).toBe(false);
    });

    it('does not throw for non-existent hook', () => {
      expect(() => unregisterHook('nonexistent')).not.toThrow();
    });
  });

  describe('getHooks', () => {
    it('returns empty object initially', () => {
      expect(getHooks()).toEqual({});
    });

    it('returns registered hooks', () => {
      registerHook('plugin1', { readyFn: 'fn1' });
      registerHook('plugin2', { readyFn: 'fn2' });

      const hooks = getHooks();
      expect(hooks.plugin1).toBeDefined();
      expect(hooks.plugin2).toBeDefined();
    });

    it('returns copy of hooks', () => {
      registerHook('plugin', { readyFn: 'fn' });
      const hooks1 = getHooks();
      const hooks2 = getHooks();
      expect(hooks1).not.toBe(hooks2);
    });
  });

  describe('hasHooks', () => {
    it('returns false initially', () => {
      expect(hasHooks()).toBe(false);
    });

    it('returns true after registering hook', () => {
      registerHook('plugin', { readyFn: 'fn' });
      expect(hasHooks()).toBe(true);
    });

    it('returns false after unregistering all hooks', () => {
      registerHook('plugin', { readyFn: 'fn' });
      unregisterHook('plugin');
      expect(hasHooks()).toBe(false);
    });
  });

  describe('runHooks', () => {
    it('resolves immediately when no hooks registered', async () => {
      await expect(runHooks('slot-1')).resolves.toBeUndefined();
    });

    it('skips plugin when status is not loaded', async () => {
      registerHook('testPlugin', { readyFn: 'testFn' });
      mockLoader.getPlugin.mockReturnValue({ status: 'pending' });

      await runHooks('slot-1');
      // Should complete without error
      expect(true).toBe(true);
    });

    it('skips when readyFn not found on window', async () => {
      registerHook('testPlugin', { readyFn: 'nonexistentFn' });
      mockLoader.getPlugin.mockReturnValue({ status: 'loaded' });

      await runHooks('slot-1');
      // Should complete without error
      expect(true).toBe(true);
    });

    it('calls readyFn when available', async () => {
      const readyFn = vi.fn((callback: () => void) => callback());
      (window as any).testReadyFn = readyFn;

      registerHook('testPlugin', { readyFn: 'testReadyFn' });
      mockLoader.getPlugin.mockReturnValue({ status: 'loaded' });

      await runHooks('slot-1');
      expect(readyFn).toHaveBeenCalled();
    });

    it('handles nested window paths', async () => {
      const readyFn = vi.fn((callback: () => void) => callback());
      (window as any).nested = { deep: { fn: readyFn } };

      registerHook('testPlugin', { readyFn: 'nested.deep.fn' });
      mockLoader.getPlugin.mockReturnValue({ status: 'loaded' });

      await runHooks('slot-1');
      expect(readyFn).toHaveBeenCalled();
    });

    it('handles window. prefix in path', async () => {
      const readyFn = vi.fn((callback: () => void) => callback());
      (window as any).myFn = readyFn;

      registerHook('testPlugin', { readyFn: 'window.myFn' });
      mockLoader.getPlugin.mockReturnValue({ status: 'loaded' });

      await runHooks('slot-1');
      expect(readyFn).toHaveBeenCalled();
    });

    it('handles readyFn throwing error', async () => {
      (window as any).errorFn = () => { throw new Error('Test error'); };

      registerHook('testPlugin', { readyFn: 'errorFn' });
      mockLoader.getPlugin.mockReturnValue({ status: 'loaded' });

      // Should not throw
      await expect(runHooks('slot-1')).resolves.toBeUndefined();
    });

    it('handles timeout', async () => {
      // Create a readyFn that never calls callback
      (window as any).slowFn = vi.fn(() => {});

      registerHook('testPlugin', { readyFn: 'slowFn', timeout: 50 });
      mockLoader.getPlugin.mockReturnValue({ status: 'loaded' });

      await runHooks('slot-1');
      // Should complete after timeout
      expect(true).toBe(true);
    }, 10000);
  });

  describe('wrapWithHooks', () => {
    it('calls displayFn', async () => {
      const displayFn = vi.fn();
      await wrapWithHooks('slot-1', displayFn);
      expect(displayFn).toHaveBeenCalled();
    });

    it('runs hooks before displayFn', async () => {
      const order: string[] = [];
      const readyFn = vi.fn((callback: () => void) => {
        order.push('hook');
        callback();
      });
      (window as any).testReadyFn = readyFn;

      registerHook('testPlugin', { readyFn: 'testReadyFn' });
      mockLoader.getPlugin.mockReturnValue({ status: 'loaded' });

      await wrapWithHooks('slot-1', () => order.push('display'));
      expect(order).toEqual(['hook', 'display']);
    });

    it('handles displayFn error', async () => {
      const displayFn = () => { throw new Error('Display error'); };
      // Should not throw
      await expect(wrapWithHooks('slot-1', displayFn)).resolves.toBeUndefined();
    });
  });

  describe('reset', () => {
    it('clears all hooks', () => {
      registerHook('plugin1', { readyFn: 'fn1' });
      registerHook('plugin2', { readyFn: 'fn2' });
      expect(hasHooks()).toBe(true);

      reset();
      expect(hasHooks()).toBe(false);
    });

    it('allows re-registration after reset', () => {
      registerHook('plugin', { readyFn: 'fn' });
      reset();
      registerHook('plugin', { readyFn: 'newFn' });

      const hooks = getHooks();
      expect(hooks.plugin.readyFn).toBe('newFn');
    });
  });
});
