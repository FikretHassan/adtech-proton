/**
 * Hooks Index
 * Aggregates all hook concerns from individual files
 *
 * Each file represents a "concern" - a logical grouping of functionality
 * that hooks into various lifecycle points. For example:
 * - analytics.js might register hooks at slot.afterRender and ads.afterRequest
 * - debugging.js might register hooks at multiple points for logging
 *
 * To add a new concern:
 * 1. Create a new .js file in this directory (e.g., myFeature.js)
 * 2. Export an object with hook points as keys and arrays of hook configs as values
 * 3. Import and add to the concerns array below
 */

import { demoHooks as demo } from './demoHooks.js';
// import analytics from './analytics.js';
// import debugging from './debugging.js';

/**
 * List of all concern modules
 * Each concern exports: { 'hookPoint': [{ name, priority, fn }], ... }
 */
const concerns = [
  demo,
  // analytics,
  // debugging,
];

/**
 * Merge all concerns into a single hooks object
 * Multiple concerns can register to the same hook point
 */
function mergeHooks(concernsList) {
  const merged = {};

  concernsList.forEach(concern => {
    if (!concern || typeof concern !== 'object') return;

    Object.entries(concern).forEach(([hookPoint, hooks]) => {
      if (!Array.isArray(hooks)) return;

      if (!merged[hookPoint]) {
        merged[hookPoint] = [];
      }
      merged[hookPoint].push(...hooks);
    });
  });

  return merged;
}

export default mergeHooks(concerns);
