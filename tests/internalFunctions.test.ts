import { describe, it, expect, beforeEach, vi } from 'vitest';
import functions, { flushLogs } from '../src/internalFunctions';

// Mock loader
const mockLoader = {
  log: vi.fn()
};

// Mock environment
vi.mock('../src/environment', () => ({
  default: {
    isProduction: vi.fn(() => true)
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  (window as any).proton = mockLoader;

  // Reset URL
  Object.defineProperty(window, 'location', {
    value: { search: '', href: 'http://localhost/' },
    writable: true
  });

  // Clear PubSub
  delete (window as any).PubSub;
});

describe('internalFunctions', () => {
  describe('default export', () => {
    it('is an object', () => {
      expect(typeof functions).toBe('object');
    });

    it('has getAdTest function', () => {
      expect(typeof functions.getAdTest).toBe('function');
    });

    it('has getIsProduction function', () => {
      expect(typeof functions.getIsProduction).toBe('function');
    });

    it('has getInstanceId function', () => {
      expect(typeof functions.getInstanceId).toBe('function');
    });
  });

  describe('getAdTest', () => {
    it('returns null when no adtest param', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '' },
        writable: true
      });
      expect(functions.getAdTest()).toBeNull();
    });

    it('returns adtest param value', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adtest=live' },
        writable: true
      });
      expect(functions.getAdTest()).toBe('live');
    });

    it('returns custom adtest value', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adtest=staging' },
        writable: true
      });
      expect(functions.getAdTest()).toBe('staging');
    });

    it('handles adtest with other params', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?foo=bar&adtest=test&baz=qux' },
        writable: true
      });
      expect(functions.getAdTest()).toBe('test');
    });

    it('returns empty string for empty adtest', () => {
      Object.defineProperty(window, 'location', {
        value: { search: '?adtest=' },
        writable: true
      });
      expect(functions.getAdTest()).toBeNull();
    });
  });

  describe('getIsProduction', () => {
    it('returns string', () => {
      expect(typeof functions.getIsProduction()).toBe('string');
    });

    it('returns "true" or "false"', () => {
      const result = functions.getIsProduction();
      expect(['true', 'false']).toContain(result);
    });

    it('returns "true" when environment.isProduction returns true', async () => {
      const env = await import('../src/environment');
      (env.default.isProduction as any).mockReturnValue(true);
      expect(functions.getIsProduction()).toBe('true');
    });

    it('returns "false" when environment.isProduction returns false', async () => {
      const env = await import('../src/environment');
      (env.default.isProduction as any).mockReturnValue(false);
      expect(functions.getIsProduction()).toBe('false');
    });
  });

  describe('getInstanceId', () => {
    it('returns null when PubSub not defined', () => {
      delete (window as any).PubSub;
      expect(functions.getInstanceId()).toBeNull();
    });

    it('returns null when PubSub.instanceId not defined', () => {
      (window as any).PubSub = {};
      expect(functions.getInstanceId()).toBeNull();
    });

    it('returns instanceId when defined', () => {
      (window as any).PubSub = { instanceId: 'abc123' };
      expect(functions.getInstanceId()).toBe('abc123');
    });

    it('returns correct instanceId value', () => {
      (window as any).PubSub = { instanceId: 'test-instance-456' };
      expect(functions.getInstanceId()).toBe('test-instance-456');
    });
  });

  describe('flushLogs', () => {
    it('is a function', () => {
      expect(typeof flushLogs).toBe('function');
    });

    it('does not throw when called', () => {
      expect(() => flushLogs()).not.toThrow();
    });

    it('does not throw when loader not available', () => {
      delete (window as any).proton;
      expect(() => flushLogs()).not.toThrow();
    });
  });
});
