import { describe, it, expect, vi } from 'vitest';
import { validateCustomSlotConfig, validateWithWarning } from '../src/validation';
import { ConfigError } from '../src/errors';

describe('validation', () => {
  describe('validateCustomSlotConfig', () => {
    it('validates valid config with id and adtype', () => {
      expect(() => validateCustomSlotConfig({
        id: 'test-slot',
        adtype: 'mpu'
      })).not.toThrow();
    });

    it('validates config with injection section', () => {
      expect(() => validateCustomSlotConfig({
        id: 'test-slot',
        adtype: 'mpu',
        injection: {
          selector: '.content'
        }
      })).not.toThrow();
    });

    it('throws for missing id', () => {
      expect(() => validateCustomSlotConfig({
        adtype: 'mpu'
      })).toThrow(ConfigError);
    });

    it('throws for missing adtype', () => {
      expect(() => validateCustomSlotConfig({
        id: 'test-slot'
      })).toThrow(ConfigError);
    });

    it('throws for missing both id and adtype', () => {
      expect(() => validateCustomSlotConfig({})).toThrow(ConfigError);
    });

    it('throws for null config', () => {
      expect(() => validateCustomSlotConfig(null as any)).toThrow(ConfigError);
    });

    it('throws for non-object config', () => {
      expect(() => validateCustomSlotConfig('string' as any)).toThrow(ConfigError);
    });

    it('throws for injection missing selector', () => {
      expect(() => validateCustomSlotConfig({
        id: 'test-slot',
        adtype: 'mpu',
        injection: {
          position: 'after'
        }
      })).toThrow(ConfigError);
    });

    it('error message includes missing fields', () => {
      try {
        validateCustomSlotConfig({ adtype: 'mpu' });
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).message).toContain('id');
      }
    });

    it('error message includes context', () => {
      try {
        validateCustomSlotConfig({});
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).message).toContain('customSlot');
      }
    });
  });

  describe('validateWithWarning', () => {
    it('returns true for valid input', () => {
      const result = validateWithWarning(() => {
        // Valid - no throw
      });
      expect(result).toBe(true);
    });

    it('returns false when validator throws', () => {
      const result = validateWithWarning(() => {
        throw new Error('Invalid');
      });
      expect(result).toBe(false);
    });

    it('calls logger when validation fails', () => {
      const logger = vi.fn();
      validateWithWarning(() => {
        throw new Error('Test error');
      }, logger);

      expect(logger).toHaveBeenCalled();
    });

    it('logger receives error message', () => {
      const logger = vi.fn();
      validateWithWarning(() => {
        throw new Error('Custom error message');
      }, logger);

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Custom error message'));
    });

    it('does not call logger on success', () => {
      const logger = vi.fn();
      validateWithWarning(() => {
        // Success - no throw
      }, logger);

      expect(logger).not.toHaveBeenCalled();
    });

    it('works without logger', () => {
      const result = validateWithWarning(() => {
        throw new Error('Test');
      });
      expect(result).toBe(false);
    });

    it('handles ConfigError', () => {
      const logger = vi.fn();
      const result = validateWithWarning(() => {
        throw new ConfigError('Config validation failed');
      }, logger);

      expect(result).toBe(false);
      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Config validation failed'));
    });

    it('message includes Validation warning prefix', () => {
      const logger = vi.fn();
      validateWithWarning(() => {
        throw new Error('Test');
      }, logger);

      expect(logger).toHaveBeenCalledWith(expect.stringContaining('Validation warning:'));
    });
  });

  describe('integration', () => {
    it('validateWithWarning with validateCustomSlotConfig - valid', () => {
      const logger = vi.fn();
      const result = validateWithWarning(
        () => validateCustomSlotConfig({ id: 'test', adtype: 'mpu' }),
        logger
      );

      expect(result).toBe(true);
      expect(logger).not.toHaveBeenCalled();
    });

    it('validateWithWarning with validateCustomSlotConfig - invalid', () => {
      const logger = vi.fn();
      const result = validateWithWarning(
        () => validateCustomSlotConfig({}),
        logger
      );

      expect(result).toBe(false);
      expect(logger).toHaveBeenCalled();
    });
  });
});
