/**
 * Optional Module Wrapper: Experiments (A/B Testing)
 *
 * When FEATURE_EXPERIMENTS=true: exports real ExperimentManager
 * When FEATURE_EXPERIMENTS=false: exports stub class (tree-shaken from bundle)
 */

declare const FEATURE_EXPERIMENTS: boolean;

/**
 * Stub ExperimentManager - no-op implementation
 */
class StubExperimentManager {
  testgroup: number = 0;
  experiments: any[] = [];
  applied: Record<string, any> = {};

  constructor(_config: any = {}) {}

  register(_experiment: any) {}

  isInRange(_range: [number, number]) {
    return false;
  }

  apply(_pluginName: string, _pluginConfig: any) {
    return false;
  }

  getStatus() {
    return {
      testgroup: 0,
      registered: [],
      applied: {}
    };
  }
}

// Conditional export - esbuild tree-shakes the unused branch
// @ts-ignore - esbuild handles this at build time
const ExperimentManagerExport: typeof import('../experiments').ExperimentManager = FEATURE_EXPERIMENTS
  // @ts-ignore - dynamic require for esbuild
  ? require('../experiments').ExperimentManager
  : StubExperimentManager;

export { ExperimentManagerExport as ExperimentManager };

// Default export for config/experiments.js compatibility
export default [];
