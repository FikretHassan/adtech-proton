/**
 * Timer - High-precision timestamp utility
 *
 * Uses browser Performance API with Date.now() fallback
 */

export interface PerformanceTracker {
  status: string;
  init: number;
  requested: number;
  received: number;
  preload: number;
  error: number;
  timeout: number;
  latency: number;
}

/**
 * Get current timestamp in milliseconds since page load
 */
export function timer(): number {
  let timestamp: number;

  // Use Performance API (available in all modern browsers)
  if (typeof window !== 'undefined' && typeof window.performance !== 'undefined' && typeof window.performance.now === 'function') {
    timestamp = window.performance.now();
  }
  // Fallback to Date.now()
  else {
    timestamp = Date.now();
  }

  return Math.round(timestamp);
}

/**
 * Create a performance tracker for a plugin
 */
export function createPerformanceTracker(): PerformanceTracker {
  return {
    status: 'init',
    init: timer(),
    requested: 0,
    received: 0,
    preload: 0,
    error: -1,
    timeout: -1,
    latency: 0
  };
}

/**
 * Calculate latency from init to current time
 */
export function calculateLatency(perf: PerformanceTracker): number {
  return timer() - perf.init;
}

export default timer;
