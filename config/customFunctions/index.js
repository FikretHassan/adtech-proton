/**
 * Custom Functions Index
 * Aggregates all custom utility functions for publisher use
 *
 * Add your own functions by:
 * 1. Create a new .js file in this folder (e.g., myFunction.js)
 * 2. Export a default function
 * 3. Import and add it to the exports below
 * 4. Access via: proton.customFunctions.myFunction()
 */

import buildVideoUrl from './buildVideoUrl.js';

export default {
  buildVideoUrl,
};
