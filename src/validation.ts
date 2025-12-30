/**
 * Configuration validation utilities
 * Provides runtime validation for JSON configs with clear error messages
 */

import { ConfigError } from './errors';

/**
 * Validate that required fields exist on an object
 * @param obj - Object to validate
 * @param fields - Array of required field names
 * @param context - Context string for error messages
 * @throws {ConfigError} If any required field is missing
 */
function validateRequired(
  obj: Record<string, unknown>,
  fields: string[],
  context: string
): void {
  if (!obj || typeof obj !== 'object') {
    throw new ConfigError(`${context} must be an object`, { received: typeof obj });
  }

  const missing = fields.filter(field => obj[field] === undefined);
  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required field(s) in ${context}: ${missing.join(', ')}`,
      { missing, context }
    );
  }
}

/**
 * Validate custom slot configuration
 * @param config - Custom slot config object
 * @throws {ConfigError} If validation fails
 */
export function validateCustomSlotConfig(
  config: Record<string, unknown>
): void {
  validateRequired(config, ['id', 'adtype'], 'customSlot');

  const injection = config.injection as Record<string, unknown> | undefined;
  if (injection) {
    validateRequired(injection, ['selector'], `customSlot[${config.id}].injection`);
  }
}

/**
 * Safely validate with warning instead of throw
 * Returns true if valid, false if invalid (logs warning)
 * @param validator - Validation function to run
 * @param logger - Logger function for warnings
 * @returns boolean indicating validity
 */
export function validateWithWarning(
  validator: () => void,
  logger?: (msg: string) => void
): boolean {
  try {
    validator();
    return true;
  } catch (err) {
    if (logger && err instanceof Error) {
      logger(`Validation warning: ${err.message}`);
    }
    return false;
  }
}
