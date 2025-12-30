/**
 * Custom Slot Configuration Scaffold
 *
 * Copy and rename this file to create new custom slots.
 * Custom slots are programmatically injected into the page based on targeting rules.
 *
 * Export an array to define multiple viewport/targeting variants of the same slot.
 * Each variant can have different injection points and sizes per viewport.
 *
 * After creating your custom slot:
 * 1. Import it in config/customSlots/index.js
 * 2. Add it to the customSlots array
 */

/**
 * @typedef {Object} CustomSlotConfig
 * @property {string} id - Unique slot identifier (used in slot ID: advert_{prefix}_{adtype}_{id})
 * @property {string} adtype - Ad type for sizemapping lookup (e.g., 'custom', 'mpu', 'ban')
 * @property {boolean} active - Enable/disable this slot variant
 * @property {string[]} [properties] - Property targeting. ['all'] or specific ['mysite']
 * @property {Object} include - Targeting rules (ALL must match)
 * @property {string[]} [include.pagetype] - Pagetypes to include
 * @property {string[]} [include.viewport] - Viewports to include (x, l, m, s, xs)
 * @property {string[]} [include.section] - Sections to include
 * @property {Object} [exclude] - Exclusion rules (ANY match = skip)
 * @property {Object} injection - DOM injection configuration
 * @property {string} injection.selector - CSS selector for target element
 * @property {number} injection.poscount - Which matching element (0 = first, 1 = second, etc.)
 * @property {string} injection.position - Where to inject: 'before', 'after', 'prepend', 'append', 'replace'
 * @property {string} [injection.wrapperClass] - Additional CSS class for the container
 * @property {string|Object} [injection.wrapperStyle] - Inline styles for the container
 * @property {string} [injection.adClass] - Additional CSS class for the inner ad div
 * @property {string|Object} [injection.adStyle] - Inline styles for the inner ad div
 * @property {string|Object|false} [injection.label] - Label above ad (string, {text,class,style}, or false)
 * @property {Object} sizemapping - Ad sizes per viewport
 */

/**
 * Custom slot variants
 * @type {CustomSlotConfig[]}
 */
export default [
  /**
   * Desktop variant (viewport: x, l)
   * Injects after the article container on story pages
   */
  {
    /** Slot identifier - combined with prefix to form full ID */
    id: 'example',

    /** Ad type - used for sizemapping and targeting key */
    adtype: 'custom',

    /** Enable this variant */
    active: true,

    /** Property targeting - ['all'] runs everywhere */
    properties: ['all'],

    /** Include targeting - ALL conditions must match */
    include: {
      pagetype: ['story'],
      viewport: ['x', 'l']
      // Add more dimensions from dimensions.json: section, geo, userState, etc.
    },

    /** Exclude targeting - ANY match skips this slot */
    exclude: {
      section: ['sponsored']
      // Can also use functions: special: function() { return someCondition; }
    },

    /** DOM injection configuration */
    injection: {
      /** CSS selector to find target element */
      selector: '.article-container',
      /** Which matching element (0 = first) */
      poscount: 0,
      /** Where to inject relative to target: before, after, prepend, append, replace */
      position: 'after',
      /** Additional CSS class for the ad container */
      wrapperClass: 'custom-ad-wrapper',
      /** Inline styles for the ad container (object or string) */
      wrapperStyle: { margin: '20px 0' },
      /** Additional CSS class for the inner ad div */
      adClass: '',
      /** Inline styles for the inner ad div (object or string) */
      adStyle: {},
      /** Label above ad: string, object { text, class, style }, or false to disable */
      label: 'Advertisement'
    },

    /** Ad sizes per viewport - keys match viewport names from sizemapping.json */
    sizemapping: {
      x: [[970, 250], [1, 1], 'fluid'],
      l: [[970, 250], [1, 1], 'fluid']
    }
  },

  /**
   * Mobile variant (viewport: xs, s, m)
   * Same slot with different sizes and position for mobile
   */
  {
    id: 'example',
    adtype: 'custom',
    active: true,
    properties: ['all'],
    include: {
      pagetype: ['story'],
      viewport: ['xs', 's', 'm']
    },
    exclude: {
      section: ['sponsored']
    },
    injection: {
      selector: '.article-container',
      poscount: 0,
      position: 'before'
    },
    sizemapping: {
      xs: [[300, 250], [1, 1], 'fluid'],
      s: [[300, 250], [1, 1], 'fluid'],
      m: [[728, 90], [1, 1], 'fluid']
    }
  }
];
