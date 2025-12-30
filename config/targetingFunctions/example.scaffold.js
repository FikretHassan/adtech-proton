/**
 * Example Targeting Function Scaffold
 *
 * Copy this file and customize for your targeting needs.
 * Each function should return a value that can be used as a GAM targeting key-value.
 *
 * Return types:
 *   - string: Single value (e.g., "premium")
 *   - string[]: Array of values (e.g., ["sports", "football"])
 *   - null: No value (key won't be set)
 */

// Example: Subscriber tier from user profile
export function getSubscriberTier() {
  return window.userProfile?.tier || 'free';
}

// Example: A/B test variant from cookie
export function getABTestVariant() {
  const match = document.cookie.match(/abtest=([^;]+)/);
  return match ? match[1] : null;
}

// Example: Content category from data layer
export function getContentCategory() {
  const item = window.dataLayer?.find(d => d.contentCategory);
  return item?.contentCategory || null;
}

// Example: Device type detection
export function getDeviceType() {
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return 'tablet';
  if (/mobile|iphone|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

// Example: Time-based targeting (morning/afternoon/evening)
export function getDayPart() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * To use a function:
 *
 * 1. Create your file (e.g., subscriberTier.js):
 *
 *    export default function getSubscriberTier() {
 *      return window.userProfile?.tier || 'free';
 *    }
 *
 * 2. Add to index.js:
 *
 *    import getSubscriberTier from './subscriberTier.js';
 *    export default {
 *      ...existingFunctions,
 *      getSubscriberTier
 *    };
 *
 * 3. Reference in targeting.json:
 *
 *    "tier": { "source": "internal", "fn": "getSubscriberTier" }
 */
