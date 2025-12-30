/**
 * A/B Test Experiments Configuration Scaffold
 *
 * Copy this file to experiments.js.
 *
 * Experiments modify plugin behavior for a percentage of page views based on testgroup (0-99).
 * A random testgroup number is assigned on each page load.
 *
 * Use cases:
 * - Test new header bidding configurations
 * - A/B test different timeout values
 * - Gradually roll out new partners
 * - Test different ad layouts
 */

/**
 * @typedef {Object} ExperimentConfig
 * @property {string} id - Unique experiment identifier (used in reporting)
 * @property {boolean} active - Enable/disable this experiment
 * @property {string[]} [properties] - Property targeting. undefined = all, ['mysite'] = specific
 * @property {[number, number]} testRange - Testgroup range [min, max] inclusive (0-99)
 * @property {string} [plugin] - Target plugin name (e.g., 'headerBidderA', 'audienceProvider')
 * @property {Object} [include] - Include targeting (ALL must match). Dimensions from dimensions.json
 * @property {Object} [exclude] - Exclude targeting (ANY match = skip)
 * @property {Function} apply - Function to modify plugin config: (config) => { config.timeout = 2000; }
 */

/**
 * Experiment definitions
 * @type {ExperimentConfig[]}
 */
export default [
  /**
   * Example: Test new header bidder configuration
   * Targets 25% of page views (testgroups 0-24)
   */
  // {
  //   /** Unique ID for tracking/reporting */
  //   id: 'new_bidder_config',
  //
  //   /** Enable this experiment */
  //   active: false,
  //
  //   /** Property targeting - only run on these properties */
  //   properties: ['mysite'],
  //
  //   /** Testgroup range - [0, 24] = 25% of traffic */
  //   testRange: [0, 24],
  //
  //   /** Target plugin to modify */
  //   plugin: 'headerBidderA',
  //
  //   /** Include targeting - ALL must match */
  //   include: { section: ['all'] },
  //
  //   /** Exclude targeting - ANY match skips */
  //   exclude: { section: ['puzzles'] },
  //
  //   /** Modify plugin config for experiment group */
  //   apply: (config) => {
  //     config.url = 'https://your-cdn.com/bidder/bidder-v2.js';
  //   }
  // },

  /**
   * Example: Test longer timeout for US geo
   * Targets 25% of US page views (testgroups 50-74)
   */
  // {
  //   id: 'test_bidder_timeout',
  //   active: false,
  //   testRange: [50, 74],
  //   plugin: 'headerBidderB',
  //   include: { geo: ['us'] },
  //   apply: (config) => {
  //     config.timeout = 1500;
  //   }
  // }

  /**
   * Testgroup distribution examples:
   *
   * 10% test:  [0, 9]
   * 25% test:  [0, 24]
   * 50% test:  [0, 49]
   * 50/50 A/B: Group A [0, 49], Group B [50, 99]
   *
   * Non-overlapping experiments:
   * Experiment 1: [0, 24]   (25%)
   * Experiment 2: [25, 49]  (25%)
   * Control:      [50, 99]  (50%)
   */
];
