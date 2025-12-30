/**
 * Experiences Index
 * Aggregates all experience configs from individual files
 *
 * Each experience file exports a complete config object including:
 * - name, active, description
 * - include/exclude targeting rules
 * - consentState, priority
 * - fn (the actual function to execute)
 *
 * To add a new experience:
 * 1. Create a new .js file in this directory (see example.scaffold.js)
 * 2. Import and add to the experiences array below
 */

// import anotherExperience from './anotherExperience.js';

/**
 * List of all experience modules
 * Each module exports: { name, active, fn, subscriptions, include, exclude, ... }
 * @type {any[]}
 */
const experiences = [
  // anotherExperience,
];

export default experiences;
