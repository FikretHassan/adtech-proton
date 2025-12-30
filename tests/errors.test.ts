import { describe, it, expect, vi } from 'vitest';
import {
  LoaderError,
  ConfigError,
  PartnerError,
  SlotError,
  AuctionError,
  TargetingError,
  safeExecute,
  safeExecuteAsync,
  withErrorBoundary
} from '../src/errors';

describe('errors', () => {
  describe('LoaderError', () => {
    it('creates error with message and code', () => {
      const error = new LoaderError('Test error', 'TEST_CODE');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('LoaderError');
    });

    it('includes optional context', () => {
      const context = { foo: 'bar', count: 42 };
      const error = new LoaderError('Test error', 'TEST_CODE', context);
      expect(error.context).toEqual(context);
    });

    it('extends Error', () => {
      const error = new LoaderError('Test', 'CODE');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(LoaderError);
    });

    it('has no context when not provided', () => {
      const error = new LoaderError('Test', 'CODE');
      expect(error.context).toBeUndefined();
    });
  });

  describe('ConfigError', () => {
    it('creates error with CONFIG_ERROR code', () => {
      const error = new ConfigError('Invalid config');
      expect(error.message).toBe('Invalid config');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.name).toBe('ConfigError');
    });

    it('extends LoaderError', () => {
      const error = new ConfigError('Test');
      expect(error).toBeInstanceOf(LoaderError);
      expect(error).toBeInstanceOf(ConfigError);
    });

    it('includes context', () => {
      const context = { field: 'apiKey' };
      const error = new ConfigError('Missing field', context);
      expect(error.context).toEqual(context);
    });
  });

  describe('PartnerError', () => {
    it('creates error with PARTNER_ERROR code and partner name', () => {
      const error = new PartnerError('Partner failed', 'prebid');
      expect(error.message).toBe('Partner failed');
      expect(error.code).toBe('PARTNER_ERROR');
      expect(error.name).toBe('PartnerError');
      expect(error.partnerName).toBe('prebid');
    });

    it('extends LoaderError', () => {
      const error = new PartnerError('Test', 'amazon');
      expect(error).toBeInstanceOf(LoaderError);
      expect(error).toBeInstanceOf(PartnerError);
    });

    it('includes partner name in context', () => {
      const error = new PartnerError('Error', 'prebid', { timeout: 1000 });
      expect(error.context).toEqual({ timeout: 1000, partnerName: 'prebid' });
    });
  });

  describe('SlotError', () => {
    it('creates error with SLOT_ERROR code and slot ID', () => {
      const error = new SlotError('Slot failed', 'advert_site_mpu_0');
      expect(error.message).toBe('Slot failed');
      expect(error.code).toBe('SLOT_ERROR');
      expect(error.name).toBe('SlotError');
      expect(error.slotId).toBe('advert_site_mpu_0');
    });

    it('extends LoaderError', () => {
      const error = new SlotError('Test', 'slot-1');
      expect(error).toBeInstanceOf(LoaderError);
      expect(error).toBeInstanceOf(SlotError);
    });

    it('includes slot ID in context', () => {
      const error = new SlotError('Error', 'slot-1', { adType: 'mpu' });
      expect(error.context).toEqual({ adType: 'mpu', slotId: 'slot-1' });
    });
  });

  describe('AuctionError', () => {
    it('creates error with AUCTION_ERROR code', () => {
      const error = new AuctionError('Auction failed', 'slot-1');
      expect(error.message).toBe('Auction failed');
      expect(error.code).toBe('AUCTION_ERROR');
      expect(error.name).toBe('AuctionError');
      expect(error.slotId).toBe('slot-1');
      expect(error.auctionType).toBe('unknown');
    });

    it('accepts specific auction type', () => {
      const error = new AuctionError('Timeout', 'slot-1', 'prebid');
      expect(error.auctionType).toBe('prebid');
    });

    it('accepts amazonaps auction type', () => {
      const error = new AuctionError('Timeout', 'slot-1', 'amazonaps');
      expect(error.auctionType).toBe('amazonaps');
    });

    it('extends LoaderError', () => {
      const error = new AuctionError('Test', 'slot-1');
      expect(error).toBeInstanceOf(LoaderError);
      expect(error).toBeInstanceOf(AuctionError);
    });

    it('includes slot ID and auction type in context', () => {
      const error = new AuctionError('Error', 'slot-1', 'prebid', { bid: 1.5 });
      expect(error.context).toEqual({
        bid: 1.5,
        slotId: 'slot-1',
        auctionType: 'prebid'
      });
    });
  });

  describe('TargetingError', () => {
    it('creates error with TARGETING_ERROR code', () => {
      const error = new TargetingError('Targeting failed');
      expect(error.message).toBe('Targeting failed');
      expect(error.code).toBe('TARGETING_ERROR');
      expect(error.name).toBe('TargetingError');
    });

    it('extends LoaderError', () => {
      const error = new TargetingError('Test');
      expect(error).toBeInstanceOf(LoaderError);
      expect(error).toBeInstanceOf(TargetingError);
    });

    it('includes context', () => {
      const context = { key: 'pagetype' };
      const error = new TargetingError('Invalid key', context);
      expect(error.context).toEqual(context);
    });
  });

  describe('safeExecute', () => {
    it('returns function result on success', () => {
      const result = safeExecute(() => 42, 0);
      expect(result).toBe(42);
    });

    it('returns default value on error', () => {
      const result = safeExecute(() => {
        throw new Error('fail');
      }, 'default');
      expect(result).toBe('default');
    });

    it('calls onError callback when error occurs', () => {
      const onError = vi.fn();
      safeExecute(() => {
        throw new Error('test error');
      }, null, onError);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(onError.mock.calls[0][0].message).toBe('test error');
    });

    it('does not call onError when no error', () => {
      const onError = vi.fn();
      safeExecute(() => 'success', null, onError);
      expect(onError).not.toHaveBeenCalled();
    });

    it('works with complex return types', () => {
      const expected = { a: 1, b: [2, 3] };
      const result = safeExecute(() => expected, {});
      expect(result).toEqual(expected);
    });

    it('handles non-Error throws with default value', () => {
      const result = safeExecute(() => {
        throw 'string error';  // Non-Error throw
      }, 'fallback');
      expect(result).toBe('fallback');
    });

    it('does not call onError for non-Error throws', () => {
      const onError = vi.fn();
      safeExecute(() => {
        throw 'string error';
      }, null, onError);
      // onError only called for Error instances
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('safeExecuteAsync', () => {
    it('returns function result on success', async () => {
      const result = await safeExecuteAsync(async () => 42, 0);
      expect(result).toBe(42);
    });

    it('returns default value on error', async () => {
      const result = await safeExecuteAsync(async () => {
        throw new Error('fail');
      }, 'default');
      expect(result).toBe('default');
    });

    it('calls onError callback when error occurs', async () => {
      const onError = vi.fn();
      await safeExecuteAsync(async () => {
        throw new Error('async error');
      }, null, onError);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe('async error');
    });

    it('does not call onError when no error', async () => {
      const onError = vi.fn();
      await safeExecuteAsync(async () => 'success', null, onError);
      expect(onError).not.toHaveBeenCalled();
    });

    it('handles promise rejection', async () => {
      const result = await safeExecuteAsync(
        () => Promise.reject(new Error('rejected')),
        'fallback'
      );
      expect(result).toBe('fallback');
    });

    it('works with delayed async functions', async () => {
      const result = await safeExecuteAsync(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'delayed';
      }, 'default');
      expect(result).toBe('delayed');
    });
  });

  describe('withErrorBoundary', () => {
    it('returns wrapped function result on success', () => {
      const fn = (x: number) => x * 2;
      const wrapped = withErrorBoundary(fn, 'test');
      expect(wrapped(5)).toBe(10);
    });

    it('returns undefined on error', () => {
      const fn = () => {
        throw new Error('fail');
      };
      const wrapped = withErrorBoundary(fn, 'test');
      expect(wrapped()).toBeUndefined();
    });

    it('calls logger with error details', () => {
      const logger = vi.fn();
      const fn = () => {
        throw new Error('test message');
      };
      const wrapped = withErrorBoundary(fn, 'myFunction', logger);
      wrapped();
      expect(logger).toHaveBeenCalledTimes(1);
      expect(logger.mock.calls[0][0]).toContain('Error in myFunction');
      expect(logger.mock.calls[0][0]).toContain('test message');
    });

    it('passes args to wrapped function', () => {
      const fn = vi.fn((a: number, b: string) => `${a}-${b}`);
      const wrapped = withErrorBoundary(fn, 'test');
      wrapped(1, 'hello');
      expect(fn).toHaveBeenCalledWith(1, 'hello');
    });

    it('does not call logger when no error', () => {
      const logger = vi.fn();
      const fn = () => 'success';
      const wrapped = withErrorBoundary(fn, 'test', logger);
      wrapped();
      expect(logger).not.toHaveBeenCalled();
    });

    it('handles non-Error throws', () => {
      const logger = vi.fn();
      const fn = () => {
        throw 'string error';
      };
      const wrapped = withErrorBoundary(fn, 'test', logger);
      const result = wrapped();
      expect(result).toBeUndefined();
      expect(logger).toHaveBeenCalled();
      expect(logger.mock.calls[0][0]).toContain('string error');
    });

    it('includes args in logger data', () => {
      const logger = vi.fn();
      const fn = (x: number) => {
        throw new Error('fail');
      };
      const wrapped = withErrorBoundary(fn, 'test', logger);
      wrapped(42);
      expect(logger.mock.calls[0][1]).toHaveProperty('args');
    });

    it('preserves function behavior for multiple calls', () => {
      let callCount = 0;
      const fn = () => ++callCount;
      const wrapped = withErrorBoundary(fn, 'test');
      expect(wrapped()).toBe(1);
      expect(wrapped()).toBe(2);
      expect(wrapped()).toBe(3);
    });
  });
});
