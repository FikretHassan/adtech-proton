/**
 * Example Hook Concern
 * Copy this file and rename it to create your own hook concern.
 *
 * A "concern" is a logical grouping of functionality that hooks into
 * various lifecycle points. For example:
 * - analytics.js - tracks impressions, viewability, etc.
 * - customTargeting.js - sets targeting before ad requests
 * - debugging.js - logs at various points for troubleshooting
 *
 * After creating your concern file:
 * 1. Import it in config/hooks/index.js
 * 2. Add it to the concerns array
 */

import { PRIORITIES } from '../../src/constants';

/**
 * Export an object with hook points as keys
 * Each hook point contains an array of hook configurations
 */
export default {
  /**
   * Hook: partners.afterReady
   * Fires when blocking partners are ready (before GAM call)
   * @param {Object} status - Partner status object
   * @param {number} elapsed - Time elapsed in ms
   */
  'partners.afterReady': [
    {
      name: 'example_setLoadTime',
      priority: PRIORITIES.DEFAULT,
      properties: ['mysite'], // Property targeting - only run on these properties
      fn: (status, elapsed) => {
        // Example: Set load time as targeting
        if (typeof googletag !== 'undefined') {
          googletag.pubads().setTargeting('load_time', String(elapsed));
        }
      }
    }
  ],

  /**
   * Hook: slot.afterRender
   * Fires after each slot renders
   * @param {string} slotId - The slot ID
   * @param {Object} event - GPT slot render event
   * @param {Object} info - Additional render info
   */
  'slot.afterRender': [
    {
      name: 'example_trackImpression',
      priority: PRIORITIES.DEFAULT,
      fn: (slotId, event, info) => {
        // Example: Track ad impression
        console.log('Ad rendered:', slotId, info);
      }
    }
  ],

  /**
   * Hook: slot.beforeRequest
   * Fires before each slot's ad request
   * @param {string} slotId - The slot ID
   * @param {Object} slot - GPT slot object
   * @param {Object} context - Request context
   */
  'slot.beforeRequest': [
    {
      name: 'example_addUserData',
      priority: PRIORITIES.DEFAULT,
      fn: (slotId, slot, context) => {
        // Example: Add last-minute targeting
        // slot.setTargeting('user_segment', getUserSegment());
      }
    }
  ]
};

/**
 * Available Hook Points:
 *
 * INIT PHASE
 * - loader.beforeInit      - Before loader initialization
 * - loader.afterInit       - After loader initialization
 *
 * PLUGINS PHASE
 * - plugin.beforeLoad      - Before a plugin loads
 * - plugin.afterLoad       - After a plugin loads
 * - plugin.onError         - When a plugin fails to load
 *
 * PARTNERS PHASE
 * - partners.beforeReady   - Before partner readiness check
 * - partners.afterReady    - After blocking partners ready (key hook for targeting)
 * - partners.onTimeout     - When partners timeout
 *
 * SLOTS PHASE
 * - slot.beforeDefine      - Before GPT slot definition
 * - slot.afterDefine       - After GPT slot defined
 *
 * ADS REQUEST PHASE
 * - ads.beforeRequest      - Before batch ad request
 * - slot.beforeRequest     - Before individual slot request
 * - slot.afterRequest      - After individual slot request
 * - ads.afterRequest       - After batch ad request
 *
 * RENDER PHASE
 * - slot.beforeRender      - Before slot renders
 * - slot.afterRender       - After slot renders (key hook for tracking)
 * - slot.onEmpty           - When slot has no fill
 *
 * REFRESH PHASE
 * - slot.beforeRefresh     - Before slot refresh
 * - slot.afterRefresh      - After slot refresh
 *
 * INJECTION PHASE
 * - injection.beforeInject - Before dynamic ad injection
 * - injection.afterInject  - After dynamic ad injection
 *
 * PAGE PHASE
 * - page.beforeUnload      - Before page unload
 * - page.visibilityChange  - When page visibility changes
 */
