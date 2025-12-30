/**
 * Shared constants for timeout values, intervals, and defaults
 * Centralizes magic numbers for maintainability and documentation
 */

/**
 * Timeout defaults (in milliseconds)
 * Used when config doesn't specify a value
 */
export const TIMEOUTS = {
  /** Minimum timeout for any partner (floor value) */
  MIN_PARTNER: 500,

  /** Default timeout for independent partners (shared pool) */
  INDEPENDENT: 1000,

  /** Default timeout for non-core partners (independent loading) */
  NON_CORE: 5000,

  /** Default timeout for individual partner loading */
  PARTNER: 3000,

  /** Default timeout for header bidding auctions (Prebid/APS) */
  AUCTION: 2000,

  /**
   * Buffer added to auction timeouts for fallback safety net
   * Gives the library's internal timeout a chance to fire first
   * before our fallback resolves the promise
   */
  AUCTION_BUFFER: 100,

  /** Default timeout for pre-request hooks */
  HOOK: 100,

  /** Default timeout for ad sequencing priority wait */
  PRIORITY: 2000,

  /** Default fade-out duration for ad refresh transitions */
  FADE_OUT: 100,

  /** Debounce delay for batch operations */
  DEBOUNCE: 100
} as const;

/**
 * Interval values (in milliseconds)
 */
export const INTERVALS = {
  /** Countdown tick interval for refresh timers */
  REFRESH_COUNTDOWN: 1000
} as const;

/**
 * Priority values (1-16 scale, matching Google Ad Manager)
 * 1 = highest priority (runs first)
 * 16 = lowest priority (runs last)
 */
export const PRIORITIES = {
  HIGH: 4,
  DEFAULT: 8,
  LOW: 12,
  DEBUG: 16
} as const;
