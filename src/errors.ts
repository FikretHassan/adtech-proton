/**
 * Custom error classes for the ad tech plugin loader
 * Provides typed errors for better error handling and debugging
 */

/**
 * Base error class for all loader errors
 */
export class LoaderError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'LoaderError';
    this.code = code;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when configuration is invalid or missing required fields
 */
export class ConfigError extends LoaderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

/**
 * Error thrown when a partner fails to load or initialize
 */
export class PartnerError extends LoaderError {
  public readonly partnerName: string;

  constructor(message: string, partnerName: string, context?: Record<string, unknown>) {
    super(message, 'PARTNER_ERROR', { ...context, partnerName });
    this.name = 'PartnerError';
    this.partnerName = partnerName;
  }
}

/**
 * Error thrown when slot operations fail
 */
export class SlotError extends LoaderError {
  public readonly slotId: string;

  constructor(message: string, slotId: string, context?: Record<string, unknown>) {
    super(message, 'SLOT_ERROR', { ...context, slotId });
    this.name = 'SlotError';
    this.slotId = slotId;
  }
}

/**
 * Error thrown when auction operations fail
 */
export class AuctionError extends LoaderError {
  public readonly slotId: string;
  public readonly auctionType: 'prebid' | 'amazonaps' | 'unknown';

  constructor(
    message: string,
    slotId: string,
    auctionType: 'prebid' | 'amazonaps' | 'unknown' = 'unknown',
    context?: Record<string, unknown>
  ) {
    super(message, 'AUCTION_ERROR', { ...context, slotId, auctionType });
    this.name = 'AuctionError';
    this.slotId = slotId;
    this.auctionType = auctionType;
  }
}

/**
 * Error thrown when targeting resolution fails
 */
export class TargetingError extends LoaderError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TARGETING_ERROR', context);
    this.name = 'TargetingError';
  }
}

/**
 * Safely execute a function, returning a default value on error
 * @param fn - Function to execute
 * @param defaultValue - Value to return if function throws
 * @param onError - Optional callback for error logging
 */
export function safeExecute<T>(
  fn: () => T,
  defaultValue: T,
  onError?: (error: Error) => void
): T {
  try {
    return fn();
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
    return defaultValue;
  }
}

/**
 * Safely execute an async function, returning a default value on error
 * @param fn - Async function to execute
 * @param defaultValue - Value to return if function throws
 * @param onError - Optional callback for error logging
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  defaultValue: T,
  onError?: (error: Error) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
    return defaultValue;
  }
}

/**
 * Wrap a function with error boundary that logs but doesn't throw
 * @param fn - Function to wrap
 * @param context - Context string for error logging
 * @param logger - Logger function
 */
export function withErrorBoundary<T extends (...args: unknown[]) => unknown>(
  fn: T,
  context: string,
  logger?: (msg: string, data?: unknown) => void
): T {
  return ((...args: Parameters<T>): ReturnType<T> | undefined => {
    try {
      return fn(...args) as ReturnType<T>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (logger) {
        logger(`Error in ${context}: ${message}`, { error, args });
      }
      return undefined;
    }
  }) as T;
}
