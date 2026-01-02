/**
 * Experiment Definitions
 *
 * Each experiment:
 * - id: Unique identifier
 * - active: Enable/disable
 * - testRange: [min, max] user buckets 0-99 (e.g., [0, 24] = 25% of users)
 * - plugin: Target specific plugin, or null for global experiments
 * - include/exclude: Targeting rules (same as plugins)
 * - apply: Function to modify plugin config before loading
 */

import { evaluateTargeting, normalizeTargetingConfig, matchesProperty } from './targeting';
import { getProperty } from './property';

// Experiment configuration interface
interface Experiment {
  id: string;
  active: boolean;
  testRange: [number, number];
  plugin: string | null;
  properties?: string[];
  include: any;
  exclude: any;
  apply: (config: any) => void;
}

// Applied experiment record
interface AppliedRecord {
  plugin: string;
  testgroup: number;
  appliedAt: number;
}

// Constructor config interface
interface ExperimentManagerConfig {
  testgroup?: number;
  getContext?: () => any;
  dimensionConfig?: any;
}

/**
 * ExperimentManager - Manages A/B test experiments
 */
export class ExperimentManager {
  getContext: () => any;
  dimensionConfig: any;
  experiments: Experiment[];
  applied: Record<string, AppliedRecord>;
  testgroup: number;

  /**
   * @param {Object} config
   * @param {number} config.testgroup - External testgroup (0-99), if not provided one is generated
   * @param {Function} config.getContext - Function to get current targeting context
   * @param {Object} config.dimensionConfig - Dimension match type configuration
   */
  constructor(config: ExperimentManagerConfig = {}) {
    this.getContext = config.getContext || (() => ({}));
    this.dimensionConfig = config.dimensionConfig || {};
    this.experiments = [];
    this.applied = {};

    // Use provided testgroup or generate one
    this.testgroup = config.testgroup ?? this._generateTestgroup();
  }

  /**
   * Generate a random testgroup (0-99) for this pageview
   * @returns {number}
   */
  _generateTestgroup() {
    return Math.floor(Math.random() * 100);
  }

  /**
   * Register an experiment
   * @param {Object} experiment - Experiment configuration
   */
  register(experiment: any) {
    if (!experiment || !experiment.id) return;
    this.experiments.push({
      id: experiment.id,
      active: experiment.active !== false,
      testRange: experiment.testRange || [0, 99],
      plugin: experiment.plugin || null,
      properties: experiment.properties, // undefined = all properties
      include: experiment.include || {},
      exclude: experiment.exclude || {},
      apply: experiment.apply || (() => {})
    });
  }

  /**
   * Check if user is in testgroup range
   * @param {Array} range - [min, max] inclusive
   * @returns {boolean}
   */
  isInRange(range: [number, number]) {
    if (!Array.isArray(range) || range.length !== 2) return false;
    return this.testgroup >= range[0] && this.testgroup <= range[1];
  }

  /**
   * Apply experiments to a plugin config
   * @param {string} pluginName - Plugin name
   * @param {Object} pluginConfig - Plugin config to modify
   * @returns {boolean} Whether any experiment was applied
   */
  apply(pluginName: string, pluginConfig: any) {
    let applied = false;

    for (const exp of this.experiments) {
      // Skip inactive experiments
      if (!exp.active) continue;

      // Skip if not targeting this plugin
      if (exp.plugin && exp.plugin !== pluginName) continue;

      // Check property targeting
      if (!matchesProperty(exp.properties, getProperty())) continue;

      // Check testgroup range
      if (!this.isInRange(exp.testRange)) continue;

      // Check targeting
      const context = this.getContext();
      const targeting = normalizeTargetingConfig({ 
        include: exp.include, 
        exclude: exp.exclude 
      });
      const result = evaluateTargeting(
        targeting.include,
        targeting.exclude,
        context,
        this.dimensionConfig
      );

      if (!result.matched) continue;

      // Apply experiment
      try {
        exp.apply(pluginConfig);
        this.applied[exp.id] = {
          plugin: pluginName,
          testgroup: this.testgroup,
          appliedAt: Date.now()
        };
        applied = true;
      } catch (e) {
        console.warn(`[ExperimentManager] Error applying ${exp.id}:`, e);
      }
    }

    return applied;
  }

  /**
   * Get status of all experiments
   * @returns {Object} Status info
   */
  getStatus() {
    return {
      testgroup: this.testgroup,
      registered: this.experiments.map(e => ({
        id: e.id,
        active: e.active,
        testRange: e.testRange,
        plugin: e.plugin
      })),
      applied: { ...this.applied }
    };
  }
}

// Default export - empty array for config/experiments.js compatibility
export default [];
