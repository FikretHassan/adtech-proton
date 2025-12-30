/**
 * Internal Functions Registry
 * Define custom functions here that can be referenced in targeting.json
 *
 * Usage in targeting.json:
 *   "myKey": { "source": "internal", "fn": "myFunctionName" }
 */

import environment from './environment';
import CONFIG from '../config/loader.js';

interface LogQueueItem {
  msg: string;
  data: unknown;
  timestamp: number;
}

interface LoaderInstance {
  log?: (msg: string, data?: unknown) => void;
}

declare global {
  interface Window {
    PubSub?: { instanceId?: string; [key: string]: unknown };
    [key: string]: any;
  }
}

const LOG_PREFIX = '[InternalFunctions]';

// Queue for deferred logs (flushed when loader available)
const logQueue: LogQueueItem[] = [];

// Get loader instance from configured global name
const getLoader = (): LoaderInstance | undefined => {
  return window[CONFIG.globalName] as LoaderInstance | undefined;
};

// Log function - queues if loader not ready, logs immediately if ready
const log = (msg: string, data: unknown = null): void => {
  const loader = getLoader();
  if (loader?.log) {
    loader.log(`${LOG_PREFIX} ${msg}`, data);
  } else {
    // Queue for later
    logQueue.push({ msg, data, timestamp: Date.now() });
  }
};

// Flush queued logs to loader (call this after loader is ready)
const flushLogs = (): void => {
  const loader = getLoader();
  if (loader?.log && logQueue.length > 0) {
    logQueue.forEach(item => {
      loader.log!(`${LOG_PREFIX} ${item.msg}`, item.data);
    });
    logQueue.length = 0; // Clear queue
  }
};

export type InternalFunction = () => string | string[] | null;

export interface InternalFunctions {
  [key: string]: InternalFunction;
}

// Define the functions
const functions: InternalFunctions = {
  // Ad test value from URL param (?adtest=value)
  // Returns the value to use as 'test' targeting key
  getAdTest: (): string | null => {
    const params = new URLSearchParams(window.location.search);
    return params.get('adtest') || null;
  },

  // Production environment flag for GAM targeting
  // Returns 'true' or 'false' string (matches monolith behavior)
  // Affected by ?adsShowProductionAds URL param
  getIsProduction: (): string => {
    return environment.isProduction() ? 'true' : 'false';
  },

  // PubSub instance ID for session tracking
  getInstanceId: (): string | null => {
    return window.PubSub?.instanceId || null;
  }

  // Add your custom functions below:
  //
  // getSubscriberTier: () => {
  //   return window.userProfile?.tier || 'free';
  // },
  //
  // getGeoFromCookie: () => {
  //   const match = document.cookie.match(/geo=([^;]+)/);
  //   return match ? match[1] : null;
  // }
};

// Log initialization (queued until loader ready)
log('Initialized');
log('Registered functions:', Object.keys(functions));

// Export functions and flushLogs utility
export { flushLogs };
export default functions;
