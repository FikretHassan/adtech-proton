/**
 * Example Experience Scaffold
 * Copy this file and rename to create your own experience.
 *
 * Each experience is self-contained with:
 * - Targeting rules (include/exclude)
 * - Consent requirements
 * - Priority (1-16 scale, lower = runs earlier)
 * - fn: function to execute immediately when targeting matches
 * - subscriptions: PubSub topics to subscribe to when targeting matches
 *
 * Experiences can have:
 * - fn only (execute immediately)
 * - subscriptions only (conditional subscriptions)
 * - Both fn AND subscriptions
 *
 * After creating your experience file:
 * 1. Import it in config/experiences/index.js
 * 2. Add it to the experiences array
 *
 * Priority constants (import from src/constants):
 * - PRIORITIES.HIGH    = 4  (runs early)
 * - PRIORITIES.DEFAULT = 8  (standard)
 * - PRIORITIES.LOW     = 12 (runs late)
 * - PRIORITIES.DEBUG   = 16 (demo/debug only)
 */

import { PRIORITIES } from '../../src/constants';

export default {
  /**
   * Unique name for this experience
   * Used in events: experience.{name}.load, experience.{name}.ignore, etc.
   */
  name: 'my-experience',

  /**
   * Enable/disable this experience
   */
  active: true,

  /**
   * Property targeting - only run on specified properties
   * - undefined or [] = run on all properties
   * - ['mysite'] = only on mysite
   * - ['mysite', 'dev'] = on mysite and dev
   */
  properties: ['mysite'],

  /**
   * Description for documentation
   */
  description: 'Description of what this experience does',

  /**
   * Include targeting - experience runs if ALL conditions match
   * Dimensions: section, pagetype, geo, viewport, userState, etc.
   */
  include: {
    section: ['news', 'sport'],      // Match these sections
    pagetype: ['story'],              // Match these pagetypes
    // geo: ['gb', 'us'],             // Uncomment to target specific geos
    // viewport: ['x', 'l'],          // Uncomment to target desktop only
  },

  /**
   * Exclude targeting - experience skipped if ANY condition matches
   */
  exclude: {
    // section: ['sponsored'],        // Uncomment to exclude sponsored section
    // userState: ['sub'],            // Uncomment to exclude subscribers
  },

  /**
   * Consent requirements - values from consent.getState()
   * - [] = always run (no consent check)
   * - ['true'] = run if consent.getState() returns 'true'
   */
  consentState: [],

  /**
   * Priority - 1-16 scale, lower numbers run first
   * Use PRIORITIES constants: HIGH (4), DEFAULT (8), LOW (12), DEBUG (16)
   */
  priority: PRIORITIES.DEFAULT,

  /**
   * Conditional PubSub subscriptions (optional)
   *
   * When targeting passes, these subscriptions are registered.
   * The function executes when the topic is published.
   *
   * Two-stage conditional:
   * 1. Targeting check -> if passes, subscription is registered
   * 2. Topic published -> function executes
   *
   * @property {string} topic - PubSub topic to subscribe to
   * @property {Function} fn - Handler function called when topic publishes
   * @property {boolean} runIfAlreadyPublished - Execute immediately if topic already fired (default: true)
   */
  subscriptions: [
    {
      topic: 'my.custom.event',
      runIfAlreadyPublished: true,
      fn: function(data) {
        console.info('[Experience] my-experience: subscription handler fired', {
          topic: 'my.custom.event',
          data: data
        });
      }
    }
    // Add more subscriptions as needed
  ],

  /**
   * The function to execute immediately when targeting matches (optional)
   * @param {Object} context - Current page context
   * @returns {Object} Result with success status
   */
  fn: function(context) {
    // Access context dimensions:
    // context.section, context.pagetype, context.geo
    // context.viewport, context.userState, etc.

    console.info('[Experience] my-experience executed', context);

    // Do your work here...

    return {
      success: true,
      message: 'Experience completed'
    };
  }
};
