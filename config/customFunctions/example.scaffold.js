/**
 * Custom Function Scaffold
 *
 * Copy this file and customize for your needs.
 * Custom functions are exposed on proton.customFunctions
 *
 * Access to Proton internals:
 *   - proton.targeting.buildPageTargeting()  - Get page-level KVPs
 *   - proton.targeting.buildSlotTargeting()  - Get slot-level KVPs
 *   - proton.slots.getSlotData(slotId)       - Get slot registry data
 *   - proton.config                          - Property configuration
 *   - proton.property                        - Current property name
 */

// Example: Build a custom tracking pixel URL
export function buildTrackingPixel(options = {}) {
  const loader = window.proton;
  if (!loader) return null;

  const targeting = loader.targeting?.buildPageTargeting() || {};

  const params = new URLSearchParams({
    property: loader.property || 'unknown',
    breakpoint: targeting.bp || 'unknown',
    ...options
  });

  return `https://tracking.example.com/pixel?${params.toString()}`;
}

// Example: Format targeting as query string
export function targetingToQueryString(slotId) {
  const loader = window.proton;
  if (!loader) return '';

  const slotData = loader.slots?.getSlotData(slotId);
  if (!slotData?.targeting) return '';

  const params = [];
  for (const [key, value] of Object.entries(slotData.targeting)) {
    if (Array.isArray(value)) {
      params.push(`${key}=${encodeURIComponent(value.join(','))}`);
    } else if (value !== null && value !== undefined) {
      params.push(`${key}=${encodeURIComponent(value)}`);
    }
  }

  return params.join('&');
}

/**
 * To use a function:
 *
 * 1. Create your file (e.g., myCustomFn.js):
 *
 *    export default function myCustomFn(options) {
 *      const loader = window.proton;
 *      // ... your logic
 *      return result;
 *    }
 *
 * 2. Add to index.js:
 *
 *    import myCustomFn from './myCustomFn.js';
 *    export default {
 *      ...existingFunctions,
 *      myCustomFn
 *    };
 *
 * 3. Use in your code:
 *
 *    const result = proton.customFunctions.myCustomFn({ foo: 'bar' });
 */
