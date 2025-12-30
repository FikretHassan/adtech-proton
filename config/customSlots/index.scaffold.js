/**
 * Custom Slots Index (Scaffold)
 * Copy this file to index.js
 * Aggregates all custom slot configs from individual files
 * Each file can export a single config object or an array of configs
 */

// Import your slot configs
// import mySlot from './mySlot.js';

// Flatten all exports into single array
// Supports both single objects and arrays from each file
function flattenConfigs(...configs) {
  return configs.reduce((acc, config) => {
    if (Array.isArray(config)) {
      return acc.concat(config);
    }
    return acc.concat([config]);
  }, []);
}

export const slots = flattenConfigs(
  // mySlot
);

export default slots;
